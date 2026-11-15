/** `sign-off check --selftest` proves that this copy of the skill works. On a temp copy of `fixtures/plan` it builds the page, sends
 *  a generated review through `ingest`, asks `status` about the items the review covered, and loads the page in headless Chromium,
 *  where no diagram text may be under 12 px and the console must log no error. It prints one line per step and stops at the first
 *  failure. The browser step is skipped, not failed, when no Chromium can be found or started. */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { build } from "./build.ts";
import { USAGE } from "./check.ts";
import { findChromium, inChromium, NoBrowser } from "./chromium.ts";
import { encodeReview } from "./codec.ts";
import { ingestText, planStatus, type Review } from "./review.ts";

const FIXTURE = join(import.meta.dir, "../fixtures/plan");
export const MIN_DIAGRAM_PX = 12;

/** Every text node drawn inside a statechart or erd diagram, with its rendered size: the computed font size, times the SVG's scale. */
export const MEASURE = `(async () => {
  const DIAGRAMS = '[data-part="chart"], [data-part="diagram"]';
  for (const end = Date.now() + 5000; Date.now() < end && !document.querySelector(DIAGRAMS); ) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const texts = [];
  for (const diagram of document.querySelectorAll(DIAGRAMS)) {
    const walker = document.createTreeWalker(diagram, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement, text = n.textContent.trim();
      if (!el || !text || !el.checkVisibility({ visibilityProperty: true })) continue;
      const scale = el instanceof SVGGraphicsElement ? el.getScreenCTM()?.a ?? 1 : 1;
      texts.push({ px: parseFloat(getComputedStyle(el).fontSize) * scale, text: text.slice(0, 30) });
    }
  }
  return texts;
})()`;
const DiagramTexts = z.array(z.strictObject({ px: z.number(), text: z.string() }));

/** Loads `url` in `binary` and returns a one-line summary. Throws when the console logs an error, no diagram draws, or diagram
 *  text renders under `MIN_DIAGRAM_PX`, and throws `NoBrowser` when the browser will not start. */
export async function checkPage(binary: string, url: string): Promise<string> {
  const run = await inChromium(binary, url, MEASURE, DiagramTexts);
  if (run.errors.length) throw new Error(`${run.errors.length} console errors: ${run.errors.slice(0, 3).join(" | ")}`);
  if (!run.value.length) throw new Error("no diagram text drew");
  const small = run.value.filter((t) => t.px < MIN_DIAGRAM_PX - 0.01);
  if (small.length) throw new Error(`${small.length} diagram texts under ${MIN_DIAGRAM_PX} px: ${small.slice(0, 3).map((t) => `${t.px.toFixed(1)} px "${t.text}"`).join(", ")}`);
  const smallest = Math.min(...run.value.map((t) => t.px));
  return `${run.value.length} diagram texts, smallest ${smallest.toFixed(1)} px, 0 console errors (${binary})`;
}

/** Writes a copy of the page beside it that saves the full view in localStorage before the page boots, so a slim default cannot fold a
 *  diagram away from `MEASURE`. Returns the copy's file URL. */
export function withFullView(page: string): string {
  const copy = page.replace(/\.html$/, ".full.html");
  const save = `<script>try { localStorage.setItem("sign-off:view", "full") } catch {}</script>`;
  writeFileSync(copy, readFileSync(page, "utf8").replace(/<head[^>]*>/i, (head) => `${head}${save}`));
  return pathToFileURL(copy).href;
}

class Skipped extends Error {}
type Step = { name: string; run: () => Promise<string> };

/** Approves every item that takes a verdict and answers every question, at the revs the plan has now. */
async function reviewOf(planDir: string): Promise<Review> {
  const status = await planStatus(planDir);
  const items = status.items.flatMap((i): Review["items"] => i.bucket === "approve" ? [{ id: i.id, itemRev: i.itemRev, verdict: "approve" }]
    : i.bucket === "answer" ? [{ id: i.id, itemRev: i.itemRev, answer: "selftest answer" }] : []);
  return { v: 1, plan: status.plan, planRev: status.planRev, by: "selftest", at: new Date().toISOString(), items };
}

function steps(planDir: string): Step[] {
  let page = "", covered: string[] = [];
  return [
    { name: "build", run: async () => {
      page = await build(planDir);
      return `${basename(page)}, ${(Bun.file(page).size / 1024).toFixed(0)} KB`;
    } },
    { name: "ingest", run: async () => {
      const review = await reviewOf(planDir);
      covered = review.items.map((i) => i.id);
      const [result] = await ingestText(planDir, encodeReview(review), "paste");
      if (!result?.appended) throw new Error("the review appended no events");
      if (result.stale.length || result.unknown.length) throw new Error(`stale ${result.stale.join(", ") || "none"}, unknown ${result.unknown.join(", ") || "none"}`);
      return `${covered.length} items reviewed, ${result.appended} events appended`;
    } },
    { name: "status", run: async () => {
      const status = await planStatus(planDir);
      const undecided = covered.filter((id) => !["approved", "answered"].includes(status.items.find((i) => i.id === id)?.state ?? ""));
      if (undecided.length) throw new Error(`not reported as approved or answered: ${undecided.join(", ")}`);
      if (!status.reviews.some((r) => r.by === "selftest")) throw new Error("no last review from selftest");
      return `${covered.length} of ${covered.length} reviewed items approved or answered, ${status.settled ? "settled" : "not settled"}`;
    } },
    { name: "browser", run: async () => {
      try {
        return await checkPage(findChromium(), withFullView(page));
      } catch (error) {
        throw error instanceof NoBrowser ? new Skipped(error.message) : error;
      }
    } },
  ];
}

export async function runSelftest(args: string[]): Promise<number> {
  if (args.length) {
    console.error(USAGE);
    return 2;
  }
  const scratch = mkdtempSync(join(tmpdir(), "sign-off-selftest-"));
  const planDir = join(scratch, "plan");
  const skipped: string[] = [];
  try {
    cpSync(FIXTURE, planDir, { recursive: true, filter: (src) => !/[/\\](reviews|sign-off\.html)$/.test(src) });
    for (const step of steps(planDir)) {
      try {
        console.log(`${step.name.padEnd(8)}ok: ${await step.run()}`);
      } catch (error) {
        if (error instanceof Skipped) {
          console.log(`${step.name.padEnd(8)}skip: ${error.message}`);
          skipped.push(step.name);
          continue;
        }
        console.log(`${step.name.padEnd(8)}FAIL: ${error instanceof Error ? error.message : String(error)}`);
        return 1;
      }
    }
    console.log(`selftest passed${skipped.length ? `, ${skipped.join(" and ")} skipped` : ""}`);
    return 0;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
