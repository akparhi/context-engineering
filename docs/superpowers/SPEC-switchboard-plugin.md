# Switchboard Plugin — Spec

**Status:** approved, not started
**Date:** 2026-09-22
**Owner:** akparhi

## What this is

A Claude Code plugin that puts external models in the `/model` picker and exposes
them as named subagents, routing inference through a local gateway. Vendored from
[greenpolo/cc-multi-cli-plugin](https://github.com/greenpolo/cc-multi-cli-plugin)
(Apache 2.0), stripped to two providers and ported to Bun.

Lives at `plugins/switchboard/` in this repo.

## Why not the existing switchboard daemon

The `switchboard` daemon at `~/Projects/Home/switchboard` already does Anthropic⇄OpenAI
translation, model discovery and vision hooks. It stays untouched. This plugin replaces
the *daemon's role*, not the menu-bar app's profile patching — different jobs.

What the daemon cannot do: put rows in `/model`. That needs `modelPicker.options`
passed via `--settings`, which needs a launcher. That launcher is what we are vendoring.

## Non-goals

- OpenRouter. Dropped.
- Cursor, Antigravity, Grok. Deleted from the fork.
- Live model discovery. Curated static catalog instead — we want good labels and
  descriptions, which discovery cannot supply.
- Changing anything in the `switchboard` daemon or menu-bar app.

---

## Background: how this actually works

Three independent mechanisms. Upstream markets them as one "Mods" feature; they are not.

| Mechanism | Purpose | Stability |
|---|---|---|
| `modelPicker.options` in `--settings` | Adds rows to `/model` | Stable since CC 2.1.242 |
| `ANTHROPIC_BASE_URL` on the spawned child | Routes inference to the gateway | Stable |
| Mods / function hooks | In-process UI, policy, compaction intercepts | **Preview**, gated by `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` |

`modelPicker` does **not** require Mods. The `behavesAs` field on a row makes an unknown
model id *known* to Claude Code, which is what defeats the `[claude-code:unrecognized_model]`
gate. No binary patching is involved or needed.

### Verified against the installed binary

Claude Code 2.1.278 contains, verbatim:

> Curate the /model picker: an ordered list of models with your own labels, independent
> of the built-in lineup and of Claude Code releases. availableModels still applies to
> these rows. Honored from managed, `--settings`/SDK, and user settings only (not from a
> project checkout); the highest-precedence of those that defines modelPicker wins
> outright (no merging across sources).

`output_config.effort` is also a first-class Claude Code field (21 occurrences), not an
upstream invention. Claude Code clamps it itself and retries without it if an endpoint
rejects it.

---

## Scope

### Providers

| Source | Upstream origin | Protocol | Auth |
|---|---|---|---|
| Codex (`openai`) | `plugins/multi-openai` verbatim | OpenAI Responses | `~/.codex/auth.json`, refreshed by `codex app-server` subprocess |
| opencode-go (`zen`) | `plugins/multi-zen`, trimmed | Chat Completions | Zen API key |

Endpoint note: the Codex path targets `https://chatgpt.com/backend-api/codex/responses`,
not `api.openai.com`. That endpoint requires `store: false` and streaming, and does not
accept `max_tokens` — upstream drops it silently. Keep that behaviour.

### Catalog

Static, curated, config-gated. Each entry expands to **one bare row plus one row per
listed effort**.

```
{ id: 'gpt-5.6-sol',         source: 'openai', label: 'GPT-5.6 Sol',   efforts: ['low'] }
{ id: 'gpt-5.6-luna',        source: 'openai', label: 'GPT-5.6 Luna',  efforts: ['none','low','medium'] }
{ id: 'gpt-6-astra',         source: 'openai', label: 'GPT-6 Astra',   efforts: ['low'] }
{ id: 'deepseek-v4.1-flash', source: 'zen',    label: 'DeepSeek V4.1 Flash', efforts: [] }
```

Resulting `/model` rows:

| Row | Effort behaviour |
|---|---|
| `GPT-5.6 Sol` | follows Claude Code (`output_config.effort`, else `budgetEffort`) |
| `GPT-5.6 Sol · low` | pinned |
| `GPT-5.6 Luna` | follows Claude Code |
| `GPT-5.6 Luna · none` | zero reasoning tokens, no summary |
| `GPT-5.6 Luna · low` | pinned |
| `GPT-5.6 Luna · medium` | pinned |
| `GPT-6 Astra` | follows Claude Code |
| `GPT-6 Astra · low` | pinned |
| `Zen · DeepSeek V4.1 Flash` | native reasoning; `/effort` not applicable |

Same list is exposed as named subagents (`openai-sol`, `openai-sol-low`, …), spawnable
via Task.

The bare row is upstream's existing pattern — `models.ts:19` maps `''` to
`{ effort: 'medium' }`. **Change that default from `'medium'` to "whatever Claude sent"**,
which is what `budgetEffort` already computes.

### Effort levels

`EFFORTS = ['none', 'low', 'medium', 'high']`

Two deltas from upstream, both required:

1. **Add `none`.** Upstream has no such level. It is accepted and honored by the Responses
   API (0 reasoning tokens, no summary) but absent from every model's advertised levels,
   so it only reaches callers if the catalog adds it. Only meaningful for models that
   reason at all.
2. **Drop `xhigh`, `max`, `ultra`.** Cap at `high`.

**`budgetEffort` must be clamped, not just the enum shrunk.** Its `budget > 24576` branch
currently returns `'xhigh'`; with the shrunk enum `isEffort()` would reject that and throw
mid-request. Clamp to `'high'`.

Also revisit `thinking.type === 'disabled' → 'low'`. Upstream had no `none`, so it settled
for the nearest. `disabled → none` is the honest mapping now.

An explicit out-of-range effort (saved session, hand-typed `/effort`) **clamps down to
`high`** rather than throwing.

Effort resolution order:

1. Model id suffix (`-low`) from the catalog row — pinned rows
2. `output_config.effort` — `/effort`, when the row is bare
3. `budgetEffort(thinking)` — inferred from token budget
4. Provider default

Upstream has no suffix concept; this ordering is ours and must be written deliberately,
not inherited.

---

## Prompts and instructions

Five layers. Port all Codex prompt assets verbatim; opencode ships with none.

**1. Provider instructions — `providers/codex/instructions.md`** (123 lines, copy as-is).

Prepended to every Codex request through `instructions.ts`:

```ts
const instructions = readFileSync(new URL('./instructions.md', import.meta.url), 'utf8').trim();
export function openaiInstructions(runtime: string): string {
  return `${runtime}\n\n# OpenAI provider instructions\n\n${instructions}`;
}
```

A system prompt adapted from Codex's own gpt-6-astra template, fetched upstream
2026-09-10. Sections: when to ask permission, autonomy and persistence, personality.
Purpose is behavioral — GPT models running inside Claude Code otherwise stop early and
ask for confirmation constantly, lacking Codex's native framing.

Note it overlaps this repo's CLAUDE.md "Directives: Just do it". Both push toward action,
so no conflict in practice, but the provider prompt is the weaker of the two and the
user's own instructions win.

**2. Guardian approval reviewer — `providers/codex/guardian/`** (5 files, copy as-is).

| File | Role |
|---|---|
| `policy.md` (8.3K) | reviewer's standing rules — hard blocks, soft blocks |
| `policy-template.md` (9.7K) | scaffold with a `{{ tenant_policy_config }}` slot |
| `LICENSE`, `NOTICE` | separately licensed, upstream-credited — keep intact |
| `README.md` | provenance |

Flow (`approval.ts:113-147`): before a gated action runs, the gateway builds a classifier
prompt from template plus policy, sends transcript and tool definitions as **evidence, not
instructions**, and receives JSON `{outcome, risk_level, user_authorization, rationale}`.

Injection defenses worth preserving verbatim:

- `tool_result` blocks are declared untrusted tool output, not user authorization.
- Delegated user-role messages in a worker transcript are not independent human approval;
  only `root_request` carries that.
- Claude Code's own permission policy enters as an *additional restriction* that can only
  deny, never authorize or weaken (`approval.ts:221`).
- Malformed or ambiguous policy is treated as unavailable and denied.

Costs one extra model call per gated action. Accepted.

**3. Worker prompt** — upstream is one shared string, `launcher.ts:74`:

```js
const WORKER_PROMPT = 'Complete the delegated task.';
```

Replace with per-model prompts. The repo's own `claude-shared/agents/*.md` are the
quality bar.

**4. Worker description** — the only signal Claude has when routing work to Luna vs Sol.
Upstream generates `` `${model}, ${effort} reasoning. Native coding, investigation, and review.` ``
Write these per model by hand.

**5. `behavesAs`** — `pickerProfile(adjustableEffort)` returns `claude-sonnet-4-6` when the
model has an effort dial, else `claude-haiku-4-5`. Both resolve to 200K in current Claude
Code. Upstream deliberately avoids xhigh profiles because they imply native 1M.

### Opencode has no prompt layer

Verified: no `.md` assets, no guardian, no instructions module in `multi-zen/src/`.
`chat.ts:366` passes Claude Code's own `system` field through as an OpenAI `system`
message and nothing more.

Deliberate upstream: "Zen never borrows Codex review. Missing GPT review fails
explicitly." Do not synthesize an opencode equivalent — asymmetry is the design.

### The `behavesAs` context trap

Measured by the `cc-proxy-plugin` author, recorded here so it is not rediscovered:

- `behavesAs` makes the id known, which **disables `CLAUDE_CODE_MAX_CONTEXT_TOKENS`**,
  pinning the row to 200K.
- A `[1m]` suffix **on the row's own `model`** is the only surviving window channel.
- A suffix on the `behavesAs` *target* does nothing — `behavesAs: "claude-sonnet-4-5[1m]"`
  still yields 200K.
- Per-row windows below 200K are inexpressible. Accept it.

---

## Caching

Audited upstream and **verified correct**. Adopt as-is, with one fix.

Baseline: 442/442 unit tests pass (118s). Cache-specific: 4/4.

### Codex path — real prompt caching

`server.ts:450`:

```js
request.prompt_cache_key = createHash('sha256')
  .update(JSON.stringify(['openai', session, agentId ?? 'main', request.model]))
  .digest('hex');
```

Message content deliberately excluded, so the key is stable turn-to-turn. Their test
`native-gateway.test.ts:574` asserts: same key across differing history, same key across
gateway restart, distinct keys per session / worker / model.

### Usage arithmetic — correct

`responses.ts:860`:

```js
input_tokens: Math.max(0, (usage?.input_tokens ?? 0) - cached - written),
cache_read_input_tokens: cached,
cache_creation_input_tokens: written,
```

Correct because OpenAI's `input_tokens` is inclusive of cached. Test proves 100 in /
40 cached → `input_tokens: 60, cache_read: 40`.

The Chat path (`chat.ts:534`) is more defensive still, probing three field spellings
before defaulting to 0 — Zen normalizes vendor shapes inconsistently.

### Three different paths — know which is which

| Path | Key on the wire | Usage math |
|---|---|---|
| Codex | `prompt_cache_key` in body | correct, tested |
| Zen `responses` protocol | `prompt_cache_key` in body (`request.ts:78`) | correct |
| Zen `chat` protocol (**DeepSeek**) | none in body; `x-opencode-session` header only | correct (`chat.ts:534`) |

DeepSeek therefore gets **sticky routing, not prompt caching**. Defensible — Chat
Completions has no `prompt_cache_key` field. Whatever caching happens is DeepSeek's own.

### Zen cwd in the cache key — keep it

`server.ts:1063` hashes `process.cwd()` into the Zen key:

```js
JSON.stringify([session, agentId ?? 'main', body.model, process.cwd()])
```

Launching from a different directory yields a different key and so a different upstream
node. **Decided: keep verbatim.** A different directory means a different conversation
anyway, so losing routing affinity across it costs nothing. The Codex key omits cwd; that
asymmetry stands.

Impact is bounded regardless: DeepSeek runs the `chat` protocol, which carries no
`prompt_cache_key` in the body (`request.ts:45-80`) — only the `x-opencode-session`
header. So this key buys routing stickiness, never token savings.

### Known, not a defect

Reasoning state injected into `input[]` does not affect the cache key, but does shorten
the cacheable prefix after the first reasoning block. Inherent to prefix caching.

### To verify once running

Whether Zen's `/chat/completions` ever reports non-zero `cached_tokens` for DeepSeek. If
always 0, empty cache columns in `/multi-usage` are expected, not a bug.

---

## Reasoning state — strictly better than switchboard

Both request `reasoning: { effort, summary: 'auto' }` and render summary deltas into
Anthropic `thinking` blocks. They diverge on what happens to `encrypted_content`.

| | multi-cli | switchboard daemon |
|---|---|---|
| `reasoning.summary: 'auto'` | yes | yes (`sources/codex/request.ts:171`) |
| `include: ['reasoning.encrypted_content']` | always (`responses.ts:659`) | only when `effort !== 'none'` (`request.ts:581`) |
| Summary to `thinking` blocks | yes | yes (`stream.ts:305-321`) |
| **Round-trips `encrypted_content` upstream** | **yes** | **no** |

Switchboard asks for `encrypted_content` and then discards it — no `signature` handling
anywhere in the daemon. Reasoning state dies at the end of each response.

multi-cli serializes it into the Anthropic `thinking.signature` field, decodes it on the
next request, and replays the `reasoning` item to OpenAI (`responses.ts:548-555`). The
model keeps its chain of thought across turns inside a tool loop, and the gateway stays
stateless because the state rides in the transcript Claude Code already replays.

It hard-fails when OpenAI omits the encrypted state (`responses.ts:1100-1102`) rather than
dropping it silently.

Arrives for free with the `responses.ts` copy. One of the reasons to port rather than
extend the existing daemon.

---

## Codex auth — shared `~/.codex/auth.json`, accepted

`providers/codex/auth.ts` reads the shared Codex credential file (`auth.ts:32`) and
renews it by spawning `codex app-server -c cli_auth_credentials_store="file"` with
`CODEX_HOME` pointed at its directory (`auth.ts:161-166`).

This contradicts the existing daemon's rule (`switchboard/CLAUDE.md:63`): *"Runs its own
OAuth and never reads `~/.codex/`: two daemons sharing one refresh token log each other
out on rotation."*

**Decided: port verbatim.** Upstream mitigates with compare-then-refresh rather than
isolation — `refreshIfUnchanged` re-reads the file and returns early when another process
already rotated it (`auth.ts:152-155`). That closes the common race.

Residual risk, accepted: running the existing switchboard daemon and this plugin
concurrently against the same ChatGPT account can still cross-rotate and log one out.
Not a new failure mode introduced by the port — it is the upstream design. Mitigation if
it bites: retire the daemon's Codex source, or swap this one file for the daemon's
isolated OAuth.

---

## What differs from upstream

Target is a 100% port. Two categories of difference, neither a rewrite.

**Our own addition — effort-suffixed catalog:**

| # | Change | Reason |
|---|---|---|
| 1 | Effort clamped to `none`/`low`/`medium`/`high` | xhigh and ultra out of scope. Touches `EFFORTS`, `budgetEffort`, worker generation |
| 2 | Static `CATALOG` + `pickerRows`/`workerDefinitions` (new files) | upstream generates every effort for every model; we expose an explicit curated list |
| 3 | `splitEffortSuffix` (new file) | parse `gpt-5.6-luna-medium` back to base plus effort. Upstream has no suffix parsing |

**Scope reduction — dropping what we do not use:**

| # | Change | Consequence |
|---|---|---|
| 4 | Providers cursor, antigravity, grok removed | ~6.6K LOC. Forces edits in `provider.ts`, `register.ts`, `workers.ts`, `approval.ts` |
| 5 | Bun plus oxc instead of Node 24.12 plus tsc/eslint | `executable.ts` and `process-tree.ts` need spawn-semantics review |

Everything else is copied verbatim: Zen cwd cache key, `instructions.md`, `guardian/`,
`responses.ts` translation, encrypted-reasoning round-trip, `prompt_cache_key` derivation,
all gateway mod-* files, all hooks, `WORKER_PROMPT` handling.

---

## Mods hooks

Keep all three areas. All are preview-API surface and may break between Claude Code
releases.

**(a) Progress / UI** — `lifecycle.ts` binds `turn.step`, `turn.complete`, `session.detach`.
Polls the gateway ~1.5s and calls `$.ui.status(...)`, painting
`gpt-6-astra · main · running · 12s`. `usage.ts` adds the `/multi-usage` pane via
`$.ui.openPane()` and can inject quota snapshots into context before subagent spawn.
**Fully provider-agnostic — port as-is.**

**(b) Permission state** — pushes Claude's `permissionMode` to providers. A monotonic
`generation` counter versions each prompt so a late callback cannot apply stale policy.
**~80% harness-specific.** `ModBridge` session/generation tracking is generic; worker
spawn/policy is not.

**(c) Compaction** — intercepts `session.compact`. On `trigger: 'precompute'` it kicks off
summarization on the gateway and returns `{ skip: … }`, so work happens outside the 1500ms
hook budget. On real compaction it serves the precomputed summary, gated by a SHA-256
prefix digest — applied only if the original messages are still a prefix of the current
transcript. Otherwise falls back to native. **Fully provider-agnostic — port as-is.**

### Fallback is clean

Every hook guards on `MULTI_MOD_GATEWAY_URL` + `MULTI_GATEWAY_TOKEN`; missing either →
immediate `next(event)`. Request helpers return `undefined` on failure rather than throwing.
No hook can crash Claude Code. With `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` off, the module
never loads.

### Delete during strip-down

- The 6 Cursor display-tool bindings (`register.ts:13-17`, 18 `on()` registrations)
- `agent.offer` / `agent.spawn` / `classic.SubagentStart` handlers
- `isHarnessModel` paths and `ensureHarnessPolicy` / `admitPrompt`

`$` surface actually used: `$.session.*`, `$.env.*`, `$.http.*`, `$.ui.*`, `$.command.register`.
No `$.fs.*`.

---

## Launcher

Command name: **`switchboard`**.

Note this collides conceptually with the existing daemon/app of the same name, which stays
untouched. One-line rename if it becomes annoying.

Scoped-launcher model, as upstream: sets `ANTHROPIC_BASE_URL` on the **spawned child only**,
so plain `claude` stays clean.

Arg forwarding, `launcher.ts:1278`:

```js
['--settings', settingsFile, '--agents', definitions, ...args, ...pluginDirectory]
```

Caller args survive.

### Hard failures to preserve (`launcher.ts:327`)

- `ANTHROPIC_BASE_URL` already set in env → refuse to launch
- `--agents` passed by caller → refuse; launcher supplies its own
- `--bg` / `--background` / `attach` / `respawn` → refuse; sessions must stay attached

### Agent-file frontmatter is strict

The launcher rejects an agent `.md` whose first byte is not `-`. Claude Code tolerates a
leading blank line; this parser does not. Three files in `claude-shared/agents/` hit this
and were fixed 2026-09-22.

### VS Code

`claudeCode.claudeProcessWrapper` in VS Code settings points at the launcher. Currently set
to `~/.local/share/multi-cli/bin/claude-multi`; repoint when the fork's binary exists.

### Trap

An inline `ANTHROPIC_BASE_URL=… claude` prefix is **silently ignored** — the `env` block in
settings.json overrides process env. The turn succeeds and the answer looks right while
hitting the wrong proxy. Only `--settings` works.

---

## Tech stack

- **Bun** ≥1.2 runtime, matching the repo's `engines`
- **oxc / oxlint** replacing upstream's Biome
- Deps kept: `js-tiktoken` (local `count_tokens` estimate, `o200k_base`), `yaml`
- Dep dropped: `@cursor/sdk`
- Node-specific spots needing attention: `executable.ts`, `process-tree.ts`

Single flat plugin, not a plugin-of-plugins:

```
plugins/switchboard/
  .claude-plugin/plugin.json
  hooks/{hooks.json,register.ts,…}
  src/gateway/
  src/providers/{codex,opencode}/
  src/catalog.ts
  bin/switchboard
```

## Port budget

| Area | LOC | Action |
|---|---|---|
| `multi-core/src/gateway` | 5173 | port, minus dropped providers |
| `multi-core/src` launcher | 1479 | port |
| `multi-core/hooks` | 1224 | port all three areas |
| `multi-openai/src` | 2010 | port verbatim |
| `multi-zen/src` | 1638 | port `chat/auth/request/usage`; rewrite `models.ts` |
| cursor + antigravity + grok | 6587 | **delete** |

~11.5K in, 6.6K dropped. No new adapter code — the writing is the catalog, the effort
rules and the prompts.

Provider coupling in core to unpick: cursor touches 6 gateway files, antigravity 3, grok 3.
`cursor-settings.ts` (13.8K) deletes outright.

## License

Apache 2.0. Preserve `LICENSE` and `NOTICE`; add our own attribution. Upstream `NOTICE`
already credits OpenAI's `codex-plugin-cc` and others.

## Reference checkout

`context-engineering/.local/cc-multi-cli-plugin` at `b3220ef`, full history, for diffing
against upstream. **Add `.local/` to `.gitignore`** — currently untracked and unignored.

---

## Open questions

1. Whether Zen `/chat/completions` accepts `reasoning_effort` for DeepSeek. Upstream's
   catalog says no. If yes, DeepSeek gains effort rows.
2. Whether to keep upstream's `/multi-usage` command name or rename to `/switchboard-usage`.

Closed since drafting: the Zen cwd cache key stays verbatim (a different directory is a
different conversation); `instructions.md` and `guardian/` port as-is; opencode is
confirmed to have no prompt layer of its own and gains none.

## Resolved

**Per-subagent model selection is native to Claude Code 2.1.278.** Verified against the
binary: `agentModel`, `agentModelSource`, `resolvedAgentModel`,
`CLAUDE_CODE_SUBAGENT_MODEL_FORCE`, and a `model` field on agent definitions. Its own
guidance string:

> Set this only when EXPLICITLY asked by the user for a specific model, never because the
> task seems small, simple, or cheap; otherwise omit it so the worker uses the default
> (the session model, unless a default subagent model is configured).

This is the original goal — Fable/Opus orchestrating, Luna/DeepSeek as subagents — and it
needs no patching. Upstream already relies on it: every worker in `workerDefinitions()`
carries `model: \`multi/openai/${model}\``. The plugin's job is to make those ids
*resolvable*, which `modelPicker` + `behavesAs` + the gateway do.
