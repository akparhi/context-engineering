import type { Item, Manifest } from "../../scripts/manifest.ts"
import { ACT_OF, ACTS, type Act, type Section } from "../../scripts/model.ts"
import { deriveStatus } from "../../scripts/status.ts"
import { COPY } from "./copy.ts"
import { isGate, isQuestion, ownsCard, type Question } from "./plan.ts"

/** The page as steps: the four acts, then the gates, then the decision. Everything the shell shows (the sidebar, Back and Next,
 *  open counts, where a ref lives) derives from `stepsOf`. */
export type StepId = Act | "gates" | "decide"
type SubStep =
  | { kind: "questions"; questions: Question[] }
  | { kind: "none"; says: string; questions: Question[] }
  | { kind: "card"; item: Item }
  | { kind: "gates"; gates: Item[] }
  | { kind: "decide" }
type Sub = SubStep & { id: string; label: string }
export type Step = { id: StepId; subs: Sub[] }
/** One screen of the walk: a step and one of its sub-steps. A location is an index into the flat walk. */
export type Stop = { step: Step; sub: Sub; n: number }

/** Tech opens on the behavior, then the schema, the API and the components; its other cards follow in manifest order. */
const TECH_FIRST = ["statechart", "erd", "endpoints", "components"] as const
const techRank = (it: Item) => {
  const i = TECH_FIRST.findIndex((view) => it.body?.some((b) => b.view === view))
  return i < 0 ? TECH_FIRST.length : i
}
/** Product opens on the scope, then its other cards, then the research. */
const productRank = (it: Item) => (it.section === "Scope" ? 0 : it.section === "Evidence" ? 2 : 1)

export function stepsOf(m: Manifest): Step[] {
  const noProduct = "none" in m.product
  // Evidence is research the product reads, so it sits under Product. `ACT_OF` keeps it in the tech act for `status`.
  const stepOf = (s: Section): Act => (s === "Evidence" && !noProduct ? "product" : ACT_OF[s])
  const questions = (a: Act) => m.items.filter(isQuestion).filter((q) => stepOf(q.section) === a)
  const cards = (a: Act) => {
    const mine = m.items.filter((it) => ownsCard(it) && it.type !== "grant" && stepOf(it.section) === a)
    const rank = a === "tech" ? techRank : a === "product" ? productRank : () => 0
    return mine.toSorted((x, y) => rank(x) - rank(y)).map((item): Sub => ({ kind: "card", item, id: item.id, label: item.title }))
  }
  const questionsSub = (qs: Question[]): Sub[] => (qs.length ? [{ kind: "questions", questions: qs, id: "questions", label: COPY.steps.questions }] : [])

  const acts: Step[] = ACTS.map((a) => {
    if (a === "product" && "none" in m.product) {
      return { id: a, subs: [{ kind: "none", says: m.product.none, questions: questions(a), id: "none", label: COPY.act.noProduct }] }
    }
    return { id: a, subs: [...questionsSub(questions(a)), ...cards(a)] }
  })
  const gates = m.items.filter(isGate)
  const grant = m.items.find((it) => it.type === "grant")
  const gateSubs: Sub[] = []
  if (gates.length) gateSubs.push({ kind: "gates", gates, id: "list", label: COPY.steps.gateList })
  if (grant) gateSubs.push({ kind: "card", item: grant, id: grant.id, label: grant.title })
  const decide: Step = { id: "decide", subs: [{ kind: "decide", id: "decide", label: COPY.steps.name.decide }] }
  return [...acts, { id: "gates", subs: gateSubs } satisfies Step, decide].filter((s) => s.subs.length > 0)
}

export function walkOf(steps: Step[]): Stop[] {
  let n = 0
  return steps.flatMap((step) => step.subs.map((sub) => ({ step, sub, n: n++ })))
}

/** The items a sub-step asks the reader about, so its open count is theirs. */
export function itemsOf(sub: SubStep, m: Manifest): Item[] {
  switch (sub.kind) {
    case "questions": case "none": return sub.questions
    case "card": return [sub.item]
    case "gates": return sub.gates
    case "decide": return m.items
  }
}
export const stepItems = (step: Step, m: Manifest) => [...new Set(step.subs.flatMap((sub) => itemsOf(sub, m)))]

/** The stop that draws each card and each question, by item id. A ref drawn inside a card lives at its card's stop. */
export function homesOf(walk: Stop[]): Map<string, number> {
  const homes = new Map<string, number>()
  for (const { sub, n } of walk) {
    if (sub.kind === "card") homes.set(sub.item.id, n)
    if (sub.kind === "questions" || sub.kind === "none") for (const q of sub.questions) homes.set(q.id, n)
  }
  return homes
}

export const hashOf = (stop: Stop) => `#${stop.step.id}/${stop.sub.id}`
/** The stop a hash names: `#<step>/<sub>`, or `#<step>` for its first sub-step. Null when it names none. */
export function stopOf(walk: Stop[], hash: string): number | null {
  let path: string
  try {
    path = decodeURIComponent(hash.replace(/^#/, ""))
  } catch {
    return null
  }
  const [step, sub] = path.split("/", 2)
  return walk.find((s) => s.step.id === step && (sub === undefined || s.sub.id === sub))?.n ?? null
}

/** Per gate, the build steps that wait on it, by the may-run rule `status` applies: run with no verdicts, so every gate is open
 *  and each build step's `waitsOn` names every gate it needs. */
export function heldBy(m: Manifest): Map<string, string[]> {
  const { steps } = deriveStatus(m, { planRev: "", items: {} }, [])
  return new Map(m.items.filter(isGate).map((g) => [g.id, steps.filter((s) => s.waitsOn.includes(g.id)).map((s) => s.id)]))
}
