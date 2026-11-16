/** `sign-off check <plan-dir>` checks a plan's `sign-off.json` before anything draws it. Each rule in `RULES` is one function in
 *  `CHECKS` over a shared `Context`, and every error names its rule. Warnings are trace holes, a gate count above `MAX_GATES` and prose over its `BUDGET`. */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import type { z } from "zod";
import type { ReportJson } from "../../statechart/scripts/backends/report.ts";
import { type Block, Event, type Item, Manifest } from "./manifest.ts";
import { headings, section } from "./markdown.ts";
import { ACT_OF, IRREVERSIBLE, type Section } from "./model.ts";
import { prCycle, unitCycle } from "./order.ts";

export const RULES = [
  "schema", "id", "ref", "cite", "section", "touch", "jargon", "log",
  "ddl", "table-mark", "index",
  "trigger", "write", "stored", "render", "reuse", "test",
] as const;
export type Rule = (typeof RULES)[number];
export type Finding = { rule: Rule; message: string };
export type Report = { errors: Finding[]; warnings: string[]; summary: string };

const MAX_GATES = 7;
/** Words a prose field may run to before `budget` warns. The reader is an engineer, and the page is one screen per stop. */
const BUDGET = { why: 16, does: 14, review: 12, prNote: 16, note: 24, says: 24 } as const;
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// Nothing in the facts can show these, so an item declares them on its own word. `money` waits for a consumer's money-column
// patterns, and `dependency` for each ecosystem's manifest files. `authority` is not derived from auto-merge pull requests,
// because the grant already gates those, and a second gate on the same merge would only cost the reader a verdict.
const DECLARED_ONLY = new Set<string>([...IRREVERSIBLE, "money", "dependency", "authority"]);
const ACT_ONE_SKIP = new Set(["id", "serves", "component", "sketch", "mark", "states", "from", "chart"]);

type Facts = Manifest["facts"];
type View<V extends Block["view"]> = Extract<Block, { view: V }>;
type Erd = View<"erd">;
type Statechart = View<"statechart">;

/** The applied schema, read from Postgres's catalog. Tables map to their columns. */
type Catalog = {
  tables: Map<string, Set<string>>;
  baseTables: Set<string>;
  indexes: Map<string, { table: string; unique: boolean; where: string | null }>;
  /** Each declared `where`, as Postgres prints it, so it compares with the catalog's. */
  declaredWhere: Map<string, string>;
};

/** Everything the rules read, built once. `erd` and `chart` are the plan's only blocks of their view; `section` fails a second. */
type Context = {
  dir: string; m: Manifest; facts: Facts; items: Item[]
  reqs: Set<string>; itemIds: Set<string>; screens: Set<string>; comps: Set<string>; eps: Set<string>; accs: Set<string>
  prIds: Set<string>; steps: Set<string>; questions: Set<string>
  erd: Erd | null; chart: Statechart | null
  /** The applied schema, when the Data block has `sql` and it applies. */
  catalog: Catalog | null; ddlError: string | null
  /** The tables the plan draws: the applied schema's, or the Data block's own list when it has no `sql`. */
  tableNames: Set<string>
  /** The first run's `report.json`, which judges this plan's model. */
  report: ReportJson | null; reportError: string | null
  /** The step words on the first run's arrows, and its state names. */
  drawn: { arrows: string[]; states: Set<string> } | null
  log: string | null
  read: (ref: string) => string | null
};

