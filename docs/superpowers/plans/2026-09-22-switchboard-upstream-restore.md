# Switchboard upstream-restore plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development. Checkpoint commit per task: `restore-T<n>: <description>`.

**Goal:** port multi-cli as is, adding effort-tagged models; all other behaviour stays the same. User rule: "make minimal changes over upstream from multi-cli, we don't want absurd deviations".

**Upstream:** `/tmp/ccmcli` @ b3220ef. `plugins/multi-core/src` maps to `src/`, `plugins/multi-openai/src` to `src/providers/codex/`, `plugins/multi-zen/src` to `src/providers/opencode/`, and `test/unit/*` to `tests/*`.

**Port:** `plugins/switchboard/`. All paths below are relative to it.

**Restore base:** commit `290dcd9` is the pre-catalog state: upstream minus the dropped providers. `git show 290dcd9:plugins/switchboard/<file>` gives the starting point for every file touched since.

**Diff tool:** `/tmp/norm/norm.py` maps upstream paths to port paths and rewrites `multi` → `switchboard`. Run it in memory (exec) so it does not write to `/tmp/norm`. Treat its `temporary.ts` mapping as `tests/temporary.ts`.

**Fidelity check (every task):**

- For each file the task touches, the normalized diff against upstream may contain only hunks that the deviation ledger allows.
- Every hunk is attributed to a ledger row in the task report.

## Test gate: failure NAMES, not pass counts

Script `/Users/akparhi/Projects/Home/context-engineering/.superpowers/sdd/2026-09-22-switchboard-plugin/gate.sh` (reuse it; do not retype it):

```sh
#!/bin/sh
# usage: sb-gate.sh <out-file>
set -e
cd /Users/akparhi/Projects/Home/context-engineering/plugins/switchboard
bun run typecheck
bun run lint
: > "$1.raw"
for i in 1 2 3; do bun test 2>&1 | grep '^(fail)' | sed -E 's/ \[[0-9.]+m?s\]$//' >> "$1.raw" || true; done
sort -u "$1.raw" > "$1"
wc -l < "$1"
```

**Baseline:**

- Before T1, run `sh /Users/akparhi/Projects/Home/context-engineering/.superpowers/sdd/2026-09-22-switchboard-plugin/gate.sh /tmp/sb-base.txt`. At HEAD this is 31 names, and typecheck/lint currently pass.

**Per-task acceptance:**

- `comm -13 /tmp/sb-base.txt /tmp/sb-T<n>.txt` is empty: no new failure name.
- Every name the task is expected to fix is absent from `/tmp/sb-T<n>.txt`.
- Any removed test name is listed in the task report with the dropped provider it exercised.

**Final:** after T6 the union is empty.

## Tasks

### T1: Lint must never force a rewrite (ledger row 4)

**Config:**

- In `.oxlintrc.json`, set these to `off`:
  - `unicorn/consistent-function-scoping`
  - `unicorn/no-useless-spread`
  - `unicorn/no-array-sort`
  - `unicorn/no-array-reverse`
  - `eslint/no-shadow`
  - `eslint/no-underscore-dangle`
  - `unicorn/no-invalid-fetch-options`

**Revert each lint rewrite to its upstream text:**

| Port site | Upstream source | Revert |
|---|---|---|
| `src/gateway/server.ts` | `multi-core/src/gateway/server.ts` | `extModel`/`toolObserver` → upstream names; un-hoist `matchesBashAction` |
| `src/providers/opencode/chat.ts:927` | `multi-zen/src/chat.ts` | `toSorted` |
| `src/hooks/usage.ts:154` | `multi-core/src/hooks/usage.ts` | `toReversed` |
| `src/providers/provider-usage.ts` | `multi-core/src/provider-usage.ts` | un-hoist `formatCount` |
| `src/gateway/receipts.ts:333` | `multi-core/src/gateway/receipts.ts` | snapshot spread |
| `src/process.ts` | `multi-core/src/process.ts` | per-call `interrupt` |
| `src/providers/codex/auth.ts:106,117` | `multi-openai/src/auth.ts` | `let onAbort = () => {}` |
| `src/providers/codex/responses.ts` | `multi-openai/src/responses.ts` | `isValidCount` → local `count` lambda |
| `src/launcher.ts:457` | `multi-core/src/launcher.ts` | `toSorted` |
| `src/install/installation.ts` | `multi-core/src/installation.ts` | `quoteForWindows` |

