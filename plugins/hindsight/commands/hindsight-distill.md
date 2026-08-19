---
description: Fold pending hindsight candidates into the project lesson set
---

Distill the pending hindsight candidates into `.claude/rules/`.

Use the `hindsight-distill` skill: call `hindsight__distill`, follow the
rules it returns to compose a replacement lesson set, then call
`hindsight__apply`. Report which lessons you merged, added, or dropped, and any
candidates you quarantined.
