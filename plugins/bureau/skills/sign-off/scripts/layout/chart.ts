/** Statechart positions, laid out by ELK at build time. Every state and arrow has a stable id, so the page can step a bug path
 *  and light what each step touches without laying anything out. Reference: the frozen prototype's `views-chart.js`. */
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api.js";
import type { ReportJson, StatechartInput } from "../views.ts";
import { type Box, elk, type Point } from "./elk.ts";
import { FONTS, textWidth, wrap } from "./text.ts";

/** `sc:<module>/<path>`, the ref the manifest uses for a chart state. */
export type StateId = string;
export type ArrowId = string;

export type ChartState = { id: StateId; label: string; group?: string; mark?: "breaks" | "mayBreak" };
/** Every step between the same two states, in one direction, drawn as one arrow. `back` arrows return to a state the walk
 *  from the start is still inside; unless every arrow is drawn, each is a row in the box it leaves. */
export type ChartArrow = { id: ArrowId; from: StateId; to: StateId; steps: string[]; text: string; back: boolean };
/** A broken rule's shortest path. `arrows[0]` is null, because the first state has no step into it. */
export type BugPath = { states: StateId[]; arrows: (ArrowId | null)[] };
export type ChartGraph = {
  width: number; height: number;
  groups: (Box & { name: string })[];
  start: Box;
  nodes: (Box & { id: StateId; lines: string[]; titleHeight: number; rows: { arrow: ArrowId; on: string; to: string }[] })[];
  edges: { id: ArrowId | "start"; points: Point[]; label?: Box & { lines: string[] } }[];
};
/** One chart. `graphs` holds each distinct drawing; `pick` says which one to show: every arrow, no bug path, or a rule's path. */
export type RunLayout = {
  states: ChartState[]; arrows: ChartArrow[]; start: StateId;
  paths: Record<string, BugPath>;
  focus?: string;                                        // the open broken rule drawn in red before the reader picks one
  graphs: ChartGraph[];
  pick: { all: number; none: number; rules: Record<string, number> };
};
/** Keyed by run id, or `chart` for a block with only `mmd`. */
export type ChartLayout = Record<string, RunLayout>;

/** The chart as data. `report.json`'s `chart`, when statechart wrote one, or the same read from `chart.mmd`. */
type Chart = { module: string; states: (ChartState & { start: boolean })[]; arrows: { from: StateId; to: StateId; step: string }[] };

const stateId = (module: string, path: string[]) => `sc:${module}/${path.join("/")}`;

function fromReport(report: ReportJson): Chart | null {
  const c = report.chart;
  if (!c) return null;
  const full = (region: string | undefined, path: string[]) => (region ? [region, ...path] : path);
  return {
    module: report.module,
    states: c.states.map((s) => ({ id: stateId(report.module, full(s.region, s.path)), label: s.path.at(-1)!, start: s.start,
      ...(s.group !== undefined && { group: s.group }), ...(s.mark && { mark: s.mark }) })),
    arrows: c.arrows.map((a) => ({ from: stateId(report.module, full(a.region, a.from)), to: stateId(report.module, full(a.region, a.to)), step: a.step })),
  };
}

const MARK_CLASSES = new Set(["breaks", "mayBreak", "bugPath", "repeats"]);
/** A bare chart with no report. yagni: reads statechart's flat mermaid output; a chart of regions needs a run and its `report.json`. */
function fromMmd(mmd: string, module: string): Chart {
  const decode = (s: string) => s.replace(/#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
  const labels = new Map<string, string>(), classes = new Map<string, string[]>(), arrows: { from: string; to: string; step: string }[] = [];
  let start = "";
  const lines = mmd.split("\n").map((l) => l.trim());
  for (const line of lines.slice(lines.indexOf("stateDiagram-v2") + 1)) {
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(\[\*\]|\w+) --> (\w+)(?:: (.*))?$/))) {
      if (m[1] === "[*]") start = m[2];
      else arrows.push({ from: m[1], to: m[2], step: decode(m[3] ?? "").replace(/ \[[^\]]*\]$/, "") });
    } else if ((m = line.match(/^class (\w+) (\w+)$/))) classes.set(m[1], [...(classes.get(m[1]) ?? []), m[2]]);
    else if ((m = line.match(/^(\w+): (.*)$/))) labels.set(m[1], decode(m[2]));
  }
  const legend = [...labels].filter(([id]) => id.startsWith("lg"));
  const groupOfColor = new Map(legend.flatMap(([id, label]) => (classes.get(id) ?? []).filter((c) => !MARK_CLASSES.has(c)).map((c) => [c, label])));
  const ids = [...labels.keys()].filter((id) => !id.startsWith("lg"));
  const idOf = (sid: string) => stateId(module, [labels.get(sid)!]);
  return {
    module,
    states: ids.map((sid) => {
      const cls = classes.get(sid) ?? [];
      const group = cls.map((c) => groupOfColor.get(c)).find(Boolean);
      const mark = cls.find((c): c is "breaks" | "mayBreak" => c === "breaks" || c === "mayBreak");
      return { id: idOf(sid), label: labels.get(sid)!, start: sid === start, ...(group && { group }), ...(mark && { mark }) };
    }),
    arrows: arrows.map((a) => ({ from: idOf(a.from), to: idOf(a.to), step: a.step })),
  };
}

