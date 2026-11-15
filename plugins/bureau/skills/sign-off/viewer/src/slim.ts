/** The slim view's rules. Pure, so `scripts/test/slim.test.ts` runs them without a page; `Fold`, `Card` and `QuestionCard` in
 *  parts.tsx apply them, and the shell in App.tsx reads the folds back from the DOM. */
import type { Event, Item, Manifest, SubmitView } from "../../scripts/manifest.ts"
import type { Revs } from "../../scripts/revs.ts"
import { holds, hostOf, isGate, isQuestion, ownsCard } from "./plan.ts"
import { itemState, questionState, type Review } from "./review.ts"

export type View = SubmitView["mode"]
export const VIEW_KEY = "sign-off:view"

/** Slim unless this browser saved full. `pinned` is the record copy's `<meta name="sign-off-view" content="full">`: it wins over
 *  storage, and the page never saves over it. */
export function viewAtBoot(stored: string | null, pinned: string | null): { view: View; pinned: boolean } {
  if (pinned === "full") return { view: "full", pinned: true }
  return { view: stored === "full" ? "full" : "slim", pinned: false }
}

/** `<item>` for the row an item folds to, `<item>/<part>`, or `<item>/<part>:<row>` for one row of a part that repeats.
 *  Manifest ids make it stable for one planRev. */
export const foldKey = (item: string, part?: string, row?: string) => (part === undefined ? item : `${item}/${part}${row === undefined ? "" : `:${row}`}`)

/** `folds` is false for what slim draws open, such as a gate with no verdict yet. `keep` is the content asking for attention: a
 *  view's warning, or an item that waits on the reader. `opened` is the reader's hand or a followed link, for this page load. */
export type FoldFacts = { full: boolean; forced: boolean; keep: boolean; opened: boolean; folds: boolean }
export const isOpen = (f: FoldFacts) => f.full || f.forced || f.keep || f.opened || !f.folds
/** Only a fold the reader opened can be folded again. A fold open by any other rule has no control to close it. */
export const canFold = (f: FoldFacts) => f.opened && f.folds && !f.full && !f.forced && !f.keep

/** The item asks something of the reader now. For a card: no verdict on its gate, a blocking question in it with no answer, or a
 *  note being typed. For a question: blocking with no answer, or an answer being typed. */
export function waitsOn(m: Manifest, r: Review, it: Item): boolean {
  if (isQuestion(it)) return questionState(r, it) === "open" || r.typing[`answer:${it.id}`] !== undefined
  return itemState(r, it) === "open" || r.typing[`back:${it.id}`] !== undefined || r.typing[`comment:${it.id}`] !== undefined
    || m.items.some((q) => isQuestion(q) && questionState(r, q) === "open" && hostOf(m, q) === it)
}

/** The cards and questions that fold in slim, fixed when the page loads so nothing collapses under the reader's click: every FYI
 *  card, a gate the draft had decided, and a question the draft had answered or that runs on a default. */
export function foldingAtBoot(m: Manifest, r: Review): ReadonlySet<string> {
  const folds = (it: Item) => (isQuestion(it) ? r.answers[it.id] !== undefined || !holds(it) : ownsCard(it) && (!isGate(it) || r.verdicts[it.id] !== undefined))
  return new Set(m.items.filter(folds).map((it) => it.id))
}

type Decision = Extract<Event, { type: "verdict" | "answer" }>
const isDecision = (e: Event): e is Decision => e.type === "verdict" || e.type === "answer"
/** The later by `at`; on a tie the later in the log, as `deriveStatus` breaks it. */
const latest = (events: Decision[]) => events.reduce<Decision | undefined>((a, e) => (a && Date.parse(a.at) > Date.parse(e.at) ? a : e), undefined)

/** The items that changed since this reader last saw them, and the card around each one that draws inside another card. Every
 *  fold in them opens, FYI items too. `reader` is the name this browser saved at Submit, or "". `shown` is the item revs this
 *  browser showed at that Submit, or null. A decision in the draft is on the current revision, since the draft is per planRev.
 *  Otherwise the reader's latest decision in the log is compared, then the rev shown at their last Submit, which covers what the
 *  reader never decides. With neither, a `revise` marker opens the item, and with no name so does a decision by anyone on an
 *  earlier revision. This is visibility for one reader: `deriveStatus` stays global settlement. */