**Revert lint rewrites in these tests:**

- `tests/hooks/lifecycle.test.ts` and `tests/hooks/usage.test.ts` (`_chunk`)
- `native-gateway` (`responseBody`, `oversized`, `anthropicOrOpenAiUpstream`, `toSorted`)
- `native-launcher` and `native-provider-usage` (`toSorted`)
- `native-settle` (`resolveRun`)
- `native-install` (`quoteForWindows`)
- `native-usage-menu` (68-81 `emptyNext`, 165 `permissionNext`)
- `native-zen-chat` (`interruptedChat`, `abortedChat`)
- `native-mod-routes:34` (fetch body spread)
- `native-approval:327` (`mkdtemp` shadow)

**Accept:**

- `bun run lint` passes.
- Running oxlint over the upstream files copied into a temp dir with the port config gives 0 diagnostics that would require a change.
- Gate: no new failure names.

### T2: Restore upstream core, wire ids, rebrand text and tests; terra dropped (rows 1-3, 7-terra)

**Restore from `git show 290dcd9:<file>`, then re-apply only ledger hunks:**

- `src/providers/codex/responses.ts`
  - EFFORTS stays upstream `['low','medium','high','xhigh','max']` in this task.
  - Keep upstream `budgetEffort`, `reasoningEffort` (throws), and non-exported `isEffort`/`budgetEffort`.
  - `SIGNATURE_PREFIX = 'switchboard:'`, the mechanical rename of `'multi:'`.
- `src/providers/codex/models.ts`: the upstream `MODELS`/`Worker`/`OPENAI_WORKERS` form, minus the `'openai-terra'` entry.
- `src/providers/opencode/models.ts`: the upstream 19-entry form. It gets replaced in T4; restoring it here keeps T4's diff reviewable.
- `src/launcher.ts`
  - Restore upstream `workerDefinitions`, `pickerSettings` and `selectWorkers`. This deletes the fix-round filter at `:87-90`.
  - Re-apply the tmpdir prefix `switchboard-native-settings-`.
  - Re-apply `inventory.switchboardEnabled` (~:889).
  - Re-apply the `--zen-models` error string (:665).
- `src/gateway/server.ts`
  - Revert the CATALOG lookup in `openaiRequest` to upstream: `Object.values(MODELS).find(m => externalModel === `switchboard/openai/${m}`)`, throwing `Unknown native OpenAI model`.
  - Restore `x-opencode-client: 'cc-multi-cli-plugin'`.
- Restore upstream harness code. It remains inert because `isHarnessModel` is false with no harness providers.
  - `src/hooks/compact.ts`: full upstream text.
  - `src/hooks/register.ts`: the `harnessReady = generation !== undefined && isHarnessModel(...)` lines.
  - `src/hooks/policy.ts`: the `if (isHarnessModel(model)) return admitPrompt(...)` branch and the `generation` param.
  - `src/hooks/workers.ts`: `|| (!selection?.known && isHarnessModel(inferred))`.
- `src/mod-bridge.ts`: the tool name `mcp__switchboard__cursor_${kind}` (upstream form). `available()` keeps returning `false` (row 1).
- `src/providers/codex/usage.ts:79`: `cc_multi_usage`.
- `src/providers/opencode/chat.ts` and `request.ts`: prefixes `switchboard-chat:` and `switchboard-responses:`.
- `src/install/installation.ts`
  - Revert the `shimPath` rename.
  - Drop the `export` added to `MANAGEMENT_COMMAND` and `installationDirectory`.
- `src/install/plugins.ts` and `bootstrap.ts`
  - Revert the core→self renames and upstream messages with the mechanical rebrand ("Enable switchboard at user scope before using Switchboard commands.", "Installed core manifest does not identify switchboard").
  - Providers: `const providers = personalCore.length ? [...PROVIDERS] : []`.
- Skills
  - `setup` description: "Configure ordinary claude startup for installed Switchboard providers."
  - `multiclaude` → `switchboardclaude`.
