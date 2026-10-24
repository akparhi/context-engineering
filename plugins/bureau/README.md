# bureau

bureau is a Claude Code fork of [pstack-claude](https://github.com/michael-denyer/pstack-claude), Michael Denyer's port of Lauren Tan's [pstack](https://github.com/cursor/plugins/tree/main/pstack), an opinionated skill stack that improves agent outcomes.

Tell `hotline` your goal and it invokes the workflow that fits: reproduce and root-cause a bug, sketch a design with `architect`, race candidates in `arena`, review a diff with `interrogate`, cut prose with `unslop`. It keeps code concise, simple, and verified, and it reports what it checked.

## What it contains

- Skills: Markdown instructions the agent reads. Public ones appear as `/bureau:<name>` slash commands.
- Agents: `bureau:field-agent` and `bureau:janitor`.
- A SessionStart hook that injects the hotline routing mandate and the per-role models from `models.json`, the one place to change which model each role uses. The tiers, default effort, and each role can also be overridden per user in `/config`; `models.json` stays the default.
- A `codegraph` MCP server for structural code questions (callers, impact, wiring). On first use it installs the pinned [CodeGraph](https://github.com/colbymchenry/codegraph) CLI into bureau's plugin data, unless `codegraph` is already on `PATH`, and in the background indexes each git repo you open that has at least 500 code files. In a repo with no index, the server offers no tools, so it costs no context. Run `codegraph init` to index a smaller one, or turn the server off for one project in `/mcp`. In an indexed repo, hooks give the main agent and every subagent CodeGraph's short usage block, the one `codegraph install` writes to CLAUDE.md, and add a one-line reminder to each prompt. To skip permission prompts, allow `mcp__plugin_bureau_codegraph__*` in your settings.
- A `terse` output style for short, scannable replies. Pick it with `/output-style`, or set `"outputStyle": "bureau:terse"`. A hook repeats its core rules on every prompt; turn `terse_reminder` off in `/config` if you use another style.
- Local scripts for watching and shipping pull requests, orchestrating multi-phase plans, and auditing worktrees.

## Data handling

bureau has no server or telemetry. The codegraph MCP server runs locally, and bureau starts it with CodeGraph's telemetry off. Its first start downloads CodeGraph from npm. Anything its skills ask your agent to read, including session transcripts, goes to your model provider. Scripts run locally, and PR tools use your GitHub CLI login.

## Links

- [Upstream pstack-claude reference](https://github.com/michael-denyer/pstack-claude/blob/main/docs/reference.md). It also covers `setup-pstack` and `pstack-models.md`, which bureau replaces with `models.json` and `/config`.
- [Issues and support](https://github.com/akparhi/context-engineering/issues)

## License

MIT. bureau's modifications and additions are © 2026 Anand Kumar Parhi. The pstack-claude port is © 2026 Michael Denyer, original pstack © 2026 Lauren Tan, and imported cursor-team-kit skills © 2026 Cursor. The license texts and [NOTICE.md](skills/hotline/references/licenses/NOTICE.md) are in [`skills/hotline/references/licenses/`](skills/hotline/references/licenses/).