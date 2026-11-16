import { expect, test } from "bun:test";
import { check } from "../../check.ts";
import { artifact, PLAN, planDir } from "../helpers.ts";

const PLAN_MD = "# Holds\n\n## D1 Shelving\n\nThe desk scan shelves a returned copy.\n";

async function findings(data: object) {
  const report = await check(planDir({ "plan.json": PLAN, "plan.md": PLAN_MD, "artifacts/decisions.json": artifact("decisions", data) }));
  return [...report.errors, ...report.warnings].filter((f) => f.tier === "type").map((f) => `${f.rule}: ${f.message}`);
}

const shelving = {
  id: "D1", title: "Do you agree with how a returned copy reaches the next member?", why: "A member should hear the same day.",
  source: "plan.md", heading: "D1 Shelving", serves: ["R2"], dependsOn: ["U1"],
  options: [
    { id: "D1a", label: "The desk scan shelves it", detail: "The server prints a hold slip.", facts: [["Member hears", "the same day"]] },
    { id: "D1b", label: "A nightly job shelves it" },
  ],
  chosen: "D1a",
};

test("a decision, with its source heading, checks clean", async () => {
  expect(await findings({ decisions: [shelving] })).toEqual([]);
});

test("a source heading the file lacks is an error", async () => {
  expect(await findings({ decisions: [{ ...shelving, heading: "D9 Gone" }] })).toEqual(['file: plan.md has no heading "D9 Gone"']);
});

test("a heading with no source file does not parse", async () => {
  const { source: _, ...loose } = shelving;
  expect(await findings({ decisions: [loose] })).toEqual(["schema: decisions.0.heading: a heading needs a source file"]);
});

test("a chosen option the decision lacks, and an option id used twice, are id errors", async () => {
  const other = { ...shelving, id: "D2", source: undefined, heading: undefined, chosen: "D2z" };
  expect(await findings({ decisions: [shelving, other] })).toEqual([
    "id: duplicate id D1a: two options",
    "id: duplicate id D1b: two options",
    "id: decision D2: option D2z does not exist",
  ]);
});
