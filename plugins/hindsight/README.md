# hindsight

> **Setup:** Before using the plugin, install its Node.js dependencies inside `plugins/hindsight/` with `bun install --frozen-lockfile` or `npm ci`. The MCP server will not start until dependencies are present; without this step `record`, `distill`, and `apply` will not exist even after the plugin is registered.

Hindsight turns in-session corrections into persistent Claude Code rules. When you correct Claude mid-session, it calls `record` to queue the correction as a candidate. Later — in the same session or a later one — Claude calls `distill` to compose a refined lesson set and `apply` to write it to `.claude/rules/`. Claude Code then loads those rule files natively on its own, with no extra wiring required.

## How it works

The design has three seams:

**Record.** When Claude makes a mistake and you correct it, Claude calls `hindsight__record` with the mistake, the correction, a distilled rule, a trigger phrase, and the files touched. The candidate is appended to `.claude/hindsight/candidates.jsonl` and stays there until distilled.

**Distill and apply.** After recording a correction, Claude folds it in on its own: it calls `hindsight__distill`, composes a replacement lesson set, and calls `hindsight__apply`, which validates the set, writes it atomically to `.claude/rules/`, moves quarantined candidates aside, and clears the queue. Claude then reports what changed in one line. You can also trigger this on demand with `/hindsight-distill`. Nothing is written unless the model explicitly calls `apply`.

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

After recording a correction, Claude folds the candidates in without being asked. It calls `distill` (read-only — it returns the current state), composes a refined lesson set, and calls `apply` to write it, then reports what changed in one line. You can also trigger this on demand with `/hindsight-distill`.

Claude asks first only in three cases: when a candidate contradicts an existing lesson, when it would add a new cross-cutting lesson, or when Claude can state a trigger but is not confident it is the right one. Everything else is applied and reported in one line. Nothing is written unless the model explicitly calls `apply`.

When one of those three cases arises, Claude raises the confirmation at the end of the turn — batched with the turn summary — rather than interrupting work mid-task. A candidate that is neither applied nor confirmed within 24 hours is dropped from the queue at the next session start; the drop is keyed on each candidate's `recorded_at` timestamp. Dropping is not a loss: if the mistake recurs it gets recorded again, and recurrence is the signal that it was worth keeping.

## Hand-editing lessons

You can edit `.claude/rules/hindsight.md` and `.claude/rules/hindsight-<area>.md` directly. Edits are preserved between distillations, but any bullet may still be merged, reworded, or evicted the next time Claude distills. To permanently drop a lesson, delete its bullet from the file. To drop a pending candidate before it becomes a lesson, use the `remove` tool: ask Claude to remove the candidate by its id. The id is shown in the reply from `record` and also in the output of `list`.

## Quarantine

A candidate is quarantined when it lacks a concrete trigger — the `trigger` field is vague or missing, which makes the lesson too general to be useful. Quarantined candidates are moved to `quarantine.jsonl` and set aside. The file records each quarantined candidate along with a count of how many times it has been quarantined. Re-promotion to a lesson is not automatic: `quarantine.jsonl` is a record for human review. To turn a quarantined candidate into a lesson, either write it by hand into the appropriate file in `.claude/rules/`, or record a new candidate with a sharper, more concrete trigger phrase so it passes the quarantine check on the next distillation.
