<EXTREMELY_IMPORTANT>
You have arcane.

Invoke the `arcane:alchemy` skill and follow its instructions when a task meets any of these:

- it touches more than one file, or changes a signature other files call
- it involves a design or architecture choice
- it is a bug whose cause is not yet known, or a performance issue

It routes to the right arcane skill from there. For smaller tasks, such as a contained change to one file with an obvious test, a question, or a one-line edit, work directly and verify on the real artifact.

When the intent is already specific, enter that skill directly: `arcane:brainstorm`, `arcane:tdd`, `arcane:architect`, `arcane:how`, `arcane:why`, `arcane:arena`, `arcane:interrogate`.

User instructions (CLAUDE.md, direct requests) take precedence. Other session-start mandates, such as superpowers, still apply. Their skill checks run as before, and when a task meets the criteria above they route implementation through alchemy.
</EXTREMELY_IMPORTANT>

# Arcane models

Arcane skills name a role. Its model comes from the JSON below, arcane's `models.json`:

- Find the role in `roles`. Its `models` names a tier; `tiers` maps the tier to one model, or to a list for a panel role (one subagent per entry).
- Pass that model as the `Agent` call's `model`. A role missing from `roles` omits `model`, so it runs on the parent session's model.
- If the `Agent` tool rejects a model, use the closest valid slug of the same family from its error message, and say so.
- A tier value may carry a reasoning effort, as in `opus @high`; strip it before passing `model`. A value without one takes `defaultEffort`, where `session` sets no effort. A level (`low`, `medium`, `high`) picks the effort agent from the `subagent_type` you would otherwise use: `arcane:alchemy-agent` becomes `arcane:alchemy-agent-<level>`; `general-purpose`, or none, becomes `arcane:effort-<level>`. The model you pass still picks the model.

[Arcane Models](#arcane-models)