<EXTREMELY_IMPORTANT>
You have arcane.

Invoke the `arcane:alchemy` skill and follow its instructions when a task meets any of these:

- it touches more than one file, or changes a signature other files call
- it involves a design or architecture choice
- it is a bug whose cause is not yet known, or a performance issue

It routes to the right arcane skill from there. For smaller tasks, such as a contained change to one file with an obvious test, a question, or a one-line edit, work directly and verify on the real artifact.

When the intent is already specific, enter that skill directly. Invoke every skill listed for the activity, even when alchemy is not in play:

- **Multi-phase or unattended work**: `arcane:figure-it-out`, `arcane:show-me-your-work`.
- **System or code design**: `arcane:architect`; `arcane:arena` when one attempt could lock in the wrong shape; `arcane:blast-radius` before changing shared code.
- **Understanding code**: `arcane:how` for how it works, `arcane:why` for why it is this way, `arcane:teach` to explain it.
- **Tests**: `arcane:test-audit` whenever writing, changing, or reviewing tests; `arcane:tdd` when a failing test comes first.
- **Reviewing a change**: `arcane:interrogate`; `arcane:thermo-nuclear-code-quality-review` for a harsh maintainability pass; `arcane:no-comments` and `arcane:deslop` before committing.
- **Creating or updating a PR**: `arcane:make-pr-easy-to-review`, with `arcane:visual-pr` for the description. After opening: `arcane:babysit`; failing checks: `arcane:fix-ci`; review comments: `arcane:get-pr-comments`; conflicts: `arcane:fix-merge-conflicts`.
- **Writing prose** (docs, READMEs, commit messages, replies): `arcane:technical-writing`, then `arcane:unslop`.
- **TypeScript**: `arcane:typescript-best-practices` when reading or editing `.ts` or `.tsx`.
- **Proving app behavior**: `arcane:create-verification-skill` when the repo has no scripted way to drive the app; `arcane:maintain-verification-skill` to audit an existing one.
- **Parallel coverage or races**: `arcane:swarm`.
- **Resuming work**: `arcane:recall`. End of a long session: `arcane:reflect`. Status update from commits: `arcane:what-did-i-get-done`.
- **Capturing the user's working style as a skill**: `arcane:automate-me`.

User instructions (CLAUDE.md, direct requests) take precedence. Other session-start mandates, such as superpowers, still apply. Their skill checks run as before, and when a task meets the criteria above they route implementation through alchemy.
</EXTREMELY_IMPORTANT>

# Arcane models

Arcane skills name a role. Its model comes from the JSON below: arcane's `models.json` with the user's `/config` choices merged in.

- Find the role in `roles`. Its `models` names a tier, which `tiers` maps to a model, or it names the model directly. A list is a panel: one subagent per entry.
- Pass that model as the `Agent` call's `model`. A role missing from `roles` omits `model`, so it runs on the parent session's model.
- `astra` and `sol` are switchboard agent types with their own model and effort. Dispatch them as `subagent_type: "<name>"` with no `model` and no effort level; a role that would use `arcane:alchemy-agent` loses that prompt, so name the playbook step in the brief. If the agent type is not in the Agent tool's list, use `opus` and say so.
- If the `Agent` tool rejects a model, use the closest valid slug of the same family from its error message, and say so.
- A model value may carry a reasoning effort, as in `opus @high`; strip it before passing `model`. A value without one takes `defaultEffort`, where `session` sets no effort. A level (`low`, `medium`, `high`) picks the effort agent from the `subagent_type` you would otherwise use: `arcane:alchemy-agent` becomes `arcane:alchemy-agent-<level>`; `general-purpose`, or none, becomes `arcane:effort-<level>`. The model you pass still picks the model.

