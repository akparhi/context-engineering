# hindsight

Hindsight turns in-session corrections into persistent Claude Code rules. When you correct Claude mid-session, it calls `record` to queue the correction as a candidate. Later — in the same session or a later one — Claude calls `distill` to compose a refined lesson set and `apply` to write it to `.claude/rules/`. Claude Code then loads those rule files natively on its own, with no extra wiring required.

## How it works

The design has three seams:

**Record.** When Claude makes a mistake and you correct it, Claude calls `hindsight__record` with the mistake, the correction, a distilled rule, a trigger phrase, and the files touched. The candidate is appended to `.claude/hindsight/candidates.jsonl` and stays there until distilled.

**Distill and apply.** To fold pending candidates into lessons, run `/hindsight-distill` or ask Claude to distill. Claude calls `hindsight__distill`, which returns the current lesson set and all pending candidates as a prompt — nothing is written yet. Claude composes a replacement lesson set and calls `hindsight__apply`, which validates the set, writes it atomically to `.claude/rules/`, moves quarantined candidates aside, and clears the queue. Distillation is never automatic: nothing is written unless the model explicitly calls `apply`.

**Native loading.** Claude Code loads `.claude/rules/` natively. `hindsight.md` carries no frontmatter so it loads every session. `hindsight-<area>.md` files carry a `paths:` glob in their frontmatter so Claude Code loads them only when a matching file is in context. A lesson about your API layer costs zero context tokens in a session that never touches the API. Cross-cutting lessons load every session, which is why that file is capped most tightly.

## File layout

```
.claude/
  hindsight/           # untracked working state — add to .gitignore
    candidates.jsonl   # pending corrections waiting to be distilled
    quarantine.jsonl   # candidates set aside for a second occurrence
    distill.log        # log from the last apply call
  rules/               # committed lessons, loaded natively by Claude Code
    hindsight.md                  # cross-cutting lessons (no frontmatter)
    hindsight-<area>.md           # area-scoped lessons (paths: glob frontmatter)
```

Commit `.claude/rules/` so lessons persist across machines. Keep `.claude/hindsight/` out of git — it is transient state local to the working directory.

## Caps

| Scope | Limit |
|---|---|
| Cross-cutting lessons | 7 |
| Lessons per area file | 12 |
| Area files | 5 |

When a proposed set exceeds a cap, the oldest entries — ranked by the `@date` annotation Claude embeds in each lesson — are dropped first. Over-cap sets are capped, not rejected.

## Distilling

Run `/hindsight-distill` or ask Claude to distill when you want to fold pending candidates into lessons. Claude will call `distill` (read-only — it returns instructions and the current state), compose a replacement lesson set, and call `apply` to write it.

Nothing is written automatically. If there are no pending candidates, distill returns the current lesson set with no changes needed.

## Hand-editing lessons

You can edit `.claude/rules/hindsight.md` and `.claude/rules/hindsight-<area>.md` directly. Edits are preserved between distillations, but any bullet may still be merged, reworded, or evicted the next time Claude distills. To permanently drop a lesson, delete its bullet from the file. To drop a pending candidate before it becomes a lesson, use the `remove` tool: ask Claude to remove the candidate by index (use `list` to see pending candidates with their indices).

## Quarantine

A candidate is quarantined when it lacks a concrete trigger — the `trigger` field is vague or missing, which makes the lesson too general to be useful. Quarantined candidates are moved to `quarantine.jsonl` and need a second occurrence (a new candidate with a matching trigger) before they are promoted to a lesson.
