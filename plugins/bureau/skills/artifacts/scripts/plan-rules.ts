/** Plan-tier rules: what must hold across the artifacts of one plan. A pool is the union over every artifact of a type, and a rule
 *  that joins to a type the plan has no artifact of does not run. Each finding names the artifact it is in. */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Finding, Level } from "./artifact.ts";
import { type Artifact, ofType, type Plan } from "./plan.ts";
import type { TypeName } from "./registry.ts";
import { appliedSchema, type Catalog } from "./types/db-schema.ts";
import { actOneTexts, duplicateIds } from "./types/shared.ts";
import { planReport, stepsOf } from "./types/statechart.ts";

type Found = { artifact?: string; message: string; level?: Level };

const SINGLE: TypeName[] = ["requirements", "statechart", "db-schema", "acceptance", "test-plan", "pr-plan", "grant"];
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type Context = {
  plan: Plan
  has: (type: TypeName) => boolean
  all: <T extends TypeName>(type: T) => Artifact<T>[]
  reqs: Set<string>; screens: Set<string>; comps: Set<string>; eps: Set<string>; rows: Set<string>; units: Set<string>
  decisions: Set<string>; ruleNames: Set<string>
  /** The plan's `db-schema`, the schema it applies to, and whether that is unknown because its DDL fails. */
  schema: Artifact<"db-schema"> | null; catalog: Catalog | null; schemaUnknown: boolean
  /** The applied schema's tables, or the plan's own list when it has no `sql`. */
  tableNames: Set<string>
  /** The step words on the arrows of the plan's own chart run, and its state names. */
  drawn: { chart: Artifact<"statechart">; arrows: string[]; states: Set<string> } | null
};

async function contextOf(plan: Plan): Promise<Context> {
  const all = <T extends TypeName>(type: T) => ofType(plan, type);
  const idsOf = <T>(xs: T[], pick: (x: T) => string[]) => new Set(xs.flatMap(pick));
  const schema = all("db-schema")[0] ?? null;
  const applied = schema ? await appliedSchema(schema.data, plan.read) : null;
  const catalog = applied && typeof applied !== "string" ? applied : null;
  const chart = all("statechart")[0];
  const report = chart ? planReport(chart.data, plan.read) : null;
  return {
    plan, all,
    has: (type) => all(type).length > 0,
    reqs: idsOf(all("requirements"), (a) => ("none" in a.data ? [] : a.data.requirements.map((r) => r.id))),
    screens: idsOf(all("screens"), (a) => a.data.screens.map((s) => s.id)),
    comps: idsOf(all("components"), (a) => a.data.components.map((c) => c.id)),
    eps: idsOf(all("api"), (a) => (a.data.endpoints ?? []).map((e) => e.id)),
    rows: idsOf(all("acceptance"), (a) => a.data.rows.map((r) => r.id)),
    units: idsOf(all("pr-plan"), (a) => a.data.units.map((u) => u.id)),
    decisions: idsOf(all("decisions"), (a) => a.data.decisions.map((d) => d.id)),
    ruleNames: idsOf(all("statechart"), (a) => Object.keys(a.data.says)),
    schema, catalog,
    schemaUnknown: !!schema?.data.sql && !catalog,
    tableNames: new Set(catalog ? catalog.tables.keys() : schema?.data.sql ? [] : (schema?.data.tables ?? []).map((t) => t.name)),
    drawn: chart && report?.chart
      ? { chart, arrows: report.chart.arrows.map((a) => a.step), states: new Set(report.chart.states.map((s) => s.path.at(-1) ?? "")) }
      : null,
  };
}

const columnExists = (catalog: Catalog, ref: string) => {
  const [table, column] = ref.split(".");
  const columns = catalog.tables.get(table);
  return !!columns && (column === "*" || columns.has(column));
};

