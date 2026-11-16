import { expect, test } from "bun:test";
import { check } from "../../check.ts";
import api from "../../types/api.ts";
import { artifact, noFiles, PLAN, planDir } from "../helpers.ts";


async function findings(data: object, files: Record<string, string> = {}) {
  const report = await check(planDir({ "plan.json": PLAN, "artifacts/api.json": artifact("api", data), ...files }));
  return [...report.errors, ...report.warnings].filter((f) => f.tier === "type").map((f) => `${f.rule}: ${f.message}`);
}

const placeHold = {
  id: "E1", method: "POST", path: "/holds", mark: "new", answers: "Puts the member in line.",
  who: { text: "Signed-in members", mark: "reused" },
  narrows: [{ name: "bookId", type: "string", serves: ["R1"] }],
  outcomes: [
    { status: 201, when: "Every copy is lent.", title: "In line", shape: "Hold", serves: ["R1"],
      body: [{ name: "status", type: "'waiting'", column: "book_holds.status" }] },
    { status: 409, when: "The member already holds this book.", title: "Already in line", shape: "Error" },
  ],
  serves: ["R1"],
  noTransition: "Placing a hold only adds a row.",
};
const block = {
  endpoints: [placeHold],
  src: "design/api.json",
  access: { who: "Desk librarians", permission: "holds:cancel-any", switch: "holds", serves: ["R5"], ask: "Q3" },
  envelope: "T, or { message: string } on an error",
  shapes: { Hold: "{ id: string }", Error: "{ message: string }" },
};

test("an endpoints block, with every optional part, checks clean", async () => {
  expect(await findings(block, { "design/api.json": '{ "openapi": "3.1.0" }' })).toEqual([]);
});

test("the OpenAPI fragment must exist in the plan folder", async () => {
  expect(await findings(block)).toContain("file: design/api.json does not exist inside the plan folder");
});

test("a repeated endpoint id and an endpoint with no outcome are errors", async () => {
  const errors = await findings({ endpoints: [placeHold, { ...placeHold, outcomes: [] }] });
  expect(errors).toContain("id: duplicate id E1: two endpoints");
  expect(errors).toContain("outcome: endpoint E1 (POST /holds) has no outcome. Name what it answers and when");
});

test("api holds for a new or changed endpoint, and permission for a new or changed caller", () => {
  const facts = (data: object) => api.facts!(api.schema.parse(data), noFiles);
  const reused = { ...placeHold, id: "E2", mark: "reused" };
  const newCaller = { ...reused, id: "E3", who: { text: "Desk librarians", mark: "new" } };
  expect(facts({ ...block, endpoints: [placeHold, reused] })).toEqual({ api: [placeHold] });
  expect(facts({ ...block, endpoints: [reused, newCaller] })).toEqual({
    permission: { endpoints: [{ id: "E3", method: "POST", path: "/holds", who: newCaller.who }], access: block.access },
  });
  expect(facts({ endpoints: [reused], access: block.access })).toEqual({});
});
