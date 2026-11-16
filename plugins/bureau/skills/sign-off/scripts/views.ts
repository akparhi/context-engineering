/** What each view draws, resolved from the manifest. `build` embeds each block's `input` in the page, and `revsOf` hashes the same
 *  `input` plus the words of each file in `sources`, so an `itemRev` changes when what the reviewer sees changes. An input holds file
 *  paths, never file text, so a reflowed source changes no rev. Prose is the exception: the page shows its file as written, so its
 *  line breaks are what the reviewer reads. No zod and no Node APIs here: the viewer imports these types, and the page may call a
 *  resolver. */
import type { ReportJson, ReportRule } from "../../statechart/scripts/backends/report.ts";
import type { Block, Item, Manifest } from "./manifest.ts";
import { section } from "./markdown.ts";

/** A file in the plan folder, as text, or null when it does not exist. Paths are relative to the plan folder. */
export type Read = (path: string) => string | null;
export type Resolved<I> = { input: I; sources: string[] };

type Facts = Manifest["facts"];
type Fact<K extends keyof Facts> = NonNullable<Facts[K]>[number];
type BlockOf<V extends Block["view"]> = Extract<Block, { view: V }>;
type ItemOf<T extends Item["type"]> = Extract<Item, { type: T }>;

export type Product = Exclude<Manifest["product"], { none: string }>;
export type Question = ItemOf<"question">;
export type Figure = BlockOf<"figures">["facts"][number];
export type Screen = Fact<"screens">;
export type Component = Fact<"components">;
export type Endpoint = Fact<"endpoints">;
export type Acceptance = Fact<"acceptance">;
export type Test = Fact<"tests">;
export type PullRequest = Fact<"prs">;
export type Risk = Fact<"risks">;
export type Default = Fact<"defaults">;
export type Step = ItemOf<"step">;
export type { ReportJson };
/** A unit that delivers something, and the pull requests that ship that unit. */
export type Build = { unit: string; repo?: string; prs: string[] };
/** A rule an acceptance row names: its wording, and its verdict in the plan's own run, or null when that run has no report yet. */
export type RuleWords = { says: string; outcome: ReportRule["outcome"] | null; parked?: string };

/** The plan's opening words, the product plan, and per requirement the screens it is seen on and how many checks prove it. `figures`
 *  and `defaults` are the facts that serve a requirement. `product` is null in a plan with no product act. */
export type SpecInput = {
  plan: { title: string; ask: string; note?: string }
  product: Product | null
  reach: Record<string, { checks: number; screens: { id: string; label: string }[] }>
  questions: Question[]
  figures: Figure[]
  defaults: Default[]
};
export type ScreensInput = { screens: Screen[] };
export type FiguresInput = { facts: Figure[] };
export type DecisionsInput = { decisions: ItemOf<"decision">[] };
/** `ships`: per unit, the pull requests that ship it and the branch each goes into. */
export type UnitsInput = { steps: Step[]; ships: Record<string, Pick<PullRequest, "id" | "into">[]>; note?: string };
export type RisksInput = { risks: Risk[]; defaults: Default[] };
/** `src` is the DBML that `build` parses for the drawing. `steps` maps each writer's step words to the `sc:` state that step
 *  leads into in the plan's own chart run, for the steps that chart draws. */
export type ErdInput = Omit<BlockOf<"erd">, "view"> & { steps: Record<string, string> };
/** Each endpoint with the parts that read it and the units that build it. `src` stays out: the cards draw what the fragment says. */
export type EndpointsInput = Omit<BlockOf<"endpoints">, "view" | "ids" | "src"> & {
  endpoints: (Endpoint & { readBy: Pick<Component, "id" | "name">[]; builtIn: Build[] })[]
};
/** `screens` are every page state, for the picture and the "Drawn in" labels. `builtIn` lists the units that deliver any part. */
export type ComponentsInput = { components: Component[]; screens: Screen[]; builtIn: Build[]; note?: string };
/** One row per requirement, and a `requirement: null` row for acceptance that checks none. `prsOf` maps a unit to the pull
 *  requests that ship it; `rules` holds each rule a row guards or was added for, by name. */
export type TraceInput = {
  rows: { requirement: { id: string; title: string } | null; acceptance: Acceptance[]; tests: Test[] }[]
  prsOf: Record<string, string[]>
  rules: Record<string, RuleWords>
};
/** Each pull request with the requirements its units serve, and `units`: the title of each unit a pull request ships. `after` also
 *  holds the pull requests that ship a unit its own units merge or start after, so the order is drawn from the units' fields. */
export type PrsInput = Omit<BlockOf<"prs">, "view"> & { prs: (PullRequest & { serves: string[] })[]; units: Record<string, string> };
/** `text` is the file or section as written, or null when it does not exist. */
export type ProseInput = { src: string; text: string | null };
/** `report` is the run's `report.json`, or null when the run has none yet. `checked` is the sentence `report.md` opens with,
 *  how many states and steps TLC reached, or null when the run has no `report.md`. */
