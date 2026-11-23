/** `sign-off check --selftest` proves that this copy of the skill works. On a temp copy of `fixtures/plan` it builds the page, sends
 *  a generated review through `ingest`, asks `status` about the items the review covered, and walks every sub-step of the page in
 *  headless Chromium, where every statechart, schema and pull-request diagram must draw, no diagram text may be under 12 px and the
 *  console must log no error. It then renders the fixture's statechart alone with `render --part` and checks that page the same way,
 *  and on a second copy settles the whole plan from the Decide stop alone and ingests the review that page writes.
 *  It prints one line per step and stops at the first failure. The browser, part and decide steps are skipped, not failed, when no Chromium
 *  can be found or started. */
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { build, renderPart } from "./build.ts";
import { USAGE } from "./check.ts";
import { findChromium, inChromium, NoBrowser } from "./chromium.ts";
import { encodeReview } from "./codec.ts";
import { ingestText, planStatus, type Review } from "./review.ts";

const FIXTURE = join(import.meta.dir, "../fixtures/plan");
export const MIN_DIAGRAM_PX = 12;

/** Walks the page by its Next button, from the first sub-step to the last. On each it measures every statechart, schema and
 *  pull-request diagram the sub-step shows (its box and how many of its nodes have a size) and every text node inside the first two, at its rendered
 *  size: the computed font size, times the SVG's scale. `expected` is each block in the page data that draws one of those diagrams. */
export const MEASURE = `(async () => {
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const sized = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  // A split card's stop hides, through its own style, the parts it does not show. Any other hidden diagram is a fault and is measured.
  const partHides = (el) => {
    if (el.checkVisibility()) return false;
    const styles = [...document.querySelectorAll("section[data-step] style")];
    for (const s of styles) s.media = "not all";
    const shown = el.checkVisibility();
    for (const s of styles) s.removeAttribute("media");
    return shown;
  };
  const KINDS = [
    { view: "statechart", find: () => document.querySelectorAll('[data-part="chart"]'), nodes: (el) => el.querySelectorAll("svg text") },
    { view: "erd", find: () => document.querySelectorAll('[data-part="diagram"]'), nodes: (el) => el.querySelectorAll(":scope > div > div") },
    { view: "prs", find: () => [...document.querySelectorAll('[data-col="1"]')].map((c) => c.parentElement.parentElement), nodes: (el) => el.querySelectorAll("[data-pr]") },
  ];
  const data = document.getElementById("sign-off-data");
  const { manifest, blocks } = data ? JSON.parse(data.textContent) : { manifest: { items: [] }, blocks: {} };
  const expected = manifest.items.flatMap((it) => (it.body ?? []).filter((b, i) => (it.id + ":" + i) in blocks && KINDS.some((k) => k.view === b.view)).map((b) => ({ item: it.id, view: b.view })));
  const stops = [];
  for (let n = 0; n < 200; n++) {
    await frames();
    await new Promise((r) => setTimeout(r, 100));
    const texts = [], diagrams = [];
    for (const kind of KINDS) for (const el of kind.find()) {
      if (partHides(el)) continue;
      const box = el.getBoundingClientRect();
      diagrams.push({ view: kind.view, item: el.closest("[data-item]")?.getAttribute("data-item") ?? "", width: box.width, height: box.height,
        nodes: [...kind.nodes(el)].filter(sized).length });
      if (kind.view === "prs") continue;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const parent = t.parentElement, text = t.textContent.trim();
        if (!parent || !text || !parent.checkVisibility({ visibilityProperty: true })) continue;
        const scale = parent instanceof SVGGraphicsElement ? parent.getScreenCTM()?.a ?? 1 : 1;
        texts.push({ px: parseFloat(getComputedStyle(parent).fontSize) * scale, text: text.slice(0, 30) });
      }
    }
    stops.push({ at: location.hash, texts, diagrams });
    const next = document.querySelector('[data-focus="foot:next"]');
    if (!next) break;
    const from = location.hash;
    next.click();
    for (const end = Date.now() + 2000; Date.now() < end && location.hash === from; ) await new Promise((r) => setTimeout(r, 20));
  }
  return { stops, expected };
})()`;
const Walk = z.strictObject({
  stops: z.array(z.strictObject({
    at: z.string(),
    texts: z.array(z.strictObject({ px: z.number(), text: z.string() })),
    diagrams: z.array(z.strictObject({ view: z.string(), item: z.string(), width: z.number(), height: z.number(), nodes: z.number() })),
  })),
  expected: z.array(z.strictObject({ item: z.string(), view: z.string() })),
});