/** A union reports every branch's issues; keep only the branch the input came closest to, so the path names the bad field. */
function* schemaProblems(issue: z.core.$ZodIssue, at: PropertyKey[] = []): Generator<string> {
  const path = [...at, ...issue.path];
  if (issue.code === "invalid_union" && issue.errors.length > 0) {
    const closest = issue.errors.reduce((best, branch) => (branch.length < best.length ? branch : best));
    for (const inner of closest) yield* schemaProblems(inner, path);
    return;
  }
  const field = path.map((key, i) => (typeof key === "number" ? `[${key}]` : `${i > 0 ? "." : ""}${String(key)}`)).join("");
  yield `${field || "(root)"}: ${issue.message}`;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Applies `base`, then `sql`, to an empty Postgres in WASM, and reads tables, columns and indexes back from the catalog. */
async function applySchema(base: { ref: string; text: string } | null, sql: { ref: string; text: string },
  declared: NonNullable<Erd["indexes"]>): Promise<Catalog | string> {
  const db = await PGlite.create({ extensions: { uuid_ossp } }); // yagni: one extension, add others when a baseline needs them
  const tables = async () => {
    const out = new Map<string, Set<string>>();
    const rows = await db.query<{ t: string; c: string }>(
      "select table_name as t, column_name as c from information_schema.columns where table_schema = 'public' order by t, ordinal_position");
    for (const { t, c } of rows.rows) out.set(t, (out.get(t) ?? new Set()).add(c));
    return out;
  };
  try {
    if (base) {
      try { await db.exec(base.text); } catch (error) { return `${base.ref} does not apply to an empty database: ${message(error)}`; }
    }
    const baseTables = new Set((await tables()).keys());
    try { await db.exec(sql.text); } catch (error) { return `${sql.ref} does not apply to ${base?.ref ?? "an empty database"}: ${message(error)}`; }
    const indexes: Catalog["indexes"] = new Map();
    const rows = await db.query<{ name: string; table: string; unique: boolean; where: string | null }>(
      `select c.relname as name, t.relname as table, i.indisunique as unique, pg_get_expr(i.indpred, i.indrelid) as where
       from pg_index i join pg_class c on c.oid = i.indexrelid join pg_class t on t.oid = i.indrelid
       join pg_namespace n on n.oid = t.relnamespace where n.nspname = 'public'`);
    for (const { name, ...index } of rows.rows) indexes.set(name, index);
    const declaredWhere = new Map<string, string>();
    for (const { name, where } of declared) {
      const table = indexes.get(name)?.table;
      if (!where || !table) continue;
      await db.exec("begin");
      try {
        await db.exec(`create index sign_off_probe on "${table.replaceAll('"', '""')}" ((1)) where ${where}`);
        const probe = await db.query<{ where: string }>(
          "select pg_get_expr(indpred, indrelid) as where from pg_index where indexrelid = 'sign_off_probe'::regclass");
        declaredWhere.set(name, probe.rows[0].where);
      } catch (error) {
        declaredWhere.set(name, `(not a predicate on ${table}: ${message(error)})`);
      } finally {
        await db.exec("rollback");
      }
    }
    return { tables: await tables(), baseTables, indexes, declaredWhere };
  } finally {
    await db.close();
  }
}

/** Splits an arrow label that statechart joined with " or " into known step words, longest match first. */
function stepsOf(label: string, known: Set<string>) {
  const words = label.split(" or "), steps: string[] = [], unknown: string[] = [];
  for (let i = 0; i < words.length;) {
    let j = words.length;
    while (j > i && !known.has(words.slice(i, j).join(" or "))) j--;
    if (j > i) { steps.push(words.slice(i, j).join(" or ")); i = j; } else unknown.push(words[i++]);
  }
  return { steps, unknown };
}

/** Each pool of ids, named for the `id` rule's message. */
function idPools(m: Manifest): [string, { id: string }[]][] {
  return [
    ["requirement", "none" in m.product ? [] : m.product.requirements], ["item", m.items],
    ...Object.entries(m.facts).map(([kind, xs]): [string, { id: string }[]] => [kind, xs ?? []]),
    ["option", m.items.flatMap((i) => ("options" in i ? i.options ?? [] : []))],
  ];
}

/** The first run's `report.json`, or why it cannot be read. */
function readReport(chart: Statechart | null, read: Context["read"]): { report: ReportJson | null; reportError: string | null } {
  const first = chart?.runs?.[0];
  if (!first) return { report: null, reportError: null };
  const ref = `${first.dir}/report.json`, text = read(ref);
  if (text === null) return { report: null, reportError: `Behavior: run ${first.id} has no ${ref}` };
  let json: { v?: unknown };
  try { json = JSON.parse(text); } catch (error) { return { report: null, reportError: `Behavior: ${ref} is not JSON: ${message(error)}` }; }
  if (json.v !== 1) return { report: null, reportError: `Behavior: ${ref} has version ${String(json.v)}, and check reads version 1. Run statechart again` };
  return { report: json as ReportJson, reportError: null };
}

async function contextOf(dir: string, m: Manifest): Promise<Context> {
  const read = (ref: string) => {
    const file = resolve(dir, ref.split("#")[0]);
    return existsSync(file) ? readFileSync(file, "utf8") : null;
  };
  const blocks = m.items.flatMap((it) => it.body ?? []);
  const erd = blocks.find((b): b is Erd => b.view === "erd") ?? null;
  const chart = blocks.find((b): b is Statechart => b.view === "statechart") ?? null;
  const pools = idPools(m);
  const idsOf = (kind: string) => new Set(pools.filter(([k]) => k === kind).flatMap(([, xs]) => xs.map((x) => x.id)));

  let catalog: Catalog | null = null, ddlError: string | null = null;
  const sql = erd?.sql ? read(erd.sql) : null, base = erd?.base ? read(erd.base) : null;
  if (erd?.sql && sql !== null && (!erd.base || base !== null)) {
    const applied = await applySchema(erd.base && base !== null ? { ref: erd.base, text: base } : null, { ref: erd.sql, text: sql }, erd.indexes ?? []);
    if (typeof applied === "string") ddlError = applied;
    else catalog = applied;
  }
  const { report, reportError } = readReport(chart, read);
  const log = resolve(dir, "reviews/events.jsonl");
  return {
    dir, m, facts: m.facts, items: m.items,
    reqs: idsOf("requirement"), itemIds: idsOf("item"), screens: idsOf("screens"), comps: idsOf("components"), eps: idsOf("endpoints"),
    accs: idsOf("acceptance"), prIds: idsOf("prs"),
    steps: new Set(m.items.filter((i) => i.type === "step").map((i) => i.id)),
    questions: new Set(m.items.filter((i) => i.type === "question").map((i) => i.id)),
    erd, chart, catalog, ddlError,
    tableNames: new Set(catalog ? catalog.tables.keys() : erd?.sql ? [] : (erd?.tables ?? []).map((t) => t.name)),
    report, reportError,
    drawn: report?.chart ? { arrows: report.chart.arrows.map((a) => a.step), states: new Set(report.chart.states.map((s) => s.path.at(-1) ?? "")) } : null,
    log: existsSync(log) ? readFileSync(log, "utf8") : null,
    read,
  };
}

const columnExists = (c: Context, ref: string) => {
  const [table, column] = ref.split(".");
  const columns = c.catalog?.tables.get(table);
  return !!columns && (column === "*" || columns.has(column));
};

function* ids(c: Context) {
  const owner = new Map<string, string>();
  for (const [kind, xs] of idPools(c.m)) for (const { id } of xs) {
    if (owner.has(id)) yield `duplicate id ${id}: a ${owner.get(id)} and a ${kind}`;
    else owner.set(id, kind);
  }
}

function* refs(c: Context) {
  const { facts: f, reqs, itemIds, screens, comps, eps, accs, prIds, steps, questions } = c;
  const exists = (ref: string) => existsSync(resolve(c.dir, ref.split("#")[0]));
  function* want(where: string, ref: string | undefined | null, set: Set<string>, what: string) {
    if (ref && !set.has(ref)) yield `${where}: ${what} ${ref} does not exist`;
  }
  function* wantAll(where: string, refs: string[] | undefined, set: Set<string>, what: string) {
    for (const r of refs ?? []) yield* want(where, r, set, what);
  }
  function* wantColumn(where: string, ref: string) {
    if (c.catalog && !columnExists(c, ref)) yield `${where}: column ${ref} is not in the applied schema`;
  }
  const schemaUnknown = !!c.erd?.sql && !c.catalog;                                   // the DDL failed, and `ddl` already says so
  const deliverable = new Set([...eps, ...comps, ...[...c.tableNames].map((t) => `db:${t}`)]);
  const ruleNames = new Set(Object.keys(c.chart?.says ?? {}));

  if (c.erd) for (const ref of [c.erd.src, c.erd.sql, c.erd.base]) if (ref && !exists(ref)) yield `Data: ${ref} does not exist`;
  if (c.reportError) yield c.reportError;
  for (const it of c.items) {
    const w = `item ${it.id}`;
    yield* wantAll(w, it.serves, reqs, "requirement");
    if (it.source) {
      const text = c.read(it.source), heading = it.source.split("#")[1];
      if (text === null) yield `${w}: source ${it.source} does not exist`;
      else if (heading && !headings(text).some((h) => h.text === heading)) yield `${w}: source ${it.source} has no heading "${heading}"`;
    }
    if (it.type === "step") {
      yield* wantAll(w, it.delivers?.filter((d) => !(schemaUnknown && d.startsWith("db:"))), deliverable, "deliverable");
      yield* wantAll(w, it.mergesAfter, steps, "unit");
      yield* wantAll(w, it.startsAfter?.units, steps, "unit");
    }
    if (it.type === "decision") yield* want(w, it.chosen, new Set(it.options.map((o) => o.id)), "option");
    if (it.type === "question") {
      yield* want(w, it.recommended, new Set((it.options ?? []).map((o) => o.id)), "option");
      yield* wantAll(w, it.blocks, itemIds, "item");
    }
    for (const b of it.body ?? []) {
      if (b.view === "screens") yield* wantAll(w, b.ids, screens, "screen");
      if (b.view === "endpoints") {
        yield* wantAll(w, b.ids, eps, "endpoint");
        yield* wantAll(`${w} access`, b.access?.serves, reqs, "requirement");
        yield* want(`${w} access`, b.access?.ask, questions, "question");
        if (b.src && !exists(b.src)) yield `${w}: ${b.src} does not exist`;
      }
      if (b.view === "trace") yield* wantAll(w, b.requirements, reqs, "requirement");
      if (b.view === "prose" && !exists(b.src)) yield `${w}: ${b.src} does not exist`;
      if (b.view === "figures") for (const fig of b.facts) yield* wantAll(`${w} figure ${fig.value}`, fig.serves, reqs, "requirement");
      if (b.view === "erd") {
        for (const t of b.tables ?? []) {
          if (c.catalog) yield* want(w, t.name, c.tableNames, "table");
          yield* wantAll(`${w} table ${t.name}`, t.serves, reqs, "requirement");
        }
        for (const col of [...(b.columns ?? []), ...(b.writers ?? [])]) yield* wantColumn(w, col.column);
        for (const col of b.columns ?? []) yield* wantAll(`${w} column ${col.column}`, col.serves, reqs, "requirement");
        for (const i of b.indexes ?? []) yield* wantAll(`${w} index ${i.name}`, i.serves, reqs, "requirement");
        for (const l of b.loose ?? []) for (const col of [l.from, l.to]) yield* wantColumn(`${w} loose join`, col);
      }
      if (b.view === "statechart") {
        const runNames = new Set((b.runs ?? []).map((r) => r.id));
        for (const r of (b.runs ?? []).slice(1)) if (!exists(`${r.dir}/report.json`)) yield `${w}: run ${r.id} has no ${r.dir}/report.json`;
        if (b.mmd && !exists(b.mmd)) yield `${w}: ${b.mmd} does not exist`;
        for (const [rule, rs] of Object.entries(b.serves ?? {})) {
          yield* want(w, rule, ruleNames, "rule");
          yield* wantAll(`${w} rule ${rule}`, rs, reqs, "requirement");
        }
        for (const k of [...(b.hide ?? []), ...Object.keys(b.parked ?? {})]) yield* want(w, k, ruleNames, "rule");
        for (const k of Object.keys(b.notes ?? {})) {
          const [run, rule] = k.split(":");
          yield* want(w, run, runNames, "run");
          yield* want(w, rule, ruleNames, "rule");
        }
        for (const [step, trigger] of Object.entries(b.triggers ?? {})) if ("endpoint" in trigger) yield* want(`${w} trigger "${step}"`, trigger.endpoint, eps, "endpoint");
      }
    }
  }
  const units = c.items.filter((i) => i.type === "step");
  const cycle = unitCycle(units);
  if (cycle) yield `units ${cycle.join(", ")} wait on each other through mergesAfter and startsAfter. Drop one of the links`;
  const prs = cycle ? null : prCycle(f.prs ?? [], units);
  if (prs) yield `pull requests ${prs.join(", ")} wait on each other through \`after\` and the order of their units. Drop one of the links`;
  for (const s of f.screens ?? []) {
    yield* want(`screen ${s.id}`, s.from, screens, "screen");
    yield* wantAll(`screen ${s.id}`, s.serves, reqs, "requirement");
    for (const r of s.regions) {
      yield* want(`screen ${s.id} region ${r.name}`, r.component, comps, "component");
      yield* wantAll(`screen ${s.id} region ${r.name}`, r.serves, reqs, "requirement");
    }
  }
  for (const comp of f.components ?? []) {
    const w = `component ${comp.id}`;
    yield* want(w, comp.parent, comps, "component");
    yield* want(w, comp.shows, comps, "component");
    yield* wantAll(w, comp.reads, eps, "endpoint");
    yield* wantAll(w, comp.serves, reqs, "requirement");
    yield* want(w, comp.repo, new Set(Object.keys(c.m.repos ?? {})), "repo");
  }
  for (const e of f.endpoints ?? []) {
    yield* wantAll(`endpoint ${e.id}`, e.serves, reqs, "requirement");
    for (const n of e.narrows ?? []) yield* wantAll(`endpoint ${e.id} ${n.name}`, n.serves, reqs, "requirement");
    for (const o of e.outcomes) {
      yield* wantAll(`endpoint ${e.id} ${o.status}`, o.serves, reqs, "requirement");
      for (const field of o.body ?? []) if (field.column) yield* wantColumn(`endpoint ${e.id} ${o.status} ${field.name}`, field.column);
    }
  }
  for (const a of f.acceptance ?? []) {
    yield* want(`acceptance ${a.id}`, a.requirement, reqs, "requirement");
    yield* wantAll(`acceptance ${a.id}`, a.screens, screens, "screen");
    for (const r of [a.guards, a.addedFor]) if (r && !ruleNames.has(r.replace(/^rule:/, ""))) yield `acceptance ${a.id}: rule ${r} does not exist`;
  }
  for (const t of f.tests ?? []) {
    yield* wantAll(`test ${t.id}`, t.proves, accs, "acceptance row");
    yield* want(`test ${t.id}`, t.unit, steps, "step");
  }
  for (const p of f.prs ?? []) {
    yield* wantAll(`PR ${p.id}`, p.after, prIds, "PR");
    yield* wantAll(`PR ${p.id}`, p.steps, steps, "step");
  }
  const shipped = new Set((f.prs ?? []).flatMap((p) => p.steps));
  for (const s of steps) if (!shipped.has(s)) yield `step ${s} ships in no pull request. Name it in a pull request's steps`;
  for (const r of [...(f.risks ?? []), ...(f.defaults ?? [])]) yield* wantAll(r.id, r.serves, reqs, "requirement");

  if (c.chart && c.drawn) {
    const triggers = new Set(Object.keys(c.chart.triggers ?? {}));
    const seen = new Set(c.drawn.arrows.flatMap((label) => stepsOf(label, triggers).steps));
    for (const s of triggers) if (!seen.has(s)) yield `Behavior: triggers names the step "${s}", which the chart does not draw`;
    for (const s of Object.keys(c.chart.stored ?? {})) if (!c.drawn.states.has(s)) yield `Behavior: stored names the state "${s}", which the chart does not draw`;
    const drawnSteps = new Set(c.drawn.arrows.flatMap((label) => { const { steps, unknown } = stepsOf(label, triggers); return [...steps, ...unknown]; }));
    for (const wr of c.erd?.writers ?? []) for (const s of wr.states) {
      if (!drawnSteps.has(s)) yield `Data: writer ${wr.column} names the step "${s}", which no chart draws`;
    }
  }
}

/** Each file that items cite by heading must have each heading with text cited, or an edit there would change no item's rev.
 *  The file's leading level-1 heading is its title. */
function* cites(c: Context) {
  const cited = new Map<string, Set<string>>();
  for (const it of c.items) {
    const [file, heading] = it.source?.split("#", 2) ?? [];
    if (file && heading) cited.set(file, (cited.get(file) ?? new Set()).add(heading));
  }
  for (const [file, used] of cited) {
    const text = c.read(file);
    if (text === null) continue;                                                     // `ref` says so
    const all = headings(text);
    // yagni: only a leading `#` is a title; let a plan name others if one needs uncited headings.
    for (const h of all[0]?.level === 1 ? all.slice(1) : all) {
      if (!used.has(h.text) && section(text, h.text)?.trim()) yield `${file}: the heading "${h.text}" has text, and no item cites it. Cite it from the item it belongs to`;
    }
  }
}

function* sections(c: Context) {
  const has = (...sections: Section[]) => c.items.some((i) => sections.includes(i.section));
  const kind = c.m.kind;
  if (kind === "change") for (const s of ["Units", "Pull requests", "Grant"] as const) if (!has(s)) yield `a change plan needs a ${s} section`;
  if (kind === "design" && !has("Scope", "Screens")) yield "a design plan needs act one: a Scope or Screens section";
  if (kind === "design" && !has("Behavior", "Data", "API", "Screens")) yield "a design plan needs a Behavior, Data, API or Screens section";
  if (kind === "questions" && c.questions.size === 0) yield "a questions plan needs a question";
  const grants = c.items.filter((i) => i.type === "grant");
  if (grants.length > 1) yield `a plan has one grant, and this one has ${grants.length}: ${grants.map((g) => g.id).join(", ")}`;
  for (const view of ["erd", "statechart"] as const) {
    const n = c.items.flatMap((i) => i.body ?? []).filter((b) => b.view === view).length;
    if (n > 1) yield `a plan has at most one ${view} block, and this one has ${n}`;
  }
}

/** True when the plan's own model leaves a rule open: broken or not checked in the first run, or no run at all. */
const openRule = (c: Context) =>
  !c.report || c.report.rules.some((r) => r.outcome !== "holds");

function* touches(c: Context) {
  const marked = (x: { mark: string }) => x.mark === "new" || x.mark === "changed";
  const derive = (it: Item) => {
    const out = new Set<string>();
    for (const b of it.body ?? []) {
      if (b.view === "spec") out.add("scope");
      if (b.view === "trace") out.add("acceptance");
      if (b.view === "statechart" && openRule(c)) out.add("open-rule");
      if (b.view === "screens" && (c.facts.screens ?? []).filter((s) => !b.ids || b.ids.includes(s.id)).some((s) => s.regions.some(marked))) out.add("user-visible");
      if (b.view === "erd" && (b.tables ?? []).some(marked)) out.add("schema");
      if (b.view === "endpoints") {
        const shown = (c.facts.endpoints ?? []).filter((e) => !b.ids || b.ids.includes(e.id));
        if (shown.some(marked)) out.add("api");
        if (shown.some((e) => marked(e.who))) out.add("permission");
      }
    }
    return out;
  };
  for (const it of c.items) {
    if (!("touches" in it)) continue;
    const declared = new Set<string>(it.touches), derived = derive(it);
    for (const t of derived) if (!declared.has(t)) yield `item ${it.id} (${it.title}): its facts make it touch ${t}, and touches does not declare it`;
    for (const t of declared) if (!derived.has(t) && !DECLARED_ONLY.has(t)) yield `item ${it.id} (${it.title}): declares ${t}, and no fact in it shows that`;
  }
}

function* jargon(c: Context) {
  const identifier = (s: string) => /[a-z][A-Z]|[/._@]/.test(s);
  const terms = new Set([
    ...c.tableNames, ...[...(c.catalog?.tables.values() ?? [])].flatMap((cs) => [...cs]), ...(c.erd?.tables ?? []).map((t) => t.name),
    ...(c.facts.components ?? []).flatMap((comp) => [comp.name, comp.file ?? ""]), ...(c.facts.endpoints ?? []).map((e) => e.path),
    ...c.items.flatMap((i) => (i.type === "step" ? i.files ?? [] : [])),
  ].filter((t) => t && identifier(t)));
  const actOne = c.items.filter((i) => ACT_OF[i.section] === "product");
  const texts: [string, string][] = [];
  const collect = (where: string, v: unknown) => {
    if (typeof v === "string") texts.push([where, v]);
    else if (Array.isArray(v)) v.forEach((x, i) => collect(`${where}[${i}]`, x));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (!ACT_ONE_SKIP.has(k)) collect(`${where}.${k}`, x);
  };
  collect("product", c.m.product);
  for (const it of actOne) collect(`item ${it.id}`, { title: it.title, why: it.why, ...(it.type === "question" && { options: it.options, default: it.default, placeholder: it.placeholder }) });
  if (actOne.some((it) => it.body?.some((b) => b.view === "screens"))) collect("screens", c.facts.screens);
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const [where, text] of texts) {
    for (const t of terms) if (new RegExp(`(?<![\\w/.@-])${escape(t)}(?![\\w/@-])`).test(text)) yield `act one, ${where}: names ${t}, a tech term of this plan. Say it in product words`;
    for (const code of text.match(/`[^`]+`/g) ?? []) yield `act one, ${where}: has the code span ${code}`;
  }
}

function* logLines(c: Context) {
  for (const [i, line] of (c.log ?? "").split("\n").entries()) {
    if (!line.trim()) continue;
    const where = `reviews/events.jsonl line ${i + 1}`;
    let event: unknown;
    try { event = JSON.parse(line); } catch (error) { yield `${where}: ${message(error)}`; continue; }
    const e = Event.safeParse(event);
    if (!e.success) yield `${where}: ${[...schemaProblems(e.error.issues[0])][0]}`;
    else if ("item" in e.data && !c.itemIds.has(e.data.item)) yield `${where}: item ${e.data.item} does not exist`;
  }
}

function* ddl(c: Context) {
  if (c.ddlError) yield c.ddlError;
}

function* tableMarks(c: Context) {
  if (!c.erd || !c.catalog) return;
  for (const t of c.erd.tables ?? []) {
    const before = c.catalog.baseTables.has(t.name);
    if (t.mark === "new" && before) yield `Data: table ${t.name} is marked new, and ${c.erd.base} already has it`;
    if (t.mark !== "new" && !before && c.catalog.tables.has(t.name)) yield `Data: table ${t.name} is marked ${t.mark}, and only ${c.erd.sql} creates it`;
  }
}

function* indexes(c: Context) {
  if (!c.erd || !c.catalog) return;
  for (const d of c.erd.indexes ?? []) {
    const index = c.catalog.indexes.get(d.name);
    if (!index) { yield `Data: index ${d.name} is not in the applied schema`; continue; }
    if (index.unique !== (d.unique ?? false)) yield `Data: index ${d.name} is ${index.unique ? "" : "not "}unique in ${c.erd.sql}, and the plan says otherwise`;
    const declared = d.where ? c.catalog.declaredWhere.get(d.name) ?? null : null;
    if (declared !== index.where) yield `Data: index ${d.name} has ${index.where ? `WHERE ${index.where}` : "no WHERE"} in ${c.erd.sql}, and the plan says ${declared ? `WHERE ${declared}` : "no WHERE"}`;
  }
}

function* triggers(c: Context) {
  if (!c.chart || !c.drawn) return;
  const known = new Set(Object.keys(c.chart.triggers ?? {}));
  const untriggered = new Set(c.drawn.arrows.flatMap((label) => stepsOf(label, known).unknown));
  for (const s of untriggered) yield `Behavior: the chart step "${s}" has no trigger. Name the endpoint, event, job, ops tool or time that makes it happen`;
}

function* writes(c: Context) {
  const triggered = new Set(Object.values(c.chart?.triggers ?? {}).flatMap((t) => ("endpoint" in t ? [t.endpoint] : [])));
  for (const e of c.facts.endpoints ?? []) {
    if (WRITE_METHODS.has(e.method.toUpperCase()) && !triggered.has(e.id) && !e.noTransition) {
      yield `endpoint ${e.id} (${e.method} ${e.path}) writes, and no chart step names it as a trigger. Add it to a chart's triggers, or set noTransition to say why it moves no state`;
    }
  }
}

