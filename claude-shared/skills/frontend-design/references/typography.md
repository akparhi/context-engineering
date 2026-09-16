<!-- Adapted from Jakub Krehel skills (MIT). See NOTICE.md -->

Typography rules for web interfaces: values, recipes, and checks covering sizing, spacing, loading, wrapping, and accessibility.

## Serve the right format

| Format | Use |
| --- | --- |
| `.woff2` | Production web — Brotli compression, broad support |
| `.woff` | Fallback for very old browsers only |
| `.ttf` / `.otf` | Desktop only; no web compression |

## Fewer fonts, sizes, and weights

Rarely use more than three typefaces. Pair for contrast, not similarity — serif headline over a sans body reads as deliberate; two near-identical sans-serifs read as a mistake.

Below `24px`, stay at weight `400` or heavier. Weights `100`–`300` are display-only at `24px`+; strokes disappear at text sizes and on low-DPI screens.

Apply the product's type system; never introduce a new face to satisfy a checklist. When a change is requested, use the system stack or a commercial face with a safe fallback stack.

```css
html { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
html { font-family: "Helvetica Now", "Helvetica Neue", Arial, sans-serif; }
```

**Anatomy** — why two fonts at the same `font-size` look different sizes:

| Term | Meaning |
| --- | --- |
| x-height | Height of a lowercase `x` |
| Cap height | Height of uppercase letters |
| Baseline | The invisible line letters sit on |
| Ascender | Part of a letter rising above the x-height |
| Descender | Part dropping below the baseline |

## Use a type scale with semantic names

Define a small set of sizes and deviate from it as little as possible. On a team, name sizes by role (`text-body-sm`), not dimension (`text-sm`) — the rules survive other people.

**Role-based scale (starting point):**

| Role | Size | Line-height | Weight |
| --- | --- | --- | --- |
| Display | `2.25rem` (36px) | `1.1` | `600` |
| Title | `1.5rem` (24px) | `1.2` | `600` |
| Heading | `1.125rem` (18px) | `1.3` | `600` |
| Body | `1rem` (16px) | `1.5` | `400` |
| Caption | `0.8125rem` (13px) | `1.4` | `400` |

Emphasis within a role is one weight step up (`400` → `500`), not a size change.

```css
:root {
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.5rem;
  --text-2xl: 2rem;
}
```

Tailwind's built-in scale (`text-xs` through `text-9xl`) is a solid ready-made choice — each class pairs a size with a matching line-height.

## Heading sizes descend with level

Map heading levels to descending scale steps. A child heading never overpowers its parent. Adjacent levels may share a size at the small end of the scale as long as weight or letter-spacing keeps them distinct.

```css
h1 { font-size: var(--text-2xl); }
h2 { font-size: var(--text-xl); }
h3 { font-size: var(--text-lg); }
```

Never pick a heading element for its browser-default size — choose semantics first, then set size in CSS.

## Letter-spacing by size

Large headings often look better with slightly negative letter-spacing. Small uppercase labels need a little positive spacing or the letters feel crowded. Body copy at reading sizes needs neither.

## Cap the measure

Aim for 60–75 characters per line in long-form text. `65ch` is an approximation based on the zero-glyph advance width; verify with real body text. `max-w-xl` (576px) and `max-w-2xl` (672px) both land in range at a 16px body size.

## Wrap deliberately

| Property | Use |
| --- | --- |
| `text-wrap: balance` | Headings — distributes text evenly across lines |
| `text-wrap: pretty` | Descriptions — avoids a single short word on the final line |
| `overflow-wrap: break-word` | Containers where long words, links, or IDs could escape |
| `white-space: nowrap` | Labels and badges where a line break looks broken |

Skip `balance` and `pretty` in long-form text; browsers ignore `balance` past a few lines. Use `text-align: start`; reserve `justify` for specific editorial layouts.

**Smart punctuation:**

| Instead of | Use |
| --- | --- |
| Straight quotes `"..."` | Curly quotes (keep straight in code) |
| Hyphen in ranges | En dash: `2010–2020` |
| Two hyphens for an aside | Em dash character |
| Three periods `...` | Ellipsis `…` |
| Space in `16 px` | `&nbsp;` — prevents the value from breaking |
| Uncontrolled word breaks | `&shy;` to mark soft hyphenation points |

## Tabular numbers on changing values

Digits have different widths by default — timers, counters, and prices shift the layout as values update. Apply `font-variant-numeric: tabular-nums` to any value that changes.

## Truncate without losing content

Single line: `text-overflow: ellipsis` + `overflow: hidden` + `white-space: nowrap`. Multiple lines: `line-clamp`. When the hidden text matters, keep it reachable in a tooltip or expanded view.

## Inputs at 16px on mobile

iOS Safari zooms the page when an input is smaller than `16px`. Two fixes — choose based on design:

- **Size up on mobile:** `text-base sm:text-sm`. Renders at 16px on small screens, drops to design size from `sm` up.
- **Scale down:** keep `font-size: 16px`, render the intended size with `transform: scale()`, compensate width and `line-height`.