export type StatechartInput = Omit<BlockOf<"statechart">, "view" | "runs"> & {
  runs: { id: string; label: string; note: string; report: ReportJson | null; checked: string | null }[]
};

export type Inputs = {
  spec: SpecInput; screens: ScreensInput; figures: FiguresInput; decisions: DecisionsInput; units: UnitsInput; risks: RisksInput
  erd: ErdInput; endpoints: EndpointsInput; components: ComponentsInput; trace: TraceInput; prs: PrsInput; prose: ProseInput
  statechart: StatechartInput
};
export type View = Block["view"];
type Resolver<V extends View> = (block: BlockOf<V>, item: Item, m: Manifest, read: Read) => Resolved<Inputs[V]>;

const itemsOf = <T extends Item["type"]>(m: Manifest, type: T) => m.items.filter((i): i is ItemOf<T> => i.type === type);
const plain = <I>(input: I): Resolved<I> => ({ input, sources: [] });
const served = <F extends { serves?: string[] }>(facts: F[], reqs: Set<string>) => facts.filter((f) => f.serves?.some((r) => reqs.has(r)));
const unique = <T>(values: T[]) => [...new Set(values)];

/** Each unit and the pull requests whose steps name it. */
function prsOf(m: Manifest): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const pr of m.facts.prs ?? []) for (const step of pr.steps) (out[step] ??= []).push(pr.id);
  return out;
}
/** The units that deliver any of `ids`. */
const builtIn = (m: Manifest, ids: string[]): Build[] => {
  const prs = prsOf(m);
  return itemsOf(m, "step").filter((s) => s.delivers?.some((d) => ids.includes(d))).map((s) => ({ unit: s.id, repo: s.repo, prs: prs[s.id] ?? [] }));
};
const reportAt = (read: Read, dir: string) => {
  const text = read(`${dir}/report.json`);
  return text === null ? null : (JSON.parse(text) as ReportJson);                  // `check` validates the file's version
};
/** The sentence statechart's `report.md` opens with, such as "TLC reached 111 states and 423 steps. The chart draws ...". */
const checkedAt = (read: Read, dir: string) => read(`${dir}/report.md`)?.match(/^TLC reached .*$/m)?.[0] ?? null;
const chartsOf = (m: Manifest) => m.items.flatMap((i) => i.body ?? []).filter((b): b is BlockOf<"statechart"> => b.view === "statechart");
/** Per step word in the plan's own run, the `sc:` ref of the one state its arrows lead into. A step with arrows into several
 *  states gets no ref, so the link never depends on the order of arrows in the report. */
function stepTargets(m: Manifest, read: Read): Record<string, string> {
  const run = chartsOf(m)[0]?.runs?.[0];
  const report = run ? reportAt(read, run.dir) : null;
  if (!report?.chart) return {};
  const targets = new Map<string, Set<string>>();
  for (const a of report.chart.arrows) targets.set(a.step, (targets.get(a.step) ?? new Set()).add(`sc:${report.module}/${a.to.join("/")}`));
  return Object.fromEntries([...targets].flatMap(([step, [to, ...more]]) => (to && more.length === 0 ? [[step, to]] : [])));
}
/** Each named rule's words from the chart that defines it, and its verdict in that chart's first run, which is this plan. */
function rulesOf(m: Manifest, read: Read, names: string[]): Record<string, RuleWords> {
  const charts = chartsOf(m);
  return Object.fromEntries(names.map((name) => {
    const chart = charts.find((c) => name in c.says);
    const run = chart?.runs?.[0];
    const outcome = run ? (reportAt(read, run.dir)?.rules.find((r) => r.name === name)?.outcome ?? null) : null;
    return [name, { says: chart?.says[name] ?? name, outcome, parked: chart?.parked?.[name] }];
  }));
}
/** A `file` or `file#Heading` ref as written, or null when the file or heading does not exist. */
function textOf(read: Read, ref: string): string | null {
  const [file = "", heading] = ref.split("#", 2);
  const text = read(file);
  return text === null || heading === undefined ? text : section(text, heading);
}