function* stored(c: Context) {
  const schemaKnown = !c.erd || c.catalog;
  for (const [state, column] of Object.entries(c.chart?.stored ?? {})) {
    if (schemaKnown && !columnExists(c, column)) yield `Behavior: the state "${state}" is stored in ${column}, which is not in the applied schema`;
  }
}

function* renders(c: Context) {
  for (const s of c.facts.screens ?? []) {
    if (!s.regions.some((r) => r.component)) yield `screen ${s.id} (${s.label}): no region names the component that renders it`;
  }
}

function* reuses(c: Context) {
  for (const comp of c.facts.components ?? []) {
    if (comp.mark !== "reused") continue;
    const root = comp.repo ? c.m.repos?.[comp.repo] : undefined;
    if (!root || !comp.file) yield `component ${comp.id} (${comp.name}) is reused, so it needs a repo and a file to show it exists`;
    else if (!existsSync(resolve(c.dir, root, comp.file))) yield `component ${comp.id} (${comp.name}) is reused, and ${comp.repo} has no ${comp.file}`;
  }
}

/** Each test proves a row. Each but a `live` test names the one file that holds it and the command that runs it, so the build runs
 *  the list as written. A `live` test is a check run by hand: its `says` is the instruction, and its evidence goes in the PR. */
function* tests(c: Context) {
  for (const t of c.facts.tests ?? []) {
    if (!t.proves.length) yield `test ${t.id} proves no acceptance row`;
    if (t.type === "live") continue;
    if (!t.run?.trim()) yield `test ${t.id} has no run command. Give the command that runs this one test`;
    if (!t.file?.trim()) yield `test ${t.id} has no file. Name the one file that holds it`;
    else if (!isOneFile(t.file)) yield `test ${t.id}: "${t.file}" is not one file. Name the one file that holds it`;
  }
}

