import { expect, test } from "bun:test";
import { cpSync } from "node:fs";
import { join } from "node:path";
import { check } from "../check.ts";
import { artifact, FIXTURE, fixtureData, PLAN, planDir } from "./helpers.ts";

const requirements = (...ids: string[]) => artifact("requirements", {
  problem: "Readers wait at the desk.", users: [], goals: [], nonGoals: [], rollout: [],
  requirements: ids.map((id) => ({ id, title: `Need ${id}`, text: "A reader places a hold." })),
});
const endpoint = (id: string, more: object = {}) =>
  ({ id, method: "GET", path: "/holds", mark: "new", answers: "The holds.", who: { text: "A reader", mark: "reused" }, outcomes: [], serves: ["R1"], ...more });
const api = (...endpoints: object[]) => artifact("api", { endpoints });
const component = (id: string, more: object = {}) =>
  ({ id, name: `Part${id}`, role: "component", does: "Draws the hold line.", mark: "new", serves: ["R1"], ...more });
const row = (id: string, requirement: string | null, more: object = {}) => ({ id, requirement, says: "The hold shows.", ...more });
const testOf = (id: string, proves: string[]) => ({ id, type: "unit", name: `test ${id}`, proves, unit: "U1", says: "It holds." });

/** The plan tier's findings for a plan folder, each as `level rule artifact: message`. */
async function planFindings(files: Record<string, unknown>, edit?: (dir: string) => void): Promise<string[]> {
  const dir = planDir({ "plan.json": PLAN, ...files });
  edit?.(dir);
  const report = await check(dir);
  return [...report.errors, ...report.warnings].filter((f) => f.tier === "plan").map((f) => `${f.level} ${f.rule} ${f.artifact ?? "-"}: ${f.message}`);
}

test("a ref runs only when the plan has an artifact of the type it joins to", async () => {
  const files = { "artifacts/api.json": api(endpoint("E1", { serves: ["R9"] })) };
  expect(await planFindings(files)).toEqual([]);
  expect(await planFindings({ ...files, "artifacts/requirements.json": requirements("R1") })).toEqual([
    "error ref api: endpoint E1: requirement R9 does not exist",
    "warning trace requirements: trace hole: R1 has no endpoint, component, table or column that serves it",
  ]);
});

test("refs between artifacts name the artifact the broken reference sits in", async () => {
  expect(await planFindings({
    "artifacts/requirements.json": requirements("R1"),
    "artifacts/api.json": api(endpoint("E1")),
    "artifacts/components.json": artifact("components", { components: [component("C1", { reads: ["E1", "E7"], repo: "nowhere" })] }),
    "artifacts/acceptance.json": artifact("acceptance", { rows: [row("A1", "R1"), row("A2", "R4", { guards: "rule:Gone" })] }),
    "artifacts/test-plan.json": artifact("test-plan", { tests: [testOf("T1", ["A1", "A2", "A3"])] }),
  })).toEqual([
    "error ref components: component C1: endpoint E7 does not exist",
    "error ref components: component C1: repo nowhere does not exist",
    "error ref acceptance: acceptance A2: requirement R4 does not exist",
    "error ref test-plan: test T1: acceptance row A3 does not exist",
  ]);
});

test("an id appears once across the plan, and a repeat inside one artifact is left to its type", async () => {
  expect(await planFindings({
    "artifacts/requirements.json": requirements("R1"),
    "artifacts/api.json": api(endpoint("R1"), endpoint("E1"), endpoint("E1")),
  })).toEqual(["error id -: duplicate id R1: an endpoint in api and a requirement in requirements"]);
});

test("a plan has at most one artifact of each single-instance type", async () => {
  expect(await planFindings({
    "artifacts/acceptance.json": artifact("acceptance", { rows: [] }),
    "artifacts/acceptance-more.json": artifact("acceptance", { rows: [] }),
  })).toEqual(["error one -: a plan has at most one acceptance artifact, and this one has 2: acceptance-more, acceptance"]);
});

test("a write endpoint needs a chart trigger or a noTransition, once the plan has a chart", async () => {
  const chart = artifact("statechart", { says: {}, triggers: { "place hold": { endpoint: "E2" } } });
  const endpoints = api(endpoint("E1", { method: "post" }), endpoint("E2", { method: "POST" }), endpoint("E3", { method: "DELETE", noTransition: "It moves no state." }));
  expect(await planFindings({ "artifacts/api.json": endpoints })).toEqual([]);
  expect(await planFindings({ "artifacts/api.json": endpoints, "artifacts/statechart.json": chart })).toEqual([
    "error write api: endpoint E1 (post /holds) writes, and no chart step names it as a trigger. Add it to a chart's triggers, or set noTransition to say why it moves no state",
  ]);
});

