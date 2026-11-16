import { expect, test } from "bun:test";
import { check } from "../../check.ts";
import testPlan from "../../types/test-plan.ts";
import { artifact, fixtureData, PLAN, planDir } from "../helpers.ts";

async function findings(tests: unknown[]) {
  const report = await check(planDir({ "plan.json": PLAN, "artifacts/tests.json": artifact("test-plan", { tests }) }));
  return [...report.errors, ...report.warnings].map((f) => `${f.rule}: ${f.message}`);
}

const unit = { id: "T1", type: "unit", name: "queue-order", proves: ["A1"], unit: "U1", says: "Oldest hold first.",
  file: "src/holds/queue.test.ts", run: "bun test src/holds/queue.test.ts" };

test("the fixture's tests parse unchanged and pass every rule", async () => {
  const tests = [...fixtureData("test-plan").tests, { ...unit, id: "T99", proposed: true }];
  expect(testPlan.schema.parse({ tests })).toEqual({ tests });
  expect(await findings(tests)).toEqual([]);
});

test("each test proves a row, and each but a live test names one file and its run command", async () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ proves: [] }, "test: test T1 proves no acceptance row"],
    [{ run: undefined }, "test: test T1 has no run command. Give the command that runs this one test"],
    [{ run: "  " }, "test: test T1 has no run command. Give the command that runs this one test"],
    [{ file: undefined }, "test: test T1 has no file. Name the one file that holds it"],
    [{ file: "src/a.test.ts, src/b.test.ts" }, 'test: test T1: "src/a.test.ts, src/b.test.ts" is not one file. Name the one file that holds it'],
    [{ file: "src/holds" }, 'test: test T1: "src/holds" is not one file. Name the one file that holds it'],
  ];
  for (const [change, message] of cases) expect(await findings([{ ...unit, ...change }])).toEqual([message]);
  expect(await findings([{ ...unit, type: "live", file: undefined, run: undefined }])).toEqual([]);
});

test("two tests with one id fail the id rule", async () => {
  expect(await findings([unit, { ...unit, name: "other" }])).toEqual(["id: duplicate id T1: two tests"]);
});
