<!-- Adapted from Jakub Krehel skills (MIT). See NOTICE.md -->

Color system rules: ramp structure, token tiers, usage constraints, contrast, gradients, dark mode, gamut, and switching mechanism.

## Match the project's color system

Reuse the project's tokens and notation. A second representation added to fix one value makes the palette harder to reason about. A consistent hex system beats hex with `oklch()` scattered through it.

For a new system, `oklch()` is the best default: its numbers behave the way the ramp rules below describe. Everywhere else, a color library produces the same ramp in the project's notation.

| Notation | Good for | Weakness |
| --- | --- | --- |
| Hex | Universal support, compact, what design tools hand you | Opaque; no channel is readable or editable by hand |
| `rgb()` | Same reach as hex, readable alpha | Channels do not correspond to anything a designer thinks about |
| `hsl()` | Channels look like design controls | Lightness is not perceptual; hue drifts; ramps built by varying it bunch at one end |
| `oklch()` | Perceptually uniform lightness, stable hue, predictable ramps | Baseline 2023; very old browser matrices need a fallback |

```css
oklch(L C H)          /* lightness 0–1, chroma 0–~0.4, hue 0–360 */
oklch(L C H / alpha)  /* alpha uses a slash, never a comma */
```

## A system is ramps, not colors

One neutral ramp, one accent ramp, and only the status ramps the product actually renders. A `warning` ramp nothing imports is maintenance for zero pixels. A second accent hue earns its place only when two things must be distinguishable at a glance.

## Well-formed ramps

Four properties define a correct ramp:

- Steps advance evenly in *perceived* lightness, not in whatever the format calls lightness.
- Hue stays constant end to end.
- Vividness peaks mid-ramp and falls off at both ends.
- Steps sit denser at the light end than at the dark end.

Both ends stop short of pure black and white, which cannot carry hue. Use a color library rather than eyeballing it.

Additional checks: no two adjacent steps are indistinguishable on a calibrated screen; the light end stops short of pure white so `50` and `100` read as two surfaces.

