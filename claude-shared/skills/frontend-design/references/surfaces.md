<!-- Adapted from Jakub Krehel skills (MIT). See NOTICE.md -->

Reference for surface treatments: border radius, optical alignment, shadows, image outlines, icons, and performance.

## Concentric border radius

Outer radius must equal inner radius plus the padding between them: `outerRadius = innerRadius + padding`.

Past 24 px of padding treat nested layers as separate surfaces and choose each radius independently.

```css
.card        { border-radius: 20px; padding: 8px; }
.card-inner  { border-radius: 12px; }
```

```tsx
{/* Tailwind */}
<div className="rounded-[20px] p-2">
  <div className="rounded-[12px]">…</div>
</div>
```

## Optical alignment

### Buttons with text and icon

Set icon-side padding = text-side padding − 2 px. Symmetric padding looks unbalanced when an icon is present.

```css
.button-with-icon {
  padding-inline-start: 16px;
  padding-inline-end: 14px; /* icon side */
}
```

```tsx
{/* Tailwind */}
<button className="ps-4 pe-3.5 flex items-center gap-2">
  <span>Continue</span>
  <ArrowRightIcon />
</button>
```

### Play button triangles

A filled triangle has its visual centroid left of its geometric center. Nudge it 1–2 px toward the point.

```css
.play-icon { transform: translateX(1px); }
```

```tsx
{/* Tailwind */}
<PlayIcon className="translate-x-px" />
```

### Asymmetric icons (stars, arrows, carets)

Fix uneven visual weight in the SVG (adjust viewBox or path); the component then needs no margin.

```tsx
{/* Fallback when SVG is fixed externally */}
<span className="translate-x-px"><StarIcon /></span>
```

## Shadows for elevation, borders for structure

Use layered transparent `box-shadow` where a border exists only to create depth. Keep borders for structure, state, or focus. Never shadow dividers.

### Three-layer shadow token (light mode)

Three layers: 1 px ring, lift, ambient depth.
```css
:root {
  --shadow-border:
    0px 0px 0px 1px oklch(0 0 0 / 0.06),
    0px 1px 2px -1px oklch(0 0 0 / 0.06),
    0px 2px 4px 0px oklch(0 0 0 / 0.04);

  --shadow-border-hover:
    0px 0px 0px 1px oklch(0 0 0 / 0.08),
    0px 1px 2px -1px oklch(0 0 0 / 0.08),
    0px 2px 4px 0px oklch(0 0 0 / 0.06);
}
```

### Single-ring shadow token (dark mode)

Layered shadows are invisible on dark backgrounds; use one white ring instead.
```css
--shadow-border:       0 0 0 1px oklch(1 0 0 / 0.08);
--shadow-border-hover: 0 0 0 1px oklch(1 0 0 / 0.13);
```

### Hover transition

```css
.card { box-shadow: var(--shadow-border); }
@media (hover: hover) and (pointer: fine) {
  .card:hover { box-shadow: var(--shadow-border-hover); }
}
@media (prefers-reduced-motion: no-preference) {
  .card { transition: box-shadow 150ms ease; }
}
```

### When to use shadows vs. borders

| Scenario | Use |
|---|---|
| Card floating on a background | Shadow |
| Input field boundary | Border |
| Selected chip or active tab | Border |
| Focus ring | Border (or `outline`) |
| Divider / separator | Neither — use `background-color` |

## Image outlines

Add a 1 px semi-transparent ring inside the image edge. Never use tinted color.
### Light mode

```css
img {
  outline: 1px solid oklch(0 0 0 / 0.1);
  outline-offset: -1px;
}
```

### Dark mode

```css
img {
  outline: 1px solid oklch(1 0 0 / 0.1);
  outline-offset: -1px;
}
```

### Tailwind

```tsx
<img
  className="outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
  src={src}
  alt={alt}
/>
```

Use `outline-black/10` and `outline-white/10` exactly — never tinted scales like `outline-slate-*` or `outline-zinc-*`.

`outline-offset: -1px` draws the ring inside the image edge and never affects layout.

## Icons follow the text beside them

### Match stroke to text weight