/** Each pool of ids an artifact holds, by the noun the `id` rule names it with. */
function idPools(a: Artifact): [string, string[]][] {
  const ids = <T extends { id: string }>(xs: T[] | undefined) => (xs ?? []).map((x) => x.id);
  switch (a.type) {
    case "requirements": return [["requirement", "none" in a.data ? [] : ids(a.data.requirements)]];
    case "screens": return [["screen", ids(a.data.screens)]];
    case "components": return [["component", ids(a.data.components)]];
    case "api": return [["endpoint", ids(a.data.endpoints)]];
    case "acceptance": return [["acceptance row", ids(a.data.rows)]];
    case "test-plan": return [["test", ids(a.data.tests)]];
    case "pr-plan": return [["unit", ids(a.data.units)], ["pull request", ids(a.data.prs)]];
    case "risks": return [["risk", ids(a.data.risks)], ["default", ids(a.data.defaults)]];
    case "decisions": return [["decision", ids(a.data.decisions)], ["option", a.data.decisions.flatMap((d) => ids(d.options))]];
    default: return [];
  }
}

/** Where each `serves` list sits in an artifact, as the `ref` rule names it. */
function servesOf(a: Artifact): [string, string[] | undefined][] {
  switch (a.type) {
    case "screens": return a.data.screens.flatMap((s) => [
      [`screen ${s.id}`, s.serves] as [string, string[]],
      ...s.regions.map((r): [string, string[] | undefined] => [`screen ${s.id} region ${r.name}`, r.serves]),
    ]);
    case "components": return a.data.components.map((c) => [`component ${c.id}`, c.serves]);
    case "api": return [
      ...(a.data.endpoints ?? []).flatMap((e) => [
        [`endpoint ${e.id}`, e.serves] as [string, string[]],
        ...(e.narrows ?? []).map((n): [string, string[] | undefined] => [`endpoint ${e.id} ${n.name}`, n.serves]),
        ...e.outcomes.map((o): [string, string[] | undefined] => [`endpoint ${e.id} ${o.status}`, o.serves]),
      ]),
      ...(a.data.access ? [[`${a.id} access`, a.data.access.serves] as [string, string[]]] : []),
    ];
    case "db-schema": return [
      ...(a.data.tables ?? []).map((t): [string, string[] | undefined] => [`${a.id} table ${t.name}`, t.serves]),
      ...(a.data.columns ?? []).map((c): [string, string[] | undefined] => [`${a.id} column ${c.column}`, c.serves]),
      ...(a.data.indexes ?? []).map((i): [string, string[] | undefined] => [`${a.id} index ${i.name}`, i.serves]),
    ];
    case "statechart": return Object.entries(a.data.serves ?? {}).map(([rule, reqs]) => [`${a.id} rule ${rule}`, reqs]);
    case "evidence": return a.data.figures.map((f) => [`${a.id} figure ${f.value}`, f.serves]);
    case "risks": return [
      ...(a.data.risks ?? []).map((r): [string, string[]] => [`risk ${r.id}`, r.serves]),
      ...(a.data.defaults ?? []).map((d): [string, string[]] => [`default ${d.id}`, d.serves]),
    ];
    case "decisions": return a.data.decisions.map((d) => [`decision ${d.id}`, d.serves]);
    case "pr-plan": return a.data.units.map((u) => [`unit ${u.id}`, u.serves]);
    default: return [];
  }
}

function* ids(c: Context): Generator<Found> {
  const pools = c.plan.artifacts.flatMap((a) => {
    const seen = new Set<string>();
    return idPools(a).map(([kind, list]): [string, string[]] => [`${kind} in ${a.id}`, list.filter((id) => !seen.has(id) && seen.add(id))]);
  });
  for (const { message } of duplicateIds(pools)) yield { message };
}

