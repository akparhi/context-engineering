import { createContext, useContext, useState, type KeyboardEvent, type ReactNode } from "react"
import { CheckIcon, ChevronRightIcon, CircleAlertIcon, MessageSquareIcon, Undo2Icon } from "lucide-react"
import type { Item } from "../../scripts/manifest.ts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { COPY, KIND_LABEL, TOUCH_WHY } from "./copy.ts"
import { defaultWords, holds, hostOf, isGate, ownsCard, type PageData, type Question, type Ref, type RefIndex } from "./plan.ts"
import { itemState, questionState, sentBack, type EditorKey, type Review, type ReviewAction } from "./review.ts"
import { revisedFor } from "./changed.ts"
import { drawBlock, VIEWS } from "./views.tsx"
import { GrantView } from "./views/grant.tsx"
import { UnitCard } from "./views/units.tsx"

/** What every part of the page reads. `act` applies a review action, then focuses the first `[data-focus]` among `focus` after the
 *  redraw, so the control the reader used, or the one that replaced it, keeps focus. `changed` (`changedFor`) and `reader`, the
 *  name this browser saved at Submit, are fixed at boot. */
export type Page = {
  data: PageData
  refs: RefIndex
  review: Review
  focused: { item: string; ref: Ref } | null
  act: (action: ReviewAction, ...focus: string[]) => void
  go: (ref: Ref) => void
  openLinked: (ref: Ref, opener: HTMLElement) => void
  changed: ReadonlySet<string>
  reader: string
}
export const PageContext = createContext<Page | null>(null)
export function usePage() {
  const page = useContext(PageContext)
  if (!page) throw new Error("usePage outside PageContext")
  return page
}

const ID_CHIP = "inline-flex h-5 shrink-0 items-center rounded-md bg-secondary px-1.5 font-mono text-xs font-medium text-foreground ring-1 ring-foreground/10"
/** An id. When the page knows what it names, hovering names it and a press opens the Linked panel. */
export function IdChip({ id }: { id: string }) {
  const { refs, openLinked } = usePage()
  if (!refs.get(id)) return <span className={ID_CHIP}>{id}</span>
  return (
    <button type="button" className={`${ID_CHIP} cursor-pointer hover:ring-foreground/30`} aria-haspopup="dialog" aria-label={COPY.linked.open(id)}
      onClick={(e) => openLinked(id, e.currentTarget)}>{id}</button>
  )
}

export const Subhead = ({ children, extra }: { children: ReactNode; extra?: ReactNode }) => (
  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
    <h4 className="text-xs font-medium text-muted-ink">{children}</h4>
    {extra && <span className="text-xs text-muted-ink">{extra}</span>}
  </div>
)

/** A section that starts closed under its one-line label. */
export const Disclosure = ({ label, children }: { label: ReactNode; children: ReactNode }) => (
  <Collapsible>
    <CollapsibleTrigger className="group flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-ink hover:text-foreground">
      <ChevronRightIcon aria-hidden className="size-4 transition-transform group-data-[panel-open]:rotate-90" />{label}
    </CollapsibleTrigger>
    <CollapsibleContent className="pt-3">{children}</CollapsibleContent>
  </Collapsible>
)

export const LooseEnd = ({ children }: { children: ReactNode }) => (
  <Badge variant="dashed"><CircleAlertIcon />{children}</Badge>
)

export function StatusPill({ item }: { item: Item }) {
  const { review } = usePage()
  const s = itemState(review, item)
  if (s === "open") return <Badge variant="ask">{COPY.item.open}</Badge>
  if (s === "approved") return <Badge variant="pass"><CheckIcon />{COPY.item.approved}</Badge>
  if (sentBack(s)) return <Badge variant="revise"><Undo2Icon />{s === "changes" ? COPY.item.sentBack : COPY.item.objected}</Badge>
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}><Badge variant="dashed">{COPY.item.fyi}</Badge></TooltipTrigger>
      <TooltipContent>{COPY.item.fyiWhy}</TooltipContent>
    </Tooltip>
  )
}

