# Switchboard Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vendor cc-multi-cli-plugin into `plugins/switchboard/`, stripped to Codex + opencode-go, ported to Bun, with a curated config-gated model catalog.

**Architecture:** A launcher spawns stock `claude` with `--settings` (carrying `modelPicker.options`) and `--agents`, pointing `ANTHROPIC_BASE_URL` at a local gateway that translates Anthropic Messages ⇄ OpenAI Responses/Chat. Mods function hooks add progress UI, permission plumbing and compaction on top. No binary patching anywhere.

**Tech Stack:** Bun ≥1.2, TypeScript, oxlint, `js-tiktoken`, `yaml`.

**Spec:** `docs/superpowers/SPEC-switchboard-plugin.md`

## Global Constraints

- Runtime is **Bun ≥1.2**. `package.json` `engines.bun: ">=1.2"`. No `engines.node` floor inherited from upstream.
- Linter is **oxlint**, not Biome. Upstream `biome.json` is not carried over.
- Effort levels are exactly `['none', 'low', 'medium', 'high']`. No `xhigh`, `max`, `ultra` anywhere.
- Launch command is `switchboard`. Plugin directory is `plugins/switchboard/`.
- Providers are exactly two: `openai` (Codex) and `zen` (opencode-go). No cursor, antigravity, grok, openrouter.
- The `switchboard` daemon at `~/Projects/Home/switchboard` is **never modified** by this work.
- License is Apache 2.0. `LICENSE` and `NOTICE` are preserved verbatim from upstream.
- Reference checkout for diffing: `.local/cc-multi-cli-plugin` at `b3220ef`.
- Upstream baseline is 442/442 unit tests passing. Never commit with a lower pass count than the previous task left.

---

### Task 1: Scaffold the plugin directory

**Files:**
- Create: `plugins/switchboard/package.json`
- Create: `plugins/switchboard/tsconfig.json`
- Create: `plugins/switchboard/.oxlintrc.json`
- Create: `plugins/switchboard/.claude-plugin/plugin.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: a Bun package rooted at `plugins/switchboard/` with `bun test`, `bun run lint`, `bun run typecheck` scripts. Later tasks add source under `src/` and `hooks/`.

- [ ] **Step 1: Ignore the reference checkout**

`.local/` currently shows as untracked in `git status`. Append to `.gitignore`:

```
.local/
```

- [ ] **Step 2: Verify it is ignored**

Run: `git status --short | grep '.local' || echo "ignored"`
Expected: prints `ignored`

- [ ] **Step 3: Create the package manifest**

Create `plugins/switchboard/package.json`:

```json
{
  "name": "@context-engineering/switchboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "bun": ">=1.2" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "oxlint --deny-warnings .",
    "test": "bun test"
  },
  "dependencies": {
    "js-tiktoken": "1.0.21",
    "yaml": "2.9.0"
  },
  "devDependencies": {
    "oxlint": "latest",
    "typescript": "latest"
  }
}
```

- [ ] **Step 4: Create the TypeScript config**

Create `plugins/switchboard/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun-types"],
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "hooks/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 5: Create the linter config**

Create `plugins/switchboard/.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "categories": { "correctness": "error", "suspicious": "warn" },
  "env": { "builtin": true }
}
```

- [ ] **Step 6: Create the plugin manifest**

Create `plugins/switchboard/.claude-plugin/plugin.json`:

```json
{
  "name": "switchboard",
  "version": "0.1.0",
  "description": "Codex and opencode-go models in the Claude Code model picker and as named subagents."
}
```

- [ ] **Step 7: Install and verify the toolchain**

Run: `cd plugins/switchboard && bun install && bun run lint`
Expected: install succeeds; lint reports no files to check or passes clean.

- [ ] **Step 8: Commit**

```bash
git add .gitignore plugins/switchboard/
git commit -m "feat(switchboard): scaffold Bun + oxc plugin package"
```

---

### Task 2: Vendor the license and upstream source

**Files:**
- Create: `plugins/switchboard/LICENSE` (copy of upstream)
- Create: `plugins/switchboard/NOTICE` (upstream + our attribution)
- Create: `plugins/switchboard/src/**` (copied from upstream, unmodified)
- Create: `plugins/switchboard/src/providers/codex/instructions.md` + `guardian/**` (prompt assets, verbatim)
- Create: `plugins/switchboard/src/install/**` (4 files, 673 LOC — shim writer, `multi` dispatcher, plugin discovery, spawn helper)
- Create: `plugins/switchboard/skills/**` (5 `SKILL.md`, flattened from three upstream plugins)
- Create: `plugins/switchboard/hooks/**` (copied from upstream, unmodified)
- Create: `plugins/switchboard/tests/**` (copied from upstream `test/unit/`)

**Interfaces:**
- Consumes: Task 1's package layout.
- Produces: a flat tree at `plugins/switchboard/src/` containing upstream's `multi-core/src/*`, `multi-core/src/gateway/*`, `multi-openai/src/*` (as `src/providers/codex/`), `multi-zen/src/*` (as `src/providers/opencode/`). Import paths are rewritten in Task 3; this task only moves bytes.

- [ ] **Step 1: Copy the license files**

```bash
cd /Users/akparhi/Projects/Home/context-engineering
R=.local/cc-multi-cli-plugin
cp "$R/LICENSE" plugins/switchboard/LICENSE
cp "$R/NOTICE" plugins/switchboard/NOTICE
```

- [ ] **Step 2: Add our attribution to NOTICE**

Append to `plugins/switchboard/NOTICE`:

```
---

This plugin is derived from cc-multi-cli-plugin
(https://github.com/greenpolo/cc-multi-cli-plugin), Copyright 2026 greenpolo,
licensed under Apache 2.0. Modified to support only the Codex and OpenCode Zen
providers, ported to Bun, with a curated static model catalog.
```

- [ ] **Step 3: Copy the source trees**

