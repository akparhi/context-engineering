/** The slim view's browser check. It rebuilds the viewer, builds each plan on a temp copy, and loads the page from `file://` in
 *  headless Chromium at 1280 and 728 wide: slim and full in light and dark, then slim reopened with a draft that approves three
 *  gates and sends one back. It writes the heights, one screenshot per run and the class audit to `--out`, and exits 1 on a failed
 *  assertion: the build did not take, light and dark differ, the switch's count is not the closed folds or not what the Submit
 *  dialog lists as never opened, diagram text is under 12 px, a console error, or a network request.
 *
 *  Usage: bun test/slim-measure.ts --out <dir> [<name>=<plan dir> ...]. The four fixtures always run; each extra plan runs after them. */
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { build } from "../build.ts";
import { findChromium } from "../chromium.ts";
import { planStatus } from "../review.ts";
import { MEASURE, MIN_DIAGRAM_PX } from "../selftest.ts";

const SKILL = resolve(import.meta.dir, "../..");
/** `scratch`: where a plan's temp copy goes. A fixture refers to nothing outside its folder, so it copies to the OS temp dir. */
const FIXTURES = ["plan", "second", "design", "questions"].map((dir) => ({ name: dir === "plan" ? "fixture" : dir, dir: join(SKILL, "fixtures", dir), scratch: tmpdir() }));
/** Proves the page under test is the viewer just built: in the fixture, slim first open folds the rollout of the open Scope card. */
const GUARD = { plan: "fixture", fold: "scope/rollout", open: "false" };
const WIDTHS = [1280, 728];
const SCREEN = 900;
const BACK_NOTE = "slim-measure: sent back to measure the reopened page";

type Mode = "slim" | "full" | "reopened";
type Theme = "light" | "dark";
const RUNS: { mode: Mode; theme: Theme }[] = [
  { mode: "slim", theme: "light" }, { mode: "slim", theme: "dark" },
  { mode: "full", theme: "light" }, { mode: "full", theme: "dark" },
  { mode: "reopened", theme: "light" },
];

/** Fable's estimates at 1280 wide (`debate/fable-slim-view.md`), each within about 15%. Its reopened draft approves Scope, Screens
 *  and Data and sends API back, so that plan seeds the same draft. */
const ESTIMATES: Record<string, { seed: { approve: string[]; back: string }; px: Partial<Record<Mode, number[]>> }> = {
  "INS-3985": {
    seed: { approve: ["scope", "screens", "data"], back: "api" },
    px: { full: [690, 4200, 10400, 3200, 3100, 21600], slim: [690, 3400, 4700, 2050, 1500, 12300], reopened: [690, 1400, 2750, 2050, 1500, 8400] },
  },
};
const OFF_LIMIT = 0.15;

type Heights = { head: number; acts: Record<string, number>; page: number };
type FoldRow = { key: string; open: boolean; shown: boolean };
type PartRow = { part: string; shown: boolean };
type Shot = { heights: Heights; count: number | null; closed: number; folds: FoldRow[]; parts: PartRow[]; small: string[]; view: string | null; unopened: number | null };

/** Reads the page as drawn. A fold is `shown` when every fold around it is open; the switch counts the closed folds that are shown,
 *  except a key every element of which is `data-fold-dependent`, which opens with another fold. */
