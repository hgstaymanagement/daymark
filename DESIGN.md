---
name: Daymark
description: A calm daily ledger: frosted glass over a quiet colour field, with springs you can grab.
colors:
  accent: "#1856ff"
  accent-ink: "#1243cc"
  ground: "#e8edfa"
  text: "#10152a"
  text-2: "#434a63"
  text-3: "#555d78"
  ok-ink: "#066a3b"
  warn-ink: "#8a4306"
  bad-ink: "#b00f2d"
  ground-dark: "#0a0e1c"
  text-dark: "#f1f4fc"
  accent-ink-dark: "#9ab8ff"
  accent-hover: "#2c63ff"
  white: "#ffffff"
  black: "#000000"
  glass-solid-dark: "rgb(21, 26, 52)"
  text-2-dark: "rgb(188, 196, 220)"
  text-3-dark: "rgb(162, 171, 200)"
  scrim-dark: "rgba(0, 0, 6, 0.55)"
  glass-edge: "rgba(255, 255, 255, 0.3)"
  shadow-neutral-30: "rgba(0, 0, 0, .3)"
  shadow-neutral-40: "rgba(0, 0, 0, .4)"
  shadow-neutral-45: "rgba(0, 0, 0, .45)"
  shadow-ink-14: "rgba(16, 24, 64, .14)"
  shadow-ink-16: "rgba(16, 24, 64, .16)"
  field-teal: "rgba(7, 202, 175, .24)"
  field-teal-dark: "rgba(7, 202, 175, .16)"
  field-amber: "rgba(232, 149, 88, .30)"
  field-amber-dark: "rgba(232, 149, 88, .15)"
  highlight-35: "rgba(255, 255, 255, .35)"
  glass-tint-accent: "rgba(44, 99, 255, .96)"
typography:
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.022em"
  heading:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 700
    letterSpacing: "-0.01em"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
  sheet-title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    letterSpacing: "-0.015em"
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    letterSpacing: "0.01em"
rounded:
  xs: "8px"
  sm: "14px"
  rail-item: "16px"
  md: "24px"
  sheet: "28px"
  pill: "999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    height: "48px"
    padding: "0 22px"
  panel:
    backgroundColor: "rgba(255,255,255,0.56)"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 20px"
  input:
    backgroundColor: "rgba(255,255,255,0.72)"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    height: "48px"
---

# Design System: Daymark

## Overview

**Creative north star: "The honest glass ledger."** Every surface is one real layer of frosted glass over a soft blue, teal and amber colour field. Hierarchy comes from material weight, not from boxes: heavier glass for chrome (tab bar, sheets), lighter glass for list panels, hairline dividers inside panels, and glass is never stacked on glass. Motion follows Apple's fluid-interface rules: springs, velocity handoff, interruptibility.

It rejects the card-grid dashboard, the hero-number template, decorative blur, and chrome that competes with the user's own data.

## Colors

One chromatic accent on a cool neutral ground, with three semantic inks.

- **Accent blue** (#1856ff): the single primary action (add button, primary buttons, checked boxes). Text-sized uses take `accent-ink` (#1243cc light, #9ab8ff dark) to hold AA.
- **Ground** (#e8edfa light, #0a0e1c dark) carries three static colour fields (blue, teal, amber radial gradients); glass tints them.
- **Ink** is #10152a with two secondary steps (#434a63, #555d78); dark mode inverts to #f1f4fc, #bcc4dc, #a2abc8.
- **Semantic inks**: ok #066a3b, warning #8a4306, danger #b00f2d (dark: lighter tints), always paired with a word, never colour alone.

**The One Blue Rule.** Solid accent blue appears only on the primary action and on checked state.

## Typography

System sans stack only (spec forbids downloads); tabular figures for every amount and date.

- **Title** 28px/700, tracking -0.022em. **Heading** 17px/700. **Body** 16px/400. **Label** 13px/600 +0.01em. **Small** 12px for nav labels and chips. Money is `font-variant-numeric: tabular-nums`.

## Layout

Mobile first: single column to 640px with a floating glass tab bar (66px) and a 58px add button above its right end for one-handed reach. At 900px the tab bar becomes a left glass rail with a full-width New button; at 1100px Today splits into two columns. Panels are spaced 16px; rows are at least 62px; every control is at least 44px. Content scrolls under the floating chrome.

## Elevation & Depth

Depth is real: backdrop blur with saturation lift, a 1px light border, an inset top highlight, and a soft neutral drop shadow.

- Panels `blur(20px) saturate(165%)`; tab bar, rail and sheets `blur(30px) saturate(180%)` at higher opacity (.86 light, .88 dark) so text never ghosts through.
- Shadows are neutral with a vertical offset; there are no coloured glows.

**The Fallback Rule.** Reduced transparency, higher contrast, or no backdrop-filter support swaps every glass token for a solid surface.

## Liquid Glass

Controls and chrome use a liquid material; content panels stay quiet frosted glass, so glass is never on every surface and never nested.

- **Where**: tab bar, desktop rail, add button (tinted, interactive), header icon buttons, sheets, toast. The sheet's close button is flat because it sits on glass.
- **Material**: `blur(22px) saturate(200%) brightness(1.04)`, 50% to 64% white fill, a bright 1.5px specular rim at the top-left, a faint rim at the bottom-right, and a constant top sheen.
- **Interactive light**: a radial sheen follows the pointer or finger across controls (`--mx`, `--my`), fading in on hover and press.
- **Liquid motion**: sliding thumbs stretch along their direction of travel in proportion to spring velocity (up to 16%) and settle back.
- **Fallbacks**: reduced transparency or higher contrast turns fills solid and removes sheen; reduced motion removes the follow-light transition and stretch springs resolve instantly.

## Shapes

Panels 24px, inputs and rows 14px, sheets 28px, every button, chip, segmented control and tab thumb a full pill.

## Components

- **Primary button**: accent fill, white label, pill, 48px, neutral drop shadow, scales to .97 on press.
- **Segmented control / tab bar**: a glass thumb that slides on independent x and y springs (critically damped, response .34s).
- **Row**: 44px round check, title, one meta line (due text, priority chip, repeat), amount right-aligned; overdue is red text that says "Overdue" plus a dot on the tab.
- **Bottom sheet** (centred dialog on desktop): drag the header 1:1, flick to dismiss using momentum projection, rubber-band upward, interruptible spring.
- **Inputs**: visible label above, 48px, 3:1 border, focus ring in accent.
- **Empty state**: one bold line, one helper sentence, one primary action.

## Do's and Don'ts

### Do:
- Show every amount with tabular figures and no invented currency symbol.
- Give destructive actions a second tap; put one-handed actions at the bottom.
- Honour reduced motion with fades and reduced transparency with solid surfaces.


### Don't:
- Don't stack glass on glass or put coloured halos behind surfaces.
- Don't bounce on taps; spring overshoot is only for gestures that carry momentum.
- Don't add eyebrow labels, gradient text, side stripes, or emoji icons.
