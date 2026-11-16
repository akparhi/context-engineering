import { expect, test } from "bun:test";
import { readdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { check } from "../check.ts";
import { FileRef, type NamedFile, planReader } from "../fileref.ts";
import { TYPES } from "../registry.ts";
import { artifactRev } from "../rev.ts";
import { FIXTURE, PLAN, planDir } from "./helpers.ts";

const ref = (path: string) => FileRef.parse(path);

test("a file path that leaves the plan folder is not a FileRef", () => {
  for (const path of ["../plan.md", "design/../../x.sql", "/etc/passwd", "plan.md#Scope", ""]) expect(FileRef.safeParse(path).success).toBe(false);
  expect(FileRef.safeParse("design/schema.dbml").success).toBe(true);
});

test("a symlink that points outside the plan folder reads as missing", () => {
  const outside = planDir({ "secret.md": "outside" });
  const dir = planDir({ "plan.json": PLAN });
  symlinkSync(join(outside, "secret.md"), join(dir, "linked.md"));
  expect(planReader(dir)("linked.md")).toBeNull();
});

test("artifactRev ignores key order, SQL comments and line breaks, and moves with the words", () => {
  const sql = (text: string) => planReader(planDir({ "db.sql": text }));
  const files: NamedFile[] = [{ ref: ref("db.sql") }];
  const rev = artifactRev({ a: 1, b: [2] }, files, sql("create table holds (id int);"));
  expect(artifactRev({ b: [2], a: 1 }, files, sql("-- the queue\ncreate table holds (\n  id int\n);\n"))).toBe(artifactRev({ a: 1, b: [2] }, files, sql("create table holds ( id int );")));
  expect(artifactRev({ a: 1, b: [2] }, files, sql("create table holds (id bigint);"))).not.toBe(rev);
  expect(artifactRev({ a: 2, b: [2] }, files, sql("create table holds (id int);"))).not.toBe(rev);
});

test("artifactRev moves when SQL gains whitespace where it had none, as compact and multiline DDL do", () => {
  const files: NamedFile[] = [{ ref: ref("db.sql") }];
  const rev = (text: string) => artifactRev({}, files, planReader(planDir({ "db.sql": text })));
  expect(rev("create table holds (id int);")).not.toBe(rev("create table holds (\n  id int\n);"));
});

test("artifactRev moves with every character of a quoted string, a comment marker or a run of spaces in it too", () => {
  const rev = (file: string, text: string) => artifactRev({}, [{ ref: ref(file) }], planReader(planDir({ [file]: text })));
  expect(rev("db.sql", "create table settings (value text default 'a--old');")).not.toBe(rev("db.sql", "create table settings (value text default 'a--new');"));
  expect(rev("db.sql", "insert into notes values ('a /* b */');")).not.toBe(rev("db.sql", "insert into notes values ('a /* c */');"));
  expect(rev("db.sql", "insert into notes values ('a    b');")).not.toBe(rev("db.sql", "insert into notes values ('a b');"));
  expect(rev("db.sql", "insert into notes values ('it''s -- b');")).not.toBe(rev("db.sql", "insert into notes values ('it''s -- c');"));
  expect(rev("db.sql", "create function f() returns int as $$ select 1 -- old\n $$;")).not.toBe(rev("db.sql", "create function f() returns int as $$ select 1 -- new\n $$;"));
  expect(rev("db.dbml", "Table a { id int [note: 'see http://old'] }")).not.toBe(rev("db.dbml", "Table a { id int [note: 'see http://new'] }"));
});

test("artifactRev still ignores a comment after a quoted string, and one between two comments", () => {
  const rev = (file: string, text: string) => artifactRev({}, [{ ref: ref(file) }], planReader(planDir({ [file]: text })));
  expect(rev("db.sql", "insert into notes values ('a'); -- old\n/* more */ select 1;")).toBe(rev("db.sql", "insert into notes values ('a'); select 1;"));
  expect(rev("db.dbml", "Table a { // old\n  id int [note: 'n'] /* x */ }")).toBe(rev("db.dbml", "Table a { id int [note: 'n'] }"));
  expect(rev("flow.mmd", "graph TD\n  %% old\n  a --> b")).toBe(rev("flow.mmd", "graph TD\n a --> b"));
});

test("artifactRev hashes only the section a heading names", () => {
  const md = (scope: string, other: string) => planReader(planDir({ "plan.md": `# Scope\n${scope}\n# Other\n${other}\n` }));
  const files: NamedFile[] = [{ ref: ref("plan.md"), heading: "Scope" }];
  expect(artifactRev({}, files, md("one", "x"))).toBe(artifactRev({}, files, md("one", "y")));
  expect(artifactRev({}, files, md("one", "x"))).not.toBe(artifactRev({}, files, md("two", "x")));
  expect(() => artifactRev({}, [{ ref: ref("plan.md"), heading: "Gone" }], md("one", "x"))).toThrow('no heading "Gone"');
});

test("check reports a missing plan.json, an unknown type and a wrong version, each by artifact", async () => {
  const dir = planDir({
    "artifacts/mystery.json": JSON.stringify({ type: "mystery", v: 1 }),
    "artifacts/grant.json": JSON.stringify({ type: "grant", v: 7 }),
    "artifacts/Bad_Name.json": JSON.stringify({ type: "grant", v: 1 }),
  });
  const report = await check(dir);
  const messages = report.errors.map((f) => `${f.artifact ?? "plan"}: ${f.message}`);
  expect(messages).toContain("plan: plan.json does not exist");
  expect(messages.some((m) => m.startsWith('mystery: type "mystery" is not one of'))).toBe(true);
  expect(messages).toContain("grant: v is 7, and grant is at v 1");
  expect(messages).toContain("Bad_Name: an artifact id is lowercase letters, digits and hyphens");
});

test("check rejects a plan.json with a field it does not own", async () => {
  const dir = planDir({ "plan.json": { ...PLAN, revision: "r8" } });
  const report = await check(dir);
  expect(report.errors.map((f) => f.message).join("\n")).toContain("plan.json");
});

test("--help prints usage and exits 0, on the bare command and after check; no command is a usage error", () => {
  const cli = (...args: string[]) => {
    const run = Bun.spawnSync([process.execPath, join(import.meta.dir, "../artifacts"), ...args]);
    return { code: run.exitCode, out: run.stdout.toString(), err: run.stderr.toString() };
  };
  expect(cli("--help")).toMatchObject({ code: 0, out: expect.stringMatching(/^usage: artifacts check <plan-dir> /) });
  expect(cli("check", "--help")).toMatchObject({ code: 0, out: expect.stringMatching(/^usage: artifacts check <plan-dir> /) });
  expect(cli()).toMatchObject({ code: 2, out: "", err: expect.stringContaining("usage: artifacts check") });
});

test("each fixture plan checks with no error, and the whole plan has an artifact of every type", async () => {
  const whole = await check(FIXTURE);
  expect(whole.errors).toEqual([]);
  const types = readdirSync(join(FIXTURE, "artifacts")).map((file) => JSON.parse(readFileSync(join(FIXTURE, "artifacts", file), "utf8")).type);
  expect(types.sort()).toEqual(Object.keys(TYPES).sort());
  expect((await check(join(FIXTURE, "../questions"))).errors).toEqual([]);
});
