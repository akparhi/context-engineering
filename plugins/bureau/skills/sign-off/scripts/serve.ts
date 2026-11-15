/** `sign-off open <plan-dir>`: one detached server per plan on 127.0.0.1 serves `sign-off.html` and takes the page's review on
 *  POST /review. `.sign-off.port` names the live server. Every run judges that file by asking the server it names, never by trusting
 *  it, so a crash at any point leaves a file the next run can recognize as stale and replace. */
import { spawn } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, linkSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { build, isStale } from "./build.ts";
import { guarded, ingestText, planStatus, ReviewTextError, runIngest } from "./review.ts";
import { canon, hash, readManifest } from "./revs.ts";

export const USAGE = "usage: sign-off open <plan-dir> [--wait <minutes>]   (builds the page when it is missing or stale; waits 25 minutes for a review by default, 0 prints the URL and returns)";

const PAGE = "sign-off.html";
const PORT_FILE = ".sign-off.port";
const NONCE_HEADER = "x-sign-off-nonce";
const PORTS = { first: 41700, count: 1000 };
const MAX_BODY = 1 << 20;
const IDLE_MS = Number(process.env.SIGN_OFF_IDLE_MS ?? 2 * 60 * 60 * 1000);
const START_MS = 10_000;
const PROBE_MS = 300;
const PROBE_BATCH = 100;
const STOP_MS = 5000;

const Claim = z.strictObject({ pid: z.number().int(), port: z.number().int(), dir: z.string() });
type Claim = z.infer<typeof Claim>;
const Health = z.strictObject({ dir: z.string(), pid: z.number().int() });

const portFile = (dir: string) => join(dir, PORT_FILE);
const urlOf = (port: number) => `http://127.0.0.1:${port}/`;

/** The plan's own port, so a restarted server keeps the page's origin, and with it the reviewer's localStorage draft. */
const preferredPort = (planId: string) => PORTS.first + (Number.parseInt(hash(planId).slice(0, 8), 16) % PORTS.count);

function readClaim(dir: string): Claim | undefined {
  try {
    return Claim.parse(JSON.parse(readFileSync(portFile(dir), "utf8")));
  } catch {
    return undefined;
  }
}

