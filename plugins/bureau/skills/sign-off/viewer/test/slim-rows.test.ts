import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import { pageData } from "../../scripts/build.ts"
import type { Item } from "../../scripts/manifest.ts"
import type { EndpointsInput, FiguresInput, Inputs, PrsInput, RisksInput, TraceInput, UnitsInput } from "../../scripts/views.ts"
import "../src/views.tsx" // first: the views and views.tsx import each other, and only this order initialises the registry
import { endpointsRow } from "../src/views/endpoints.tsx"
import { figuresRow } from "../src/views/figures.tsx"
import { grantRow } from "../src/views/grant.tsx"
import { prsRow } from "../src/views/prs.tsx"
import { risksRow } from "../src/views/risks.tsx"
import { traceRow } from "../src/views/trace.tsx"
import { unitsRow } from "../src/views/units.tsx"

const data = await pageData(resolve(import.meta.dir, "../../fixtures/plan"))
const input = <V extends keyof Inputs>(view: V) => structuredClone(Object.values(data.blocks).find((b) => b.view === view)!.input) as Inputs[V]
const grant = data.manifest.items.find((i): i is Extract<Item, { type: "grant" }> => i.type === "grant")!

describe("prsRow", () => {
  test("counts pull requests and repos, and names the one whose branch the plan disagrees with", () => {
    expect(prsRow(input("prs") as PrsInput)).toEqual({ says: "3 pull requests across 2 repos", loose: ["P3: The plan says into develop"] })
  })
  test("names each pull request that disagrees with the plan or serves nothing", () => {
    const prs = input("prs") as PrsInput
    prs.prs[0]!.planInto = "staging"
    prs.prs[1]!.serves = []
    expect(prsRow(prs).loose).toEqual(["P1: The plan says into staging", "P2: Serves no requirement", "P3: The plan says into develop"])
  })
})

describe("risksRow", () => {
  test("counts risks and defaults, and names a risk that touches no requirement", () => {
    const risks = input("risks") as RisksInput
    expect(risksRow(risks)).toEqual({ says: "3 risks, 2 defaults", loose: [] })
    risks.risks[1]!.serves = []
    expect(risksRow(risks).loose).toEqual(["K2: Touches no requirement"])
  })
})

describe("unitsRow", () => {
  test("lists each unit with its title, then the plan's sentence", () => {
    const units = input("units") as UnitsInput
    const row = unitsRow(units)
    expect(row.says.startsWith("U1 Holds table and queue, U2 ")).toBe(true)
    expect(row.says.endsWith(units.note!)).toBe(true)
    expect(row.loose).toEqual([])
  })
  test("names a unit that ships as no pull request", () => {
    const units = input("units") as UnitsInput
    units.ships.U2 = []
    expect(unitsRow(units).loose).toEqual(["U2: No pull request"])
  })
})

describe("figuresRow", () => {
  test("counts the numbers and the inferred ones", () => {
    const figures = input("figures") as FiguresInput
    expect(figuresRow(figures)).toEqual({ says: "4 numbers, 1 inferred", loose: [] })
    figures.facts.forEach((f) => { f.inferred = false })
    expect(figuresRow(figures).says).toBe("4 numbers")
  })
})

describe("endpointsRow", () => {
  test("counts calls by mark", () => {
    const api = input("endpoints") as EndpointsInput
    expect(endpointsRow(api).says).toBe("3 calls, 3 new")
    api.endpoints[0]!.mark = "changed"
    expect(endpointsRow(api).says).toBe("3 calls, 2 new, 1 changed")
  })
})

describe("traceRow", () => {
  test("counts rows and tests, and keeps the row that checks no requirement and the rows with no test", () => {
    const trace = input("trace") as TraceInput
    const row = traceRow(trace)
    expect(row).toEqual({ says: "9 acceptance rows, 10 tests, 2 proposed", loose: ["1 acceptance row check nothing we asked for", "1 acceptance row with no test"] })
  })
  test("keeps a row that guards a broken rule or one the model check has not run", () => {
    const trace = input("trace") as TraceInput
    const guarded = trace.rows.flatMap((r) => r.acceptance).filter((a) => a.guards)
    const name = (g: string) => g.replace(/^rule:/, "")
    trace.rules[name(guarded[0]!.guards!)] = { says: "x", outcome: "broken" }
    trace.rules[name(guarded[1]!.guards!)] = { says: "y", outcome: "not checked" }
    const loose = traceRow(trace).loose
    expect(loose).toContain("1 acceptance row guard a rule the model check breaks")
    expect(loose).toContain("1 acceptance row guard a rule the model check has not run")
  })
  test("a rule with no report counts as not run", () => {
    const trace = input("trace") as TraceInput
    for (const k of Object.keys(trace.rules)) trace.rules[k]!.outcome = null
    expect(traceRow(trace).loose.some((l) => /has not run$/.test(l))).toBe(true)
  })
})

describe("grantRow", () => {
  const prs = (input("prs") as PrsInput).prs
  test("counts the lines and names the pull requests that merge without a person", () => {
    expect(grantRow(grant, prs).says).toBe(`${grant.allow.length} things it does alone, ${grant.ask.length} it asks you first. Pull requests that merge without a person: P3`)
  })
  test("says so when none does", () => {
    for (const p of prs) p.merge.by = "human"
    expect(grantRow(grant, prs).says).toEndWith("No pull request in this plan merges without a person.")
  })
})
