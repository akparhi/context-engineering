import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { build, renderPart } from "../build.ts";
import { findChromium, inChromium, NoBrowser } from "../chromium.ts";

const FIXTURE = join(import.meta.dir, "../../fixtures/plan");
const scratch = mkdtempSync(join(tmpdir(), "sign-off-page-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const chromium = (() => {
  try {
    return findChromium();
  } catch (error) {
    if (error instanceof NoBrowser) return null;
    throw error;
  }
})();

/** Moves to the Decide step, clicks "Approve all remaining", then reads the draft the page saved. */
const APPROVE_EVERY_ACT = `(async () => {
  const tick = () => new Promise((ok) => setTimeout(ok, 100));
  location.hash = "#decide";
  await tick();
  const buttons = [...document.querySelectorAll('[data-focus="approve-all"]')];
  for (const b of buttons) { b.click(); await tick(); }
  await tick();
  const key = Object.keys(localStorage).find((k) => k.startsWith("sign-off:LIB-7:"));
  return { clicked: buttons.length, approved: Object.keys(JSON.parse(localStorage.getItem(key) ?? "{}").review?.verdicts ?? {}) };
})()`;

/** Walks every stop with the footer's Next and returns each stop whose page is wider than the window. */
const SIDEWAYS = `(async () => {
  const tick = () => new Promise((ok) => setTimeout(ok, 60));
  const wide = [];
  let stops = 0;
  for (; stops < 80; stops++) {
    await tick();
    const page = document.scrollingElement;
    if (page.scrollWidth > page.clientWidth) wide.push(location.hash + " " + page.scrollWidth + ">" + page.clientWidth);
    const next = document.querySelector('[data-focus="foot:next"]');
    if (!next || next.disabled) break;
    next.click();
  }
  return { wide, stops, width: innerWidth, at: location.hash };
})()`;

/** Opens the PR plan, measures what it shows, then presses the first pull request in the diagram. */
const PR_PLAN = `(async () => {
  const tick = () => new Promise((ok) => setTimeout(ok, 100));
  location.hash = "#pr/prs";
  await tick();
  const placed = document.querySelector('[data-placed="prs"]');
  const shown = (el) => el.checkVisibility();
  const svg = placed.querySelector("svg");
  const box = svg ? svg.getBoundingClientRect() : { width: 0, height: 0 };
  const nodes = [...placed.querySelectorAll("[data-pr]")].filter(shown);
  const facts = placed.firstElementChild;
  const cardsOnPage = [...document.querySelectorAll("li[data-ref]")].filter((li) => /^P\\d/.test(li.dataset.ref) && shown(li)).length;
  nodes[0].click();
  await tick(); await tick();
  const drawer = document.querySelector("[data-linked]");
  const card = drawer?.querySelector(\`li[data-ref="\${nodes[0].dataset.pr}"]\`);
  return { width: box.width, height: box.height, nodes: nodes.length, facts: shown(facts), cardsOnPage,
    drawer: drawer?.dataset.linked ?? null, pr: nodes[0].dataset.pr, card: !!card && shown(card) };
})()`;

/** On the API sub-step: follows the link to the last endpoint in R5's drawer, picks the second tab by hand and approves the card,
 *  then follows that link again. R5 sits in the card's head, so its drawer is the one link to an endpoint whichever tab shows. */
const ENDPOINT_AGAIN = `(async () => {
  const tick = () => new Promise((ok) => setTimeout(ok, 100));
  const shownButton = (root, text) => [...root.querySelectorAll("button")].find((b) => b.textContent === text && b.checkVisibility());
  const selected = () => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent ?? null;
  const tabs = () => [...document.querySelectorAll('[role="tab"]')];
  const followLast = async () => {
    shownButton(document.querySelector('[data-item="api"]'), "R5").click();
    await tick();
    shownButton(document.querySelector("[data-linked]"), tabs().at(-1).textContent).click();
    await tick(); await tick();
  };
  location.hash = "#tech/api";
  await tick();
  await followLast();
  const first = selected();
  tabs()[1].click();
  await tick();
  shownButton(document, "Approve").click();
  await tick();
  const picked = selected();
  await followLast();
  const id = JSON.parse(document.getElementById("sign-off-data").textContent).manifest.facts.endpoints.at(-1).id;
  return { first, picked, again: selected(), last: tabs().at(-1).textContent,
    shown: [...document.querySelectorAll(\`[data-ref="\${id}"]\`)].some((el) => el.checkVisibility()) };
})()`;

/** On the Screens stop: the first state's mockup and design link, whether the mockup takes focus, and what pressing it opens. */
const MOCKUP = `(async () => {
  const tick = () => new Promise((ok) => setTimeout(ok, 100));
  location.hash = "#product/screens";
  await tick(); await tick();
  const img = document.querySelector('img[alt="The Every copy is out mockup"]');
  const link = [...document.querySelectorAll("a")].find((a) => a.textContent.startsWith("Figma frame"));
  let opened = null;
  window.open = (url) => { opened = url; return null; };
  const button = img?.closest("button");
  button?.focus();
  const focused = document.activeElement === button;
  button?.click();
  const blob = opened ? await (await fetch(opened)).blob() : null;
  return { width: img?.naturalWidth ?? 0, data: !!img?.src.startsWith("data:image/png;base64,"), href: link?.href ?? null,
    target: link?.target ?? null, focused, opened: blob ? blob.type + " " + blob.size : null };
})()`;