/** What the server on `port` says about itself, or undefined when nothing there answers `/health` with a sign-off server's body. */
async function health(port: number, timeoutMs: number): Promise<z.infer<typeof Health> | undefined> {
  try {
    const res = await fetch(`${urlOf(port)}health`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok ? Health.parse(await res.json()) : undefined;
  } catch {
    return undefined;
  }
}

/** The claim in the port file, only if the server it names answers for this plan folder. */
async function liveServer(dir: string): Promise<Claim | undefined> {
  const claim = readClaim(dir);
  if (!claim) return undefined;
  const said = await health(claim.port, 1000);
  return said?.dir === dir && said.pid === claim.pid ? claim : undefined;
}

export function runOpen(argv: string[]): Promise<number> {
  return guarded(async () => {
    let parsed;
    try {
      parsed = parseArgs({ args: argv, options: { wait: { type: "string" } }, allowPositionals: true, strict: true });
    } catch {
      parsed = undefined;
    }
    const [planDir, ...rest] = parsed?.positionals ?? [];
    const minutes = Number(parsed?.values.wait ?? 25);
    if (!planDir || rest.length > 0 || !(minutes >= 0)) {
      console.error(USAGE);
      return 2;
    }
    const dir = realpathSync(resolve(planDir));
    if (await isStale(dir)) console.log(`Built ${await build(dir)}`);
    const status = await planStatus(dir);
    if (status.settled) {
      console.log(`Plan ${status.plan} is settled, so there is nothing to review and no server runs. Next: sign-off status ${planDir}`);
      return 0;
    }
    const server = (await liveServer(dir)) ?? (await start(dir));
    console.log(urlOf(server.port));
    return minutes === 0 ? 0 : watch(dir, planDir, minutes);
  });
}

async function start(dir: string): Promise<Claim> {
  spawn(process.execPath, [import.meta.path, dir], { detached: true, stdio: "ignore" }).unref();
  for (const until = Date.now() + START_MS; Date.now() < until; await Bun.sleep(100)) {
    const live = await liveServer(dir);
    if (live) return live;
  }
  throw new Error(`The server for ${dir} did not start within ${START_MS / 1000} seconds. Run \`bun ${import.meta.path} ${dir}\` to see why.`);
}

/** Waits for a review file the server writes, then ingests it, a no-op because the server already did, so its summary prints here. */
async function watch(dir: string, planDir: string, minutes: number): Promise<number> {
  const reviews = join(dir, "reviews");
  const files = () => (existsSync(reviews) ? readdirSync(reviews).filter((f) => f.endsWith(".review.txt")) : []);
  const before = new Set(files());
  for (const until = Date.now() + minutes * 60_000; Date.now() < until; await Bun.sleep(1000)) {
    const fresh = files().filter((f) => !before.has(f));
    if (fresh.length === 0) continue;
    for (const f of fresh) {
      console.log(`Review received: ${join(reviews, f)}`);
      const code = await runIngest([dir, join(reviews, f), "--via", "page"]);
      if (code !== 0) return code;
    }
    return 0;
  }
  console.log(`No review in ${minutes} minutes. The page stays served until the plan settles or sits idle for 2 hours. Next: sign-off status ${planDir}`);
  return 0;
}

export const STOP_USAGE = `usage: sign-off stop (<plan-dir> | --all)   (stops the plan's server; --all stops every sign-off server on 127.0.0.1 ports ${PORTS.first} to ${PORTS.first + PORTS.count - 1})`;

const ALL_PORTS = Array.from({ length: PORTS.count }, (_, i) => PORTS.first + i);

export function runStop(argv: string[]): Promise<number> {
  return guarded(async () => {
    const [target, ...rest] = argv;
    if (!target || rest.length > 0 || (target.startsWith("-") && target !== "--all")) {
      console.error(STOP_USAGE);
      return 2;
    }
    return target === "--all" ? stopAll(ALL_PORTS) : stopPlan(realpathSync(resolve(target)));
  });
}

async function stopPlan(dir: string): Promise<number> {
  const live = await liveServer(dir);
  if (!live) {
    console.log(`No sign-off server is running for ${dir}.`);
    return 0;
  }
  const [line, stopped] = await stopServer(live);
  (stopped ? console.log : console.error)(line);
  return stopped ? 0 : 1;
}

/** Stops every server on `ports` that answers `/health` with a sign-off body, and signals nothing else. */
export async function stopAll(ports: number[]): Promise<number> {
  const found: Claim[] = [];
  for (let i = 0; i < ports.length; i += PROBE_BATCH) {
    const batch = await Promise.all(ports.slice(i, i + PROBE_BATCH).map(async (port) => ({ port, said: await health(port, PROBE_MS) })));
    for (const { port, said } of batch) if (said) found.push({ ...said, port });
  }
  if (found.length === 0) {
    console.log("No sign-off server is running.");
    return 0;
  }
  const results = await Promise.all(found.map(stopServer));
  for (const [line, stopped] of results) (stopped ? console.log : console.error)(line);
  return results.every(([, stopped]) => stopped) ? 0 : 1;
}

/** Sends SIGTERM to a server `/health` just identified, then waits for it to remove its port file, which it does as it exits. */
async function stopServer(server: Claim): Promise<[line: string, stopped: boolean]> {
  const who = `the sign-off server for ${server.dir} (pid ${server.pid}, port ${server.port})`;
  try {
    process.kill(server.pid, "SIGTERM");
  } catch (error) {
    if ((error as { code?: string }).code !== "ESRCH") throw error;
  }
  for (const until = Date.now() + STOP_MS; Date.now() < until; await Bun.sleep(50)) {
    if (readClaim(server.dir)?.pid !== server.pid) return [`Stopped ${who}.`, true];
  }
  return [`${who} did not stop within ${STOP_MS / 1000} seconds.`, false];
}

function listen(planId: string, fetch: (req: Request, server: Bun.Server<undefined>) => Promise<Response>) {
  const first = preferredPort(planId) - PORTS.first;
  for (let i = 0; i < PORTS.count; i++) {
    try {
      return Bun.serve({ hostname: "127.0.0.1", port: PORTS.first + ((first + i) % PORTS.count), maxRequestBodySize: MAX_BODY, fetch });
    } catch (error) {
      if ((error as { code?: string }).code !== "EADDRINUSE") throw error;
    }
  }
  throw new Error(`Every port from ${PORTS.first} to ${PORTS.first + PORTS.count - 1} is in use.`);
}

/** Writes the port file only if no live server holds it. Linking a complete temp file makes the claim atomic, so a reader never sees
 *  a half-written file. Two servers racing past a stale file can both link; the one whose claim is overwritten exits on its next tick. */
async function claim(dir: string, mine: Claim): Promise<boolean> {
  const tmp = `${portFile(dir)}.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(mine));
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        linkSync(tmp, portFile(dir));
        return true;
      } catch (error) {
        if ((error as { code?: string }).code !== "EEXIST") throw error;
      }
      if (await liveServer(dir)) return false;
      rmSync(portFile(dir), { force: true });
    }
    return false;
  } finally {
    rmSync(tmp, { force: true });
  }
}

const deny = (status: number, message: string) => new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

const sameSecret = (given: string | null, nonce: string) =>
  given !== null && given.length === nonce.length && timingSafeEqual(Buffer.from(given), Buffer.from(nonce));

/** Ingests first and writes the review file after, by rename. The log is the source of truth, so a crash between the two loses only
 *  the file, which the page's retry of the same text writes, and the watcher never reads a review the log does not hold yet. */
async function take(dir: string, text: string) {
  const ingested = await ingestText(dir, text, "page");
  const file = join(dir, "reviews", `${hash(canon(ingested.map((r) => r.review)))}.review.txt`);
  writeFileSync(`${file}.tmp`, text);
  renameSync(`${file}.tmp`, file);
  return ingested.map(({ review, ...rest }) => ({ by: review.by, ...rest }));
}

async function serve(planDir: string) {
  const dir = realpathSync(resolve(planDir));
  const nonce = randomBytes(16).toString("hex");
  let lastRequest = Date.now();
  let queue: Promise<unknown> = Promise.resolve();
  const serially = <T>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job);
    queue = run.catch(() => {});
    return run;
  };

  const page = async () => {
    const file = Bun.file(join(dir, PAGE));
    if (!(await file.exists())) return deny(404, `${PAGE} is missing. Run sign-off open again to build it.`);
    const html = (await file.text()).replace(/<head[^>]*>/i, (head) => `${head}<meta name="sign-off-nonce" content="${nonce}">`);
    // No other page may frame this one: a framed Approve and Submit could be clickjacked, and the page holds the nonce.
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "frame-ancestors 'none'" } });
  };

  const server = listen((await readManifest(dir)).id, async (req, srv) => {
    lastRequest = Date.now();
    const self = `127.0.0.1:${srv.port}`;
    if (req.headers.get("host") !== self) return deny(403, "Unknown host.");
    const { pathname } = new URL(req.url);
    if (req.method === "GET" && pathname === "/") return page();
    if (req.method === "GET" && pathname === "/health") return Response.json({ dir, pid: process.pid });
    if (pathname !== "/review") return deny(404, "Not found.");
    if (req.method !== "POST") return deny(405, "POST a review here.");
    if (req.headers.get("origin") !== `http://${self}`) return deny(403, "Foreign origin.");
    if (!sameSecret(req.headers.get(NONCE_HEADER), nonce)) return deny(403, "Missing or wrong nonce.");
    const text = await req.text();
    try {
      const reviews = await serially(() => take(dir, text));
      setTimeout(() => void reconcile(), 100);
      return Response.json({ reviews });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return error instanceof ReviewTextError ? Response.json({ error: message }, { status: 400 }) : Response.json({ error: message }, { status: 500 });
    }
  });

  const release = () => {
    if (readClaim(dir)?.pid === process.pid) rmSync(portFile(dir), { force: true });
  };
  const exit = (removeClaim: boolean) => {
    if (removeClaim) release();
    server.stop(true);
    process.exit(0);
  };
  /** The server's whole lifetime, judged from what exists now: the port file, the clock, and the plan's status. */
  const reconcile = async () => {
    if (readClaim(dir)?.pid !== process.pid) return exit(false);
    if (Date.now() - lastRequest > IDLE_MS) return exit(true);
    try {
      if ((await planStatus(dir)).settled) exit(true);
    } catch {
      // A plan mid-edit can fail to parse. The next tick checks again.
    }
  };

  if (!(await claim(dir, { pid: process.pid, port: server.port ?? 0, dir }))) return exit(false);
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) process.on(signal, () => exit(true));
  setInterval(() => void reconcile(), Math.min(60_000, IDLE_MS / 2));
}

if (import.meta.main) {
  const [planDir] = process.argv.slice(2);
  if (!planDir) {
    console.error(`usage: bun ${import.meta.path} <plan-dir>`);
    process.exit(2);
  }
  await serve(planDir);
}
