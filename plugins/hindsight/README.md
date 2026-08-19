# hindsight

Hindsight turns the corrections you give Claude into persistent, contextual project rules. When you correct a mistake, Claude records it, folds it into a small lesson set under `.claude/rules/`, and Claude Code loads those lessons back in future sessions — automatically, and only where they are relevant.

The design goal is a handful of sharp lessons rather than an ever-growing pile. New corrections are merged into existing lessons instead of appended alongside them, hard caps bound the total, and lessons scoped to one part of the codebase cost nothing in sessions that never touch it.

> **Setup:** Before using the plugin, install its Node.js dependencies inside `plugins/hindsight/` with `bun install --frozen-lockfile` or `npm ci`. The MCP server will not start until dependencies are present; without this step `record`, `distill`, and `apply` will not exist even after the plugin is registered.

## What happens, end to end

**1. Session starts.** A `SessionStart` hook injects the capture contract: when to record a correction, what to ignore, and how to fold candidates in. It also expires anything stale (see below) and reports how many candidates are still pending. Separately, Claude Code loads the lesson files themselves — `hindsight.md` always, and each `hindsight-<area>.md` only if a file matching its glob is in context.

**2. You correct Claude.** Claude calls `record` with what it did, what was correct instead, its proposed one-line rule, and the trigger — the earliest observable signal that should have told it, such as a file path or a task type. That appends one candidate to `.claude/hindsight/candidates.jsonl`. No rule file is touched. Recording the same correction twice in a session queues it once, because candidates are fingerprinted.

**3. Claude folds it in, unprompted.** Shortly after recording, Claude calls `distill`, which returns the pending candidates, the current lesson set, and the rules governing how to merge them. Nothing is written by that call. Claude then composes a complete replacement lesson set and calls `apply`, which caps it, validates it, writes it atomically to `.claude/rules/`, sets aside any quarantined candidates, and clears the queue. Claude reports the result in one line, naming the area — for example, `Added 1 lesson under src/api/**; merged 1 into an existing lesson.`

**4. Next session, the lesson is already there.** Claude Code loads the rule files natively. Nothing else is required to make a recorded lesson take effect.

Two tools sit outside that flow: `list` shows the current lessons plus pending candidates with their ids, and `remove` drops a pending candidate before it ever becomes a lesson.

## When Claude asks first

Most candidates are applied without asking — a new area lesson, a merge into an existing lesson, or evicting a stale entry to stay under a cap. Claude asks for confirmation in exactly three cases:

- The candidate contradicts a lesson already in `.claude/rules/`.
- It would add a new cross-cutting lesson, which loads in every future session.
- Claude can state a trigger but is not confident it is the right one.

Those questions arrive at the end of a turn, batched with the turn summary, rather than interrupting work mid-task. A candidate that is neither applied nor confirmed within 24 hours is dropped at the next session start, keyed on its `recorded_at` timestamp. Dropping is not a loss: if the mistake recurs it gets recorded again, and recurrence is the signal that it was worth keeping.

You can also trigger a distillation yourself at any time with `/hindsight-distill`. Nothing is ever written unless `apply` is called.

## Why area files matter

`hindsight.md` carries no frontmatter, so Claude Code loads it in every session. Each `hindsight-<area>.md` carries a `paths:` glob in its frontmatter, so Claude Code loads it only when a matching file enters context.

That difference is the point of the design. A lesson about your API layer costs zero context in a session that never touches the API, which is what makes it affordable to keep lessons at all. Cross-cutting lessons are charged against every future session, so that file is capped hardest and Claude is instructed to prefer an area whenever a file boundary makes sense.

## File layout

```
.claude/
  hindsight/           # untracked working state
    candidates.jsonl   # pending corrections waiting to be distilled
    quarantine.jsonl   # candidates set aside; see Quarantine below
    distill.log        # rejections and write failures from apply
  rules/               # committed lessons, loaded natively by Claude Code
    hindsight.md                  # cross-cutting lessons (no frontmatter)
    hindsight-<area>.md           # area-scoped lessons (paths: glob frontmatter)
```

Commit `.claude/rules/` so lessons persist and reach your teammates. `.claude/hindsight/` is transient local state and gets its own `.gitignore` automatically.

Because lesson files are committed and read by others, each lesson is written as neutral project guidance — no second person, no quoting anyone, no history.

## Caps

| Scope | Limit |
|---|---|
| Cross-cutting lessons | 7 |
| Lessons per area file | 12 |
| Area files | 5 |

When a proposed set exceeds a cap, the oldest entries are dropped first, ranked by the `@date` annotation embedded in each lesson. Over-cap sets are capped, not rejected. Merging a new correction into an existing lesson refreshes that lesson's date, so recurring lessons survive and stale ones age out.

## Hand-editing lessons

You can edit `.claude/rules/hindsight.md` and `.claude/rules/hindsight-<area>.md` directly. Edits are preserved between distillations, but any bullet may still be merged, reworded, or evicted the next time Claude distills — hand-written and generated lessons are indistinguishable in the file, so all of them are equally subject to the caps. To drop a lesson permanently, delete its bullet.

To drop a pending candidate before it becomes a lesson, ask Claude to remove it by id. The id appears in `record`'s reply and in `list`'s output.

One caveat worth knowing: an area file's `paths:` frontmatter is what makes it load conditionally, and `apply` rejects an area that has no glob. If you hand-edit that frontmatter into a shape the plugin cannot parse, a later distillation may drop the area rather than repair it. Keep the frontmatter in the block-list form the plugin writes.

## Quarantine

A candidate is quarantined when it lacks a concrete trigger — the `trigger` field is vague or missing, which would make the resulting lesson too general to be useful. Quarantined candidates move to `quarantine.jsonl`, which records each one along with a count of how many times it has been quarantined.

Re-promotion is not automatic: `quarantine.jsonl` is a record for human review. To turn a quarantined candidate into a lesson, either write it by hand into the appropriate file under `.claude/rules/`, or record a new candidate with a sharper trigger so it passes on the next distillation.

## Tools

| Tool | Writes | Purpose |
|---|---|---|
| `record` | queue only | Queue a correction as a candidate |
| `list` | nothing | Show current lessons and pending candidates with ids |
| `remove` | queue only | Drop a pending candidate by id |
| `distill` | nothing | Return candidates, current lessons, and the merge rules |
| `apply` | rule files | Cap, validate, and persist a lesson set |

`apply` is the only tool that writes to `.claude/rules/`.