/** Walks `url` in `binary` and returns a one-line summary. Throws when the console logs an error, a diagram draws empty (no sized
 *  node, or a box of 0), a card's diagram never draws, no diagram text draws, or diagram text renders under `MIN_DIAGRAM_PX`. Throws
 *  `NoBrowser` when the browser will not start. */
export async function checkPage(binary: string, url: string): Promise<string> {
  const { errors, value } = await inChromium(binary, url, MEASURE, Walk);
  if (errors.length) throw new Error(`${errors.length} console errors: ${errors.slice(0, 3).join(" | ")}`);
  const where = (at: string) => at || "the first sub-step";
  const diagrams = value.stops.flatMap((s) => s.diagrams.map((d) => ({ ...d, at: s.at })));
  const empty = diagrams.filter((d) => !d.nodes || !d.width || !d.height);
  if (empty.length) throw new Error(`${empty.length} diagrams drew empty: ${empty.slice(0, 3).map((d) => `${d.view} ${d.item || "?"} on ${where(d.at)} (${Math.round(d.width)}x${Math.round(d.height)}, ${d.nodes} nodes)`).join(", ")}`);
  const missing = value.expected.filter((e) => !diagrams.some((d) => d.item === e.item && d.view === e.view));
  if (missing.length) throw new Error(`${missing.length} diagrams never drew: ${missing.map((m) => `${m.view} ${m.item}`).join(", ")}`);
  const texts = value.stops.flatMap((s) => s.texts);
  if (!texts.length) throw new Error("no diagram text drew");
  const small = texts.filter((t) => t.px < MIN_DIAGRAM_PX - 0.01);
  if (small.length) throw new Error(`${small.length} diagram texts under ${MIN_DIAGRAM_PX} px: ${small.slice(0, 3).map((t) => `${t.px.toFixed(1)} px "${t.text}"`).join(", ")}`);
  const smallest = Math.min(...texts.map((t) => t.px));
  return `${texts.length} diagram texts, smallest ${smallest.toFixed(1)} px, 0 console errors, ${count(diagrams.length, "diagram")} drawn across ${count(value.stops.length, "sub-step")} (${binary})`;
}

/** Settles the whole plan from the Decide stop alone: answers each question tab (its recommended option, else the first, else a
 *  typed answer), presses "Approve all remaining", approves what that leaves open (the grant), then submits under a name and returns
 *  the review text the dialog shows on a file:// page. */