const READ = () => {
  const visible = (el: Element) => el.checkVisibility({ visibilityProperty: true });
  const chain = (el: Element) => { for (let p = el.parentElement?.closest("[data-fold]"); p; p = p.parentElement?.closest("[data-fold]")) if ((p as HTMLElement).dataset.open !== "true") return false; return true; };
  const byKey = new Map<string, { key: string; open: boolean; shown: boolean; dependent: boolean }>();
  for (const el of document.querySelectorAll<HTMLElement>("[data-fold]")) {
    const key = el.dataset.fold!, dependent = el.dataset.foldDependent !== undefined, had = byKey.get(key);
    if (!had) byKey.set(key, { key, open: el.dataset.open === "true", shown: chain(el), dependent });
    else if (!dependent) had.dependent = false;
  }
  const folds = [...byKey.values()];
  const header = [...document.querySelectorAll("header")].find((h) => !h.closest("article"))!;
  const acts = Object.fromEntries([...document.querySelectorAll<HTMLElement>("section[data-act]")].map((s) => [s.dataset.act!, s.getBoundingClientRect().height]));
  const count = document.querySelector("[data-folded-count]")?.textContent;
  return {
    heights: { head: header.getBoundingClientRect().height, acts, page: document.documentElement.scrollHeight },
    count: count == null ? null : Number(count),
    closed: folds.filter((f) => !f.open && f.shown && !f.dependent).length,
    folds: folds.map(({ key, open, shown }) => ({ key, open, shown })),
    parts: [...document.querySelectorAll<HTMLElement>("[data-part]")].map((el) => ({ part: el.dataset.part!, shown: visible(el) })),
    view: document.querySelector<HTMLElement>('[data-focus="view"]')?.dataset.view ?? null,
  };
};

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
}

/** Approves the first three gates and sends the fourth back, or the estimate's own draft, at the revs the plan has now. */
async function reopenedDraft(planDir: string, name: string) {
  const gates = (await planStatus(planDir)).items.filter((i) => i.bucket === "approve").map((i) => i.id);
  const seed = ESTIMATES[name]?.seed ?? { approve: gates.slice(0, 3), back: gates[3] };
  const verdicts: Record<string, unknown> = Object.fromEntries(seed.approve.map((id) => [id, { verdict: "approve" }]));
  if (seed.back) verdicts[seed.back] = { verdict: "changes", note: BACK_NOTE };
  return { v: 1, review: { verdicts, answers: {}, comments: [], typing: {}, seen: [] } };
}

async function shoot(browser: Browser, url: string, width: number, theme: Theme, mode: Mode, draft: object, png: string) {
  const ctx = await browser.newContext({ viewport: { width, height: SCREEN }, colorScheme: theme, reducedMotion: "reduce" });
  const errors: string[] = [], requests: string[] = [];
  try {
    const page = await ctx.newPage();
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("request", (r) => { if (!/^(file|data|blob):/.test(r.url())) requests.push(r.url()); });
    // A fresh context has empty storage. The theme and the view are set before the page boots, as a returning reader's would be.
    await page.addInitScript(([theme, view]) => {
      localStorage.setItem("sign-off:theme", theme!);
      if (view) localStorage.setItem("sign-off:view", view);
    }, [theme, mode === "full" ? "full" : ""]);
    await page.goto(url);
    await page.waitForSelector("[data-nav]");
    if (mode === "reopened") {
      await page.evaluate((draft) => {
        const data = JSON.parse(document.getElementById("sign-off-data")!.textContent!);
        localStorage.setItem(`sign-off:${data.manifest.id}:${data.revs.planRev}`, JSON.stringify(draft));
      }, draft);
      await page.reload();
      await page.waitForSelector("[data-nav]");
    }
    const texts = await page.evaluate(MEASURE) as { px: number; text: string }[];
    await settle(page);
    const shot = await page.evaluate(READ) as Omit<Shot, "small" | "unopened">;
    await page.screenshot({ path: png, fullPage: true, type: "jpeg", quality: 60 });
    // The Submit dialog's count of folds never opened, read after the shot so the dialog is not in it.
    let unopened: number | null = null;
    if (mode === "slim") {
      await page.click('[data-focus="submit:nav"]');
      unopened = Number(await page.getAttribute('[data-part="unopened"]', "data-count"));
      await page.keyboard.press("Escape");
    }
    const small = texts.filter((t) => t.px < MIN_DIAGRAM_PX - 0.01).map((t) => `${t.px.toFixed(1)} px "${t.text}"`);
    return { shot: { ...shot, small, unopened }, errors, requests };
  } finally {
    await ctx.close();
  }
}

const screens = (px: number) => (px / SCREEN).toFixed(1);
const fmt = (px: number) => Math.round(px).toLocaleString("en-US");