```bash
cd /Users/akparhi/Projects/Home/context-engineering
R=.local/cc-multi-cli-plugin
P=plugins/switchboard
mkdir -p "$P/src/gateway" "$P/src/install" "$P/src/providers/codex" "$P/src/providers/opencode" "$P/hooks" "$P/tests" "$P/skills"
cp "$R"/plugins/multi-core/src/*.ts "$P/src/"
cp "$R"/plugins/multi-core/src/gateway/*.ts "$P/src/gateway/"
cp "$R"/plugins/multi-core/src/install/*.ts "$P/src/install/"
cp "$R"/plugins/multi-openai/src/*.ts "$P/src/providers/codex/"
# Prompt assets are not .ts — copy them explicitly or they vanish silently.
cp "$R"/plugins/multi-openai/src/instructions.md "$P/src/providers/codex/"
cp -R "$R"/plugins/multi-openai/src/guardian "$P/src/providers/codex/guardian"
cp "$R"/plugins/multi-zen/src/*.ts "$P/src/providers/opencode/"
cp "$R"/plugins/multi-core/hooks/*.ts "$P/hooks/"
cp "$R"/plugins/multi-core/hooks/hooks.json "$P/hooks/"
# Five skills across three upstream plugins collapse into one skills/ directory.
for sk in setup status uninstall; do
  mkdir -p "$P/skills/$sk"; cp "$R/plugins/multi-core/skills/$sk/SKILL.md" "$P/skills/$sk/"
done
mkdir -p "$P/skills/login"   && cp "$R/plugins/multi-openai/skills/login/SKILL.md" "$P/skills/login/"
mkdir -p "$P/skills/connect" && cp "$R/plugins/multi-zen/skills/connect/SKILL.md" "$P/skills/connect/"
cp "$R"/test/unit/*.test.ts "$P/tests/"
```

- [ ] **Step 4: Verify the copy landed**

Run: `find plugins/switchboard/src plugins/switchboard/hooks -name '*.ts' | wc -l`
Expected: a non-zero count around 45-50 files.

Then verify the non-TypeScript prompt assets, which the `*.ts` globs above do not match:

Run: `ls plugins/switchboard/src/providers/codex/instructions.md plugins/switchboard/src/providers/codex/guardian/`
Expected: `instructions.md`, plus `LICENSE`, `NOTICE`, `README.md`, `policy-template.md`, `policy.md`.

`instructions.ts` and `approval.ts` resolve these by `new URL('./guardian/policy.md', import.meta.url)`, so a missing file fails at runtime rather than typecheck.

- [ ] **Step 5: Commit the unmodified vendor drop**

Committing before any edit makes the strip-down diff reviewable.

```bash
git add plugins/switchboard/
git commit -m "feat(switchboard): vendor cc-multi-cli-plugin at b3220ef (unmodified)"
```

---

### Task 3: Strip the dropped providers

**Files:**
- Delete: `plugins/switchboard/src/gateway/cursor-settings.ts`
- Modify: `plugins/switchboard/src/gateway/server.ts`
- Modify: `plugins/switchboard/src/gateway/mode-hook.ts`
- Modify: `plugins/switchboard/src/gateway/mod-policy.ts`
- Modify: `plugins/switchboard/src/gateway/approval.ts` (cross-provider dispatch only — **not** `src/providers/codex/approval.ts`, which owns the guardian reviewer and stays verbatim)
- Modify: `plugins/switchboard/src/launcher.ts`
- Modify: `plugins/switchboard/hooks/register.ts`
- Modify: `plugins/switchboard/hooks/provider.ts`
- Delete: any vendored test file covering a dropped provider

**Interfaces:**
- Consumes: Task 2's vendored tree.
- Produces: a tree where `rg -i 'cursor|antigravity|grok'` over `src/` and `hooks/` returns zero hits. `GatewayEvent['route']` narrows to `'anthropic' | 'openai' | 'zen'`.

- [ ] **Step 1: Delete the cursor settings module and dropped-provider tests**

```bash
cd plugins/switchboard
rm -f src/gateway/cursor-settings.ts
rm -f tests/*cursor*.test.ts tests/*antigravity*.test.ts tests/*grok*.test.ts
```

- [ ] **Step 2: Find every remaining reference**

Run: `rg -n -i 'cursor|antigravity|grok' src/ hooks/ | wc -l`
Expected: a non-zero count. Record it — this is the work list.

- [ ] **Step 3: Remove the display-tool bindings from register.ts**

In `hooks/register.ts`, delete the `displayTools` array, the `prefix` constant, the `maxBody` constant, the `DisplayInput` type, and the `for (const [name, _description] of displayTools)` loop with its three `on(...)` registrations (`tool.call`, `tool.check`, and both `ui.render` variants). Delete the `MULTI_CURSOR_DISPLAY_TOOLS` env read.

- [ ] **Step 4: Narrow the harness discriminator**

`hooks/provider.ts` defines `isHarnessModel`. With no harness providers left it is always false. Delete the file and remove its imports; delete the branches guarded by it in `hooks/compact.ts`, `hooks/workers.ts` and `hooks/policy.ts`, keeping the non-harness path (the one that calls `next(event)` or proceeds generically).

- [ ] **Step 5: Strip the gateway route union and dispatch**

In `src/gateway/server.ts`, narrow `GatewayEvent['route']` to `'anthropic' | 'openai' | 'zen'`. Delete `handleHarness` and its `{ cursor, antigravity, grok }[provider]` dispatch, the `closeHarnesses` entries for dropped providers, and the constructor params that carry them.

- [ ] **Step 6: Strip the launcher**

In `src/launcher.ts`, delete `discoverCursor`, `discoverAntigravity`, `discoverGrok`, `installAntigravityHook`, the `--cursor-login` / `--cursor-models` / `--zen-models` / `--antigravity-*` / `--grok-models` command branches, and the dropped-provider entries in `workerDefinitions()` and the `modelPicker.options` array.

