<EXTREMELY-IMPORTANT>

# Directives: Just do it

- Clear directive → do it. No confirm, no alternatives, no options menu. Includes destructive-but-recoverable git actions.
- **IMPORTANT**: Irreversible + unrecoverable (data loss, outward-facing sends): one short confirm.
- Otherwise report in one line what I can't see: CI bypasses, failed checks, unexpected repo state. Then keep going.
- **Checkpoint commits**: during phased development, commit at sensible checkpoints without asking. Never push them without explicit ask.

**CRITICAL**: Directive scope = that request only. Commit/push/merge actions on master/main branch, PR/sends/deploys need explicit ask, every time. "Commit and push" earlier ≠ permission for later changes. (**Checkpoint commits** are an exception, but never push them without explicit ask.)

# Working Principles

- End every plan with unresolved questions, if any. While planning, ask clarifying questions without hesitation.
- **IMPORTANT RULE**: If available, use codex for code review and adversarial review of research, specs and implementation plans.
- When implementing a plan, add Task ID from it to commit messages.
- Always kill a process (e.g., dev server) you started if it is no longer needed.
- For repeated automated tests, write reusable scripts and reuse them.
- **CRITICAL RULE**: For large/multi-phase goals or noisy-process tasks, act as orchestrator and spawn subagents — for independent work chunks/testing/deep exploration and to save orchestrator context window.
  - **Large/multi-phase goals:** always delegate self-contained chunks (implementers per task, reviewers, research fan-out); main session stays coordinator — preserves its context for orchestration/judgment, keeps each chunk focused.
  - **Delegate to save orchestrator context window:** noisy-process/small-conclusion tasks (multi-search research, browser/Playwright exploration, log-heavy debugging) go to a subagent even as single tasks — orchestrator gets the report, not the trail.
  - **Subagent type:** Least-powerful model that fits: transcription/normal exploration → haiku, implementation/integration/testing/judgment/deep exploration → sonnet, architecture/final-review → opus.
  - Hand artifacts as files (briefs, report paths, diffs), not pasted into prompts.
  - **Do NOT fan out** for small targeted tasks or one-off debugging asks — do those inline.

# Code Exploration

- TS/TSX/JS code search → `ast-grep` by default (bin `ast-grep`): `ast-grep run -p '<pattern>' src`, not grep.
  - Non-trivial pattern → `ast-grep` skill; mapping a file/dir's shape → `ast-grep-outline` skill.
  - Grep only for non-syntax targets: strings, comments, non-JS files, logs.
- Finding files → `fd`, not `find`.
- Symbol types, definitions, usages → `LSP` tool, never grep-guessing.

# Coding Standards

Before writing any plan or implementation, read `rules/coding-standards.md` (relative to this file).

</EXTREMELY-IMPORTANT>

