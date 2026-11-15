import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ReportJson } from "../../../statechart/scripts/backends/report.ts";
import { check, type Rule, RULES } from "../check.ts";

const FIXTURE = resolve(import.meta.dir, "../../fixtures/plan");
const CLI = resolve(import.meta.dir, "../sign-off");

type Json = Record<string, any>;
type Mutation = { json?: (m: Json) => void; files?: Record<string, (text: string) => string> };
const copies: string[] = [];
afterAll(() => { for (const dir of copies) rmSync(dir, { recursive: true, force: true }); });

/** A fresh copy of the fixture plan with one mutation applied. */
function mutated({ json, files = {} }: Mutation) {
  const dir = mkdtempSync(join(tmpdir(), "sign-off-check-"));
  copies.push(dir);
  cpSync(FIXTURE, dir, { recursive: true });
  if (json) {
    const manifest = JSON.parse(readFileSync(join(dir, "sign-off.json"), "utf8"));
    json(manifest);
    writeFileSync(join(dir, "sign-off.json"), JSON.stringify(manifest));
  }
  for (const [path, edit] of Object.entries(files)) {
    const target = join(dir, path);
    const before = existsSync(target) ? readFileSync(target, "utf8") : "";
    const after = edit(before);
    if (after === before) throw new Error(`the mutation of ${path} changed nothing`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, after);
  }
  return dir;
}

const item = (m: Json, id: string) => m.items.find((i: Json) => i.id === id);
const block = (m: Json, view: string) => m.items.flatMap((i: Json) => i.body ?? []).find((b: Json) => b.view === view);
const component = (m: Json, id: string) => m.facts.components.find((c: Json) => c.id === id);
const testEntry = (m: Json, id: string) => m.facts.tests.find((t: Json) => t.id === id);
const PLAN_RUN = "statechart/out-plan/report.json";

const BREAKS: [Rule, string, Mutation][] = [
  ["schema", "an unknown kind", { json: (m) => { m.kind = "plan"; } }],
  ["schema", "a statechart block that names its chart by dir", { json: (m) => { item(m, "behavior").body[0] = { view: "statechart", dir: "statechart/out-plan", says: block(m, "statechart").says }; } }],
  ["id", "a risk reuses a requirement's id", { json: (m) => { m.facts.risks[0].id = "R1"; } }],
  ["ref", "a question blocks a unit that does not exist", { json: (m) => { item(m, "Q1").blocks = ["U9"]; } }],
  ["ref", "a step that ships in no pull request", { json: (m) => { m.facts.prs.find((p: Json) => p.steps.includes("U3")).steps = []; } }],
  ["ref", "the plan's report.json comes from another version of statechart", { files: { [PLAN_RUN]: (s) => s.replace('"v": 1', '"v": 2') } }],
  ["cite", "a subsection with text that no item cites", { files: { "plan.md": (s) => s.replace("## Components", "### Notes\n\nCancel is open to everyone.\n\n## Components") } }],
  ["section", "a change plan with no Pull requests section", {
    json: (m) => { m.items = m.items.filter((i: Json) => i.section !== "Pull requests"); },
    files: { "plan.md": (s) => s.replace("## Pull requests\n", "") },
  }],
  ["section", "a second grant", { json: (m) => { m.items.push({ ...item(m, "grant"), id: "grant2", title: "Second grant" }); } }],
  ["section", "a second statechart block", { json: (m) => { item(m, "behavior").body.push(structuredClone(block(m, "statechart"))); } }],
  ["touch", "Data drops the schema touch its new table implies", { json: (m) => { item(m, "data").touches = []; } }],
  ["touch", "a broken rule whose note says fixed still gates", { json: (m) => { block(m, "statechart").notes["plan:NoTurnSkipped"].verdict = "fixed"; item(m, "behavior").touches = []; } }],
  ["jargon", "the problem names a table", { json: (m) => { m.product.problem += " Each hold becomes a row in book_holds."; } }],
  ["log", "a review event with no fields", { files: { "reviews/events.jsonl": () => '{"type":"verdict"}\n' } }],
  ["ddl", "db.sql references a table the baseline lacks", { files: { "design/db.sql": (s) => s.replace("REFERENCES books (id)", "REFERENCES book (id)") } }],
  ["table-mark", "a baseline table marked new", { json: (m) => { block(m, "erd").tables.find((t: Json) => t.name === "copies").mark = "new"; } }],
  ["index", "a partial index loses its predicate", { files: { "design/db.sql": (s) => s.replace(" WHERE status = 'on_shelf'", "") } }],
  ["trigger", "a chart step with no trigger", { json: (m) => { delete block(m, "statechart").triggers["three days pass"]; } }],
  ["write", "a write endpoint no chart step names", { json: (m) => { block(m, "statechart").triggers["a member places a hold"] = { event: "a kiosk message" }; } }],
  ["stored", "a stored state whose column is missing", { json: (m) => { block(m, "statechart").stored["On the hold shelf"] = "book_holds.shelf_id"; } }],
  ["render", "a screen state no component renders", { json: (m) => { for (const r of m.facts.screens[1].regions) delete r.component; } }],
  ["reuse", "a reused component whose file is gone", { json: (m) => { component(m, "C6").file = "src/components/filters.tsx"; } }],
  ["test", "a test with no run command", { json: (m) => { delete testEntry(m, "T3").run; } }],
  ["test", "a test with no file", { json: (m) => { delete testEntry(m, "T4").file; } }],
  ["test", "a test whose file is a folder", { json: (m) => { testEntry(m, "T5").file = "test/desk/"; } }],
  ["test", "a test that proves no row", { json: (m) => { testEntry(m, "T6").proves = []; } }],
];

