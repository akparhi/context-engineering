import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import "../src/views.tsx" // first: the views and views.tsx import each other, and only this order initialises the registry
import { pageData, type PageData } from "../../scripts/build.ts"
import type { Item } from "../../scripts/manifest.ts"
import { Card, PageContext, type Page } from "../src/parts.tsx"
import { ACTS, actOf, holds, isGate, isQuestion, ownsCard, refIndex } from "../src/plan.ts"
import { emptyReview, reduceReview, type Review } from "../src/review.ts"
import { changedFor, foldingAtBoot } from "../src/slim.ts"

const fixture = (name: string) => pageData(resolve(import.meta.dir, "../../fixtures", name))
const FIXTURES = await Promise.all(["plan", "second", "design", "questions"].map(async (name) => [name, await fixture(name)] as const))

/** Every gate approved and every blocking question answered: nothing waits on the reader, so slim folds every card it can. */
function settled(data: PageData): Review {
  const m = data.manifest
  const approved = reduceReview(emptyReview, { type: "approve", ids: m.items.filter(isGate).map((it) => it.id) })
  return m.items.filter(isQuestion).filter(holds).reduce((r, q) => reduceReview(r, { type: "answer", id: q.id, answer: { text: "Yes" } }), approved)
}

/** One card as the page draws it, after a reload with `review` as the draft. */
function draw(data: PageData, item: Item, review: Review, { view = "slim", changed = new Set<string>() }: { view?: Page["slim"]["view"]; changed?: ReadonlySet<string> } = {}) {
  const page: Page = {
    data, refs: refIndex(data.manifest), review, focused: null, act: () => {}, go: () => {}, openLinked: () => {},
    slim: { view, opened: new Set(), setFold: () => {}, changed, folding: foldingAtBoot(data.manifest, review), reader: "" },
  }
  return renderToStaticMarkup(<PageContext.Provider value={page}><Card item={item} /></PageContext.Provider>)
}

const card = (data: PageData, id: string) => data.manifest.items.find((it) => it.id === id)!
const isFolded = (html: string) => /^<article[^>]* data-open="false"/.test(html)
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
/** The texts of the loose-end badges in `html`: a dashed badge led by the alert icon. */
const looseEnds = (html: string) => [...html.matchAll(/<span[^>]*border-dashed[^>]*><svg[^>]*lucide-circle-alert.*?<\/svg>(.*?)<\/span>/g)].map((m) => text(m[1]!))
/** The folded row: everything the article draws before its body, which slim hides. */
const rowOf = (html: string, item: Item) => html.slice(0, html.indexOf(`data-strip`) >= 0 ? html.indexOf(`data-strip`) : html.indexOf(`<div id=`, html.indexOf(item.title)))

/** Every card in the fixtures whose open view draws a loose end, once every gate is decided. */
const LOOSE = FIXTURES.flatMap(([name, data]) => data.manifest.items.filter(ownsCard)
  .filter((it) => looseEnds(draw(data, it, settled(data), { view: "full" })).length > 0)
  .map((it) => [`${name} ${it.id}`, data, it] as const))

describe("a folded card keeps what waits on the reader", () => {
  test("the fixtures draw a loose end in a card of every act", () => {
    expect(new Set(LOOSE.map(([, , it]) => actOf(it)))).toEqual(new Set(ACTS))
  })

  test.each(LOOSE)("%s: a loose end in the open card leaves one in the folded row", (_, data, item) => {
    const folded = draw(data, item, settled(data))
    expect(isFolded(folded)).toBe(true)
    expect(looseEnds(rowOf(folded, item))).not.toEqual([])
  })

  test("a gated step that ships in no pull request keeps the warning in its row", async () => {
    const data = await fixture("second")
    data.manifest.facts.prs = data.manifest.facts.prs!.map((p) => ({ ...p, steps: p.steps.filter((s) => s !== "w-notify") }))
    const step = card(data, "w-notify")
    expect(looseEnds(draw(data, step, settled(data), { view: "full" }))).toEqual(["No pull request"])
    expect(looseEnds(rowOf(draw(data, step, settled(data)), step))).toEqual(["w-notify: No pull request"])
  })

  test("a card folded around a question on a default shows the default in its row", () => {
    const data = FIXTURES[0]![1], scope = card(data, "scope")
    const row = text(rowOf(draw(data, scope, settled(data)), scope))
    expect(row).toContain("Q2 runs on the default. Five books at a time.")
  })

  test("a question that changed since the reader's last Submit opens the card that draws it", () => {
    const data = FIXTURES[0]![1], scope = card(data, "scope"), review = settled(data)
    const changed = (q2: string) => changedFor(data.manifest, data.revs, [], "Ana", review, { ...data.revs.items, Q2: q2 })
    expect(isFolded(draw(data, scope, review, { changed: changed(data.revs.items.Q2!) }))).toBe(true)
    expect(isFolded(draw(data, scope, review, { changed: changed("rev-before") }))).toBe(false)
  })
})
