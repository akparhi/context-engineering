---
name: code-review
description: "Review a branch or PR diff with two parallel reviewers, correctness (bugs, breakage, security, devex, feature-gate leaks) and code quality (maintainability, structure, file size, spaghetti), then synthesize their findings. Must use for code review, reviewing a change before commit or merge, deep review, or a harsh code-quality audit."
---

# Code Review

Run the two review lenses as background subagents in parallel, then synthesize their results.

| Lens | Rubric | Covers |
|---|---|---|
| Correctness | `{SKILLBASE}/references/thermo-nuclear-review.md` | bugs, breakages, security, devex regressions, feature-flag leaks |
| Quality | `{SKILLBASE}/references/thermo-nuclear-code-quality-review.md` | maintainability, structure, file-size growth, spaghetti, abstractions |

Run both lenses unless the user asks for only one.

## Workflow

1. Determine the review scope from the user request, PR, current branch, or relevant changed files.
2. Name the scope as a git range (working tree, `<base>...HEAD`, or a PR) plus any context reviewers need beyond the diff. Pass pointers, not pasted diffs; reviewers read the diff and files themselves.
3. Launch one subagent per lens in the same message with `run_in_background: true`, `subagent_type: "general-purpose"`, and model and effort resolved from the `code-reviewer` role in [Arcane Models](#arcane-models). Give each the same prompt shape:
   - The absolute path of its rubric. Tell it to read the rubric in full and follow it as the complete review standard.
   - The scope and context pointers from step 2.
   - Review only added or modified code; trace cross-file and cross-package side effects, but do not report pre-existing issues in untouched code.
   - Correctness lens only: finish the independent audit before reading any PR/MR discussion, then follow the rubric's rule for incorporating it.
   - Do not edit files. Do not spawn nested subagents.
   - Return prioritized findings with `file:line` evidence, in the order the rubric specifies, in the final message. This overrides the rubric's report format: write no report files.
4. After both finish, synthesize the results with findings first, deduplicated across reviewers. Weight overlapping findings more heavily, resolve disagreements with your own judgment, and keep summaries brief.

If individual background summaries are already visible to the user, do not restate them wholesale. Surface the unified verdict, the highest-signal findings, and any remaining uncertainty.
