/** Headless Chromium over the DevTools protocol, with no dependency: the skill ships without `node_modules` for a browser driver.
 *  `findChromium` looks, in order, at `$SIGN_OFF_CHROMIUM`, the Playwright browser cache, the usual Chrome and Chromium installs,
 *  and `PATH`. */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

/** No browser to drive: none was found, or the one found would not start. The selftest prints it as a skip. */
export class NoBrowser extends Error {}

const ENV = "SIGN_OFF_CHROMIUM";
const PLAYWRIGHT_CACHES = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(homedir(), "Library/Caches/ms-playwright"), join(homedir(), ".cache/ms-playwright")];
// Newest first within each pattern, because the folder names end in Playwright's browser revision.
const PLAYWRIGHT_BINARIES = [
  "chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell",
  "chromium-*/chrome-mac*/Chromium.app/Contents/MacOS/Chromium",
  "chromium-*/chrome-linux*/chrome",
];
const INSTALLS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
const ON_PATH = ["chrome-headless-shell", "chromium", "chromium-browser", "google-chrome", "google-chrome-stable"];

export function findChromium(): string {
  const chosen = process.env[ENV];
  if (chosen !== undefined) {
    if (!existsSync(chosen)) throw new NoBrowser(`${ENV}=${chosen} does not exist`);
    return chosen;
  }
  for (const cache of PLAYWRIGHT_CACHES) {
    if (!cache || !existsSync(cache)) continue;
    for (const pattern of PLAYWRIGHT_BINARIES) {
      const found = [...new Bun.Glob(pattern).scanSync({ cwd: cache, onlyFiles: false })].sort().reverse()[0];
      if (found) return join(cache, found);
    }
  }
  const found = INSTALLS.find((path) => existsSync(path)) ?? ON_PATH.map((name) => Bun.which(name)).find((path) => path !== null);
  if (!found) throw new NoBrowser(`no Chromium found; set ${ENV} to a Chrome or Chromium binary`);
  return found;
}

// The DevTools replies and events read here, and only the fields read.
const Exception = z.looseObject({ text: z.string(), exception: z.looseObject({ description: z.string().optional() }).optional() });
const Message = z.looseObject({
  id: z.number().optional(), method: z.string().optional(), params: z.unknown().optional(),
  result: z.unknown().optional(), error: z.looseObject({ message: z.string() }).optional(),
});
const ConsoleCall = z.looseObject({ type: z.string(), args: z.array(z.looseObject({ value: z.unknown().optional(), description: z.string().optional() })) });
const Thrown = z.looseObject({ exceptionDetails: Exception });
const LogEntry = z.looseObject({ entry: z.looseObject({ level: z.string(), text: z.string() }) });
const Evaluated = z.looseObject({ result: z.looseObject({ value: z.unknown().optional() }), exceptionDetails: Exception.optional() });
const Targets = z.array(z.looseObject({ type: z.string(), webSocketDebuggerUrl: z.string() }));
const said = (e: z.infer<typeof Exception>) => e.exception?.description ?? e.text;

/** What one page load showed: the console errors and uncaught exceptions it logged, and the value `script` returned. */
export type PageRun<T> = { errors: string[]; value: T };

const START_MS = 10_000;
const RUN_MS = 20_000;

async function devtoolsUrl(proc: Bun.Subprocess<"ignore", "ignore", "pipe">): Promise<string> {
  const reader = proc.stderr.getReader(), decoder = new TextDecoder();
  let text = "";
  const timeout = setTimeout(() => reader.cancel(), START_MS);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
      const url = text.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
      if (url) return url;
    }
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  throw new NoBrowser(`it exited or printed no DevTools address within ${START_MS / 1000} s, last output: ${text.trim().split("\n").at(-1) || "none"}`);
}

/** Loads `url` in a fresh headless browser at 1280 by 900, or at `size` ("width,height"), evaluates `script` (an expression that may return a promise) once the
 *  load event fires, parses what it returned with `returns`, and closes the browser. Throws `NoBrowser` when the binary will not start. */
