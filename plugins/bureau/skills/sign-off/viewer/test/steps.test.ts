import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import { pageData } from "../../scripts/build.ts"
import { Manifest } from "../../scripts/manifest.ts"
import { hashOf, heldBy, homesOf, questionsOf, stepsOf, stopOf, walkOf } from "../src/steps.ts"

const dir = (name: string) => resolve(import.meta.dir, `../../fixtures/${name}`)
const load = async (name: string) => Manifest.parse(await Bun.file(`${dir(name)}/sign-off.json`).json())
const walk = async (name: string) => { const d = await pageData(dir(name)); return walkOf(stepsOf(d.manifest, d.blocks)) }
const hashes = async (name: string) => (await walk(name)).map(hashOf)
/** The plan fixture with some cards' ids changed, and no blocks, so no card splits. */
const renamed = async (ids: Record<string, string>) => {
  const m = await load("plan")
  return walkOf(stepsOf({ ...m, items: m.items.map((it) => (ids[it.id] ? { ...it, id: ids[it.id]! } : it)) }))
}
const at = (stops: Awaited<ReturnType<typeof walk>>, hash: string) => { const n = stopOf(stops, hash); return n === null ? null : hashOf(stops[n]!) }

describe("stepsOf", () => {
  test("orders a plan: questions first, scope then screens then evidence, the tech diagrams first, gates, then decide; a tall card is one stop per part", async () => {
    expect(await hashes("plan")).toEqual([
      "#product", "#product/scope", "#product/screens", "#product/evidence",
      "#tech", "#tech/behavior", "#tech/data", "#tech/api",
      "#tech/components/page", "#tech/components/data", "#tech/components/wiring", "#tech/decisions", "#tech/units", "#tech/risks",
      "#verify/acceptance/acceptance", "#verify/acceptance/tests", "#verify/acceptance/coverage-1", "#verify/acceptance/coverage-2", "#verify/acceptance/prose",
      "#pr/prs", "#gates", "#gates/grant", "#decide",
    ])
  })

  test("a table taller than a screen is one stop per run of requirements, each requirement in one stop, the rows with no requirement in the last", async () => {
    const coverage = (await walk("plan")).flatMap((s) => (s.sub.kind === "card" && s.sub.part?.list === "coverage" ? [s.sub.part] : []))
    expect(coverage.map((p) => p.label)).toEqual(["Coverage R1 to R4", "Coverage R5"])
    const shown = (hide: string) => [...hide.matchAll(/data-requirement="([^"]*)"/g)].map((m) => m[1]!)
    expect(coverage.map((p) => shown(p.hide.join(" ")))).toEqual([["R1", "R2", "R3", "R4"], ["R5", ""]])
  })

  test("puts each section's questions in its own step's questions stop", async () => {
    const stops = await walk("second")
    const asked = (hash: string) => stops.find((s) => hashOf(s) === hash)?.sub
    expect(asked("#product")).toMatchObject({ kind: "questions", questions: [{ id: "ask-bigger" }] })
    expect(asked("#tech")).toMatchObject({ kind: "questions", questions: [{ id: "ask-keep" }, { id: "ask-neighbour" }] })
  })

  test("gives a plan with no product its none line as the step's only stop, and skips empty steps", async () => {
    const stops = await walk("questions")
    expect(stops.map(hashOf)).toEqual(["#product", "#decide"])
    expect(stops[0]!.sub).toMatchObject({ kind: "none", questions: [{ id: "last-bus" }, { id: "weekends" }] })
  })

  test("skips the questions stop when a step has none", async () => {
    expect(await hashes("design")).toEqual(["#product/sailors", "#tech/tide-api", "#gates", "#decide"])
  })
})

describe("locations", () => {
  test("a hash names a stop, a bare step its first stop, a card its first part, and anything else no stop", async () => {
    const stops = await walk("plan")
    expect(at(stops, "#tech/components/wiring")).toBe("#tech/components/wiring")
    expect(at(stops, "#tech/components")).toBe("#tech/components/page")
    expect(at(stops, "#tech")).toBe("#tech")
    expect(at(stops, "#tech/nope")).toBeNull()
    expect(at(stops, "#tech/components/nope")).toBeNull()
    expect(at(stops, "#tech/components/wiring/more")).toBeNull()
    expect(at(stops, "")).toBeNull()
    expect(at(stops, "#tech/%63omponents")).toBe("#tech/components/page")
    expect(at(stops, "#%%%")).toBeNull()
    expect(at(stops, "#tech/%E0%A4%A")).toBeNull()
  })

  test("a card whose id is `questions` keeps its own route apart from its step's questions stop", async () => {
    const stops = await renamed({ risks: "questions" })
    expect(at(stops, "#tech")).toBe("#tech")
    expect(stops[stopOf(stops, "#tech")!]!.sub.kind).toBe("questions")
    expect(at(stops, "#tech/questions")).toBe("#tech/questions")
    expect(stops[stopOf(stops, "#tech/questions")!]!.sub).toMatchObject({ kind: "card", item: { id: "questions" } })
  })

  test("ids holding a slash or a percent sign round-trip through the hash", async () => {
    const stops = await renamed({ api: "api/v1", data: "api%20v1" })
    const slash = stops.find((s) => s.sub.kind === "card" && s.sub.item.id === "api/v1")!
    const percent = stops.find((s) => s.sub.kind === "card" && s.sub.item.id === "api%20v1")!
    expect(hashOf(slash)).toBe("#tech/api%2Fv1")
    expect(hashOf(percent)).toBe("#tech/api%2520v1")
    expect(stopOf(stops, hashOf(slash))).toBe(slash.n)
    expect(stopOf(stops, hashOf(percent))).toBe(percent.n)
  })

  test("a card lives at its first stop and a question at its step's questions stop", async () => {
    const stops = await walk("plan")
    const homes = homesOf(stops)
    const home = (id: string) => hashOf(stops[homes.get(id)!]!)
    expect(home("components")).toBe("#tech/components/page")
    expect(home("Q3")).toBe("#tech")
    expect(home("grant")).toBe("#gates/grant")
  })
})

test("a gate holds the build steps the status rule makes wait on it", async () => {
  const held = heldBy(await load("plan"))
  expect(held.get("behavior")).toEqual(["U1", "U2", "U3"])
  expect(held.get("scope")).toEqual([])
})

test("questionsOf lists every question of every step by id in number order, whatever order the plan wrote them in", async () => {
  const m = await load("second")
  const asked = m.items.filter((it) => it.type === "question")
  const ids = ["Q1", "Q4", "Q5", "Q2", "Q10"]
  const items = [...m.items.filter((it) => it.type !== "question"), ...ids.map((id, i) => ({ ...asked[i % asked.length]!, id }))]
  expect(questionsOf({ ...m, items }).map((q) => q.id)).toEqual(["Q1", "Q2", "Q4", "Q5", "Q10"])
})
