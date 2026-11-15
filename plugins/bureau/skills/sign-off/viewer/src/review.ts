import type { Item, Manifest, SubmitView } from "../../scripts/manifest.ts"
import { encodeReview, type ReviewPayload } from "../../scripts/codec.ts"
import { reviewText, type ReviewLines } from "./copy.ts"
import { holds, isGate, isQuestion, type PageData, type Question, type Ref } from "./plan.ts"

export type Answer = { option: string } | { text: string }
export type Verdict = { verdict: "approve" } | { verdict: "changes"; note: string }
export type Comment = { item: string; anchor?: Ref; text: string }
/** An open text box. `back:<item>` is a send-back note, `comment:<item>` a comment, `answer:<question>` a free-text answer. */
export type EditorKey = `back:${string}` | `comment:${string}` | `answer:${string}`

/** Everything the reader decided on this revision, plus what they typed and have not sent. The draft in localStorage is this.
 *  `seen` holds the fold keys drawn open for this reader on this revision. Drawn is not read. */
export type Review = {
  verdicts: Record<string, Verdict>
  answers: Record<string, Answer>
  comments: Comment[]
  typing: Partial<Record<EditorKey, string>>
  seen: string[]
}

export type ReviewAction =
  | { type: "approve"; ids: string[] }
  | { type: "undo"; id: string }
  | { type: "open"; key: EditorKey; text?: string }
  | { type: "type"; key: EditorKey; text: string }
  | { type: "close"; key: EditorKey }
  | { type: "sendBack"; id: string; note: string }
  | { type: "answer"; id: string; answer: Answer }
  | { type: "clearAnswer"; id: string }
  | { type: "comment"; item: string; anchor?: Ref; text: string }
  | { type: "uncomment"; index: number }
  | { type: "seen"; keys: string[] }

export const emptyReview: Review = { verdicts: {}, answers: {}, comments: [], typing: {}, seen: [] }

const without = <V>(record: Record<string, V>, key: string) => { const { [key]: _, ...rest } = record; return rest }
const closed = (r: Review, key: EditorKey) => without(r.typing, key)

export function reduceReview(r: Review, a: ReviewAction): Review {
  switch (a.type) {
    case "approve": return { ...r, verdicts: { ...r.verdicts, ...Object.fromEntries(a.ids.map((id) => [id, { verdict: "approve" as const }])) } }
    case "undo": return { ...r, verdicts: without(r.verdicts, a.id) }
    case "open": return { ...r, typing: { ...r.typing, [a.key]: r.typing[a.key] ?? a.text ?? "" } }
    case "type": return { ...r, typing: { ...r.typing, [a.key]: a.text } }
    case "close": return { ...r, typing: closed(r, a.key) }
    case "sendBack": return { ...r, verdicts: { ...r.verdicts, [a.id]: { verdict: "changes", note: a.note } }, typing: closed(r, `back:${a.id}`) }
    case "answer": return { ...r, answers: { ...r.answers, [a.id]: a.answer }, typing: closed(r, `answer:${a.id}`) }
    case "clearAnswer": return { ...r, answers: without(r.answers, a.id) }
    case "comment": return { ...r, comments: [...r.comments, { item: a.item, anchor: a.anchor, text: a.text }], typing: closed(r, `comment:${a.item}`) }
    case "uncomment": return { ...r, comments: r.comments.filter((_, i) => i !== a.index) }
    case "seen": {
      const fresh = a.keys.filter((k) => !r.seen.includes(k))
      return fresh.length ? { ...r, seen: [...r.seen, ...fresh] } : r
    }
  }
}

/** `objected`: an FYI item the reader sent back. */
export type ItemState = "open" | "approved" | "changes" | "fyi" | "objected"
export type QuestionState = "open" | "answered" | "default"

export function itemState(r: Review, it: Item): ItemState {
  const v = r.verdicts[it.id]?.verdict
  if (!isGate(it)) return v === "changes" ? "objected" : "fyi"
  return v === "approve" ? "approved" : v === "changes" ? "changes" : "open"
}
export const questionState = (r: Review, q: Question): QuestionState => (r.answers[q.id] ? "answered" : holds(q) ? "open" : "default")
export const sentBack = (s: ItemState) => s === "changes" || s === "objected"

