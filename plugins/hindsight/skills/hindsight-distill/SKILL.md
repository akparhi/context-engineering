---
name: hindsight-distill
description: Use when hindsight candidates are pending and you are folding them into the project lesson set, or when the user asks to distill lessons or mentions hindsight
---

# Distilling hindsight lessons

Corrections recorded during this session are queued as candidates. This skill
folds them into the small lesson set under `.claude/rules/`.

1. Call `hindsight__distill`. It writes nothing. It returns the pending
   candidates, the current lesson set, the caps, and the rules that govern
   merging — including when to ask the user before applying. Those rules are the
   authority; follow them rather than anything remembered from a past session.
2. Compose a complete replacement lesson set and call `hindsight__apply`. It
   validates and writes atomically.
3. If it rejects the proposal, nothing was written. Fix exactly what the reason
   names and call it again.

Do NOT hand-edit the lesson files to apply candidates. `hindsight__apply` is what
clears the queue; editing the files directly leaves the candidates pending and
they will be distilled again.
