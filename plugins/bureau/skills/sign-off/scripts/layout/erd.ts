/** The schema drawing, laid out at build time. Tables, columns and indexes come from Postgres's catalog after `base` and then
 *  `sql` apply, when the block has `sql`, and from the DBML otherwise. Reference: the frozen prototype's `views-erd.js`. */
import { PGlite } from "@electric-sql/pglite";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import type { ElkNode } from "elkjs/lib/elk-api.js";
import type { Mark } from "../model.ts";
import type { ErdInput } from "../views.ts";
import { type Box, elk, type Point } from "./elk.ts";
import { FONTS, textWidth } from "./text.ts";

/** `never` for a key or NOT NULL column. `unstated` is DBML that says neither `null` nor `not null`. */
export type Empty = "never" | "allowed" | "unstated";
/** `mark` compares the column with `base`; a column of a new table has none. */
export type ErdColumn = { name: string; type: string; short: string; empty: Empty; pk: boolean; default?: string; note?: string;
  mark?: "new" | "changed" };
export type ErdIndex = { name?: string; columns: string[]; unique: boolean; where?: string; note?: string };
export type ErdTable = { name: string; mark: Mark; note?: string; columns: ErdColumn[]; indexes: ErdIndex[]; checks: string[] };
/** `many` and `one` are foreign keys on `from` that point at `to`; `loose` joins by id with no key. `optional`: a `to` row can
 *  have no `from` rows, drawn as a circle on the crow's foot. */
export type ErdRelation = { id: string; from: string; fromCol: string; to: string; toCol: string; kind: "many" | "one" | "loose";
  optional: boolean };
export type ErdEnum = { name: string; values: { name: string; note?: string }[] };
/** One drawing. `rows` are the columns a box shows, in order; `toggle` adds the row that folds or opens the rest. Each relation's
 *  `points` start at its `from` end, where the crow's foot sits. */
export type ErdDrawing = {
  width: number; height: number;
  tables: (Box & { name: string; rows: string[]; toggle: boolean })[];
  relations: { id: string; points: Point[] }[];
};
/** `folded` shows a reused table's key and joined columns only; `open` shows every column. */
export type ErdLayout = { tables: ErdTable[]; relations: ErdRelation[]; enums: ErdEnum[]; drawings: { folded: ErdDrawing; open: ErdDrawing } };

type Read = (path: string) => string | null;
type Schema = Omit<ErdLayout, "drawings">;

const ROW = 26, HEAD = 40, FOOT = 6;
const MARK_WORD: Record<Mark, string> = { new: "New", changed: "Changed", reused: "Reused" };
const MAX_SPLITS = 200_000;

const text = (read: Read, path: string) => {
  const out = read(path);
  if (out === null) throw new Error(`${path} is missing`);
  return out;
};
const shortType = (type: string, empty: Empty, enums: Set<string>) =>
  (enums.has(type) ? "enum" : type.replace(/\(.*\)/, "")) + (empty === "allowed" ? "?" : "");
const optional = <K extends string, V>(key: K, value: V | null | undefined) =>
  (value === null || value === undefined ? {} : { [key]: value }) as Partial<Record<K, V>>;


type ColumnRow = { table: string; name: string; type: string; notNull: boolean; default: string | null; note: string | null };
/** Per table, each column's signature and every index and constraint definition, to mark what `sql` changed. */
type Shape = Map<string, { columns: Map<string, string>; defs: Set<string> }>;

const COLUMNS = `select c.relname as table, a.attname as name, a.attnotnull as "notNull",
    case when t.typtype = 'e' then t.typname else format_type(a.atttypid, a.atttypmod) end as type,
    pg_get_expr(d.adbin, d.adrelid) as default, col_description(c.oid, a.attnum) as note
  from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
  join pg_type t on t.oid = a.atttypid left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where n.nspname = 'public' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped order by c.oid, a.attnum`;
const DEFS = `select tablename as table, indexdef as def from pg_indexes where schemaname = 'public'
  union all select c.relname, pg_get_constraintdef(k.oid) from pg_constraint k join pg_class c on c.oid = k.conrelid
  join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'`;
const TABLES = `select c.relname as name, obj_description(c.oid, 'pg_class') as note from pg_class c
  join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') order by c.oid`;