```tsx
{/* Size-up approach */}
<input className="text-base sm:text-sm" type="email" />

{/* Scale-down approach — 13px from a 16px base: 13/16 = 0.8125 */}
<div className="flex h-10 items-center rounded-[10px] bg-input px-2.5">
  <input
    className="h-full w-[calc(100%/0.8125)] origin-left scale-[0.8125] bg-transparent text-base leading-[calc(1.125/0.8125)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-full sm:scale-100 sm:text-[13px]"
    type="email"
  />
</div>
```

## Size and contrast floors

| Text | Size |
| --- | --- |
| Long-form body | `~16px`, verified in the actual typeface and measure |
| Inputs and menus | `~14px` |
| Captions | `13px` |
| Floor | Rarely below `12px` |

When text looks low-contrast, measure and classify per `color.md` and `accessibility.md`. Leave colors alone unless asked.

## Underlines from the font

Default underlines sit wherever the browser decides. Pull position and thickness from the font's own metrics:

```css
a {
  text-underline-position: from-font;
  text-decoration-thickness: from-font;
}
```

Tune manually when needed:

```css
a {
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  text-decoration-skip-ink: auto;
  text-decoration-color: var(--color-text-secondary);
  transition: text-decoration-color 200ms ease;
}
a:hover { text-decoration-color: var(--color-text-primary); }
```

`text-decoration-style: dotted` signals a word carries extra information (abbreviation, defined term). Color is the only part that animates reliably — for other effects, build the underline as a separate element.

## Properties over axis tags

Use CSS properties first; reserve raw tags for custom axes and niche features with no property.

| Instead of | Use |
| --- | --- |
| `font-variation-settings: "wght" 650` | `font-weight: 650` |
| `font-feature-settings: "opsz" auto` | `font-optical-sizing: auto` |
| `font-feature-settings: "tnum" 1` | `font-variant-numeric: tabular-nums` |
| `font-feature-settings: "zero" 1` | `font-variant-numeric: slashed-zero` |

Reserve `font-feature-settings` for tags with no property — e.g. `"ss01" 1`. `GRAD` is a variation axis: use `font-variation-settings: "GRAD" 80`.

## Load intended weights and styles

Browsers synthesize missing weights or styles, distorting the real face. Load every face the design uses.

`font-synthesis: none` disables weight, style, small-cap, superscript, and subscript synthesis together — it erases distinctions when the real face is unavailable. Verify the full fallback stack and every emphasis state before setting it. Prefer the specific longhands (`font-synthesis-weight`, `font-synthesis-style`) over the blanket shorthand for body and UI text.

**Static vs variable:**
- Static: one weight and style per file. Regular + medium + bold = three files.
- Variable: a whole range in one file. Any value works — `font-weight: 589`.

At one or two weights, static files can be smaller. At several weights, optical sizes, or custom axes, a variable font usually wins.

**Common axes:**

| Axis | Property | Typical range |
| --- | --- | --- |
| `wght` | `font-weight` | 100–900 |
| `wdth` | `font-stretch` | 75%–125% |
| `opsz` | `font-optical-sizing` | 8–144 |
| `ital` | `font-style: italic` | 0–1 |
| `GRAD` | `font-variation-settings: "GRAD" 80` | −200–150 |

**OpenType feature tags:**

| Tag | Feature |
| --- | --- |
| `tnum` | Tabular numbers — every digit the same width |
| `zero` | Slashed zero — `0` distinct from `O` |
| `liga` | Ligatures — joins pairs like "fi" into one shape |
| `ss01`–`ss20` | Stylistic sets (what each slot does varies by font) |
| `cv01`–`cv99` | Character variants (what each slot does varies by font) |

## Font smoothing on the root

On macOS, text renders heavier than intended. Apply once on the root layout, never per component. Tailwind's `antialiased` covers both.

```css
html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
```

## Language and bidi behavior

A paragraph of 3+ lines aligns to its own script — use `text-align: start` with the correct `lang`/`dir` on the element. Never reorder digits manually; the Unicode bidi algorithm handles it. Wrap mixed number and text values in `<bdi>` where adjacent RTL text disturbs them.

## Keep useful text selectable

Text is selectable by default — keep it that way. `::selection` can carry brand as long as the selected combination stays legible. `user-select: none` belongs on `button`, `[role="button"]`, and gesture surfaces only — never on `<a>` or text content.

## Text trimming with text-box

Fonts reserve space above and below letters, making text sit slightly low in buttons and badges. `text-box` trims it. Two parts: which edges (`trim-both`, `trim-start`, `trim-end`) and where (`cap`, `alphabetic`, `text`).

```css
/* Trim top and bottom */
.badge { text-box: trim-both cap alphabetic; }

/* Trim only the top */
.heading { text-box: trim-start cap; }
```

Supported in Chromium 133+ and Safari 18.2+, not yet Firefox — treat as progressive enhancement.

## CSS → Tailwind cheat sheet

### Font