/** `approve` is false on a card, where the step footer holds the one Approve. */
export function VerdictButtons({ item, approve = true }: { item: Item; approve?: boolean }) {
  const { review, act } = usePage()
  const id = item.id, s = itemState(review, item)
  if (review.typing[`back:${id}`] !== undefined) return null
  const draft = (): ReviewAction => ({ type: "open", key: `back:${id}` })
  if (s === "open") return (
    <>
      <Button key="ask" variant="ghost" size="sm" data-focus={`ask-changes:${id}`} onClick={() => act(draft(), `back:${id}`)}>{COPY.item.requestChanges}</Button>
      {approve && <Button key="verdict" variant="outline" size="sm" data-focus={`verdict:${id}`} onClick={() => act({ type: "approve", ids: [id] }, `verdict:${id}`)}><CheckIcon />{COPY.item.approve}</Button>}
    </>
  )
  if (s === "fyi") return <Button key="verdict" variant="ghost" size="xs" data-focus={`verdict:${id}`} onClick={() => act(draft(), `back:${id}`)}>{COPY.item.object}</Button>
  return <Button key="verdict" variant="ghost" size="xs" data-focus={`verdict:${id}`} onClick={() => act({ type: "undo", id }, `verdict:${id}`)}>{COPY.item.undo}</Button>
}

const TEXTAREA = "min-h-16 w-full resize-y rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm leading-6 placeholder:text-muted-foreground aria-invalid:border-revise-line"

/** Escape cancels and Ctrl or Cmd with Enter saves. Escape stops here, so it does not also close the Linked panel. */
const editorKeys = (save: () => void, cancel: () => void) => (e: KeyboardEvent) => {
  if (e.key === "Escape") { e.preventDefault(); cancel() }
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save() }
}