const CONSTRAINTS = `select k.contype as kind, c.relname as table, pg_get_constraintdef(k.oid) as def, f.relname as "refTable",
    array(select a.attname from unnest(k.conkey) with ordinality u(n, o) join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.n order by u.o) as columns,
    array(select a.attname from unnest(k.confkey) with ordinality u(n, o) join pg_attribute a on a.attrelid = k.confrelid and a.attnum = u.n order by u.o) as "refColumns"
  from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
  left join pg_class f on f.oid = k.confrelid where n.nspname = 'public' and k.contype in ('p', 'u', 'f', 'c') order by c.oid, k.conname`;
const INDEXES = `select ic.relname as name, t.relname as table, i.indisunique as unique, pg_get_expr(i.indpred, i.indrelid) as where,
    array(select pg_get_indexdef(i.indexrelid, o::int, true) from generate_series(1, i.indnkeyatts) o) as columns
  from pg_index i join pg_class ic on ic.oid = i.indexrelid join pg_class t on t.oid = i.indrelid
  join pg_namespace n on n.oid = t.relnamespace where n.nspname = 'public' and not i.indisprimary order by t.oid, ic.relname`;
const ENUMS = `select t.typname as name, array(select e.enumlabel from pg_enum e where e.enumtypid = t.oid order by e.enumsortorder) as values
  from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype = 'e' order by t.oid`;

const signature = (c: ColumnRow) => `${c.type}|${c.notNull}|${c.default}`;

async function fromSql(sql: string, base: string | null): Promise<Schema> {
  const db = await PGlite.create({ extensions: { uuid_ossp } }); // yagni: the one extension check.ts loads
  const rows = async <R>(query: string) => (await db.query<R>(query)).rows;
  const shape = async (): Promise<Shape> => {
    const out: Shape = new Map();
    const of = (table: string) => out.get(table) ?? out.set(table, { columns: new Map(), defs: new Set() }).get(table)!;
    for (const c of await rows<ColumnRow>(COLUMNS)) of(c.table).columns.set(c.name, signature(c));
    for (const d of await rows<{ table: string; def: string }>(DEFS)) of(d.table).defs.add(d.def);
    return out;
  };
  try {
    if (base !== null) await db.exec(base);
    const before = await shape();
    await db.exec(sql);
    const after = await shape();
    const enums = (await rows<{ name: string; values: string[] }>(ENUMS)).map((e) => ({ name: e.name, values: e.values.map((name) => ({ name })) }));
    const enumNames = new Set(enums.map((e) => e.name));
    const constraints = await rows<{ kind: string; table: string; def: string; refTable: string | null; columns: string[]; refColumns: string[] }>(CONSTRAINTS);
    const indexes = await rows<{ name: string; table: string; unique: boolean; where: string | null; columns: string[] }>(INDEXES);
    const columns = await rows<ColumnRow>(COLUMNS);
    const keyed = (kind: string, table: string, column: string) =>
      constraints.some((k) => k.kind === kind && k.table === table && k.columns.length === 1 && k.columns[0] === column);
    const unique = (table: string, column: string) => keyed("p", table, column) || keyed("u", table, column)
      || indexes.some((i) => i.table === table && i.unique && i.where === null && i.columns.length === 1 && i.columns[0] === column);

    const tables = (await rows<{ name: string; note: string | null }>(TABLES)).map((t): ErdTable => {
      const old = before.get(t.name), now = after.get(t.name)!;
      const mine = columns.filter((c) => c.table === t.name).map((c): ErdColumn => {
        const empty: Empty = c.notNull ? "never" : "allowed";
        const was = old?.columns.get(c.name);
        const mark: ErdColumn["mark"] | null = !old ? null : was === undefined ? "new" : was !== signature(c) ? "changed" : null;
        return { name: c.name, type: c.type, short: shortType(c.type, empty, enumNames), empty, pk: keyed("p", t.name, c.name),
          ...optional("default", c.default), ...optional("note", c.note), ...optional("mark", mark) };
      });
      const changed = old && (mine.some((c) => c.mark) || [...now.defs].some((d) => !old.defs.has(d)) || [...old.defs].some((d) => !now.defs.has(d)));
      return {
        name: t.name, mark: !old ? "new" : changed ? "changed" : "reused", ...optional("note", t.note), columns: mine,
        indexes: indexes.filter((i) => i.table === t.name)
          .map((i) => ({ name: i.name, columns: i.columns, unique: i.unique, ...optional("where", i.where) })),
        checks: constraints.filter((k) => k.kind === "c" && k.table === t.name).map((k) => k.def),
      };
    });
    const relations = constraints.filter((k) => k.kind === "f" && k.columns.length === 1).map((k): ErdRelation => {
      const [fromCol] = k.columns, to = k.refTable!, [toCol] = k.refColumns;
      return { id: `${k.table}.${fromCol}>${to}.${toCol}`, from: k.table, fromCol, to, toCol,
        kind: unique(k.table, fromCol) ? "one" : "many", optional: true }; // Postgres cannot require a row to have children
    });
    return { tables, relations, enums };
  } finally {
    await db.close();
  }
}


