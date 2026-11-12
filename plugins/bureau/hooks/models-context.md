# Bureau models

Bureau skills name a role. Its model ALWAYS comes from the JSON below.

1. Find the role in `roles`. If the role is missing, omit `model` so the subagent runs on the parent session's model.
2. Split off the effort. A role value can end in `@<effort>`, as in `opus @high` or `strongest @high`. Strip it before the next step. A value without one takes `defaultEffort`.
3. Resolve the model. The value names a tier, which `tiers` maps to a model, or names a model directly. A list is a panel: spawn one subagent per entry, each with the same effort.
4. Dispatch each model:
    - In `available`: pass it as `model`, and keep the `subagent_type` the skill asks for.
    - `inherit-parent`: omit `model`.
    - Any other model: use `subagent_type: "<model>"`. Pass no `model` and no `effort`, since the agent type sets both. This replaces the skill's `subagent_type` for that entry. If no agent type matches, use `opus` with the effort, and say so.
5. Set the effort, unless step 4 picked an agent type. A level from `efforts` goes in the `Agent` call's `effort` field. `session` means omit `effort`.
6. If the `Agent` tool rejects a model, use the closest valid slug of the same family from its error message, and say so.

