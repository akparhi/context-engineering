import { expect, test } from "bun:test";
import { check } from "../../check.ts";
import { artifact, PLAN, planDir } from "../helpers.ts";


async function findings(data: object) {
  const report = await check(planDir({ "plan.json": PLAN, "artifacts/risks.json": artifact("risks", data) }));
  return [...report.errors, ...report.warnings].filter((f) => f.tier === "type").map((f) => `${f.rule}: ${f.message}`);
}

const risk = { id: "K1", title: "The desk lends a held copy", bound: "The printed slip is the guard.", serves: ["R2"] };
const fallback = { id: "F1", says: "Three opening days count from the morning after shelving.", note: "The desk asked for it.", serves: ["R3"] };

test("risks and defaults check clean", async () => {
  expect(await findings({ risks: [risk], defaults: [fallback] })).toEqual([]);
});

test("a risk and a default that share an id are an error", async () => {
  expect(await findings({ risks: [risk], defaults: [{ ...fallback, id: "K1" }] })).toEqual(["id: duplicate id K1: a risk and a default"]);
});
