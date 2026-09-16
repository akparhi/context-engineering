<!-- Adapted from Emil Kowalski skills and Jakub Krehel skills (MIT). See NOTICE.md -->

Ready-to-build implementations for the motion cases that come up most — start from the recipe, adapt, never rebuild from scratch.

Curves are the `--ease-out`, `--ease-in-out`, and `--ease-drawer` tokens. Values here are the rulings in `motion-standards.md`; do not substitute.

## Register easing tokens with @theme

Tailwind v4 projects register once so `ease-out` utilities resolve to the skill curve, not the browser built-in.

```css
@theme {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
}
```

Without `@theme`, use `var(--ease-out)` directly and define the tokens in `:root`.

## Button press

Any pressable element. The transform is always active; gate only the transition behind reduced-motion.

```css
.button:active { scale: 0.96; }

@media (prefers-reduced-motion: no-preference) {
  .button {
    transition-property: scale;
    transition-duration: 150ms;
    transition-timing-function: var(--ease-out);
  }
}
```

```tsx
{/* Tailwind */}
<button className="active:scale-[0.96] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out">
  Click me
</button>

{/* Motion — ease array resolves to the skill curve, not the browser built-in */}
<motion.button
  whileTap={{ scale: 0.96 }}
  transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
>
  Click me
</motion.button>
```

`scale()` scales children too, so the label and icons come along — that is what makes it read as a physical press. No hover gating needed: `:active` is a real press on touch.

### motion="static" opt-out

Not every button should scale. Wire the opt-out through a `motion` prop.

```tsx
const tapScale = "active:not-disabled:scale-[0.96] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out";

function Button({ motion: motionProp, className, ...props }) {
  const cls = cn(motionProp !== "static" && tapScale, className);
  return <button className={cls} {...props} />;
}

<Button>Click me</Button>               {/* scales on press */}
<Button motion="static">Submit</Button> {/* no scale */}
```

## Dropdown, popover, menu, select

Scales out of its trigger, not out of thin air.

```css
/* Base UI */
.popover {
  transform-origin: var(--transform-origin);
  transition: opacity 200ms var(--ease-out), transform 200ms var(--ease-out);
}

.popover[data-starting-style],
.popover[data-ending-style] { opacity: 0; transform: scale(0.95); }

/* Radix — data-[state] drives open/closed; forceMount keeps the element in DOM for exit animation */
.popover { transform-origin: var(--radix-popover-content-transform-origin); }
.menu    { transform-origin: var(--radix-dropdown-menu-content-transform-origin); }
.select  { transform-origin: var(--radix-select-content-transform-origin); } /* position="popper" only */
```

Radix components unmount on close by default. To animate exit, either add `forceMount` and drive state with `data-[state=open]` / `data-[state=closed]`, or wrap in `AnimatePresence`:

```tsx
{/* Radix with forceMount + CSS */}
<Popover.Content forceMount className="popover" />

{/* CSS for the Radix open/closed states */}
.popover[data-state=open]   { opacity: 1; transform: scale(1); }
.popover[data-state=closed] { opacity: 0; transform: scale(0.95); }
```

Vanilla CSS without a primitive — set `transform-origin` toward the trigger:

```css
/* menu anchored bottom-end of its trigger */
.menu { transform-origin: top right; }
```

## Tooltip

Same shape as a popover, faster, plus the detail most implementations miss.

```css
/* Base UI */
.tooltip {
  transform-origin: var(--transform-origin);
  transition: transform 125ms var(--ease-out), opacity 125ms var(--ease-out);
}

.tooltip[data-starting-style],
.tooltip[data-ending-style] { opacity: 0; transform: scale(0.97); }

/* Radix */
.tooltip { transform-origin: var(--radix-tooltip-content-transform-origin); }

/* Once one tooltip is open, neighbours open instantly */
.tooltip[data-instant] { transition-duration: 0ms; }
```

The initial delay prevents accidental activation. After that, skipping the delay and animation makes the whole toolbar feel faster.

## Modal

The one popover that stays centered.