- Tests: restore from 290dcd9, or from upstream `test/unit/` via norm.
  - `native-zen-gateway`, `native-zen-request`, `native-zen-models`, `native-approval`, `native-launcher`. Re-apply the `./temporary.ts` import.
  - Restore the upstream assertions in `native-provider-usage` (error isolation, disabled provider).
  - In `native-gateway.test.ts` "all registered model and reasoning choices reach OpenAI without substitution" (upstream :771), remove only the terra line.

**Accept:**

- Normalized diff of every file above against upstream shows only ledger rows 1-3 and 7-terra.
- Gate: no new names. These are fixed: native-launcher, Zen launcher, OpenAI main/worker, all registered choices, hooks register/compact/workers, native-approval permission hook, and mod-policy host-only.

### T3: Pinned effort rows, short labels, gateway effort map (rows 5, 6, 7)

**Files:** `src/providers/codex/models.ts`, `responses.ts`, `src/launcher.ts`, `src/gateway/server.ts`, and tests. No new module.

**`codex/models.ts` additions:**

- `LABELS = {'gpt-6-astra':'Astra','gpt-5.6-sol':'Sol','gpt-5.6-luna':'Luna'}`
- `PINS = {'gpt-6-astra':['low'],'gpt-5.6-sol':['low'],'gpt-5.6-luna':['none','low','medium']}`
- `PINNED: Map<'<model>-<effort>', {model, effort}>`
- `OPENAI_PICKER`, in the order Astra, Astra Low, Sol, Sol Low, Luna, Luna None, Luna Low, Luna Medium.
  - Bare row description: upstream `'OpenAI subscription · native Claude Code harness'`.
  - Pinned row description: the same text plus ` · <effort> reasoning`. Use this one form everywhere.
- `OPENAI_WORKERS`: upstream plus exactly one entry, `'openai-luna-none': {model:'gpt-5.6-luna', effort:'none'}`. The low/medium pins reuse the upstream same-name workers (`openai-native-low`, `openai-sol-low`, `openai-luna-low`, `openai-luna-medium`).

**`responses.ts`:** `EFFORTS = ['none','low','medium','high','xhigh','max']`.

**`launcher.ts`:**

- `pickerSettings` maps `OPENAI_PICKER`.
- Worker emission becomes `...(effort === 'none' ? {} : { effort })`. Claude Code agent `effort` accepts only low..max, so the gateway pin carries `none`.

**`server.ts` `openaiRequest`:**

```ts
const pinned = PINNED.get(externalModel.slice('switchboard/openai/'.length));
const model = pinned?.model ?? /* upstream find */;
const request = toResponses(pinned ? { ...body, output_config: { ...body.output_config, effort: pinned.effort } } : body, model);
```

**Tests:**

- Add a test asserting the exact picker label list and order.
- Add a gateway test: each pinned id reaches upstream with `reasoning.effort` equal to its pin.
- Add a launcher test: `openai-luna-none` is emitted without `effort`.

**Accept:**

- `--help` and `--zen-models` output are byte-identical to T2.
- Model ids and worker names are unchanged.
- Gate: no new names.

### T4: OpenCode Go (row 8)

**`server.ts:391`:** the inference base URL becomes `https://opencode.ai/zen/go/v1`. Keep the same key and the `x-opencode-session` header.

**`src/providers/opencode/models.ts` (`ZEN_MODELS`):** the 33-entry Go list.

- Protocol:
  - `responses` for `gpt-5.6-luna`, `muse-spark-1.2-contributor` and `muse-spark-1.3-contributor`.
  - `chat` for the rest.
- Metadata for ids that existed upstream: copy the upstream values (gpt-5.6-luna, kimi-k2.7-code, glm-5.2, glm-5.3, glm-5.3-flash, minimax-m2.7, deepseek-v4-pro, deepseek-v4-flash, kimi-k3).
- `muse-spark-1.x-contributor`: copy the `-free` metadata and efforts, labelled `Muse Spark 1.x Contributor`.
- `mimo-v2.5`: copy `mimo-v2.5-free`.
- New ids:
  - `images: true`, `documents: false`, no efforts.
  - `maxOutputTokens: GO_MAX_OUTPUT_TOKENS` (a named constant, `32000`).
  - Label in upstream style.
