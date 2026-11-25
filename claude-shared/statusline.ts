#!/usr/bin/env bun
/**
 * Claude Code statusline: session line + CLIProxyAPI line.
 * Reads the statusline JSON on stdin and prints two ANSI-coloured lines.
 * `--refresh-cache` recomputes the usage-DB cache (spawned detached by the render path).
 * Every external source degrades by omitting its segment; nothing here may throw to the terminal.
 */
import { Database } from "bun:sqlite";
import { spawn } from "node:child_process";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";

const PROXY_URL = process.env.CLIPROXY_URL ?? "http://127.0.0.1:8317";
const HTTP_TIMEOUT_MS = 150;
const GIT_TIMEOUT_MS = 200;
const CPA_DIR = join(homedir(), "Library/Application Support/com.cpa.gui");
const CONFIG_PATH = join(CPA_DIR, "config.toml");
// immutable=1: a plain read-only open fails with SQLITE_CANTOPEN while the proxy holds the DB.
const USAGE_DB_URI = `file://${encodeURI(join(CPA_DIR, "usage-records/usage.db"))}?immutable=1`;
const CACHE_PATH = join(process.env.TMPDIR ?? tmpdir(), "claude-statusline-cache.json");
const LOCK_PATH = `${CACHE_PATH}.lock`;
const CACHE_TTL_MS = 20_000;
const LOCK_STALE_MS = 30_000;

// Catppuccin Mocha
const palette = {
  text: [205, 214, 244],
  subtext: [166, 173, 200],
  overlay: [108, 112, 134],
  surface: [69, 71, 90],
  green: [166, 227, 161],
  yellow: [249, 226, 175],
  red: [243, 139, 168],
  peach: [250, 179, 135],
  mauve: [203, 166, 247],
  blue: [137, 180, 250],
  teal: [148, 226, 213],
  lavender: [180, 190, 254],
} as const satisfies Record<string, readonly [number, number, number]>;
type Colour = keyof typeof palette;

const paint = (colour: Colour, s: string): string => {
  const [r, g, b] = palette[colour];
  return `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`;
};
const SEP = paint("overlay", " │ ");
const DOT = paint("overlay", " · ");

// Nerd Font v3 codepoints, escaped because editors and tools silently drop private-use glyphs.
const ICON = {
  model: "\u{F06A9}",
  context: "\u{F09D1}",
  branch: "\u{E0A0}",
  worktree: "\u{F062C}",
  dirty: "\u{F03EB}",
  folder: "\u{F07C}",
  clock: "\u{F017}",
  account: "\u{F007}",
  quota: "\u{F029A}",
  reset: "\u{F252}",
  pool: "\u{F0849}",
  tokens: "\u{F0128}",
  proxyUp: "\u{F048D}",
  proxyDown: "\u{F048F}",
} as const;

const levelColour = (fraction: number): Colour => (fraction < 0.5 ? "green" : fraction < 0.8 ? "yellow" : "red");
const pct = (fraction: number): string => paint(levelColour(fraction), `${Math.round(fraction * 100)}%`);
/** Shows what is left, coloured by how much is used. */
const remaining = (used: number): string => paint(levelColour(used), `${Math.round((1 - used) * 100)}%`);

function compactDuration(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return `${Math.max(0, Math.floor(ms / 1000))}s`;
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h${String(mins % 60).padStart(2, "0")}m`;
  return `${Math.floor(hours / 24)}d${hours % 24}h`;
}

function compactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${(n / 1_000_000_000).toFixed(1)}B`;
}

// ---------- boundary parsing ----------

type Json = Record<string, unknown>;
const asObj = (v: unknown): Json | undefined =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : undefined;
const asStr = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);
const asNum = (v: unknown): number | undefined => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};

interface Session {
  model?: string;
  effort?: string;
  cwd?: string;
  worktree?: string;
  contextTokens?: number;
  contextWindow?: number;
  durationMs?: number;
  linesAdded?: number;
  linesRemoved?: number;
}