**Several hues at once:** match perceived lightness step-for-step across ramps, and match vividness relatively (same proportion of each hue's own maximum), not absolutely. Yellows and cyans peak far lower than reds and blues; copying a saturation number across hues leaves one washed out.

## Every step has a job

A ramp is not a gradient to pick from by eye. Each step exists because a role needs it. Generate only the steps a role consumes.

| Role | Tailwind | Radix |
| --- | --- | --- |
| Page background | `50` | `1` |
| Subtle background | `50` | `2` |
| Component background | `100` | `3` |
| Component hover | `200` | `4` |
| Component active / selected | `200` | `5` |
| Subtle border | `200` | `6` |
| Border, separator | `300` | `7` |
| Strong border, focus ring | `400` | `8` |
| Solid fill | `500` | `9` |
| Solid fill hover | `600` | `10` |
| Low-contrast text | `700` | `11` |
| High-contrast text | `900` | `12` |

Radix defines steps by role: step 9 is "the solid fill" in both appearances, so component CSS never changes. Tailwind defines steps by lightness: the mapping above holds in light mode and inverts in dark. For a new system, prefer Radix's model; on Tailwind, put the role mapping in the semantic tier.

Tailwind's 11 steps cover 12 roles, so some do double duty. Where the table repeats a step, the two roles are adjacent in practice — a design that needs subtle border and component hover to be distinguishable needs a 12-step ramp.

## Name primitives by hue, semantics by role

Primitives name a value (`--blue-500`) and are never applied in a component. Semantic tokens name a job (`--color-text-secondary`), point at a primitive, and are the only tier components reference. That seam is what makes theming possible.

```css
:root {
  /* Tier 1: primitives, named by appearance. Never used directly. */
  --blue-500: #3b82f6;
  --neutral-200: #e5e7eb;
  --neutral-700: #374151;

  /* Tier 2: semantics, named by role. Components reference this tier. */
  --color-accent-solid: var(--blue-500);
  --color-border: var(--neutral-200);
  --color-text-secondary: var(--neutral-700);
}
```

A codebase applying `--blue-500` directly has no theming seam. Adding one later means auditing every usage to work out which meant "the accent" and which just wanted blue.

Add a component-level tier (`--color-button-danger-bg`) only where a component genuinely diverges from the system. One component token is a documented exception; twenty mean the semantic tier is missing roles.

**Role inventory** — a system is complete when every role below has a token:

| Group | Roles |
| --- | --- |
| Surfaces | page background, surface, raised (menus, popovers), sunken (inputs, wells), overlay scrim |
| Text | primary, secondary, disabled, inverse, on-accent |
| Borders | subtle, default, strong, focus ring, separator |
| Accent | subtle background, border, solid, solid hover, text |
| Status | per status: subtle background, border, solid, text |

Separator and border are separate roles even when they share a value today. They diverge the first time someone restyles inputs.

**Anti-patterns:**

| Name | Problem | Instead |
| --- | --- | --- |
| `--color-blue-button` | Appearance at the semantic tier; lies when the brand changes | `--color-accent-solid` |
| `--color-sidebar-gray` | Named for first use; the second usage makes it nonsense | `--color-bg-surface` |
| `--color-light-gray` | Lies in dark mode | `--neutral-200` as a primitive |
| `--color-text-2` | Numbered semantics carry no meaning | `--color-text-secondary` |
| `--color-gray-hover` | Mixes a hue with a state; belongs to no tier | `--color-bg-surface-hover` |
| `--blue-500` in a component | Skips the semantic tier | Point a semantic token at it |

Reserve `accent` for the brand; let `primary` mean "most prominent of its group."

## Use a token only in its role

Apply a semantic token only for the role it names. `--color-text-secondary` is muted foreground text. Use it as a background and every future theme change that assumes the role breaks.

## One color, one meaning

Use a color for one purpose across the whole interface, treating anything within 15° of hue as the same color. If the accent means interactive, that hue on static text tells users to click something that is not clickable. An interactive element rendered neutral misleads just as badly. Color is never the only carrier of meaning — pair it with an icon, label, or shape.

## Fill exactly one action per view

When filled color encodes primary emphasis, one primary action gets it and peers stay neutral. Put the color on the background, not the label. A filled button reads as primary; accent-colored text on a neutral button reads as a link.

Several colored backgrounds are fine when they encode distinct states or categories rather than competing as peers. Selected states (active tab, checked segment) may use the accent — state is not emphasis.

## Measure the rendered pair

Measure the actual rendered foreground/background pair, not a static color value. `color-mix()`, `light-dark()`, and relative color syntax compute at render time.

**APCA thresholds (recommended for design decisions):**

| Content type | Minimum | Preferred |
| --- | --- | --- |
| Body text (blocks of text) | Lc 75 | Lc 90 |
| Non-body text (labels, headlines) | Lc 60 | Lc 75 |
| Large text (≥36 px) | Lc 45 | Lc 60 |
| UI components | Lc 30 | — |

Lc is signed: positive = dark on light, negative = light on dark. Compare the absolute value. The floor for a non-text element to be discernible is Lc 15.

**WCAG 2 thresholds (for legal compliance):**

| Content type | AA | AAA |
| --- | --- | --- |
| Normal text (<24 px / <18.67 px bold) | 4.5:1 | 7:1 |
| Large text (≥24 px / ≥18.67 px (14pt) bold) | 3:1 | 4.5:1 |
| UI components and graphical objects | 3:1 | — |

When a project must claim WCAG conformance, WCAG is the gate and APCA is the tiebreaker for anything above it. Fix failing pairs by changing lightness — that is the channel contrast responds to.

## Pick a gradient's interpolation space

The space is a look, not a correctness setting.

```css
/* sRGB: the default. Midpoint darkens and mutes. */
background: linear-gradient(#3b82f6, #ec4899);

/* oklab: even brightness. The best default. */
background: linear-gradient(in oklab, #3b82f6, #ec4899);

/* oklch: travels around the hue wheel, staying vivid. */
background: linear-gradient(in oklch, #3b82f6, #ec4899);
```

`oklab` and sRGB are rectangular (straight line through the color space). `oklch` is polar (interpolates the hue angle), so it routes through every hue between the stops — vivid but potentially surprising. A blue-to-pink gradient routes through purple.

The gray dead zone is a rectangular-space problem: two complementary hues sit either side of the neutral axis; a straight line passes near gray. Either switch to a polar space or add a third stop.

With `oklch` you control direction:

```css
background: linear-gradient(in oklch shorter hue, #3b82f6, #ec4899);
background: linear-gradient(in oklch longer hue, #3b82f6, #ec4899);
```

Keep text off gradients where you can — contrast varies continuously. Where text must sit on a gradient, measure the worst region, not the average.

## Dark mode is not a reversal

A dark palette is not the light one reversed. Reversal is the starting point, not the output.

Swap the semantic roles first:

```css
:root { --color-bg: var(--brand-50); --color-text: var(--brand-950); }
.dark { --color-bg: var(--brand-950); --color-text: var(--brand-50); }
```

Three things almost always need hand-tuning after the swap:

- **Vividness comes down.** A color that reads confident on white reads neon on near-black; dark appearances need the accent a step or two less vivid.
- **The dark end needs more separation.** Steps distinguishable as pale backgrounds collapse as dark surfaces.
- **Contrast does not survive the mirror.** Reversing the same opaque pair keeps its WCAG ratio. Dark themes change the pair: tinted surfaces, alpha text, APCA polarity. Recheck every foreground against its real background in both appearances.

For increased contrast, widen the foreground/background gap by at least 15 points of perceived lightness, then re-verify against APCA's preferred thresholds (Lc 90 body, Lc 75 non-body).

## P3 with sRGB fallback

Every sRGB color exists in Display P3, but not the reverse. Generate ramps against sRGB unless the product is display-restricted, then add P3 as an enhancement:

```css
.accent { background: #3b82f6; }

@media (color-gamut: p3) {
  .accent { background: oklch(0.62 0.24 259); }
}
```

Order matters: the sRGB value comes first so every display gets something; the P3 rule overrides only where it will render. A P3 color with no fallback fails — it does not degrade gracefully.

## Pick one switching mechanism

Pick one and use it throughout. Mixing mechanisms (media query setting some tokens, a class setting others) gives a half-themed interface the moment a user overrides their system preference.

- **`prefers-color-scheme` alone** — correct when there is no theme toggle.
- **A `.dark` class** — required as soon as users can override the system setting; the media query then sets only the initial value.
- **`light-dark()`** — collapses both values into one declaration; requires `color-scheme` to be set; a class-based toggle must also set that property.

```css
:root {
  color-scheme: light dark;
  --color-bg: light-dark(#ffffff, #172554);
}
```

### Suppress transitions on theme switch

Applying a new theme class triggers all CSS transitions, flashing intermediate colors. Suppress them during the switch:

```css
[data-theme-switching] * { transition: none !important; }
```

```js
function applyTheme(next) {
  document.documentElement.dataset.themeSwitching = '';
  document.documentElement.dataset.theme = next;
  // Remove after two frames — one to apply the class, one to paint.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      delete document.documentElement.dataset.themeSwitching;
    });
  });
}
```

## Before you finish

| Mistake | Fix |
| --- | --- |
| A raw value where the project has a token | Reuse or add the role token, in the project's notation |
| An isolated `oklch()` value dropped into a hex codebase | Keep the established notation unless a migration is in scope |
| A primitive like `--blue-500` used directly in a component | Point a semantic token at it |
| Token named for its appearance (`--color-blue-button`) or first use (`--color-sidebar-gray`) | Name it for its role: `--color-accent-solid`, `--color-bg-surface` |
| `--color-primary` meaning the brand and `--color-text-primary` meaning body text | Reserve `accent` for the brand; let `primary` mean "most prominent of its group" |
| Semantic token used outside its role (separator as text) | Add a token for the missing role; never borrow by value |
| Ramp built by varying HSL lightness | Rebuild against perceived lightness with a constant hue |
| Ramp spaced evenly across the full range | Tighten the light end until `50` and `100` read as two surfaces |
| Same saturation number reused across hues | Match the proportion of each hue's own maximum, not the raw value |
| Status hue that collides with the accent hue | Move it until destructive and primary read apart side by side |
| Dark mode made by mechanically reversing the light palette | Reverse as a starting point, then reduce vividness, widen the dark end, and recheck every pair |
| `prefers-color-scheme` setting some tokens and a `.dark` class setting others | Pick one switching mechanism and use it throughout |
| Contrast fixed by changing hue | Change lightness — that is the channel contrast responds to |
| P3 color with no sRGB fallback | Declare the sRGB value first, then override inside `@media (color-gamut: p3)` |
