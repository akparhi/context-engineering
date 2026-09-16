<!-- Adapted from Emil Kowalski skills and Jakub Krehel skills (MIT). See NOTICE.md -->

The values, curves, and rules behind every motion decision — look them up here, cite them in findings, never approximate.

## Animate only when it serves a purpose

Valid purposes: spatial consistency, state indication, explanation, feedback, preventing jarring change. Brief and precise beats prominent. Where a shorter, smaller animation says the same thing, use it. When in doubt, cut the duration.

Keyboard-initiated surfaces appear instantly. Apply `data-instant` to skip the enter animation; press state feedback is exempt.

## Use `var(--ease-out)` for enter, exit, and transform

Entering or exiting: `var(--ease-out)`. Moving or morphing on screen: `var(--ease-in-out)`. Color or opacity only: `ease`. Constant motion (marquee, progress): `linear`. Never `ease-in` on UI.

Never the CSS keyword `ease-out` without the custom token — Tailwind's built-in `ease-out` is `cubic-bezier(0, 0, 0.2, 1)`, not the skill curve. Register the tokens with `@theme` (recipe in `motion-recipes.md`).

In Motion, pass the array form: `ease: [0.23, 1, 0.32, 1]`. The string `"easeOut"` resolves to the browser built-in, not the skill curve.

## Keep UI animations under 300ms

Named exceptions live once here; SKILL.md says "under 300ms; drawers and sheets up to 500ms."

| Element | Duration |
| --- | --- |
| Button press feedback | 100–160ms |
| Tooltips, small popovers | 125–200ms |
| Dropdowns, selects | 150–250ms |
| Modals | 200–300ms |
| Drawers, sheets | up to 500ms with `--ease-drawer`, both directions |
| Toast enter | 300ms |
| Toast exit | 150ms |
| List stagger total | under 300ms |
| Marketing or explanatory | can be longer |

## Start entries at 0.95–0.97, not 0

Never `scale(0)`. Start at `0.95`–`0.97` combined with `opacity: 0`.

Popovers scale out of their trigger. Set `transform-origin` from the primitive's variable:

```css
/* Base UI */
.popover { transform-origin: var(--transform-origin); }
.tooltip { transform-origin: var(--transform-origin); }

/* Radix — variable name differs per component */
.popover { transform-origin: var(--radix-popover-content-transform-origin); }
.menu    { transform-origin: var(--radix-dropdown-menu-content-transform-origin); }
.tooltip { transform-origin: var(--radix-tooltip-content-transform-origin); }
.select  { transform-origin: var(--radix-select-content-transform-origin); } /* position="popper" only */

/* Vanilla CSS — no primitive — point toward the trigger */
.menu-bottom-end { transform-origin: top right; }
```

`--radix-select-content-transform-origin` exists only when `position="popper"` is set on Select.

Modals are exempt — not anchored to a trigger, so keep `transform-origin: center`.

Press feedback: `scale(0.96)` on `:active`. The transform is always active; gate only the transition behind reduced-motion:

```css
@media (prefers-reduced-motion: no-preference) {
  .button { transition: transform 150ms var(--ease-out); }
}
.button:active { scale: 0.96; }
```

## Use physics springs for gestures, duration springs for toggles

Duration-based springs (`{ type: "spring", duration, bounce }`) have a fixed duration and do not carry velocity. Physics springs (`{ type: "spring", stiffness, damping, mass }`) preserve velocity when a gesture interrupts. Use physics springs for drag and gesture work; use duration springs for icon swaps and toggles.

```js
{ type: "spring", duration: 0.5, bounce: 0.2 }              // toggle / icon swap (duration-based)
{ type: "spring", mass: 1, stiffness: 100, damping: 10 }    // drag / gesture (physics)
```

Keep bounce in `0.1`–`0.3`. Avoid bounce in most UI; reserve it for drag-to-dismiss and playful interactions. Icon swaps use `bounce: 0` exactly.

For mouse-tracking, interpolate through `useSpring` rather than binding a value directly to pointer position. Only do this when the motion is decorative.

## Use transitions for interactive state changes, keyframes for one-shot sequences

| | CSS transitions | CSS keyframes |
| --- | --- | --- |
| Behavior | Interpolate toward the latest state | Run on a fixed timeline |
| Interruptible | Yes, retargets mid-flight | No, restarts from the beginning |
| Use for | Interactive state changes: hover, toggle, open/close | One-shot staged sequences: page enter, loading |

Anything triggered rapidly — toasts arriving, toggles, drawers — uses transitions. A keyframed drawer snaps or restarts when closed mid-animation.

## Gate every transition and animation behind reduced-motion

Reduced motion is opt-in. Author the static state, then add movement only inside the query.

```css
@media (prefers-reduced-motion: no-preference) {
  .element { transition: transform 200ms var(--ease-out); }
}

@media (hover: hover) and (pointer: fine) {
  .element:hover { transform: scale(1.05); }
}
```

Combine hover and reduced-motion when both apply:

```css
@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
  .element:hover { transform: scale(1.05); transition: transform 150ms var(--ease-out); }
}
```

