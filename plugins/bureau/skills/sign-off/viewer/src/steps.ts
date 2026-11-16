import type { BlockData } from "../../scripts/build.ts"
import type { Item, Manifest } from "../../scripts/manifest.ts"
import { ACT_OF, ACTS, type Act, type Section } from "../../scripts/model.ts"
import { deriveStatus } from "../../scripts/status.ts"
import { COPY } from "./copy.ts"
import { isGate, isQuestion, ownsCard, type Question } from "./plan.ts"
import { partsOf, type Part } from "./slices.ts"

/** The page as steps: the four acts, then the gates, then the decision. Everything the shell shows (the sidebar, Back and Next,
 *  open counts, where a ref lives) derives from `stepsOf`. */
export type StepId = Act | "gates" | "decide"
/** A card is one stop, or one stop per `Part` when it is too tall for a screen. The other kinds are the shell's own stops, at most
 *  one per step and always its first, so the bare step names them and no item id is taken. */
type SubStep =
  | { kind: "questions"; questions: Question[] }
  | { kind: "none"; says: string; questions: Question[] }
  | { kind: "card"; item: Item; part: Part | null }
  | { kind: "gates"; gates: Item[] }
  | { kind: "decide" }
type Sub = SubStep & { label: string }
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

/** Every question in the plan, blocking or not, answered or not, in id order: Q1, Q2, Q10. Ids that tie keep manifest order. */
export const questionsOf = (m: Manifest): Question[] =>
  m.items.filter(isQuestion).toSorted((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }))

/** `blocks` is the page data's built blocks, which decide how a tall card splits. */
export function stepsOf(m: Manifest, blocks: Record<string, BlockData> = {}): Step[] {
  const noProduct = "none" in m.product
  // Evidence is research the product reads, so it sits under Product. `ACT_OF` keeps it in the tech act for `status`.
  const stepOf = (s: Section): Act => (s === "Evidence" && !noProduct ? "product" : ACT_OF[s])
  const questions = (a: Act) => questionsOf(m).filter((q) => stepOf(q.section) === a)
  const cardSubs = (item: Item): Sub[] => {
    const parts = partsOf(item, blocks)
    return parts.length ? parts.map((part) => ({ kind: "card", item, part, label: part.label })) : [{ kind: "card", item, part: null, label: item.title }]
  }
  const cards = (a: Act) => {
    const mine = m.items.filter((it) => ownsCard(it) && it.type !== "grant" && stepOf(it.section) === a)
    const rank = a === "tech" ? techRank : a === "product" ? productRank : () => 0
    return mine.toSorted((x, y) => rank(x) - rank(y)).flatMap(cardSubs)
  }
  const questionsSub = (qs: Question[]): Sub[] => (qs.length ? [{ kind: "questions", questions: qs, label: COPY.steps.questions }] : [])

  const acts: Step[] = ACTS.map((a) => {
    if (a === "product" && "none" in m.product) {
      return { id: a, subs: [{ kind: "none", says: m.product.none, questions: questions(a), label: COPY.act.noProduct }] }
    }
    return { id: a, subs: [...questionsSub(questions(a)), ...cards(a)] }
  })
  const gates = m.items.filter(isGate)
  const grant = m.items.find((it) => it.type === "grant")
  const gateSubs: Sub[] = []
  if (gates.length) gateSubs.push({ kind: "gates", gates, label: COPY.steps.gateList })
  if (grant) gateSubs.push(...cardSubs(grant))
  const decide: Step = { id: "decide", subs: [{ kind: "decide", label: COPY.steps.name.decide }] }
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

/** The stop that draws each card and each question, by item id. A card lives at its first stop; a ref drawn inside it is found
 *  among the card's stops when the page goes to it. */
export function homesOf(walk: Stop[]): Map<string, number> {
  const homes = new Map<string, number>()
  for (const { sub, n } of walk) {
    if (sub.kind === "card" && !homes.has(sub.item.id)) homes.set(sub.item.id, n)
    if (sub.kind === "questions" || sub.kind === "none") for (const q of sub.questions) homes.set(q.id, n)
  }
  return homes
}

/** `#<step>` for the shell's own stop, `#<step>/<item>` for a card, `#<step>/<item>/<part>` for one of its parts. Each segment is
 *  encoded, so an id may hold any character. */
export function hashOf(stop: Stop): string {
  const { step, sub } = stop
  const path = sub.kind === "card" ? [step.id, sub.item.id, ...(sub.part ? [sub.part.key] : [])] : [step.id]
  return `#${path.map(encodeURIComponent).join("/")}`
}
/** The stop a hash names, or null when it names none. A bare step names its first stop, and a card its first part. */
export function stopOf(walk: Stop[], hash: string): number | null {
  let path: string[]
  try {
    path = hash.replace(/^#/, "").split("/").map(decodeURIComponent)
  } catch {
    return null
  }
  const [step, item, part, ...rest] = path
  if (rest.length) return null
  const found = walk.find((s) => {
    if (s.step.id !== step) return false
    if (item === undefined) return true
    return s.sub.kind === "card" && s.sub.item.id === item && (part === undefined || s.sub.part?.key === part)
  })
  return found?.n ?? null
}

/** Per gate, the build steps that wait on it, by the may-run rule `status` applies: run with no verdicts, so every gate is open
 *  and each build step's `waitsOn` names every gate it needs. */
export function heldBy(m: Manifest): Map<string, string[]> {
  const { steps } = deriveStatus(m, { planRev: "", items: {} }, [])
  return new Map(m.items.filter(isGate).map((g) => [g.id, steps.filter((s) => s.waitsOn.includes(g.id)).map((s) => s.id)]))
}