export function changedFor(m: Manifest, revs: Revs, events: Event[], reader: string, r: Review, shown: Readonly<Record<string, string>> | null = null): ReadonlySet<string> {
  const changed = (it: Item) => {
    if (r.verdicts[it.id] || r.answers[it.id]) return false
    const now = revs.items[it.id]
    const decided = events.filter(isDecision).filter((e) => e.item === it.id)
    const mine = reader ? latest(decided.filter((e) => e.by === reader)) : undefined
    if (mine) return mine.itemRev !== now
    const before = shown?.[it.id]
    if (before !== undefined) return before !== now
    const revised = events.some((e) => e.type === "revise" && e.item === it.id && e.to === now)
    return revised || (!reader && decided.some((e) => e.itemRev !== now))
  }
  const items = m.items.filter(changed)
  const hosts = items.flatMap((it) => { const host = ownsCard(it) ? undefined : hostOf(m, it); return host ? [host.id] : [] })
  return new Set([...items.map((it) => it.id), ...hosts])
}

/** The "Before review" pair a changed item shows: what the agent said when it revised the item to its current rev, and the
 *  reader's latest send-back note on an earlier rev. With no name, anyone's note counts. */
export function revisedFor(id: string, revs: Revs, events: Event[], reader: string): { agent?: string; yours?: string } {
  const now = revs.items[id]
  const agent = events.findLast((e) => e.type === "revise" && e.item === id && e.to === now)
  const backs = events.filter(isDecision).filter((e) => e.type === "verdict" && e.item === id && e.itemRev !== now && !!e.note && (!reader || e.by === reader))
  const yours = latest(backs)
  return {
    ...(agent?.type === "revise" && { agent: agent.note }),
    ...(yours?.type === "verdict" && yours.note && { yours: yours.note }),
  }
}

/** One fold as the page drew it. `parent` is the nearest fold around it. `part` is the shared key of a part that repeats per row.
 *  `dependent`: the fold has no control of its own and opens with another, so the reader cannot open it and it is not counted. */
export type FoldEntry = { key: string; open: boolean; parent: string | null; part?: string; dependent?: boolean }

/** One entry per key. A key drawn twice is the same fold, and it has a control when any of its elements has one. */
function byKey(folds: readonly FoldEntry[]): Map<string, FoldEntry> {
  const out = new Map<string, FoldEntry>()
  for (const f of folds) {
    const had = out.get(f.key)
    if (!had) out.set(f.key, f)
    else if (had.dependent && !f.dependent) out.set(f.key, { ...had, dependent: false })
  }
  return out
}

/** `drawn`: the folds open with every fold around them open, so their content is on the page. `folded`: the closed folds with no
 *  closed fold around them that the reader can open, the count on the switch. */
export function survey(folds: readonly FoldEntry[]): { drawn: string[]; folded: number } {
  const keys = byKey(folds)
  const shown = (key: string | null): boolean => {
    const f = key === null ? undefined : keys.get(key)
    return !f || (f.open && shown(f.parent))
  }
  const entries = [...keys.values()]
  return {
    drawn: entries.filter((f) => shown(f.key)).map((f) => f.key),
    folded: entries.filter((f) => !f.open && !f.dependent && shown(f.parent)).length,
  }
}

/** The submit record: each fold the reader could open, never drawn open, whose parent was, since a never-opened parent stands for
 *  what it holds. `keys` lists a repeating part with no row ever opened once by its part key, otherwise each row left. `count` is
 *  how many folds the keys stand for, the number the switch showed when nothing had been folded again. */
export function unopened(folds: readonly FoldEntry[], seen: ReadonlySet<string>): { keys: string[]; count: number } {
  const rowSeen = new Set(folds.flatMap((f) => (f.part !== undefined && seen.has(f.key) ? [f.part] : [])))
  const left = [...byKey(folds).values()].filter((f) => !f.dependent && !seen.has(f.key) && (f.parent === null || seen.has(f.parent)))
  return { keys: [...new Set(left.map((f) => (f.part !== undefined && !rowSeen.has(f.part) ? f.part : f.key)))], count: left.length }
}
