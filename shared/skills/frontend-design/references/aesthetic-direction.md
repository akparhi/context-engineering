<!-- Adapted from Anthropic frontend-design plugin (Apache-2.0). See NOTICE.md -->

Aesthetic direction: subject grounding, anti-slop tells, two-pass process, and copy standards.

## Ground the design in the subject

Identify what the product is, who it is for, and its primary job before designing anything. If the brief omits any of these, propose one concrete answer for each and confirm. The subject's industry, materials, and vernacular are where distinctive choices come from. Build with real content and real vocabulary throughout.

## Hero opens with the subject's most characteristic thing

The hero is the first thing a viewer sees. Open with the single most characteristic element of the subject's world: a headline, an image, an animation, a live demo, or an interactive moment. A big number with a small label, supporting stats, and a gradient accent is the generic default; use it only if it is genuinely the best fit.

## Typography carries personality

Use one typeface family or two. If two, make them clearly distinct in kind, not just weight. Choose deliberately for this brief, not by reflex.

Set a clear type scale with intentional weights, widths, and spacing. When type functions as a headline or visual element, treat it as an active design element, not a neutral container.

Default line length: less than 80 characters. Serif body can run slightly longer. Serif body text needs slightly more line-height than a sans-serif equivalent.

## Structure encodes information

Structural devices (borders, numbering, eyebrows, dividers) should communicate something about the content, not decorate it. Use numbered markers (01 / 02 / 03) only when the content is an actual sequence: a stepped process or a timeline. Check before adding them.

## Motion: one orchestrated moment beats scattered effects

Limit non-user-triggered motion to one deliberate moment: a single page-load sequence or a single reveal. Fade-and-slide-up entrances on every section and hover transitions on every card are the generic default and read as generated. Motion that responds to a user action (opening, expanding, confirming) is welcome when it shows what changed.

## Five AI-default clusters to avoid when the brief leaves the axis free

These patterns are legitimate for some briefs. The rule: when the brief pins down a direction, follow it. When it leaves an axis free, do not spend that freedom on one of these defaults.

1. Warm cream background near `#F4F1EA`, high-contrast serif display, terracotta or clay accent near `#D97757`.
2. Near-black background with a single bright acid-green or vermilion accent.
3. Broadsheet layout: hairline rules, zero border-radius, dense newspaper columns.
4. SaaS card kit: identical rounded cards, one border-radius on every element, the same soft grey shadow (`rgba(0,0,0,.1)`) under each, gradient washes as decoration.
5. Template chrome regardless of subject:
   - tracked-out ALL-CAPS eyebrow above every heading
   - meta strings joined with middle dots (A · B · C)
   - labels as `WORD — fragment` with a spaced em dash
   - tinted near-black (`#0B0B0B`, `#111`) standing in for black
   - monospace face on small data labels
   - `→` appended to every link and button

## Two-pass process: plan then build

**Pass 1: plan.** Draft a compact token system before touching code.

- Color: 4-6 named hex values as the core palette.
- Type: typefaces and their roles.
- Layout: one-sentence prose concept plus an ASCII wireframe; include alignment guidance (left, center, or justified).
- Principles: what makes this page specific to this brief.

**Review before building.** Check whether any part of the plan reads like the generic output for any similar brief. If so, revise that part and state what changed and why. Only then write code.

**Pass 2: build and critique.** Follow the revised plan. Take a screenshot if the environment supports it. Cut any decoration that does not serve the brief.

## CSS specificity caution

Selectors can cancel each other silently. A class selector `.section` and a class selector `.cta` have equal specificity — source order decides. Use an element-versus-class pair (e.g. `section` vs `.cta`) or rely on source order deliberately. Check specificity before assuming a rule applies.

## Restraint and the quality floor

Spend boldness in one place. Let one element be the memorable thing; keep everything else quiet. The quality floor is non-negotiable and unannounced: responsive to mobile, visible keyboard focus, reduced motion respected, accessible contrast, harmonious palette.

## Before you finish

| Mistake | Fix |
| --- | --- |
| Single accented word in a headline | Rewrite so the full line carries the weight |
| All-caps labels | Sentence case |
| Label above content that already names itself | Remove the label |
| Numbered markers on non-sequential content | Replace with a structural device that fits (border, indent, icon) |
| Cream + clay palette when brief is silent on color | Choose a palette from the subject's vernacular |
| Near-black + acid accent when brief is silent on color | Same |
| `rgba(0,0,0,.1)` shadow on every card | Vary elevation or remove shadow where hierarchy does not need it |
| ALL-CAPS eyebrow above every heading | Remove or convert to sentence-case context line |
| `→` on every button and link | Remove; reserve for explicit directional actions |
| Monospace on every data label | Use monospace only where tabular alignment matters |
| Scattered fade-slide-up on every section | Collapse to one orchestrated reveal |
| Big number + gradient in hero by default | Choose the opener that fits the subject |