- [ ] **Step 7: Verify the strip is complete**

Run: `rg -n -i 'cursor|antigravity|grok' src/ hooks/`
Expected: no output.

- [ ] **Step 8: Typecheck**

Run: `bun run typecheck`
Expected: PASS. Fix any dangling imports or now-unused params it reports.

- [ ] **Step 9: Commit**

```bash
git add -A plugins/switchboard/
git commit -m "refactor(switchboard): strip cursor, antigravity and grok providers"
```

---

### Task 4: Rewrite imports for the flat layout

**Files:**
- Modify: every `.ts` under `plugins/switchboard/src/` and `plugins/switchboard/hooks/` carrying a cross-plugin import
- Modify: `plugins/switchboard/tests/*.test.ts`

**Interfaces:**
- Consumes: Task 3's stripped tree.
- Produces: a tree with zero `../../multi-*` import specifiers. `bun run typecheck` passes.

- [ ] **Step 1: Find the cross-plugin imports**

Run: `rg -n "from '\.\./\.\./multi-" src/ hooks/ tests/`
Expected: hits in `src/providers/opencode/*.ts` (which import from `multi-openai`), `src/launcher.ts`, `src/gateway/*.ts`.

- [ ] **Step 2: Rewrite them**

Mapping:

| Upstream specifier | New specifier |
|---|---|
| `../../multi-openai/src/responses.ts` | `../providers/codex/responses.ts` (from `src/gateway/`) |
| `../../multi-openai/src/responses.ts` | `../codex/responses.ts` (from `src/providers/opencode/`) |
| `../../multi-openai/src/models.ts` | `../providers/codex/models.ts` |
| `../../multi-zen/src/models.ts` | `../providers/opencode/models.ts` |

Apply with care per file — the correct relative depth differs between `src/`, `src/gateway/` and `src/providers/*/`.

- [ ] **Step 3: Verify none remain**

Run: `rg -n "multi-openai|multi-zen|multi-core" src/ hooks/ tests/`
Expected: no output.

- [ ] **Step 4: Typecheck and run the surviving tests**

Run: `bun run typecheck && bun test`
Expected: typecheck PASS; tests run. Some will fail — the catalog still names upstream models. Record the pass/fail counts.

- [ ] **Step 5: Commit**

```bash
git add -A plugins/switchboard/
git commit -m "refactor(switchboard): rewrite imports for flat plugin layout"
```

---

### Task 5: Rebrand the installer and flatten the skills

**Files:**
- Modify: `plugins/switchboard/src/install/installation.ts` (share dir, shell markers, command names)
- Modify: `plugins/switchboard/src/install/plugins.ts` (single-plugin discovery)
- Modify: `plugins/switchboard/src/install/bootstrap.ts` (manifest name check)
- Modify: `plugins/switchboard/skills/*/SKILL.md` (5 files — command paths)
- Test: `plugins/switchboard/tests/install.test.ts`

**Interfaces:**
- Consumes: the vendored `src/install/**` and `skills/**` from Task 2.
- Produces: `DEFAULT_COMMAND = 'switchboard'`, `MANAGEMENT_COMMAND = 'switchboard-ctl'`, installation directory `~/.local/share/switchboard`, and five skills addressed as `/switchboard:<name>`.

Upstream splits five skills across three plugins and discovers providers through a
marketplace. One plugin means one `skills/` directory and no marketplace lookup.

- [ ] **Step 1: Write the failing test**

Create `plugins/switchboard/tests/install.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { DEFAULT_COMMAND, MANAGEMENT_COMMAND, installationDirectory } from '../src/install/installation.ts';

test('the installer brands itself switchboard, not multi-cli', () => {
  expect(DEFAULT_COMMAND).toBe('switchboard');
  expect(MANAGEMENT_COMMAND).toBe('switchboard-ctl');
  expect(installationDirectory('/home/u')).toBe('/home/u/.local/share/switchboard');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `bun test tests/install.test.ts`
Expected: FAIL — `installationDirectory` is not exported, and the constants still say multi.

- [ ] **Step 3: Rebrand `installation.ts`**

Four edits, and export the directory helper so the test can reach it:

```ts
export const DEFAULT_COMMAND = 'switchboard';          // was 'claude-multi'
const MANAGEMENT_COMMAND = 'switchboard-ctl';          // was 'multi'
const begin = '# >>> switchboard >>>';                 // was '# >>> multi-cli >>>'
const end = '# <<< switchboard <<<';                   // was '# <<< multi-cli <<<'

export function installationDirectory(homedir = os.homedir()) {
  return path.join(homedir, '.local', 'share', 'switchboard');
}
```

The shell markers delimit the block written into `~/.zshrc`. Changing them means an
earlier multi-cli install is not recognised and not removed — intended, the two coexist.

- [ ] **Step 4: Collapse provider discovery in `plugins.ts`**

Upstream resolves `multi-core@cc-multi-cli-plugin` plus one `multi-<name>@...` entry per
provider. There is one plugin now, so discovery reduces to locating it:

```ts
const MARKETPLACE = 'switchboard';

