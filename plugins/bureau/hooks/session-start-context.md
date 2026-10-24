<EXTREMELY_IMPORTANT>

# Bureau

You have bureau.

Invoke the `bureau:hotline` skill and follow its instructions when a task meets any of these:

- it touches more than one file, or changes a signature other files call
- it involves a design or architecture choice
- it is a bug whose cause is not yet known, or a performance issue

It routes to the right bureau skill from there. For smaller tasks, such as a contained change to one file with an obvious test, a question, or a one-line edit, work directly and verify on the real artifact.

User instructions (CLAUDE.md, direct requests) take precedence. Other session-start mandates still apply. Their skill checks run as before, and when a task meets the criteria above they route implementation through hotline.

## Skills Usage

- If you think there is even a 1% chance a skill might apply to what you are doing, you ABSOLUTELY MUST invoke the skill.
- IF A SKILL APPLIES TO YOUR TASK, YOU DO NOT HAVE A CHOICE. YOU MUST USE IT. This is not negotiable. You cannot rationalize your way out of this.
- **CRITICAL RULE**: load principle skills (`bureau:principle-*`) whenever their "Apply when" trigger matches the current step, before acting on it.

When the intent is already specific, enter that skill directly. Invoke every skill listed for the below activities, even when hotline is not in play:

- **Vague new project or subsystem** (no stated purpose or success criteria), or "brainstorm", "grill me" / "interview me": `bureau:brainstorm`, before any design.
- **Design**: `bureau:architect` before code that crosses a function boundary; `bureau:arena` for design or code bakeoffs.
- **Understanding code**: `bureau:how` for how it works, `bureau:why` for why it is this way, `bureau:teach` to explain it.
- **Tests**: `bureau:test-audit` whenever writing, changing, or reviewing tests; `bureau:tdd` when a failing test comes first.
- **Reviewing a change**: `bureau:interrogate`; `bureau:review` for parallel correctness, code-quality and adversarial reviewers, and for reviewing plans and specs; `bureau:deslop` for a slop pass.
- **Before every `git commit` or PR creation**: always `bureau:deslop` on the diff.
- **Creating, updating, or tidying a PR**: `bureau:pr`. After opening: `bureau:babysit`; failing checks: `bureau:fix-ci`; review comments: `bureau:get-pr-comments`; conflicts: `bureau:fix-merge-conflicts`.
- **TypeScript**: `bureau:typescript-best-practices` when reading or editing `.ts` or `.tsx`.

</EXTREMELY_IMPORTANT>

# Bureau models

Bureau skills name a role. Its model comes from the JSON below: bureau's `models.json` with the user's `/config` choices merged in.

- Find the role in `roles`. Its `models` names a tier, which `tiers` maps to a model, or it names the model directly. A list is a panel: one subagent per entry.
- Pass that model as the `Agent` call's `model`. A role missing from `roles` omits `model`, so it runs on the parent session's model.
- If the `Agent` tool rejects a model, use the closest valid slug of the same family from its error message, and say so.
- Only models in `available` can be passed as `model`; `inherit-parent` omits `model`. Dispatch any other model as `subagent_type: "<model>-<effort>"` when the resolved effort (the role's `@<effort>`, else `defaultEffort`) is a level and that agent type exists, else as `subagent_type: "<model>"`, with no `model` and no effort: the agent type carries both. This overrides a skill's `subagent_type` for that entry. If no agent type matches, use `opus` with the effort field below, and say so.
- A role value may carry a reasoning effort, as in `opus @high` or `strongest @high`; strip it before resolving the tier and passing `model`. A tier's effort applies to every panel entry. A value without one takes `defaultEffort`, where `session` sets no effort. A level from `efforts` goes in the `Agent` call's `effort` field; keep the `subagent_type` you would otherwise use. `session` omits `effort`.

