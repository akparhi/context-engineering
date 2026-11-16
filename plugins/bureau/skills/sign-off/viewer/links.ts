/** The page's link index, `Record<Ref, Ref[]>` with both directions of every link the manifest stores on one side.
 *  `inject.ts` embeds it; `build` (P2-T2) takes it over. */
import type { Manifest } from "../scripts/manifest.ts"
import type { Links } from "./src/plan.ts"

/** Refs that name no id in the manifest but point into a drawing: a column, a chart state, a rule. */
const DRAWN_REF = /^(db|sc|rule):/

export function linksOf(m: Manifest): Links {
  const f = m.facts
  const known = new Set<string>([
    ...m.items.map((i) => i.id),
    ...("none" in m.product ? [] : m.product.requirements.map((r) => r.id)),
    ...Object.values(f).flatMap((facts) => (facts ?? []).map((fact) => fact.id)),
  ])
  const out = new Map<string, Set<string>>()
  const add = (a: string, b: string) => { if (!out.has(a)) out.set(a, new Set()); out.get(a)!.add(b) }
  const link = (a: string, to: (string | null | undefined)[] | string | null | undefined) => {
    for (const b of [to ?? []].flat()) {
      if (!b || b === a || !(known.has(b) || DRAWN_REF.test(b))) continue
      add(a, b); add(b, a)
    }
  }

  for (const it of m.items) {
    link(it.id, it.serves)
    if (it.type === "step") { link(it.id, it.delivers); link(it.id, it.mergesAfter); link(it.id, it.startsAfter?.units) }
    if (it.type === "question") link(it.id, it.blocks)
  }
  for (const s of f.screens ?? []) {
    link(s.id, s.serves); link(s.id, s.from); link(s.id, s.chart)
    for (const r of s.regions) { link(s.id, r.component); link(s.id, r.serves) }
  }
  for (const c of f.components ?? []) { link(c.id, c.parent); link(c.id, c.reads); link(c.id, c.serves); link(c.id, c.shows) }
  for (const e of f.endpoints ?? []) {
    link(e.id, e.serves)
    for (const n of e.narrows ?? []) link(e.id, n.serves)
    for (const o of e.outcomes) link(e.id, o.serves)
  }
  for (const a of f.acceptance ?? []) { link(a.id, a.requirement); link(a.id, a.screens); link(a.id, a.guards); link(a.id, a.addedFor) }
  for (const t of f.tests ?? []) { link(t.id, t.proves); link(t.id, t.unit) }
  for (const p of f.prs ?? []) { link(p.id, p.steps); link(p.id, p.after); link(p.id, p.evidence) }
  for (const r of [...(f.risks ?? []), ...(f.defaults ?? [])]) link(r.id, r.serves)

  return Object.fromEntries([...out].sort(([a], [b]) => a.localeCompare(b)).map(([ref, to]) => [ref, [...to].sort()]))
}
