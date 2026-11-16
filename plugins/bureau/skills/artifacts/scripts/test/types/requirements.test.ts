import { expect, test } from "bun:test";
import { check } from "../../check.ts";
import requirements from "../../types/requirements.ts";
import { artifact, fixtureData, noFiles, PLAN, planDir } from "../helpers.ts";

function checkData(data: object) {
  return check(planDir({ "plan.json": PLAN, "artifacts/requirements.json": artifact("requirements", data) }));
}

const findings = (report: Awaited<ReturnType<typeof check>>) => [...report.errors, ...report.warnings].map((f) => [f.rule, f.message]);

const product = (requirements: object[], more: object = {}) =>
  ({ problem: "Members cannot tell when a book comes back.", users: [], goals: [], nonGoals: [], requirements, rollout: [], ...more });

test("the fixture's requirements, every optional field filled, parses unchanged and checks clean", async () => {
  const full = { ...fixtureData("requirements"), metric: { name: "Holds collected", target: "8 in 10", readFrom: "The weekly hold report" } };
  expect(full.notFor).toBeString();
  expect(full.requirements.some((r: { who?: string }) => r.who)).toBe(true);
  expect(requirements.schema.parse(full)).toEqual(full);
  expect(findings(await checkData(full))).toEqual([]);
});

test("a plan with no product act holds only the reason, and a product field beside it fails the schema", async () => {
  expect(findings(await checkData({ none: "A backend-only change; no member sees it." }))).toEqual([]);
  const report = await checkData({ none: "No product act.", problem: "x" });
  expect(report.errors.map((f) => f.rule)).toEqual(["schema"]);
});

test("two requirements with one id fail the id rule", async () => {
  const one = { id: "R1", title: "Place a hold", text: "A member joins the line." };
  expect(findings(await checkData(product([one, { ...one, title: "Cancel a hold" }])))).toEqual([["id", "duplicate id R1: two requirements"]]);
});

test("a code span anywhere in act one fails jargon, at the field it sits in", async () => {
  const req = { id: "R1", title: "Place a hold", text: "A member calls `POST /holds` from the book page." };
  const rollout = [{ stage: "Staff first", says: "Behind `holds_v2`." }];
  expect(findings(await checkData(product([req], { rollout })))).toEqual([
    ["jargon", "act one, requirements[0].text: has the code span `POST /holds`"],
    ["jargon", "act one, rollout[0].says: has the code span `holds_v2`"],
  ]);
  expect(findings(await checkData({ none: "Only `db.sql` changes." }))).toEqual([["jargon", "act one, none: has the code span `db.sql`"]]);
});

test("scope carries the requirements, or the reason a plan has no product act", () => {
  const reqs = [{ id: "R1", title: "Place a hold", text: "A member joins the line." }];
  expect(requirements.facts?.(requirements.schema.parse(product(reqs)), noFiles)).toEqual({ scope: reqs });
  expect(requirements.facts?.(requirements.schema.parse({ none: "Backend only." }), noFiles)).toEqual({ scope: { none: "Backend only." } });
});