export const VIEWS: { [V in View]: Resolver<V> } = {
  spec: (_block, item, m) => {
    const product = "none" in m.product ? null : m.product;
    const reqs = new Set(product?.requirements.map((r) => r.id));
    const f = m.facts;
    const reach = Object.fromEntries([...reqs].map((r) => {
      const rows = new Set((f.acceptance ?? []).filter((a) => a.requirement === r).map((a) => a.id));
      const checks = (f.tests ?? []).filter((t) => t.proves.some((p) => rows.has(p))).length;
      const screens = (f.screens ?? []).filter((s) => s.serves.includes(r)).map((s) => ({ id: s.id, label: s.label }));
      return [r, { checks, screens }];
    }));
    const figures = m.items.flatMap((i) => i.body ?? []).flatMap((b) => (b.view === "figures" ? b.facts : []));
    return plain({
      plan: { title: m.title, ask: m.ask, note: m.note }, product, reach,
      questions: itemsOf(m, "question").filter((q) => q.section === item.section),
      figures: served(figures, reqs), defaults: served(f.defaults ?? [], reqs),
    });
  },
  screens: (block, _item, m) => plain({ screens: (m.facts.screens ?? []).filter((s) => !block.ids || block.ids.includes(s.id)) }),
  figures: (block) => plain({ facts: block.facts }),
  decisions: (_block, _item, m) => plain({ decisions: itemsOf(m, "decision") }),
  units: (block, _item, m) => {
    const prs = m.facts.prs ?? [];
    const steps = itemsOf(m, "step");
    const ships = Object.fromEntries(steps.map((s) => [s.id, prs.filter((p) => p.steps.includes(s.id)).map((p) => ({ id: p.id, into: p.into }))]));
    return plain({ steps, ships, note: block.note });
  },
  risks: (_block, _item, m) => plain({ risks: m.facts.risks ?? [], defaults: m.facts.defaults ?? [] }),
  erd: ({ view: _, ...block }, _item, m, read) => {
    const targets = stepTargets(m, read);
    const words = unique((block.writers ?? []).flatMap((w) => w.states));
    const steps = Object.fromEntries(words.flatMap((w) => (targets[w] ? [[w, targets[w]]] : [])));
    return { input: { ...block, steps }, sources: [block.sql ?? block.src, ...(block.base ? [block.base] : [])] };
  },
  endpoints: ({ view: _, ids, src, ...rest }, _item, m) => {
    const components = m.facts.components ?? [];
    const endpoints = (m.facts.endpoints ?? []).filter((e) => !ids || ids.includes(e.id)).map((e) => ({
      ...e,
      readBy: components.filter((c) => c.reads?.includes(e.id)).map((c) => ({ id: c.id, name: c.name })),
      builtIn: builtIn(m, [e.id]),
    }));
    return { input: { ...rest, endpoints }, sources: src ? [src] : [] };
  },
  components: (block, _item, m) => {
    const components = m.facts.components ?? [];
    return plain({ components, screens: m.facts.screens ?? [], builtIn: builtIn(m, components.map((c) => c.id)), note: block.note });
  },
  trace: (block, _item, m, read) => {
    const f = m.facts;
    const requirements = "none" in m.product ? [] : m.product.requirements;
    const row = (requirement: string | null) => {
      const acceptance = (f.acceptance ?? []).filter((a) => a.requirement === requirement);
      const ids = new Set(acceptance.map((a) => a.id));
      const tests = (f.tests ?? []).filter((t) => t.proves.some((p) => ids.has(p)));
      const named = requirements.find((r) => r.id === requirement);
      return { requirement: requirement === null ? null : { id: requirement, title: named?.title ?? requirement }, acceptance, tests };
    };
    const loose = (f.acceptance ?? []).some((a) => a.requirement === null);
    const rows = [...(block.requirements ?? requirements.map((r) => r.id)).map(row), ...(loose ? [row(null)] : [])];
    const named = unique(rows.flatMap((r) => r.acceptance.flatMap((a) => [a.guards, a.addedFor].flatMap((x) => x?.replace(/^rule:/, "") ?? []))));
    return plain({ rows, prsOf: prsOf(m), rules: rulesOf(m, read, named) });
  },
  prs: ({ view: _, ...rest }, _item, m) => {
    const steps = new Map(itemsOf(m, "step").map((s) => [s.id, s]));
    const shippedIn = prsOf(m);
    const prs = (m.facts.prs ?? []).map((p) => {
      const units = p.steps.flatMap((id) => steps.get(id) ?? []);
      const before = units.flatMap((u) => [...(u.mergesAfter ?? []), ...(u.startsAfter?.units ?? [])]).flatMap((id) => shippedIn[id] ?? []);
      const after = unique([...(p.after ?? []), ...before]).filter((id) => id !== p.id);
      return { ...p, ...(after.length ? { after } : {}), serves: unique(units.flatMap((u) => u.serves ?? [])) };
    });
    const units = Object.fromEntries(unique(prs.flatMap((p) => p.steps)).flatMap((id) => { const s = steps.get(id); return s ? [[id, s.title]] : []; }));
    return plain({ ...rest, prs, units });
  },
  prose: (block, _item, _m, read) => plain({ src: block.src, text: textOf(read, block.src) }),
  statechart: ({ view: _, runs, ...rest }, _item, _m, read) => {
    return {
      input: { ...rest, runs: (runs ?? []).map((r) => ({ id: r.id, label: r.label, note: r.note, report: reportAt(read, r.dir), checked: checkedAt(read, r.dir) })) },
      sources: rest.mmd ? [rest.mmd] : [],
    };
  },
};

/** The input and source files of one block. */
export const resolve = (block: Block, item: Item, m: Manifest, read: Read): Resolved<Inputs[View]> =>
  (VIEWS[block.view] as Resolver<View>)(block as BlockOf<View>, item, m, read);