/** Splits a label that statechart joined with " or " into the block's step words, longest match first. */
function stepsOf(label: string, known: Set<string>): string[] {
  const words = label.split(" or "), out: string[] = [];
  for (let i = 0; i < words.length;) {
    let j = words.length;
    while (j > i + 1 && !known.has(words.slice(i, j).join(" or "))) j--;
    out.push(words.slice(i, j).join(" or "));
    i = j;
  }
  return out;
}
const joinOr = (parts: string[]) => (parts.length < 2 ? parts[0] ?? "" : `${parts.slice(0, -1).join(", ")} or ${parts.at(-1)}`);

function mergeArrows(chart: Chart, short: Record<string, string>): ChartArrow[] {
  const known = new Set(Object.keys(short)), byPair = new Map<string, ChartArrow>();
  for (const a of chart.arrows) {
    const id = `${a.from}>${a.to}`;
    const arrow = byPair.get(id) ?? { id, from: a.from, to: a.to, steps: [], text: "", back: false };
    byPair.set(id, arrow);
    for (const step of stepsOf(a.step, known)) if (!arrow.steps.includes(step)) arrow.steps.push(step);
  }
  const arrows = [...byPair.values()].map((a) => ({ ...a, text: joinOr(a.steps.map((s) => short[s] ?? s)) }));
  const seen = new Map<StateId, "open" | "done">();
  const walk = (id: StateId) => {
    seen.set(id, "open");
    for (const a of arrows) if (a.from === id) { if (seen.get(a.to) === "open") a.back = true; else if (!seen.has(a.to)) walk(a.to); }
    seen.set(id, "done");
  };
  const start = chart.states.find((s) => s.start)?.id;
  if (start) walk(start);
  return arrows;
}

function bugPaths(report: ReportJson | null, states: ChartState[], arrows: ChartArrow[]): Record<string, BugPath> {
  const byLabel = new Map(states.map((s) => [s.label, s.id]));
  const out: Record<string, BugPath> = {};
  for (const rule of report?.rules ?? []) {
    if (rule.outcome !== "broken" || !rule.path) continue;
    const ids = rule.path.map((p) => byLabel.get(p.state));
    if (ids.some((id) => id === undefined)) continue;
    const sids = ids as StateId[];
    out[rule.name] = {
      states: sids,
      arrows: rule.path.map((p, k) => (k === 0 ? null
        : (arrows.find((a) => a.from === sids[k - 1] && a.to === sids[k] && p.step !== undefined && a.steps.includes(p.step))
          ?? arrows.find((a) => a.from === sids[k - 1] && a.to === sids[k]))?.id ?? null)),
    };
  }
  return out;
}

const ROW_H = 17;
const BASE_OPTIONS = {
  "elk.algorithm": "layered", "elk.direction": "DOWN", "elk.hierarchyHandling": "INCLUDE_CHILDREN", "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.cycleBreaking.strategy": "MODEL_ORDER",
  "elk.spacing.nodeNode": "28", "elk.layered.spacing.nodeNodeBetweenLayers": "22", "elk.spacing.edgeNode": "16", "elk.layered.spacing.edgeNodeBetweenLayers": "6",
  "elk.spacing.edgeEdge": "12", "elk.layered.spacing.edgeEdgeBetweenLayers": "8", "elk.spacing.edgeLabel": "4", "elk.spacing.labelNode": "8",
  "elk.edgeLabels.inline": "true", "elk.layered.edgeLabels.sideSelection": "SMART_DOWN",
};

