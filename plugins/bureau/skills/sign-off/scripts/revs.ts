/** Revisions of what the reviewer was shown. An `itemRev` hashes each block's resolved input from `views.ts` and the words of the
 *  files it draws from, and never changes for layout: reflowed lines, blank lines, comments in a source file, key order in JSON,
 *  the order of a chart's states and arrows.
 *  `planRev` hashes the item revs. */
import { existsSync, readFileSync } from "node:fs";
import { extname, resolve as resolvePath } from "node:path";
import { Manifest } from "./manifest.ts";
import { section } from "./markdown.ts";
import { type Inputs, type Read, resolve, type View } from "./views.ts";

export type Revs = { planRev: string; items: Record<string, string> };

export const hash = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex").slice(0, 12);

/** JSON with object keys sorted and undefined fields dropped, so a reordered field changes no hash. */
export const canon = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
  if (value && typeof value === "object") {
    const fields = Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${fields.map(([k, v]) => `${JSON.stringify(k)}:${canon(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

// yagni: a comment marker inside a string literal is stripped too; a real SQL or DBML parser if that ever reopens an item wrongly.
const COMMENTS: Record<string, RegExp[]> = {
  ".sql": [/--[^\n]*/g, /\/\*[\s\S]*?\*\//g],
  ".dbml": [/\/\/[^\n]*/g, /\/\*[\s\S]*?\*\//g],
  ".mmd": [/^\s*%%[^\n]*/gm],
  ".md": [/<!--[\s\S]*?-->/g],
};
/** The words of a source in order. JSON is compared as data. The formats in `COMMENTS` lose their comments and their whitespace
 *  layout. Any other text is hashed as written, because in YAML the indent is meaning. */
function words(text: string, ext: string): string {
  if (ext === ".json") return canon(JSON.parse(text));
  const comments = COMMENTS[ext];
  if (!comments) return text;
  return comments.reduce((t, pattern) => t.replace(pattern, " "), text).replace(/\s+/g, " ").trim();
}

/** Reads a file in the plan folder as text, or null when it does not exist. */
export const planReader = (planDir: string): Read => (path) => {
  const file = resolvePath(planDir, path);
  return existsSync(file) ? readFileSync(file, "utf8") : null;
};

/** The words of `file` or `file#Heading`. */
function wordsOf(read: Read, ref: string): string {
  const [file = "", heading] = ref.split("#", 2);
  const text = read(file);
  if (text === null) throw new Error(`${ref}: ${file} does not exist`);
  const shown = heading === undefined ? text : section(text, heading);
  if (shown === null) throw new Error(`${ref}: no heading "${heading}"`);
  return words(shown, extname(file));
}

const byCanon = (values: unknown[]) => values.map(canon).sort();

/** A chart's states and arrows as sets. Their order in `report.json` only moves the drawing, which is layout. */
function orderFree(input: Inputs[View]): unknown {
  if (!("runs" in input)) return input;
  return {
    ...input,
    runs: input.runs.map((run) => {
      const chart = run.report?.chart;
      if (!chart) return run;
      return { ...run, report: { ...run.report, chart: { ...chart, states: byCanon(chart.states), arrows: byCanon(chart.arrows) } } };
    }),
  };
}

/** The grant lists the pull requests that merge without a person, so their merge facts belong to its rev. */
const grantInput = (m: Manifest) => (m.facts.prs ?? []).filter((pr) => pr.merge.by !== "human").map((pr) => [pr.id, pr.merge]);

export function revsOf(m: Manifest, planDir: string): Revs {
  const read = planReader(planDir);
  const items = Object.fromEntries(m.items.map((item) => {
    const shown = [
      item,
      (item.body ?? []).map((block) => {
        const { input, sources } = resolve(block, item, m, read);
        return [orderFree(input), sources.map((ref) => wordsOf(read, ref))];
      }),
      item.source ? wordsOf(read, item.source) : null,
      item.type === "grant" ? grantInput(m) : null,
    ];
    return [item.id, hash(canon(shown))];
  }));
  // The spec view draws the title, ask and note, so its item rev holds them. With no spec view, the plan rev does.
  const drawn = m.items.some((item) => item.body?.some((block) => block.view === "spec"));
  const opening = drawn ? [] : [canon({ title: m.title, ask: m.ask, note: m.note })];
  return { planRev: hash([...Object.values(items).sort(), ...opening].join("\n")), items };
}

export async function readManifest(planDir: string): Promise<Manifest> {
  const file = resolvePath(planDir, "sign-off.json");
  if (!existsSync(file)) throw new Error(`${file} does not exist`);
  return Manifest.parse(JSON.parse(await Bun.file(file).text()));
}

/** The current revs of the plan folder, for `build` and the review log. */
export async function computeRevs(planDir: string): Promise<Revs> {
  return revsOf(await readManifest(planDir), planDir);
}
