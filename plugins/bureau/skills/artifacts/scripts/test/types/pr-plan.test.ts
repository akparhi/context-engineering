import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { check } from "../../check.ts";
import { planReader } from "../../fileref.ts";
import { artifactRev } from "../../rev.ts";
import prPlan from "../../types/pr-plan.ts";
import { artifact, FIXTURE, fixtureData, noFiles, PLAN, planDir as folder } from "../helpers.ts";

const PLAN_MD = readFileSync(join(FIXTURE, "plan.md"), "utf8");

const DATA = fixtureData("pr-plan");

function planDir(data: unknown, planMd = PLAN_MD) {
  return folder({ "plan.json": PLAN, "plan.md": planMd, "artifacts/prs.json": artifact("pr-plan", data as object) });
}

async function findings(data: unknown) {
  const report = await check(planDir(data));
  return [...report.errors, ...report.warnings].map((f) => `${f.rule}: ${f.message}`);
}

const pr = (id: string, steps: string[], by = "human") => ({ id, title: id, repo: "shelf-api", branch: `b-${id}`, from: "develop",
  into: "develop", steps, review: "A maintainer reviews it.", merge: { by, why: "because" }, evidence: [] });

test("the fixture's units, with their headings and merge order, parse with its pull requests and pass every rule", async () => {
  expect(DATA.units.some((u: object) => "mergesAfter" in u && "heading" in u)).toBe(true);
  expect<unknown>(prPlan.schema.parse(DATA)).toEqual(DATA);
  expect(await findings(DATA)).toEqual([]);
});

test("pull requests name units and pull requests that exist, and every unit ships in one", async () => {
  const data = { units: [{ id: "U1", title: "Table" }, { id: "U2", title: "Endpoints" }], prs: [{ ...pr("P1", ["U1", "U9"]), after: ["P0"] }] };
  expect(await findings(data)).toEqual([
    "ref: PR P1: PR P0 does not exist",
    "ref: PR P1: unit U9 does not exist",
    "ref: unit U2 ships in no pull request. Name it in a pull request's steps",
  ]);
});

test("pull requests that merge after each other fail the order rule", async () => {
  const units = [{ id: "U1", title: "Table" }, { id: "U2", title: "Endpoints" }, { id: "U3", title: "Page" }];
  const prs = [{ ...pr("P1", ["U1"]), after: ["P3"] }, { ...pr("P2", ["U2"]), after: ["P1"] }, { ...pr("P3", ["U3"]), after: ["P2"] }];
  expect(await findings({ units, prs })).toEqual(["order: pull requests wait on each other: P1 after P3 after P2 after P1"]);
  expect(await findings({ units, prs: [{ ...pr("P1", ["U1", "U2", "U3"]), after: ["P1"] }] })).toEqual(["order: pull requests wait on each other: P1 after P1"]);
});

test("a unit and a pull request with one id fail the id rule", async () => {
  expect(await findings({ units: [{ id: "X1", title: "Table" }], prs: [pr("X1", ["X1"])] })).toEqual(["id: duplicate id X1: a unit and a pull request"]);
});

test("a unit's source must have its heading, and a heading needs a source", async () => {
  const unit = { id: "U1", title: "Table", source: "plan.md", heading: "U1 Gone" };
  expect(await findings({ units: [unit], prs: [pr("P1", ["U1"])] })).toEqual(['file: plan.md has no heading "U1 Gone"']);
  expect(await findings({ units: [{ id: "U1", title: "Table", heading: "U1" }], prs: [pr("P1", ["U1"])] }))
    .toEqual(["schema: units.0: a heading names a section of `source`, so it needs a source"]);
});

test("the rev moves with the text under a unit's heading and not with the rest of the file", () => {
  const data = prPlan.schema.parse(DATA);
  const rev = (planMd: string) => artifactRev(data, prPlan.files!(data), planReader(planDir(data, planMd)));
  const before = rev(PLAN_MD);
  expect(rev(PLAN_MD.replace("## Grant", "## Grant\n\nOne more sentence."))).toBe(before);
  expect(rev(PLAN_MD.replace("### U2 Holds endpoints", "### U2 Holds endpoints\n\nOne more sentence."))).not.toBe(before);
});

test("merges-alone lists each pull request no person merges, and is absent when a person merges them all", () => {
  const facts = (prs: unknown[]) => prPlan.facts!(prPlan.schema.parse({ units: [], prs }), noFiles);
  expect(facts([pr("P1", []), pr("P2", [], "bot"), pr("P3", [], "agent")])).toEqual({
    "merges-alone": [["P2", { by: "bot", why: "because" }], ["P3", { by: "agent", why: "because" }]],
  });
  expect(facts([pr("P1", [])])).toEqual({});
});
