---
name: frontend-design
description: Use when building, restyling or reviewing web UI. Pages, components, dashboards, marketing sites, design systems, or any request that a screen should look or feel better. Covers direction, layout, type, color, surfaces, motion, accessibility, copy, mobile, and shadcn projects.
---

<!-- Compiled from Emil Kowalski skills (MIT), Jakub Krehel skills (MIT) and the Anthropic frontend-design plugin (Apache-2.0). See NOTICE.md -->

# Frontend design

Rules and exact values for interfaces that look designed and feel right. Read the section for the task at hand, then open the linked reference for the recipe.

Every duration, curve, scale, radius and color below is a specific value, not a range to approximate. `0.96` is not `0.95`. Use what is written. Where a project already has tokens, a component library or a motion language, keep it and apply these rules through it.

Write every fix in the project's styling system. Recipes show CSS first, then Tailwind, then Motion where the pattern differs. For a motion library, read `package.json` and match the import path found (`motion/react` or `framer-motion`).

Read [references/shadcn.md](references/shadcn.md) when `components.json` exists in the project or the user names shadcn.

## Workflow

1. Ground: name subject, audience, primary job. Read the project's tokens, styling system and `package.json`.
2. Plan: write the compact design plan, review it against the brief, revise any generic choice. See Aesthetic direction.
3. Build: apply each section below in the project's styling system, opening the linked reference for the recipe.
4. Check: run the `## Before you finish` table over the diff. Fix every hit.
5. Report: for reviews, use `## Reporting`. For builds, list what was verified and what was not.

## Aesthetic direction

Decide what the thing is before deciding how it looks. Details in [references/aesthetic-direction.md](references/aesthetic-direction.md).

### Ground the design in the subject

Name the subject, the audience and the primary job before designing. If the brief lacks them, propose one concrete set and confirm. The subject's industry, materials and vernacular are where distinctive choices come from.

### Plan, then review the plan, then build

First pass is a compact plan: 4–6 named hex values, typefaces with roles, a one-sentence layout concept with an ASCII wireframe, alignment, and the principle that makes this page unique. Second pass reviews that plan against the brief. Any part that would appear for any similar brief gets revised, and the change is stated. Only then write code.

### Never spend a free axis on a default

Where the brief pins a look, follow it exactly. Where it leaves an axis open, avoid the generic clusters. Cream `#F4F1EA` with a serif and clay `#D97757`. Near-black with one acid accent. Broadsheet hairlines at zero radius. The identical-rounded-card kit with `rgba(0,0,0,.1)` shadows. Template chrome: all-caps eyebrows, middle-dot meta, trailing `→`.

### One bold element

Let one element carry the memorable idea and keep everything around it quiet. Build to the quality floor without announcing it: responsive to mobile, visible keyboard focus, reduced motion honored, accessible contrast.

## Layout

Position, spacing and alignment carry hierarchy before a word is read. Recipes in [references/layout.md](references/layout.md).

### Group with space, not lines

Space first, background shapes second, separator lines last. The gap between groups is at least 2× the gap within one: `8px` intra-group to `16px`+ inter-group.

### Align to shared edges

Pick alignment edges and hold them. One spacing step per level of subordination, `16px` default. Use logical properties (`padding-inline-start`, `margin-inline-end`); reserve physical left and right for physical geometry.

### Keep controls distinct from content

Every interactive element gets a background shape, a border, or a consistent placement zone. Without an established density system, start at `12px` between bordered controls and `24px` around borderless text or icon controls.

### Content bleeds, controls float

Backgrounds and media extend to the viewport edges. Controls and text stay inside layout margins and `env(safe-area-inset-*)`. Full-width buttons in content layouts sit inside the margins with a visible radius, `16px` inline on mobile.

### Hold structure until it breaks

Breakpoints come from content, not device presets. Prefer container queries for component-level adaptation. Translated strings grow, so no fixed width or height on a text container.

## Typography

Restraint: a sensible scale, comfortable spacing, enough contrast. Recipes and the CSS→Tailwind cheat sheet in [references/typography.md](references/typography.md).

### Fewer fonts, sizes and weights

One or two families, clearly distinct if two; three is the ceiling. Weight and size define hierarchy. Body weight is `400` or above. Weight `300` is display-only, at `24px` or larger. Weights `100`–`200` read as slop, not luxury.

### Line-height by role

Headings around `1.1`. Body `1.5`–`1.6`. Anything wrapping to three or more lines needs at least `1.4`. Unitless values only.

### Cap the measure

Body measure `45`–`75ch`, with `80` the ceiling for any text. `ch` approximates the zero glyph, so verify with real text. Large headings take slightly negative letter-spacing; small uppercase labels take slightly positive.