- `DEFAULT_ZEN_MODELS = ['deepseek-v4-pro','deepseek-v4-flash','kimi-k3','glm-5.3','glm-5.3-flash','muse-spark-1.3-contributor']`.
- Keep `zenModelOptions`, `ZEN_WORKERS`, `defaultEffort`, `zenModel` and `zenPickerOptions` in their upstream form.

**Wording ("OpenCode Zen" → "OpenCode Go"):**

- Launcher picker label prefix `Go · `.
- Description `OpenCode Go subscription · Claude tools…`.
- Worker description `OpenCode Go …`.
- `provider-usage.ts` name.
- `skills/connect` description "OpenCode Go API key".
- The connect prompt URL line.

**Unchanged:** internal id `zen`, `switchboard/zen/*`, catalog source `zen`, `SWITCHBOARD_ZEN_MODELS`.

**Tests:**

- Update the URL and list assertions in `native-zen-*` and `native-launcher`.
- Substitute ids absent from Go (e.g. `big-pickle` → `minimax-m2.7`, `-free` ids → the contributor or plain ids) with no change in test intent.

**Accept:**

- The gate shows no new names.
- Live smoke with tiny requests (`max_tokens: 20`, which bills Go quota):
  - `switchboard/zen/deepseek-v4-flash`, chat, stream and non-stream: 200.
  - `switchboard/zen/gpt-5.6-luna`, responses: 200.

### T5: Delete dead dropped-provider code and port-only files (row 1)

**Delete:**

- `src/state-lock.ts`, `src/settle.ts`, `src/atomic-write.ts`, each only after `grep -r` shows no importer. Also delete their tests `tests/native-state-lock*`, `tests/native-settle*` and `tests/*atomic*`.
- `src/catalog.ts` and a superseded `models.ts` stub, if T2/T3 left one unimported.
- Port-only tests: `tests/catalog.test.ts`, `tests/launcher-settings.test.ts`, `tests/install.test.ts`, and `tests/effort.test.ts` (its pinned coverage moved to T3).
- Dropped-provider tests:
  - Tests in `tests/hooks/workers.test.ts` that use `switchboard/cursor/auto`.
  - The native-mod-routes "two-phase compaction invokes the native fixture once…" test.
  - Any remaining failing test whose fixture names cursor/antigravity/grok. List each name in the report.

**Accept:**

- typecheck passes.
- Gate: no new names. state-lock, install-process-inherits and native-mod-routes compaction leave the union.

### T6: Marketplace `akparhi`, identity, metadata, install, VS Code (row 9)

**Identity:**

- `src/install/plugins.ts:7`: `MARKETPLACE = 'akparhi'`.
- `plugins.ts:68`: narrow the check to `plugin.id === `switchboard@${MARKETPLACE}``.
- `src/gateway/agent-definitions.ts:232`: `'switchboard@akparhi'`.
- Test fixtures: `tests/native-agent-definitions.test.ts:112`, `tests/native-launcher.test.ts:51`, `tests/native-install.test.ts:32`.

**Metadata:**

- `.claude-plugin/marketplace.json`: add the `switchboard` entry with source `./plugins/switchboard`.
- `plugins/switchboard/.claude-plugin/plugin.json`: upstream version `0.2.0`, author `greenpolo` (url `https://github.com/greenpolo`), license `Apache-2.0`, and upstream `skills`/`hooks` paths.
- `NOTICE`: rewrite the "Modifications" paragraph as ledger rows 1-9.

**Install:**

1. `claude plugin marketplace add /Users/akparhi/Projects/Home/context-engineering`
2. `claude plugin install switchboard@akparhi` (user scope)
3. `/switchboard:setup`
4. `switchboard-ctl status`
5. `switchboard-ctl login openai` and `switchboard-ctl connect zen`

**VS Code:**

- Back up `~/Library/Application Support/Code/User/settings.json`.
- Set `claudeCode.claudeProcessWrapper` from `~/.local/share/multi-cli/bin/claude-multi` to `~/.local/share/switchboard/bin/switchboard`.

**Live smoke (`/tmp/sb-smoke/smoke.ts`):**

- Change the zen ids to `deepseek-v4-flash`.
- Add `switchboard/openai/gpt-6-astra-low` 200 and `switchboard/zen/gpt-5.6-luna` 200.
- Keep terra 400 and `luna-none` 200.

**Accept:**