```css
.modal {
  transform-origin: center; /* exempt — not anchored to a trigger */
  transition: opacity 250ms var(--ease-out), transform 250ms var(--ease-out);
}

.modal[data-starting-style],
.modal[data-ending-style] { opacity: 0; transform: scale(0.96); }

.backdrop { transition: opacity 250ms var(--ease-out); }
```

Animate the backdrop's opacity alongside it so they read as one surface.

## Drawer or sheet

```css
.drawer {
  transform: translateY(0);
}

@media (prefers-reduced-motion: no-preference) {
  .drawer {
    transition: transform 500ms var(--ease-drawer);
  }
}

.drawer[data-state=closed] { transform: translateY(100%); }
```

`translateY(100%)` is the element's own height, so the drawer hides itself at any size. Add drag and it becomes a gesture problem — see **Drag to dismiss**.

## Toast

```css
.toast {
  opacity: 1;
  transform: translateY(0);
}

@media (prefers-reduced-motion: no-preference) {
  .toast {
    transition: opacity 300ms var(--ease-out), transform 300ms var(--ease-out);
    @starting-style { opacity: 0; transform: translateY(100%); }
  }
}
```

Where `@starting-style` support is insufficient, fall back to a mount flag: `useEffect(() => setMounted(true), [])` plus `data-mounted={mounted}` on the element.

When toasts stack and the list reflows, the opacity change works against the height change. There is no formula for that pair; adjust until it settles.

## Accordion or collapse

```css
.content {
  overflow: hidden;
}

@media (prefers-reduced-motion: no-preference) {
  .content {
    transition: height 200ms var(--ease-out), opacity 200ms var(--ease-out);
  }
}
```

Keep it short. This is one of the few animations that costs layout every frame, so a long duration is expensive as well as sluggish. Measure content height in JS, or use a headless primitive that supplies it, rather than animating to `auto`.

## Stagger a list

For a list or grid the user sees occasionally — not one they scroll past all day. 30–80ms per item.

```css
@media (prefers-reduced-motion: no-preference) {
  .item {
    opacity: 0;
    transform: translateY(8px);
    animation: fadeIn 300ms var(--ease-out) forwards;
  }

  .item:nth-child(2) { animation-delay: 50ms; }
  .item:nth-child(3) { animation-delay: 100ms; }
  .item:nth-child(4) { animation-delay: 150ms; }

  @keyframes fadeIn { to { opacity: 1; transform: translateY(0); } }
}
```

Stagger is decorative — it must never block interaction while it plays.

## Stagger hero groups

For a staged entrance where sequence communicates hierarchy: a page hero's first load, a success state, an empty state. Split into semantic groups (title, description, buttons) and stagger at ~100ms per group. Combine `opacity`, `blur`, and `translateY`.

```css
@media (prefers-reduced-motion: no-preference) {
  .stagger-item {
    opacity: 0;
    transform: translateY(12px);
    filter: blur(4px);
    animation: fadeInUp 400ms var(--ease-out) forwards;
  }
  .stagger-item:nth-child(2) { animation-delay: 100ms; }
  .stagger-item:nth-child(3) { animation-delay: 200ms; }

  @keyframes fadeInUp { to { opacity: 1; transform: translateY(0); filter: blur(0); } }
}
```

```tsx
{/* Motion */}
const group = { hidden: { opacity: 0, y: 12, filter: "blur(4px)" },
                visible: { opacity: 1, y: 0, filter: "blur(0px)" } };

<motion.div initial="hidden" animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.1 } } }}>
  <motion.h1 variants={group}>Welcome</motion.h1>
  <motion.p variants={group}>A description of the page.</motion.p>
  <motion.div variants={group}><Button>Get started</Button></motion.div>
</motion.div>
```

For a title, splitting into individual words at ~80ms stagger is an option. Never stagger routine interactions such as row hovers, keystrokes, or repeated tab changes.

## Subtle exit

Exits are shorter and softer than enters. A fixed `-12px` at 150ms indicates direction without drama.

```css
@media (prefers-reduced-motion: no-preference) {
  .item-exit {
    opacity: 0;
    transform: translateY(-12px);
    transition: opacity 150ms var(--ease-out), transform 150ms var(--ease-out);
  }
}
```

