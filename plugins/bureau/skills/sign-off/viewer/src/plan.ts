import type { Block, Item, Manifest } from "../../scripts/manifest.ts"
import { ACT_OF, ACTS, type Act } from "../../scripts/model.ts"
import type { PageData } from "../../scripts/build.ts"

/** Any id in the manifest, or `db:Table.column`, `sc:<machine>/<state>`, `rule:<name>`. */
export type Ref = string
/** Both directions of every link, so a viewer never searches the manifest for what points at it. */
export type Links = Record<Ref, Ref[]>

/** `build` validates the manifest, resolves every block and computes the revs before it writes the data block, so the page trusts
 *  it and never resolves a view or computes a rev itself. */
export type { PageData }

export type Question = Extract<Item, { type: "question" }>
export type ViewKind = Block["view"]

export { ACTS }

export function readPageData(): PageData {
  const text = document.getElementById("sign-off-data")?.textContent
  if (!text) throw new Error("This page has no plan data. Rebuild it with `sign-off build`.")
  return JSON.parse(text) as PageData
}

export const actOf = (item: Item): Act => ACT_OF[item.section]
export const isQuestion = (item: Item): item is Question => item.type === "question"
export const isGate = (item: Item) => item.type === "grant" || ("touches" in item && item.touches.length > 0)
export const holds = (q: Question) => q.default === null
/** Parts, the grant and every gate draw as a card. An FYI step or decision draws inside its section's part. */
export const ownsCard = (item: Item) => item.type === "part" || item.type === "grant" || isGate(item)

export type RefKind = "item" | "requirement" | "screen" | "component" | "endpoint" | "acceptance" | "test" | "pr" | "risk" | "default" | "column" | "state" | "rule"
/** `home` is the item whose card draws the ref, where the Linked panel scrolls to. */
export type RefInfo = { ref: Ref; kind: RefKind; label: string; act: Act; home?: string }

const DRAWN_BY = {
  requirement: ["spec", "product"], screen: ["screens", "product"], component: ["components", "tech"], endpoint: ["endpoints", "tech"],
  acceptance: ["trace", "verify"], test: ["trace", "verify"], pr: ["prs", "pr"], risk: ["risks", "tech"], default: ["risks", "tech"],
  column: ["erd", "tech"], state: ["statechart", "tech"], rule: ["statechart", "tech"],
} as const satisfies Record<Exclude<RefKind, "item">, readonly [ViewKind, Act]>
const PREFIX = { db: "column", sc: "state", rule: "rule" } as const

/** Every ref the page can name, with its label and the card that draws it. */
export function refIndex(m: Manifest) {
  const cards = m.items.filter(ownsCard)
  const homeOf = (view: ViewKind) => cards.find((it) => it.body?.some((b) => b.view === view))?.id
  const index = new Map<Ref, RefInfo>()
  const put = (kind: Exclude<RefKind, "item">, ref: Ref, label: string) => {
    const [view, act] = DRAWN_BY[kind]
    index.set(ref, { ref, kind, label, act, home: homeOf(view) })
  }
  for (const it of m.items) {
    const home = ownsCard(it) ? it.id : cards.find((c) => c.section === it.section)?.id
    index.set(it.id, { ref: it.id, kind: "item", label: it.title, act: actOf(it), home })
  }
  if (!("none" in m.product)) for (const r of m.product.requirements) put("requirement", r.id, r.title)
  const f = m.facts
  for (const s of f.screens ?? []) put("screen", s.id, s.label)
  for (const c of f.components ?? []) put("component", c.id, c.name)
  for (const e of f.endpoints ?? []) put("endpoint", e.id, `${e.method} ${e.path}`)
  for (const a of f.acceptance ?? []) put("acceptance", a.id, a.says ?? a.then ?? a.when ?? a.id)
  for (const t of f.tests ?? []) put("test", t.id, t.name)
  for (const p of f.prs ?? []) put("pr", p.id, p.title)
  for (const r of f.risks ?? []) put("risk", r.id, r.title)
  for (const d of f.defaults ?? []) put("default", d.id, d.says)
  return {
    get(ref: Ref): RefInfo | undefined {
      const known = index.get(ref)
      if (known) return known
      const [prefix, rest] = ref.split(/:(.*)/s, 2)
      const kind = prefix && prefix in PREFIX ? PREFIX[prefix as keyof typeof PREFIX] : undefined
      if (!kind || !rest) return undefined
      const [view, act] = DRAWN_BY[kind]
      return { ref, kind, label: rest, act, home: homeOf(view) }
    },
  }
}
export type RefIndex = ReturnType<typeof refIndex>

/** The first card in the item's section. It draws a question, an FYI step or an FYI decision of that section, itself or through
 *  one of its views. */
export const hostOf = (m: Manifest, item: Item) => m.items.find((it) => ownsCard(it) && it.section === item.section)
/** The words of the default a question runs on: its option's label, or the default as written. */
export const defaultWords = (q: Question) => q.options?.find((o) => o.id === q.default)?.label ?? q.default