export function tally(r: Review, items: Item[]) {
  const gates = items.filter(isGate)
  const questions = items.filter(isQuestion)
  const blocking = questions.filter(holds)
  const openGates = gates.filter((it) => itemState(r, it) === "open")
  const openQuestions = blocking.filter((q) => questionState(r, q) === "open")
  const back = items.filter((it) => sentBack(itemState(r, it)))
  return {
    gates, questions, blocking, openGates, openQuestions, back,
    approved: gates.filter((it) => itemState(r, it) === "approved"),
    answered: questions.filter((q) => questionState(r, q) === "answered"),
    waiting: openGates.length + openQuestions.length,
  }
}
export type Tally = ReturnType<typeof tally>

export const resultOf = (t: Tally): ReviewLines["result"] => (t.back.length ? "changes" : t.waiting ? "partial" : "approved")

/** One entry per item the reader acted on, each with the `itemRev` that `build` embedded for it. */
export function toPayload(r: Review, data: PageData, by: string, at: string, view?: SubmitView): ReviewPayload {
  const m = data.manifest
  const items = m.items.flatMap((it) => {
    const v = r.verdicts[it.id], a = r.answers[it.id]
    const comments = r.comments.filter((c) => c.item === it.id).map((c) => (c.anchor ? { anchor: c.anchor, text: c.text } : { text: c.text }))
    if (!v && !a && !comments.length) return []
    const itemRev = data.revs.items[it.id]
    if (!itemRev) throw new Error(`The page has no rev for ${it.id}. Rebuild it with \`sign-off build\`.`)
    return [{
      id: it.id, itemRev,
      ...(v && { verdict: v.verdict }), ...(v?.verdict === "changes" && { note: v.note }),
      ...(a && { answer: "option" in a ? a.option : a.text }),
      ...(comments.length && { comments }),
    }]
  })
  return { v: 1, plan: m.id, planRev: data.revs.planRev, by, at, items, ...(view && { view }) }
}

const answerWords = (q: Question, a: Answer) => ("option" in a ? q.options?.find((o) => o.id === a.option)?.label ?? a.option : a.text)

export function reviewLines(r: Review, m: Manifest, by: string): ReviewLines {
  const t = tally(r, m.items)
  const byId = new Map(m.items.map((it) => [it.id, it]))
  return {
    plan: m.id, title: m.title, revision: m.revision ?? "", by, result: resultOf(t),
    approved: t.approved.map((it) => it.title),
    sentBack: t.back.map((it) => { const v = r.verdicts[it.id]; return { title: it.title, note: v?.verdict === "changes" ? v.note : "" } }),
    answered: t.answered.map((q) => ({ id: q.id, title: q.title, answer: answerWords(q, r.answers[q.id]!) })),
    comments: r.comments.map((c) => ({ on: c.anchor ?? byId.get(c.item)?.title ?? c.item, text: c.text })),
    open: t.openGates.map((it) => it.title),
    unanswered: t.openQuestions.map((q) => ({ id: q.id, title: q.title })),
    defaults: t.questions.filter((q) => questionState(r, q) === "default").map((q) => q.id).sort(),
  }
}

export const buildReviewText = (r: Review, data: PageData, by: string, at: string, view?: SubmitView) =>
  reviewText(reviewLines(r, data.manifest, by), encodeReview(toPayload(r, data, by, at, view)))

/** The draft for one plan revision. A new `planRev` starts a new draft. */
export const draftKey = (data: PageData) => `sign-off:${data.manifest.id}:${data.revs.planRev}`

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x)
const isString = (x: unknown): x is string => typeof x === "string"
const isVerdict = (x: unknown) => isRecord(x) && (x.verdict === "approve" || (x.verdict === "changes" && isString(x.note)))
const isAnswer = (x: unknown) => isRecord(x) && (isString(x.option) || isString(x.text))
const isComment = (x: unknown) => isRecord(x) && isString(x.item) && isString(x.text) && (x.anchor === undefined || isString(x.anchor))

/** localStorage is outside the page's control, so a stored draft is checked before it becomes state. */
export function parseDraft(text: string | null): Review | null {
  if (!text) return null
  let saved: unknown
  try { saved = JSON.parse(text) } catch { return null }
  if (!isRecord(saved) || saved.v !== 1 || !isRecord(saved.review)) return null
  const { verdicts, answers, comments, typing, seen = [] } = saved.review
  if (!isRecord(verdicts) || !Object.values(verdicts).every(isVerdict)) return null
  if (!isRecord(answers) || !Object.values(answers).every(isAnswer)) return null
  if (!Array.isArray(comments) || !comments.every(isComment)) return null
  if (!isRecord(typing) || !Object.values(typing).every(isString)) return null
  if (!Array.isArray(seen) || !seen.every(isString)) return null
  return { ...(saved.review as Omit<Review, "seen">), seen }
}
export const serializeDraft = (r: Review) => JSON.stringify({ v: 1, review: r })
