### Authoring or modifying a skill

**You own the skill's voice.**

1. Use the **plugin-dev:skill-development** skill (Claude Code's authoring guidance for SKILL.md files).
2. Spawn a subagent on the `skill writer` role in [Bureau Models](#bureau-models) to write the skill prose: `SKILL.md`, its references and playbooks, and agent files.
3. Validate the skill: frontmatter has `name` and `description`, referenced files exist, cross-skill links resolve.
4. Test cases if structural. Skip if subjective.
5. Spawn a second subagent on the `skill reviewer` role in [Bureau Models](#bureau-models) to review that prose. Do not reuse the subagent that wrote it.
6. Run **Opening a PR**.

When in doubt, delete. Keep only prose that changes a decision. Tell it to do the thing and skip the reason. Explain only when the rule is confusing without one. Match tone to scope. Point at structural sources (types, READMEs, config) per the **encode-lessons-in-structure** principle skill. Delegate to other skills by path. Don't restate. A workflow you keep hitting but isn't captured → propose a new skill.

**Reply:** summary of the skill, key design decisions, validation notes.