export function BackStrip({ item }: { item: Item }) {
  const { review, act } = usePage()
  const [empty, setEmpty] = useState(false)
  const id = item.id, key: EditorKey = `back:${id}`, gate = isGate(item)
  const typed = review.typing[key]
  const v = review.verdicts[id]
  if (typed === undefined) {
    if (v?.verdict !== "changes") return null
    return (
      <div className="flex items-start gap-2.5 border-b bg-revise-soft/60 px-5 py-3 sm:px-6" data-strip="note">
        <Undo2Icon className="mt-1 size-4 shrink-0 text-revise-ink" />
        <div className="min-w-0 flex-1"><div className="text-xs font-medium text-revise-ink">{COPY.item.yourNote}</div><p className="mt-0.5 max-w-[80ch] text-sm leading-6">{v.note}</p></div>
        <Button variant="ghost" size="xs" data-focus={`edit:${id}`} onClick={() => act({ type: "open", key, text: v.note }, key)}>{COPY.item.edit}</Button>
      </div>
    )
  }
  const cancel = () => { setEmpty(false); act({ type: "close", key }, `edit:${id}`, `ask-changes:${id}`, `verdict:${id}`) }
  const save = () => {
    const note = typed.trim()
    if (!note) { setEmpty(true); act({ type: "type", key, text: typed }, key); return }
    setEmpty(false)
    act({ type: "sendBack", id, note }, `verdict:${id}`)
  }
  return (
    <div className="border-b bg-muted/40 px-5 py-3.5 sm:px-6" data-strip="draft">
      <label className="text-xs font-medium text-muted-ink" htmlFor={`back-${id}`}>{COPY.item.backLabel(gate)}</label>
      <textarea id={`back-${id}`} data-focus={key} value={typed} onChange={(e) => act({ type: "type", key, text: e.target.value })} onKeyDown={editorKeys(save, cancel)}
        className={`${TEXTAREA} mt-1.5 bg-card`} placeholder={COPY.item.backPlaceholder} aria-invalid={empty || undefined} aria-describedby={empty ? `back-${id}-need` : undefined} />
      {empty && <p id={`back-${id}-need`} role="alert" className="mt-1.5 text-xs font-medium text-revise-ink">{COPY.item.backEmpty}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={cancel}>{COPY.item.cancel}</Button>
        <Button variant="outline" size="sm" onClick={save}><Undo2Icon />{COPY.item.sendBack(gate)}</Button>
      </div>
    </div>
  )
}

/** The "Before review" pair for each of `ids` that changed since the reader last saw it: what the agent changed, beside the
 *  reader's own note on the revision before. A changed item drawn inside another card is named. */
function RevisedStrip({ ids }: { ids: string[] }) {
  const { data, changed, reader } = usePage()
  const notes = ids.filter((id) => changed.has(id)).map((id) => ({ id, ...revisedFor(id, data.revs, data.events, reader) })).filter((n) => n.agent || n.yours)
  if (!notes.length) return null
  const note = (label: string, text?: string) => text && <div className="min-w-0"><div className="text-xs font-medium text-revise-ink">{label}</div><p className="mt-0.5 text-sm leading-6">{text}</p></div>
  return (
    <div className="flex flex-col gap-3 border-b bg-revise-soft/40 px-5 py-3 sm:px-6" data-strip="revised">
      {notes.map((n) => (
        <div key={n.id}>
          <div className="text-xs font-medium text-muted-ink">{n.id === ids[0] ? COPY.item.changed : <><IdChip id={n.id} /> {COPY.item.changed}</>}</div>
          <div className="mt-1 grid gap-3 sm:grid-cols-2">{note(COPY.item.agentNote, n.agent)}{note(COPY.item.yourNoteBefore, n.yours)}</div>
        </div>
      ))}
    </div>
  )
}

function CommentButton({ item }: { item: Item }) {
  const { review, act } = usePage()
  const key: EditorKey = `comment:${item.id}`
  if (review.typing[key] !== undefined) return null
  return (
    <Button variant="ghost" size="xs" className="text-muted-ink" data-focus={key} aria-label={COPY.comment.label(item.title)} onClick={() => act({ type: "open", key }, `comment-box:${item.id}`)}>
      <MessageSquareIcon />{COPY.comment.open}
    </Button>
  )
}

function CommentStrip({ item }: { item: Item }) {
  const { review, act } = usePage()
  const key: EditorKey = `comment:${item.id}`, typed = review.typing[key]
  const mine = review.comments.flatMap((c, index) => (c.item === item.id ? [{ ...c, index }] : []))
  if (!mine.length && typed === undefined) return null
  const cancel = () => act({ type: "close", key }, key)
  const save = () => {
    const text = typed?.trim()
    if (text) act({ type: "comment", item: item.id, text }, key)
    else act({ type: "type", key, text: typed ?? "" }, `comment-box:${item.id}`)
  }
  return (
    <div className="flex flex-col gap-2 border-b px-5 py-3 sm:px-6" data-strip="comments">
      {mine.map((c) => (
        <div key={c.index} className="flex items-start gap-2 rounded-2xl bg-revise-soft px-3 py-2 text-sm leading-6" data-comment={item.id}>
          <MessageSquareIcon className="mt-1 size-3.5 shrink-0 text-revise-ink" />
          <span className="min-w-0 flex-1"><span className="text-xs font-medium text-revise-ink">{COPY.comment.yours}{c.anchor && ` · ${c.anchor}`}</span><span className="block">{c.text}</span></span>
          <Button variant="ghost" size="xs" aria-label={COPY.comment.removeLabel(c.text)} onClick={() => act({ type: "uncomment", index: c.index }, key, `item:${item.id}`)}>{COPY.comment.remove}</Button>
        </div>
      ))}
      {typed !== undefined && (
        <div>
          <textarea data-focus={`comment-box:${item.id}`} value={typed} onChange={(e) => act({ type: "type", key, text: e.target.value })} onKeyDown={editorKeys(save, cancel)}
            className={`${TEXTAREA} min-h-12`} placeholder={COPY.comment.placeholder} aria-label={COPY.comment.label(item.title)} />
          <div className="mt-1.5 flex justify-end gap-2">
            <Button variant="ghost" size="xs" onClick={cancel}>{COPY.item.cancel}</Button>
            <Button variant="outline" size="xs" onClick={save}>{COPY.comment.save}</Button>
          </div>
        </div>
      )}
    </div>
  )
}

const CARD = "mt-6 rounded-4xl bg-card text-card-foreground shadow-md"

/** The shell's card for a part, a gate or the grant: the verdict head, the reader's notes, then each block's view. */
export function Card({ item }: { item: Item }) {
  const { review, data, focused, go } = usePage()
  const m = data.manifest
  const blocks = item.body ?? []
  const drawn = item.type === "grant" || (item.type === "step" && blocks.length === 0) || blocks.some((b) => VIEWS[b.view])
  const shell = { links: data.links, sources: data.sources, focus: focused?.item === item.id ? focused.ref : null, go }
  return (
    <article id={`item-${item.id}`} data-item={item.id} data-ref={item.id} data-state={itemState(review, item)} data-focus={`item:${item.id}`} tabIndex={-1}
      className={`${CARD} flex scroll-mt-20 flex-col overflow-clip text-base ring-1 ring-foreground/5 outline-none focus-visible:ring-2 focus-visible:ring-focus dark:ring-foreground/10`}>
      <CardHead item={item} />
      <RevisedStrip ids={[item.id, ...m.items.filter((it) => !ownsCard(it) && hostOf(m, it) === item).map((it) => it.id)]} />
      <BackStrip item={item} />
      <CommentStrip item={item} />
      <div>
        {blocks.map((b, i) => VIEWS[b.view] && <div key={i} className="px-5 py-5 sm:px-6">{drawBlock(data.blocks[`${item.id}:${i}`], shell)}</div>)}
        {item.type === "grant" && <div className="px-5 py-5 sm:px-6"><GrantView grant={item} prs={m.facts.prs ?? []} /></div>}
        {item.type === "step" && blocks.length === 0 && (
          <ol className="px-5 py-5 sm:px-6"><UnitCard step={item} ships={(m.facts.prs ?? []).filter((p) => p.steps.includes(item.id))} go={go} /></ol>
        )}
        {!drawn && <p className="px-5 py-4 text-sm text-muted-ink sm:px-6">{COPY.item.notPorted}</p>}
      </div>
    </article>
  )
}

function CardHead({ item }: { item: Item }) {
  const { review } = usePage()
  const why = "touches" in item ? item.touches.map((t) => TOUCH_WHY[t]).join(". ") : ""
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b px-5 py-3.5 sm:flex-nowrap sm:px-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <h3 className="font-heading text-lg font-medium">{item.title}</h3>
          <StatusPill item={item} />
          {why && itemState(review, item) === "open" && <span className="text-xs text-muted-ink">{why}</span>}
          {item.why && longWhy(item.why) && <Why text={item.why} />}
        </div>
        {item.why && !longWhy(item.why) && <p data-part="why" className="mt-1 max-w-[68ch] text-base leading-7 text-muted-foreground">{item.why}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <CommentButton item={item} /><VerdictButtons item={item} approve={false} />
      </div>
    </header>
  )
}

const WHY_WORDS = 16
const longWhy = (text: string) => text.trim().split(/\s+/).length > WHY_WORDS
/** The planner's reason when it runs past `check`'s budget: one word on the title line that opens it on hover or focus. */
function Why({ text }: { text: string }) {
  return (
    <HoverCard>
      <HoverCardTrigger delay={150} render={<span data-part="why" tabIndex={0} className="cursor-help rounded-sm text-xs text-muted-ink underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-focus" />}>{COPY.item.why}</HoverCardTrigger>
      <HoverCardContent align="start" className="w-[min(34rem,90vw)] leading-6">{text}</HoverCardContent>
    </HoverCard>
  )
}

/** A question: its options or a text box until answered, then the answer and Change. `wide` is one full-width row, the question
 *  left and its controls right, for a question that runs on a default. */
export function QuestionCard({ q, wide = false }: { q: Question; wide?: boolean }) {
  const { review, act } = usePage()
  const s = questionState(review, q)
  const answer = review.answers[q.id]
  const key: EditorKey = `answer:${q.id}`, typed = review.typing[key] ?? ""
  const defaultLabel = defaultWords(q)
  const label = (id: string) => q.options?.find((o) => o.id === id)?.label ?? id
  const answerText = () => { const text = typed.trim(); if (text) act({ type: "answer", id: q.id, answer: { text } }, key) }
  const controls = wide ? "mt-3 lg:mt-0" : "mt-3"
  return (
    <div id={`item-${q.id}`} data-question={q.id} data-ref={q.id} data-state={s}
      className={`scroll-mt-28 rounded-3xl p-4 ring-1 ${s === "open" ? "ring-ask-line" : "ring-foreground/10"} ${wide ? "lg:col-span-2 lg:flex lg:items-center lg:gap-6" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <IdChip id={q.id} />
          {s === "answered" ? <Badge variant="pass"><CheckIcon />{COPY.question.answered}</Badge>
            : s === "open" ? <Badge variant="askline">{COPY.question.open}</Badge>
            : <Badge variant="dashed">{COPY.question.default}</Badge>}
          {q.serves?.map((r) => <IdChip key={r} id={r} />)}
        </div>
        <div className="mt-2 font-medium">{q.title}</div>
        {q.why && <p className="mt-0.5 text-sm text-muted-ink">{q.why}</p>}
        {!answer && !holds(q) && defaultLabel && <p className={`${wide ? "mt-1" : "mt-3"} text-sm leading-6`}><span className="text-muted-ink">{COPY.question.defaultIs}</span> {defaultLabel}</p>}
      </div>
      <div className={wide ? "lg:w-96 lg:shrink-0" : undefined}>
        {answer ? (
          <div className={`${controls} flex flex-wrap items-start justify-between gap-2`}>
            <p className="min-w-0 flex-1 text-sm leading-6"><CheckIcon className="mr-1.5 inline size-4 text-pass-ink" />{"option" in answer ? label(answer.option) : answer.text}</p>
            <Button key="change" variant="ghost" size="xs" data-focus={key} onClick={() => act({ type: "clearAnswer", id: q.id }, key)}>{COPY.question.change}</Button>
          </div>
        ) : q.options?.length ? (
          <div className={`${controls} flex flex-wrap gap-2`} role="group" aria-label={q.title}>
            {q.options.map((o, i) => (
              <Button key={o.id} variant="outline" size="sm" data-focus={i === 0 ? key : undefined} className="h-auto min-h-8 py-1.5 text-left whitespace-normal"
                onClick={() => act({ type: "answer", id: q.id, answer: { option: o.id } }, key)}>
                {o.label}{o.id === q.recommended && <span className="text-xs font-normal text-muted-ink">{COPY.question.recommended}</span>}
              </Button>
            ))}
          </div>
        ) : (
          <form className={`${controls} flex flex-wrap gap-2`} onSubmit={(e) => { e.preventDefault(); answerText() }}>
            <input type="text" data-focus={key} value={typed} onChange={(e) => act({ type: "type", key, text: e.target.value })} placeholder={q.placeholder ?? COPY.question.placeholder} aria-label={q.title}
              className="h-9 min-w-0 flex-1 basis-56 rounded-2xl border border-transparent bg-input/50 px-3 text-sm placeholder:text-muted-foreground" />
            <Button type="submit" variant="outline" size="sm">{COPY.question.answer}</Button>
          </form>
        )}
      </div>
    </div>
  )
}
