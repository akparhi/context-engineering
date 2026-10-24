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
3. Launch one subagent per lens in the same message with `run_in_background: true`, `subagent_type: "general-purpose"`, and model and effort resolved from the `reviewer` role in [Bureau Models](#bureau-models). Give each the same prompt shape:
   - The absolute path of its rubric. Tell it to read the rubric in full and follow it as the complete review standard.
   - The target and context pointers from step 2.
   - Code targets: review only added or modified code; trace cross-file and cross-package side effects, but do not report pre-existing issues in untouched code unless the change newly reaches or exposes them.
   - Correctness lens only: finish the independent audit before reading any PR/MR discussion, then follow the rubric's rule for incorporating it.
   - Do not modify the target repository; put scratch scripts and reproductions in `/tmp`. Do not spawn nested subagents.
   - Return the findings in the final message as the JSON in [Output](#output), in the order the rubric specifies, with no fences or prose around it. This overrides the rubric's report format: write no report files.
4. After all finish, merge the reviewers' JSON into one result in the same schema. Deduplicate by location and defect, keep the highest priority, and list every lens that raised it in `lenses`. Weight overlapping findings more heavily, resolve disagreements with your own judgment, and drop findings you refute. Verify an adversarial finding's construction against the code before acting on it. The patch is incorrect when any kept finding is P0 or P1.

If individual background summaries are already visible to the user, do not restate them wholesale. Surface the unified verdict, the highest-signal findings, and any remaining uncertainty.

## Output

Each reviewer returns this JSON, and the synthesis returns one merged copy of it:

```json
{
  "findings": [
    {
      "title": "[P1] <imperative, at most 80 chars>",
      "body": "<one Markdown paragraph: why it is a problem, citing files, lines, or functions>",
      "confidence_score": 0.0,
      "priority": 1,
      "lenses": ["correctness"],
      "code_location": {
        "absolute_file_path": "<file path>",
        "line_range": { "start": 1, "end": 1 }
      }
    }
  ],
  "overall_correctness": "patch is correct | patch is incorrect",
  "overall_explanation": "<1 to 3 sentences justifying the verdict>",
  "overall_confidence_score": 0.0,
  "plan": {
    "verifiers": ["<unit: who verifies it>"],
    "one_way_steps": ["<step: undo cost, point of no return, handle holder>"],
    "builder_questions": ["<question>"],
    "assumptions": ["<assumption (testable | not testable)>"]
  },
  "checked": "<what the reviewer examined>",
  "not_checked": "<what it did not>"
}
```

- `priority` is 0 to 3, matching the title tag. P0 blocks release or major use. P1 is urgent. P2 is normal. P3 is nice to have.
- `lenses` names the lens or lenses that raised the finding: `correctness`, `quality`, or `adversarial`.
- `code_location` overlaps the diff, or the reviewed document for a plan. Keep the range to 10 lines or fewer.
- For a plan or spec, `patch is correct` means the plan is ready to act on.
- `plan`, `checked`, and `not_checked` are optional. The adversarial lens fills them; the synthesis unions them across reviewers.

Reply to a human with the verdict and the highest-signal findings in prose, worst first, then the merged JSON under it. When the caller asks for JSON only, such as a gate or a script, return the merged JSON alone, with no fences or prose.
