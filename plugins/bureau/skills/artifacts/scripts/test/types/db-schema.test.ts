import { expect, test } from "bun:test";
import { appendFileSync, cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { check } from "../../check.ts";
import { planReader } from "../../fileref.ts";
import { artifactRev } from "../../rev.ts";
import dbSchema, { DbSchema } from "../../types/db-schema.ts";
import { artifact, FIXTURE, fixtureData, noFiles, PLAN, planDir } from "../helpers.ts";

const block: DbSchema = fixtureData("db-schema");

function planWith(data: unknown, edit?: (dir: string) => void): string {
  const dir = planDir({ "plan.json": PLAN, "artifacts/schema.json": artifact("db-schema", data as object) });
  cpSync(join(FIXTURE, "design"), join(dir, "design"), { recursive: true });
  edit?.(dir);
  return dir;
}

async function findings(dir: string): Promise<string[]> {
  const report = await check(dir);
  return [...report.errors, ...report.warnings].filter((f) => f.artifact === "schema").map((f) => `${f.rule}: ${f.message}`);
}

test("the fixture's schema parses whole, and its DDL applies with every declared table and index as the plan says", async () => {
  expect(DbSchema.parse(block)).toEqual(block);
  expect(await findings(planWith(block))).toEqual([]);
});

test("DDL that does not apply to the base is a ddl error, and nothing else is checked against it", async () => {
  const dir = planWith(block, (d) => appendFileSync(join(d, "design/db.sql"), "\nALTER TABLE shelves ADD COLUMN x int;\n"));
  const found = await findings(dir);
  expect(found).toHaveLength(1);
  expect(found[0]).toStartWith("ddl: design/db.sql does not apply to design/base.sql: ");
});

test("a table mark, an index or a column that disagrees with the applied schema is an error", async () => {
  const data: DbSchema = {
    ...block,
    tables: [
      ...block.tables!.map((t) => (t.name === "books" ? { ...t, mark: "new" as const } : t.name === "book_holds" ? { ...t, mark: "reused" as const } : t)),
      { name: "shelves", mark: "reused" },
    ],
    indexes: [
      ...block.indexes!.map((i) => i.name === "book_holds_queue" ? { ...i, unique: true }
        : i.name === "book_holds_one_per_shelved_copy" ? { ...i, where: "status = 'waiting'" } : i),
      { name: "book_holds_by_member" },
    ],
    columns: [...block.columns!, { column: "book_holds.nope", serves: ["R1"] }],
    loose: [{ from: "book_holds.pickup_branch_id", to: "branches.code" }],
  };
  expect((await findings(planWith(data))).sort()).toEqual([
    "index: Data: index book_holds_by_member is not in the applied schema",
    "index: Data: index book_holds_one_per_shelved_copy has WHERE (status = 'on_shelf'::hold_status) in design/db.sql, and the plan says WHERE (status = 'waiting'::hold_status)",
    "index: Data: index book_holds_queue is not unique in design/db.sql, and the plan says otherwise",
    "ref: Data loose join: column branches.code is not in the applied schema",
    "ref: Data: column book_holds.nope is not in the applied schema",
    "ref: Data: table shelves does not exist",
    "table-mark: Data: table book_holds is marked reused, and only design/db.sql creates it",
    "table-mark: Data: table books is marked new, and design/base.sql already has it",
  ]);
});

test("with sql, the DBML only has to exist; without it, the DBML is the source and no rule reads the database", async () => {
  const rev = (data: DbSchema, edit?: (dir: string) => void) => artifactRev(data, dbSchema.files!(data), planReader(planWith(data, edit)));
  const touchDbml = (d: string) => appendFileSync(join(d, "design/schema.dbml"), "\nTable extra { id int }\n");

  expect(rev(block, touchDbml)).toBe(rev(block));
  expect(rev(block, (d) => appendFileSync(join(d, "design/db.sql"), "\nCREATE INDEX extra ON book_holds (pickup_by);\n"))).not.toBe(rev(block));
  expect(await findings(planWith(block, (d) => rmSync(join(d, "design/schema.dbml"))))).toEqual([
    "file: design/schema.dbml does not exist inside the plan folder",
  ]);

  const { sql: _, base: __, ...drawn } = block;
  const loose: DbSchema = { ...drawn, indexes: [{ name: "nowhere", unique: true }] };
  expect(rev(loose, touchDbml)).not.toBe(rev(loose));
  expect(await findings(planWith(loose))).toEqual([]);
});

test("a named base that is missing is a file error, and the DDL is not applied without it", async () => {
  const dir = planWith(block, (d) => rmSync(join(d, "design/base.sql")));
  expect(await findings(dir)).toEqual(["file: design/base.sql does not exist inside the plan folder"]);
});

test("a schema reports the schema fact only when it adds or changes a table", () => {
  expect(dbSchema.facts!(block, noFiles)).toEqual({ schema: { tables: block.tables, indexes: block.indexes } });
  expect(dbSchema.facts!({ ...block, tables: block.tables!.map((t) => ({ ...t, mark: "reused" as const })) }, noFiles)).toEqual({});
});
