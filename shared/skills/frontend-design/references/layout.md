<!-- Adapted from Jakub Krehel skills (MIT). See NOTICE.md -->
Layout rules covering grouping, alignment, spacing, adaptivity, and content-edge behaviour.

## Group with space, not lines

Space groups first, background shapes second, separator lines last.
Use lines only where space alone cannot carry the structure.
The gap between groups must be at least 2× the intra-group gap: `8px` within a group, `16px`+ between groups.
Mismatched ratios make grouping read as noise.

## Keep controls distinct from content

Buttons, inputs, and interactive elements need a visible boundary or enough surrounding space to read as actionable, not decorative.
A filled card background is not enough contrast for a button inside it; add a bordered or elevated treatment.

## Align to shared edges

Pick alignment edges and stick to them; every stray edge reads as noise.
Use one project spacing step per level of subordination — `16px` is a useful default.
Use logical properties for direction-dependent layout: `padding-inline-start`, `margin-inline-end`.

## Logical properties, not physical

Express direction-dependent horizontal position as leading/trailing so the layout mirrors automatically under `dir="rtl"`.

| Physical (avoid) | Logical (use) |
| --- | --- |
| `margin-left` | `margin-inline-start` |
| `padding-right` | `padding-inline-end` |
| `left: 0` | `inset-inline-start: 0` |
| `text-align: left` | `text-align: start` |
| `border-right` | `border-inline-end` |

```css
/* Good */
.item { margin-inline-start: 1rem; padding-inline-end: 1.5rem; text-align: start; }
/* Bad */
.item { margin-left: 1rem; padding-right: 1.5rem; text-align: left; }
```

```html
<!-- Tailwind -->
<div class="ms-4 pe-6 text-start">…</div>
```

Reserve physical properties for genuinely physical geometry such as device notch positioning.
Where arrangement encodes progression — star ratings, step indicators, progress bars — the sequence mirrors in RTL and fills from the trailing side.
Flexbox and grid with logical properties mirror automatically; hand-positioned elements do not.

## Order by importance

Readers scan top-to-bottom and leading-to-trailing; place the most important information near the top and the leading edge.
Never bury the key number under secondary detail — push it into collapsed sections, tabs, or detail views.
Within a row, identifying content leads and metadata and actions trail.
The primary action should be obvious within one second of landing; reduce visual weight on secondary items before adding more primaries.

## Hint at hidden content

Every off-screen or collapsed element needs a visible cue that it exists.
Keep the product's established scroll indicator or disclosure pattern; use these recipes only where no cue exists.

**Peeking items.** Size items so the next one peeks `16–32px` past the container edge.
A row of cards that ends exactly at the edge looks complete and nobody scrolls it.

**Disclosure controls.** Collapsed sections get a chevron or "Show more", labelled with what is hidden: "Show 12 more results", not "More".

```css
/* Good: peeking horizontal scroller */
.scroller {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-inline: 24px;
  scroll-padding-inline: 24px;
  scroll-snap-type: x mandatory;
}
.scroller > * {
  flex: 0 0 calc(100% - 48px - 24px);
  scroll-snap-align: start;
}
```

```html
<!-- Tailwind: 80% width keeps the next card's leading 16–32px visible -->
<div class="flex gap-3 overflow-x-auto px-6 [scroll-padding-inline:1.5rem] snap-x snap-mandatory">
  <div class="w-[80%] shrink-0 snap-start">…</div>
</div>
```

## Breathing room between targets

Without an established density system, start with `12px` between adjacent bordered or filled controls and `24px` around borderless text- and icon-only ones.
Compact layouts may use less as long as hit areas don't overlap and controls stay distinct.

## Inset buttons from the edges

In content layouts, buttons against the viewport look like system chrome and clip against curved corners or gesture zones.
Keep them inside the layout margins. Edge-to-edge actions are valid where they are deliberately platform chrome.

```css
/* Good */
.action-bar {
  padding-inline: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
}
.action-bar button { width: 100%; border-radius: 12px; }
/* Bad */
.action-bar button { width: 100vw; border-radius: 0; position: fixed; bottom: 0; }
```

Start near `16px` inline margin on mobile where the project has no layout token.

## Content bleeds, controls float

Content layer — backgrounds, hero media, scrollable lists — extends to the viewport edges.
Control layer — text and interactive controls — stays inside the layout margins and safe areas.

```css
/* Good: full-bleed media inside a constrained article */
.article {
  display: grid;
  grid-template-columns: 1fr min(65ch, calc(100% - 48px)) 1fr;
}
.article > * { grid-column: 2; }
.article > .full-bleed { grid-column: 1 / -1; }

/* Sticky FAB with safe areas */
.fab {
  position: fixed;
  inset-inline-end: calc(16px + env(safe-area-inset-right));
  bottom: calc(16px + env(safe-area-inset-bottom));
}
```

## Hold structure until it breaks

Break where the layout actually stops fitting, not at `768px` because a preset says so.
Collapse late; premature collapsing throws away space users paid for.
Prefer container queries for component-level adaptation.

```css
/* Good */
.card-list { container-type: inline-size; }
@container (max-width: 400px) { .card { grid-template-columns: 1fr; } }

/* Bad */
@media (max-width: 768px) { .card { grid-template-columns: 1fr; } }
```

Test the smallest and largest supported sizes first — those break first — then the sizes between.

## Plan for growth and clipping

Design for the longest realistic string, not the design-file copy.
Fixed-width containers clip translated text; use `max-width` with wrapping and test pseudo-localization.
Primary actions at the clip-prone bottom of a pane disappear when content grows; use sticky positioning or stable chrome.

## Before you finish

| Mistake | Fix |
| --- | --- |
| `margin-left` / `padding-right` in a localizable layout | `margin-inline-start` / `padding-inline-end` |
| Content-layout button touches the viewport edge | Inset within the project margins; keep intentional platform chrome |
| Breakpoints at 768/1024 because they're the defaults | Break where the content actually stops fitting |
| Fixed-width text container sized to one language | `max-width` and wrapping; test pseudo-localization |
| Primary action at the clip-prone bottom of a pane | Sticky positioning or stable chrome with safe-area padding |