type Run = { states: ChartState[]; arrows: ChartArrow[]; start: StateId; depth: Map<StateId, number> };
type NodeInfo = { lines: string[]; titleHeight: number; rows: { arrow: ArrowId; on: string; to: string }[] };

/** The ELK graph for one drawing. `all` draws every arrow with labels mid-arrow; otherwise each label sits where its arrow
 *  leaves the box, and the back arrows not in `drawn` become rows. */
function graphOf(run: Run, drawn: Set<ArrowId>, all: boolean, keepModelOrder: boolean) {
  const { states, arrows, start, depth } = run;
  const lines = arrows.filter((a) => drawn.has(a.id)), listed = arrows.filter((a) => !drawn.has(a.id));
  const label = (a: ChartArrow) => {
    const ls = wrap(a.text, FONTS.label, all ? 124 : 84);
    return { lines: ls, width: Math.max(...ls.map((l) => textWidth(l, FONTS.label))) + 12, height: ls.length * 15 + 5 };
  };
  const labelOf = new Map(lines.map((a) => [a.id, label(a)]));
  const into = (g: string) => arrows.filter((a) => states.find((s) => s.id === a.to)?.group === g).length;
  const minDepth = (g: string) => Math.min(...states.filter((s) => s.group === g).map((s) => depth.get(s.id) ?? 99));
  // With every arrow drawn, the group most arrows end in goes last, so fewer arrows run backward.
  const groups = [...new Set(states.flatMap((s) => (s.group === undefined ? [] : [s.group])))]
    .sort((a, b) => (all ? into(a) - into(b) : 0) || minDepth(a) - minDepth(b));
  const rank = (s: ChartState) => (s.group === undefined ? groups.length : groups.indexOf(s.group));
  const ordered = [...states].sort((a, b) => rank(a) - rank(b) || (depth.get(a.id) ?? 99) - (depth.get(b.id) ?? 99));
  const info = new Map<StateId, NodeInfo>();
  const node = (s: ChartState): ElkNode => {
    const title = wrap(s.label, FONTS.node, 132), titleHeight = 18 + title.length * 17;
    const rows = listed.filter((a) => a.from === s.id)
      .map((a) => ({ arrow: a.id, on: a.text, to: a.to === s.id ? "stays here" : states.find((t) => t.id === a.to)!.label }));
    const out = all ? [] : lines.filter((a) => a.from === s.id).map((a) => labelOf.get(a.id)!.width + 10);
    info.set(s.id, { lines: title, titleHeight, rows });
    const width = Math.max(...title.map((l) => textWidth(l, FONTS.node)),
      ...rows.map((r) => textWidth(r.on, FONTS.label) + textWidth(` → ${r.to}`, FONTS.row)),
      out.length > 1 ? out.length * Math.max(...out) - 8 : 0) + 28;
    return { id: s.id, width, height: titleHeight + (rows.length ? rows.length * ROW_H + 11 : 0) };
  };
  const options = { ...BASE_OPTIONS, ...(keepModelOrder && { "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES" }) };
  const startGroup = states.find((s) => s.id === start)?.group;
  const startNode = { id: "start", width: 14, height: 14 };
  const graph: ElkNode = {
    id: "chart", layoutOptions: options,
    children: [
      ...groups.map((g, i) => ({
        id: `group:${i}`, layoutOptions: { ...options, "elk.padding": "[top=36,left=16,bottom=12,right=16]" },
        children: [...(startGroup === g ? [startNode] : []), ...ordered.filter((s) => s.group === g).map(node)],
      })),
      ...(startGroup === undefined ? [startNode] : []),
      ...ordered.filter((s) => s.group === undefined).map(node),
    ],
    edges: [
      { id: "start", sources: ["start"], targets: [start] },
      ...lines.map((a): ElkExtendedEdge => ({ id: a.id, sources: [a.from], targets: [a.to],
        labels: [{ id: `${a.id}:label`, ...(all ? {} : { layoutOptions: { "elk.edgeLabels.placement": "TAIL" } }),
          text: a.text, width: labelOf.get(a.id)!.width, height: labelOf.get(a.id)!.height }] })),
    ],
  };
  return { graph, info, groups, labelOf };
}