export async function installedPlugins(claude: string, args: string[]) {
  const plugins = await enabledPlugins(claude, args);
  const self = plugins.filter((plugin) => plugin.id.startsWith(`switchboard@`) && plugin.enabled);
  if (self.length === 0) {
    throw new Error('Enable the switchboard plugin at user scope before running setup.');
  }
  // Both providers ship inside this plugin; there is nothing further to discover.
  return { root: self[0]?.installPath, providers: ['codex', 'opencode'] };
}
```

- [ ] **Step 5: Fix the manifest check in `bootstrap.ts`**

Line 30 asserts the core manifest's name. Update it:

```ts
if (manifest.name !== 'switchboard') {
  throw new Error('Installed manifest does not identify switchboard');
}
```

Leave the nested-run guard above it intact. It only fires when the launch command is
named `claude`, which ours is not — but it is the reason a `claude`-named install does
not recursively spawn gateways, so removing it would be a trap if the name ever changes.

- [ ] **Step 6: Rewrite the five skill bodies**

Each shells out to the management binary. Replace every occurrence:

```
$HOME/.local/share/multi-cli/bin/multi   →   $HOME/.local/share/switchboard/bin/switchboard-ctl
```

Per-file changes beyond that path:

| Skill | Edit |
|---|---|
| `setup` | `node "${CLAUDE_PLUGIN_ROOT}/plugins/multi-core/src/setup.ts"` → `bun "${CLAUDE_PLUGIN_ROOT}/src/setup.ts"`; drop the `node --version >= 24.12` check; default command name `claude-multi` → `switchboard`; `--cursor-models` / `--zen-models` → `--opencode-models` |
| `status` | `/multi-core:setup` → `/switchboard:setup` |
| `uninstall` | prose "Multi startup files" → "Switchboard startup files" |
| `login` | `multi login openai` → `switchboard-ctl login codex` |
| `connect` | `multi connect zen` → `switchboard-ctl connect opencode` |

Keep every "never accept, request, read, or print credentials in chat" line verbatim —
that is why `/connect` exists rather than pasting a key into the session.

- [ ] **Step 7: Run the tests**

Run: `bun test tests/install.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 8: Sweep the remaining upstream branding**

Roughly 300 occurrences survive Steps 3-6. Every one is internal — verified that no
branded string reaches OpenAI or Zen over the wire, so all are safe to rename.

| Token | Count | What it is | Rename to |
|---|---|---|---|
| `MULTI_*` env vars | 66 | runtime config read by launcher, gateway, hooks | `SWITCHBOARD_*` |
| `multi/<provider>` | 59 | internal model-id prefix in picker rows, workers, routing | `switchboard/<provider>` |
| `Multi` in prose | 43 | user-facing strings in errors and skills | `Switchboard` |
| `multi-core` | 36 | import paths, manifest checks | resolved by Tasks 4-5 |
| `multi-openai` / `multi-zen` | 30 | plugin dirs, plugin ids | `switchboard` |
| `multi-cli` | 13 | share dir, shell markers | done in Step 3 |
| `x-multi-*` headers | 13 | loopback-only: `x-multi-gateway-token`, `x-multi-token-count` | `x-switchboard-*` |
| `multi-usage` | 10 | the `/multi-usage` command id | `switchboard-usage` |
| `claude-multi` | 6 | default launch command | done in Step 3 |
| `greenpolo` | 5 | upstream attribution | **keep** |

Sweep the mechanical ones:

```bash
cd /Users/akparhi/Projects/Home/context-engineering/plugins/switchboard
# NOTICE and LICENSE carry required attribution: never rewrite them.
FILES=$(grep -rIl 'MULTI_\|multi/\|x-multi\|multi-usage' src hooks skills tests)
for f in $FILES; do
  perl -pi -e 's/MULTI_/SWITCHBOARD_/g; s{\bmulti/}{switchboard/}g; s/x-multi-/x-switchboard-/g; s/\bmulti-usage\b/switchboard-usage/g' "$f"
done
```

Then fix prose `Multi` by hand — a blind substitution would corrupt words like
`multiple` and `multipart`. Target only standalone capitalised uses in user-facing
strings.

Two that need care rather than substitution:

- `MULTI_GATEWAY_TOKEN` is read in `bootstrap.ts:18` to detect a nested run. Rename both
  sides together or the guard silently stops firing.
- `multi/mod` and `multi/permission` are internal routing prefixes, not providers. They
  rename with the rest, but do not map them onto a provider name.

- [ ] **Step 9: Confirm the sweep is complete**

Run: `grep -rIn "multi-cli\|claude-multi\|multi-core\|multi-openai\|multi-zen\|MULTI_\|x-multi\|multi/" plugins/switchboard/src plugins/switchboard/hooks plugins/switchboard/skills plugins/switchboard/tests`
Expected: no output.

Run: `grep -rIn "greenpolo\|cc-multi-cli-plugin" plugins/switchboard/NOTICE plugins/switchboard/LICENSE`
Expected: matches present — attribution is required by Apache 2.0 and must survive.

- [ ] **Step 10: Run the full suite**

Run: `bun test`
Expected: PASS. A rename that missed one side of a pair shows up here.

- [ ] **Step 11: Commit**

```bash
git add -A plugins/switchboard/
git commit -m "refactor(switchboard): rebrand installer, flatten skills, sweep upstream naming"
```

---

### Task 6: Cap effort levels and add `none`

**Files:**
- Modify: `plugins/switchboard/src/providers/codex/responses.ts:21` (the `EFFORTS` constant)
- Modify: `plugins/switchboard/src/providers/codex/responses.ts:490` (`budgetEffort`)
- Test: `plugins/switchboard/tests/effort.test.ts`

**Interfaces:**
- Consumes: Task 4's compiling tree.
- Produces: `type Effort = 'none' | 'low' | 'medium' | 'high'`, exported from `src/providers/codex/responses.ts`. `budgetEffort(thinking)` never returns a value outside that union. Task 6's catalog and Task 7's resolver both depend on this type.

- [ ] **Step 1: Write the failing test**

