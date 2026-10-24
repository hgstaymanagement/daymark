/* Daymark data layer: IndexedDB access, date helpers, bill lifecycle, backup validation.
   Everything is exposed on window.DB. Amounts are stored as integer cents. */
(function () {
  'use strict';

  const DB_NAME = 'daymark';
  const DB_VERSION = 1;
  const STORES = ['tasks', 'bills', 'transactions'];
  let dbPromise = null;

  /* ---------- connection and transactions ---------- */

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          STORES.forEach((name) => db.createObjectStore(name, { keyPath: 'id', autoIncrement: true }));
          db.createObjectStore('meta', { keyPath: 'key' });
        };
        req.onsuccess = () => {
          req.result.onversionchange = () => req.result.close();
          resolve(req.result);
        };
        req.onerror = () => { dbPromise = null; reject(req.error); };
        req.onblocked = () => { dbPromise = null; reject(new Error('Storage is blocked by another Daymark tab.')); };
      });
    }
    return dbPromise;
  }

  const wrap = (request) => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  // Runs fn(stores) inside one transaction and resolves with its result after the commit.
  async function tx(names, mode, fn) {
    const db = await open();
    const t = db.transaction(names, mode);
    const stores = {};
    names.forEach((n) => { stores[n] = t.objectStore(n); });
    const done = new Promise((resolve, reject) => {
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('The change could not be saved.'));
    });
    let result;
    try {
      result = await fn(stores);
    } catch (err) {
      try { t.abort(); } catch (_) { /* already finished */ }
      await done.catch(() => {});
      throw err;
    }
    await done;
    return result;
  }

  /* ---------- dates (local calendar days as YYYY-MM-DD) ---------- */

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const parts = (s) => s.split('-').map(Number);

  function isYMD(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = parts(s);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  function today() {
    const n = new Date();
    return ymd(n.getFullYear(), n.getMonth() + 1, n.getDate());
  }

  function daysBetween(a, b) {
    const A = parts(a), B = parts(b);
    return Math.round((Date.UTC(B[0], B[1] - 1, B[2]) - Date.UTC(A[0], A[1] - 1, A[2])) / 86400000);
  }

  function addDays(s, n) {
    const [y, m, d] = parts(s);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  // Next due date for a recurring bill. anchorDay keeps "the 31st" from drifting to the 28th forever.
  function nextDueDate(due, recurrence, anchorDay) {
    const [y, m] = parts(due);
    const index = y * 12 + (m - 1) + (recurrence === 'yearly' ? 12 : 1);
    const ny = Math.floor(index / 12), nm = index % 12;
    const daysInMonth = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
    return ymd(ny, nm + 1, Math.min(anchorDay || Number(due.slice(8)), daysInMonth));
  }

  /* ---------- reads ---------- */

  function loadAll() {
    return tx(['tasks', 'bills', 'transactions', 'meta'], 'readonly', async (s) => {
      const [tasks, bills, transactions, opening] = await Promise.all([
        wrap(s.tasks.getAll()), wrap(s.bills.getAll()), wrap(s.transactions.getAll()), wrap(s.meta.get('openingCents')),
      ]);
      return { tasks, bills, transactions, openingCents: opening ? opening.value : 0 };
    });
  }

  /* ---------- simple saves and deletes ---------- */

  function save(store, record) {
    const rec = { ...record };
    if (rec.id == null) delete rec.id;
    return tx([store], 'readwrite', (s) => wrap(s[store].put(rec)));
  }

  const remove = (store, id) => tx([store], 'readwrite', (s) => wrap(s[store].delete(id)));

  const saveTask = (task) => save('tasks', task);
  const deleteTask = (id) => remove('tasks', id);
  const saveTransaction = (t) => save('transactions', t);
  const setOpening = (cents) => tx(['meta'], 'readwrite', (s) => wrap(s.meta.put({ key: 'openingCents', value: cents })));

  // Deleting a bill's payment keeps the bill paid but forgets the link, so the money history stays honest.
  function deleteTransaction(id) {
    return tx(['bills', 'transactions'], 'readwrite', async (s) => {
      const t = await wrap(s.transactions.get(id));
      if (t && t.billId != null) {
        const bill = await wrap(s.bills.get(t.billId));
        if (bill && bill.expenseId === id) { bill.expenseId = null; await wrap(s.bills.put(bill)); }
      }
      await wrap(s.transactions.delete(id));
    });
  }

  /* ---------- bills ---------- */

  function saveBill(input) {
    return tx(['bills', 'transactions'], 'readwrite', async (s) => {
      if (input.id == null) {
        return wrap(s.bills.add({
          name: input.name, amountCents: input.amountCents, dueDate: input.dueDate, notes: input.notes || '',
          recurrence: input.recurrence || 'none', anchorDay: Number(input.dueDate.slice(8)),
          paid: false, paidDate: null, nextBillId: null, expenseId: null,
        }));
      }
      const old = await wrap(s.bills.get(input.id));
      if (!old) throw new Error('This bill no longer exists.');
      const bill = { ...old, name: input.name, amountCents: input.amountCents, dueDate: input.dueDate, notes: input.notes || '', recurrence: input.recurrence || 'none' };
      if (input.dueDate !== old.dueDate) bill.anchorDay = Number(input.dueDate.slice(8));
      await wrap(s.bills.put(bill));
      // A paid bill's linked expense follows its amount and name so the balance stays right.
      if (old.paid && old.expenseId != null) {
        const t = await wrap(s.transactions.get(old.expenseId));
        if (t) {
          if (old.amountCents !== bill.amountCents) t.amountCents = bill.amountCents;
          if (old.name !== bill.name && t.description === old.name) t.description = bill.name;
          await wrap(s.transactions.put(t));
        }
      }
      return bill.id;
    });
  }

  // Marks a bill paid. With subtract=true the payment is recorded as an expense (once).
  // A recurring bill gets its next occurrence; the paid bill stays as history.
  function payBill(id, { paidDate, subtract }) {
    return tx(['bills', 'transactions'], 'readwrite', async (s) => {
      const bill = await wrap(s.bills.get(id));
      if (!bill) throw new Error('This bill no longer exists.');
      if (bill.paid) return { next: null };
      bill.paid = true;
      bill.paidDate = paidDate;
      if (subtract) {
        bill.expenseId = await wrap(s.transactions.add({
          type: 'expense', amountCents: bill.amountCents, description: bill.name, date: paidDate, billId: bill.id,
        }));
      }
      let next = null;
      if (bill.recurrence !== 'none' && bill.nextBillId == null) {
        next = {
          name: bill.name, amountCents: bill.amountCents, notes: bill.notes, recurrence: bill.recurrence, anchorDay: bill.anchorDay,
          dueDate: nextDueDate(bill.dueDate, bill.recurrence, bill.anchorDay),
          paid: false, paidDate: null, nextBillId: null, expenseId: null,
        };
        bill.nextBillId = await wrap(s.bills.add(next));
        next.id = bill.nextBillId;
      }
      await wrap(s.bills.put(bill));
      return { next };
    });
  }

  // Undo a payment: removes its linked expense and the not-yet-paid next occurrence it created.
  function unpayBill(id) {
    return tx(['bills', 'transactions'], 'readwrite', async (s) => {
      const bill = await wrap(s.bills.get(id));
      if (!bill || !bill.paid) return { removedNext: false };
      let removedNext = false;
      if (bill.nextBillId != null) {
        const next = await wrap(s.bills.get(bill.nextBillId));
        if (next && next.paid) {
          const err = new Error('The next bill in this series is already paid. Mark that one unpaid first.');
          err.code = 'later-paid';
          throw err;
        }
        if (next) { await wrap(s.bills.delete(next.id)); removedNext = true; }
      }
      if (bill.expenseId != null) await wrap(s.transactions.delete(bill.expenseId));
      bill.paid = false;
      bill.paidDate = null;
      bill.nextBillId = null;
      bill.expenseId = null;
      await wrap(s.bills.put(bill));
      return { removedNext };
    });
  }

  function deleteBill(id) {
    return tx(['bills', 'transactions'], 'readwrite', async (s) => {
      const bill = await wrap(s.bills.get(id));
      if (!bill) return;
      if (bill.expenseId != null) {
        const t = await wrap(s.transactions.get(bill.expenseId));
        if (t) { t.billId = null; await wrap(s.transactions.put(t)); }
      }
      await wrap(s.bills.delete(id));
    });
  }

  /* ---------- backup: export, validate, restore ---------- */

  async function exportData() {
    const d = await loadAll();
    return {
      app: 'daymark', version: 1, exportedAt: new Date().toISOString(),
      data: { openingCents: d.openingCents, tasks: d.tasks, bills: d.bills, transactions: d.transactions },
    };
  }

  const isInt = (n) => Number.isSafeInteger(n);
  const isId = (n) => isInt(n) && n > 0;
  const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const MAX_CENTS = 1e12;

  // Validates a backup file's text. Returns { ok:true, data, counts, exportedAt } or { ok:false, error }.
  // Only known fields are copied, so nothing unexpected from the file reaches storage.
  function parseBackup(raw) {
    let file;
    try { file = JSON.parse(raw); } catch (_) { return { ok: false, error: 'The file is not valid JSON.' }; }
    const bad = (error) => ({ ok: false, error });
    if (!file || typeof file !== 'object' || file.app !== 'daymark') return bad('This is not a Daymark backup.');
    if (file.version !== 1) return bad('This backup comes from a version of Daymark that this one cannot read.');
    const d = file.data;
    if (!d || !Array.isArray(d.tasks) || !Array.isArray(d.bills) || !Array.isArray(d.transactions)) return bad('The backup is missing its tasks, bills or transactions.');
    if (!isInt(d.openingCents) || Math.abs(d.openingCents) > MAX_CENTS) return bad('The backup has an invalid starting balance.');

    const seen = (set, id, label) => (set.has(id) ? `${label} ${id} appears twice.` : (set.add(id), null));
    const taskIds = new Set(), billIds = new Set(), txIds = new Set();
    const tasks = [], bills = [], transactions = [];

    for (const t of d.tasks) {
      if (!t || !isId(t.id)) return bad('A task in the backup has no valid id.');
      const dup = seen(taskIds, t.id, 'Task'); if (dup) return bad(dup);
      const title = text(t.title, 200).trim();
      if (!title) return bad(`Task ${t.id} has no title.`);
      if (t.dueDate != null && !isYMD(t.dueDate)) return bad(`Task ${t.id} has an invalid due date.`);
      if (!['low', 'normal', 'high'].includes(t.priority)) return bad(`Task ${t.id} has an invalid priority.`);
      if (typeof t.completed !== 'boolean') return bad(`Task ${t.id} has an invalid completed flag.`);
      tasks.push({
        id: t.id, title, description: text(t.description, 2000), dueDate: t.dueDate || null, priority: t.priority,
        completed: t.completed, completedAt: t.completed && isInt(t.completedAt) ? t.completedAt : null,
      });
    }

    for (const b of d.bills) {
      if (!b || !isId(b.id)) return bad('A bill in the backup has no valid id.');
      const dup = seen(billIds, b.id, 'Bill'); if (dup) return bad(dup);
      const name = text(b.name, 200).trim();
      if (!name) return bad(`Bill ${b.id} has no name.`);
      if (!isInt(b.amountCents) || b.amountCents < 0 || b.amountCents > MAX_CENTS) return bad(`Bill ${b.id} has an invalid amount.`);
      if (!isYMD(b.dueDate)) return bad(`Bill ${b.id} has an invalid due date.`);
      if (!['none', 'monthly', 'yearly'].includes(b.recurrence)) return bad(`Bill ${b.id} has an invalid repeat setting.`);
      if (typeof b.paid !== 'boolean') return bad(`Bill ${b.id} has an invalid paid flag.`);
      if (b.paid && !isYMD(b.paidDate)) return bad(`Bill ${b.id} is paid but has no valid payment date.`);
      bills.push({
        id: b.id, name, amountCents: b.amountCents, dueDate: b.dueDate, notes: text(b.notes, 2000), recurrence: b.recurrence,
        anchorDay: isInt(b.anchorDay) && b.anchorDay >= 1 && b.anchorDay <= 31 ? b.anchorDay : Number(b.dueDate.slice(8)),
        paid: b.paid, paidDate: b.paid ? b.paidDate : null,
        nextBillId: isId(b.nextBillId) ? b.nextBillId : null, expenseId: isId(b.expenseId) ? b.expenseId : null,
      });
    }

    for (const t of d.transactions) {
      if (!t || !isId(t.id)) return bad('A transaction in the backup has no valid id.');
      const dup = seen(txIds, t.id, 'Transaction'); if (dup) return bad(dup);
      if (t.type !== 'income' && t.type !== 'expense') return bad(`Transaction ${t.id} has an invalid type.`);
      if (!isInt(t.amountCents) || t.amountCents <= 0 || t.amountCents > MAX_CENTS) return bad(`Transaction ${t.id} has an invalid amount.`);
      if (!isYMD(t.date)) return bad(`Transaction ${t.id} has an invalid date.`);
      transactions.push({
        id: t.id, type: t.type, amountCents: t.amountCents, description: text(t.description, 200).trim(), date: t.date,
        billId: isId(t.billId) ? t.billId : null,
      });
    }

    // Links that point at records missing from the file are dropped instead of left dangling.
    bills.forEach((b) => {
      if (b.nextBillId != null && !billIds.has(b.nextBillId)) b.nextBillId = null;
      if (b.expenseId != null && !txIds.has(b.expenseId)) b.expenseId = null;
    });
    transactions.forEach((t) => { if (t.billId != null && !billIds.has(t.billId)) t.billId = null; });

    return {
      ok: true,
      exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : null,
      counts: { tasks: tasks.length, bills: bills.length, transactions: transactions.length },
      data: { openingCents: d.openingCents, tasks, bills, transactions },
    };
  }

  // Replaces everything in one transaction: either the whole backup lands or nothing changes.
  function replaceAll(data) {
    return tx(['tasks', 'bills', 'transactions', 'meta'], 'readwrite', async (s) => {
      await Promise.all([wrap(s.tasks.clear()), wrap(s.bills.clear()), wrap(s.transactions.clear()), wrap(s.meta.clear())]);
      for (const t of data.tasks) await wrap(s.tasks.put(t));
      for (const b of data.bills) await wrap(s.bills.put(b));
      for (const t of data.transactions) await wrap(s.transactions.put(t));
      await wrap(s.meta.put({ key: 'openingCents', value: data.openingCents }));
    });
  }

  window.DB = {
    loadAll, saveTask, deleteTask, saveBill, deleteBill, payBill, unpayBill,
    saveTransaction, deleteTransaction, setOpening, exportData, parseBackup, replaceAll,
    util: { today, daysBetween, addDays, isYMD, nextDueDate },
  };
})();