| Declaration | What it does | Tailwind |
| --- | --- | --- |
| `font-family: sans-serif` | The sans family | `font-sans` |
| `font-family: serif` | The serif family | `font-serif` |
| `font-family: monospace` | The monospace family | `font-mono` |
| `font-size` | Size from the type scale | `text-*` |
| `font-weight` | Any value from 1 to 1000 | `font-*` |
| `font-style: italic` | Switch to italic style | `italic` |
| `-webkit-font-smoothing` + `-moz-osx-font-smoothing` | Smooth macOS font rendering; apply once at root | `antialiased` |
| `font-synthesis: none` | Disable synthesized forms after verifying fallbacks | `[font-synthesis:none]` |
| `font-feature-settings` | Toggle OpenType features | `[font-feature-settings:"ss01"]` |
| `font-variation-settings` | Tune variable font axes | `[font-variation-settings:"GRAD"_80]` |
| `font-optical-sizing` | Adjust details per size | `[font-optical-sizing:auto]` |
| `font-variant-caps` | Real small capitals | `[font-variant-caps:small-caps]` |
| `font-variant-position` | Real super and subscripts | `[font-variant-position:super]` |
| `font-variant-numeric: tabular-nums` | Equal-width digits | `tabular-nums` |
| `font-variant-numeric: slashed-zero` | Tell 0 from O | `slashed-zero` |

### Spacing and layout

| Declaration | What it does | Tailwind |
| --- | --- | --- |
| `letter-spacing` | Space between letters | `tracking-*` |
| `line-height` | Space between lines | `leading-*` |
| `font-kerning` | Kerning on or off | `[font-kerning:none]` |
| `text-box: trim-both` | Trim space above and below | `[text-box:trim-both_cap_alphabetic]` |
| `max-width` on text columns | Cap at ~60–75 characters per line | `max-w-xl` / `max-w-2xl` / `max-w-[65ch]` |
| `text-align` | Where lines start and end | `text-start` / `text-center` |

### Wrapping and overflow

| Declaration | What it does | Tailwind |
| --- | --- | --- |
| `text-wrap: balance` | Even out heading lines | `text-balance` |
| `text-wrap: pretty` | Avoid orphaned words | `text-pretty` |
| `text-overflow: ellipsis` | Ellipsis for clipped text | `truncate` |
| `line-clamp` | Cut off after N lines | `line-clamp-*` |
| `overflow-wrap: break-word` | Break long strings | `break-words` |
| `white-space: nowrap` | Stop wrapping | `whitespace-nowrap` |
| `text-transform` | Change the casing | `uppercase` / `capitalize` |

### Decoration and interaction

| Declaration | What it does | Tailwind |
| --- | --- | --- |
| `text-decoration-line: underline` | Draw an underline | `underline` |
| `text-decoration-color` | Underline color | `decoration-*` |
| `text-decoration-thickness` | Underline thickness | `decoration-1` / `decoration-2` |
| `text-underline-offset` | Push the line down | `underline-offset-*` |
| `text-underline-position: from-font` | Underline position from the font | `[text-underline-position:from-font]` |
| `text-decoration-style` | Dotted, dashed, or wavy | `decoration-dotted` / `decoration-wavy` |
| `text-decoration-thickness: from-font` | Underline set by the font | `decoration-from-font` |
| `text-decoration-skip-ink` | Gaps around descenders | `[text-decoration-skip-ink:auto]` |
| `caret-color` | Tint the text cursor | `caret-*` |
| `user-select: none` | Suppress selection on `button`, `[role="button"]`, gesture surfaces only | `select-none` |
| `text-shadow` | Shadow behind the letters | `text-shadow-*` |
| `-webkit-text-stroke` | Outline the letters | `[-webkit-text-stroke:1px_black]` |
| `background-clip: text` | Clip a background to the letters | `bg-clip-text` |
| `initial-letter` | Size a drop cap | `[initial-letter:3]` |

## Before you finish

| Mistake | Fix |
| --- | --- |
| Synthesized face differs from the design | Load the real face; disable only the verified synthesis mode |
| Child heading visually overpowers its parent | Map that section's hierarchy to descending scale steps |
| Heading element picked for its default size | Choose semantics first, then set the size in CSS |
| Orphan on the last line of a paragraph | `text-wrap: pretty` |
| Lopsided two-line heading | `text-wrap: balance` |
| Justified text in an interface | `text-align: start`; reserve justify for specific editorial layouts |
| Underline cuts through descenders | `text-decoration-skip-ink: auto`, `from-font` metrics |
| Mixed-direction value renders in the wrong order | Correct `lang`/`dir`; isolate the value with `<bdi>` |
| Selection disabled across application chrome | Restore it; suppress only where it conflicts with a drag or gesture |
| Extra-info hint with no visual cue | Dotted underline via `text-decoration-style: dotted` |
| Thin/Light weight on `14px` UI text | Weight `400`+ below `18px`; thin weights are display-only |
| `leading-none` on a three-line card description | At least `1.4` on any text that wraps to 3+ lines |
