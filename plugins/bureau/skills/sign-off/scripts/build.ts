/** `sign-off build <plan-dir>` writes `<plan>/sign-off.html`: the viewer page with one data block that holds the manifest, each
 *  block's resolved input and build-time layout, the source texts, the links, the revs and the review events. It refuses a plan
 *  that `check` fails, a theme that is anything but CSS variable declarations, and a page that would load from the network.
 *  `sign-off render <plan-dir> --part <view>` writes one view of the same data alone, on the part page. */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { linksOf } from "../viewer/links.ts";
import type { Links } from "../viewer/src/plan.ts";
import { check } from "./check.ts";
import { type ChartLayout, layoutChart } from "./layout/chart.ts";
import { type ErdLayout, layoutErd } from "./layout/erd.ts";
import type { Event, Manifest } from "./manifest.ts";
import { section } from "./markdown.ts";
import { guarded, readEvents } from "./review.ts";
import { planReader, readManifest, type Revs, revsOf } from "./revs.ts";
import { type Inputs, type Read, resolve as resolveBlock, type View } from "./views.ts";

export const USAGE = "usage: sign-off build <plan-dir>";
export const RENDER_USAGE = "usage: sign-off render <plan-dir> --part <view> [--out <file>]";
export const DATA_BLOCK = '<script type="application/json" id="sign-off-data"></script>';
const TEMPLATE = join(import.meta.dir, "../viewer/viewer.gen.html");
const PART_TEMPLATE = join(import.meta.dir, "../viewer/part.gen.html");
const PAGE = "sign-off.html";
const CONFIG = ".claude/sign-off.config.json";

type Layouts = { statechart: ChartLayout; erd: ErdLayout };
/** One block, keyed `<item id>:<index in its body>`. Statechart and erd blocks carry their layout; nothing else is laid out. */
export type BlockData = { [V in View]: { view: V; input: Inputs[V] } & (V extends keyof Layouts ? { layout: Layouts[V] } : unknown) }[View];
/** What the page reads from its data block. `sources` maps each `file` or `file#Heading` ref a block shows to the text shown. */
export type PageData = {
  manifest: Manifest; revs: Revs; links: Links; events: Event[];
  blocks: Record<string, BlockData>; sources: Record<string, string>;
};

/** What the part page reads: the page's data with only the blocks of `part`. */
export type PartData = PageData & { part: View };

export class BuildError extends Error {}

