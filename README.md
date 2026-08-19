# context-engineering

Claude Code configuration, shared skills, and a private plugin marketplace — everything needed to bring a new machine up to a working setup.

The premise throughout: **the scarce resource is the model's attention, and the second scarcest is mine.** Config, skills, and plugins here all follow from that.

## Layout

```
claude-profiles/    one settings.json per machine
  default.json      the default profile
  darkforest.json
claude-shared/      config every profile links to
  CLAUDE.md         how the agent behaves
  skills/           ast-grep, ast-grep-outline, frontend-design
  output-styles/    terse-ste
plugins/            this repo is also a plugin marketplace
  hindsight/        turns corrections into contextual project rules
bin/link-profile    symlinks a config directory at the above
```

## Setup on a new machine

```bash
bin/link-profile                    # default profile -> ~/.claude
bin/link-profile darkforest         # named profile -> ~/.claude
bin/link-profile default ~/.work    # explicit profile and destination
```

Links `settings.json` to the chosen profile, and `skills/`, `output-styles/`, `CLAUDE.md` to `claude-shared/`. Re-running is safe: an existing symlink is repointed, and a real file is moved to `<name>.bak.<timestamp>` rather than overwritten — on a machine that already has config, that file is the only copy.

Then register the marketplace and install the plugin:

```bash
claude plugin marketplace add /path/to/context-engineering
(cd /path/to/context-engineering/plugins/hindsight && bun install --frozen-lockfile || npm ci)
claude plugin install hindsight@akparhi
```

The dependency install is required — the MCP server will not start without it, so `record`, `distill`, and `apply` will not exist even though the plugin is registered.

## What's here

### claude-profiles/ — the harness

`settings.json` decides what the tool may do; `claude-shared/CLAUDE.md` decides how the agent behaves once running. The two are written to match, so the rules are enforceable rather than advisory.

| Area | Choice | Why |
|---|---|---|
| Context window | compact at 300k, 1M available | A large context is a liability — attention degrades and cost climbs as it fills. A soft ceiling keeps the pressure toward delegation while leaving headroom for work that genuinely needs it. |
| Effort | `low` by default | Depth comes from spawning a stronger subagent, not from making every turn expensive. |
| Permissions | `bypassPermissions`, no prompts | A config that asks every turn contradicts an agent told not to ask. Safety moves to the `deny` list and to git being recoverable. |
| Denied | `dist/`, `next/`, plan/worktree/cron/notebook modes | Build output teaches nothing; fewer modes means fewer paths to wander down. |
| Models | pinned aliases | `--model opus` shouldn't drift when a new default ships. |
| Symbols | `ENABLE_LSP_TOOL` + `typescript-lsp` | Backs the "never grep-guess a definition" rule with real resolution. |
| Telemetry | `DISABLE_NONESSENTIAL_TRAFFIC` | One switch covering metrics, error reports, surveys, feature flags. Does not affect auto-updates. |
| Hooks | audio only | With prompts bypassed, a sound is the only signal that the agent needs a human: one for blocked, one for done. |

`darkforest.json` differs from `default.json` only in machine-specific paths.

### claude-shared/CLAUDE.md — the agent

Five sections: **just do it** (clear directive → execute; the confirm line is drawn at irreversible *and* unrecoverable, so git operations are free); **output brevity** (compress by deleting clauses that carried no decision — never negations, never invented abbreviations; suspended for security warnings and irreversible-action confirms); **orchestration** (main session coordinates, subagents do independent chunks — the reason is context hygiene, not parallelism; artifacts pass as file paths, never pasted); **exploration defaults** (`ast-grep` for TS/JS, `fd` over `find`, LSP for symbols); **coding standards** (a YAGNI ladder that stops at the first rung that holds, with a hard floor at validation, security, and anything explicitly asked for).

### claude-shared/skills/

`ast-grep` and `ast-grep-outline` for syntax-aware search — a structural pattern can't match a string that merely looks like code. `frontend-design` for UI work.

### plugins/hindsight/

Records the corrections you give Claude during a session and distills them into a handful of sharp rules under `.claude/rules/`. Lessons scoped to one area load only when a matching file is in context, so they cost nothing in sessions that never touch it. See [`plugins/hindsight/README.md`](plugins/hindsight/README.md).
