# arcane

arcane is a Claude Code fork of [pstack-claude](https://github.com/michael-denyer/pstack-claude), Michael Denyer's port of Lauren Tan's [pstack](https://github.com/cursor/plugins/tree/main/pstack), an opinionated skill stack that improves agent outcomes.

Tell `alchemy` your goal and it invokes the workflow that fits: reproduce and root-cause a bug, sketch a design with `architect`, race candidates in `arena`, review a diff with `interrogate`, cut prose with `unslop`. It keeps code concise, simple, and verified, and it reports what it checked.

## What it contains

- Skills: Markdown instructions the agent reads. Public ones appear as `/arcane:<name>` slash commands.
- Agents: `arcane:alchemy-agent` and `arcane:comment-sicko`, plus one agent per reasoning-effort level.
- A SessionStart hook that injects the alchemy routing mandate and the per-role models from `models.json`, the one place to change which model each role uses.
- Local scripts for watching and shipping pull requests, orchestrating multi-phase plans, and auditing worktrees.

## Data handling

arcane has no server or telemetry. Anything its skills ask your agent to read, including session transcripts, goes to your model provider. Scripts run locally, and PR tools use your GitHub CLI login.

## Links

- [Skills, slash commands, runtime setup, and model configuration](https://github.com/michael-denyer/pstack-claude/blob/main/docs/reference.md)
- [Issues and support](https://github.com/michael-denyer/pstack-claude/issues)
- [Security policy](https://github.com/michael-denyer/pstack-claude/blob/main/SECURITY.md)