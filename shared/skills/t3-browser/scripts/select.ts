#!/usr/bin/env bun
/**
 * Element selection for the T3 preview browser.
 *
 * The agent owns every MCP call — it holds the credential this process cannot
 * reach. This script answers "which element?" for every planned step on the
 * current page in one sub-second call, so the agent never spends a reasoning
 * turn scanning interactiveElements.
 *
 * Usage:
 *   bun select.ts --goal "..." --step "..." [--step "..."] --snapshot page.json
 *   echo '{ "goal", "subgoals": [...], "snapshot": {...} }' | bun select.ts
 *
 * snapshot = the preview_snapshot result, or just its { url, visibleText,
 * interactiveElements } — geometry and log arrays are ignored.
 *
 * Output, one line of JSON:
 *   { "steps": [ { "subgoal", "locator" | null, "id", "label", "confidence" } ], "ms", "inputTokens" }
 */
import { createJev } from "./jev.ts";
import { createSelector } from "./selector.ts";
import { fromT3, type Snapshot, type T3Page } from "./snapshot.ts";

type Input = {
  goal: string;
  subgoal?: string;
  subgoals?: string[];
  snapshot: T3Page | Snapshot;
};

type Step = {
  subgoal: string;
  locator: string | null;
  id?: string;
  label?: string;
  confidence?: number;
  reason?: string;
  fromCache?: true;
};

/**
 * Locators keyed by route + subgoal, so a flow re-run on the same page skips
 * Jev entirely. Ids and query strings vary per tenant and per filter, so they
 * are normalized out of the key. A cached locator is a guess about a live page:
 * the caller must confirm it still resolves (preview_wait_for) and rerun with
 * --no-cache when it does not.
 */
function routeKey(url = ""): string {
  try {
    const { host, pathname } = new URL(url);
    const path = pathname
      .split("/")
      .map((segment) =>
        /^[0-9]+$/.test(segment) || /^[0-9a-f-]{16,}$/i.test(segment) ? ":id" : segment,
      )
      .join("/");
    return `${host}${path}`;
  } catch {
    return url;
  }
}

async function openCache(file: string | undefined, url: string | undefined, scope?: string) {
  // A dialog is a different page state at the same URL; without the scope its
  // locators would overwrite the underlying page's entries.
  const key = scope ? `${routeKey(url)}#${scope}` : routeKey(url);
  const store: Record<string, Record<string, Step>> = file
    ? await Bun.file(file)
        .json()
        .catch(() => ({}))
    : {};
  const page = (store[key] ??= {});
  let dirty = false;
  return {
    get: (subgoal: string): Step | undefined => {
      const hit = file ? page[subgoal] : undefined;
      return hit && { ...hit, fromCache: true };
    },
    set: (subgoal: string, step: Step) => {
      if (!file) return;
      page[subgoal] = step;
      dirty = true;
    },
    flush: async () => {
      // Bun.write creates missing parent directories.
      if (file && dirty) await Bun.write(file, JSON.stringify(store, null, 2));
    },
  };
}

/**
 * Cache lives with the project under test, not with the skill — locators are
 * facts about that app, they belong in its repo where they can be reviewed and
 * deleted alongside a UI change. `--cache <file>` picks another store,
 * `--no-cache` forces a fresh Jev call, `T3_BROWSER_CACHE` overrides the path.
 */
let cacheFile: string | undefined =
  process.env.T3_BROWSER_CACHE ?? `${process.cwd()}/.t3-browser/locator-cache.json`;

/** Page state that a URL alone does not capture, e.g. `--scope modal:new-card`. */
let cacheScope: string | undefined;

const isT3 = (value: unknown): value is T3Page =>
  !!value && typeof value === "object" && "interactiveElements" in value;

const fail = (message: string): never => {
  console.error(message);
  process.exit(2);
};

async function readInput(argv: string[]): Promise<Input> {
  const flags: { goal?: string; steps: string[]; snapshot?: string } = { steps: [] };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--goal") flags.goal = value, i++;
    else if (flag === "--step" || flag === "--subgoal") flags.steps.push(value ?? ""), i++;
    else if (flag === "--snapshot") flags.snapshot = value, i++;
    else if (flag === "--cache") cacheFile = value, i++;
    else if (flag === "--scope") cacheScope = value, i++;
    else if (flag === "--no-cache") cacheFile = undefined;
    else fail(`Unknown argument ${flag}`);
  }

  if (flags.goal || flags.steps.length || flags.snapshot) {
    if (!flags.goal) fail("--goal is required.");
    if (flags.steps.length === 0) fail("At least one --step is required.");
    if (!flags.snapshot) fail("--snapshot <file> is required with flags.");
    const snapshot = JSON.parse(await Bun.file(flags.snapshot!).text());
    return { goal: flags.goal!, subgoals: flags.steps, snapshot };
  }

  const raw = await Bun.stdin.text();
  if (!raw.trim()) fail("Pass --goal/--step/--snapshot flags or JSON on stdin.");
  return JSON.parse(raw) as Input;
}

const input = await readInput(process.argv.slice(2));
const subgoals = input.subgoals ?? (input.subgoal ? [input.subgoal] : []);
if (!input.goal) fail(`Missing "goal".`);
if (subgoals.length === 0) fail(`Missing "subgoals" (or "subgoal").`);
if (!input.snapshot) fail(`Missing "snapshot".`);

const snapshot = isT3(input.snapshot) ? fromT3(input.snapshot) : (input.snapshot as Snapshot);
const cache = await openCache(cacheFile, snapshot.url, cacheScope);
const pending = subgoals.filter((subgoal) => !cache.get(subgoal));

let ms = 0;
let inputTokens = 0;
const resolved = new Map<string, Step>();
if (pending.length > 0) {
  const select = createSelector(createJev());
  const result = await select({ goal: input.goal, subgoals: pending, snapshot });
  ms = result.ms;
  inputTokens = result.inputTokens;
  for (const { subgoal, element, confidence } of result.selections) {
    const step: Step = element
      ? {
          subgoal,
          locator: element.locator ?? null,
          id: element.id,
          label: element.label,
          confidence: Number(confidence.toFixed(3)),
        }
      : { subgoal, locator: null, reason: "No offered element fits." };
    resolved.set(subgoal, step);
    // Only confident hits are worth replaying; a decline or a coin flip should be re-asked.
    if (step.locator && (step.confidence ?? 0) >= 0.8) cache.set(subgoal, step);
  }
}
await cache.flush();

console.log(
  JSON.stringify({
    steps: subgoals.map((subgoal) => resolved.get(subgoal) ?? cache.get(subgoal)!),
    ms: Math.round(ms),
    inputTokens,
    cached: subgoals.length - pending.length,
  }),
);