In Motion, read `useReducedMotion` from `motion/react` (or `framer-motion`):

```jsx
import { useReducedMotion } from "motion/react";

const reduce = useReducedMotion();
const closedX = reduce ? 0 : "-100%";
```

Under reduce, keep opacity and color transitions that aid comprehension; drop transform-based movement.

## Entry without JavaScript

```css
.toast {
  opacity: 1;
  transform: translateY(0);
  @media (prefers-reduced-motion: no-preference) {
    transition: opacity 300ms var(--ease-out), transform 300ms var(--ease-out);
    @starting-style { opacity: 0; transform: translateY(100%); }
  }
}
```

Where `@starting-style` support is insufficient, fall back to a mount flag: `useEffect(() => setMounted(true), [])` plus a `data-mounted` attribute.

## Exit shorter than enter

Exits are shorter and softer than enters — the user's focus is already moving on.

- Popovers, tooltips, modals: reverse their entry transform, ~150ms.
- Elements leaving a stack (toasts, list rows): `translateY(-12px)`, ~150ms, `var(--ease-out)`.
- Drawers and sheets: exit along their axis, up to 500ms.

Remove immediately, with no motion, when the exit carries no spatial information, the interaction repeats frequently, or reduced motion is requested.

## Asymmetric timing

Slow where the user is deciding, fast where the system responds.

```css
@media (prefers-reduced-motion: no-preference) {
  .overlay { transition: clip-path 200ms var(--ease-out); }         /* release: fast */
  .button:active .overlay { transition: clip-path 2s linear; }      /* press: slow, deliberate */
}
```

## Animate only transform and opacity; measure before adding others

Eligible animations (`transform`, `opacity`) can run on the compositor. Measure in DevTools (4× CPU slowdown) before animating `filter: blur()`, `clip-path`, `height` via `grid-template-rows`, `box-shadow`, or colors.

Never drive child transforms through a CSS variable on the parent. Variables inherit and recalculate styles for every child.

```js
element.style.setProperty('--swipe-amount', `${d}px`); // bad: recalc on all children
element.style.transform = `translateY(${d}px)`;        // good: only this element
```

Motion's shorthand props `x`, `y`, and `scale` run on the main thread via `requestAnimationFrame`. Use the full transform string for hardware acceleration.

```jsx
<motion.div animate={{ x: 100 }} />                          // drops frames under load
<motion.div animate={{ transform: "translateX(100px)" }} />  // hardware accelerated
```

CSS animations beat JS under main-thread load. Use CSS for predetermined motion, JS for dynamic or interruptible motion. WAAPI gives JS control at CSS performance:

```js
element.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }],
  { duration: 1000, fill: 'forwards', easing: 'cubic-bezier(0.77, 0, 0.175, 1)' });
```

## Understand transform behavior

`translate` percentages are relative to the element's own size, so `translateY(100%)` moves by the element's height at any dimension.

`scale()` scales children too — the label and icons come along. That is the feature that makes press feedback read as physical.

`rotateX`/`rotateY` with `transform-style: preserve-3d` gives depth, orbit, and flip without JS.

`clip-path: inset(t r b l)` eats in from each named side. Uses: reveal on scroll (`inset(0 0 100% 0)` → `inset(0 0 0 0)`), hold-to-confirm overlay, seamless tab color transitions by duplicating and clipping the active copy, comparison sliders.

## Dismiss on momentum, not distance alone

Compute `Math.abs(distance) / elapsedMs` and dismiss when velocity exceeds `0.11`. A flick should be enough.

Damp at boundaries: dragging past a natural edge moves the element less the further it goes.

Set pointer capture once dragging starts. Guard multi-touch with `if (isDragging) return` on new touch points. Use friction, not a wall.

## Blur masks imperfect crossfades

When a crossfade shows two overlapping states despite easing and duration tuning, add `filter: blur(2px)` during the transition.

Keep blur under 20px. Heavy blur is expensive, especially in Safari.

## Stagger groups, not routine interactions

Stagger a group entrance at 30–80ms per list item, hero semantic groups at ~100ms per group. Stagger is decorative: it must never block interaction while it plays, and never applies to routine interactions such as row hovers, keystrokes, or repeated tab changes.

## Motion is never the only feedback channel

Every state change an animation communicates stays visible when the animation does not run: a color change, an icon swap, a label.

## Import path

Read `package.json` before writing any Motion code. Import from `motion/react` when `motion` is installed, or from `framer-motion` when that is installed. Never mix one package with the other's import path.

Where both exist, follow the imports nearby components already use. Where neither is present, use the CSS recipe and add no dependency.

## Debugging

Slow motion: bump duration 2–5× or use the DevTools animation inspector. Check that colors crossfade cleanly, easing does not stop abruptly, `transform-origin` is right, and coordinated properties stay in sync.

Frame-by-frame: the Chrome DevTools Animations panel reveals timing drift between properties that should move together.

Real devices for gestures. Connect a phone, hit the dev server by IP, and use Safari remote devtools — a trackpad drag does not surface what a thumb does.