```tsx
{/* Motion — ease array resolves to the skill curve, not the browser built-in */}
<motion.div exit={{ opacity: 0, y: -12, filter: "blur(4px)",
                    transition: { duration: 0.15, ease: [0.23, 1, 0.32, 1] } }}>
  {content}
</motion.div>
```

Where spatial context matters — a card returning to a list, a drawer closing — slide fully out instead: `x: "-100%"` at 200ms `var(--ease-out)`. Where motion adds no information, remove the element immediately.

Never exit with `translateY(-100%) scale(0.5)` over 400ms. A dramatic exit steals focus the user has already moved on from.

## Icon swap

Cross-fade with `opacity`, `scale`, and `blur` rather than toggling visibility. Values are exact: `scale` `0.25`→`1`, `opacity` `0`→`1`, `blur(4px)`→`blur(0px)`, `bounce` always `0`.

```css
/* CSS-first: keep both icons in the DOM and cross-fade */
.icon-wrap { position: relative; display: inline-flex; }
.icon-slot {
  transition: opacity 300ms cubic-bezier(0.2, 0, 0, 1),
              filter 300ms cubic-bezier(0.2, 0, 0, 1),
              scale 300ms cubic-bezier(0.2, 0, 0, 1);
}
.icon-slot.off { opacity: 0; scale: 0.25; filter: blur(4px); }
.icon-slot.on  { opacity: 1; scale: 1;    filter: blur(0px); }
.icon-slot.absolute { position: absolute; inset: 0; display: grid; place-items: center; }
```

```tsx
{/* Tailwind */}
const fade = "transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]";
const on = "scale-100 opacity-100 blur-0";
const off = "scale-[0.25] opacity-0 blur-[4px]";

<div className="relative inline-flex">
  <div className={cn("absolute inset-0 grid place-items-center", fade, isActive ? on : off)}>
    <ActiveIcon />
  </div>
  <div className={cn(fade, isActive ? off : on)}>
    <InactiveIcon />
  </div>
</div>
```

The non-absolute icon defines the layout size; the absolute one overlays it without affecting flow.

```tsx
{/* Motion */}
import { AnimatePresence, motion } from "motion/react"; // or "framer-motion"

<AnimatePresence initial={false} mode="popLayout">
  <motion.span
    key={isActive ? "active" : "inactive"}
    style={{ display: "inline-flex" }}
    initial={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
    animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
    exit={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
    transition={{ type: "spring", duration: 0.3, bounce: 0 }}
  >
    <Icon />
  </motion.span>
</AnimatePresence>
```

`initial={false}` stops the enter animation firing on first render. `inline-flex` prevents the wrapper from adding unexpected block layout.

Animate icons that appear on hover, change state (play → pause, like → liked), sit in contextual toolbars, or indicate loading and success. Do not animate static navigation icons, decorative icons, always-visible icons, or icon labels.

## Skip animation on page load

`initial={false}` on `AnimatePresence` stops enter animations firing on first render. The element animates on later state changes only.

```tsx
<AnimatePresence initial={false} mode="popLayout">
  {/* same children as the icon swap above */}
</AnimatePresence>
```

Right for icon swaps, toggles, tabs, and segmented controls — anything with a default state on page load.

It breaks where the component relies on `initial` for a first-time entrance, such as a staggered hero or a loading state. Removing that skips the whole entrance. Verify on a full page refresh before applying.

## Suppress transitions on theme switch

Flipping the theme changes `color`, `background-color`, `border-color`, and `box-shadow` on nearly every element at once. Everything carrying a transition on those properties animates together, so the switch reads as a slow smear.

Inject a stylesheet that disables every transition, force a reflow so the new colors commit while it still applies, then drop it on the next frame.

```tsx
"use client";
import { useEffect } from "react";

export function DisableThemeTransitions() {
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const style = document.createElement("style");
      style.append(document.createTextNode("*,*::before,*::after{transition:none !important}"));
      document.head.append(style);
      const _flushReflow = document.body.offsetHeight;
      requestAnimationFrame(() => requestAnimationFrame(() => style.remove()));
    };
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);
  return null;
}
```

