# frontend-design master skill — build brief

Target: `claude-shared/skills/frontend-design/` (symlinked to `~/.claude/skills/`). Overwrites the current 43-line SKILL.md.

## Sources (cloned at /tmp/skillprobe)

| Source | Path | License |
| --- | --- | --- |
| Emil Kowalski, `skills` | `/tmp/skillprobe/emil/skills/*` | MIT |
| Jakub Krehel, `skills` | `/tmp/skillprobe/jakub/skills/*` | MIT |
| Anthropic, `frontend-design` plugin | `/Users/akparhi/.claude/plugins/marketplaces/claude-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md` | Apache-2.0 |
| shadcn/ui docs | https://ui.shadcn.com (skills, mcp, theming, components.json) | — |

## Architecture decision

Jakub's architecture and voice are the base. Emil contributes content (motion, gestures, performance, mobile). Anthropic contributes aesthetic direction. shadcn is one reference, loaded only when the project uses shadcn.

```
frontend-design/
  SKILL.md                    ~350L index. Principle + exact value + one link per section.
  NOTICE.md                   attribution: MIT texts (Emil, Jakub), Apache-2.0 notice (Anthropic)
  references/
    aesthetic-direction.md    Anthropic plugin body: subject grounding, slop tells, plan→critique, copy
    layout.md                 Jakub better-layout SKILL + grouping-and-alignment + spacing-and-adaptivity
    typography.md             Jakub better-typography SKILL + 6 refs, condensed
    color.md                  Jakub better-colors SKILL + 6 refs, condensed
    surfaces.md               Jakub better-ui surfaces.md + icons.md + performance.md (will-change)
    motion-standards.md       Emil review-animations/STANDARDS.md, values reconciled (below)
    motion-recipes.md         Emil animate/RECIPES.md + Jakub enter-exit.md, icon-transitions.md, animations.md
    accessibility.md          Jakub better-accessibility SKILL + 6 refs + Emil reduced-motion/hover gating
    writing.md                Jakub better-writing SKILL
    mobile.md                 Emil mobile-native: hard rules, symptom table, fixes 1–11, baseline, never-ship
    shadcn.md                 NEW. Mapping of this skill's rules onto shadcn/Radix/Tailwind v4 conventions
```

## SKILL.md section order (build sequence)

1. Opener: two sentences, what it is and does. Calibration line: every value is exact, use what is written. Load rule: read `references/shadcn.md` when `components.json` exists or the user names shadcn.
2. Aesthetic direction
3. Layout
4. Typography
5. Color
6. Surfaces
7. Motion (opens with Emil's decision framework: should it animate → purpose → easing → duration)
8. Accessibility
9. Writing
10. Mobile
11. Working in shadcn projects
12. Before you finish (merged detection→fix table)
13. Reporting (severity ladder, verification, findings table, Block/Approve)

## Value rulings (apply everywhere, no side-by-side alternatives)

| Value | Ruling |
| --- | --- |
| Press scale | `0.96`; transition `150ms var(--ease-out)` gated behind reduced-motion, transform ungated. Opt out with `motion="static"` |
| Easing tokens | `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`, `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)` |
| Icon swap | scale `0.25→1`, opacity `0→1`, blur `4px→0`, spring `{ type: "spring", duration: 0.3, bounce: 0 }`; CSS fallback `cubic-bezier(0.2, 0, 0, 1)` |
| Entry scale | never `scale(0)`; start `0.95`–`0.97` + `opacity: 0` |
| Stagger | 30–80ms per list item; ~100ms per semantic group in a hero |
| Exit | shorter than enter, ~150ms `var(--ease-out)`. Popovers/tooltips/modals reverse entry transform; stack items (toasts, rows) `translateY(-12px)`; drawers along their axis |
| Durations | UI under 300ms: press 100–160, tooltip 125–200, dropdown 150–250, modal 200–300, toast enter 300/exit 150. Exception: drawer/sheet up to 500 with `--ease-drawer` |
| Reduced motion | transitions/animations opt-in via `@media (prefers-reduced-motion: no-preference)` (Tailwind `motion-safe:`, Motion `useReducedMotion`). State changes (`:active` scale, color, focus ring) ungated. Under reduce keep opacity/color |
| Hover gating | CSS `@media (hover: hover) and (pointer: fine)`; Tailwind `hover:` accepted as-is |
| Hit area | 24×24 AA floor; 44×44 touch, 40×40 desktop |
| Focus ring | `:focus-visible`, ≥`2px` solid, never `outline: none` without replacement |
| Image outline | `oklch(0 0 0 / 0.1)` light, `oklch(1 0 0 / 0.1)` dark, `outline-offset: -1px` |
| Icon stroke | `1.5px` beside weight 400, `2px` beside 600 |
| Concentric radius | outer = inner + padding; past 24px padding treat as separate surfaces |

## Authoring conventions (from Jakub AGENTS.md, adopted)

- Headings carry the point, sentence case: `Native elements first`, not `Semantics`.
- Principle states rule and exact value. Recipe lives in the reference. Never both.
- Each rule stated once across the whole skill.
- No motivation prose. A sentence that is not an instruction, a fact, or a number is cut.
- Sentences ≤30 words (code span counts as one word).
- Framework-agnostic: match the project's styling system. Where a recipe differs, show CSS first, then Tailwind, then Motion.
- Motion library: read `package.json`; `motion` or `framer-motion`, match the import path found.
- No canned "I'm ready" opener. No author names in body. Attribution only in `NOTICE.md` and an HTML comment at the top of each file: `<!-- Adapted from <source> (MIT/Apache-2.0). See NOTICE.md -->`.
- Each reference opens with one scope line, then sections. Reference files may end with a `## Before you finish` table where the domain has recurring mistakes.

## Dropped, on purpose

- Emil: Initial Response, Core Philosophy prose, Sonner library principles 1–6, "review next day", Vercel anecdote (keep the fact: CSS animations survive main-thread load, rAF-driven ones drop frames).
- Jakub: verb skills (`break`, `variant`, `explain-interface`, `interface-review`), per-skill Reporting triplication, ownership hand-off lines (single skill now).
- shadcn: CLI usage, registry authoring, `components.json` schema, install. Official shadcn skill + MCP own these. `shadcn.md` links to them.

## Stale-content fixes

- `import { useSpring } from 'framer-motion'` → check `package.json`; modern package is `motion` (`import { useSpring } from 'motion/react'`).
- Emil's `var(--transform-origin)` is Base UI. Radix equivalent: `var(--radix-<component>-content-transform-origin)`. Show both, keyed to which primitive the project uses.

Round-1 review rulings that supersede rows above: `docs/frontend-design-skill-fixes.md`.