async function main(args: string[]): Promise<number> {
  const outAt = args.indexOf("--out");
  if (outAt < 0 || !args[outAt + 1]) { console.error("usage: bun test/slim-measure.ts --out <dir> [<name>=<plan dir> ...]"); return 2; }
  const out = resolve(args[outAt + 1]!);
  const extra = args.filter((_, i) => i !== outAt && i !== outAt + 1).map((a) => { const [name, dir] = a.split("="); return { name: name!, dir: resolve(dir!), scratch: dirname(resolve(dir!)) }; });
  const plans = [...FIXTURES, ...extra];
  mkdirSync(join(out, "shots"), { recursive: true });

  const viewer = Bun.spawnSync(["bun", "build.ts"], { cwd: join(SKILL, "viewer"), stdout: "pipe", stderr: "pipe" });
  if (viewer.exitCode !== 0) { console.error(`viewer build failed:\n${viewer.stderr}`); return 1; }
  console.log(viewer.stdout.toString().trim());

  let failed = false;
  const say = (ok: boolean, line: string) => { if (!ok) failed = true; console.log(`${ok ? "ok  " : "FAIL"} ${line}`); };
  const scratch: string[] = [];
  const clean = () => { for (const dir of scratch) rmSync(dir, { recursive: true, force: true }); };
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { clean(); process.exit(1); });
  const browser = await chromium.launch({ executablePath: findChromium() });
  const heights: string[] = [`# Slim view heights\n\nOne screen is ${SCREEN} px. Light theme unless named. Measured by \`scripts/test/slim-measure.ts\` on ${new Date().toISOString()}.\n`];
  const audit: string[] = ["# Slim class audit\n\nEvery `data-fold` and `data-part` on the page in slim, first open, light, 1280 wide. A fold is shown when every fold around it is open.\n"];
  try {
    for (const plan of plans) {
      // An extra plan's copy is its sibling, so the refs it makes outside its own folder still resolve, and the plan is not touched.
      const dir = mkdtempSync(join(plan.scratch, ".slim-measure-"));
      scratch.push(dir);
      cpSync(plan.dir, dir, { recursive: true, filter: (src) => !/[/\\](sign-off\.html|reviews[/\\].*\.html)$/.test(src) });
      const url = `file://${await build(dir)}`;
      const draft = await reopenedDraft(dir, plan.name);
      heights.push(`## ${plan.name}\n\n| Width | Run | Head | ${["product", "tech", "verify", "pr"].map((a) => `Act ${a}`).join(" | ")} | Page | Screens | Closed folds |\n|---|---|---|---|---|---|---|---|---|---|`);
      let estimate: string[] = [];
      for (const width of WIDTHS) {
        const got: Partial<Record<`${Mode}-${Theme}`, Shot>> = {};
        for (const { mode, theme } of RUNS) {
          const tag = `${plan.name}-${width}-${mode}-${theme}`;
          const { shot, errors, requests } = await shoot(browser, url, width, theme, mode, draft, join(out, "shots", `${tag}.jpg`));
          got[`${mode}-${theme}`] = shot;
          const h = shot.heights;
          heights.push(`| ${width} | ${mode}${theme === "dark" ? " dark" : ""} | ${fmt(h.head)} | ${["product", "tech", "verify", "pr"].map((a) => (h.acts[a] === undefined ? "–" : fmt(h.acts[a]))).join(" | ")} | ${fmt(h.page)} | ${screens(h.page)} | ${shot.closed} |`);
          say(shot.view === (mode === "full" ? "full" : "slim"), `${tag}: the switch exists and shows ${mode === "full" ? "full" : "slim"} (${shot.view})`);
          if (plan.name === GUARD.plan && mode === "slim") {
            const f = shot.folds.find((x) => x.key === GUARD.fold);
            say(String(f?.open) === GUARD.open, `${tag}: the guard fold ${GUARD.fold} is open=${GUARD.open} (${f ? f.open : "missing"})`);
          }
          if (mode !== "full") say(shot.count === shot.closed, `${tag}: the switch counts ${shot.count} and the page has ${shot.closed} closed folds`);
          if (mode === "slim") say(shot.unopened === shot.count, `${tag}: Submit lists ${shot.unopened} folds never opened, the switch's ${shot.count}`);
          say(shot.small.length === 0, `${tag}: no diagram text under ${MIN_DIAGRAM_PX} px${shot.small.length ? ` (${shot.small.slice(0, 3).join(", ")})` : ""}`);
          say(errors.length === 0, `${tag}: ${errors.length} console errors${errors.length ? ` (${errors[0]})` : ""}`);
          say(requests.length === 0, `${tag}: ${requests.length} network requests${requests.length ? ` (${requests[0]})` : ""}`);
          if (mode === "slim" && theme === "light" && width === WIDTHS[0]) audit.push(auditOf(plan.name, shot));
        }
        for (const mode of ["slim", "full"] as const) {
          const [l, d] = [got[`${mode}-light`]!.heights, got[`${mode}-dark`]!.heights];
          const diff = Math.max(Math.abs(l.page - d.page), Math.abs(l.head - d.head), ...Object.keys(l.acts).map((a) => Math.abs(l.acts[a]! - (d.acts[a] ?? 0))));
          say(diff <= 1, `${plan.name}-${width}-${mode}: light and dark heights match within 1 px (largest difference ${diff.toFixed(1)} px)`);
        }
        if (width === WIDTHS[0] && ESTIMATES[plan.name]) estimate = againstEstimate(ESTIMATES[plan.name]!.px, got);
      }
      heights.push(...estimate, "");
    }
  } finally {
    await browser.close();
    clean();
  }
  writeFileSync(join(out, "heights.md"), `${heights.join("\n")}\n`);
  writeFileSync(join(out, "class-audit.md"), `${audit.join("\n")}\n`);
  console.log(`wrote ${join(out, "heights.md")}, ${join(out, "class-audit.md")} and ${basename(out)}/shots/`);
  return failed ? 1 : 0;
}