export const DECIDE = `(async () => {
  const until = async (find, what) => {
    for (const end = Date.now() + 3000; Date.now() < end; await new Promise((r) => setTimeout(r, 20))) { const found = find(); if (found) return found; }
    throw new Error("Decide: no " + what);
  };
  const type = (el, text) => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  location.hash = "#decide";
  const tabs = await until(() => document.querySelector('[data-decide="questions"]'), "question tabs");
  const count = tabs.querySelectorAll('[role="tab"]').length;
  for (let k = 0; k < count; k++) {
    tabs.querySelectorAll('[role="tab"]')[k].click();
    await new Promise((r) => setTimeout(r, 20));
    const q = await until(() => [...tabs.querySelectorAll("[data-question]")].find((el) => el.checkVisibility()), "question on tab " + (k + 1));
    if (q.dataset.state === "open") {
      const options = [...q.querySelectorAll('[role="group"] button')];
      const input = q.querySelector('form input[type="text"]');
      if (options.length) (options.find((b) => b.querySelector("span")) ?? options[0]).click();
      else if (input) { type(input, "selftest answer"); await new Promise((r) => setTimeout(r, 20)); input.form.requestSubmit(); }
      await until(() => q.isConnected ? q.dataset.state !== "open" : true, "answer taken for " + q.dataset.question);
    }
  }
  const all = await until(() => document.querySelector('[data-focus="approve-all"]'), "Approve all remaining");
  all.click();
  await new Promise((r) => setTimeout(r, 50));
  for (const line of document.querySelectorAll("[data-verdict]")) {
    if (line.querySelector('[data-focus^="ask-changes:"]')) line.querySelector('[data-focus^="verdict:"]').click();
  }
  const submit = await until(() => { const b = document.querySelector('[data-focus="submit:foot"]'); return b && !b.disabled && b; }, "enabled Submit");
  submit.click();
  const confirm = await until(() => [...document.querySelectorAll("dialog button")].find((b) => b.textContent === "Submit review"), "confirm Submit");
  confirm.click();
  const text = await until(() => document.getElementById("review-text")?.textContent, "review text");
  return { text };
})()`;
const Decided = z.strictObject({ text: z.string() });

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

class Skipped extends Error {}
type Step = { name: string; run: () => Promise<string> };

/** Approves every item that takes a verdict and answers every question, at the revs the plan has now. */
async function reviewOf(planDir: string): Promise<Review> {
  const status = await planStatus(planDir);
  const items = status.items.flatMap((i): Review["items"] => i.bucket === "approve" ? [{ id: i.id, itemRev: i.itemRev, verdict: "approve" }]
    : i.bucket === "answer" ? [{ id: i.id, itemRev: i.itemRev, answer: "selftest answer" }] : []);
  return { v: 1, plan: status.plan, planRev: status.planRev, by: "selftest", at: new Date().toISOString(), items };
}

async function inBrowser(file: string): Promise<string> {
  try {
    return await checkPage(findChromium(), pathToFileURL(file).href);
  } catch (error) {
    throw error instanceof NoBrowser ? new Skipped(error.message) : error;
  }
}

/** Builds a fresh copy of the fixture at `planDir`, settles it from the Decide stop alone, and ingests the review the page wrote. */
async function decideAlone(planDir: string): Promise<string> {
  cpSync(FIXTURE, planDir, { recursive: true, filter: (src) => !/[/\\](reviews|sign-off\.html)$/.test(src) });
  const page = await build(planDir);
  let run;
  try {
    run = await inChromium(findChromium(), pathToFileURL(page).href, DECIDE, Decided);
  } catch (error) {
    throw error instanceof NoBrowser ? new Skipped(error.message) : error;
  }
  if (run.errors.length) throw new Error(`${run.errors.length} console errors: ${run.errors.slice(0, 3).join(" | ")}`);
  const [result] = await ingestText(planDir, run.value.text, "paste");
  if (!result?.appended) throw new Error("the review from Decide appended no events");
  if (result.stale.length || result.unknown.length) throw new Error(`stale ${result.stale.join(", ") || "none"}, unknown ${result.unknown.join(", ") || "none"}`);
  const status = await planStatus(planDir);
  if (!status.settled) throw new Error(`not settled after Decide: ${status.items.filter((i) => !["approved", "answered"].includes(i.state)).map((i) => `${i.id} ${i.state}`).join(", ")}`);
  return `plan settled from Decide alone, ${result.appended} events appended`;
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
    { name: "browser", run: () => inBrowser(page) },
    { name: "part", run: async () => inBrowser(await renderPart(planDir, "statechart")) },
    { name: "decide", run: () => decideAlone(join(dirname(planDir), "decide")) },
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
    console.log(`selftest passed${skipped.length ? `, ${new Intl.ListFormat("en").format(skipped)} skipped` : ""}`);
    return 0;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