### Wrap deliberately

`text-wrap: balance` on headings, `text-wrap: pretty` on descriptions, `overflow-wrap: break-word` where an ID or URL could escape, `white-space: nowrap` on labels and badges. Skip `balance` and `pretty` in long-form text.

### Tabular numbers on changing values

`font-variant-numeric: tabular-nums` on timers, counters, prices, any value that updates. Prefer CSS properties over raw feature tags.

### Size floors

Body text starts at `16px`. UI text `14px` for inputs and menus, `13px` captions, rarely below `12px`. Inputs are `16px` on mobile or iOS zooms the page.

### Avoid the generated-page tells

No single accented word in a headline. No all-caps labels by default. No label above content that the content already explains.

## Color

A color system is a small set of ramps, named by role, verified on the backgrounds they render on. Never report a contrast value you did not measure. Recipes in [references/color.md](references/color.md).

### A system is ramps, not colors

One neutral ramp, one accent ramp, only the status ramps the product renders. Each step exists because a role consumes it. For a new system `oklch()` is the default; in an existing system keep its notation.

### Name primitives by hue, semantics by role

Primitives (`--blue-500`) are never applied in a component. Semantic tokens (`--color-text-secondary`) point at primitives and are the only tier components use. Never borrow a token outside its role; add the missing role instead.

### Hold the hue across the ramp

Steps step evenly in perceived lightness, hue stays constant, vividness peaks mid-ramp, steps sit denser at the light end. Both ends stop short of pure black and white. Use a color library, not eyeballing.

### One color, one meaning

Anything within `15°` of hue is the same color. If the accent means interactive, it never appears on static text. Fill exactly one primary action per view; peers stay neutral.

### Dark mode is not a reversal

Reverse as a starting point, then reduce vividness, widen the dark end and remeasure every pair. Pick one switching mechanism (`prefers-color-scheme` or a class) and use it throughout.

### Gradients pick an interpolation space

`in oklab` is the default. `in oklch` when a two-hue gradient goes gray in the middle.

## Surfaces

Radius, depth, outlines and icons. Recipes in [references/surfaces.md](references/surfaces.md).

### Concentric border radius

Outer radius = inner radius + padding. Inner radius = outer radius − padding. Past `24px` of padding treat the layers as separate surfaces.

### Optical over geometric alignment

Icon-side padding = text-side padding − `2px`. Nudge play triangles and asymmetric glyphs, preferably in the SVG itself.

### Shadows for elevation, borders for structure

Where a border exists only for depth, replace it with layered transparent `box-shadow` (three layers light, one white ring dark). Keep borders on dividers, table cells, form inputs and focus states.

### Image outlines

`1px` outline, `oklch(0 0 0 / 0.1)` light, `oklch(1 0 0 / 0.1)` dark, `outline-offset: -1px`. Never a tinted neutral from the palette.

### Icons carry the text's weight

Stroke `1.5px` beside weight 400, `2px` beside 600. One stroke weight per set, one library per surface. `currentColor` with state from CSS; outline default, fill marks active.

### `will-change` sparingly

Only `transform`, `opacity`, `filter`. Add `clip-path` only after a measured frame drop. Add when first-frame stutter is observed, never pre-emptively, never `all`.

## Motion

Four decisions, in order: should it animate at all; what purpose it serves; which easing; how fast. Values in [references/motion-standards.md](references/motion-standards.md), build patterns in [references/motion-recipes.md](references/motion-recipes.md).

### Should it animate at all

| Seen | Decision |
| --- | --- |
| 100+ times a day (shortcuts, command palette) | No animation |
| Tens of times a day (hover, list navigation) | Instant feedback or ≤`150ms` opacity/color |
| Occasionally (modals, drawers, toasts) | Standard animation |
| Rarely (onboarding, success, empty states) | Can add delight |

Surfaces opened by keyboard shortcut appear instantly (`data-instant`); skip the enter animation. Press state feedback is exempt. Every animation names a purpose: spatial consistency, state indication, feedback, or preventing a jarring change. Motion is never the only feedback channel.

### Use custom easing tokens

