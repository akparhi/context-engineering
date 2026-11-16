import { expect, test } from "bun:test";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { check } from "../../check.ts";
import { planReader } from "../../fileref.ts";
import { artifactRev } from "../../rev.ts";
import chart, { Statechart } from "../../types/statechart.ts";
import { artifact, FIXTURE, fixtureData, PLAN, planDir } from "../helpers.ts";

const block: Statechart = fixtureData("statechart");

function planWith(data: unknown, edit?: (dir: string) => void): string {
  const dir = planDir({ "plan.json": PLAN, "artifacts/chart.json": artifact("statechart", data as object) });
  cpSync(join(FIXTURE, "statechart"), join(dir, "statechart"), { recursive: true });
  edit?.(dir);
  return dir;
}

async function findings(dir: string): Promise<string[]> {
  const report = await check(dir);
  return [...report.errors, ...report.warnings].filter((f) => f.artifact === "chart").map((f) => `${f.level} ${f.rule}: ${f.message}`);
}

const editJson = (file: string, change: (json: any) => void) => {
  const json = JSON.parse(readFileSync(file, "utf8"));
  change(json);
  writeFileSync(file, JSON.stringify(json, null, 2));
};

test("the fixture's chart parses whole and checks clean, but for an unhidden rule that guards nothing", async () => {
  expect(Statechart.parse(block)).toEqual(block);
  expect(await findings(planWith(block))).toEqual(["warning trace: trace hole: rule PickupWindowKept guards no requirement"]);
});

test("a rule, run or step the chart does not have is a ref error, and a drawn step with no trigger is a trigger error", async () => {
  const { "the copy comes back": _, ...triggers } = block.triggers ?? {};
  const data: Statechart = {
    ...block,
    serves: { ...block.serves, Ghost: ["R1"] },
    hide: [...(block.hide ?? []), "Hidden"],
    parked: { ...block.parked, Parked: "later" },
    notes: { ...block.notes, "plan:Noted": { verdict: "fixed", text: "x" }, "gone:TypeOK": { verdict: "fixed", text: "x" }, bare: { verdict: "fixed", text: "x" } },
    triggers: { ...triggers, "a step nobody draws": { job: "the night run" } },
    stored: { ...block.stored, Nowhere: "book_holds.status" },
    runs: [...(block.runs ?? []), { ...block.runs![1] }],
  };
  const found = await findings(planWith(data));
  expect(found).toEqual(expect.arrayContaining([
    "error ref: Behavior: serves names the rule Ghost, which says does not define",
    "error ref: Behavior: hide names the rule Hidden, which says does not define",
    "error ref: Behavior: parked names the rule Parked, which says does not define",
    'error ref: Behavior: the note "plan:Noted" names the rule Noted, which says does not define',
    'error ref: Behavior: the note "gone:TypeOK" names the run gone, which runs does not have',
    'error ref: Behavior: the note "bare" is not <run>:<rule>',
    'error ref: Behavior: triggers names the step "a step nobody draws", which the chart does not draw',
    'error ref: Behavior: stored names the state "Nowhere", which the chart does not draw',
    'error trigger: Behavior: the chart step "the copy comes back" has no trigger. Name the endpoint, event, job, ops tool or time that makes it happen',
    "error id: duplicate id draft: two runs",
  ]));
  expect(found.filter((f) => f.startsWith("error"))).toHaveLength(10);
});

test("the first run's report must be version 1, and every run's report must be JSON", async () => {
  const dir = planWith(block, (d) => {
    editJson(join(d, "statechart/out-plan/report.json"), (json) => { json.v = 2; });
    writeFileSync(join(d, "statechart/out-draft/report.json"), "{ not json");
  });
  const found = await findings(dir);
  expect(found).toContain("error ref: Behavior: statechart/out-plan/report.json has version 2, and check reads version 1. Run statechart again");
  expect(found.some((f) => f.startsWith("error ref: Behavior: statechart/out-draft/report.json is not JSON:"))).toBe(true);
});

test("a report.json that is JSON but not a statechart report is a ref error, and check and open-rule still finish", async () => {
  const dir = planWith(block, (d) => {
    writeFileSync(join(d, "statechart/out-plan/report.json"), "null");
    editJson(join(d, "statechart/out-draft/report.json"), (json) => { delete json.rules; json.chart.arrows = {}; });
  });
  const found = await findings(dir);
  for (const run of ["out-plan", "out-draft"]) {
    expect(found.filter((f) => f.startsWith(`error ref: Behavior: statechart/${run}/report.json is not a statechart report:`))).toHaveLength(1);
  }
  expect(chart.facts!(block, { read: planReader(dir) })).toEqual({ "open-rule": expect.objectContaining({ rules: null }) });
});

test("a run with no report.json fails, and a run with no report.md does not", async () => {
  const dir = planWith(block, (d) => {
    rmSync(join(d, "statechart/out-draft/report.json"));
    rmSync(join(d, "statechart/out-plan/report.md"));
  });
  expect((await findings(dir)).filter((f) => f.startsWith("error"))).toEqual([
    "error file: statechart/out-draft/report.json does not exist inside the plan folder",
  ]);
});

test("the rev ignores the order of the chart's states and arrows and all of report.md but its TLC line", () => {
  const rev = (edit?: (dir: string) => void) => {
    const dir = planWith(block, edit);
    return artifactRev(block, chart.files!(block), planReader(dir));
  };
  const report = (d: string) => join(d, "statechart/out-plan/report.json");
  const md = (d: string) => join(d, "statechart/out-plan/report.md");
  const base = rev();
  expect(rev((d) => editJson(report(d), (json) => { json.chart.states.reverse(); json.chart.arrows.reverse(); }))).toBe(base);
  expect(rev((d) => writeFileSync(md(d), readFileSync(md(d), "utf8").replace("# HoldQueue", "# Hold queue")))).toBe(base);
  expect(rev((d) => editJson(report(d), (json) => { json.chart.states[0].path = ["Lost"]; }))).not.toBe(base);
  expect(rev((d) => writeFileSync(md(d), readFileSync(md(d), "utf8").replace("TLC reached 111 states", "TLC reached 112 states")))).not.toBe(base);
});

test("open-rule holds while the plan's own run leaves a rule unproven, and carries those rules and that run's notes", () => {
  const facts = (data: Statechart, edit?: (dir: string) => void) => chart.facts!(data, { read: planReader(planWith(data, edit)) });
  expect(facts(block)).toEqual({ "open-rule": {
    rules: [expect.objectContaining({ name: "NoTurnSkipped", outcome: "broken" })],
    notes: { "plan:NoTurnSkipped": block.notes!["plan:NoTurnSkipped"] },
  } });
  const allHold = (d: string) => editJson(join(d, "statechart/out-plan/report.json"), (json) => { for (const rule of json.rules) rule.outcome = "holds"; });
  expect(facts(block, allHold)).toEqual({});
  const { runs: _, ...unchecked } = block;
  expect(facts(unchecked)).toEqual({ "open-rule": { rules: null, notes: {} } });
});