`stroke-width: 1.5px` beside regular (400) text; `stroke-width: 2px` beside semibold (600). One stroke weight per icon set; one icon library per surface.

### One SVG, recolored per state

Draw icons with `currentColor`. Never ship separate assets per state — let CSS drive color.

```html
<svg fill="none" stroke="currentColor" stroke-width="2">…</svg>
```

```css
.icon-button { color: var(--color-text-secondary); }
@media (hover: hover) and (pointer: fine) {
  .icon-button:hover { color: var(--color-text-primary); }
}
.icon-button[aria-pressed="true"] { color: var(--color-accent-text); }
.icon-button:disabled { opacity: 0.4; }
```

```tsx
{/* Tailwind — use semantic tokens so state colors follow the theme */}
<button className="text-muted-foreground hover:text-foreground aria-pressed:text-primary disabled:opacity-40">
  <BookmarkIcon />
</button>
```

Strip hardcoded fills (`fill="#666"`) to `currentColor` on import.

### Outline default, fill active

Outline variant = default; filled variant = active or selected. Never invert this.

### Design at render size

Export icons at the exact pixel size they will render. Scaling a 24 px icon to 16 px softens strokes and misaligns subpixels.

### Icons in RTL

Under `dir="rtl"`, flip icons whose meaning is tied to reading direction; leave all others alone.

| Flip | Don't flip |
|---|---|
| Back/forward arrows, chevrons in navigation | Logos and brand marks |
| Text-block glyphs (alignment, lists, indent) | Checkmarks |
| Speaker/volume waves | Physical objects: clocks, cups, pencils |
| "Send" directional glyphs | Media playback controls |

```css
[dir="rtl"] .icon-directional { scale: -1 1; }
```

```tsx
{/* Tailwind */}
<ChevronRightIcon className="icon-directional rtl:-scale-x-100" />
```

Analyze composite icons part by part — a badge or overlay may keep its position even when the base glyph flips.

## Animate only what the browser composites cheaply

### Transition only what changes

Never use `transition: all`. Name every property that actually changes.

```css
.card { transition-property: transform, opacity; transition-duration: 200ms; }
```

```tsx
{/* Tailwind — bracket syntax for multiple non-transform properties */}
<div className="transition-[scale,opacity,filter] duration-200">…</div>
```

`transition-transform` in Tailwind expands to `transform, translate, scale, rotate`. Use it for transforms alone; use bracket syntax for any mix with non-transform properties.

### Use `will-change` sparingly

Add `will-change` only after observing stutter on a real device. Never add it preemptively.

**GPU-compositable properties** (worth `will-change`):

| Property | GPU-compositable | Use `will-change` |
|---|---|---|
| `transform` | Yes | Yes |
| `opacity` | Yes | Yes |
| `filter` (blur, brightness) | Yes | Yes |
| `clip-path` | Newer Chromium only | Only after a measured frame drop |
| `top`, `left`, `width`, `height` | No | No |
| `background`, `border`, `color` | No | No |

Remove it from static elements once animations complete.

## Before you finish

| Mistake | Fix |
|---|---|
| Outer and inner radius match on nested cards | Apply `outerRadius = innerRadius + padding` |
| Icon looks pushed to one side in a button | Set icon-side padding = text-side − 2 px |
| Play triangle looks left-heavy | Nudge `translateX(1px)` |
| Asymmetric icon appears off-center | Fix in SVG viewBox; fallback: wrapper with `translate-x-px` |
| Card border looks flat on light background | Replace with three-layer `--shadow-border` token |
| Shadow on a divider or separator | Remove; use `background-color` instead |
| Image outline tinted (slate, zinc, neutral) | Replace with `outline-black/10` / `outline-white/10` |
| Icon stroke too light beside semibold text | Set `stroke-width: 2px` beside weight 600 |
| Multiple icon libraries on one surface | Consolidate to one library |
| Hardcoded `fill="#hex"` in SVG | Replace with `currentColor` |
| Directional icon not flipped in RTL | Add `rtl:-scale-x-100`; check composite icons part by part |
| `transition: all` on animated element | Name exact properties |
| `will-change` added preemptively | Add only after observed stutter; remove from static elements |
