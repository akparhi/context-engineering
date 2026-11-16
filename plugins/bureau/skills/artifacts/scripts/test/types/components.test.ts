import { expect, test } from "bun:test";
import { check } from "../../check.ts";
import components from "../../types/components.ts";
import { artifact, fixtureData, PLAN, planDir } from "../helpers.ts";

function checkData(data: object) {
  // The repo is checked out in the plan folder, so a reused component that names it and its file passes the plan tier too.
  return check(planDir({
    "plan.json": { ...PLAN, repos: { "shelf-web": "shelf-web" } },
    "shelf-web/src/pager.tsx": "export {};",
    "artifacts/components.json": artifact("components", data),
  }));
}

const findings = (report: Awaited<ReturnType<typeof check>>) => [...report.errors, ...report.warnings].map((f) => [f.level, f.rule, f.message]);

const component = (id: string, more: object = {}) =>
  ({ id, name: `Part${id}`, role: "component", does: "Draws the hold line.", mark: "new", serves: ["R1"], ...more });

test("the fixture's components and note parse unchanged", () => {
  const data = fixtureData("components");
  expect(data.note).toBeString();
  expect(data.components.some((c: object) => "parent" in c && "reads" in c && "file" in c)).toBe(true);
  expect(data.components.some((c: object) => "shows" in c)).toBe(true);
  expect(data.components.some((c: object) => "repo" in c)).toBe(true);
  expect(components.schema.parse(data)).toEqual(data);
});

test("a component may name a parent and a component it shows through, from the same list", async () => {
  expect(findings(await checkData({ components: [component("C1"), component("C2", { parent: "C1", shows: "C1" })] }))).toEqual([]);
});

test("each component rule fails on the component that breaks it", async () => {
  const report = await checkData({ components: [
    component("C1"),
    component("C1", { parent: "C9" }),
    component("C2", { shows: "C8" }),
    component("C3", { mark: "reused", file: "src/pager.tsx" }),
    component("C4", { mark: "reused", repo: "shelf-web" }),
    component("C5", { mark: "reused", repo: "shelf-web", file: "src/pager.tsx" }),
    component("C6", { serves: [] }),
  ] });
  expect(findings(report)).toEqual([
    ["error", "id", "duplicate id C1: two components"],
    ["error", "ref", "component C1: component C9 does not exist"],
    ["error", "ref", "component C2: component C8 does not exist"],
    ["error", "reuse", "component C3 (PartC3) is reused, so it needs a repo and a file to show it exists"],
    ["error", "reuse", "component C4 (PartC4) is reused, so it needs a repo and a file to show it exists"],
    ["warning", "trace", "trace hole: component PartC6 serves no requirement"],
  ]);
});