type DbmlField = { name: string; type: { type_name: string }; pk?: boolean; unique?: boolean; not_null?: boolean;
  dbdefault?: { value: string | number | boolean; type: string }; note?: { value: string }; checks?: { expression: string }[] };
type DbmlTable = { name: string; fields: DbmlField[]; note?: { value: string }; checks?: { expression: string }[];
  indexes?: { name?: string; pk?: boolean; unique?: boolean; columns: { value: string; type: string }[]; note?: { value: string } }[] };
type Dbml = {
  tables: DbmlTable[];
  refs: { endpoints: { tableName: string; fieldNames: string[]; relation: string }[] }[];
  enums: { name: string; values: { name: string; note?: { value: string } }[] }[];
};

/** `@dbml/parse` holds a Bun process open once loaded, so it loads in a worker that ends with the parse. */
async function parseDbml(source: string, path: string): Promise<Dbml> {
  const worker = new Worker(new URL("./dbml.worker.ts", import.meta.url).href);
  try {
    const reply = await new Promise<{ dbml: Dbml | null; error?: string }>((resolve, reject) => {
      worker.onmessage = (event) => { if (event.data && "dbml" in event.data) resolve(event.data); };
      worker.onerror = (event) => reject(new Error(event.message));
      worker.postMessage(source);
    });
    if (!reply.dbml) throw new Error(`${path} is not valid DBML: ${reply.error}`);
    return reply.dbml;
  } finally {
    worker.terminate();
  }
}

function fromDbml(db: Dbml, declared: ErdInput["tables"]): Schema {
  const enumNames = new Set(db.enums.map((e) => e.name));
  const emptyOf = (f: DbmlField): Empty => (f.pk || f.not_null ? "never" : f.not_null === false ? "allowed" : "unstated");
  const defaultOf = (d: DbmlField["dbdefault"]) => d && (d.type === "string" ? `'${d.value}'` : String(d.value));
  const tables = db.tables.map((t): ErdTable => ({
    name: t.name, mark: declared?.find((d) => d.name === t.name)?.mark ?? "reused", ...optional("note", t.note?.value),
    columns: t.fields.map((f) => {
      const empty = emptyOf(f);
      return { name: f.name, type: f.type.type_name, short: shortType(f.type.type_name, empty, enumNames), empty, pk: !!f.pk,
        ...optional("default", defaultOf(f.dbdefault)), ...optional("note", f.note?.value) };
    }),
    indexes: (t.indexes ?? []).filter((i) => !i.pk).map((i) => ({ ...optional("name", i.name),
      columns: i.columns.map((c) => (c.type === "expression" ? `(${c.value})` : c.value)), unique: !!i.unique, ...optional("note", i.note?.value) })),
    checks: [...(t.checks ?? []), ...t.fields.flatMap((f) => f.checks ?? [])].map((c) => `CHECK (${c.expression})`),
  }));
  const relations = db.refs.flatMap((r): ErdRelation[] => {
    const [a, b] = r.endpoints, many = (e: typeof a) => e.relation.includes("*");
    if (!a || !b || a.fieldNames.length !== 1 || b.fieldNames.length !== 1) return []; // yagni: composite keys draw no line
    const [to, from] = many(a) && !many(b) ? [b, a] : [a, b];
    const fromCol = from.fieldNames[0], toCol = to.fieldNames[0];
    return [{ id: `${from.tableName}.${fromCol}>${to.tableName}.${toCol}`, from: from.tableName, fromCol, to: to.tableName, toCol,
      kind: many(from) || many(to) ? "many" : "one", optional: from.relation.startsWith("0") }];
  });
  const enums = db.enums.map((e) => ({ name: e.name, values: e.values.map((v) => ({ name: v.name, ...optional("note", v.note?.value) })) }));
  return { tables, relations, enums };
}