/** JSON that no text value can use to close the script tag or break a JS string: `<`, `>`, `&`, U+2028 and U+2029 become `\u` escapes. */
const UNSAFE = new RegExp(`[<>&${String.fromCharCode(0x2028, 0x2029)}]`, "g");
export const inlineJson = (value: unknown) =>
  JSON.stringify(value).replace(UNSAFE, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

const NETWORK = /(?:\b(?:src|href|action|srcset|poster)\s*=\s*["']?|url\(\s*["']?|@import\s+["']?)(?:https?:)?\/\/[^"'\s)>]+/gi;
/** Every URL the page would fetch from another origin. */
export const networkLoads = (html: string) => [...new Set(html.match(NETWORK) ?? [])];

const VIEWPORT_HEIGHT = /\d(?:\.\d+)?[sdl]?vh\b/g;
/** base-ui seeds every anchored popup's --available-height with the first literal. A page may hold a Tooltip, HoverCard or Popover as
 *  long as no rule reads that variable, so the literal is exempt and a read of it is reported. The second is base-ui's scroll lock,
 *  which Popover bundles and only a modal popup runs. Nothing here checks for one: a part page must not open a modal popup. */
const POPUP_SEED = /AVAILABLE_HEIGHT_VAR\]\s*=\s*"100vh"|\[[\w$]+\]="100vh"|`calc\(100dvh - \$\{[^}]+\}px\)`:"100dvh"/g;
/** Every viewport height length in the text, CSS or JS. A frame that grows to fit its page rejects any. */
export const viewportUnits = (html: string) =>
  [...new Set([...(html.replace(POPUP_SEED, "").match(VIEWPORT_HEIGHT) ?? []), ...(html.match(/var\(--available-height\)/g) ?? [])])];

const DECLARATION = /^(--[a-zA-Z0-9-]+)\s*:\s*([a-zA-Z0-9 #%.,()+\-*/]+)$/;
/** The theme as one `:root` rule. Each `;`-separated piece must be `--name: value`, and a value holds only the characters
 *  colors, lengths and `var()` need, so no quote, brace, backslash, `<`, `@` or `url(` reaches the page. */
export function themeCss(text: string, path: string): string {
  const pieces = text.split(";").map((p) => p.trim()).filter(Boolean);
  const out = pieces.map((piece) => {
    const m = piece.match(DECLARATION);
    if (!m || /url\(|\/\*|\*\//i.test(m[2])) throw new BuildError(`${path}: "${piece.slice(0, 60)}" is not a --name: value declaration`);
    return `${m[1]}:${m[2].trim()}`;
  });
  return `<style id="sign-off-theme">:root{${out.join(";")}}</style>`;
}

/** The nearest `.claude/sign-off.config.json` at or above the plan. */
function configPath(planDir: string): string | null {
  for (let dir = resolve(planDir); ; dir = dirname(dir)) {
    if (existsSync(join(dir, CONFIG))) return join(dir, CONFIG);
    if (dirname(dir) === dir) return null;
  }
}

/** The config's theme path, resolved against the config's folder. */
function themePath(planDir: string): string | null {
  const file = configPath(planDir);
  if (file === null) return null;
  const parsed = z.looseObject({ theme: z.string().optional() }).safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) throw new BuildError(`${file}: theme must be a path`);
  return parsed.data.theme === undefined ? null : resolve(dirname(file), parsed.data.theme);
}

function shown(read: Read, ref: string): string {
  const [file = "", heading] = ref.split("#", 2);
  const text = read(file);
  const out = text === null ? null : heading === undefined ? text : section(text, heading);
  if (out === null) throw new BuildError(`${ref} does not exist`);
  return out;
}

export async function pageData(planDir: string): Promise<PageData> {
  const manifest = await readManifest(planDir), read = planReader(planDir);
  const blocks: PageData["blocks"] = {}, sources: PageData["sources"] = {};
  for (const item of manifest.items) {
    for (const [index, block] of (item.body ?? []).entries()) {
      const resolved = resolveBlock(block, item, manifest, read);
      for (const ref of [...resolved.sources, ...(block.view === "erd" ? [block.src] : [])]) sources[ref] ??= shown(read, ref);
      const key = `${item.id}:${index}`;
      if (block.view === "statechart") {
        const input = resolved.input as Inputs["statechart"];
        blocks[key] = { view: "statechart", input, layout: await layoutChart(input, read) };
      } else if (block.view === "erd") {
        const input = resolved.input as Inputs["erd"];
        blocks[key] = { view: "erd", input, layout: await layoutErd(input, read) };
      } else blocks[key] = { view: block.view, input: resolved.input } as BlockData;
    }
  }
  return { manifest, revs: revsOf(manifest, planDir), links: linksOf(manifest), events: await readEvents(planDir), blocks, sources };
}

/** The page with `data` in its one empty data block and the theme, if any, after its own styles. */
export function embed(page: string, data: PageData | PartData, theme: string | null): string {
  if (page.split(DATA_BLOCK).length !== 2) throw new BuildError("the page template must hold exactly one empty sign-off-data block");
  let shell = page;
  if (theme !== null) {
    const [head, body, ...extra] = page.split("</head>");
    if (body === undefined || extra.length) throw new BuildError("the page template must hold exactly one </head>");
    shell = `${head}${theme}</head>${body}`;
  }
  // The data is inert JSON, so only the shell around it is checked; a plan may quote a URL.
  const loads = networkLoads(shell);
  if (loads.length) throw new BuildError(`the page would load from the network: ${loads.slice(0, 5).join(", ")}`);
  return shell.replace(DATA_BLOCK, () => `<script type="application/json" id="sign-off-data">${inlineJson(data)}</script>`);
}

/** The theme's `<style>`, or null. Throws `BuildError` when `check` fails or the theme is bad. */
async function checkedTheme(planDir: string): Promise<string | null> {
  const report = await check(planDir);
  if (report.errors.length) throw new BuildError(`check failed:\n${report.errors.map((e) => `  ${e.rule}: ${e.message}`).join("\n")}`);
  const theme = themePath(planDir);
  return theme === null ? null : themeCss(readFileSync(theme, "utf8"), theme);
}

/** Writes `<plan>/sign-off.html` and returns its path. Throws `BuildError` on a check error, a bad theme or a network load. */
export async function build(planDir: string): Promise<string> {
  const css = await checkedTheme(planDir);
  const page = embed(readFileSync(TEMPLATE, "utf8"), await pageData(planDir), css);
  const out = join(planDir, PAGE);
  writeFileSync(out, page);
  return out;
}

/** Every file the page is built from: the viewer template, the config and its theme, the manifest, the review log, each item's
 *  cited source, and each file a block's view reads or shows. A file that does not exist is left out. */
export async function inputsOf(planDir: string): Promise<string[]> {
  const files = new Set([TEMPLATE, join(planDir, "sign-off.json"), join(planDir, "reviews", "events.jsonl")]);
  const base = planReader(planDir);
  const read: Read = (path) => { files.add(resolve(planDir, path)); return base(path); };
  const fileOf = (ref: string) => ref.split("#", 1)[0] ?? ref;
  const manifest = await readManifest(planDir);
  for (const item of manifest.items) {
    if (item.source) read(fileOf(item.source));
    for (const block of item.body ?? []) {
      const { sources } = resolveBlock(block, item, manifest, read);
      for (const ref of [...sources, ...(block.view === "erd" ? [block.src] : [])]) read(fileOf(ref));
    }
  }
  const config = configPath(planDir), theme = themePath(planDir);
  for (const extra of [config, theme]) if (extra !== null) files.add(extra);
  return [...files].filter((f) => existsSync(f));
}

/** True when `<plan>/sign-off.html` is missing or older than any of its inputs. */
export async function isStale(planDir: string): Promise<boolean> {
  const page = join(planDir, PAGE);
  if (!existsSync(page)) return true;
  const built = statSync(page).mtimeMs;
  return (await inputsOf(planDir)).some((f) => statSync(f).mtimeMs > built);
}

/** Rebuilds the page with the log as it stands and copies it to `out`, `reviews/<planRev>.html`: the record of what the reader saw
 *  and decided at that rev. */
export async function snapshot(planDir: string, out: string): Promise<void> {
  const html = readFileSync(await build(planDir), "utf8");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
}

export function runBuild([planDir, ...rest]: string[]): Promise<number> {
  return guarded(async () => {
    if (!planDir || rest.length) {
      console.error(USAGE);
      return 2;
    }
    const out = await build(planDir);
    console.log(`wrote ${out} (${(Bun.file(out).size / 1024).toFixed(1)} KB)`);
    return 0;
  });
}

/** The views this plan has a block for, in manifest order. */
const partsOf = (manifest: Manifest): View[] => [...new Set(manifest.items.flatMap((it) => (it.body ?? []).map((b) => b.view)))];

/** Writes every `view` block of the plan alone on the part page, to `out` or `<plan>/parts/<view>.html`, and returns its path.
 *  Throws `BuildError` for a view the plan has no block for, and as `build` does. */
export async function renderPart(planDir: string, view: string, out?: string): Promise<string> {
  const css = await checkedTheme(planDir);
  const data = await pageData(planDir);
  const parts = partsOf(data.manifest);
  const part = parts.find((p) => p === view);
  if (!part) throw new BuildError(`this plan has no ${view} block; its parts are: ${parts.join(", ")}`);
  const blocks = Object.fromEntries(Object.entries(data.blocks).filter(([, b]) => b.view === part));
  const partData: PartData = { ...data, blocks, part };
  const page = embed(readFileSync(PART_TEMPLATE, "utf8"), partData, css);
  const file = out ?? join(planDir, "parts", `${part}.html`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, page);
  return file;
}

export function runRender(args: string[]): Promise<number> {
  return guarded(async () => {
    let parsed;
    try {
      parsed = parseArgs({ args, allowPositionals: true, options: { part: { type: "string" }, out: { type: "string" } } });
    } catch {
      parsed = null;
    }
    const [planDir, ...rest] = parsed?.positionals ?? [];
    const view = parsed?.values.part;
    if (!planDir || rest.length || !view) {
      console.error(RENDER_USAGE);
      return 2;
    }
    console.log(await renderPart(planDir, view, parsed?.values.out));
    return 0;
  });
}
