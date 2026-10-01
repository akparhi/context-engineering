# context-engineering

Repo-managed Claude Code and Codex configuration, shared skills, and a public plugin marketplace.

The premise throughout: **the scarce resource is the model's attention, and the second scarcest is mine.** Config, skills, and plugins here all follow from that.

## Layout

```
claude-profiles/    one settings.json per machine
  default.json      the default profile
  darkforest.json
claude-shared/      config every profile links to
  CLAUDE.md         how the agent behaves
  output-styles/    terse and reminder
  agents/           subagents copied from Anthropic's feature-dev plugin
codex-profiles/     full Codex config.toml profiles
  default.toml      personal defaults + this machine’s desktop/trust settings
codex-shared/       AGENTS.md, agent roles and macOS sound hooks
shared/skills/      skills used by both Claude and Codex
plugins/            this repo is also a plugin marketplace
  arcane/           pstack-claude workflows and principles
  switchboard/      local gateway that runs Codex models inside Claude Code
bin/setup.mjs       Claude installer
bin/reinstall-plugin.sh  refresh installed plugins after editing them
bin/setup-codex.mjs Codex installer
```

## Setup on a new machine

```bash
bun run setup
```

It asks which profile (`default` unless you say otherwise), where to put the config (`~/.claude` unless you say otherwise), and which plugins to install. Both answers can be passed as arguments to skip the questions:

```bash
bun run setup darkforest ~/.darkforest/claude
```

Setup links `settings.json` to the chosen profile and `output-styles/`, `agents/`, `CLAUDE.md` to `claude-shared/`, plus `skills/` to `shared/skills/`, then registers this repo as a plugin marketplace and installs whichever plugins you pick — including their dependencies, without which a plugin's MCP server will not start and its tools will not exist.

Re-running is safe: an existing symlink is repointed, and a real file is moved to `<name>.bak.<timestamp>` rather than overwritten — on a machine that already has config, that file is the only copy.

## What's here

### claude-profiles/ — the harness

`settings.json` decides what the tool may do; `claude-shared/CLAUDE.md` decides how the agent behaves once running. The two are written to match, so the rules are enforceable rather than advisory.

| Area | Choice | Why |
|---|---|---|
| Context window | compact at 256k, 1M available | A large context is a liability — attention degrades and cost climbs as it fills. A soft ceiling keeps the pressure toward delegation while leaving headroom for work that genuinely needs it. |
| Effort | `medium` by default | Depth comes from spawning a stronger subagent, not from making every turn expensive. |
| Permissions | `bypassPermissions`, no prompts | A config that asks every turn contradicts an agent told not to ask. Safety moves to the `deny` list and to git being recoverable. |
| Denied | `dist/`, `next/`, plan/worktree/cron/notebook modes | Build output teaches nothing; fewer modes means fewer paths to wander down. |
| Models | pinned aliases | `--model opus` shouldn't drift when a new default ships. |
| Symbols | `ENABLE_LSP_TOOL` + `typescript-lsp` | Backs the "never grep-guess a definition" rule with real resolution. |
| Telemetry | `DISABLE_NONESSENTIAL_TRAFFIC` | One switch covering metrics, error reports, surveys, feature flags. Does not affect auto-updates. |
| Hooks | audio only | With prompts bypassed, a sound is the only signal that the agent needs a human: one for blocked, one for done. |

`darkforest.json` differs from `default.json` only in machine-specific paths.

### claude-shared/CLAUDE.md — the agent

- **just do it** (clear directive → execute; the confirm line is drawn at irreversible *and* unrecoverable, so git operations are free);
- **output brevity** (compress by deleting clauses that carried no decision — never negations, never invented abbreviations; suspended for security warnings and irreversible-action confirms);
- **orchestration** (main session coordinates, subagents do independent chunks — the reason is context hygiene, not parallelism; artifacts pass as file paths, never pasted);
- **exploration defaults** (`ast-grep` for TS/JS, `fd` over `find`, LSP for symbols);
- **coding standards** (a YAGNI ladder that stops at the first rung that holds, with a hard floor at validation, security, and anything explicitly asked for).

### shared/skills/

`ast-grep` and `ast-grep-outline` for syntax-aware search — a structural pattern can't match a string that merely looks like code.

## Plugins

Install from any machine, no clone needed:

```bash
claude plugin marketplace add akparhi/context-engineering
claude plugin install arcane@akparhi
claude plugin install switchboard@akparhi
```