const isOneFile = (path: string) => !/[\s,]/.test(path) && /\.[^./]+$/.test(path);

/** One function per rule. `schema` runs before the context exists, in `check`. */
const CHECKS: Record<Exclude<Rule, "schema">, (c: Context) => Iterable<string>> = {
  id: ids,
  ref: refs,
  cite: cites,
  section: sections,
  touch: touches,
  jargon,
  log: logLines,
  ddl,
  "table-mark": tableMarks,
  index: indexes,
  trigger: triggers,
  write: writes,
  stored,
  render: renders,
  reuse: reuses,
  test: tests,
};

function warningsOf(c: Context): string[] {
  const f = c.facts, out: string[] = [];
  const servedBy = (r: string) => [...(f.endpoints ?? []), ...(f.components ?? [])].some((x) => x.serves?.includes(r))
    || (c.erd?.tables ?? []).some((t) => t.serves?.includes(r)) || (c.erd?.columns ?? []).some((col) => col.serves.includes(r));
  for (const r of c.reqs) if (!servedBy(r)) out.push(`trace hole: ${r} has no endpoint, component, table or column that serves it`);
  for (const r of c.reqs) if (!(f.acceptance ?? []).some((a) => a.requirement === r)) out.push(`trace hole: ${r} has no acceptance row`);
  for (const comp of f.components ?? []) if (!comp.serves?.length) out.push(`trace hole: component ${comp.name} serves no requirement`);
  for (const [rule, rs] of Object.entries(c.chart?.serves ?? {})) if (!rs.length && !c.chart?.hide?.includes(rule)) out.push(`trace hole: rule ${rule} guards no requirement`);
  for (const a of f.acceptance ?? []) {
    if (!a.requirement) out.push(`trace hole: acceptance ${a.id} checks no requirement`);
    if (!(f.tests ?? []).some((t) => t.proves.includes(a.id))) out.push(`trace hole: acceptance ${a.id} has no test`);
  }
  const gates = c.items.filter((i) => i.type === "grant" || ("touches" in i && i.touches.length > 0));
  if (gates.length > MAX_GATES) out.push(`${gates.length} gates, above ${MAX_GATES}: ${gates.map((g) => g.title).join(", ")}`);
  const over = (what: string, text: string | undefined, cap: number) => {
    if (text && words(text) > cap) out.push(`budget: ${what} runs to ${words(text)} words, over ${cap}. Cut it, or move the detail to plan.md`);
  };
  for (const i of c.items) over(`${i.id} why`, i.why, BUDGET.why);
  for (const comp of f.components ?? []) over(`component ${comp.id} does`, comp.does, BUDGET.does);
  for (const p of f.prs ?? []) { over(`${p.id} review`, p.review, BUDGET.review); over(`${p.id} note`, p.note, BUDGET.prNote); }
  for (const t of f.tests ?? []) over(`test ${t.id} says`, t.says, BUDGET.says);
  for (const i of c.items) for (const b of i.body ?? []) {
    if ("note" in b) over(`${i.id} ${b.view} note`, b.note, BUDGET.note);
    if (b.view === "statechart") for (const r of b.runs ?? []) over(`run ${r.id} note`, r.note, BUDGET.note);
  }
  return out;
}