Create `plugins/switchboard/tests/effort.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { budgetEffort, isEffort } from '../src/providers/codex/responses.ts';

test('effort levels stop at high', () => {
  expect(isEffort('none')).toBe(true);
  expect(isEffort('high')).toBe(true);
  expect(isEffort('xhigh')).toBe(false);
  expect(isEffort('max')).toBe(false);
  expect(isEffort('ultra')).toBe(false);
});

test('a budget above the high band clamps to high, never xhigh', () => {
  expect(budgetEffort({ type: 'enabled', budget_tokens: 100000 })).toBe('high');
});

test('disabled thinking maps to none', () => {
  expect(budgetEffort({ type: 'disabled' })).toBe('none');
});

test('the documented bands are unchanged below the cap', () => {
  expect(budgetEffort(undefined)).toBe('medium');
  expect(budgetEffort({ type: 'enabled', budget_tokens: 1024 })).toBe('low');
  expect(budgetEffort({ type: 'enabled', budget_tokens: 8192 })).toBe('medium');
  expect(budgetEffort({ type: 'enabled', budget_tokens: 24576 })).toBe('high');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `bun test tests/effort.test.ts`
Expected: FAIL. `budgetEffort` and `isEffort` are not exported, and `xhigh` is still a valid effort.

- [ ] **Step 3: Shrink the enum and export the helpers**

In `src/providers/codex/responses.ts`, replace line 21 and export both helpers:

```ts
const EFFORTS = ['none', 'low', 'medium', 'high'] as const;

export type Effort = (typeof EFFORTS)[number];

export function isEffort(value: string): value is Effort {
  return (EFFORTS as readonly string[]).includes(value);
}
```

- [ ] **Step 4: Clamp budgetEffort**

Replace the function at line 490:

```ts
export function budgetEffort(thinking: MessagesRequest['thinking']): Effort {
  // `none` is honored by the Responses API (0 reasoning tokens, no summary) but is
  // absent from every model's advertised levels, so only the catalog can surface it.
  if (thinking?.type === 'disabled') {
    return 'none';
  }
  const budget = thinking?.budget_tokens;
  if (budget === undefined) {
    return 'medium';
  }
  if (budget <= 1024) {
    return 'low';
  }
  if (budget <= 8192) {
    return 'medium';
  }
  return 'high';
}
```

- [ ] **Step 5: Clamp, do not throw, on an out-of-range explicit effort**

In `reasoningEffort` in the same file, replace the `isEffort` rejection with a clamp so a saved session carrying `xhigh` still runs:

```ts
const requested = body.output_config?.effort ?? budgetEffort(thinking);
const effort: Effort = isEffort(requested) ? requested : 'high';
```

- [ ] **Step 6: Run the test**

Run: `bun test tests/effort.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Remove the stale effort arrays**

Run: `rg -n "'xhigh'|'max'|'ultra'" src/`
Expected: hits in `src/providers/opencode/models.ts` (`GPT_EFFORTS` and per-model `efforts`). Delete `xhigh`/`max` from every one. Ignore `tool_choice: 'none'` matches — unrelated field.

- [ ] **Step 8: Typecheck and full test run**

Run: `bun run typecheck && bun test`
Expected: typecheck PASS. Tests asserting `xhigh` workers now fail — Task 7 replaces those catalogs, so record the count and continue.

- [ ] **Step 9: Commit**

```bash
git add -A plugins/switchboard/
git commit -m "feat(switchboard): cap effort at high, add none tier"
```

---

### Task 7: Write the curated catalog

**Files:**
- Create: `plugins/switchboard/src/catalog.ts`
- Test: `plugins/switchboard/tests/catalog.test.ts`
- Delete: `plugins/switchboard/src/providers/codex/models.ts` (replaced)
- Modify: `plugins/switchboard/src/providers/opencode/models.ts` (trimmed to one entry)

**Interfaces:**
- Consumes: `Effort` from Task 6.
- Produces:
  - `interface CatalogEntry { id: string; source: 'openai' | 'zen'; label: string; description: string; prompt: string; efforts: readonly Effort[]; }`
  - `export const CATALOG: readonly CatalogEntry[]`
  - `export function pickerRows(catalog?: readonly CatalogEntry[]): PickerRow[]` where `PickerRow = { model: string; label: string; description: string; behavesAs: string }`
  - `export function workerDefinitions(catalog?: readonly CatalogEntry[]): Record<string, AgentDefinition>`
  - Task 8 consumes `pickerRows` and `workerDefinitions`; Task 9 consumes `CATALOG` for model-id resolution.

- [ ] **Step 1: Write the failing test**

Create `plugins/switchboard/tests/catalog.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { CATALOG, pickerRows, workerDefinitions } from '../src/catalog.ts';

test('every entry yields a bare row plus one row per effort', () => {
  const rows = pickerRows();
  expect(rows.map((row) => row.model)).toEqual([
    'switchboard/openai/gpt-5.6-sol',
    'switchboard/openai/gpt-5.6-sol-low',
    'switchboard/openai/gpt-5.6-luna',
    'switchboard/openai/gpt-5.6-luna-none',
    'switchboard/openai/gpt-5.6-luna-low',
    'switchboard/openai/gpt-5.6-luna-medium',
    'switchboard/openai/gpt-6-astra',
    'switchboard/openai/gpt-6-astra-low',
    'switchboard/zen/deepseek-v4.1-flash',
  ]);
});

test('a model with no effort dial takes the haiku profile', () => {
  const rows = pickerRows();
  const deepseek = rows.find((row) => row.model.endsWith('deepseek-v4.1-flash'));
  expect(deepseek?.behavesAs).toBe('claude-haiku-4-5');
  const luna = rows.find((row) => row.model.endsWith('gpt-5.6-luna'));
  expect(luna?.behavesAs).toBe('claude-sonnet-4-6');
});

test('every row carries a hand-written description', () => {
  for (const row of pickerRows()) {
    expect(row.description.length).toBeGreaterThan(10);
  }
});

test('workers mirror the picker rows and pin their model', () => {
  const workers = workerDefinitions();
  expect(Object.keys(workers)).toContain('openai-luna-none');
  expect(workers['openai-luna-none'].model).toBe('switchboard/openai/gpt-5.6-luna-none');
  expect(workers['openai-luna-none'].effort).toBe('none');
  expect(workers['openai-luna'].effort).toBeUndefined();
});

test('a bare worker carries no effort so Claude Code decides', () => {
  expect(workerDefinitions()['openai-sol'].effort).toBeUndefined();
});

test('catalog is the single source of exposure', () => {
  expect(CATALOG.map((entry) => entry.id)).toEqual([
    'gpt-5.6-sol',
    'gpt-5.6-luna',
    'gpt-6-astra',
    'deepseek-v4.1-flash',
  ]);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `bun test tests/catalog.test.ts`
Expected: FAIL — `src/catalog.ts` does not exist.

- [ ] **Step 3: Write the catalog**

Create `plugins/switchboard/src/catalog.ts`:

```ts
import type { Effort } from './providers/codex/responses.ts';

