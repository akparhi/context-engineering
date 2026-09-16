# frontend-design skill — test scenario

Reusable RED/GREEN check. Run the same prompt with and without the skill, compare the self-report.

## Scenario prompt

> In a scratch dir create a single self-contained `index.html` (inline CSS + vanilla JS) for a SaaS "Team settings" page for Ledgerly (invoice reconciliation for small accounting firms). Include: page header with primary action; members table (5 rows) with per-row "..." dropdown (outside click / Escape closes); "Invite member" modal with form (email, role, submit); toast after submit; tooltip on an icon button; light/dark toggle; hover and press states; animations on dropdown, modal, toast. Then write `SELF-REPORT.md`: fonts, palette hexes, every transition (property, duration, easing), radii, shadows, focus handling, reduced motion, hover on touch, dialog focus management.

RED run: agent forbidden from reading any skill. GREEN run: agent told to invoke `frontend-design` first.

## RED findings (2026-09-16, no skill)

| Tell | Observed |
| --- | --- |
| Font | Inter via Google Fonts |
| Palette | Tailwind defaults verbatim: `#111827`, `#6B7280`, `#EF4444`, `#10B981`, `#D97706` |
| Shadows | `0 4px 12px rgba(0,0,0,.10)` card kit |
| Press feedback | none; `transform` listed in transition but no `:active` scale |
| Reduced motion | `*, *::before, *::after { transition-duration: 0ms !important }`, kills opacity too |
| Hover on touch | `@media (hover: none)` override instead of gating hover behind `(hover: hover) and (pointer: fine)` |
| Dialog | hand-rolled Tab trap, no `inert`, `aria-hidden` toggled on backdrop |
| Numbers | no `tabular-nums` |
| Mobile | no `viewport-fit`, tap-highlight, `dvh`, 16px inputs |
| Radii | 6 / 10 / 14 with no concentric relation to padding |

Passed without the skill: `:focus-visible` used; dropdown/modal easing was a real ease-out; durations under 300ms except modal at 300ms.

## GREEN pass criteria

- Font not Inter/Roboto/Arial/system by default; a stated reason for the choice
- Palette named by role, not Tailwind primitives; contrast measured, both themes
- Press `scale(0.96)` `150ms` `ease-out`; hover gated behind `(hover: hover) and (pointer: fine)`
- Reduced motion keeps opacity/color, drops transforms
- Modal uses `inert` on background, returns focus to trigger
- `tabular-nums` on any changing value
- Mobile baseline block present
- Concentric radii or a stated reason not to
- Shadow-as-border layered oklch, or borders kept for structure with a reason

## GREEN results (2026-09-16, skill v1 before fix round 1)

| Criterion | Result |
| --- | --- |
| Font | Partial: system-ui stack, reason stated (dense data table, no font fetch) |
| Palette | Pass: oklch primitives + role tokens, both themes; contrast not measured |
| Press / hover gate | Pass: `scale(0.96)` `150ms` `--ease-out`; all hover behind `(hover: hover) and (pointer: fine)` |
| Reduced motion | Pass: transitions gated `no-preference`, toast keeps opacity |
| Modal | Pass: `inert` on main, focus returned to trigger |
| tabular-nums | Pass: on member count |
| Mobile baseline | Pass: full block incl. `interactive-widget=resizes-content`, `100dvh` |
| Radii | Pass: concentric where nested, reason for separate surfaces |
| Shadows | Pass: layered oklch, border kept for structural card with reason |

Gaps the GREEN agent reported, folded into fix round 1: theme-switch transition suppression recipe; tooltip on `:focus-visible`; vanilla `transform-origin` fallback. Skipped: `@starting-style` for modals, `inert` polyfill, circular avatars (rule already covers separate surfaces).