function* refs(c: Context): Generator<Found> {
  function* want(artifact: string, where: string, list: (string | null | undefined)[] | undefined, known: Set<string>, what: string) {
    for (const ref of list ?? []) if (ref && !known.has(ref)) yield { artifact, message: `${where}: ${what} ${ref} does not exist` };
  }
  if (c.has("requirements")) for (const a of c.plan.artifacts) for (const [where, reqs] of servesOf(a)) yield* want(a.id, where, reqs, c.reqs, "requirement");

  const repos = new Set(Object.keys(c.plan.plan?.repos ?? {}));
  for (const a of c.all("screens")) for (const s of a.data.screens) for (const r of s.regions) {
    if (c.has("components")) yield* want(a.id, `screen ${s.id} region ${r.name}`, [r.component], c.comps, "component");
  }
  for (const a of c.all("components")) for (const comp of a.data.components) {
    if (c.has("api")) yield* want(a.id, `component ${comp.id}`, comp.reads, c.eps, "endpoint");
    if (c.plan.plan) yield* want(a.id, `component ${comp.id}`, [comp.repo], repos, "repo");
  }
  for (const a of c.all("acceptance")) for (const row of a.data.rows) {
    if (c.has("requirements")) yield* want(a.id, `acceptance ${row.id}`, [row.requirement], c.reqs, "requirement");
    if (c.has("screens")) yield* want(a.id, `acceptance ${row.id}`, row.screens, c.screens, "screen");
    if (c.has("statechart")) for (const r of [row.guards, row.addedFor]) {
      if (r && !c.ruleNames.has(r.replace(/^rule:/, ""))) yield { artifact: a.id, message: `acceptance ${row.id}: rule ${r} does not exist` };
    }
  }
  for (const a of c.all("test-plan")) for (const t of a.data.tests) {
    if (c.has("acceptance")) yield* want(a.id, `test ${t.id}`, t.proves, c.rows, "acceptance row");
    if (c.has("pr-plan")) yield* want(a.id, `test ${t.id}`, [t.unit], c.units, "unit");
  }
  const runsBefore = new Set([...c.units, ...c.decisions]);
  for (const a of c.all("decisions")) for (const d of a.data.decisions) yield* want(a.id, `decision ${d.id}`, d.dependsOn, runsBefore, "unit or decision");
  const deliverable = new Set([...c.eps, ...c.comps, ...[...c.tableNames].map((t) => `db:${t}`)]);
  const checks = (d: string) => (d.startsWith("db:") ? !!c.schema && !c.schemaUnknown : c.has("api") || c.has("components"));
  for (const a of c.all("pr-plan")) for (const u of a.data.units) {
    yield* want(a.id, `unit ${u.id}`, [...(u.mergesAfter ?? []), ...(u.startsAfter?.units ?? [])], c.units, "unit");
    yield* want(a.id, `unit ${u.id}`, u.delivers?.filter(checks), deliverable, "deliverable");
  }
  if (c.has("api")) for (const a of c.all("statechart")) for (const [step, trigger] of Object.entries(a.data.triggers ?? {})) {
    if ("endpoint" in trigger) yield* want(a.id, `${a.id} trigger "${step}"`, [trigger.endpoint], c.eps, "endpoint");
  }
  if (c.catalog) for (const a of c.all("api")) for (const e of a.data.endpoints ?? []) for (const o of e.outcomes) for (const field of o.body ?? []) {
    if (field.column && !columnExists(c.catalog, field.column)) {
      yield { artifact: a.id, message: `endpoint ${e.id} ${o.status} ${field.name}: column ${field.column} is not in the applied schema` };
    }
  }
  if (c.schema && c.drawn) {
    const known = new Set(Object.keys(c.drawn.chart.data.triggers ?? {}));
    const steps = new Set(c.drawn.arrows.flatMap((label) => { const { steps, unknown } = stepsOf(label, known); return [...steps, ...unknown]; }));
    for (const writer of c.schema.data.writers ?? []) for (const s of writer.states) {
      if (!steps.has(s)) yield { artifact: c.schema.id, message: `Data: writer ${writer.column} names the step "${s}", which no chart draws` };
    }
  }
}