export async function check(dir: string): Promise<Report> {
  const file = resolve(dir, "sign-off.json");
  const failed = (messages: string[], summary: string): Report => ({ errors: messages.map((message) => ({ rule: "schema", message })), warnings: [], summary });
  if (!existsSync(file)) return failed([`no sign-off.json in ${dir}`], "not checked");
  let json: unknown;
  try { json = JSON.parse(readFileSync(file, "utf8")); } catch (error) { return failed([`sign-off.json is not JSON: ${message(error)}`], "not checked"); }
  const parsed = Manifest.safeParse(json);
  if (!parsed.success) return failed(parsed.error.issues.flatMap((issue) => [...schemaProblems(issue)]), "schema errors");

  const c = await contextOf(dir, parsed.data);
  const errors = Object.entries(CHECKS).flatMap(([rule, run]) => [...run(c)].map((message) => ({ rule: rule as Rule, message })));
  const gates = c.items.filter((i) => i.type === "grant" || ("touches" in i && i.touches.length > 0));
  const asked = c.items.filter((i) => i.type === "question"), blocking = asked.filter((q) => q.default === null);
  return { errors, warnings: warningsOf(c), summary: `${c.items.length} items, ${gates.length} gates, ${asked.length} questions (${blocking.length} blocking)` };
}

/** Prints the short report and returns the exit code: 1 on any error. */
export const USAGE = "usage: sign-off check (<plan-dir> | --selftest)";

export async function runCheck([planDir, ...rest]: string[]): Promise<number> {
  if (!planDir || rest.length > 0) {
    console.error(USAGE);
    return 2;
  }
  const r = await check(resolve(planDir));
  console.log(`check ${planDir}: ${r.summary}`);
  for (const e of r.errors) console.log(`error ${e.rule}: ${e.message}`);
  for (const w of r.warnings) console.log(`warn  ${w}`);
  console.log(`${r.errors.length} errors, ${r.warnings.length} warnings`);
  return r.errors.length ? 1 : 0;
}
