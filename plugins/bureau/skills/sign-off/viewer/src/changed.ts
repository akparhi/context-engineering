/** What changed since this browser's reader last saw the plan: the items `RevisedStrip` marks, and the "Before review" pair it
 *  draws. Pure apart from the reader id and shown revs this browser saved at Submit. */
import type { Event, Item, Manifest } from "../../scripts/manifest.ts"
import type { Revs } from "../../scripts/revs.ts"
import { hostOf, ownsCard } from "./plan.ts"
import type { Review } from "./review.ts"

// The key once held a typed name, so a reader who typed one keeps it as their id.
const READER_KEY = "sign-off:name"
/** The id this browser's reviews are recorded under, or "" before its first Submit. The shell reads it at boot, to tell what
 *  changed since this reader decided. */
export const readReader = () => { try { return localStorage.getItem(READER_KEY) ?? "" } catch { return "" } }
let pageReader = ""
/** This browser's reader id, made at its first Submit, so each browser's send-back holds until that browser approves. With
 *  storage blocked it lasts as long as the page. */
export function readerAtSubmit(): string {
  pageReader ||= readReader() || `reader-${crypto.randomUUID().slice(0, 8)}`
  try { localStorage.setItem(READER_KEY, pageReader) } catch { /* the id lasts as long as the page */ }
  return pageReader
}
// yagni: per browser, like the reader id; a field on the submit event if a reader moving browsers must see what changed.
const shownKey = (plan: string) => `sign-off:${plan}:shown`
/** The item revs this browser showed at the reader's last Submit of the plan, so the next revision marks what changed since. */
export function readShown(plan: string): Record<string, string> | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(shownKey(plan)) ?? "null")
    return saved && typeof saved === "object" && !Array.isArray(saved) && Object.values(saved).every((v) => typeof v === "string") ? saved as Record<string, string> : null
  } catch { return null }
}
export const saveShown = (plan: string, items: Record<string, string>) => { try { localStorage.setItem(shownKey(plan), JSON.stringify(items)) } catch { /* nothing shows as changed next time */ } }

type Decision = Extract<Event, { type: "verdict" | "answer" }>
const isDecision = (e: Event): e is Decision => e.type === "verdict" || e.type === "answer"
/** The later by `at`; on a tie the later in the log, as `deriveStatus` breaks it. */
const latest = (events: Decision[]) => events.reduce<Decision | undefined>((a, e) => (a && Date.parse(a.at) > Date.parse(e.at) ? a : e), undefined)

/** The items that changed since this reader last saw them, and the card around each one that draws inside another card.
 *  `reader` is the name this browser saved at Submit, or "". `shown` is the item revs this browser showed at that Submit, or
 *  null. A decision in the draft is on the current revision, since the draft is per planRev. Otherwise the reader's latest
 *  decision in the log is compared, then the rev shown at their last Submit, which covers what the reader never decides. With
 *  neither, a `revise` marker marks the item, and with no name so does a decision by anyone on an earlier revision. This is
 *  visibility for one reader: `deriveStatus` stays global settlement. */
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
