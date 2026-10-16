---
name: review
description: "Review a code change or a plan with parallel reviewer subagents, and synthesize findings. Code gets correctness (bugs, breakage, security, devex, feature-gate leaks) and code quality (maintainability, structure, file size, spaghetti) lenses, plus an adversarial lens for risky changes; plans, specs, implementation plans and research get the adversarial lens. Must use for code review, reviewing a change before commit or merge, deep review, a harsh code-quality audit, adversarial review, or reviewing a plan, spec or research doc."
---

# Review

Run the review lenses as background subagents in parallel, then synthesize their results.

| Lens | Rubric | Covers |
|---|---|---|
| Correctness | `{SKILLBASE}/references/correctness.md` | bugs, breakages, security, devex regressions, feature-flag leaks |
| Quality | `{SKILLBASE}/references/code-quality.md` | maintainability, structure, file-size growth, spaghetti, abstractions |
| Adversarial | `{SKILLBASE}/references/adversarial.md` | failure modes, broken assumptions, one-way steps, for code or a plan |

Pick lenses by target unless the user names them:

- Code change: correctness and quality. Add adversarial when the change touches auth, data, migrations, or concurrency, or when the user asks for it.
- Plan, spec, implementation plan, or research doc: adversarial only.

## Workflow

1. Determine the review target from the user request, PR, current branch, relevant changed files, or the document path.
2. Name the target as a git range (working tree, `<base>...HEAD`, or a PR) or document paths, plus any context reviewers need beyond it, such as the plan behind a change. Pass pointers, not pasted diffs; reviewers read the target and files themselves.
3. Launch one subagent per lens in the same message with `run_in_background: true`, `subagent_type: "general-purpose"`, and model and effort resolved from the `reviewer` role in [Arcane Models](#arcane-models). Give each the same prompt shape:
   - The absolute path of its rubric. Tell it to read the rubric in full and follow it as the complete review standard.
   - The target and context pointers from step 2.
   - Code targets: review only added or modified code; trace cross-file and cross-package side effects, but do not report pre-existing issues in untouched code unless the change newly reaches or exposes them.
   - Correctness lens only: finish the independent audit before reading any PR/MR discussion, then follow the rubric's rule for incorporating it.
   - Do not modify the target repository; put scratch scripts and reproductions in `/tmp`. Do not spawn nested subagents.
   - Return prioritized findings with `file:line` evidence, in the order the rubric specifies, in the final message. This overrides the rubric's report format: write no report files.
4. After all finish, synthesize the results with findings first, deduplicated across reviewers. Weight overlapping findings more heavily, resolve disagreements with your own judgment, and keep summaries brief. Verify an adversarial finding's construction against the code before acting on it.

If individual background summaries are already visible to the user, do not restate them wholesale. Surface the unified verdict, the highest-signal findings, and any remaining uncertainty.