- The gate union is empty.
- `claude plugin list` shows `switchboard@akparhi` enabled.
- Every smoke row passes.
- A fresh `switchboard` session's picker shows the T3 labels in order.

## Deviation ledger

**Allowed deviations:**

| # | Allowed deviation | Files |
|---|---|---|
| 1 | Cursor, Antigravity and Grok dropped, with their registration/wiring lines | `src/hooks/register.ts` (displayTools), `src/hooks/provider.ts` (returns false), `src/mod-bridge.ts` (`available()` false), `src/mod-usage.ts` (billed block), `src/mode-hook.ts` (executionForModel inlined), `src/install/plugins.ts` (`PROVIDERS`), `src/launcher.ts` (provider imports), deleted packages, their tests, and T5's deletions |
| 2 | Flat layout, with imports rewritten | every `src/**` and `tests/**` import line; `tests/temporary.ts` |
| 3 | Rebrand multi/MULTI_ → switchboard/SWITCHBOARD_ (commands, env, headers, install dir); upstream wire/OAuth ids kept | all files by mechanical rename; signature prefixes `switchboard:`, `switchboard-chat:`, `switchboard-responses:`; skills `switchboardclaude` |
| 4 | Bun toolchain, oxlint config; lint never forces a rewrite | `package.json`, `tsconfig.json`, `bun.lock`, `.oxlintrc.json`; `server.ts` `fetch as GatewayFetch` and ReadableStream cast; `opencode/usage.ts` fetch type |
| 5 | `none` effort tier, pinned rows only | `src/providers/codex/responses.ts` (EFFORTS), `src/launcher.ts` (effort omission) |
| 6 | Pinned rows/workers plus gateway exact-id → effort map | `src/providers/codex/models.ts` (PINS, PINNED, OPENAI_PICKER, `openai-luna-none`), `src/gateway/server.ts` (`openaiRequest`), new tests |
| 7 | Short OpenAI labels; terra dropped | `src/providers/codex/models.ts` (LABELS, no terra), `src/launcher.ts` (picker map), `tests/native-gateway.test.ts` (terra line) |
| 8 | OpenCode Go: URL, model list, wording | `src/gateway/server.ts:391`, `src/providers/opencode/models.ts`, `src/launcher.ts` (Zen label/descriptions), `src/providers/provider-usage.ts` (name), `skills/connect/SKILL.md`, connect prompt, `native-zen-*` tests |
| 9 | Fixes needed for the installed plugin: `openai`/`zen` ids end to end, marketplace `akparhi` | `src/install/plugins.ts`, `bootstrap.ts`, `src/gateway/agent-definitions.ts:232`, `src/providers/account.ts`, `.claude-plugin/marketplace.json`, `plugin.json`, `NOTICE`, three test fixtures |

**In the tree now but outside the allowed deviations:**

| Item | Where | Plan |
|---|---|---|
| `src/catalog.ts` curated catalog and CATALOG lookup | `src/catalog.ts`, `server.ts`, `launcher.ts` | revert (T2, T5) |
| Fix-round worker filter | `src/launcher.ts:87-90` | revert to `selectWorkers` (T2) |
| Harness compaction/policy/worker checks removed | `src/hooks/{compact,register,policy,workers}.ts` | revert (T2) |
| `mcp__switchboard__${kind}` tool name | `src/mod-bridge.ts` | revert (T2) |
| `x-opencode-client: 'switchboard'`, `cc_switchboard_usage` | `server.ts`, `codex/usage.ts:79` | revert (T2) |
| Non-mechanical signature prefixes | `responses.ts`, `opencode/chat.ts`, `opencode/request.ts` | revert (T2) |
| Lint-driven rewrites (7 rules) | T1 table | revert (T1) |
| `shimPath` rename, added exports, port-only `tests/install.test.ts` | `installation.ts` | revert (T2, T5) |
| core→self renames and reworded errors | `plugins.ts`, `bootstrap.ts` | revert (T2) |
| Reworded skill descriptions | `skills/setup`, `skills/connect` | revert, apart from row 8 wording (T2, T4) |
| Port-only tests | `catalog`, `launcher-settings`, `effort`, `install` | delete (T5) |
| Hollowed compaction test, lost usage assertions | `native-mod-routes`, `native-provider-usage` | delete / restore (T5, T2) |
| plugin.json author/version/license changed | `.claude-plugin/plugin.json` | revert (T6) |
| Dropped upstream docs, `test/live`, `test/watchdog.ts` | absent | **not reverted**; see Unresolved |
| Installation doc-comment word order | `installation.ts` | revert with the file (T2) |