`document.body.offsetHeight` is read for its side effect, forcing a synchronous style flush so the new theme resolves while the override is still in the document. The nested `requestAnimationFrame` removes the override only after that paint.

That covers the OS-level change. An in-app toggle needs the same sequence around its own flip: apply override, change theme, flush, remove. `next-themes` ships this as `disableTransitionOnChange`.

## Hold to confirm

For destructive actions where a plain click is too easy to fire by accident.

```css
.overlay {
  clip-path: inset(0 100% 0 0);
}

@media (prefers-reduced-motion: no-preference) {
  .overlay {
    transition: clip-path 200ms var(--ease-out); /* release: snappy */
  }
  .button:active .overlay {
    clip-path: inset(0 0 0 0);
    transition: clip-path 2s linear;             /* press: slow and deliberate */
  }
}
.button:active { scale: 0.96; }
```

`linear` is correct here — the fill is a progress indicator, and progress should not ease.

## Tab indicator with a color transition

Timing individual color transitions across a tab list never lands. Clip instead.

Duplicate the tab list and style the copy as the active state, with a different background and text color. Mark the copy `aria-hidden="true"` and `inert` — one semantic tab list only. Clip the copy so only the active tab shows, and animate the clip on change.

```css
.tabs-active-copy {
  clip-path: inset(0 60% 0 20%); /* driven by the active tab's position */
}

@media (prefers-reduced-motion: no-preference) {
  .tabs-active-copy {
    transition: clip-path 250ms var(--ease-in-out);
  }
}
```

Text and background change in perfect sync because they are one element being revealed, not two colors being interpolated.

## Scroll reveal

Marketing surfaces only. Never on functional UI a user visits daily.

```css
.reveal {
  clip-path: inset(0 0 100% 0);
}

@media (prefers-reduced-motion: no-preference) {
  .reveal {
    transition: clip-path 600ms var(--ease-in-out);
  }
  .reveal[data-visible] { clip-path: inset(0 0 0 0); }
}
```

Trigger with `IntersectionObserver`, or `useInView` with `{ once: true, margin: "-100px" }`. Fire it once — re-animating on every scroll-by is an interface fighting its reader.

## Drag to dismiss

Springs, not durations, because the user can reverse mid-motion.

```js
// Dismiss on a flick, not just on distance
const velocity = Math.abs(swipeAmount) / (Date.now() - dragStartTime.current);
if (Math.abs(swipeAmount) >= SWIPE_THRESHOLD || velocity > 0.11) dismiss();

// Set transform on the dragged element directly.
// Driving it through a CSS variable on the parent recalcs styles for every child.
element.style.transform = `translateY(${distance}px)`;
```

Four details that separate a good drag from a bad one:

- **Pointer capture** once the drag starts, so it continues when the pointer leaves the element's bounds.
- **Multi-touch protection** — `if (isDragging) return` on new touch points, or switching fingers mid-drag makes the element jump.
- **Damping past boundaries** — dragging beyond a natural edge moves the element less the further it goes.
- **Friction, not a wall** — allow the over-drag with rising resistance rather than refusing it.

Settle with a physics spring so an interrupted drag keeps its velocity:

```js
{ type: "spring", mass: 1, stiffness: 100, damping: 10 }
```

## Masking a crossfade that will not settle

When two states overlap visibly and no amount of easing or duration tuning fixes it, blur the seam.

```css
.content { transition: filter 200ms ease, opacity 200ms ease; }
.content.transitioning { filter: blur(2px); opacity: 0.7; }
```

Without blur the eye reads two distinct objects swapping. Blur blends them into one perceived transformation. Keep it under 20px — heavy blur is expensive, especially in Safari.

## Programmatic, without a library

When the motion needs JS control but not a dependency, WAAPI gives CSS-grade performance.

```js
element.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }],
  { duration: 1000, fill: 'forwards', easing: 'cubic-bezier(0.77, 0, 0.175, 1)' });
```

Hardware-accelerated, interruptible, no bundle cost.