async function draw(run: Run, drawn: Set<ArrowId>, all: boolean): Promise<ChartGraph> {
  let built = graphOf(run, drawn, all, true), laid: ElkNode;
  try {
    laid = await elk.layout(built.graph);
  } catch {
    // elkjs 0.9.3 throws on some charts when it keeps model order inside layers; those lay out without it.
    built = graphOf(run, drawn, all, false);
    laid = await elk.layout(built.graph);
  }
  const at = new Map<string, Point>([["chart", { x: 0, y: 0 }]]);
  const boxes: ChartGraph["nodes"] = [], groups: ChartGraph["groups"] = [];
  let start: Box = { x: 0, y: 0, width: 14, height: 14 };
  const place = (n: ElkNode, origin: Point) => {
    const x = origin.x + n.x!, y = origin.y + n.y!, box = { x, y, width: n.width!, height: n.height! };
    if (n.id === "start") start = box;
    else if (n.id.startsWith("group:")) {
      at.set(n.id, { x, y });
      groups.push({ ...box, name: built.groups[Number(n.id.slice(6))] });
      for (const child of n.children ?? []) place(child, { x, y });
    } else boxes.push({ ...box, id: n.id, ...built.info.get(n.id)! });
  };
  for (const n of laid.children ?? []) place(n, { x: 0, y: 0 });
  const edges = (laid.edges ?? []).map((e) => {
    const o = at.get((e as { container?: string }).container ?? "chart") ?? { x: 0, y: 0 };
    const s = e.sections?.[0];
    const points = s ? [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map((p) => ({ x: p.x + o.x, y: p.y + o.y })) : [];
    const l = e.labels?.[0];
    const label = l && { x: l.x! + o.x, y: l.y! + o.y, width: l.width!, height: l.height!, lines: built.labelOf.get(e.id)!.lines };
    return { id: e.id as ArrowId, points, ...(label && { label }) };
  });
  return { width: Math.ceil(laid.width!), height: Math.ceil(laid.height!), groups, start, nodes: boxes, edges };
}

async function layoutRun(chart: Chart, report: ReportJson | null, input: StatechartInput, runId: string): Promise<RunLayout> {
  const states = chart.states.map(({ start: _, ...s }) => s);
  const start = chart.states.find((s) => s.start)?.id ?? states[0].id;
  const arrows = mergeArrows(chart, input.steps ?? {});
  const depth = new Map([[start, 0]]), queue = [start];
  while (queue.length) {
    const n = queue.shift()!;
    for (const a of arrows) if (a.from === n && !depth.has(a.to)) { depth.set(a.to, depth.get(n)! + 1); queue.push(a.to); }
  }
  const run: Run = { states, arrows, start, depth };
  const paths = bugPaths(report, states, arrows);
  const focus = Object.keys(paths).find((rule) => input.notes?.[`${runId}:${rule}`]?.verdict !== "fixed");
  const forward = arrows.filter((a) => !a.back).map((a) => a.id);
  const graphs: ChartGraph[] = [], seen = new Map<string, number>();
  const drawing = async (ids: ArrowId[], all: boolean) => {
    const key = `${all}:${[...new Set(ids)].sort().join("|")}`;
    if (!seen.has(key)) { seen.set(key, graphs.length); graphs.push(await draw(run, new Set(ids), all)); }
    return seen.get(key)!;
  };
  const pick: RunLayout["pick"] = { all: await drawing(arrows.map((a) => a.id), true), none: await drawing(forward, false), rules: {} };
  for (const [rule, path] of Object.entries(paths))
    pick.rules[rule] = await drawing([...forward, ...path.arrows.filter((a): a is ArrowId => a !== null)], false);
  return { states, arrows, start, paths, ...(focus && { focus }), graphs, pick };
}

/** Lays out each run whose report holds a chart, or the bare `mmd` of a block with no runs. */
export async function layoutChart(input: StatechartInput, read: (path: string) => string | null): Promise<ChartLayout> {
  const out: ChartLayout = {};
  for (const run of input.runs) {
    const chart = run.report && fromReport(run.report);
    if (chart) out[run.id] = await layoutRun(chart, run.report, input, run.id);
  }
  const mmd = input.mmd === undefined ? null : read(input.mmd);
  if (!input.runs.length && mmd !== null) out.chart = await layoutRun(fromMmd(mmd, "chart"), null, input, "chart");
  return out;
}