export async function inChromium<T>(binary: string, url: string, script: string, returns: z.ZodType<T>, size = "1280,900"): Promise<PageRun<T>> {
  const profile = mkdtempSync(join(tmpdir(), "sign-off-chromium-"));
  let proc: Bun.Subprocess<"ignore", "ignore", "pipe">;
  try {
    proc = Bun.spawn([binary, "--headless", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run",
      "--no-default-browser-check", "--disable-gpu", `--window-size=${size}`, "about:blank"], { stdin: "ignore", stdout: "ignore", stderr: "pipe" });
  } catch (error) {
    rmSync(profile, { recursive: true, force: true });
    throw new NoBrowser(`${binary} would not start: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const browserWs = await devtoolsUrl(proc).catch((error) => { throw new NoBrowser(`${binary} did not start: ${error.message}`); });
    const targets = Targets.parse(await (await fetch(`http://${new URL(browserWs).host}/json/list`)).json());
    const page = targets.find((t) => t.type === "page");
    if (!page) throw new Error("the browser opened no page");
    return await drive(page.webSocketDebuggerUrl, url, script, returns);
  } finally {
    proc.kill("SIGKILL");
    await proc.exited;
    rmSync(profile, { recursive: true, force: true });
  }
}

async function drive<T>(pageWs: string, url: string, script: string, returns: z.ZodType<T>): Promise<PageRun<T>> {
  const ws = new WebSocket(pageWs);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error(`could not connect to ${pageWs}`)); });
  const errors: string[] = [], pending = new Map<number, (m: z.infer<typeof Message>) => void>();
  let next = 0, loaded: () => void = () => {};
  const load = new Promise<void>((ok) => { loaded = ok; });
  let timer: Timer | undefined, broken: (error: Error) => void = () => {};
  // Ends the run on a timeout or on a message this file cannot read, instead of waiting on a reply that never resolves.
  const stopped = new Promise<never>((_, fail) => {
    broken = fail;
    timer = setTimeout(() => fail(new Error(`the page did not finish within ${RUN_MS / 1000} s`)), RUN_MS);
  });
  ws.onmessage = ({ data }) => { try { read(String(data)); } catch (error) { broken(new Error(`unreadable DevTools message: ${error}`)); } };
  const read = (data: string) => {
    const m = Message.parse(JSON.parse(data));
    if (m.id !== undefined) return pending.get(m.id)?.(m);
    if (m.method === "Page.loadEventFired") return loaded();
    const call = m.method === "Runtime.consoleAPICalled" ? ConsoleCall.parse(m.params) : null;
    if (call?.type === "error") errors.push(call.args.map((a) => a.description ?? String(a.value)).join(" "));
    if (m.method === "Runtime.exceptionThrown") errors.push(said(Thrown.parse(m.params).exceptionDetails));
    const log = m.method === "Log.entryAdded" ? LogEntry.parse(m.params).entry : null;
    if (log?.level === "error") errors.push(log.text);
  };
  const send = (method: string, params: object = {}) => new Promise<unknown>((ok, fail) => {
    const id = next++;
    pending.set(id, (m) => (m.error ? fail(new Error(`${method}: ${m.error.message}`)) : ok(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  try {
    return await Promise.race([stopped, (async () => {
      for (const domain of ["Page", "Runtime", "Log"]) await send(`${domain}.enable`);
      await send("Page.navigate", { url });
      await load;
      const { result, exceptionDetails } = Evaluated.parse(await send("Runtime.evaluate", { expression: script, awaitPromise: true, returnByValue: true }));
      if (exceptionDetails) throw new Error(`the page script threw: ${said(exceptionDetails)}`);
      return { errors, value: returns.parse(result.value) };
    })()]);
  } finally {
    clearTimeout(timer);
    ws.close();
  }
}
