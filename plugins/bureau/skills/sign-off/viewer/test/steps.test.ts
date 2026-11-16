import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import { Manifest } from "../../scripts/manifest.ts"
import { hashOf, heldBy, homesOf, stepsOf, stopOf, walkOf } from "../src/steps.ts"

const load = async (name: string) => Manifest.parse(await Bun.file(resolve(import.meta.dir, `../../fixtures/${name}/sign-off.json`)).json())
const walk = async (name: string) => walkOf(stepsOf(await load(name)))
const hashes = async (name: string) => (await walk(name)).map(hashOf)

describe("stepsOf", () => {
  test("orders a plan with every act: questions first, scope then screens then evidence, the tech diagrams first, gates, then decide", async () => {
    expect(await hashes("plan")).toEqual([
      "#product/questions", "#product/scope", "#product/screens", "#product/evidence",
      "#tech/questions", "#tech/behavior", "#tech/data", "#tech/api", "#tech/components", "#tech/decisions", "#tech/units", "#tech/risks",
      "#verify/acceptance", "#pr/prs", "#gates/list", "#gates/grant", "#decide/decide",
    ])
  })

  test("puts each section's questions in its own step's questions sub-step", async () => {
    const stops = await walk("second")
    const asked = (hash: string) => stops.find((s) => hashOf(s) === hash)?.sub
    expect(asked("#product/questions")).toMatchObject({ kind: "questions", questions: [{ id: "ask-bigger" }] })
    expect(asked("#tech/questions")).toMatchObject({ kind: "questions", questions: [{ id: "ask-keep" }, { id: "ask-neighbour" }] })
  })

  test("gives a plan with no product its none line as the step's only sub-step, and skips empty steps", async () => {
    const stops = await walk("questions")
    expect(stops.map(hashOf)).toEqual(["#product/none", "#decide/decide"])
    expect(stops[0]!.sub).toMatchObject({ kind: "none", questions: [{ id: "last-bus" }, { id: "weekends" }] })
  })

  test("skips the questions sub-step when a step has none", async () => {
    expect(await hashes("design")).toEqual(["#product/sailors", "#tech/tide-api", "#gates/list", "#decide/decide"])
  })
})

describe("locations", () => {
  test("a hash names a stop, a bare step its first sub-step, and anything else no stop", async () => {
    const stops = await walk("plan")
    const at = (hash: string) => { const n = stopOf(stops, hash); return n === null ? null : hashOf(stops[n]!) }
    expect(at("#tech/behavior")).toBe("#tech/behavior")
    expect(at("#tech")).toBe("#tech/questions")
    expect(at("#tech/nope")).toBeNull()
    expect(at("")).toBeNull()
    expect(at("#tech/%62ehavior")).toBe("#tech/behavior")
    expect(at("#%%%")).toBeNull()
    expect(at("#tech/%E0%A4%A")).toBeNull()
  })

  test("a card lives at its own stop and a question at its step's questions stop", async () => {
    const stops = await walk("plan")
    const homes = homesOf(stops)
    const home = (id: string) => hashOf(stops[homes.get(id)!]!)
    expect(home("behavior")).toBe("#tech/behavior")
    expect(home("Q3")).toBe("#tech/questions")
    expect(home("grant")).toBe("#gates/grant")
  })
})

test("a gate holds the build steps the status rule makes wait on it", async () => {
  const held = heldBy(await load("plan"))
  expect(held.get("behavior")).toEqual(["U1", "U2", "U3"])
  expect(held.get("scope")).toEqual([])
})