export interface CatalogEntry {
  id: string;
  source: 'openai' | 'zen';
  label: string;
  description: string;
  prompt: string;
  /** Empty means the model has no effort dial; only a bare row is emitted. */
  efforts: readonly Effort[];
}

export interface PickerRow {
  model: string;
  label: string;
  description: string;
  behavesAs: string;
}

export interface AgentDefinition {
  description: string;
  prompt: string;
  model: string;
  tools: string[];
  effort?: Effort;
}

const TOOLS = ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write'];

export const CATALOG: readonly CatalogEntry[] = Object.freeze([
  {
    id: 'gpt-5.6-sol',
    source: 'openai',
    label: 'GPT-5.6 Sol',
    description: 'Codex subscription. Broad coding and review work.',
    prompt:
      'Complete the delegated task using the repository as the source of truth. Read before you edit, and report what you changed.',
    efforts: ['low'],
  },
  {
    id: 'gpt-5.6-luna',
    source: 'openai',
    label: 'GPT-5.6 Luna',
    description: 'Codex subscription. Fast delegate for scoped implementation and investigation.',
    prompt:
      'Complete the delegated task. Prefer the smallest change that works, and state any assumption you had to make.',
    efforts: ['none', 'low', 'medium'],
  },
  {
    id: 'gpt-6-astra',
    source: 'openai',
    label: 'GPT-6 Astra',
    description: 'Codex subscription. Deepest reasoning; use for architecture and hard diagnosis.',
    prompt:
      'Complete the delegated task. Trace the real execution path before concluding, and name what you verified versus what you inferred.',
    efforts: ['low'],
  },
  {
    id: 'deepseek-v4.1-flash',
    source: 'zen',
    label: 'DeepSeek V4.1 Flash',
    description: 'OpenCode Zen billing. Native reasoning; /effort does not apply.',
    prompt:
      'Complete the delegated task. Keep the diff tight and report the outcome in one line.',
    efforts: [],
  },
]);

function modelId(entry: CatalogEntry, effort?: Effort): string {
  const suffix = effort ? `-${effort}` : '';
  return `switchboard/${entry.source}/${entry.id}${suffix}`;
}

/** Both profiles resolve to 200K today; the dial decides which one Claude Code assumes. */
function pickerProfile(adjustableEffort: boolean): string {
  return adjustableEffort ? 'claude-sonnet-4-6' : 'claude-haiku-4-5';
}

function workerName(entry: CatalogEntry, effort?: Effort): string {
  const family = entry.id.replace(/^gpt-[\d.]+-/, '').replace(/^gpt-\d+-/, '');
  const prefix = entry.source === 'openai' ? 'openai' : 'zen';
  return `${prefix}-${family}${effort ? `-${effort}` : ''}`;
}

export function pickerRows(catalog: readonly CatalogEntry[] = CATALOG): PickerRow[] {
  return catalog.flatMap((entry) => {
    const adjustable = entry.efforts.length > 0;
    const bare: PickerRow = {
      model: modelId(entry),
      label: entry.label,
      description: entry.description,
      behavesAs: pickerProfile(adjustable),
    };
    const pinned = entry.efforts.map((effort) => ({
      model: modelId(entry, effort),
      label: `${entry.label} · ${effort}`,
      description: `${entry.description} Pinned to ${effort} reasoning.`,
      behavesAs: pickerProfile(true),
    }));
    return [bare, ...pinned];
  });
}

export function workerDefinitions(
  catalog: readonly CatalogEntry[] = CATALOG,
): Record<string, AgentDefinition> {
  const workers: Record<string, AgentDefinition> = {};
  for (const entry of catalog) {
    workers[workerName(entry)] = {
      description: `${entry.label}. ${entry.description}`,
      prompt: entry.prompt,
      model: modelId(entry),
      tools: [...TOOLS],
    };
    for (const effort of entry.efforts) {
      workers[workerName(entry, effort)] = {
        description: `${entry.label}, ${effort} reasoning. ${entry.description}`,
        prompt: entry.prompt,
        model: modelId(entry, effort),
        tools: [...TOOLS],
        effort,
      };
    }
  }
  return workers;
}
```

- [ ] **Step 4: Run the test**

Run: `bun test tests/catalog.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Trim the opencode catalog to one model**

In `src/providers/opencode/models.ts`, reduce `ZEN_MODELS` to the single DeepSeek entry and delete `DEFAULT_ZEN_MODELS`, `GPT_EFFORTS` and the other entries:

```ts
export const ZEN_MODELS: readonly ZenModel[] = Object.freeze([
  {
    id: 'deepseek-v4.1-flash',
    protocol: 'chat',
    label: 'DeepSeek V4.1 Flash',
    description: 'OpenCode Zen · Chat Completions',
    images: false,
    documents: false,
    maxOutputTokens: 384000,
  },
]);
```

- [ ] **Step 6: Delete the upstream Codex catalog**

`src/providers/codex/models.ts` held `MODELS` and `OPENAI_WORKERS`, both replaced by `src/catalog.ts`. Delete the file and fix every importer to use `src/catalog.ts` instead.

- [ ] **Step 7: Typecheck and full test run**

Run: `bun run typecheck && bun test`
Expected: typecheck PASS. Vendored tests naming upstream models still fail; Task 10 retires them.

- [ ] **Step 8: Commit**

