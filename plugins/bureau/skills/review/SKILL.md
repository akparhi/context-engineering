---
name: review
description: "Launch the correctness and code-quality review subagents in parallel, then synthesize their findings. Must use for code review, reviewing a change before commit or merge, deep review, a harsh code-quality audit, or combined bug/security and code-quality branch audits."
---

# Review

Run the two review passes as async background subagents in parallel, then synthesize their results.

## Workflow

1. Determine the review scope from the user request, PR, current branch, or relevant changed files.
2. Gather the diff and any file/context excerpts needed for reviewers to evaluate the change without guessing.
3. Launch both subagents in the same message with `run_in_background: true` and `subagent_type: "general-purpose"`, each told to read its prompt file in full and follow it:
   - `{SKILLBASE}/references/correctness-prompt.md` for bugs, breakages, security, devex regressions, feature-flag leaks, and other branch-audit risks.
   - `{SKILLBASE}/references/code-quality-prompt.md` for maintainability, structure, file-size growth, spaghetti, abstractions, and codebase-health risks.

   Set `model` and effort on both from the `reviewer` role in [Bureau Models](#bureau-models).
4. Pass each subagent the same scoped diff/file context and ask it to return prioritized findings with file references and evidence, as the JSON in [Output](#output) in place of the rubric's report format.
5. After both finish, synthesize the results into one copy of that JSON, findings first and deduplicated across reviewers. Weight overlapping findings more heavily, resolve disagreements with your own judgment, and keep summaries brief.

   Block only for a problem you can show, with a failing run at the head or a doc line the change made wrong. A problem the base already has doesn't block unless the change copies it or newly reaches it. Only a bug a user would hit, a failed gate, or a wrong shipped doc blocks. Everything else goes in a follow-up. The patch is incorrect only when a kept finding blocks.
6. Two fix-forwards per changeset is the ceiling. When a blocking finding survives the second, stop work on that changeset, report it blocked with the finding and its evidence, and let the operator choose another round, a narrower changeset, or closing it.

If individual background summaries are already visible to the user, do not restate them wholesale. Surface the unified verdict, the highest-signal findings, and any remaining uncertainty.

## Output

```json
{
  "findings": [
    {
      "title": "[P1] <imperative, at most 80 chars>",
      "body": "<one Markdown paragraph: the problem and its evidence, citing files, lines, or functions>",
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
  "overall_confidence_score": 0.0
}
```

- `priority` is 0 to 3, matching the title tag. P0 blocks release or major use. P1 is urgent. P2 is normal. P3 is nice to have.
- `lenses` names the reviewer or reviewers that raised the finding: `correctness` or `quality`.
- `code_location` overlaps the diff. Keep the range to 10 lines or fewer.
