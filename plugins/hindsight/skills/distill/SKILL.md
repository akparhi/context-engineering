---
name: distill-hindsight-lessons
description: Use when hindsight candidates are pending and you are folding them into the project lesson set, or when the user asks to distill lessons or mentions hindsight
---

# Distilling hindsight lessons

Corrections recorded during this session are queued as candidates. This skill
folds them into the small lesson set under `.claude/rules/`.

## Steps

1. Call `hindsight__distill`. It returns the pending candidates, the current
   lesson set, and the rules that govern merging. It writes nothing.
2. Follow those rules to compose a complete replacement lesson set. The rules are
   the authority — in particular, merge into existing lessons rather than
   appending near-duplicates, and prefer `areas` over `crossCutting`.
3. Call `hindsight__apply` with the set. It validates and writes atomically.
4. If it rejects the proposal, nothing was written. Fix exactly what the reason
   names and call it again.

## What matters

These files are committed and read by teammates, and every cross-cutting lesson
costs context in every future session. A merged, sharper set beats a longer one.
Write each lesson as neutral project guidance — no second person, no quoting the
user, no history.

Do NOT hand-edit the lesson files to apply candidates. `hindsight__apply` is what
clears the queue; editing the files directly leaves the candidates pending and
they will be distilled again.