```bash
git add -A plugins/switchboard/
git commit -m "feat(switchboard): curated catalog with bare and effort-pinned rows"
```

---

### Task 8: Wire the catalog into the launcher

**Files:**
- Modify: `plugins/switchboard/src/launcher.ts`
- Test: `plugins/switchboard/tests/launcher-settings.test.ts`

**Interfaces:**
- Consumes: `pickerRows`, `workerDefinitions` from Task 7.
- Produces: `export function launchSettings(): { modelPicker: { options: PickerRow[] } }` and the `--settings` / `--agents` argv the child receives. Task 11's smoke test reads the written settings file.

- [ ] **Step 1: Write the failing test**

Create `plugins/switchboard/tests/launcher-settings.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { launchSettings, launcherArguments } from '../src/launcher.ts';

test('settings carry exactly the catalog rows', () => {
  expect(launchSettings().modelPicker.options).toHaveLength(9);
});

test('launcher supplies settings and agents before caller args', () => {
  const args = launcherArguments(['--resume', 'abc'], '/tmp/s.json', '{}');
  expect(args.slice(0, 4)).toEqual(['--settings', '/tmp/s.json', '--agents', '{}']);
  expect(args).toContain('--resume');
  expect(args).toContain('abc');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `bun test tests/launcher-settings.test.ts`
Expected: FAIL — `launchSettings` is not exported.

- [ ] **Step 3: Replace the settings builder**

In `src/launcher.ts`, delete the multi-provider `modelPicker.options` array and the `pickerProfile` helper (now in `catalog.ts`), then add:

```ts
import { pickerRows, workerDefinitions } from './catalog.ts';

export function launchSettings(): LaunchSettings {
  return { modelPicker: { options: pickerRows() } };
}
```

Replace the body of the existing `workerDefinitions` call site so the launcher's `--agents` payload is `JSON.stringify(workerDefinitions())`.

- [ ] **Step 4: Export the argv builder unchanged**

`launcherArguments` already has the right shape at upstream line 1278. Add `export` to it and drop the `inventory` / `pluginRoot` params that only served dropped providers:

```ts
export function launcherArguments(
  args: readonly string[],
  settingsFile: string,
  definitions: string,
): string[] {
  return ['--settings', settingsFile, '--agents', definitions, ...args];
}
```

- [ ] **Step 5: Run the test**

Run: `bun test tests/launcher-settings.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add -A plugins/switchboard/
git commit -m "feat(switchboard): drive picker rows and workers from the catalog"
```

---

### Task 9: Resolve suffixed model ids

**Files:**
- Modify: `plugins/switchboard/src/gateway/server.ts` (model resolution)
- Create: `plugins/switchboard/src/effort-suffix.ts`
- Test: `plugins/switchboard/tests/resolve.test.ts`

**Interfaces:**
- Consumes: `CATALOG` from Task 7, `Effort`/`isEffort` from Task 6.
- Produces: `export function splitEffortSuffix(id: string): { baseModel: string; effort: Effort | null }`. The gateway resolves `switchboard/openai/gpt-5.6-luna-low` to upstream model `gpt-5.6-luna` at effort `low`.

- [ ] **Step 1: Write the failing test**

Create `plugins/switchboard/tests/resolve.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { splitEffortSuffix } from '../src/effort-suffix.ts';

test('a pinned id splits into base model and effort', () => {
  expect(splitEffortSuffix('gpt-5.6-luna-low')).toEqual({
    baseModel: 'gpt-5.6-luna',
    effort: 'low',
  });
});

test('a bare id has no effort', () => {
  expect(splitEffortSuffix('gpt-5.6-luna')).toEqual({
    baseModel: 'gpt-5.6-luna',
    effort: null,
  });
});

test('none is recognised as an effort, not part of the name', () => {
  expect(splitEffortSuffix('gpt-5.6-luna-none')).toEqual({
    baseModel: 'gpt-5.6-luna',
    effort: 'none',
  });
});

