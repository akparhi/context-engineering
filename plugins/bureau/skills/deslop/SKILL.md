---
name: deslop
description: Remove AI-generated code slop and clean up code style. Must apply before every commit or PR that touches code, and when reviewing a diff.
---

# Remove AI code slop

Check the diff against the branch's base and remove AI-generated slop introduced in the branch. The base is the PR's base branch, else the branch this one was cut from, else the repository's default branch. Include uncommitted changes.

## Focus Areas

- Comments: read `{SKILLBASE}/references/comments.md` and apply it.
- Defensive checks or try/catch blocks that are abnormal for trusted code paths
- Casts to `any` used only to bypass type issues
- Deeply nested code that should be simplified with early returns
- Other patterns inconsistent with the file and surrounding codebase

## Guardrails

- Keep behavior unchanged unless fixing a clear bug.
- Prefer minimal, focused edits over broad rewrites.
- After editing, rerun the checks that verified the change (tests, type check, and the driver skill for UI work) and report their results.
- Revert any edit whose check fails.
- Keep the final summary concise (1-3 sentences).
