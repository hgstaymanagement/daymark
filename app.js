/* Daymark: UI and application logic. Data access lives in db.js. */
(function () {
  'use strict';

  const { util } = DB;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = () => matchMedia('(max-width: 700px)').matches;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  /* ---------- icons: one stroke weight, drawn as SVG ---------- */

  const ICONS = {
    today: '<rect x="4" y="5" width="16" height="15" rx="4"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    tasks: '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.3 2.4 2.4 4.6-5"/>',
    bills: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9.5 8h5M9.5 12h5"/>',
    money: '<path d="M4 8V7a3 3 0 0 1 3-3h10v4"/><rect x="4" y="8" width="16" height="12" rx="3.5"/><circle cx="15.5" cy="14" r="1.1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    backup: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14"/>',
    close: '<path d="m7 7 10 10M17 7 7 17"/>',
    check: '<path d="m6 12.5 4 4 8-9"/>',
    repeat: '<path d="m17 3 3 3-3 3M20 6H9a5 5 0 0 0-5 5M7 21l-3-3 3-3M4 18h11a5 5 0 0 0 5-5"/>',
  };
  const icon = (name) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

  /* ---------- springs (Apple-style: response + damping ratio, velocity-aware, interruptible) ---------- */

  function Spring(initial = 0) {
    let x = initial, v = 0, target = initial, raf = 0, last = 0, cfg = { response: 0.38, damping: 1 }, cb = () => {};
    function tick(now) {
      const dt = Math.min((now - last) / 1000, 0.064);
      last = now;
      const k = (2 * Math.PI / cfg.response) ** 2, c = 2 * cfg.damping * Math.sqrt(k);
      const steps = Math.max(1, Math.ceil(dt / 0.004)), h = dt / steps;
      for (let i = 0; i < steps; i++) { v += (-k * (x - target) - c * v) * h; x += v * h; }
      if (Math.abs(x - target) < 0.1 && Math.abs(v) < 2) { x = target; v = 0; raf = 0; cb(x, true); return; }
      cb(x, false);
      raf = requestAnimationFrame(tick);
    }
    return {
      get value() { return x; },
      get velocity() { return v; },
      onUpdate(fn) { cb = fn; },
      set(val) { cancelAnimationFrame(raf); raf = 0; x = target = val; v = 0; cb(x, false); },
      stop() { cancelAnimationFrame(raf); raf = 0; },
      // Always starts from the current on-screen value and velocity, so interruptions never jump.
      to(t, opts = {}) {
        target = t;
        cfg = { response: opts.response ?? 0.38, damping: opts.damping ?? 1 };
        if (opts.velocity !== undefined) v = opts.velocity;
        if (reduced()) { cancelAnimationFrame(raf); raf = 0; x = t; v = 0; cb(x, true); return; }
        if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
      },
    };
  }

  const project = (velocity, rate = 0.998) => (velocity / 1000) * rate / (1 - rate);
  const rubberband = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

  // A sliding highlight behind the active item of a segmented control or the tab bar.
  function Thumb(host, getActive) {
    const el = $('.thumb', host), sx = Spring(), sy = Spring();
    // Liquid feel: the thumb stretches along its direction of travel in proportion to speed, then settles.
    const apply = () => {
      const a = Math.min(Math.abs(sx.velocity) / 3500, 0.16), b = Math.min(Math.abs(sy.velocity) / 3500, 0.16);
      el.style.transform = `translate3d(${sx.value}px,${sy.value}px,0) scale(${1 + a - b * 0.6},${1 + b - a * 0.6})`;
    };
    sx.onUpdate(apply); sy.onUpdate(apply);
    return {
      place(animate) {
        const a = getActive();
        if (!a || !a.offsetWidth) return;
        el.style.width = `${a.offsetWidth}px`;
        el.style.height = `${a.offsetHeight}px`;
        if (animate) { sx.to(a.offsetLeft, { response: 0.34 }); sy.to(a.offsetTop, { response: 0.34 }); }
        else { sx.set(a.offsetLeft); sy.set(a.offsetTop); }
      },
    };
  }
  const segActive = (seg) => $('[aria-pressed="true"]', seg) || ($('input:checked', seg) || {}).parentElement || null;
  function mountSegs(root) {
    $$('.seg', root).forEach((seg) => { seg._thumb = Thumb(seg, () => segActive(seg)); seg._thumb.place(false); });
  }

  /* ---------- formatting ---------- */

  const nf = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (cents) => (cents < 0 ? '−' : '') + nf.format(Math.abs(cents) / 100);
  const toDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const shortDate = (s) => {
    const d = toDate(s), o = { weekday: 'short', day: 'numeric', month: 'short' };
    if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
    return new Intl.DateTimeFormat(undefined, o).format(d);
  };
  const dayWord = (s) => {
    const n = util.daysBetween(util.today(), s);
    return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : shortDate(s);
  };
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const lateText = (s) => { const n = -util.daysBetween(util.today(), s); return n === 1 ? 'Overdue · yesterday' : `Overdue · ${plural(n, 'day')}`; };

  // Accepts "1234.5", "1,234.50", "1234,50". Returns integer cents, or NaN.
  function parseAmount(value, allowNegative) {
    let s = String(value).trim().replace(/[\s\u2212]/g, (c) => (c === '\u2212' ? '-' : ''));
    let neg = false;
    if (allowNegative && s.startsWith('-')) { neg = true; s = s.slice(1); }
    if (!s) return NaN;
    if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
    else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
    if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    const cents = Math.round(parseFloat(s) * 100);
    if (!Number.isSafeInteger(cents) || cents > 1e12) return NaN;
    return neg ? -cents : cents;
  }
  const centsToInput = (c) => (c / 100).toFixed(2);

  /* ---------- state and derived figures ---------- */

  const S = { tasks: [], bills: [], tx: [], opening: 0, route: 'today', taskFilter: 'today', billFilter: 'unpaid' };
  const ROUTES = ['today', 'tasks', 'bills', 'money'];
  const PRI = { high: 0, normal: 1, low: 2 };
  const byPriority = (a, b) => PRI[a.priority] - PRI[b.priority] || a.title.localeCompare(b.title);
  const byDue = (a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || byPriority(a, b);

  function calc() {
    const today = util.today();
    const open = S.tasks.filter((t) => !t.completed);
    const net = S.tx.reduce((sum, t) => sum + (t.type === 'income' ? t.amountCents : -t.amountCents), 0);
    const recorded = S.opening + net;
    const unpaid = S.bills.filter((b) => !b.paid);
    const unpaidTotal = unpaid.reduce((sum, b) => sum + b.amountCents, 0);
    return {
      today, net, recorded, unpaid, unpaidTotal, available: recorded - unpaidTotal,
      tasksToday: S.tasks.filter((t) => t.dueDate === today).sort((a, b) => a.completed - b.completed || byPriority(a, b)),
      tasksOverdue: open.filter((t) => t.dueDate && t.dueDate < today).sort(byDue),
      tasksUpcoming: open.filter((t) => !t.dueDate || t.dueDate > today).sort(byDue),
      tasksDone: S.tasks.filter((t) => t.completed).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)),
      billsOverdue: unpaid.filter((b) => b.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      billsUpcoming: unpaid.filter((b) => b.dueDate >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      billsPaid: S.bills.filter((b) => b.paid).sort((a, b) => b.paidDate.localeCompare(a.paidDate) || b.id - a.id),
    };
  }
  const openTasksToday = (c) => c.tasksToday.filter((t) => !t.completed).length;

  /* ---------- row and panel templates ---------- */

  function taskDue(t, today) {
    if (t.completed) return '<span>Done</span>';
    if (!t.dueDate) return '<span>No date</span>';
    if (t.dueDate < today) return `<span class="late">${lateText(t.dueDate)}</span>`;
    return `<span>${cap(dayWord(t.dueDate))}</span>`;
  }

  function taskRow(t, today) {
    const chip = t.priority === 'high' ? '<span class="chip high">High priority</span>' : t.priority === 'low' ? '<span class="chip low">Low</span>' : '';
    return `<li class="row ${t.completed ? 'is-done' : ''}" data-row="task-${t.id}">
      <button class="check" type="button" role="checkbox" aria-checked="${t.completed}" aria-label="${esc(t.title)}" data-action="toggle-task" data-id="${t.id}"><span class="box">${icon('check')}</span></button>
      <button class="row-main" type="button" data-action="edit" data-kind="task" data-id="${t.id}">
        <span class="title">${esc(t.title)}</span>
        ${t.description ? `<span class="note">${esc(t.description)}</span>` : ''}
        <span class="meta">${taskDue(t, today)}${chip}</span>
      </button></li>`;
  }

  function billRow(b, today) {
    const due = b.paid ? `<span class="ok">${icon('check')}Paid ${dayWord(b.paidDate)}</span>`
      : b.dueDate < today ? `<span class="late">${lateText(b.dueDate)}</span>` : `<span>Due ${dayWord(b.dueDate)}</span>`;
    const repeat = b.recurrence !== 'none' ? `<span class="rpt">${icon('repeat')}${cap(b.recurrence)}</span>` : '';
    return `<li class="row ${b.paid ? 'is-done' : ''}" data-row="bill-${b.id}">
      <button class="check" type="button" role="checkbox" aria-checked="${b.paid}" aria-label="${esc(b.name)}, paid" data-action="toggle-bill" data-id="${b.id}"><span class="box">${icon('check')}</span></button>
      <button class="row-main" type="button" data-action="edit" data-kind="bill" data-id="${b.id}">
        <span class="title">${esc(b.name)}</span>
        <span class="meta">${due}${repeat}</span>
        <span class="amt">${money(b.amountCents)}</span>
      </button></li>`;
  }

  function txRow(t) {
    const sign = t.type === 'income' ? '+' : '−';
    return `<li class="row plain" data-row="tx-${t.id}">
      <button class="row-main" type="button" data-action="edit" data-kind="${t.type}" data-id="${t.id}">
        <span class="title">${esc(t.description || (t.type === 'income' ? 'Income' : 'Expense'))}</span>
        <span class="meta"><span>${shortDate(t.date)}</span>${t.billId != null ? '<span>Bill payment</span>' : ''}</span>
        <span class="amt ${t.type === 'income' ? 'in' : ''}">${sign}${money(t.amountCents)}</span>
      </button></li>`;
  }

  const panel = (title, right, inner) => `<section class="glass"><div class="gh"><h2>${title}</h2>${right ? `<span class="gr">${right}</span>` : ''}</div>${inner}</section>`;
  const ul = (rows) => `<ul class="list">${rows.join('')}</ul>`;
  const empty = (title, text, btn) => `<div class="empty"><p class="et">${title}</p><p class="ex">${text}</p>${btn || ''}</div>`;
  const addBtn = (kind, label) => `<button class="btn small primary" type="button" data-action="add-kind" data-kind="${kind}">${icon('plus')}${label}</button>`;

  function ledger(c, withAction) {
    const foot = withAction
      ? '<div class="foot"><span>Recorded balance minus all unpaid bills.</span><button class="btn small" type="button" data-action="balance">Update balance</button></div>'
      : '<div class="foot"><span>Recorded balance minus all unpaid bills.</span><a href="#money">Money</a></div>';
    return `<section class="glass ledger" aria-label="Balance"><dl>
      <dt>Recorded balance</dt><dd class="${c.recorded < 0 ? 'neg' : ''}">${money(c.recorded)}</dd>
      <dt>Unpaid bills <span class="mut">(${c.unpaid.length})</span></dt><dd>${c.unpaidTotal ? '−' : ''}${money(c.unpaidTotal)}</dd>
      <dt class="fin">Estimated available</dt><dd class="fin ${c.available < 0 ? 'neg' : ''}">${money(c.available)}</dd>
    </dl>${foot}</section>`;
  }

  /* ---------- screens ---------- */

  const dateTitle = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  function head(title, sub) {
    return `<header class="top"><div><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>
      <button class="icon-btn hdr-backup" type="button" data-action="backup" aria-label="Backup and restore">${icon('backup')}</button></header>`;
  }

  function seg(label, scope, items) {
    return `<div class="seg filters" role="group" aria-label="${label}"><span class="thumb" aria-hidden="true"></span>${items.map(([value, text]) =>
      `<button type="button" data-action="filter" data-scope="${scope}" data-value="${value}" aria-pressed="${S[scope] === value}">${text}<b class="n" data-count="${value}" hidden></b></button>`).join('')}</div>`;
  }

  function shell() {
    const r = S.route;
    const title = { today: 'Today', tasks: 'Tasks', bills: 'Bills', money: 'Money' }[r];
    const sub = r === 'today' ? dateTitle.format(new Date()) : '';
    const filters = r === 'tasks' ? seg('Show tasks', 'taskFilter', [['today', 'Today'], ['upcoming', 'Upcoming'], ['overdue', 'Overdue'], ['completed', 'Done']])
      : r === 'bills' ? seg('Show bills', 'billFilter', [['unpaid', 'Unpaid'], ['upcoming', 'Upcoming'], ['overdue', 'Overdue'], ['paid', 'Paid']]) : '';
    $('#main').innerHTML = `${head(title, sub)}${filters}<div id="body"></div>`;
    document.title = `${title} · Daymark`;
    const filterSeg = $('.seg.filters');
    if (filterSeg) { filterSeg._thumb = Thumb(filterSeg, () => segActive(filterSeg)); filterSeg._thumb.place(false); }
  }

  function viewToday(c) {
    const doneN = c.tasksToday.length - openTasksToday(c);
    const overdue = [...c.tasksOverdue.map((t) => taskRow(t, c.today)), ...c.billsOverdue.map((b) => billRow(b, c.today))];
    const weekEnd = util.addDays(c.today, 7);
    const soon = c.billsUpcoming.filter((b) => b.dueDate <= weekEnd);
    const left = [
      overdue.length ? panel('Overdue', `<span class="late">${overdue.length}</span>`, ul(overdue)) : '',
      panel("Today's tasks", c.tasksToday.length ? `${doneN} of ${c.tasksToday.length} done` : '',
        c.tasksToday.length ? ul(c.tasksToday.map((t) => taskRow(t, c.today)))
          : empty('Nothing due today', 'Add a task and give it a due date to see it here.', addBtn('task', 'Add a task'))),
    ];
    const right = [
      panel('Bills due this week', c.unpaid.length ? `${c.unpaid.length} unpaid` : '',
        soon.length ? ul(soon.map((b) => billRow(b, c.today)))
          : empty('No bills due in the next 7 days', c.unpaid.length ? 'Your other unpaid bills are on the Bills tab.' : 'Add a bill to keep track of what is coming up.', c.unpaid.length ? '' : addBtn('bill', 'Add a bill'))),
      ledger(c, false),
    ];
    return `<div class="dash"><div class="col">${left.join('')}</div><div class="col">${right.join('')}</div></div>`;
  }

  function viewTasks(c) {
    const f = S.taskFilter, today = c.today;
    const lists = { today: c.tasksToday.filter((t) => !t.completed), upcoming: c.tasksUpcoming, overdue: c.tasksOverdue, completed: c.tasksDone };
    const titles = { today: "Due today", upcoming: 'Upcoming', overdue: 'Overdue', completed: 'Completed' };
    const msgs = {
      today: ['Nothing left for today', 'Tasks due today appear here until you tick them off.'],
      upcoming: ['No upcoming tasks', 'Tasks with a later due date, or none, wait here.'],
      overdue: ['Nothing overdue', 'Tasks past their due date show up here.'],
      completed: ['No completed tasks yet', 'Ticked-off tasks are kept here.'],
    };
    const items = lists[f];
    return panel(titles[f], items.length ? plural(items.length, 'task') : '',
      items.length ? ul(items.map((t) => taskRow(t, today))) : empty(msgs[f][0], msgs[f][1], f === 'completed' ? '' : addBtn('task', 'Add a task')));
  }

  function viewBills(c) {
    const f = S.billFilter, today = c.today;
    const lists = { unpaid: [...c.billsOverdue, ...c.billsUpcoming], upcoming: c.billsUpcoming, overdue: c.billsOverdue, paid: c.billsPaid };
    const titles = { unpaid: 'Unpaid bills', upcoming: 'Upcoming', overdue: 'Overdue', paid: 'Paid' };
    const msgs = {
      unpaid: ['No unpaid bills', 'Add a bill to start tracking what you owe.'],
      upcoming: ['No upcoming bills', 'Unpaid bills that are not late appear here.'],
      overdue: ['Nothing overdue', 'Unpaid bills past their due date appear here.'],
      paid: ['No paid bills yet', 'Bills you mark as paid are kept here as history.'],
    };
    const items = lists[f];
    const right = f === 'paid' ? (items.length ? plural(items.length, 'bill') : '') : (items.length ? money(items.reduce((s, b) => s + b.amountCents, 0)) : '');
    return panel(titles[f], right, items.length ? ul(items.map((b) => billRow(b, today))) : empty(msgs[f][0], msgs[f][1], f === 'paid' ? '' : addBtn('bill', 'Add a bill')));
  }

  function viewMoney(c) {
    const txs = [...S.tx].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    const start = `<li class="row plain"><div class="row-main" style="cursor:default"><span class="title" style="color:var(--text-2)">Starting balance</span><span class="amt" style="color:var(--text-2)">${money(S.opening)}</span></div></li>`;
    const buttons = `<span class="gr" style="display:flex;gap:8px"><button class="btn small" type="button" data-action="add-kind" data-kind="income">${icon('plus')}Income</button><button class="btn small" type="button" data-action="add-kind" data-kind="expense">${icon('plus')}Expense</button></span>`;
    const body = txs.length ? ul([...txs.map(txRow), start]) : empty('No transactions yet', 'Record income and expenses to keep your balance up to date.', '');
    return `<div class="stack">${ledger(c, true)}<section class="glass"><div class="gh"><h2>Transactions</h2>${buttons}</div>${body}</section></div>`;
  }

  function renderBody() {
    const c = calc();
    const el = $('#body');
    if (!el) return;
    const focus = document.activeElement && document.activeElement.dataset ? { a: document.activeElement.dataset.action, id: document.activeElement.dataset.id, s: document.activeElement.dataset.value } : null;
    el.innerHTML = { today: viewToday, tasks: viewTasks, bills: viewBills, money: viewMoney }[S.route](c);
    // Counts on the filter chips and overdue dots on the tabs.
    const counts = S.route === 'tasks'
      ? { today: openTasksToday(c), upcoming: c.tasksUpcoming.length, overdue: c.tasksOverdue.length }
      : { unpaid: c.unpaid.length, upcoming: c.billsUpcoming.length, overdue: c.billsOverdue.length };
    $$('.seg.filters [data-count]').forEach((b) => {
      const n = counts[b.dataset.count] || 0;
      b.hidden = !n; b.textContent = n; b.classList.toggle('late', b.dataset.count === 'overdue');
    });
    $('[href="#tasks"] .dot').hidden = !c.tasksOverdue.length;
    $('[href="#bills"] .dot').hidden = !c.billsOverdue.length;
    if (focus && focus.a) {
      const sel = `[data-action="${focus.a}"]${focus.id ? `[data-id="${focus.id}"]` : ''}${focus.s ? `[data-value="${focus.s}"]` : ''}`;
      const again = $(sel, el) || $(`.seg.filters ${sel}`);
      if (again) again.focus({ preventScroll: true });
    }
  }

  /* ---------- routing ---------- */

  let navThumb = null, built = false;
  const currentRoute = () => { const r = location.hash.slice(1); return ROUTES.includes(r) ? r : 'today'; };

  function go(animate) {
    const next = currentRoute(), changed = !built || next !== S.route;
    S.route = next;
    $$('.tabs a').forEach((a) => (a.getAttribute('href') === `#${next}` ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    if (changed) {
      shell();
      if (built) window.scrollTo(0, 0);
    }
    renderBody();
    if (navThumb) navThumb.place(animate && built);
    if (changed && built && !reduced()) {
      $('#main').animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.16,1,.3,1)' });
    }
    built = true;
  }

  async function reload() {
    const d = await DB.loadAll();
    S.tasks = d.tasks; S.bills = d.bills; S.tx = d.transactions; S.opening = d.openingCents;
  }
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('daymark') : null;
  async function refresh(announce = true) {
    await reload();
    renderBody();
    if (announce && channel) channel.postMessage('changed');
  }

  /* ---------- toast ---------- */

  let toastTimer = 0;
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  /* ---------- bottom sheet: 1:1 drag, velocity handoff, momentum projection, rubber-banding ---------- */

  const dlg = $('#sheet'), panelEl = $('.sheet-panel'), scrim = $('.scrim'), sheetBody = $('.sheet-body'), sheetHead = $('.sheet-head');
  const sy = Spring(0);
  let hidden = 0, closing = false;
  const measure = () => { hidden = isMobile() ? panelEl.offsetHeight + 24 : 40; };

  function paint(y) {
    const p = clamp(1 - y / hidden, 0, 1);
    if (isMobile()) { panelEl.style.transform = `translate3d(0,${y}px,0)`; panelEl.style.opacity = ''; }
    else { panelEl.style.transform = `translate3d(0,${y}px,0) scale(${1 - 0.03 * (1 - p)})`; panelEl.style.opacity = p; }
    scrim.style.opacity = p;
  }
  sy.onUpdate((y, done) => { paint(y); if (done && closing) finishClose(); });

  function openSheet(title, html, { focus = true } = {}) {
    closing = false;
    $('#sheet-title').textContent = title;
    sheetBody.innerHTML = html;
    if (!dlg.open) {
      dlg.showModal();
      document.body.classList.add('sheet-open');
      measure();
      if (reduced()) {
        paint(0);
        panelEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
        scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
      } else {
        sy.set(hidden);
        sy.to(0, { response: 0.36, damping: 1 });
      }
    }
    mountSegs(sheetBody);
    if (focus) { const f = $('input:not([type=hidden]):not([type=radio]):not([type=checkbox]), textarea', sheetBody); if (f) f.focus({ preventScroll: true }); }
  }

  function closeSheet(velocity) {
    if (!dlg.open || closing) return;
    closing = true;
    measure();
    if (reduced()) {
      Promise.all([panelEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' }).finished, scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' }).finished])
        .then(finishClose, finishClose);
      return;
    }
    sy.to(hidden, { velocity, response: 0.32, damping: 1 });
  }

  function finishClose() {
    if (!closing) return;
    closing = false;
    dlg.close();
    document.body.classList.remove('sheet-open');
    sheetBody.innerHTML = '';
    panelEl.style.opacity = ''; scrim.style.opacity = '';
    $$('.scrim, .sheet-panel').forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
  }

  dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(); });
  let downOnScrim = false;
  dlg.addEventListener('pointerdown', (e) => { downOnScrim = e.target === dlg || e.target === scrim; });
  dlg.addEventListener('click', (e) => { if (downOnScrim && (e.target === dlg || e.target === scrim)) closeSheet(); });

  // Drag the header to dismiss (mobile). Intent needs ~8px of movement, then the sheet tracks the finger 1:1.
  let drag = null;
  sheetHead.addEventListener('pointerdown', (e) => {
    if (!isMobile() || e.button > 0 || e.target.closest('button')) return;
    drag = { id: e.pointerId, startY: e.clientY, base: 0, active: false, hist: [{ t: e.timeStamp, y: e.clientY }] };
    sheetHead.setPointerCapture(e.pointerId);   // mouse and pen keep tracking outside the header, like touch
  });
  sheetHead.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.active) {
      if (Math.abs(e.clientY - drag.startY) < 8) return;
      drag.active = true;
      sy.stop();
      drag.base = sy.value;      // continue 1:1 from wherever the sheet is on screen right now
      drag.startY = e.clientY;
    }
    const dy = e.clientY - drag.startY;
    drag.hist.push({ t: e.timeStamp, y: e.clientY });
    while (drag.hist.length > 2 && e.timeStamp - drag.hist[0].t > 100) drag.hist.shift();
    let y = drag.base + dy;
    if (y < 0) y = -rubberband(-y, 400);
    sy.set(y);
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const was = drag; drag = null;
    if (!was.active) return;
    const a = was.hist[0], b = was.hist[was.hist.length - 1];
    const velocity = b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0;
    measure();
    const landing = sy.value + project(velocity);
    if (landing > hidden * 0.5) { closing = true; sy.to(hidden, { velocity, response: 0.32, damping: 1 }); }
    else sy.to(0, { velocity, response: 0.32, damping: 0.9 });
  }
  sheetHead.addEventListener('pointerup', endDrag);
  sheetHead.addEventListener('pointercancel', endDrag);

  // Keep the sheet above the on-screen keyboard where the layout viewport does not resize (iOS).
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const kb = () => dlg.style.setProperty('--kb', `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`);
    vv.addEventListener('resize', kb); vv.addEventListener('scroll', kb);
  }

  /* ---------- forms ---------- */

  const field = (name, label, control, hint) =>
    `<div class="field" data-field="${name}"><label for="f-${name}">${label}</label>${control}${hint ? `<p class="hint">${hint}</p>` : ''}<p class="err" id="e-${name}" hidden></p></div>`;
  const input = (name, o = {}) => `<input id="f-${name}" name="${name}" type="${o.type || 'text'}" value="${esc(o.value ?? '')}" ${o.attrs || ''}>`;
  const amountInput = (value) => input('amount', { value, attrs: 'inputmode="decimal" autocomplete="off" placeholder="0.00"' });

  function prioritySeg(value) {
    return `<fieldset class="field"><legend>Priority</legend><div class="seg"><span class="thumb" aria-hidden="true"></span>${['low', 'normal', 'high'].map((p) =>
      `<label><input type="radio" name="priority" value="${p}" ${p === value ? 'checked' : ''}><span>${cap(p)}</span></label>`).join('')}</div></fieldset>`;
  }

  const KINDS = [['task', 'Task'], ['bill', 'Bill'], ['income', 'Income'], ['expense', 'Expense']];
  let form = { kind: 'task', rec: null };

  function fieldsFor(kind, r) {
    const rec = r || {};
    if (kind === 'task') {
      return field('title', 'Title', input('title', { value: rec.title, attrs: 'maxlength="200" autocomplete="off" enterkeyhint="done"' }))
        + field('description', 'Description (optional)', `<textarea id="f-description" name="description" rows="2" maxlength="2000">${esc(rec.description || '')}</textarea>`)
        + `<div class="two">${field('dueDate', 'Due date', input('dueDate', { type: 'date', value: r ? rec.dueDate || '' : util.today() }))}${prioritySeg(rec.priority || 'normal')}</div>`;
    }
    if (kind === 'bill') {
      return field('name', 'Bill name', input('name', { value: rec.name, attrs: 'maxlength="200" autocomplete="off"' }))
        + `<div class="two">${field('amount', 'Amount', amountInput(r ? centsToInput(rec.amountCents) : ''))}${field('dueDate', 'Due date', input('dueDate', { type: 'date', value: rec.dueDate || util.today() }))}</div>`
        + field('recurrence', 'Repeat', `<select id="f-recurrence" name="recurrence">${[['none', 'Does not repeat'], ['monthly', 'Every month'], ['yearly', 'Every year']].map(([v, t]) => `<option value="${v}" ${v === (rec.recurrence || 'none') ? 'selected' : ''}>${t}</option>`).join('')}</select>`)
        + field('notes', 'Notes (optional)', `<textarea id="f-notes" name="notes" rows="2" maxlength="2000">${esc(rec.notes || '')}</textarea>`);
    }
    const linked = rec.billId != null ? 'Recorded when a bill was marked paid.' : '';
    return `<div class="two">${field('amount', 'Amount', amountInput(r ? centsToInput(rec.amountCents) : ''))}${field('date', 'Date', input('date', { type: 'date', value: rec.date || util.today() }))}</div>`
      + field('description', 'Description', input('description', { value: rec.description, attrs: `maxlength="100" autocomplete="off" placeholder="${kind === 'income' ? 'Salary, refund…' : 'Groceries, fuel…'}"` }), linked);
  }

  const LABEL = { task: 'task', bill: 'bill', income: 'income', expense: 'expense' };
  function formHTML() {
    const { kind, rec } = form;
    const kinds = rec ? '' : `<div class="seg" role="group" aria-label="What to add"><span class="thumb" aria-hidden="true"></span>${KINDS.map(([k, t]) => `<button type="button" data-action="form-kind" data-kind="${k}" aria-pressed="${k === kind}">${t}</button>`).join('')}</div>`;
    return `${kinds}<form id="form" novalidate><div id="fields">${fieldsFor(kind, rec)}</div><p class="form-error" id="form-error" role="alert" hidden></p>
      <div class="actions">${rec ? '<button class="btn danger" type="button" data-action="delete">Delete</button>' : ''}<button class="btn primary" type="submit">${rec ? 'Save changes' : `Add ${LABEL[kind]}`}</button></div></form>`;
  }

  function openForm(kind, rec = null) {
    form = { kind, rec };
    openSheet(rec ? `Edit ${LABEL[kind]}` : 'New', formHTML(), { focus: !rec });
  }

  function switchKind(kind) {
    form.kind = kind;
    $$('[data-action="form-kind"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
    $('.sheet-body > .seg')._thumb.place(true);
    $('#fields').innerHTML = fieldsFor(kind, null);
    $('#form [type=submit]').textContent = `Add ${LABEL[kind]}`;
    $('#form-error').hidden = true;
    mountSegs($('#fields'));
    const f = $('#fields input'); if (f) f.focus({ preventScroll: true });
  }

  function showErrors(errors) {
    $$('.field[data-error]').forEach((f) => { f.removeAttribute('data-error'); const i = $('input,textarea', f); if (i) { i.removeAttribute('aria-invalid'); i.removeAttribute('aria-describedby'); } });
    $$('.err').forEach((e) => { e.hidden = true; });
    let first = null;
    Object.entries(errors).forEach(([name, msg]) => {
      const f = $(`.field[data-field="${name}"]`), i = f && $('input,textarea', f);
      if (!f) return;
      f.setAttribute('data-error', '');
      const e = $(`#e-${name}`); e.textContent = msg; e.hidden = false;
      if (i) { i.setAttribute('aria-invalid', 'true'); i.setAttribute('aria-describedby', `e-${name}`); first = first || i; }
    });
    if (first) first.focus();
  }

  function readForm() {
    const fd = new FormData($('#form')), get = (n) => String(fd.get(n) ?? '').trim(), errors = {}, { kind, rec } = form;
    let out = null;
    const date = (name, required, msg) => {
      const v = get(name);
      if (!v && !required) return null;
      if (!util.isYMD(v)) errors[name] = msg;
      return v;
    };
    if (kind === 'task') {
      const title = get('title');
      if (!title) errors.title = 'Enter a title for this task.';
      const dueDate = date('dueDate', false, 'Enter a valid date, or clear the field.');
      out = { ...(rec || { completed: false, completedAt: null }), title, description: get('description'), dueDate, priority: get('priority') || 'normal' };
    } else if (kind === 'bill') {
      const name = get('name'), amountCents = parseAmount(get('amount'));
      if (!name) errors.name = 'Enter a name for this bill.';
      if (!(amountCents > 0)) errors.amount = 'Enter an amount greater than 0.';
      const dueDate = date('dueDate', true, 'Choose a due date.');
      out = { id: rec ? rec.id : null, name, amountCents, dueDate, recurrence: get('recurrence') || 'none', notes: get('notes') };
    } else {
      const description = get('description'), amountCents = parseAmount(get('amount'));
      if (!(amountCents > 0)) errors.amount = 'Enter an amount greater than 0.';
      if (!description) errors.description = 'Add a short description.';
      const d = date('date', true, 'Choose a date.');
      out = { ...(rec || { billId: null }), type: kind, amountCents, description, date: d };
    }
    return { out, errors };
  }

  async function submitForm(e) {
    e.preventDefault();
    const { out, errors } = readForm();
    if (Object.keys(errors).length) { showErrors(errors); return; }
    const { kind, rec } = form;
    try {
      if (kind === 'task') await DB.saveTask(out);
      else if (kind === 'bill') await DB.saveBill(out);
      else await DB.saveTransaction(out);
      closeSheet();
      await refresh();
      toast(rec ? 'Changes saved' : `${cap(LABEL[kind])} added`);
    } catch (err) {
      const box = $('#form-error'); box.textContent = `Could not save: ${err.message || 'storage is unavailable.'}`; box.hidden = false;
    }
  }

  let deleteArmed = 0;
  async function onDelete(button) {
    if (!deleteArmed) {
      button.textContent = 'Tap again to delete';
      deleteArmed = setTimeout(() => { deleteArmed = 0; if (button.isConnected) button.textContent = 'Delete'; }, 4000);
      return;
    }
    clearTimeout(deleteArmed); deleteArmed = 0;
    const { kind, rec } = form;
    try {
      if (kind === 'task') await DB.deleteTask(rec.id);
      else if (kind === 'bill') await DB.deleteBill(rec.id);
      else await DB.deleteTransaction(rec.id);
      closeSheet();
      await refresh();
      toast(`${cap(LABEL[kind])} deleted`);
    } catch (err) {
      const box = $('#form-error'); box.textContent = `Could not delete: ${err.message}`; box.hidden = false;
    }
  }

  /* ---------- pay, balance, backup sheets ---------- */

  let payId = null;
  function openPay(bill) {
    payId = bill.id;
    const next = bill.recurrence !== 'none' ? util.nextDueDate(bill.dueDate, bill.recurrence, bill.anchorDay) : null;
    openSheet('Mark as paid', `<form id="pay-form" novalidate>
      <p class="lead"><strong>${esc(bill.name)}</strong> · ${money(bill.amountCents)}</p>
      ${field('paidDate', 'Payment date', input('paidDate', { type: 'date', value: util.today() }))}
      <div class="switch"><label for="f-subtract">Subtract from my balance</label>
        <input id="f-subtract" name="subtract" type="checkbox" role="switch" checked>
        <p class="hint">Turn this off if you already recorded this payment as an expense, so it is not counted twice.</p></div>
      ${next ? `<p class="hint" style="margin-bottom:16px">This bill repeats. The next one will be due ${shortDate(next)}.</p>` : ''}
      <p class="form-error" id="form-error" role="alert" hidden></p>
      <div class="actions"><button class="btn primary" type="submit">Mark paid</button></div></form>`, { focus: false });
  }

  async function submitPay(e) {
    e.preventDefault();
    const fd = new FormData(e.target), paidDate = String(fd.get('paidDate') || '');
    if (!util.isYMD(paidDate)) { showErrors({ paidDate: 'Choose the payment date.' }); return; }
    try {
      const { next } = await DB.payBill(payId, { paidDate, subtract: fd.get('subtract') === 'on' });
      closeSheet();
      await refresh();
      toast(next ? `Paid · next bill due ${shortDate(next.dueDate)}` : 'Marked as paid');
    } catch (err) {
      const box = $('#form-error'); box.textContent = `Could not save: ${err.message}`; box.hidden = false;
    }
  }

  function openBalance() {
    const c = calc();
    openSheet('Update balance', `<form id="balance-form" novalidate>
      ${field('balance', 'Current balance', input('balance', { value: centsToInput(c.recorded), attrs: 'inputmode="decimal" autocomplete="off"' }), 'Daymark treats this as your balance now. Income and expenses you record later adjust it.')}
      <p class="form-error" id="form-error" role="alert" hidden></p>
      <div class="actions"><button class="btn primary" type="submit">Save balance</button></div></form>`);
    $('#f-balance').select();
  }

  async function submitBalance(e) {
    e.preventDefault();
    const cents = parseAmount($('#f-balance').value, true);
    if (Number.isNaN(cents)) { showErrors({ balance: 'Enter an amount, for example 1250.00.' }); return; }
    try {
      await DB.setOpening(cents - calc().net);
      closeSheet();
      await refresh();
      toast('Balance updated');
    } catch (err) {
      const box = $('#form-error'); box.textContent = `Could not save: ${err.message}`; box.hidden = false;
    }
  }

  let pending = null;
  function openBackup() {
    pending = null;
    openSheet('Backup & restore', `<p class="privacy">Daymark keeps everything on this device, inside this browser. Clearing browser or site data can erase it, so export a backup now and then. Open Daymark from the same site address each time, or your data will not appear.</p>
      <div class="actions" style="flex-direction:column"><button class="btn primary" type="button" data-action="export">${icon('backup')}Export backup</button>
      <button class="btn" type="button" data-action="pick-restore">Restore from a backup file</button></div>
      <input id="restore-file" type="file" accept="application/json,.json" hidden>
      <div class="status" id="restore-status" role="status" aria-live="polite"></div>`, { focus: false });
  }

  async function exportBackup() {
    try {
      const data = await DB.exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `daymark-backup-${util.today()}.json` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      $('#restore-status').innerHTML = '<p>Backup exported. Keep the file somewhere safe.</p>';
    } catch (err) {
      $('#restore-status').innerHTML = `<p class="bad">Could not export: ${esc(err.message)}</p>`;
    }
  }

  async function onRestoreFile(file) {
    const status = $('#restore-status');
    pending = null;
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { status.innerHTML = '<p class="bad">That file is too large to be a Daymark backup.</p>'; return; }
    let result;
    try { result = DB.parseBackup(await file.text()); } catch (_) { result = { ok: false, error: 'The file could not be read.' }; }
    if (!result.ok) { status.innerHTML = `<p class="bad">${esc(result.error)} Nothing was changed.</p>`; return; }
    pending = result.data;
    const c = result.counts;
    const when = result.exportedAt ? ` from ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(result.exportedAt))}` : '';
    status.innerHTML = `<p>Backup${when}: ${plural(c.tasks, 'task')}, ${plural(c.bills, 'bill')}, ${plural(c.transactions, 'transaction')}.</p>
      <p><strong>Restoring replaces everything currently in Daymark.</strong></p>
      <div class="actions"><button class="btn" type="button" data-action="cancel-restore">Cancel</button><button class="btn primary" type="button" data-action="confirm-restore">Replace my data</button></div>`;
  }

  async function confirmRestore() {
    if (!pending) return;
    try {
      await DB.replaceAll(pending);
      pending = null;
      closeSheet();
      await refresh();
      toast('Backup restored');
    } catch (err) {
      $('#restore-status').innerHTML = `<p class="bad">Could not restore: ${esc(err.message)} Your existing data was not changed.</p>`;
    }
  }

  /* ---------- row interactions ---------- */

  function exitRow(row) {
    if (!row || reduced()) return Promise.resolve();
    const h = row.offsetHeight;
    return row.animate([{ height: `${h}px`, minHeight: `${h}px`, opacity: 1 }, { height: '0px', minHeight: '0px', opacity: 0 }],
      { duration: 220, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' }).finished.catch(() => {});
  }
  function popBox(key) {
    const box = $(`[data-row="${key}"] .box`);
    if (box && !reduced()) box.animate([{ transform: 'scale(.82)' }, { transform: 'scale(1)' }], { duration: 240, easing: 'cubic-bezier(.16,1,.3,1)' });
  }

  async function toggleTask(id, button) {
    const t = S.tasks.find((x) => x.id === id);
    if (!t) return;
    const completing = !t.completed, row = button.closest('.row');
    const leaves = S.route === 'tasks' && (completing ? S.taskFilter !== 'completed' : S.taskFilter === 'completed');
    row.classList.toggle('is-done', completing);
    button.setAttribute('aria-checked', String(completing));
    try {
      if (leaves) await exitRow(row);
      await DB.saveTask({ ...t, completed: completing, completedAt: completing ? Date.now() : null });
      await refresh();
      if (!leaves) popBox(`task-${id}`);
    } catch (err) { toast(`Could not save: ${err.message}`); await refresh(false); }
  }

  async function toggleBill(id, button) {
    const b = S.bills.find((x) => x.id === id);
    if (!b) return;
    if (!b.paid) { openPay(b); return; }
    try {
      const row = button.closest('.row');
      const leaves = S.route === 'bills' && S.billFilter === 'paid';
      row.classList.remove('is-done');
      button.setAttribute('aria-checked', 'false');
      const { removedNext } = await DB.unpayBill(id);
      if (leaves) await exitRow(row);
      await refresh();
      toast(removedNext ? 'Marked unpaid · the next bill was removed' : 'Marked unpaid');
    } catch (err) {
      toast(err.message);
      await refresh(false);
    }
  }

  /* ---------- events ---------- */

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action, id = el.dataset.id ? Number(el.dataset.id) : null;
    switch (a) {
      case 'add': openForm(S.route === 'bills' ? 'bill' : S.route === 'money' ? 'expense' : 'task'); break;
      case 'add-kind': openForm(el.dataset.kind); break;
      case 'backup': openBackup(); break;
      case 'balance': openBalance(); break;
      case 'close': closeSheet(); break;
      case 'filter':
        S[el.dataset.scope] = el.dataset.value;
        $$('.seg.filters [data-action="filter"]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
        $('.seg.filters')._thumb.place(true);
        renderBody();
        break;
      case 'form-kind': switchKind(el.dataset.kind); break;
      case 'toggle-task': toggleTask(id, el); break;
      case 'toggle-bill': toggleBill(id, el); break;
      case 'edit': {
        const kind = el.dataset.kind;
        const rec = (kind === 'task' ? S.tasks : kind === 'bill' ? S.bills : S.tx).find((x) => x.id === id);
        if (rec) openForm(kind, rec);
        break;
      }
      case 'delete': onDelete(el); break;
      case 'export': exportBackup(); break;
      case 'pick-restore': $('#restore-file').click(); break;
      case 'cancel-restore': pending = null; $('#restore-status').innerHTML = ''; break;
      case 'confirm-restore': confirmRestore(); break;
    }
  });

  document.addEventListener('submit', (e) => {
    const id = e.target.id;
    if (id === 'form') submitForm(e);
    else if (id === 'pay-form') submitPay(e);
    else if (id === 'balance-form') submitBalance(e);
    else e.preventDefault();
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'restore-file') { onRestoreFile(e.target.files[0]); e.target.value = ''; }
    const s = e.target.closest && e.target.closest('.seg');
    if (s && s._thumb) s._thumb.place(true);
  });

  // Liquid Glass light: controls and chrome get the pointer position so their sheen follows the finger.
  const LIGHT = '.tabs, .rail, .add, .icon-btn';
  function followLight(e) {
    if (reduced()) return;
    const el = e.target.closest && e.target.closest(LIGHT);
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }
  document.addEventListener('pointermove', followLight, { passive: true });
  document.addEventListener('pointerdown', followLight, { passive: true });

  // iOS only shows :active styles when a touch listener exists on the document.
  document.addEventListener('touchstart', () => {}, { passive: true });

  window.addEventListener('hashchange', () => go(true));
  window.addEventListener('resize', () => { $$('.seg').forEach((s) => s._thumb && s._thumb.place(false)); if (navThumb) navThumb.place(false); });

  // Midnight rollover and returning to the app after a long time.
  let lastDay = util.today();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && util.today() !== lastDay) { lastDay = util.today(); shell(); renderBody(); }
  });
  if (channel) channel.onmessage = () => { if (!dlg.open) refresh(false); else reload(); };

  /* ---------- start ---------- */

  async function init() {
    $$('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
    navThumb = Thumb($('.tabs'), () => $('.tabs [aria-current="page"]'));
    try {
      await reload();
    } catch (err) {
      $('#main').innerHTML = `<div class="glass" style="padding:24px"><h1>Storage is unavailable</h1><p class="sub">Daymark could not open this browser's local storage. Private browsing or blocked site data can cause this. Allow site data for this address and reload.</p></div>`;
      return;
    }
    go(false);
    requestAnimationFrame(() => navThumb.place(false));
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  init();
})();
