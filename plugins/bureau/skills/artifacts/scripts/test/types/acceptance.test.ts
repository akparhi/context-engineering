import { expect, test } from "bun:test";
import { check } from "../../check.ts";
import acceptance from "../../types/acceptance.ts";
import { artifact, fixtureData, noFiles, PLAN, planDir } from "../helpers.ts";

function checkRows(rows: unknown[]) {
  return check(planDir({ "plan.json": PLAN, "artifacts/acceptance.json": artifact("acceptance", { rows }) }));
}

test("the fixture's acceptance rows parse unchanged, and only the row with no requirement warns", async () => {
  const rows = fixtureData("acceptance").rows;
  expect(acceptance.schema.parse({ rows })).toEqual({ rows });
  const report = await checkRows(rows);
  expect(report.errors).toEqual([]);
  expect(report.warnings.map((w) => `${w.rule}: ${w.message}`)).toEqual(["trace: trace hole: acceptance A9 checks no requirement"]);
});

test("a row needs says, or when and then", async () => {
  for (const row of [{ id: "A1", requirement: "R1", given: "a lent book" }, { id: "A1", requirement: "R1", when: "a member holds it" }]) {
    expect((await checkRows([row])).errors.map((f) => f.message)).toEqual(["rows.0: an acceptance row needs `says`, or `when` and `then`"]);
  }
  expect((await checkRows([{ id: "A1", requirement: "R1", when: "a member holds it", then: "they see their place" }])).errors).toEqual([]);
});

test("two rows with one id fail the id rule", async () => {
  const report = await checkRows([{ id: "A1", requirement: "R1", says: "one" }, { id: "A1", requirement: "R2", says: "two" }]);
  expect(report.errors.map((f) => [f.rule, f.message])).toEqual([["id", "duplicate id A1: two acceptance rows"]]);
});

test("the acceptance fact carries the rows", () => {
  const rows = [{ id: "A1", requirement: "R1", says: "A member sees their place." }];
  expect(acceptance.facts?.(acceptance.schema.parse({ rows }), noFiles)).toEqual({ acceptance: rows });
});