test("a stored state and an endpoint body column must be in the applied schema", async () => {
  expect(await planFindings({
    "artifacts/db-schema.json": artifact("db-schema", { src: "schema.dbml", sql: "schema.sql" }),
    "schema.dbml": "Table holds { id int }",
    "schema.sql": "create table holds (id int primary key, state text);",
    "artifacts/statechart.json": artifact("statechart", { says: {}, stored: { waiting: "holds.state", ready: "holds.status" } }),
    "artifacts/api.json": api(endpoint("E1", { outcomes: [{ status: 200, when: "always", title: "The holds", body: [{ name: "id", type: "int", column: "holds.id" }, { name: "at", type: "date", column: "holds.at" }] }] })),
  })).toEqual([
    "error ref api: endpoint E1 200 at: column holds.at is not in the applied schema",
    "error stored statechart: Behavior: the state \"ready\" is stored in holds.status, which is not in the applied schema",
  ]);
});

test("a schema writer names a step the plan's chart draws", async () => {
  const chart = fixtureData("statechart");
  const drawn = Object.keys(chart.triggers)[0];
  const found = await planFindings({
    "artifacts/statechart.json": artifact("statechart", chart),
    "artifacts/db-schema.json": artifact("db-schema", { src: "schema.dbml", writers: [{ column: "holds.state", states: [drawn, "teleport"] }] }),
    "schema.dbml": "Table holds { state text }",
  }, (dir) => cpSync(join(FIXTURE, "statechart"), join(dir, "statechart"), { recursive: true }));
  expect(found.filter((f) => f.includes(" ref "))).toEqual([
    "error ref db-schema: Data: writer holds.state names the step \"teleport\", which no chart draws",
  ]);
});

test("a reused component's file must be in the repo plan.json names", async () => {
  const components = artifact("components", { components: [
    component("C1", { mark: "reused", repo: "shelf-web", file: "src/pager.tsx" }),
    component("C2", { mark: "reused", repo: "shelf-web", file: "src/gone.tsx" }),
  ] });
  expect(await planFindings({
    "plan.json": { ...PLAN, repos: { "shelf-web": "shelf-web" } }, "shelf-web/src/pager.tsx": "export {};", "artifacts/components.json": components,
  })).toEqual(["error reuse components: component C2 (PartC2) is reused, and shelf-web has no src/gone.tsx"]);
});

test("act one names no tech term the plan's other artifacts define", async () => {
  expect(await planFindings({
    "artifacts/requirements.json": requirements("R1"),
    "artifacts/components.json": artifact("components", { components: [component("C1", { name: "HoldQueue" })] }),
    "artifacts/screens.json": artifact("screens", { screens: [
      { id: "S1", screen: "holds", label: "Your holds", when: "A reader opens HoldQueue.", regions: [], serves: ["R1"] },
    ] }),
  })).toContain("error jargon screens: act one, screens[0].when: names HoldQueue, a tech term of this plan. Say it in product words");
});

test("trace warns on a requirement with no acceptance row and a row with no test", async () => {
  expect(await planFindings({
    "artifacts/requirements.json": requirements("R1", "R2"),
    "artifacts/acceptance.json": artifact("acceptance", { rows: [row("A1", "R1"), row("A2", "R1")] }),
    "artifacts/test-plan.json": artifact("test-plan", { tests: [testOf("T1", ["A1"])] }),
  })).toEqual([
    "warning trace requirements: trace hole: R2 has no acceptance row",
    "warning trace acceptance: trace hole: acceptance A2 has no test",
  ]);
});

test("a unit that waits to start gives a reason, waits name units, and no units wait on each other", async () => {
  const unit = (id: string, more: object = {}) => ({ id, title: `Unit ${id}`, ...more });
  const prPlan = (...units: { id: string }[]) => ({ "artifacts/pr-plan.json": artifact("pr-plan", { units, prs: [{ id: "P1", title: "P1", repo: "shelf-api",
    branch: "b", from: "develop", into: "develop", steps: units.map((u) => u.id), review: "A maintainer reviews it.", merge: { by: "human", why: "because" }, evidence: [] }] }) });
  expect(await planFindings(prPlan(unit("U0"), unit("U1", { mergesAfter: ["U0"] }),
    unit("U2", { mergesAfter: ["U1"], startsAfter: { units: ["U0"], reason: "U0 is a spike that picks the queue's key." } })))).toEqual([]);
  expect(await planFindings(prPlan(unit("U1", { mergesAfter: ["U9"] }), unit("U2", { startsAfter: { units: ["U1"], reason: " " } })))).toEqual([
    "error ref pr-plan: unit U1: unit U9 does not exist",
    "error order pr-plan: unit U2 starts after U1 with no reason. Name the contract that is not fixed yet, or use mergesAfter and start on stubs",
  ]);
  expect(await planFindings(prPlan(unit("U1", { mergesAfter: ["U3"] }), unit("U2", { mergesAfter: ["U1"] }),
    unit("U3", { startsAfter: { units: ["U2"], reason: "U2 is a spike." } })))).toEqual([
    "error order pr-plan: units wait on each other: U1 after U3 after U2 after U1",
  ]);
});
