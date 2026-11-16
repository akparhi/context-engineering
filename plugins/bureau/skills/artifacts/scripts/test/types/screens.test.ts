import { expect, test } from "bun:test";
import { check } from "../../check.ts";
import screens from "../../types/screens.ts";
import { artifact, fixtureData, noFiles, PLAN, planDir } from "../helpers.ts";

function checkScreens(list: unknown[]) {
  return check(planDir({ "plan.json": PLAN, "artifacts/screens.json": artifact("screens", { screens: list }) }));
}

const findings = (report: Awaited<ReturnType<typeof check>>) => [...report.errors, ...report.warnings].map((f) => [f.rule, f.message]);

const region = (mark: string, more: object = {}) => ({ mark, name: "Place a hold", sketch: "pagination", component: "C1", ...more });
const screen = (id: string, more: object = {}) =>
  ({ id, screen: "Book page", label: "Every copy is out", when: "A member opens a lent book.", serves: ["R1"], regions: [region("new")], ...more });

test("the fixture's screens parse unchanged, with the flow strip, page states and every sketch's sample", async () => {
  const list = fixtureData("screens").screens;
  const used = new Set(list.flatMap((s: { regions: { sketch: string }[] }) => s.regions.map((r) => r.sketch)));
  expect(used.size).toBeGreaterThan(4);
  expect(list.some((s: object) => "from" in s && "on" in s && "states" in s && "chart" in s)).toBe(true);
  expect(screens.schema.parse({ screens: list })).toEqual({ screens: list });
  expect(findings(await checkScreens(list))).toEqual([]);
});

test("a sample must have the shape of its region's sketch", async () => {
  const wrong = region("new", { sketch: "form", sample: { text: "1 of 3" } });
  expect((await checkScreens([screen("S1", { regions: [wrong] })])).errors.map((f) => f.rule)).toContain("schema");
  expect((await checkScreens([screen("S1", { regions: [region("new", { sample: { text: "1 of 3" } })] })])).errors).toEqual([]);
});

test("each screen rule fails on the screen that breaks it", async () => {
  const report = await checkScreens([
    screen("S1"),
    screen("S1", { from: "S9" }),
    screen("S2", { from: "S1", regions: [region("new", { component: undefined })] }),
    screen("S3", { label: "Shows `HoldQueue`" }),
  ]);
  expect(findings(report)).toEqual([
    ["id", "duplicate id S1: two screens"],
    ["ref", "screen S1: screen S9 does not exist"],
    ["render", "screen S2 (Every copy is out): no region names the component that renders it"],
    ["jargon", "act one, screens[3].label: has the code span `HoldQueue`"],
  ]);
});

test("user-visible holds only when a screen shows a new or changed region", () => {
  const facts = (list: unknown[]) => screens.facts?.(screens.schema.parse({ screens: list }), noFiles);
  const changed = screen("S2", { regions: [region("reused"), region("changed")] });
  expect(facts([screen("S1", { regions: [region("reused"), region("copy")] }), changed])).toEqual({ "user-visible": [changed] });
  expect(facts([screen("S1", { regions: [region("reused"), region("copy")] })])).toEqual({});
});
