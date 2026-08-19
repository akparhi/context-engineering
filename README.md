# work/ — Claude Code config for work machine

Two files, two jobs: `settings.json` configures the *harness* (what the tool is allowed to do, which models, which plugins). `CLAUDE.md` configures the *agent* (how it behaves once running).

---

## settings.json

### Session & model

| Key | Value | Why |
|---|---|---|
| `cleanupPeriodDays` | `14` | Transcript retention. Long enough to resume last week's thread, short enough to not hoard. |
| `alwaysThinkingEnabled` | `false` | Thinking on demand, not by default — most turns don't need it and it costs latency. |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | `claude-opus-5` | Pin the alias so `--model opus` doesn't drift when a new default ships. |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | `claude-sonnet-4-6` | Same pinning for the workhorse tier used by subagents. |
| `CLAUDE_CODE_EFFORT_LEVEL` / `effortLevel` | `low` | Default to cheap/fast. Depth comes from spawning a stronger subagent, not from making every turn expensive. |
| `CLAUDE_CODE_DISABLE_1M_CONTEXT` | `0` | 1M window available — headroom, not the operating point. |
| `CLAUDE_CODE_AUTO_COMPACT_WINDOW` | `300000` | Compact at 300k. The chosen working ceiling. |

The last two are the core context-engineering bet: **a large context is a liability, not a feature** — attention degrades and cost climbs as the window fills, so work should be decomposed into subagents with small, purposeful contexts. The pair implements that as a *soft* ceiling rather than a hard wall: compaction kicks in at 300k, well short of the limit, so the default pressure is still toward delegation; but the 1M ceiling above it means long single-threaded work that genuinely needs room (a wide refactor, a large diff review) degrades into compaction instead of hitting a refusal. Discipline by default, escape hatch when the task earns it.

`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` is the umbrella kill-switch for outbound traffic that isn't the conversation itself — the docs' phrasing is "disable all non-essential traffic at once." It covers four categories: usage metrics (latency/reliability/usage patterns, to Anthropic and third-party logging), error reports (messages and stack traces to a third-party error tracker), session quality surveys and the follow-up transcript-share prompt, and feature-flag evaluation. It subsumes `DISABLE_TELEMETRY` and `DISABLE_ERROR_REPORTING`, so neither is needed alongside it.

Two things it does **not** touch, worth knowing given the rest of this file:

- **Auto-updates are unaffected.** Update checks go to `downloads.claude.ai`, outside this switch — only `DISABLE_AUTOUPDATER` stops them. `autoUpdatesChannel: "latest"` keeps working.
- **The WebFetch domain safety check still runs** (disabled only by `skipWebFetchPreflight`), as does official-marketplace auto-install (its own `CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL`).

The one real interaction: killing feature-flag evaluation also disables **Remote Control**, which this config already turns off via `disableRemoteControl: true` — consistent, but note the dependency if that's ever re-enabled. Nothing here affects model or context behavior; it's purely outbound network. `CLAUDE_CODE_ENABLE_TELEMETRY=0` is redundant beside it — harmless, and explicit about intent.