Inside Claude Code, the same is `/plugin marketplace add akparhi/context-engineering`, then `/plugin install <name>@akparhi`. Add `--scope project` to enable a plugin for one repo only. Restart Claude Code after installing.

Claude Code runs plugins from its own cache, not from this repo. After editing a plugin here, run `bun run reinstall` (both plugins) or `bun run reinstall arcane`, then restart open sessions.

### arcane

A fork of [pstack-claude](https://github.com/michael-denyer/pstack-claude), the Claude Code port of [pstack](https://github.com/cursor/plugins/tree/main/pstack). A SessionStart hook injects a routing mandate: multi-file changes, design choices and unknown bugs go through the `alchemy` skill, which picks a playbook (bug fix, feature, refactoring, perf, PR, shipping and more). The same context lists which skill to use for each activity, such as `architect` for design, `test-audit` for tests, and `make-pr-easy-to-review` with `visual-pr` for PRs. Principle skills load on their own when their situation comes up.

Every subagent model comes from one file, [`plugins/arcane/models.json`](plugins/arcane/models.json), which the hook injects each session. Edit it and reinstall to change a role's model. Each user can also override its tiers, default effort, and each role in `/config`, without editing the file. `bun run reinstall` regenerates those `/config` options from `models.json` with `bin/sync-arcane-config.mjs`. Differences from upstream: no Codex support, no `bro` or `setup-pstack` skill, effort limited to session or high, opus instead of fable as the strongest model, and quoted agent descriptions that fix upstream's "Malformed plugin agent" startup error. See [`plugins/arcane/README.md`](plugins/arcane/README.md).

### switchboard

Starts the real Claude Code binary behind a local gateway so external providers' models (such as Codex models through a ChatGPT login) show up in `/model` and can run as subagents. Needs [Bun](https://bun.sh) installed permanently; Bun fetches the plugin's dependencies on first run. After installing, run `/switchboard:setup` to add the launch command (default `switchboard`), `/switchboard:login` to sign in, and `/switchboard:status` to check it. `/switchboard:uninstall` reverses setup.

## Codex setup

Requires Node 22+ and a current Codex CLI (validated with 0.154.0). Authenticate with `codex login` on new machines.

```bash
npm run setup:codex
# Alternative profile/destination; existing files/directories are backed up.
node bin/setup-codex.mjs default ~/.codex
# Offline/relink only:
node bin/setup-codex.mjs default ~/.codex --skip-plugins
```

`~/.codex/config.toml` links directly to `codex-profiles/default.toml`.
`AGENTS.md`, `agents/`, `hooks.json` and `hooks/` link to `codex-shared/`.
Both `~/.claude/skills` and `~/.agents/skills` link to `shared/skills/`; Codex uses the latter documented discovery location. Its existing `.codex/skills/.system` stays runtime-managed.
For a custom destination, setup links each shared skill under `<destination>/skills`, which Codex discovers through `CODEX_HOME`. The default home uses `~/.agents/skills` so runtime-managed system skills remain untouched. Conflicting skill directories are backed up before linking; `.system` stays private to that home.

Codex 0.154.0 does not inherit parent-directory trust across nested Git repositories (verified with a fresh nested repository and config/read). Both requested roots, `/Users/akparhi/Projects` and `/Users/akparhi/Documents/Codex`, have entries; existing discovered Git roots beneath them are listed explicitly. New repositories still need an explicit trust entry.

The default profile includes this machine's existing desktop preferences, trusted paths, bundled-marketplace paths and local PDF-skill path. Copy it to `codex-profiles/<machine>.toml` and adjust those paths on another machine. Credentials, sessions, caches and plugin downloads remain outside git. App settings changes may write through the config symlink; review `git diff` afterward. Re-run setup if an app replaces the symlink.

| Area | Default |
|---|---|
| Main agent | GPT-6 Astra, low reasoning, concise output |
| Compaction | 256,000 total-context tokens; model's actual context capacity unchanged |
| Permissions | `never` + `danger-full-access`, matching the existing local setup |
| Integrations | Superpowers; Context7 via the existing stdio MCP configuration |
| Web research | Native live web search; independent of ChatGPT connectors |
| Apps | App tools disabled, default app enablement false |
| Plugins | Remote catalog and recommendations off; Superpowers, browser and unified computer use enabled; other listed bundled plugins disabled |
| Skills | Shared local skills + Superpowers + Codex system skills; local PDF skill enabled |
| Analytics | Analytics and feedback disabled |
| Sounds | macOS Funk for attention; Submarine for completion |

Codex has no documented one-for-one equivalent of Claude's `syncClaudeAiSkills` / `syncClaudeAiPlugins`. This profile disables apps, the remote catalog, and unwanted bundled plugins explicitly; browser and unified computer use are enabled. It does not disconnect accounts or change ChatGPT web settings. New app/runtime releases may introduce new plugins: inspect the active skill catalog after upgrades. `codex plugin list` omits remote catalog rows when that catalog is disabled; `codex debug prompt-input` confirms cached Superpowers skills still load.

### Subagents

| Role | Model / effort | Scope |
|---|---|---|
| explorer | GPT-5.6 Luna / low | Read-only code mapping and reference tracing |
| researcher | GPT-5.6 Luna / high | Read-only web and Context7 research; primary-source URLs |
| worker | Luna/high for simple tasks; Sol/low for anything beyond simple; Astra/low for 3D/games | Implementation and tests; Astra baseline for 3D/games |
| reviewer | GPT-5.6 Sol / low | Read-only correctness/security/architecture review |

Three concurrent children maximum; untyped children default to Luna/high. The main session stays the orchestrator: delegate implementation, research, exploration, testing and review, including single noisy tasks. Small tasks use one focused child rather than fan-out. Pass isolated briefs and artifact paths; return concise conclusions and verification summaries. Role instructions disable recursive delegation. Choose higher effort up front for high-fidelity work. The single `worker` role leaves model/effort unpinned: the orchestrator sets both explicitly on an isolated spawn; omitted values fall back to global Luna/high defaults. Explicitly select Sol/low for anything beyond simple implementation; when uncertain, choose Sol/low. Fixed model/effort settings in other custom roles take precedence over spawn overrides; for another tier, use an isolated `default` agent with explicit model and effort. For 3D/game implementation, start at Astra/low and raise Astra effort when fidelity demands it. Routing choices do not guarantee quota savings. Read-only roles request a read-only sandbox, but parent runtime permission overrides can take precedence. Roles and model availability depend on the installed harness; standalone role files are not an assertion that every client exposes an `agent_type` argument.

Current Codex releases support bounded multi-agent wait tuning through `[features.multi_agent_v2]`; the default profile configures a 60-second minimum, 10-minute default and one-hour maximum waits. Runtime limits still apply, so callers must use a shorter timeout when required. Longer event waits reduce polling churn, but the claimed token savings come from a [community report](https://www.reddit.com/r/codex/comments/1wenst7/i_figured_the_culprit_of_astra_token_burning_so/) and are not a confirmed fix.

### Sound hooks

Restart Codex and run `/hooks` to review/trust the three command hooks. Codex skips untrusted hooks; changing their definitions requires another review. Trust hashes are recorded by Codex in the linked profile and are keyed by the local hooks path. This machine’s three sound hooks have been reviewed and trusted; other paths or changed definitions require review.

- `PermissionRequest`: Funk (normally rare with approvals disabled).
- `PreToolUse` for question tools: Funk.
- `Stop`: Submarine. No `SubagentStop` sound.

Scripts return `{}` and never block a decision on playback failure. Playback uses macOS `afplay`, at the system volume, with a timeout; other platforms silently skip audio. These match `claude-profiles/default.json` at commit `42387a7` (September 1, 2026), the last version before September 2.

```bash
node codex-shared/hooks/sound.mjs attention </dev/null
node codex-shared/hooks/sound.mjs complete </dev/null
npm run test:config
```

Hooks use `${CODEX_HOME:-$HOME/.codex}`. Launch custom homes with `CODEX_HOME=/path/to/config codex`. Global guidance replaces Claude-specific reminder/cache-heal hooks; no prompt text is re-injected on every turn. No LSP plugin is installed; use available symbol tools or the project's typechecker when needed.

### Backups and rollback

Setup moves real destinations to `<name>.bak.<timestamp>` before linking. Re-running unchanged setup is a no-op; existing symlinks are repointed. Restore a real config by removing its symlink and renaming the chosen backup back to the original filename. Restore the associated `AGENTS.md` and `hooks.json` backups the same way. Shared skills remain in this repository.

### Sources

- [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
- [Subagents and role precedence](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Hook events and trust](https://learn.chatgpt.com/docs/hooks)
- [Context7 Codex integration](https://github.com/upstash/context7/blob/master/docs/clients/codex.mdx)
- [Superpowers installation](https://github.com/obra/superpowers#codex-cli)