const end = (ref: string) => {
  const at = ref.lastIndexOf(".");
  return { table: ref.slice(0, at), column: ref.slice(at + 1) };
};

function looseOf(input: ErdInput): ErdRelation[] {
  return (input.loose ?? []).map(({ from, to }) => {
    const a = end(from), b = end(to);
    return { id: `${from}>${to}`, from: a.table, fromCol: a.column, to: b.table, toCol: b.column, kind: "loose", optional: true };
  });
}

/** Which layout column each table sits in. Layering by foreign key direction runs too wide to read, so this tries every split
 *  into k columns, k from 2 up: no foreign key inside a column, fewest relations that skip a column, then the shortest tallest
 *  column, then new tables leftmost. Past `MAX_SPLITS` tries it falls back to layering by key direction. */
function columnsOf(tables: ErdTable[], keys: ErdRelation[], height: (t: ErdTable) => number): Map<string, number> {
  const n = tables.length, at = new Map(tables.map((t, i) => [t.name, i]));
  const hard = keys.filter((r) => r.from !== r.to).map((r) => [at.get(r.from)!, at.get(r.to)!]);
  const h = tables.map((t) => height(t) + 24);
  for (let k = 2; k <= 4 && k ** n <= MAX_SPLITS; k++) {
    let best: { score: number; col: number[] } | null = null;
    for (let code = 0; code < k ** n; code++) {
      const col = tables.map((_, i) => Math.floor(code / k ** i) % k);
      if (hard.some(([a, b]) => col[a] === col[b])) continue;
      const skips = hard.filter(([a, b]) => Math.abs(col[a] - col[b]) > 1).length;
      const tall = Math.max(...Array.from({ length: k }, (_, c) => col.reduce((s, x, i) => s + (x === c ? h[i] : 0), 0)));
      const score = skips * 1e7 + tall * 100 + tables.reduce((s, t, i) => s + (t.mark === "new" ? col[i] : 0), 0);
      if (!best || score < best.score) best = { score, col };
    }
    if (best) return new Map(tables.map((t, i) => [t.name, best.col[i]]));
  }
  // yagni: a table pointed at by a key sits one column right of the deepest table pointing at it; a cycle breaks where the walk
  // meets it again. Fine for the dozen tables a plan draws; a real layering pass if plans grow past that.
  const depth = new Map<string, number>(), walking = new Set<string>();
  const depthOf = (name: string): number => {
    if (depth.has(name)) return depth.get(name)!;
    if (walking.has(name)) return 0;
    walking.add(name);
    const d = Math.max(0, ...keys.filter((r) => r.to === name && r.from !== name).map((r) => depthOf(r.from) + 1));
    depth.set(name, d);
    return d;
  };
  return new Map(tables.map((t) => [t.name, depthOf(t.name)]));
}

