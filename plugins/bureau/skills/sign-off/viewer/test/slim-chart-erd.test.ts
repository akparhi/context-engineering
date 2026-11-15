import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { rowOf } from "../src/views.tsx"; // first: the views and views.tsx import each other, and only this order initialises the registry
import { erdRow } from "../src/views/erd.tsx";
import { statechartRow } from "../src/views/statechart.tsx";
import { pageData } from "../../scripts/build.ts";
import type { Inputs } from "../../scripts/views.ts";

const data = await pageData(resolve(import.meta.dir, "../../fixtures/plan"));
const inputOf = <V extends "statechart" | "erd">(view: V) => Object.values(data.blocks).find((b) => b.view === view)!.input as Inputs[V];
const chart = inputOf("statechart"), erd = inputOf("erd");
const erdLayout = Object.values(data.blocks).find((b) => b.view === "erd")!.layout;

/** The fixture's chart with its plan run changed: every broken rule fixed in the model, or the checker never run. */
type Report = NonNullable<Inputs["statechart"]["runs"][number]["report"]>;
const withPlanReport = (report: Report | null): Inputs["statechart"] => ({ ...chart, runs: [{ ...chart.runs[0], report }, ...chart.runs.slice(1)] });
const plan = chart.runs[0].report!;
const allHold = withPlanReport({ ...plan, rules: plan.rules.map((r) => ({ kind: r.kind, name: r.name, outcome: "holds" as const })) });
const noReport = withPlanReport(null);

describe("statechartRow", () => {
  test.each([
    ["one rule breaks", chart, { says: "6 rules, 5 hold", loose: ["1 rule breaks"] }],
    ["every rule holds", allHold, { says: "6 rules, 6 hold", loose: [] }],
    ["no report", noReport, { says: "6 rules", loose: ["6 rules not checked"] }],
    ["a fixed break is no loose end", { ...chart, notes: { ...chart.notes, "plan:NoTurnSkipped": { verdict: "fixed" as const, text: "" } } },
      { says: "6 rules, 5 hold", loose: [] }],
    ["a rule that guards nothing", { ...allHold, parked: {} }, { says: "6 rules, 6 hold", loose: ['"A copy waits on the hold shelf for three days at most" guards no requirement'] }],
  ])("%s", (_, input, want) => {
    expect(statechartRow(input)).toEqual(want);
  });
});

describe("erdRow", () => {
  const changedOnly = { ...erdLayout, tables: erdLayout.tables.slice(0, 1).map((t) => ({ ...t, mark: "changed" as const })) };
  test.each([
    ["the fixture", erd, erdLayout, { says: "5 tables: 1 new, 4 reused", loose: ["The value paused serves no requirement"] }],
    ["an enum value that serves nothing", { ...erd, unused: [{ value: "hold_status.IGNORED", why: "" }] }, changedOnly,
      { says: "1 table: 1 changed", loose: ["The value IGNORED serves no requirement"] }],
    ["no layout counts the declared tables", erd, undefined, { says: "4 tables: 1 new, 3 reused", loose: ["The value paused serves no requirement"] }],
  ])("%s", (_, input, layout, want) => {
    expect(erdRow(input, layout)).toEqual(want);
  });
});

describe("the registry hands each row its block", () => {
  const block = (view: "statechart" | "erd") => Object.values(data.blocks).find((b) => b.view === view)!;
  test("the erd row counts the tables the schema draws, not the ones the plan declares", () => {
    expect(rowOf(block("erd"))?.says).toBe("5 tables: 1 new, 4 reused");
  });
  test("the statechart row is registered", () => {
    expect(rowOf(block("statechart"))?.says).toBe("6 rules, 5 hold");
  });
});