/** The root container's box and the height of what it holds. */
const ROOT_BOX = `(() => { const root = document.getElementById("root"); return { height: root.getBoundingClientRect().height, content: root.scrollHeight, shown: root.clientHeight }; })()`;
const RootBox = z.object({ height: z.number(), content: z.number(), shown: z.number() });

describe.skipIf(chromium === null)("the built page", () => {
  test("Decide's approve-all leaves the grant open, which takes its own click", async () => {
    const dir = join(scratch, "plan");
    cpSync(FIXTURE, dir, { recursive: true });
    const { errors, value } = await inChromium(chromium ?? "", pathToFileURL(await build(dir)).href, APPROVE_EVERY_ACT,
      z.object({ clicked: z.number(), approved: z.array(z.string()) }));
    expect(errors).toEqual([]);
    expect(value.clicked).toBeGreaterThan(0);
    expect(value.approved).toContain("scope");
    expect(value.approved).not.toContain("grant");
  }, 60_000);

  test("the PR plan shows the facts and the diagram, hides every card, and opens a card in the drawer", async () => {
    const dir = join(scratch, "pr-plan");
    cpSync(FIXTURE, dir, { recursive: true });
    const { errors, value } = await inChromium(chromium ?? "", pathToFileURL(await build(dir)).href, PR_PLAN, z.object({
      width: z.number(), height: z.number(), nodes: z.number(), facts: z.boolean(), cardsOnPage: z.number(),
      drawer: z.string().nullable(), pr: z.string(), card: z.boolean() }));
    expect(errors).toEqual([]);
    expect(value.width).toBeGreaterThan(0);
    expect(value.height).toBeGreaterThan(0);
    expect(value.nodes).toBeGreaterThan(0);
    expect(value.facts).toBe(true);
    expect(value.cardsOnPage).toBe(0);
    expect(value.drawer).toBe(value.pr);
    expect(value.card).toBe(true);
  }, 60_000);

  test("a link to an endpoint selects its tab, also after another tab was picked by hand", async () => {
    const dir = join(scratch, "endpoint-again");
    cpSync(FIXTURE, dir, { recursive: true });
    const { errors, value } = await inChromium(chromium ?? "", pathToFileURL(await build(dir)).href, ENDPOINT_AGAIN, z.object({
      first: z.string().nullable(), picked: z.string().nullable(), again: z.string().nullable(), last: z.string(), shown: z.boolean() }));
    expect(errors).toEqual([]);
    expect(value.first).toBe(value.last);
    expect(value.picked).not.toBe(value.last);
    expect(value.again).toBe(value.last);
    expect(value.shown).toBe(true);
  }, 60_000);

  test("a screen state shows its inlined mockup and design link, and the mockup is a focusable button that opens it full size", async () => {
    const dir = join(scratch, "mockup");
    cpSync(FIXTURE, dir, { recursive: true });
    const { errors, value } = await inChromium(chromium ?? "", pathToFileURL(await build(dir)).href, MOCKUP, z.object({
      width: z.number(), data: z.boolean(), href: z.string().nullable(), target: z.string().nullable(), focused: z.boolean(), opened: z.string().nullable() }));
    expect(errors).toEqual([]);
    expect(value).toEqual({ width: 320, data: true, href: "https://design.example.com/file/holds-on-books-that-are-out?node=book-out", target: "_blank",
      focused: true, opened: `image/png ${readFileSync(join(FIXTURE, "design/book-out.png")).length}` });
  }, 60_000);

  test("no stop scrolls the page sideways in a 1024 by 768 window", async () => {
    const dir = join(scratch, "narrow");
    cpSync(FIXTURE, dir, { recursive: true });
    const { errors, value } = await inChromium(chromium ?? "", pathToFileURL(await build(dir)).href, SIDEWAYS,
      z.object({ wide: z.array(z.string()), stops: z.number(), width: z.number(), at: z.string() }), "1024,768");
    expect(errors).toEqual([]);
    expect(value.width).toBeLessThanOrEqual(1024);
    expect(value.at).toBe("#decide");
    expect(value.wide).toEqual([]);
  }, 60_000);

  test("caps the part at 800px when the host injects a theme style", async () => {
    const dir = join(scratch, "part");
    cpSync(FIXTURE, dir, { recursive: true });
    const part = await renderPart(dir, "statechart");
    const themed = join(dir, "themed.html");
    writeFileSync(themed, readFileSync(part, "utf8").replace("<head>", '<head><style id="t3-theme"></style>'));
    const alone = await inChromium(chromium ?? "", pathToFileURL(part).href, ROOT_BOX, RootBox);
    const hosted = await inChromium(chromium ?? "", pathToFileURL(themed).href, ROOT_BOX, RootBox);
    expect([...alone.errors, ...hosted.errors]).toEqual([]);
    expect(alone.value.height).toBeGreaterThan(800);
    expect(Math.abs(alone.value.height - alone.value.content)).toBeLessThanOrEqual(1);
    expect(Math.abs(hosted.value.height - 800)).toBeLessThanOrEqual(1);
    expect(hosted.value.content).toBeGreaterThan(hosted.value.shown);
  }, 60_000);
});