/** The measured page against the estimate, per act, with each part more than `OFF_LIMIT` away flagged. */
function againstEstimate(px: Partial<Record<Mode, number[]>>, got: Partial<Record<`${Mode}-${Theme}`, Shot>>): string[] {
  const rows = ["", "Against the estimate at 1280, measured / estimated:", "", "| Run | Head | Act product | Act tech | Act verify | Act pr | Page |", "|---|---|---|---|---|---|---|"];
  for (const [mode, want] of Object.entries(px) as [Mode, number[]][]) {
    const h = got[`${mode}-light`]!.heights;
    const have = [h.head, ...["product", "tech", "verify", "pr"].map((a) => h.acts[a] ?? 0), h.page];
    const cells = have.map((v, i) => {
      const off = (v - want[i]!) / want[i]!;
      return `${fmt(v)} / ${fmt(want[i]!)} (${off >= 0 ? "+" : ""}${Math.round(off * 100)}%${Math.abs(off) > OFF_LIMIT ? ", **over 15%**" : ""})`;
    });
    rows.push(`| ${mode} | ${cells.join(" | ")} |`);
  }
  return [...rows, ""];
}

function auditOf(name: string, shot: Shot): string {
  const folds = shot.folds.map((f) => `| \`${f.key}\` | ${f.open ? "open" : "closed"} | ${f.shown ? "yes" : "no"} |`);
  const byPart = new Map<string, { n: number; shown: number }>();
  for (const p of shot.parts) { const c = byPart.get(p.part) ?? { n: 0, shown: 0 }; c.n++; if (p.shown) c.shown++; byPart.set(p.part, c); }
  const parts = [...byPart].sort(([a], [b]) => a.localeCompare(b)).map(([part, c]) => `| \`${part}\` | ${c.n} | ${c.shown} |`);
  return [`## ${name}\n`, `${shot.folds.length} folds, ${shot.closed} closed and shown (the switch says ${shot.count}).\n`,
    "| Fold | State | Shown |", "|---|---|---|", ...folds, "", "| Part | On the page | Visible |", "|---|---|---|", ...parts, ""].join("\n");
}

process.exit(await main(process.argv.slice(2)));