function* writes(c: Context): Generator<Found> {
  if (!c.has("statechart")) return;
  const triggered = new Set(c.all("statechart").flatMap((a) => Object.values(a.data.triggers ?? {}).flatMap((t) => ("endpoint" in t ? [t.endpoint] : []))));
  for (const a of c.all("api")) for (const e of a.data.endpoints ?? []) {
    if (WRITE_METHODS.has(e.method.toUpperCase()) && !triggered.has(e.id) && !e.noTransition) {
      yield { artifact: a.id, message: `endpoint ${e.id} (${e.method} ${e.path}) writes, and no chart step names it as a trigger. Add it to a chart's triggers, or set noTransition to say why it moves no state` };
    }
  }
}

function* stored(c: Context): Generator<Found> {
  if (!c.catalog) return;
  for (const a of c.all("statechart")) for (const [state, column] of Object.entries(a.data.stored ?? {})) {
    if (!columnExists(c.catalog, column)) yield { artifact: a.id, message: `Behavior: the state "${state}" is stored in ${column}, which is not in the applied schema` };
  }
}

/** A reused component's file must be in its repo's checkout. */
function* reuses(c: Context): Generator<Found> {
  if (!c.plan.plan) return;
  for (const a of c.all("components")) for (const comp of a.data.components) {
    if (comp.mark !== "reused" || !comp.repo || !comp.file) continue;
    const root = c.plan.plan.repos?.[comp.repo];
    if (!root) yield { artifact: a.id, message: `component ${comp.id} (${comp.name}) is reused, so it needs a repo and a file to show it exists` };
    else if (!existsSync(resolve(c.plan.dir, root, comp.file))) yield { artifact: a.id, message: `component ${comp.id} (${comp.name}) is reused, and ${comp.repo} has no ${comp.file}` };
  }
}

/** Act one names no tech term of this plan: a name that looks like code, with a lowercase letter before a capital or a `/`, `.`,
 *  `_` or `@` in it. */
function* jargon(c: Context): Generator<Found> {
  const identifier = (s: string) => /[a-z][A-Z]|[/._@]/.test(s);
  const terms = new Set([
    ...c.tableNames, ...[...(c.catalog?.tables.values() ?? [])].flatMap((cs) => [...cs]), ...(c.schema?.data.tables ?? []).map((t) => t.name),
    ...c.all("components").flatMap((a) => a.data.components.flatMap((comp) => [comp.name, comp.file ?? ""])),
    ...c.all("api").flatMap((a) => (a.data.endpoints ?? []).map((e) => e.path)),
    ...c.all("pr-plan").flatMap((a) => a.data.units.flatMap((u) => u.files ?? [])),
  ].filter((t) => t && identifier(t)));
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [...terms].map((t) => [t, new RegExp(`(?<![\\w/.@-])${escape(t)}(?![\\w/@-])`)] as const);
  const texts = [
    ...c.all("requirements").flatMap((a) => [...actOneTexts("", a.data)].map((t) => [a.id, ...t] as const)),
    ...c.all("screens").flatMap((a) => [...actOneTexts("screens", a.data.screens)].map((t) => [a.id, ...t] as const)),
  ];
  for (const [artifact, where, text] of texts) for (const [term, pattern] of patterns) {
    if (pattern.test(text)) yield { artifact, message: `act one, ${where}: names ${term}, a tech term of this plan. Say it in product words` };
  }
}

/** One cycle in `waitsOn`, from an id back to itself, or null when nothing waits on itself. */
function cycleIn(waitsOn: Map<string, string[]>): string[] | null {
  const clear = new Set<string>();
  const cycleFrom = (id: string, path: string[]): string[] | null => {
    if (path.includes(id)) return [...path.slice(path.indexOf(id)), id];
    if (clear.has(id)) return null;
    for (const next of waitsOn.get(id) ?? []) {
      const cycle = cycleFrom(next, [...path, id]);
      if (cycle) return cycle;
    }
    clear.add(id);
    return null;
  };
  for (const id of waitsOn.keys()) {
    const cycle = cycleFrom(id, []);
    if (cycle) return cycle;
  }
  return null;
}