function parseSession(raw: unknown): Session {
  const root = asObj(raw) ?? {};
  const usage = asObj(asObj(root.context_window)?.current_usage);
  const cost = asObj(root.cost);
  const tokenParts = usage
    ? [usage.input_tokens, usage.cache_creation_input_tokens, usage.cache_read_input_tokens].map(asNum)
    : [];
  return {
    model: asStr(asObj(root.model)?.display_name),
    effort: asStr(asObj(root.effort)?.level),
    cwd: asStr(asObj(root.workspace)?.current_dir),
    worktree: asStr(asObj(root.worktree)?.name),
    contextTokens: usage ? tokenParts.reduce<number>((sum, n) => sum + (n ?? 0), 0) : undefined,
    contextWindow:
      asNum(process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW) ?? asNum(asObj(root.context_window)?.context_window_size),
    durationMs: asNum(cost?.total_duration_ms),
    linesAdded: asNum(cost?.total_lines_added),
    linesRemoved: asNum(cost?.total_lines_removed),
  };
}

type PoolState = "ok" | "cooling" | "blocked" | "off";

interface Credential {
  authIndex: string;
  label: string;
  isClaude: boolean;
  state: PoolState;
  util5h?: number;
  util7d?: number;
  reset5hEpochS?: number;
  reset7dEpochS?: number;
}

const SIGNAL = "Anthropic-Ratelimit-Unified-";

function parseCredential(raw: unknown): Credential | undefined {
  const c = asObj(raw);
  const authIndex = asStr(c?.auth_index);
  if (!c || !authIndex) return undefined;
  const signals = asObj(asObj(c.quota)?.signals) ?? {};
  const name = asStr(c.email) ?? asStr(c.label) ?? authIndex;
  const cooldowns = Array.isArray(c.cooldowns) ? c.cooldowns : [];
  const state: PoolState =
    c.disabled === true || c.unavailable === true || c.status !== "active"
      ? "off"
      : c.quota_blocked === true
        ? "blocked"
        : cooldowns.length > 0
          ? "cooling"
          : "ok";
  return {
    authIndex: authIndex.slice(0, 16),
    label: name.split("@")[0] ?? name,
    isClaude: c.provider === "claude",
    state,
    util5h: asNum(signals[`${SIGNAL}5h-Utilization`]),
    util7d: asNum(signals[`${SIGNAL}7d-Utilization`]),
    reset5hEpochS: asNum(signals[`${SIGNAL}5h-Reset`]),
    reset7dEpochS: asNum(signals[`${SIGNAL}7d-Reset`]),
  };
}

// ---------- sources (each resolves, never rejects) ----------

async function getJson(path: string, key?: string): Promise<unknown> {
  try {
    const res = await fetch(`${PROXY_URL}${path}`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    return res.ok ? await res.json() : undefined;
  } catch {
    return undefined;
  }
}

function readManagementKey(): string | undefined {
  try {
    const match = readFileSync(CONFIG_PATH, "utf8").match(/^\s*management-secret-key\s*=\s*"([^"]*)"/m);
    return match?.[1] || undefined;
  } catch {
    return undefined;
  }
}

interface ProxyState {
  up: boolean;
  credentials: Credential[];
}

async function readProxy(): Promise<ProxyState> {
  const key = readManagementKey();
  const [health, creds] = await Promise.all([
    getJson("/healthz"),
    key ? getJson("/v8/management/credentials", key) : undefined,
  ]);
  const files = asObj(creds)?.files;
  return {
    up: asObj(health)?.status === "ok",
    credentials: Array.isArray(files) ? files.map(parseCredential).filter((c) => c !== undefined) : [],
  };
}

interface GitState {
  branch: string;
  dirty: number;
  ahead: number;
  behind: number;
}

async function readGit(cwd: string | undefined): Promise<GitState | undefined> {
  if (!cwd) return undefined;
  try {
    const proc = Bun.spawn(["git", "--no-optional-locks", "status", "--porcelain=v2", "--branch"], {
      cwd,
      stdout: "pipe",
      stderr: "ignore",
      timeout: GIT_TIMEOUT_MS,
    });
    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    if (code !== 0) return undefined;
    const state: GitState = { branch: "?", dirty: 0, ahead: 0, behind: 0 };
    for (const line of out.split("\n")) {
      if (line.startsWith("# branch.head ")) state.branch = line.slice(14);
      else if (line.startsWith("# branch.ab ")) {
        const [a, b] = line.slice(12).split(" ");
        state.ahead = Math.abs(Number(a) || 0);
        state.behind = Math.abs(Number(b) || 0);
      } else if (line !== "" && !line.startsWith("#")) state.dirty++;
    }
    return state;
  } catch {
    return undefined;
  }
}

