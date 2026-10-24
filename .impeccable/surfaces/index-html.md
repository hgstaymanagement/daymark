---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: []
---

# Surface brief: Daymark app shell (index.html)

Scope and mode: Operate. One installable single-page app: Today, Tasks, Bills, Money, plus add/edit/pay/balance/backup sheets. Code-led build (no comp).
Audience and job: one person capturing and checking tasks, bills and a simple balance, mostly one-handed on a phone, sometimes on desktop, often offline.
Pinned by the user: glassmorphism for UI, Apple-style fluid motion for animation and transitions, Impeccable craft guidance. Spec forbids dependencies, so fonts are the system stack and springs are hand-written.
Unresolved: currency symbol (none shown until the user chooses one).

## Direction contract

THESIS: A calm daily ledger where every surface is one honest layer of frosted glass over a quiet colour field, and every movement is a spring that can be grabbed. Refuses the card-grid dashboard and the hero-number template.
OWN-WORLD: Cool blue-tinted ground with three soft colour fields (blue, teal, amber) behind translucent white (light) or ink-blue (dark) glass. System sans, tabular figures, hairline dividers inside panels, pill controls, solid blue for the one primary action. Heavier glass for chrome (nav, sheets), lighter for list panels; glass is never stacked on glass.
STORY: Open the app and see what is overdue and due today, what bills land this week, and what is truly available after unpaid bills. Add anything in two taps from the thumb-reach button.
FIRST VIEWPORT: Mobile: large "Today" title with the date, a backup icon top right; an Overdue panel only when something is late; the Today's tasks panel with round checkboxes; floating glass tab bar bottom with a sliding thumb and a blue add button above its right end. Desktop: glass rail left, two columns right.
FORM: Operate shell with standard controls (tabs, segmented filters, lists, bottom sheet that becomes a centred dialog). seed: none (unavailable). Direction pinned by the user, no roll.
SIGNATURE: The bottom sheet and sliding thumbs obey Apple fluid-interface rules: 1:1 drag, velocity handoff, momentum projection, rubber-banding, interruptible springs, materialised enter.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
