import { expect, test } from "bun:test";
import { check } from "../../check.ts";
import evidence from "../../types/evidence.ts";
import { artifact, fixtureData, PLAN, planDir } from "../helpers.ts";

function checkFigures(figures: unknown[]) {
  return check(planDir({ "plan.json": PLAN, "artifacts/evidence.json": artifact("evidence", { figures }) }));
}

test("the fixture's figures parse unchanged, and checks clean", async () => {
  const { figures } = fixtureData("evidence");
  expect(figures.some((f: object) => "source" in f && "inferred" in f && "serves" in f)).toBe(true);
  expect(evidence.schema.parse({ figures })).toEqual({ figures });
  const report = await checkFigures(figures);
  expect([...report.errors, ...report.warnings]).toEqual([]);
});

test("a figure's source is words a person reads, so a file that does not exist is no error", async () => {
  const report = await checkFigures([{ value: "41%", label: "holds never collected", source: "research/w0-data.md §5" }]);
  expect(report.errors).toEqual([]);
});
