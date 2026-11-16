/** The plan's database change. `sql` is the Postgres DDL and the source; `src` is DBML drawn from it for the picture. With `sql`,
 *  the rules apply `base` and then `sql` to an empty Postgres and compare the plan's tables and indexes with what it built. */
import { PGlite } from "@electric-sql/pglite";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { z } from "zod";
import { defineType, type RuleFinding } from "../artifact.ts";
import { FileRef, type NamedFile, type Read } from "../fileref.ts";
import { canon } from "../rev.ts";
import { ids, Mark, marked } from "./shared.ts";

const Index = z.strictObject({ name: z.string(), unique: z.boolean().optional(), where: z.string().optional(), serves: ids.optional() });

export const DbSchema = z.strictObject({
  src: FileRef,                                                                     // DBML, derived from `sql` for the drawing only
  sql: FileRef.optional(),                                                          // Postgres DDL, and the source. `ddl`, `table-mark` and `index` run only with it
  base: FileRef.optional(),                                                         // the baseline DDL that `sql` applies to
  tables: z.array(z.strictObject({ name: z.string(), mark: Mark, role: z.string().optional(), serves: ids.optional() })).optional(),
  indexes: z.array(Index).optional(),                                               // as the applied schema must have them
  says: z.string().optional(),
  writers: z.array(z.strictObject({ column: z.string(), states: z.array(z.string()) })).optional(),
  columns: z.array(z.strictObject({ column: z.string(), serves: ids })).optional(),
  unused: z.array(z.strictObject({ value: z.string(), why: z.string() })).optional(),  // enum values that serve nothing
  loose: z.array(z.strictObject({ from: z.string(), to: z.string() })).optional(),     // joins by id with no foreign key
});
export type DbSchema = z.infer<typeof DbSchema>;
type Index = z.infer<typeof Index>;

/** The applied schema, read from Postgres's catalog. Tables map to their columns. */
export type Catalog = {
  tables: Map<string, Set<string>>;
  baseTables: Set<string>;
  indexes: Map<string, { table: string; unique: boolean; where: string | null }>;
  /** Each declared `where`, as Postgres prints it, so it compares with the catalog's. */
  declaredWhere: Map<string, string>;
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Applies `base`, then `sql`, to an empty Postgres in WASM, and reads tables, columns and indexes back from the catalog. */
async function applySchema(base: { ref: string; text: string } | null, sql: { ref: string; text: string }, declared: Index[]): Promise<Catalog | string> {
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

const applied = new Map<string, Promise<Catalog | string>>();

/** The applied schema, or why the DDL does not apply. Null without `sql`, or when a file it names is missing, which the runner's
 *  `file` rule reports. The type tier and the plan tier both read it in one check, so it is built once per text. */
export function appliedSchema(schema: DbSchema, read: Read): Promise<Catalog | string> | null {
  if (!schema.sql) return null;
  const sql = read(schema.sql), base = schema.base ? read(schema.base) : null;
  if (sql === null || (schema.base && base === null)) return null;
  const key = canon([schema.sql, sql, schema.base ?? null, base, schema.indexes ?? []]);
  // yagni: kept for the life of the process, which checks one plan; key by plan folder if a long-lived host checks many.
  if (!applied.has(key)) {
    applied.set(key, applySchema(schema.base && base !== null ? { ref: schema.base, text: base } : null, { ref: schema.sql, text: sql }, schema.indexes ?? []));
  }
  return applied.get(key)!;
}

function* tableMarks(schema: DbSchema, catalog: Catalog) {
  for (const t of schema.tables ?? []) {
    const before = catalog.baseTables.has(t.name);
    if (t.mark === "new" && before) yield `Data: table ${t.name} is marked new, and ${schema.base} already has it`;
    if (t.mark !== "new" && !before && catalog.tables.has(t.name)) yield `Data: table ${t.name} is marked ${t.mark}, and only ${schema.sql} creates it`;
  }
}

function* indexes(schema: DbSchema, catalog: Catalog) {
  for (const d of schema.indexes ?? []) {
    const index = catalog.indexes.get(d.name);
    if (!index) { yield `Data: index ${d.name} is not in the applied schema`; continue; }
    if (index.unique !== (d.unique ?? false)) yield `Data: index ${d.name} is ${index.unique ? "" : "not "}unique in ${schema.sql}, and the plan says otherwise`;
    const declared = d.where ? catalog.declaredWhere.get(d.name) ?? null : null;
    if (declared !== index.where) yield `Data: index ${d.name} has ${index.where ? `WHERE ${index.where}` : "no WHERE"} in ${schema.sql}, and the plan says ${declared ? `WHERE ${declared}` : "no WHERE"}`;
  }
}

/** The tables and columns the data names that the applied schema lacks. */
function* refs(schema: DbSchema, catalog: Catalog) {
  const columnExists = (ref: string) => {
    const [table, column] = ref.split(".");
    const columns = catalog.tables.get(table);
    return !!columns && (column === "*" || columns.has(column));
  };
  for (const t of schema.tables ?? []) if (!catalog.tables.has(t.name)) yield `Data: table ${t.name} does not exist`;
  for (const col of [...(schema.columns ?? []), ...(schema.writers ?? [])]) {
    if (!columnExists(col.column)) yield `Data: column ${col.column} is not in the applied schema`;
  }
  for (const l of schema.loose ?? []) for (const col of [l.from, l.to]) if (!columnExists(col)) yield `Data loose join: column ${col} is not in the applied schema`;
}

export default defineType({
  type: "db-schema",
  v: 1,
  schema: DbSchema,
  files: (schema): NamedFile[] => [
    { ref: schema.src, derived: schema.sql !== undefined },
    ...(schema.sql ? [{ ref: schema.sql }] : []),
    ...(schema.base ? [{ ref: schema.base }] : []),
  ],
  rules: async (schema, { read }): Promise<RuleFinding[]> => {
    const applied = await appliedSchema(schema, read);
    if (applied === null) return [];
    if (typeof applied === "string") return [{ rule: "ddl", message: applied }];
    const as = (rule: string) => (message: string) => ({ rule, message });
    return [
      ...[...tableMarks(schema, applied)].map(as("table-mark")),
      ...[...indexes(schema, applied)].map(as("index")),
      ...[...refs(schema, applied)].map(as("ref")),
    ];
  },
  facts: (schema) => ((schema.tables ?? []).some(marked) ? { schema: { tables: schema.tables, indexes: schema.indexes ?? [] } } : {}),
});
