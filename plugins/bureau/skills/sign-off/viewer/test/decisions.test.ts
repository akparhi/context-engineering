import { expect, test } from "bun:test"
import { resolve } from "node:path"
import { Manifest } from "../../scripts/manifest.ts"
import { decisionsOf, emptyReview, reduceReview, type ReviewAction } from "../src/review.ts"

const m = Manifest.parse(await Bun.file(resolve(import.meta.dir, "../../fixtures/plan/sign-off.json")).json())
const after = (...actions: ReviewAction[]) => actions.reduce(reduceReview, emptyReview)

test("lists each item the reader acted on in plan order with its verdict, answer and comments, and leaves the rest out", () => {
  const r = after(
    { type: "comment", item: "risks", text: "Worth a load test" },
    { type: "sendBack", id: "screens", note: "Line one.\nLine two." },
    { type: "answer", id: "Q2", answer: { text: "Three books" } },
    { type: "approve", ids: ["scope"] },
    { type: "answer", id: "Q1", answer: { option: "Q1b" } },
    { type: "sendBack", id: "decisions", note: "D2 is wrong" },
    { type: "open", key: "back:api", text: "still typing" },
  )
  const rows: unknown[] = decisionsOf(r, m.items).map((d) => [d.item.id, d.verdict, d.answer, d.comments.map((c) => c.text)])
  expect(rows).toEqual([
    ["scope", { verdict: "approve" }, undefined, []],
    ["Q1", undefined, { option: "Q1b" }, []],
    ["Q2", undefined, { text: "Three books" }, []],
    ["screens", { verdict: "changes", note: "Line one.\nLine two." }, undefined, []],
    ["decisions", { verdict: "changes", note: "D2 is wrong" }, undefined, []],
    ["risks", undefined, undefined, ["Worth a load test"]],
  ])
})

test("an undone verdict and a cleared answer leave nothing to list", () => {
  const r = after({ type: "approve", ids: ["scope"] }, { type: "undo", id: "scope" }, { type: "answer", id: "Q1", answer: { text: "x" } }, { type: "clearAnswer", id: "Q1" })
  expect(decisionsOf(r, m.items)).toEqual([])
})