## Old plan (2026-09-22-switchboard-plugin.md): disposition

- **Task 10 (suite green, hermetic HOME):** folded into the gate and T2/T5.
- **Task 11 (`bin/switchboard`, `smoke.test.ts`, launchSettings rows):** dropped. The installer shim is the only launch path, as upstream.
- **Task 12 (VS Code wrapper):** kept as part of T6, pointing at the installed shim.

## Unresolved questions

1. Is narrowing the `plugins.ts:68` error check to `switchboard@akparhi` acceptable? Otherwise, hindsight and think errors block setup.
2. `DEFAULT_ZEN_MODELS`: the upstream mirror uses `muse-spark-1.3-contributor`. Should `deepseek-v4.1-flash` be added?
3. Go metadata: are the muse/mimo copies from the `-free` entries and `GO_MAX_OUTPUT_TOKENS = 32000` acceptable?
4. Should the remaining "Zen" wording in `account.ts` and `hooks/usage.ts` also become "Go", or stay as upstream?
5. Should the dropped upstream docs, `test/live` and `test/watchdog.ts` be restored?
6. `plugin.json` author/version: keep upstream `greenpolo`/`0.2.0`, or use your own? Which author goes in the marketplace entry?
7. The pinned low/medium rows reuse upstream same-name workers, so their worker visibility follows `selectWorkers` exact-model matching on the bare model. Is that OK?
8. Disabling `unicorn/no-invalid-fetch-options` turns off a correctness rule. Is that OK, or should it use a per-line disable instead?
9. Should the gate run with a hermetic `HOME`? The baseline was taken with the real HOME.

## Controller rulings on the unresolved questions (2026-09-22)

1. Identity is exactly `switchboard@akparhi` everywhere (plugins.ts:68,77, agent-definitions.ts:232), matching upstream's exact match.
2. Default Go models mirror upstream's defaults; drop any id Go doesn't serve. No additions.
3. Yes: copy muse/mimo metadata from the `-free` entries; single named default maxOutputTokens 32000.
4. User-facing "Zen" wording becomes "OpenCode Go" (row 8). Identifiers stay `zen`.
5. Restore `watchdog.ts` and the Codex/Zen/core `test/live` suites (kept env-gated as upstream). Do not restore repo docs.
6. `plugin.json` and marketplace author: akparhi. NOTICE keeps the upstream attribution Apache 2.0 requires.
7. Yes.
8. Turn `no-invalid-fetch-options` off in config. No per-line disables on upstream lines.
9. Yes. The gate runs under fixed `HOME=/tmp/sb-home` (see the gate script). The baseline is taken the same way.

## Scope change from the user (2026-09-22), overrides everything above

User: "My goal is pretty much a clone and it's okay to not have opencode go. Just base+openai integration + rebrand is enough. Btw codex now has gpt 6, we only want to expose the gpt 6 astra, sol, luna".

- **T4 is cancelled.** No OpenCode Go work: no URL change, no model list, no wording change. The zen provider code stays exactly as upstream has it, with upstream URL, models and wording. Ruling: keep it rather than delete it, because keeping is the closest clone and deleting would be a new deviation.
- **OpenAI models:** exactly `'openai-native': 'gpt-6-astra'`, `'openai-sol': 'gpt-6-sol'`, `'openai-luna': 'gpt-6-luna'`. Terra and the gpt-5.6 ids are dropped. This applies to T2's MODELS/OPENAI_WORKERS and to every test or fixture that asserts these ids.
- **T3 pinned rows** stay, labels and order unchanged. Their base models are the gpt-6 ids above, e.g. Sol Low is based on `gpt-6-sol` and Luna None on `gpt-6-luna`.
- **Ruling 2, ruling 3 and the row-8 wording ruling are void**, because they only covered Go.
- User confirmed: "with effort levels and the model display name thing as the only additional thing". The only additions over upstream are the rebrand, the gpt-6 ids, the T3 effort rows and the short display names. Anything else counts as a deviation to revert.
