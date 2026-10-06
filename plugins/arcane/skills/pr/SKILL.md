---
name: pr
description: ALWAYS use whenever creating, raising, re-raising, or updating a pull request, writing/rewriting a PR description, or when asked to make a PR easy to review, tidy it, or clean up its commits. Writes the PR body (why, special things to note, visual change outline, evidence). Even when a repo has its own PR skill, refer to this skill for the body.
---

# Pull Request

Create or update the pull request for the current task with a concise description that helps a reviewer understand why the change exists and the shape of the implementation.

## Workflow

1. Read the description template:

   `Read({SKILLBASE}/references/pr_description_template.md)`

2. Identify or create the pull request:
   - Check the current branch for a PR with `gh pr view --json url,number,title,state,baseRefName,headRefName,body 2>/dev/null`.
   - If no PR exists, inspect `git status --short --branch` and the commits on the current branch.
   - Commit task-related changes when needed, push the branch with an upstream, and create a PR for it. Follow the repository's git safety protocol.
   - Ask the user to select a PR only when the current branch has no relevant work and there is no safe current-branch PR to create.

3. Gather only the context needed to explain the change:
   - Read the ticket and any relevant task artifacts.
   - Read the complete PR diff and enough surrounding code to understand behavior and ownership.
   - Use `gh pr view` to collect PR metadata, commits, and changed files.
   - Read `{SKILLBASE}/references/show-me.md` for the visual-outline conventions used in the PR body.
   - If PR already exists, read the current PR body. Keep links, closing keywords such as `Fixes #123`, and notes a human wrote.

4. Optional, only when the user asks to make the PR easy to review, tidy it, or clean up commits:
   - Inspect commits, diff size, changed paths, generated files, and the PR description.
   - Identify reviewability issues: noisy commits, stale description, unrelated changes, mixed mechanical and logic changes, missing tests, or unclear reviewer entry points.
   - Propose a plan before rewriting history or force-pushing. Follow `{SKILLBASE}/references/tidy-history.md`.

5. Write the PR description using the template:
   - Keep **Why the change** to exactly one sentence.
   - Keep **Special things to note** to 1-3 bullets. Prioritize reviewer warnings, migrations, compatibility constraints, deliberate omissions, or surprising decisions. Flag unrelated changes, one-way doors (data migration, deletion, public contract change) and name what breaks. Write `- None.` when there are no special considerations.
   - Make **Change outline** a compact, `/show-me`-inspired structural view rather than prose or a file-by-file changelog.
   - Include only the views that help explain this PR:
     - SQL table and endpoint contract changes, plus pseudocode for business logic.
     - key data structure / type changes
     - A shallow file tree showing changed responsibilities.
     - React component tree changes, including important hooks, state, and package boundaries.
     - Call-tree, call-stack, control-flow, or data-flow changes.
   - Prefer `diff` blocks when showing changes to an existing shape. Show the complete target shape when most of it is new or diff notation would obscure ownership or order.
   - Keep each view focused on what a reviewer needs. Omit categories that did not change.
   - Make **Evidence** concrete evidence that the change works. Show a before and after. Never invent one; write `- None.` with the reason when the change has no runtime behavior.
   - When screenshots or recordings exist, upload them with `bash {SKILLBASE}/scripts/upload-proofs.sh <branch> <files>` and paste its markdown under the Evidence table.
   - optionaL: if you are aware of a ticket id/url, or related plan/document urls, or other relevant links, include them in the header, otherwise omit the header

6. Save and publish the description:
   - Use `.arcane/tasks/{task-slug}/pr-description.md` when the task directory exists; otherwise use `.arcane/tasks/pr-{number}/description.md`.
   - Update the PR with `gh pr edit {number} --body-file {output-path}`.
   - Confirm the update succeeded.

7. Report completion:
   - Read `{SKILLBASE}/references/describe_pr_final_answer.md`.
   - Respond using that final answer template with the PR URL, saved description URL, and concise list of changed files.

Always read and follow `{SKILLBASE}/references/pr_description_template.md`. Do not expand the PR body beyond that template.

## Guardrails

- Never hide meaningful behavior changes inside "cleanup".
- Do not bypass hooks unless the user explicitly asks.

Write as one human talking to another: avoid jargon and slang, and use simple, coherent, concise language. Skip all preambles and keep prose brief. Use the user's domain language from `GLOSSARY.md` when it exists.
