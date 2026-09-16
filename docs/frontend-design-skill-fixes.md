# frontend-design skill — fix round 1

Source: codex adversarial review + GREEN build test (2026-09-16). Skill at `claude-shared/skills/frontend-design/`. Brief at `docs/frontend-design-skill-brief.md`. Authoring conventions in the brief apply to every edit.

Line numbers below are from the review and may drift by a few lines. Search for the quoted text.

## Rulings (apply everywhere; these override the brief where they differ)

| Topic | Ruling |
| --- | --- |
| Reduced motion | Transitions and animations are gated behind `@media (prefers-reduced-motion: no-preference)`. Tailwind: `motion-safe:` prefix. Motion/WAAPI: `useReducedMotion()` / `matchMedia` branch. State changes are not motion and stay ungated: `:active { scale: 0.96 }`, color changes, `:focus-visible` ring. Under reduce, opacity and color may still transition. |
| Press | `scale(0.96)`; the *transition* (`150ms var(--ease-out)`) is gated, the transform is not. Motion: `whileTap={{ scale: 0.96 }} transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}`. Opt-out API is a `motion="static"` prop everywhere (CSS: `[data-motion="static"]`, shadcn: cva variant `motion: { default: "active:scale-[0.96]", static: "" }` wired through Button props). Drop every `<Button static>` / `static` prop mention. |
| Keyboard-initiated | Rule becomes: "Surfaces opened by keyboard shortcut appear instantly (`data-instant`); skip the enter animation." Press state feedback is exempt. |
| Duration budget | Most UI under `300ms`. Named exceptions: modal `200`–`300ms`, drawer/sheet up to `500ms` both directions with `--ease-drawer`. Toast enter `300ms`, exit `150ms`. List stagger total under `300ms`. State this once in `motion-standards.md`; SKILL.md says "under `300ms`; drawers and sheets up to `500ms`". Remove "slightly slower than typical UI". |
| Easing | Enter/exit/transform: `var(--ease-out)` (Motion array `[0.23, 1, 0.32, 1]`). Color/opacity-only: `ease`. Never the CSS keyword `ease-out` (Tailwind's default `ease-out` is `cubic-bezier(0, 0, 0.2, 1)`). Tailwind v4 projects register tokens once in `@theme { --ease-out: cubic-bezier(0.23, 1, 0.32, 1); --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1); --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1); }` so `ease-out` utilities resolve to the skill curve. Recipe lives in `motion-recipes.md`; `shadcn.md` links to it. |
| Exit | Exit shorter than enter, about `150ms`. Popovers, tooltips, modals reverse their entry transform. Elements leaving a stack (toasts, list rows) exit `translateY(-12px)`. Drawers and sheets exit along their axis. |
| Animatable properties | Prefer `transform` and `opacity`. Allowed with measurement (DevTools Performance, 4× CPU slowdown): `filter: blur()` for icon swaps, `clip-path` for reveals, `height` via `grid-template-rows` or `interpolate-size`, `box-shadow` on hover, colors. Drop the absolute "only". |
| `will-change` | Only `transform`, `opacity`, `filter`. `clip-path` only after a measured frame drop. Same wording in SKILL.md and `surfaces.md`. |
| Springs | Duration-based springs (`{ type: "spring", duration, bounce }`) have a fixed duration and do not carry velocity. Physics springs (`stiffness`, `damping`, `mass`) preserve velocity when a gesture interrupts. Use physics springs for gestures, duration springs for icon swaps and toggles. |
| Primitive lifecycle attrs | `data-starting-style`, `data-ending-style`, `data-instant`, `data-closed`, `var(--transform-origin)` are Base UI. Label blocks "Base UI". Radix: `data-[state=open]` / `data-[state=closed]`, `var(--radix-<component>-content-transform-origin)`, exit needs `forceMount` + `AnimatePresence` or `tw-animate-css` `animate-out` classes. Show one Radix block after the Base UI popover block; other components follow the same mapping. Vanilla CSS with no primitive: set `transform-origin` toward the trigger, e.g. `top right` for a menu anchored bottom-end of its trigger. |
| Radix Select | `--radix-select-content-transform-origin` exists only with `position="popper"`. Say so where the variable appears. |
| ARIA | Remove redundant or incorrect ARIA. Keep required names (`aria-label`), states (`aria-invalid`, `aria-expanded`), and live regions (`role="status"`). |
| Roving tabindex | One child has `tabindex="0"`, the rest `tabindex="-1"`; arrow keys move the `0`. Container focus + `aria-activedescendant` is the other strategy, described separately. |
| Focus indicator | Never `outline-none` / `outline: none` without a visible `:focus-visible` replacement in the same recipe. |
| Dialog | Native `<dialog>` with `showModal()` is the default recipe: gives focus trap, Escape, top layer, background inert. Library primitives own the trap. Hand-rolled trap only when neither is possible. Set `aria-labelledby` on the dialog. |
| Live regions | Never move focus to `role="status"`. Announce through it unfocused; move focus to the heading or container. |
| Submit button | Enabled until the request starts; disabled while pending. Same words in both places. |
| Radius (shadcn) | Inner radius = outer radius minus padding. Pick the closest token or use `rounded-[calc(var(--radius-lg)-8px)]`. A neighboring scale step is not a rule. |
| shadcn primitive edits | Primitives are project-owned source. Add variants, tokens and base-class changes in the component file. Keep diffs small so `npx shadcn diff` stays readable. Drop "never edit primitives". Remove `transition-all` from the base string example; keep `transition-[color,box-shadow,transform]`. |
| Tailwind config | CSS-first for new config. Keep a `@config`-loaded `tailwind.config.js` if the project has one. |
| Hover gating | Handwritten CSS: `@media (hover: hover) and (pointer: fine)`. Tailwind `hover:` already gates `(hover: hover)`; accept it. |
| `user-select: none` | On `button`, `[role="button"]` and gesture surfaces. Never on `a` or text content. |
| Typography values | One or two families; three is the ceiling. Body weight `400` or above; `300` only at display sizes (`≥ 24px`). Slop tell: `100`–`200` weights as luxury. Measure `45`–`75ch` body; `80` ceiling for any text. |
| WCAG large text | `≥ 24px`, or `≥ 18.67px` (`14pt`) bold. |
| Contrast symmetry | Reversing the same opaque pair keeps its WCAG ratio. Dark themes fail because the pair changes: tinted surfaces, alpha text, APCA polarity. |
| Grade | `font-variation-settings: "GRAD" 80`. Feature tags (`font-feature-settings`) and variation axes (`font-variation-settings`) are separate. |
| Compositor | Eligible animations (`transform`, `opacity`) *can* run on the compositor; measure for other properties. |
| Tokens in examples | Positive examples use role tokens (`var(--color-text-secondary)`, `text-muted-foreground`). Raw primitives (`bg-gray-300`, `text-zinc-500`, `var(--gray-3)`) only in explicitly marked bad examples. |
| Theme switch | Suppress transitions during a theme switch: set `data-theme-switching` on `<html>`, `[data-theme-switching] * { transition: none !important; }`, remove after two `requestAnimationFrame`s. Recipe in `color.md`. |
| Tooltip | Show on `:hover` (gated) and on `:focus-visible`. Tooltip content must be dismissible (Escape), hoverable, and persistent (WCAG 1.4.13). Trigger keeps `aria-label`. |
| Duplicate tab list | The clipped copy is `aria-hidden="true"` and `inert`. One semantic tab list only. |
| Coverage gaps | Add rows to `accessibility.md` for: text-spacing override survives (`line-height 1.5`, `letter-spacing 0.12em`, `word-spacing 0.16em`, paragraph `2em`), pointer alternative for every drag, tooltip dismissible/hoverable/persistent. |

## Authoring fixes (all files)

- Sentences ≤ 30 words; split known offenders: SKILL.md "Where it leaves an axis open"; `aesthetic-direction.md` "Template chrome regardless of subject"; `accessibility.md` "Pair every color cue".
- Delete motivation prose: "Mismatched nested radii are the most common thing…", "Perceived speed is real speed", "Nothing in the real world appears from nothing", "Instant feedback that the interface heard the user".
- Reference headings state the rule: "Use custom easing tokens", "Match icon stroke to text weight", not "Easing", "Icons".
- Duplicated rule text between SKILL.md and a reference: keep in SKILL.md, reference keeps only recipe/example/exception. Known: line-heights, "No single accented word", writing examples ("Save changes", "Delete project", 8-character password, "Click here", ON-state labels), motion frequency table + easing decision list + token block (SKILL.md keeps table and tokens; `motion-standards.md` keeps recipe-level detail only), aesthetic grounding sentence.
- Recipe order: CSS, then Tailwind, then Motion. Icon swap recipe needs a plain-CSS version first.
- `ch`: approximation based on the zero glyph; verify with real text.
- `.section` and `.cta` are both class selectors; fix the specificity example (use source order or an element vs class pair).
- `typography.md` "measure with `better-colors` and classify with `better-accessibility`" → link `color.md` and `accessibility.md`.
- `shadcn.md` install commands → replace with links: https://ui.shadcn.com/docs/skills and https://ui.shadcn.com/docs/mcp.

## Per-file work

### SKILL.md
- Lines ~156–172 motion: keep frequency table, easing token block, duration line "under `300ms`; drawers and sheets up to `500ms`". Remove the easing decision list if it duplicates `motion-standards.md` (keep one line + link).
- ~163 keyboard rule → ruling wording.
- ~177 durations + exit → rulings.
- ~181 opt-out → `motion="static"`.
- ~185 springs → ruling.
- ~197 properties → ruling wording. ~148 `will-change` → ruling wording.
- ~205 ARIA → ruling. ~209 outline rule stays. ~213 dialog → native `<dialog>` first. ~221 submit → ruling wording. ~225 hover gate note about Tailwind.
- ~128 radius: drop motivation sentence.
- ~68, 76 typography → ruling values. ~72, 92 line-heights: SKILL.md keeps; reference drops.
- ~104 tokens line stays; ensure no primitive in SKILL.md examples.
- ~261 "Never edit primitives" → ownership wording.
- ~24 grounding: keep here; reference replaces its copy with an example.
- ~32 split long sentence.
- Before-you-finish table: add rows for text-spacing, drag alternative, tooltip persistence if missing; update `transition-all` row wording to match shadcn fix.

### references/motion-standards.md + references/motion-recipes.md
- All HIGH/MEDIUM motion items above: reduced-motion gating on every transition/animation snippet (`motion-safe:` in Tailwind, `useReducedMotion` in Motion), hover example inside combined query, easing drift (`ease` → `var(--ease-out)`, `"easeOut"` → array), Motion press tween, exit rules, durations (toast, drawer, list), springs, Base UI/Radix labeling + Radix block, vanilla `transform-origin` fallback, Select popper note, icon recipe `initial={false}` + `inline-flex` + CSS-first order, `@theme` easing token recipe, compositor wording, duplicate tab list `aria-hidden` + `inert`, `data-instant` keyboard rule.
- Remove duplicated frequency table / easing decision list / token definitions (SKILL.md owns). Keep recipe detail.
- Headings state rules. Delete motivation lines.

### references/accessibility.md + references/typography.md + references/color.md
- accessibility: roving tabindex (~38), `role="status"` focus (~49), dialog recipe → native `<dialog>` + primitive note (~53–55, ~206), ARIA wording (~93, 113, 156–162), submit wording (~101, 211), duplicate tab list note if present, coverage rows (text spacing, drag alternative, tooltip), tooltip `:focus-visible`, split "Pair every color cue".
- typography: `outline-none` input recipe (~136–140) gets `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` or drops `outline-none`; values (~15, 17) → ruling; hand-off line (~153); `ease-out` literal on underline (~174) → `ease` (color) ; `user-select` wording (~240, 314, 332) → ruling; GRAD (~192, 214); `ch` (~92); primitives in positive examples (~136, 173–176) → role tokens; drop duplicated line-heights (~78–82) and "no single accented word" if duplicated from SKILL.md.
- color: WCAG bold threshold (~145–146); contrast symmetry (~194); primitive `var(--color-gray-1000)` (~67) → role token; add theme-switch suppression recipe in the switching section.

### references/shadcn.md + references/surfaces.md + references/mobile.md + references/aesthetic-direction.md + references/writing.md
- shadcn: `motion` cva variant wired through Button props (~31, 40–42); drop `transition-all` (~35–36, 194); radius nesting (~93–100, 195) → calc ruling; `duration-*`/`ease-*` claim (~70) → "utilities set both transition and, via `tw-animate-css` shared vars, animation timing"; primitives ownership (~13–15, 27, 192); `tailwind.config.js` (~177) → ruling; hover gate note (~185); Select popper (~51) stays; `zoom-out-95` exit → add `duration-150` for exit (~65–70); reduced motion: `motion-safe:` on the press class (~35–36); install commands (~7) → links; easing tokens → link to `motion-recipes.md` `@theme` recipe.
- surfaces: hover examples inside `@media (hover: hover) and (pointer: fine)` (~102, 166); primitives in positive examples (~165–173) → role tokens; `will-change` policy (~233–238) → ruling; `clip-path` blur note (~100) → allowed-with-measurement wording; headings (~23, 150, 210) state rules; remove radius motivation sentence if present.
- mobile: `user-select` baseline (~159–165, 232–235) → `button, [role="button"]` only; press/transition snippets (~34–38, 103–109) gated per ruling; primitives (~36, 108) → role tokens.
- aesthetic-direction: grounding sentence (~7) → replace with a concrete example; weights (~15, 19) → ruling; measure line → "80 ceiling"; split "Template chrome regardless of subject" (~45); selector example (~62); drop duplicated "single accented word" tell if SKILL.md has it (keep the tell list, SKILL.md keeps the rule).
- writing: keep only examples not already in SKILL.md (~15–20, 37–39, 48–49, 60–61, 69–73); primitive (~87) → role token.

## Done criteria per implementer

- Every item in your file group addressed or listed as "skipped: reason" in your report.
- `grep -n "ease-out" <file>` shows only `var(--ease-out)`, `--ease-out:` definitions, or `ease-out` Tailwind utility with the `@theme` recipe present or linked.
- No `static` prop mentions; opt-out is `motion="static"`.
- No positive example with `gray-`, `zinc-`, `slate-`, `blue-600`, `--gray-` primitives.
- Report: file, items fixed, items skipped with reason, line count before/after.