Enter, exit and transform use `var(--ease-out)`; in Motion, the array `[0.23, 1, 0.32, 1]`. Color-only and opacity-only transitions use `ease`. Never the CSS keyword `ease-out`, which is a weaker curve. Full decision list in [references/motion-standards.md](references/motion-standards.md).

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
```

Tailwind v4 projects register these in `@theme` once so `ease-out` utilities resolve to this curve. Recipe in [references/motion-recipes.md](references/motion-recipes.md).

### Duration

Press `100`–`160ms`. Tooltips `125`–`200ms`. Dropdowns `150`–`250ms`. Modals `200`–`300ms`. UI stays under `300ms`; drawers and sheets go up to `500ms`.

### Exits are shorter than enters

About `150ms`. Popovers, tooltips and modals reverse their entry transform. Elements leaving a stack, such as toasts and list rows, exit `translateY(-12px)`. Drawers and sheets exit along their axis.

### Physicality

Never `scale(0)`; enter from `0.95`–`0.97` with `opacity: 0`. Popovers scale from their trigger via the primitive's transform-origin variable; modals stay centered. Press is `scale(0.96)` with a `150ms var(--ease-out)` transition. The opt-out is a `motion="static"` prop.

### Interruptible by default

CSS transitions for interactive state, keyframes only for one-shot sequences. Physics springs (`stiffness`, `damping`, `mass`) preserve velocity when a gesture interrupts, so use them for gestures. Duration springs (`{ type: "spring", duration, bounce }`) have a fixed duration and carry no velocity; use them for icon swaps and toggles. `@starting-style` for entry without JS.

### Icon swaps and staged entrances

Icon swap: scale `0.25→1`, opacity `0→1`, blur `4px→0`. Stagger list items `30`–`80ms`; stagger hero groups `~100ms` with opacity, blur and `translateY`. `initial={false}` on `AnimatePresence` so page load does not replay state animations.

### Gestures

Dismiss on velocity `> 0.11 px/ms`, not distance alone. Set `transform` directly on the dragged element, never a CSS variable on the parent. Pointer capture, multi-touch guard, damping past boundaries.

### Performance

Prefer `transform` and `opacity`; these can run on the compositor. Other properties are allowed once measured in the Performance panel at 4× CPU slowdown. Those are `filter: blur()` for icon swaps, `clip-path` for reveals, `height` via `grid-template-rows` or `interpolate-size`, `box-shadow` on hover, and colors. Name transition properties; never `transition: all`. Motion shorthand `x`/`y`/`scale` is not hardware-accelerated; pass a `transform` string. CSS survives main-thread load where rAF-driven motion drops frames. Suppress transitions during a theme switch; recipe in [references/color.md](references/color.md).

## Accessibility

Most accessibility is free if you use the platform. Recipes in [references/accessibility.md](references/accessibility.md).

### Native elements first

`<button>` for actions, `<a href>` for navigation, never `<div onClick>`. Remove redundant or incorrect ARIA. Keep required names (`aria-label`), states (`aria-invalid`, `aria-expanded`) and live regions (`role="status"`).

### Visible focus rings

Style `:focus-visible`, at least `2px` solid, verified against every adjacent color. Never `outline: none` without a verified replacement.

### Full keyboard support

Escape closes, arrows move within composites, Tab moves between them. `tabindex` is `0` or `-1` only. In a composite, one child holds `tabindex="0"` and the rest `tabindex="-1"`; arrow keys move the `0`.

### Native `<dialog>` for modals

`showModal()` gives a focus trap, Escape, the top layer and an inert background. Library primitives own the trap where the project uses them. Hand-roll a trap only when neither is possible. Set `aria-labelledby` on the dialog and return focus to the trigger.

### Minimum hit area

`24×24` CSS px floor. Aim `44×44` on touch, `40×40` desktop. Extend with a pseudo-element; never let extended areas overlap.

### Label and announce

Every input has a `<label>`; a placeholder is never a label. Errors set `aria-invalid`, point `aria-describedby` at the message, focus the first invalid field. Submit stays enabled until the request starts, then is disabled while pending. Icon-only buttons need `aria-label`. Never move focus to a `role="status"` region; announce through it unfocused and move focus to the heading or container.

### Reduced motion and touch

Transitions and animations are gated behind `@media (prefers-reduced-motion: no-preference)`, or `motion-safe:` in Tailwind. State changes are not motion and stay ungated: `:active { scale: 0.96 }`, color changes, the `:focus-visible` ring. Under reduce, opacity and color may still transition. Gate hover in handwritten CSS behind `@media (hover: hover) and (pointer: fine)`; Tailwind's `hover:` already gates `(hover: hover)` and is fine as-is.

### Survive zoom

Works at 200% zoom and 320px width without horizontal scroll. `min-height` not `height` on text containers. Never cap viewport zoom.

## Writing

Clear and brief beats clever. Recipes in [references/writing.md](references/writing.md).

### One voice, tone by stakes

Read nearby copy first and keep its terms. Warm for success and onboarding, neutral for routine, calm and plain for errors, serious for data loss.

### Verb-first buttons, consistent flow words

"Save changes", not "Submit". A confirmation repeats the consequence: "Delete project" / "Cancel". One vocabulary per flow: pick "Continue" or "Next".

### Errors say how to fix, next to where it broke

"Choose a password with at least 8 characters", not "Password too short". No blame, no "oops". Empty states say what this place is and offer one next action.

### Sentence case, plain words

One capitalization policy per element type. Toggles describe the ON state. Links describe their destination; never "Click here".

## Mobile

A web app feels installed or embedded on a handful of declarations. Symptom table and fixes in [references/mobile.md](references/mobile.md).

Ship this floor before the first component: `viewport-fit=cover`, `theme-color` per scheme, `-webkit-tap-highlight-color: transparent`, `overscroll-behavior: none` on `html`, `16px` inputs, `touch-action: manipulation` on tappables, hover rules gated. Use `100dvh` for app shells and `100svh` for heroes, never `100vh`. Never `user-scalable=no`. Test on hardware; emulation reproduces none of these.

## Working in shadcn projects

The official shadcn skill and MCP own install, CLI, registries and `components.json`. This skill owns how the rules above land in a shadcn codebase. Read [references/shadcn.md](references/shadcn.md) for the mapping.

`components/ui/*` primitives are project-owned source. Add variants, tokens and base-class changes in the component file, keeping diffs small so `npx shadcn diff` stays readable. Only semantic tokens in components. Radix owns focus trapping and ARIA. Check the registry through MCP before hand-rolling anything. Use CSS-first config for new Tailwind config; keep a `@config`-loaded `tailwind.config.js` where the project has one.

## Before you finish

| Mistake | Fix |
| --- | --- |
| Design that would fit any brief | Revise the plan against the subject; state what changed |
| Cream + serif + clay, or the rounded-card kit | Choose for this brief; see aesthetic-direction.md tells |
| Same radius on nested surfaces | Outer = inner + padding |
| Border used for depth | Layered transparent shadow; keep dividers as borders |
| `transition: all` | Name the properties, as in `transition-[color,box-shadow,transform]` |
| `scale(0)` entry | `scale(0.95)` + `opacity: 0` |
| CSS keyword `ease-out`, or `ease-in` on UI | `var(--ease-out)` token |
| Enter animation on a keyboard-opened surface | `data-instant`; skip the enter animation |
| Duration over `300ms` on UI | `150`–`250ms`; drawers and sheets may reach `500ms` |
| Popover scales from center | Primitive's transform-origin variable |
| Ungated `:hover` in handwritten CSS | `@media (hover: hover) and (pointer: fine)` |
| Transition or animation with no reduced-motion gate | `no-preference` query or `motion-safe:` |
| `outline: none` on focus | `:focus-visible` ring ≥`2px` in the same recipe |
| Hand-rolled focus trap | Native `<dialog>` with `showModal()`, or the primitive |
| Focus moved into `role="status"` | Announce unfocused; focus the heading |
| Placeholder as the only label | Visible `<label>` |
| Text-spacing override breaks the layout | Survive `line-height 1.5`, `letter-spacing 0.12em`, `word-spacing 0.16em`, paragraph `2em` |
| Drag with no pointer alternative | Add a click or keyboard path to the same action |
| Tooltip vanishes on hover-out or ignores Escape | Dismissible, hoverable, persistent (WCAG 1.4.13) |
| Two semantic copies of one tab list | Clipped copy gets `aria-hidden="true"` and `inert` |
| Raw hex or palette utility in a component | Semantic token; add the role if missing |
| Dark mode by reversing the palette | Reduce vividness, widen the dark end, remeasure |
| Icons off-center | Optical nudge or fix the SVG |
| Changing number shifts layout | `tabular-nums` |
| `100vh` app shell | `100dvh` |
| Hand-rolled component the registry ships | Use MCP; install and extend |

## Reporting

When asked to review rather than build, report in this shape.

**Severity.** `HIGH` blocks a task, hides content from assistive technology, makes text unreadable, or leaves a state change visible only while an animation runs. `MEDIUM` is a visible inconsistency in hierarchy, tokens, surfaces or motion. `LOW` is isolated polish.

**Verification.** Without a browser: every state the component defines, computed sizes and tokens, durations and easings read from code. With one: walk each state, resize to the smallest supported width, toggle both themes, replay motion at 10% speed in the Animations panel. Report every check you could not run as `Not verified`.

**Format.** Group findings under the principle each violates, ordered by severity, one row per root cause listing every location it appears in:

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |

`Location` is `path/to/file:line`. `Why` names the principle and the user impact.

End with `Block` when any `HIGH` remains, `Approve` otherwise. Never `Approve` coverage you did not inspect. With nothing to report, state "No actionable findings" and report verification.