// ---------- usage-DB cache ----------

interface UsageCache {
  computedAtMs: number;
  lastAuthIndex?: string;
  /** Last 24h, successful attempts. input includes cache reads and writes. */
  inputTokens24h: number;
  outputTokens24h: number;
  cacheReadTokens24h: number;
}

function readCache(): UsageCache | undefined {
  try {
    const c = asObj(JSON.parse(readFileSync(CACHE_PATH, "utf8")));
    const computedAtMs = asNum(c?.computedAtMs);
    if (!c || computedAtMs === undefined) return undefined;
    return {
      computedAtMs,
      lastAuthIndex: asStr(c.lastAuthIndex),
      inputTokens24h: asNum(c.inputTokens24h) ?? 0,
      outputTokens24h: asNum(c.outputTokens24h) ?? 0,
      cacheReadTokens24h: asNum(c.cacheReadTokens24h) ?? 0,
    };
  } catch {
    return undefined;
  }
}

/** Takes the refresh lock unless a live refresh holds it. Lock content = acquire time (ms). */
function tryLock(): boolean {
  try {
    writeFileSync(LOCK_PATH, String(Date.now()), { flag: "wx" });
    return true;
  } catch {
    const heldSince = asNum(safeRead(LOCK_PATH)) ?? 0;
    if (Date.now() - heldSince < LOCK_STALE_MS) return false;
    rmSync(LOCK_PATH, { force: true });
    try {
      writeFileSync(LOCK_PATH, String(Date.now()), { flag: "wx" });
      return true;
    } catch {
      return false;
    }
  }
}