/** Changes that check must accept. */
const PASSES: [string, Mutation][] = [
  ["a step that adds go.mod and declares dependency", { json: (m) => { item(m, "U1").files.push("go.mod"); item(m, "U1").touches.push("dependency"); } }],
  ["a step that starts a job acting alone and declares authority", { json: (m) => { item(m, "U1").touches.push("authority"); } }],
  ["a Data block with no sql, so no Postgres runs", { json: (m) => { delete block(m, "erd").sql; } }],
  ["a fenced line that starts with # inside a cited section", { files: { "plan.md": (s) => s.replace("## Components", "```sh\n# call it\n```\n\n## Components") } }],
];

describe("check", () => {
  test("the fixture passes with only the loose ends it plants", async () => {
    const r = await check(FIXTURE);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([
      "trace hole: rule PickupWindowKept guards no requirement",
      "trace hole: acceptance A9 checks no requirement",
      "trace hole: acceptance A9 has no test",
    ]);
  });

  test("every rule has a case that breaks it", () => {
    expect(new Set(BREAKS.map(([rule]) => rule))).toEqual(new Set(RULES));
  });

  // Each case starts its own Postgres in WASM, about 0.7 s of one CPU, so they run in turn.
  test.each(BREAKS)("%s fails on %s", async (rule, _name, mutation) => {
    const r = await check(mutated(mutation));
    expect([...new Set(r.errors.map((e) => e.rule))]).toEqual([rule]);
  }, 15_000);

  test.each(PASSES)("passes %s", async (_name, mutation) => {
    expect((await check(mutated(mutation))).errors).toEqual([]);
  }, 15_000);

  test("statechart's report.json for the plan carries the chart that check reads", () => {
    const report: ReportJson = JSON.parse(readFileSync(join(FIXTURE, PLAN_RUN), "utf8"));
    const manifest = JSON.parse(readFileSync(join(FIXTURE, "sign-off.json"), "utf8"));
    const chart = block(manifest, "statechart");
    expect(report.v).toBe(1);
    const states = new Set(report.chart?.states.map((s) => s.path.at(-1)));
    for (const state of Object.keys(chart.stored)) expect(states).toContain(state);
    expect(report.chart?.arrows.length).toBeGreaterThan(0);
    expect(report.rules.find((r) => r.name === "NoTurnSkipped")?.outcome).toBe("broken");
  });

  test("a changed index predicate fails as well as a removed one", async () => {
    const dir = mutated({ files: { "design/db.sql": (s) => s.replace("WHERE status = 'waiting'", "WHERE status = 'paused'") } });
    expect((await check(dir)).errors.map((e) => e.rule)).toEqual(["index"]);
  });

  test("a header link that is not http or https fails and names its field", async () => {
    const r = await check(mutated({ json: (m) => { m.ticket = "javascript:alert(1)"; m.sources[0].url = "data:text/html,x"; } }));
    expect(r.errors.map((e) => e.message)).toEqual([
      "ticket: must be an http or https URL",
      "sources[0].url: must be an http or https URL",
    ]);
  });

  test("a test that is not full names each part it lacks, and a live check needs neither", async () => {
    const r = await check(mutated({ json: (m) => { delete testEntry(m, "T3").run; delete testEntry(m, "T3").file; testEntry(m, "T4").file = "test/holds/place.test.ts, test/holds/cancel.test.ts"; } }));
    expect(r.errors.map((e) => e.message)).toEqual([
      "test T3 has no run command. Give the command that runs this one test",
      "test T3 has no file. Name the one file that holds it",
      'test T4: "test/holds/place.test.ts, test/holds/cancel.test.ts" is not one file. Name the one file that holds it',
    ]);
  });

  test("more than 7 gates warns", async () => {
    const r = await check(mutated({ json: (m) => { item(m, "units").touches = ["data-migration"]; } }));
    expect(r.errors).toEqual([]);
    expect(r.warnings.at(-1)).toStartWith("8 gates, above 7:");
  });
});

describe("the check command", () => {
  const run = (...args: string[]) => {
    const p = Bun.spawnSync([CLI, ...args]);
    return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
  };

  test("exits 0 on the fixture", () => {
    expect(run("check", FIXTURE).code).toBe(0);
  });

  test("exits 1 and prints each error with its rule", () => {
    const { code, out } = run("check", mutated(BREAKS.find(([rule]) => rule === "reuse")![2]));
    expect(code).toBe(1);
    expect(out).toContain("error reuse: component C6 (SearchFilters) is reused, and shelf-web has no src/components/filters.tsx");
    expect(out).toContain("1 errors, 3 warnings");
  });

  test("exits 2 with only its own usage line on a missing plan folder", () => {
    const { code, err } = run("check");
    expect(code).toBe(2);
    expect(err).toBe("usage: sign-off check (<plan-dir> | --selftest)\n");
  });

  test("exits 2 and lists every command on an unknown command", () => {
    const { code, err } = run("draw");
    expect(code).toBe(2);
    expect(err.match(/^usage: sign-off \w+/gm)).toEqual(["usage: sign-off check", "usage: sign-off ingest", "usage: sign-off status", "usage: sign-off record", "usage: sign-off revise", "usage: sign-off open", "usage: sign-off stop", "usage: sign-off build"]);
  });
});