/** Every unit starts at once, on stubs of the contracts it consumes. `mergesAfter` orders merges only, so a unit that waits to
 *  start says which contract is not fixed yet. A cycle among the units means no unit can merge first, and a cycle among the pull
 *  requests no pull request. A pull request merges after those its `after` names and those that ship a unit its own units wait on. */
function* order(c: Context): Generator<Found> {
  for (const a of c.all("pr-plan")) {
    const { units, prs } = a.data;
    const waitsOn = new Map(units.map((u) => [u.id, [...(u.mergesAfter ?? []), ...(u.startsAfter?.units ?? [])]]));
    for (const u of units) {
      if (u.startsAfter && !u.startsAfter.reason?.trim()) {
        yield { artifact: a.id, message: `unit ${u.id} starts after ${u.startsAfter.units.join(", ")} with no reason. Name the contract that is not fixed yet, or use mergesAfter and start on stubs` };
      }
    }
    const unitCycle = cycleIn(waitsOn);
    if (unitCycle) { yield { artifact: a.id, message: `units wait on each other: ${unitCycle.join(" after ")}` }; continue; }
    const shippedIn = (unit: string) => prs.filter((p) => p.steps.includes(unit)).map((p) => p.id);
    const prCycle = cycleIn(new Map(prs.map((p) => [p.id, [
      ...(p.after ?? []),
      ...p.steps.flatMap((step) => waitsOn.get(step) ?? []).flatMap(shippedIn).filter((id) => id !== p.id),
    ]])));
    if (prCycle) yield { artifact: a.id, message: `pull requests wait on each other: ${prCycle.join(" after ")}` };
  }
}

function* one(c: Context): Generator<Found> {
  for (const type of SINGLE) {
    const found = c.all(type);
    if (found.length > 1) yield { message: `a plan has at most one ${type} artifact, and this one has ${found.length}: ${found.map((a) => a.id).join(", ")}` };
  }
}

function* trace(c: Context): Generator<Found> {
  const warn = (artifact: string, message: string): Found => ({ artifact, message, level: "warning" });
  const requirements = c.all("requirements").flatMap((a) => ("none" in a.data ? [] : a.data.requirements.map((r) => [a.id, r.id] as const)));
  if (c.has("api") || c.has("components") || c.has("db-schema")) {
    const served = new Set([
      ...c.all("api").flatMap((a) => (a.data.endpoints ?? []).flatMap((e) => e.serves)),
      ...c.all("components").flatMap((a) => a.data.components.flatMap((comp) => comp.serves ?? [])),
      ...c.all("db-schema").flatMap((a) => [...(a.data.tables ?? []).flatMap((t) => t.serves ?? []), ...(a.data.columns ?? []).flatMap((col) => col.serves)]),
    ]);
    for (const [artifact, r] of requirements) if (!served.has(r)) yield warn(artifact, `trace hole: ${r} has no endpoint, component, table or column that serves it`);
  }
  const rows = c.all("acceptance").flatMap((a) => a.data.rows.map((row) => [a.id, row] as const));
  if (c.has("acceptance")) {
    const checked = new Set(rows.map(([, row]) => row.requirement));
    for (const [artifact, r] of requirements) if (!checked.has(r)) yield warn(artifact, `trace hole: ${r} has no acceptance row`);
  }
  if (c.has("test-plan")) {
    const proven = new Set(c.all("test-plan").flatMap((a) => a.data.tests.flatMap((t) => t.proves)));
    for (const [artifact, row] of rows) if (!proven.has(row.id)) yield warn(artifact, `trace hole: acceptance ${row.id} has no test`);
  }
}

const RULES: Record<string, (c: Context) => Iterable<Found>> = { id: ids, ref: refs, write: writes, stored, reuse: reuses, jargon, order, one, trace };

export async function planRules(plan: Plan): Promise<Finding[]> {
  const c = await contextOf(plan);
  return Object.entries(RULES).flatMap(([rule, run]) =>
    [...run(c)].map(({ artifact, message, level = "error" }): Finding => ({ tier: "plan", level, rule, ...(artifact && { artifact }), message })));
}
