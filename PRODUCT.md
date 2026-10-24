# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Plain HTML, CSS, vanilla JavaScript, IndexedDB, Web App Manifest, Service Worker. No frameworks, no build step, no third-party dependencies (pinned by the user's spec, daymark_spec.md).

## Users

[Inferred from the spec, not interviewed] One individual managing their own day: tasks, bills and a simple running balance, mostly on a phone, often one-handed, with unreliable connectivity.

## Product Purpose

Daymark is a lightweight, offline-first personal organizer that keeps today's tasks, upcoming bills and a simple recorded balance in one place. Success is a small, dependable app that stays correct and needs little maintenance.

## Positioning

Everything lives on the user's device: no account, no server, no tracking, no notifications.

## Operating Context

Installed as a PWA or opened in a browser tab from one origin. Data is stored in IndexedDB; backup and restore go through JSON files the user keeps themselves.

## Capabilities and Constraints

Modules: Dashboard, Tasks, Bills (with recurrence), Money tracker (income, expenses, recorded balance, estimated available balance after unpaid bills). JSON export and validated import. Paying a bill must never subtract its amount twice. Explicitly out of scope: auth, backend, notifications, bank integrations, sync, multi-user, investments, advanced budgeting, analytics, and any unrequested feature or dependency.

## Brand Commitments

Name: Daymark. Interface direction pinned by the user: glassmorphism for UI, Apple-style fluid motion for animation and transitions, Impeccable guidelines for craft.

## Evidence on Hand

/mnt/user-data/uploads/daymark_spec.md. No customers, testimonials or metrics exist; none may be invented.

## Product Principles

1. Correctness before features: balances and due states must always be right.
2. Quick capture: adding anything takes seconds and few fields.
3. Calm by default: overdue is findable without the interface shouting.
4. The user owns the data: local first, exportable, restorable.

## Accessibility & Inclusion

[Inferred] WCAG 2.2 AA contrast, keyboard operability, visible focus, reduced-motion and reduced-transparency support.