function safeRead(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

function spawnRefresh(): void {
  if (!tryLock()) return;
  try {
    spawn(process.execPath, [import.meta.path, "--refresh-cache"], { detached: true, stdio: "ignore" }).unref();
  } catch {
    rmSync(LOCK_PATH, { force: true });
  }
}

function refreshCache(): void {
  try {
    const db = new Database(USAGE_DB_URI, { readonly: true });
    const last = db
      .query<{ auth_index: string }, []>("SELECT auth_index FROM usage_events ORDER BY timestamp_ms DESC LIMIT 1")
      .get();
    const tokens = db
      .query<{ input: number | null; output: number | null; cacheRead: number | null }, [number]>(
        "SELECT sum(input_tokens) AS input, sum(output_tokens) AS output, sum(cache_read_tokens) AS cacheRead FROM usage_events WHERE failed = 0 AND timestamp_ms >= ?",
      )
      .get(Date.now() - 86_400_000);
    db.close();
    const cache: UsageCache = {
      computedAtMs: Date.now(),
      lastAuthIndex: last?.auth_index.slice(0, 16),
      inputTokens24h: tokens?.input ?? 0,
      outputTokens24h: tokens?.output ?? 0,
      cacheReadTokens24h: tokens?.cacheRead ?? 0,
    };
    const tmp = `${CACHE_PATH}.${process.pid}`;
    writeFileSync(tmp, JSON.stringify(cache));
    renameSync(tmp, CACHE_PATH);
  } finally {
    rmSync(LOCK_PATH, { force: true });
  }
}

function usageFromCache(): UsageCache | undefined {
  const cache = readCache();
  if (!cache || Date.now() - cache.computedAtMs > CACHE_TTL_MS) spawnRefresh();
  return cache;
}

// ---------- render ----------

/** Thin track, one weight for fill and rest so the line stays even. */
function lineBar(fraction: number, colour: Colour, cells = 10): string {
  const filled = Math.min(cells, Math.round(fraction * cells));
  return paint(colour, "━".repeat(filled)) + paint("surface", "━".repeat(cells - filled));
}

function renderSessionLine(s: Session, git: GitState | undefined): string {
  const parts: string[] = [];

  if (s.model) parts.push(paint("mauve", `${ICON.model} ${s.model}`) + (s.effort ? paint("subtext", ` · ${s.effort}`) : ""));

  if (s.contextTokens === undefined || !s.contextWindow) {
    parts.push(paint("overlay", `${ICON.context} —`));
  } else {
    const fraction = s.contextTokens / s.contextWindow;
    const colour = levelColour(fraction);
    parts.push(
      `${paint(colour, `${ICON.context} `)}${lineBar(fraction, colour)} ${pct(fraction)} ` +
        paint("overlay", `${compactCount(s.contextTokens)}/${compactCount(s.contextWindow)}`),
    );
  }

  if (git) {
    let seg = paint("blue", `${ICON.branch} ${git.branch}`);
    if (s.worktree) seg += paint("teal", ` ${ICON.worktree} ${s.worktree}`);
    if (git.dirty) seg += paint("yellow", ` ${ICON.dirty} ${git.dirty}`);
    if (git.ahead) seg += paint("green", ` ↑${git.ahead}`);
    if (git.behind) seg += paint("red", ` ↓${git.behind}`);
    parts.push(seg);
  }

  if (s.cwd) parts.push(paint("lavender", `${ICON.folder} ${basename(s.cwd)}`));

  const tail: string[] = [];
  if (s.durationMs !== undefined) tail.push(paint("subtext", `${ICON.clock} ${compactDuration(s.durationMs)}`));
  if (s.linesAdded !== undefined || s.linesRemoved !== undefined)
    tail.push(`${paint("green", `+${s.linesAdded ?? 0}`)} ${paint("red", `−${s.linesRemoved ?? 0}`)}`);
  if (tail.length) parts.push(tail.join(" "));

  return parts.join(SEP);
}

function renderProxyLine(proxy: ProxyState, usage: UsageCache | undefined): string {
  if (!proxy.up) return paint("red", `${ICON.proxyDown} proxy down`);
  const parts: string[] = [];

  const serving = usage?.lastAuthIndex
    ? proxy.credentials.find((c) => c.authIndex === usage.lastAuthIndex)
    : undefined;
  if (serving) {
    const resetIn = (epochS: number | undefined): string => {
      const left = epochS === undefined ? 0 : epochS * 1000 - Date.now();
      return left > 0 ? paint("overlay", ` ${ICON.reset}${compactDuration(left)}`) : "";
    };
    const windows: string[] = [];
    if (serving.util5h !== undefined)
      windows.push(`${paint("subtext", "5h")} ${remaining(serving.util5h)}${resetIn(serving.reset5hEpochS)}`);
    if (serving.util7d !== undefined)
      windows.push(`${paint("subtext", "7d")} ${remaining(serving.util7d)}${resetIn(serving.reset7dEpochS)}`);
    let seg = paint("peach", `${ICON.account} ${serving.label}`);
    if (windows.length) seg += `  ${paint("subtext", ICON.quota)} ${windows.join(DOT)}`;
    parts.push(seg);
  }

  const pool = proxy.credentials.filter((c) => c.isClaude);
  if (pool.length) {
    const count = (state: PoolState) => pool.filter((c) => c.state === state).length;
    const ok = count("ok");
    let seg = paint(ok === pool.length ? "green" : ok > 0 ? "yellow" : "red", `${ICON.pool} ${ok}/${pool.length} ok`);
    const extras: [PoolState, Colour][] = [
      ["cooling", "yellow"],
      ["blocked", "red"],
      ["off", "overlay"],
    ];
    for (const [state, colour] of extras) {
      const n = count(state);
      if (n) seg += paint(colour, ` ${n} ${state}`);
    }
    parts.push(seg);
  }


  if (usage?.inputTokens24h) {
    const cachedPct = Math.round((usage.cacheReadTokens24h / usage.inputTokens24h) * 100);
    parts.push(
      paint("subtext", `${ICON.tokens} 24h ${compactCount(usage.inputTokens24h)} in`) +
        DOT +
        paint("subtext", `${compactCount(usage.outputTokens24h)} out`) +
        DOT +
        paint("overlay", `${cachedPct}% cached`),
    );
  }

  return `${paint("green", ICON.proxyUp)} ${parts.join(SEP)}`;
}

async function main(): Promise<void> {
  if (process.argv.includes("--refresh-cache")) {
    refreshCache();
    return;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await Bun.stdin.text());
  } catch {
    raw = undefined;
  }
  const session = parseSession(raw);
  const [git, proxy] = await Promise.all([readGit(session.cwd), readProxy()]);
  const usage = proxy.up ? usageFromCache() : undefined;
  process.stdout.write(`${renderSessionLine(session, git)}\n${renderProxyLine(proxy, usage)}\n`);
}

await main().catch(() => {
  process.stdout.write("\n");
});