async function draw(schema: Schema, colOf: Map<string, number>, shown: (t: ErdTable) => ErdColumn[],
  foldable: (t: ErdTable) => boolean): Promise<ErdDrawing> {
  const size = (t: ErdTable) => {
    const head = textWidth(t.name, FONTS.tableHead) + textWidth(MARK_WORD[t.mark], FONTS.tag) + 56;
    const width = Math.max(200, head, ...shown(t).map((c) => textWidth(c.name, FONTS.column) + textWidth(c.short, FONTS.column) + 66));
    return { width, height: HEAD + (shown(t).length + (foldable(t) ? 1 : 0)) * ROW + FOOT };
  };
  const portY = (table: string, column: string) =>
    HEAD + shown(schema.tables.find((t) => t.name === table)!).findIndex((c) => c.name === column) * ROW + ROW / 2;
  type End = { table: string; column: string; side: "EAST" | "WEST" };
  const ends = (r: ErdRelation): [End, End] => {
    const from = { table: r.from, column: r.fromCol }, to = { table: r.to, column: r.toCol };
    return colOf.get(r.from)! < colOf.get(r.to)! ? [{ ...from, side: "EAST" }, { ...to, side: "WEST" }] : [{ ...to, side: "EAST" }, { ...from, side: "WEST" }];
  };
  const portId = (e: End) => `${e.table}.${e.column}:${e.side}`;
  const across = schema.relations.filter((r) => colOf.get(r.from) !== colOf.get(r.to));
  const graph: ElkNode = {
    id: "erd",
    layoutOptions: {
      "elk.algorithm": "layered", "elk.direction": "RIGHT", "elk.edgeRouting": "ORTHOGONAL", "elk.padding": "[top=20,left=28,bottom=20,right=20]",
      "elk.partitioning.activate": "true", "elk.layered.spacing.nodeNodeBetweenLayers": "56", "elk.layered.spacing.edgeNodeBetweenLayers": "24",
      "elk.spacing.nodeNode": "24", "elk.spacing.edgeEdge": "10", "elk.layered.spacing.edgeEdgeBetweenLayers": "10",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES", "elk.layered.nodePlacement.strategy": "SIMPLE",
    },
    children: schema.tables.map((t) => {
      const { width, height } = size(t);
      const mine = [...new Map(across.flatMap(ends).filter((e) => e.table === t.name).map((e) => [portId(e), e])).values()];
      return {
        id: t.name, width, height,
        layoutOptions: { "elk.portConstraints": "FIXED_POS", "elk.partitioning.partition": String(colOf.get(t.name)) },
        ports: mine.map((e) => ({ id: portId(e), x: e.side === "EAST" ? width : 0, y: portY(t.name, e.column), width: 0, height: 0,
          layoutOptions: { "elk.port.side": e.side } })),
      };
    }),
    edges: across.map((r) => { const [a, b] = ends(r); return { id: r.id, sources: [portId(a)], targets: [portId(b)] }; }),
  };
  const laid = await elk.layout(graph);
  const pos = new Map((laid.children ?? []).map((n) => [n.id, n]));
  const routed = new Map((laid.edges ?? []).map((e) => [e.id, e.sections?.[0]]));
  const relations = schema.relations.map((r) => {
    const s = routed.get(r.id);
    if (s) {
      const points = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map(({ x, y }) => ({ x, y }));
      return { id: r.id, points: colOf.get(r.from)! < colOf.get(r.to)! ? points : points.reverse() };
    }
    const a = pos.get(r.from)!, b = pos.get(r.to)!, gutter = Math.min(a.x!, b.x!) - 16;
    const ya = a.y! + portY(r.from, r.fromCol), yb = b.y! + portY(r.to, r.toCol);
    return { id: r.id, points: [{ x: a.x!, y: ya }, { x: gutter, y: ya }, { x: gutter, y: yb }, { x: b.x!, y: yb }] };
  });
  return {
    width: Math.ceil(laid.width!), height: Math.ceil(laid.height!),
    tables: schema.tables.map((t) => {
      const n = pos.get(t.name)!;
      return { name: t.name, x: n.x!, y: n.y!, width: n.width!, height: n.height!, rows: shown(t).map((c) => c.name), toggle: foldable(t) };
    }),
    relations,
  };
}

export async function layoutErd(input: ErdInput, read: Read): Promise<ErdLayout> {
  const schema = input.sql
    ? await fromSql(text(read, input.sql), input.base ? text(read, input.base) : null)
    : fromDbml(await parseDbml(text(read, input.src), input.src), input.tables);
  const tableNames = new Set(schema.tables.map((t) => t.name));
  const loose = looseOf(input).filter((r) => tableNames.has(r.from) && tableNames.has(r.to));
  const all = { ...schema, relations: [...schema.relations, ...loose] };
  const joined = (t: ErdTable) => new Set(all.relations.flatMap((r) => [r.from === t.name ? r.fromCol : null, r.to === t.name ? r.toCol : null]));
  const keyCols = (t: ErdTable) => t.columns.filter((c) => c.pk || joined(t).has(c.name));
  const foldable = (t: ErdTable) => t.mark !== "new" && keyCols(t).length < t.columns.length;
  const folded = (t: ErdTable) => (foldable(t) ? keyCols(t) : t.columns);
  const height = (t: ErdTable) => HEAD + (folded(t).length + (foldable(t) ? 1 : 0)) * ROW + FOOT;
  const colOf = columnsOf(all.tables, schema.relations, height);
  return {
    ...all,
    drawings: { folded: await draw(all, colOf, folded, foldable), open: await draw(all, colOf, (t) => t.columns, foldable) },
  };
}
