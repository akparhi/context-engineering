import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeReview } from "../codec.ts";
import type { Review } from "../review.ts";
import { computeRevs } from "../revs.ts";
import { stopAll } from "../serve.ts";

const FIXTURE = join(import.meta.dir, "../../fixtures/plan");
const ENTRY = join(import.meta.dir, "../sign-off");
const PAGE = "<!doctype html><html><head><title>plan</title></head><body>page</body></html>";
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "sign-off-serve-")));
let copies = 0;

const planCopy = () => {
  const dir = join(scratch, String(copies++));
  cpSync(FIXTURE, dir, { recursive: true });
  rmSync(join(dir, "reviews"), { recursive: true, force: true });
  writeFileSync(join(dir, "sign-off.html"), PAGE);
  const tomorrow = new Date(Date.now() + 86_400_000);
  utimesSync(join(dir, "sign-off.html"), tomorrow, tomorrow);
  return dir;
};

async function open(dir: string, args: string[] = ["--wait", "0"], env: Record<string, string> = {}) {
  const proc = Bun.spawn([process.execPath, ENTRY, "open", dir, ...args], { stdout: "pipe", stderr: "pipe", env: { ...process.env, ...env } });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { out, err, code, url: out.match(/^http:\/\/127\.0\.0\.1:\d+\//m)?.[0] ?? "" };
}

const servers = (dir: string) => {
  const found = Bun.spawnSync(["pgrep", "-f", `serve.ts ${dir}$`]).stdout.toString().trim();
  return found ? found.split("\n").map(Number) : [];
};
const portFile = (dir: string) => join(dir, ".sign-off.port");
const logOf = (dir: string) => (existsSync(join(dir, "reviews/events.jsonl")) ? readFileSync(join(dir, "reviews/events.jsonl"), "utf8") : "");

async function until(done: () => boolean, ms = 5000) {
  for (const end = Date.now() + ms; Date.now() < end; await Bun.sleep(50)) if (done()) return true;
  return done();
}

const nonceOf = async (url: string) => (await (await fetch(url)).text()).match(/<meta name="sign-off-nonce" content="([0-9a-f]+)">/)?.[1] ?? "";
const post = (url: string, body: string, headers: Record<string, string>) => fetch(`${url}review`, { method: "POST", body, headers });
const fromPage = (url: string, nonce: string) => ({ origin: url.slice(0, -1), "x-sign-off-nonce": nonce });

async function reviewText(dir: string, items: Omit<Review["items"][number], "itemRev">[]) {
  const revs = await computeRevs(dir);
  const review: Review = { v: 1, plan: "LIB-7", planRev: revs.planRev, by: "Ana Ruiz", at: "2026-11-14T10:00:00.000Z", items: items.map((e) => ({ ...e, itemRev: revs.items[e.id] ?? "" })) };
  return `sign-off review of LIB-7\n\n\`\`\`\n${encodeReview(review)}\n\`\`\`\n`;
}
const ANSWERS: Record<string, string> = { Q1: "Q1a", Q2: "Five books at a time.", Q3: "Q3a" };
const settlingReview = async (dir: string) =>
  reviewText(dir, Object.keys((await computeRevs(dir)).items).map((id) => (ANSWERS[id] ? { id, answer: ANSWERS[id] } : { id, verdict: "approve" as const })));

afterAll(() => {
  for (const dir of readdirSync(scratch).map((d) => join(scratch, d))) for (const pid of servers(dir)) process.kill(pid, "SIGKILL");
  rmSync(scratch, { recursive: true, force: true });
});

describe("sign-off open", () => {
  test("serves the page with a nonce that never reaches the file and no page may frame, and a second open reuses the server", async () => {
    const dir = planCopy();
    const first = await open(dir);
    expect(first.code).toBe(0);
    expect(first.url).not.toBe("");
    expect(await nonceOf(first.url)).toMatch(/^[0-9a-f]{32}$/);
    expect((await fetch(first.url)).headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
    expect(readFileSync(join(dir, "sign-off.html"), "utf8")).toBe(PAGE);
    const second = await open(dir);
    expect(second.url).toBe(first.url);
    expect(servers(dir)).toHaveLength(1);
  });

  test("builds a missing page, and rebuilds one older than an input before serving it", async () => {
    const dir = planCopy();
    const page = join(dir, "sign-off.html");
    rmSync(page);
    const missing = await open(dir);
    expect(missing.code).toBe(0);
    expect(await (await fetch(missing.url)).text()).toContain(`id="sign-off-data"`);
    writeFileSync(page, PAGE);
    utimesSync(page, new Date(0), new Date(0));
    expect((await open(dir)).code).toBe(0);
    expect(readFileSync(page, "utf8")).toContain(`id="sign-off-data"`);
  });

  test("a restarted server gets the same port, so the page keeps its origin and its draft", async () => {
    const dir = planCopy();
    const first = await open(dir);
    for (const pid of servers(dir)) process.kill(pid, "SIGTERM");
    expect(await until(() => !existsSync(portFile(dir)) && servers(dir).length === 0)).toBe(true);
    expect((await open(dir)).url).toBe(first.url);
  });

  test("a second plan whose port is taken falls to the next free port", async () => {
    const [a, b] = [planCopy(), planCopy()];
    const [first, second] = [await open(a), await open(b)];
    expect(second.url).not.toBe(first.url);
    expect(new URL(second.url).port).not.toBe("");
    expect((await fetch(`${second.url}health`)).ok).toBe(true);
  });

  test("a port file naming a dead pid and a closed port is replaced", async () => {
    const dir = planCopy();
    const dead = Bun.spawn(["true"]);
    await dead.exited;
    const closed = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") });
    const port = closed.port;
    await closed.stop(true);
    writeFileSync(portFile(dir), JSON.stringify({ pid: dead.pid, port, dir }));
    const { url, code } = await open(dir);
    expect(code).toBe(0);
    expect((await fetch(`${url}health`)).ok).toBe(true);
    expect(JSON.parse(readFileSync(portFile(dir), "utf8")).pid).toBe(servers(dir)[0]);
  });

  test("POST /review rejects a foreign host, a foreign origin, a missing or wrong nonce, and an oversized body, and records nothing", async () => {
    const dir = planCopy();
    const { url } = await open(dir);
    const nonce = await nonceOf(url);
    const text = await reviewText(dir, [{ id: "scope", verdict: "approve" }]);
    const statuses = [
      (await fetch(url, { headers: { host: "evil.example" } })).status,
      (await post(url, text, { ...fromPage(url, nonce), host: "evil.example" })).status,
      (await post(url, text, { ...fromPage(url, nonce), origin: "http://evil.example" })).status,
      (await post(url, text, { origin: url.slice(0, -1) })).status,
      (await post(url, text, fromPage(url, "0".repeat(32)))).status,
      (await post(url, "x".repeat(2 << 20), fromPage(url, nonce))).status,
    ];
    expect(statuses).toEqual([403, 403, 403, 403, 403, 413]);
    expect(logOf(dir)).toBe("");
  });

  test("a valid POST appends to events.jsonl and writes the review file, and the same POST again appends nothing", async () => {
    const dir = planCopy();
    const { url } = await open(dir);
    const nonce = await nonceOf(url);
    const text = await reviewText(dir, [{ id: "scope", verdict: "approve" }, { id: "api", verdict: "changes", note: "Answer 404." }]);
    const first = await post(url, text, fromPage(url, nonce));
    expect(first.status).toBe(200);
    expect((await first.json()).reviews[0]).toMatchObject({ by: "Ana Ruiz", appended: 3, stale: [] });
    const log = logOf(dir);
    expect(log.trim().split("\n")).toHaveLength(3);
    expect(readdirSync(join(dir, "reviews")).filter((f) => f.endsWith(".review.txt"))).toHaveLength(1);
    expect(readFileSync(join(dir, "reviews", `${(await computeRevs(dir)).planRev}.html`), "utf8")).toContain('id="sign-off-data"');
    const again = await post(url, text, fromPage(url, nonce));
    expect((await again.json()).reviews[0].appended).toBe(0);
    expect(logOf(dir)).toBe(log);
  });

  test("a POST of cut review text is refused with 400 and records nothing", async () => {
    const dir = planCopy();
    const { url } = await open(dir);
    const text = (await reviewText(dir, [{ id: "scope", verdict: "approve" }])).replace(/sign-off:v1:(.{8})/, "sign-off:v1:");
    expect((await post(url, text, fromPage(url, await nonceOf(url)))).status).toBe(400);
    expect(logOf(dir)).toBe("");
  });

  test("open waits for the review, prints that it arrived, and exits", async () => {
    const dir = planCopy();
    const { url } = await open(dir);
    const waiting = open(dir, ["--wait", "1"]);
    await Bun.sleep(1500);
    await post(url, await reviewText(dir, [{ id: "scope", verdict: "approve" }]), fromPage(url, await nonceOf(url)));
    const done = await waiting;
    expect(done.code).toBe(0);
    expect(done.out).toContain("Review received");
  });

  test("a review that settles the plan stops the server and removes the port file", async () => {
    const dir = planCopy();
    const { url } = await open(dir);
    expect((await post(url, await settlingReview(dir), fromPage(url, await nonceOf(url)))).status).toBe(200);
    expect(await until(() => !existsSync(portFile(dir)) && servers(dir).length === 0)).toBe(true);
  });

  test("an idle server stops and removes the port file", async () => {
    const dir = planCopy();
    await open(dir, ["--wait", "0"], { SIGN_OFF_IDLE_MS: "1000" });
    expect(await until(() => !existsSync(portFile(dir)) && servers(dir).length === 0, 4000)).toBe(true);
  });

  test("a wait that ends with no review says the server idles out after 2 hours", async () => {
    const { out } = await open(planCopy(), ["--wait", "0.01"]);
    expect(out).toContain("sits idle for 2 hours");
  });
});

async function stop(...args: string[]) {
  const proc = Bun.spawn([process.execPath, ENTRY, "stop", ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { out, err, code };
}

const answers = async (url: string) => (await fetch(`${url}health`, { signal: AbortSignal.timeout(1000) }).catch(() => undefined))?.ok === true;
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe("sign-off stop", () => {
  test("stops the plan's live server, and has removed its port file by the time it returns", async () => {
    const dir = planCopy();
    const { url } = await open(dir);
    const [pid] = servers(dir);
    const { out, code } = await stop(dir);
    expect(code).toBe(0);
    expect(out).toContain(`Stopped the sign-off server for ${dir} (pid ${pid}`);
    expect(existsSync(portFile(dir))).toBe(false);
    expect(await until(() => servers(dir).length === 0)).toBe(true);
    expect(await answers(url)).toBe(false);
  });

  test("waits for a server that is slow to exit, and returns only once its port file is gone", async () => {
    const dir = planCopy();
    const slow = `const { rmSync, writeFileSync } = require("node:fs");
      const [dir, file] = [process.env.DIR, process.env.DIR + "/.sign-off.port"];
      const s = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => Response.json({ dir, pid: process.pid }) });
      writeFileSync(file, JSON.stringify({ pid: process.pid, port: s.port, dir }));
      process.on("SIGTERM", () => setTimeout(() => { rmSync(file); process.exit(0); }, 700));`;
    const server = Bun.spawn([process.execPath, "-e", slow], { env: { ...process.env, DIR: dir } });
    try {
      expect(await until(() => existsSync(portFile(dir)))).toBe(true);
      const began = Date.now();
      const { code } = await stop(dir);
      expect({ code, gone: !existsSync(portFile(dir)), waited: Date.now() - began >= 600 }).toEqual({ code: 0, gone: true, waited: true });
    } finally {
      server.kill("SIGKILL");
    }
  });

  test("a server that ignores SIGTERM is reported as not stopped after 5 seconds, with exit 1", async () => {
    const dir = planCopy();
    const stubborn = `const { writeFileSync } = require("node:fs");
      const dir = process.env.DIR;
      const s = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => Response.json({ dir, pid: process.pid }) });
      writeFileSync(dir + "/.sign-off.port", JSON.stringify({ pid: process.pid, port: s.port, dir }));
      process.on("SIGTERM", () => {});`;
    const server = Bun.spawn([process.execPath, "-e", stubborn], { env: { ...process.env, DIR: dir } });
    try {
      expect(await until(() => existsSync(portFile(dir)))).toBe(true);
      const { err, code } = await stop(dir);
      expect({ code, said: err.includes(`did not stop within 5 seconds`), alive: alive(server.pid) }).toEqual({ code: 1, said: true, alive: true });
    } finally {
      server.kill("SIGKILL");
    }
  }, 15_000);

  test("a plan with no server says so and exits 0", async () => {
    const dir = planCopy();
    const { out, code } = await stop(dir);
    expect({ out: out.trim(), code }).toEqual({ out: `No sign-off server is running for ${dir}.`, code: 0 });
  });

  test("a port file naming a live process that does not answer /health signals nothing", async () => {
    const dir = planCopy();
    const bystander = Bun.spawn(["sleep", "30"]);
    try {
      const closed = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") });
      const port = closed.port;
      await closed.stop(true);
      writeFileSync(portFile(dir), JSON.stringify({ pid: bystander.pid, port, dir }));
      const { out, code } = await stop(dir);
      expect({ out: out.trim(), code }).toEqual({ out: `No sign-off server is running for ${dir}.`, code: 0 });
      expect(alive(bystander.pid)).toBe(true);
    } finally {
      bystander.kill("SIGKILL");
    }
  });

  test("stopping one plan leaves another plan's server running", async () => {
    const [a, b] = [planCopy(), planCopy()];
    const [first, second] = [await open(a), await open(b)];
    expect((await stop(a)).code).toBe(0);
    expect(await answers(first.url)).toBe(false);
    expect(await answers(second.url)).toBe(true);
    expect(existsSync(portFile(b))).toBe(true);
  });

  test("with no argument, or an unknown option, prints the usage and exits 2", async () => {
    for (const args of [[], ["--bogus"], ["--all", "extra"]]) {
      const { err, code } = await stop(...args);
      expect({ code, usage: err.startsWith("usage: sign-off stop") }).toEqual({ code: 2, usage: true });
    }
  });
});

describe("sign-off stop --all", () => {
  test("stops every sign-off server it finds, one line each with its dir, and signals nothing that answers /health with another body", async () => {
    const [a, b] = [planCopy(), planCopy()];
    const [first, second] = [await open(a), await open(b)];
    // Its /health body has a pid, but it is not a sign-off server's body: signalling it would be the bug.
    const free = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") });
    const decoyPort = free.port ?? 0;
    const closedPort = decoyPort + 1;
    await free.stop(true);
    const decoy = Bun.spawn([process.execPath, "-e", `Bun.serve({ hostname: "127.0.0.1", port: ${decoyPort}, fetch: () => Response.json({ status: "ok", pid: process.pid }) })`]);
    const lines: string[] = [];
    const log = spyOn(console, "log").mockImplementation((line: string) => void lines.push(line));
    try {
      for (const end = Date.now() + 5000; Date.now() < end && !(await answers(`http://127.0.0.1:${decoyPort}/`)); ) await Bun.sleep(50);
      expect(await stopAll([closedPort, Number(new URL(first.url).port), Number(new URL(second.url).port), decoyPort])).toBe(0);
      log.mockRestore();
      expect(lines).toHaveLength(2);
      for (const dir of [a, b]) expect(lines.filter((l) => l.startsWith(`Stopped the sign-off server for ${dir} (pid `))).toHaveLength(1);
      expect([await answers(first.url), await answers(second.url)]).toEqual([false, false]);
      expect([existsSync(portFile(a)), existsSync(portFile(b))]).toEqual([false, false]);
      expect(alive(decoy.pid)).toBe(true);
      expect(await answers(`http://127.0.0.1:${decoyPort}/`)).toBe(true);
    } finally {
      log.mockRestore();
      decoy.kill("SIGKILL");
    }
  });

  test("with no server on any probed port, says so and exits 0", async () => {
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      const free = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") });
      const closed = free.port ?? 0;
      await free.stop(true);
      expect(await stopAll([closed, closed + 1])).toBe(0);
      expect(log).toHaveBeenCalledWith("No sign-off server is running.");
    } finally {
      log.mockRestore();
    }
  });
});