test('a model whose name ends in a non-effort word is left alone', () => {
  expect(splitEffortSuffix('deepseek-v4.1-flash')).toEqual({
    baseModel: 'deepseek-v4.1-flash',
    effort: null,
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `bun test tests/resolve.test.ts`
Expected: FAIL — `src/effort-suffix.ts` does not exist.

- [ ] **Step 3: Write the splitter**

Create `plugins/switchboard/src/effort-suffix.ts`:

```ts
import { type Effort, isEffort } from './providers/codex/responses.ts';

// Longest-first so a future multi-word tier is never matched by a shorter prefix.
const BY_LENGTH_DESC: readonly string[] = ['none', 'low', 'medium', 'high'].sort(
  (a, b) => b.length - a.length,
);

export function splitEffortSuffix(name: string): { baseModel: string; effort: Effort | null } {
  for (const candidate of BY_LENGTH_DESC) {
    const suffix = `-${candidate}`;
    if (name.endsWith(suffix) && isEffort(candidate)) {
      return { baseModel: name.slice(0, -suffix.length), effort: candidate };
    }
  }
  return { baseModel: name, effort: null };
}
```

- [ ] **Step 4: Run the test**

Run: `bun test tests/resolve.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Use it in the gateway**

In `src/gateway/server.ts`, replace the upstream `MODELS` lookup in `openaiRequest` so the wire model is the split base and the effort, when present, overrides `output_config.effort`:

```ts
const requested = externalModel.replace(/^switchboard\/openai\//, '');
const { baseModel, effort } = splitEffortSuffix(requested);
const entry = CATALOG.find((item) => item.id === baseModel && item.source === 'openai');
if (!entry) {
  throw new Error('Unknown Codex model');
}
```

Pass `effort` through to `toResponses` ahead of `output_config.effort` so a pinned row wins over `/effort`.

- [ ] **Step 6: Run the tests**

Run: `bun test tests/resolve.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add -A plugins/switchboard/
git commit -m "feat(switchboard): resolve effort-suffixed model ids"
```

---

### Task 10: Restore the vendored test suite to green

**Files:**
- Modify: `plugins/switchboard/tests/*.test.ts`
- Delete: vendored tests covering deleted behaviour

**Interfaces:**
- Consumes: everything from Tasks 3-8.
- Produces: `bun test` green. This is the gate before the launcher is run for real.

- [ ] **Step 1: See what fails**

Run: `bun test 2>&1 | tail -30`
Expected: a list of failures, mostly upstream model ids (`multi/openai/...`) and removed effort tiers.

- [ ] **Step 2: Retire tests for deleted behaviour**

Delete any vendored test whose subject no longer exists: dropped-provider suites, `xhigh`/`max` effort assertions, upstream-catalog shape assertions. Do **not** delete the cache tests — they are the reason this port is trustworthy.

- [ ] **Step 3: Repoint the surviving tests**

Update `multi/openai/<model>` to `switchboard/openai/<model>` and `multi/zen/<model>` to `switchboard/zen/<model>` throughout `tests/`.

- [ ] **Step 4: Confirm the cache tests still pass**

Run: `bun test --test-name-pattern 'cache'`
Expected: PASS. The key-stability test must still assert same-key-across-restart and same-key-across-history.

- [ ] **Step 5: Full green**

Run: `bun run typecheck && bun run lint && bun test`
Expected: all three PASS. Record the test count.

- [ ] **Step 6: Commit**

```bash
git add -A plugins/switchboard/
git commit -m "test(switchboard): restore the vendored suite against the new catalog"
```

---

### Task 11: Launcher binary and end-to-end smoke test

**Files:**
- Create: `plugins/switchboard/bin/switchboard`
- Create: `plugins/switchboard/tests/smoke.test.ts`
- Modify: `plugins/switchboard/package.json` (add `bin`)

**Interfaces:**
- Consumes: Task 7's settings builder, Task 9's green suite.
- Produces: an executable `switchboard` that launches Claude Code with the picker rows installed.

- [ ] **Step 1: Write the shim**

Create `plugins/switchboard/bin/switchboard`:

```sh
#!/bin/sh
exec bun "$(dirname "$0")/../src/launcher.ts" "$@"
```

Then: `chmod +x plugins/switchboard/bin/switchboard`

- [ ] **Step 2: Write the failing smoke test**

Create `plugins/switchboard/tests/smoke.test.ts`:

```ts
import { expect, test } from 'bun:test';

test('the launcher refuses to start when ANTHROPIC_BASE_URL is already set', async () => {
  const proc = Bun.spawn(['./bin/switchboard', '--version'], {
    env: { ...process.env, ANTHROPIC_BASE_URL: 'http://127.0.0.1:9999' },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  await proc.exited;
  const stderr = await new Response(proc.stderr).text();
  expect(stderr).toContain('ANTHROPIC_BASE_URL');
});
```

- [ ] **Step 3: Run it**

Run: `bun test tests/smoke.test.ts`
Expected: PASS if `validateSessionLaunch` survived the strip intact; FAIL means Task 3 removed too much — restore the guard at upstream `launcher.ts:327`.

- [ ] **Step 4: Verify the written settings by hand**

```bash
cd plugins/switchboard
bun -e 'import {launchSettings} from "./src/launcher.ts"; console.log(JSON.stringify(launchSettings(), null, 2))'
```

Expected: 9 rows, each with `model`, `label`, `description`, `behavesAs`.

- [ ] **Step 5: Live check against Claude Code**

```bash
cd plugins/switchboard
bun -e 'import {launchSettings} from "./src/launcher.ts"; await Bun.write("/tmp/sb-settings.json", JSON.stringify(launchSettings()))'
claude --settings /tmp/sb-settings.json
```

Then run `/model` in that session. Expected: the 9 curated rows appear alongside the built-in lineup. This proves `modelPicker` + `behavesAs` without the gateway running.

- [ ] **Step 6: Commit**

```bash
git add -A plugins/switchboard/
git commit -m "feat(switchboard): launcher binary and smoke coverage"
```

---

### Task 12: Point VS Code at the launcher

**Files:**
- Modify: `~/Library/Application Support/Code/User/settings.json`
- Modify: `docs/superpowers/SPEC-switchboard-plugin.md` (record the resolved path)

**Interfaces:**
- Consumes: Task 11's working binary.
- Produces: VS Code sessions launching through the plugin.

- [ ] **Step 1: Back up the current settings**

```bash
S="$HOME/Library/Application Support/Code/User/settings.json"
cp "$S" "$S.bak-$(date +%s)"
```

- [ ] **Step 2: Repoint the wrapper**

Set `claudeCode.claudeProcessWrapper` to the absolute path of `plugins/switchboard/bin/switchboard`. It currently points at `~/.local/share/multi-cli/bin/claude-multi`.

- [ ] **Step 3: Verify**

Reload the VS Code window, start a session, run `/model`.
Expected: the 9 curated rows appear. If the session fails at launch, the error names which `validateSessionLaunch` guard tripped.

- [ ] **Step 4: Commit the spec note**

```bash
git add docs/superpowers/SPEC-switchboard-plugin.md
git commit -m "docs(switchboard): record the VS Code wrapper path"
```

---

## Deferred

Not in this plan; revisit once the above is running.

- **Auth skills.** Upstream ships `/login` and `/connect` skills that shell out to a `multi` binary we are not vendoring. Codex auth reads `~/.codex/auth.json` directly and refreshes via a `codex app-server` subprocess, so it works without them; Zen needs its API key placed by hand until a skill exists.
- **`/multi-usage` rename.** Open question 2 in the spec.
- **DeepSeek effort rows.** Open question 1 — only if Zen's `/chat/completions` turns out to accept `reasoning_effort`.
- **Per-model prompt tuning.** The catalog ships one prompt per model; refine against real delegation behaviour.