Sources: [data-usage](https://code.claude.com/docs/en/data-usage.md), [network-config](https://code.claude.com/docs/en/network-config.md), [setup](https://code.claude.com/docs/en/setup.md).

| Key | Value | Why |
|---|---|---|
| `ENABLE_LSP_TOOL` | `1` | Real symbol resolution. Pairs with the `CLAUDE.md` rule "never grep-guess" for definitions/usages. |
| `CLAUDE_CODE_ENABLE_TELEMETRY` | `0` | Off. |
| `disableClaudeAiConnectors` | `true` | Ignore connectors configured on claude.ai; declare MCP servers per project in that project's `.mcp.json` instead. Config lives with the repo that needs it, so a project's tool surface is explicit, reviewable, and doesn't leak into unrelated sessions. |

### Permissions

`defaultMode: "bypassPermissions"` + `skipDangerousModePermissionPrompt: true` — no prompts. This is the harness half of the `CLAUDE.md` "Just do it" directive: a config that asks permission every turn contradicts an agent told not to ask. Safety is relocated from per-call prompts to the `deny` list and to git being recoverable.

`allow` is the ordinary working set (Bash, Edit/Write, Read, Grep/Glob, Web*, Skill, Todo*). Nothing exotic.

`deny` blocks two categories:

- **Noise reads** — `./dist/**`, `./next/**`, `./.env.example`. Build output and templates burn context and teach nothing. Denying them is context hygiene, same motive as the window cap.
- **Whole features** — `EnterPlanMode`/`ExitPlanMode`, `EnterWorktree`/`ExitWorktree`, `Cron*`/`ScheduleWakeup`, `Notebook*`, `PushNotification`. Deliberate scope reduction: fewer available modes means fewer paths where the agent wanders off into ceremony.

Reinforced by `disableRemoteControl`, `disableWorkflows`, `disableArtifact` — no remote drivers, no workflow engine, no artifact surface.

### Hooks — audio only

No hook mutates state; every one is `afplay`.

- `Funk.aiff` on `PermissionRequest`, and pre-`AskUserQuestion` / pre-`ExitPlanMode` → **"I'm blocked on you."**
- `Submarine.aiff` on `Stop` → **"I'm done."**

Two sounds, two meanings. With prompts bypassed and effort low, the expected mode is fire-and-forget; the only thing needed from the terminal is an audible interrupt when the agent actually needs a human. `Notification`, `PostToolUse`, `UserPromptSubmit` are present-but-empty as declared slots.

### Plugins

Enabled: `superpowers` (skills), `commit-commands`, `context7` (live library docs), `typescript-lsp` (backs `ENABLE_LSP_TOOL`). Disabled: `chrome-devtools-mcp` — kept installed, off until a browser task needs it, because an idle MCP server still spends context on tool schemas.

### UI

`tui: fullscreen`, `verbose: true`, `theme: auto`, `plansDirectory: ./.claude/plans`. Off: `spinnerTips`, `tips`, `promptSuggestion`, `terminalProgressBar` — suggestion surfaces are noise for someone who already knows what to type.

`fileCheckpointingEnabled: true` — snapshots files before Claude edits them, so Esc-Esc / `/rewind` can undo an edit without a commit. It covers the gap the checkpoint-commit rule leaves: an unwanted edit *between* commits otherwise has no recovery short of `git checkout`, which discards everything uncommitted rather than just the bad edit. The two layers divide by durability — checkpoints are in-session and expire with `cleanupPeriodDays`; git is the durable, reviewable, pushable record. Limits worth knowing: snapshots cover Claude's file edits only, not manual edits and not files changed by a Bash command, and they don't survive branch switches.

---

## CLAUDE.md — the philosophy

Five sections, all downstream of one premise: **the scarce resource is the model's attention, and the second scarcest is mine.**

**1. Just do it.** Confirmation prompts are the default failure mode of coding agents — asked-for work arrives as a menu of options instead. So: clear directive → execute, no alternatives, and never cite the instruction back. The exception is drawn on a precise line, not a vague "risky": recoverable (any git op — force-push-with-lease, reset, rebase, squash) proceeds; **irreversible + unrecoverable** (data loss, outward-facing sends) gets one short confirm. Git is recoverable, so git is free.

The counterweight is scope: **a directive authorizes that request only.** Commits/pushes/merges on main, PRs, deploys need an explicit ask *every time* — because "just do it" without a scope fence turns one approval into standing consent. Checkpoint commits are carved out (commit freely, never push).

**2. Output brevity.** Ultra-compressed prose as default. But the rules are mostly about what compression *isn't*: never drop negations, never invent abbreviations, never symbol-substitute — those cost the same tokens and read worse. Compress by deleting clauses that carried no decision. Code, paths, exact error strings stay verbatim: they're lookup keys. And compression is explicitly **suspended** for security warnings, irreversible-action confirms, breaking changes, and order-dependent sequences — the places where a dropped clause causes real damage.

**3. Working principles.** The orchestrator rule: main session coordinates, subagents do independent chunks. The reason is context, not parallelism — the coordinator's window stays clean for judgment while each chunk gets a fresh, focused one. Model tiering is cost discipline (haiku for transcription/exploration, sonnet for implementation, opus for architecture/final review). Artifacts pass as **files**, not pasted into prompts — a path costs a few tokens, its contents cost thousands. With an explicit carve-out: small targeted tasks and debugging stay in-session, since fanning out a two-line fix is pure overhead.

The 1%-skill rule is deliberately absolutist. Under time pressure a "probably don't need it" judgment is nearly always wrong, so the threshold is set where no judgment is required.

**4. Code exploration.** Tool defaults ranked by precision: `ast-grep` for TS/JS (syntax-aware, so it can't match a string that looks like code), `fd` over `find`, `LSP` for symbols — never grep-guessing. Grep is the fallback for genuinely non-syntactic targets (comments, logs, non-JS files). Choosing the right tool up front is the cheapest context saving available.

**5. Coding standards.** Opens with the tiebreaker — *write for the next reader; where any rule conflicts with readability, readability wins* — so nothing below can be cited to produce clever-but-opaque code.

- **Structure:** happy path top-to-bottom; abstract on what *varies* (storage, transport, clock), never on caller count — can't name the axis → duplicate, since a boundary at the wrong joint can't be moved later. Dependencies point inward, business rules in the model, organize by feature not `utils/` grab-bags.
- **Data & contracts:** every important write names its source of truth and consistency/durability expectations; derived data declares staleness and rebuild path; replayed work is idempotent; schemas are versioned contracts that must survive old code and in-flight messages. Assume crashes, duplicates, reordering, unknown success.
- **YAGNI ladder:** a 7-rung stop-at-first-hit sequence — needs to exist? → already here? → stdlib? → platform feature? → installed dep? → one line? → minimum that works. It exists to pre-empt the model's bias toward building frameworks. Shortcuts get marked with their ceiling and upgrade path (`// yagni: global lock, per-account if throughput matters`). Hard floor: never simplify away validation, data-loss-preventing error handling, security, accessibility, or anything explicitly asked for — **the ladder governs implementation, not requirements.**
- **Comments:** default none. Inline says *why*, never *what*; doc comments may state contract. Never narrate the diff — git owns history. Prefer names that carry the meaning (`IDLE_TIMEOUT_ADMIN`) over a comment explaining a magic number.

---

## The two files together

`settings.json` makes the `CLAUDE.md` rules *enforceable* rather than advisory:

- "Just do it" ⟷ `bypassPermissions`, `skipDangerousModePermissionPrompt`
- "orchestrate with subagents" ⟷ 300k compact window + `effortLevel: low`, so decomposition is the cheap path to depth (with 1M headroom when a task genuinely needs it)
- "never grep-guess symbols" ⟷ `ENABLE_LSP_TOOL` + `typescript-lsp`
- "checkpoint commits" ⟷ `fileCheckpointingEnabled: true` as the in-session layer beneath them; git stays the durable record
- "context is precious" ⟷ `deny` on `dist/`/`next/`, compaction at 300k, unused MCP off
- Prompts bypassed ⟷ audio hooks as the only human-attention channel

---

## Marketplace

This repo doubles as a private Claude Code plugin marketplace. On a new machine, register the marketplace and install the hindsight plugin:

```bash
claude plugin marketplace add /path/to/context-engineering
claude plugin install hindsight@akparhi
```

Profile settings are still chosen per machine from `work/`, `darkforest/`, or `shared/`.

See [`plugins/hindsight/README.md`](plugins/hindsight/README.md) for what the hindsight plugin does and how to use it.
