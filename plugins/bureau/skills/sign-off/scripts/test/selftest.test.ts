import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { findChromium, NoBrowser } from "../chromium.ts";
import { checkPage, withFullView } from "../selftest.ts";

const ENTRY = join(import.meta.dir, "../sign-off");
const scratch = mkdtempSync(join(tmpdir(), "sign-off-selftest-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

async function selftest(env: Record<string, string> = {}) {
  const proc = Bun.spawn([process.execPath, ENTRY, "check", "--selftest"], { stdout: "pipe", stderr: "pipe", env: { ...process.env, ...env } });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { lines: out.trim().split("\n"), err, code };
}

const chromium = (() => {
  try {
    return findChromium();
  } catch (error) {
    if (error instanceof NoBrowser) return null;
    throw error;
  }
})();

describe("check --selftest", () => {
  test("passes on the fixture with one line per step, in order", async () => {
    const { lines, err, code } = await selftest();
    expect({ err, code }).toEqual({ err: "", code: 0 });
    expect(lines.map((l) => l.match(/^(\w+)\s+(ok|skip|FAIL):/)?.slice(1, 3).join(" "))).toEqual(
      ["build ok", "ingest ok", "status ok", `browser ${chromium ? "ok" : "skip"}`, undefined]);
    expect(lines[2]).toMatch(/^status +ok: ([1-9]\d*) of \1 reviewed items approved or answered, settled$/);
    expect(lines.at(-1)).toBe(chromium ? "selftest passed" : "selftest passed, browser skipped");
  }, 60_000);

  test("with no browser, skips the browser step and still exits 0", async () => {
    const { lines, code } = await selftest({ SIGN_OFF_CHROMIUM: join(scratch, "no-such-chrome") });
    expect(code).toBe(0);
    expect(lines.slice(-2)).toEqual([`browser skip: SIGN_OFF_CHROMIUM=${join(scratch, "no-such-chrome")} does not exist`, "selftest passed, browser skipped"]);
  }, 60_000);
});

describe.skipIf(chromium === null)("checkPage", () => {
  const page = (name: string, body: string) => {
    const file = join(scratch, `${name}.html`);
    writeFileSync(file, `<!doctype html><html><body>${body}</body></html>`);
    return pathToFileURL(file).href;
  };
  const chart = (px: number) => `<div data-part="chart"><svg width="200" height="40"><text y="20" style="font-size:${px}px">state</text></svg></div>`;
  const binary = chromium ?? "";

  test("passes 12 px diagram text and ignores small text outside diagrams", async () => {
    const url = page("ok", `${chart(12)}<p style="font-size:10px">footnote</p>`);
    expect(await checkPage(binary, url)).toStartWith("1 diagram texts, smallest 12.0 px, 0 console errors");
  }, 30_000);

  test("fails on diagram text under 12 px", async () => {
    const url = page("small", chart(11));
    await expect(checkPage(binary, url)).rejects.toThrow('1 diagram texts under 12 px: 11.0 px "state"');
  }, 30_000);

  test("fails on a console error", async () => {
    const url = page("error", `${chart(12)}<script>console.error("boom")</script>`);
    await expect(checkPage(binary, url)).rejects.toThrow("1 console errors: boom");
  }, 30_000);

  test("sees a diagram the slim default folds away, because the page boots with the full view saved", async () => {
    const file = join(scratch, "folded.html");
    const draw = `document.body.insertAdjacentHTML("beforeend", \`${chart(12)}\`)`;
    writeFileSync(file, `<!doctype html><html><head><title>plan</title></head><body><script>if (localStorage.getItem("sign-off:view") === "full") ${draw}</script></body></html>`);
    await expect(checkPage(binary, pathToFileURL(file).href)).rejects.toThrow("no diagram text drew");
    expect(await checkPage(binary, withFullView(file))).toStartWith("1 diagram texts, smallest 12.0 px");
  }, 30_000);

  test("fails when no diagram draws", async () => {
    await expect(checkPage(binary, page("empty", "<p>no diagram</p>"))).rejects.toThrow("no diagram text drew");
  }, 30_000);
});
