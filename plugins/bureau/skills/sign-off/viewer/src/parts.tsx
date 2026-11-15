import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, CircleAlertIcon, MessageSquareIcon, Undo2Icon } from "lucide-react"
import type { Item } from "../../scripts/manifest.ts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { COPY, TOUCH_WHY } from "./copy.ts"
import { defaultWords, holds, hostOf, isGate, isQuestion, ownsCard, type PageData, type Question, type Ref, type RefIndex } from "./plan.ts"
import { itemState, questionState, sentBack, type EditorKey, type Review, type ReviewAction } from "./review.ts"
import { canFold, foldKey, isOpen, revisedFor, waitsOn, type FoldFacts, type View } from "./slim.ts"
import { drawBlock, rowOf, VIEWS } from "./views.tsx"
import { GrantView, grantRow } from "./views/grant.tsx"
import { UnitCard, unitsRow } from "./views/units.tsx"

/** What every part of the page reads. `act` applies a review action, then focuses the first `[data-focus]` among `focus` after the
 *  redraw, so the control the reader used, or the one that replaced it, keeps focus. */
export type Page = {
  data: PageData
  refs: RefIndex
  review: Review
  focused: { item: string; ref: Ref } | null
  act: (action: ReviewAction, ...focus: string[]) => void
  go: (ref: Ref) => void
  openLinked: (ref: Ref, opener: HTMLElement) => void
  slim: Slim
}
/** The slim view's state, all owned by the shell. `opened` holds the folds opened by hand or by a followed link, until reload.
 *  `setFold` opens or folds one, then focuses the first `[data-focus]` among `focus`. `changed`, `folding` and `reader`, the
 *  name this browser saved at Submit, are fixed at boot. */
export type Slim = {
  view: View
  opened: ReadonlySet<string>
  setFold: (key: string, open: boolean, ...focus: string[]) => void
  changed: ReadonlySet<string>
  folding: ReadonlySet<string>
  reader: string
}
export const PageContext = createContext<Page | null>(null)
export function usePage() {
  const page = useContext(PageContext)
  if (!page) throw new Error("usePage outside PageContext")
  return page
}

const ID_CHIP = "inline-flex h-5 shrink-0 items-center rounded-md bg-secondary px-1.5 font-mono text-xs font-medium text-foreground ring-1 ring-foreground/10"
/** An id. When the page knows what it names, it opens the Linked panel. */
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
    <h4 className="text-xs font-medium tracking-wide text-muted-ink uppercase">{children}</h4>
    {extra && <span className="text-xs text-muted-ink">{extra}</span>}
  </div>
)

export const LooseEnd = ({ children }: { children: ReactNode }) => (
  <Badge variant="dashed"><CircleAlertIcon />{children}</Badge>
)

/** The card a fold sits in. `forced`: the item changed since the reader last saw it (`changedFor`), so every fold in it opens. */
const FoldScope = createContext<{ item: string; forced: boolean } | null>(null)

/** Sets `hidden="until-found"` on a closed body, which React does not render, and opens the fold when find in page or a link to an
 *  id reveals it. `beforematch` also reaches a fold from a match in a fold inside it, and can fire twice, so `reveal` must be
 *  idempotent. A browser without `until-found` treats it as plain `hidden`, and find in page misses the folded text. */
function useUntilFound(closed: boolean, reveal: () => void) {
  const body = useRef<HTMLDivElement>(null)
  const onReveal = useRef(reveal)
  onReveal.current = reveal
  useLayoutEffect(() => {
    if (closed) body.current?.setAttribute("hidden", "until-found")
    else body.current?.removeAttribute("hidden")
  }, [closed])
  useEffect(() => {
    const el = body.current
    const on = () => onReveal.current()
    el?.addEventListener("beforematch", on)
    return () => el?.removeEventListener("beforematch", on)
  }, [])
  return body
}

/** Shows or folds one fold, then focuses its button in the new state, or the card itself when a rule left it no button. */
function FoldButton({ foldKey: key, open, controls, label }: { foldKey: string; open: boolean; controls: string; label?: string }) {
  const { slim } = usePage()
  return (
    <Button variant="ghost" size="xs" data-focus={`fold:${key}`} aria-expanded={open} aria-controls={controls} aria-label={label}
      onClick={() => slim.setFold(key, !open, `fold:${key}`, `item:${key}`)}>
      {open ? <ChevronUpIcon /> : <ChevronDownIcon />}{open ? COPY.fold.hide : COPY.fold.show}
    </Button>
  )
}

/** A part slim folds. Closed, it draws `summary` and a Show button, and its children stay in the page, hidden until found, so the
 *  fold's keys stay countable and find in page still opens it. With no `summary` it draws nothing closed, has no control, and
 *  opens with the part of the same key or with `keep`; neither the switch nor the record counts it. `row` keys one row of a part that repeats. `keep` holds it open: the view says the content needs
 *  attention, such as a broken rule. A followed link opens every fold around its target, so a view declares nothing for links. */
export function Fold({ part, row, summary, keep = false, className, children }: {
  part: string; row?: string; summary?: ReactNode; keep?: boolean; className?: string; children: ReactNode
}) {
  const scope = useContext(FoldScope)
  if (!scope) throw new Error("Fold outside a card")
  const { slim } = usePage()
  const key = foldKey(scope.item, part, row)
  const facts: FoldFacts = { full: slim.view === "full", forced: scope.forced, keep, opened: slim.opened.has(key), folds: true }
  const open = isOpen(facts)
  const id = useId()
  const body = useUntilFound(!open, () => slim.setFold(key, true))
  const toggle = summary !== undefined && (!open || canFold(facts))
  return (
    <div data-fold={key} data-open={open} data-fold-part={row === undefined ? undefined : foldKey(scope.item, part)} data-fold-dependent={summary === undefined ? "" : undefined} className={className}>
      {toggle && <div className="flex flex-wrap items-center gap-x-2 gap-y-1">{!open && summary}<FoldButton foldKey={key} open={open} controls={id} /></div>}
      <div ref={body} id={id}>{children}</div>
    </div>
  )
}

/** Opens a fold of the card it is called in, for a view control that needs a folded part on screen, such as a stepper that lights
 *  the chart. */
export function useOpenFold() {
  const scope = useContext(FoldScope)
  const { slim } = usePage()
  return (part: string, row?: string) => { if (scope) slim.setFold(foldKey(scope.item, part, row), true) }
}

/** Whether the reader opened any row of `part` in the card it is called in. */
export function useRowOpened(part: string) {
  const scope = useContext(FoldScope)
  const { slim } = usePage()
  const prefix = scope ? `${foldKey(scope.item, part)}:` : null
  return prefix !== null && [...slim.opened].some((k) => k.startsWith(prefix))
}

/** Drawn in the full view only: a cross-reference whose facts the Linked panel or another part already shows. It is not a fold
 *  and never counts. A warning or loose end must stay outside it, or slim hides the warning. */
export function FullOnly({ children }: { children: ReactNode }) {
  return usePage().slim.view === "full" ? children : null
}

export function StatusPill({ item }: { item: Item }) {
  const { review } = usePage()
  const s = itemState(review, item)
  if (s === "open") return <Badge variant="ask">{COPY.item.open}</Badge>
  if (s === "approved") return <Badge variant="pass"><CheckIcon />{COPY.item.approved}</Badge>
  if (sentBack(s)) return <Badge variant="revise"><Undo2Icon />{s === "changes" ? COPY.item.sentBack : COPY.item.objected}</Badge>
  return <Badge variant="dashed">{COPY.item.fyi}</Badge>
}

export function VerdictButtons({ item }: { item: Item }) {
  const { review, act } = usePage()
  const id = item.id, s = itemState(review, item)
  if (review.typing[`back:${id}`] !== undefined) return null
  const draft = (): ReviewAction => ({ type: "open", key: `back:${id}` })
  if (s === "open") return (
    <>
      <Button key="ask" variant="ghost" size="sm" data-focus={`ask-changes:${id}`} onClick={() => act(draft(), `back:${id}`)}>{COPY.item.requestChanges}</Button>
      <Button key="verdict" variant="outline" size="sm" data-focus={`verdict:${id}`} onClick={() => act({ type: "approve", ids: [id] }, `verdict:${id}`)}><CheckIcon />{COPY.item.approve}</Button>
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

function BackStrip({ item }: { item: Item }) {
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
  const { data, slim } = usePage()
  const notes = ids.filter((id) => slim.changed.has(id)).map((id) => ({ id, ...revisedFor(id, data.revs, data.events, slim.reader) })).filter((n) => n.agent || n.yours)
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
const ROW = "mt-3 rounded-3xl bg-card/70"

/** The shell's card for a part, a gate or the grant: the verdict head, the reader's notes, then each block's view. Slim folds it to
 *  a row, the item's own fold. The body stays in the page, hidden until found, so the folds inside it stay countable. */
export function Card({ item }: { item: Item }) {
  const { review, data, focused, go, slim } = usePage()
  const m = data.manifest
  const blocks = item.body ?? []
  const drawn = item.type === "grant" || (item.type === "step" && blocks.length === 0) || blocks.some((b) => VIEWS[b.view])
  const asks = blocks.some((b) => VIEWS[b.view]?.asks)
  const questions = asks ? [] : m.items.filter(isQuestion).filter((q) => hostOf(m, q) === item)
  const shell = { links: data.links, sources: data.sources, focus: focused?.item === item.id ? focused.ref : null, go }
  const facts: FoldFacts = {
    full: slim.view === "full", forced: slim.changed.has(item.id), keep: waitsOn(m, review, item), opened: slim.opened.has(item.id), folds: slim.folding.has(item.id),
  }
  const open = isOpen(facts)
  const id = useId()
  const body = useUntilFound(!open, () => slim.setFold(item.id, true))
  return (
    <article id={`item-${item.id}`} data-item={item.id} data-ref={item.id} data-state={itemState(review, item)} data-focus={`item:${item.id}`} tabIndex={-1}
      data-fold={item.id} data-open={open} data-folded={open ? undefined : ""}
      className={`${open ? CARD : ROW} flex scroll-mt-20 flex-col overflow-hidden text-sm ring-1 ring-foreground/5 outline-none focus-visible:ring-2 focus-visible:ring-focus dark:ring-foreground/10`}>
      {open ? <CardHead item={item} body={id} canFold={canFold(facts)} /> : <RowHead item={item} body={id} />}
      <RevisedStrip ids={[item.id, ...m.items.filter((it) => !ownsCard(it) && hostOf(m, it) === item).map((it) => it.id)]} />
      <BackStrip item={item} />
      <CommentStrip item={item} />
      <div ref={body} id={id}>
        <FoldScope.Provider value={{ item: item.id, forced: facts.forced }}>
          {blocks.map((b, i) => VIEWS[b.view] && <div key={i} className="px-5 py-5 sm:px-6">{drawBlock(data.blocks[`${item.id}:${i}`], shell)}</div>)}
          {item.type === "grant" && <div className="px-5 py-5 sm:px-6"><GrantView grant={item} prs={m.facts.prs ?? []} /></div>}
          {item.type === "step" && blocks.length === 0 && (
            <ol className="px-5 py-5 sm:px-6"><UnitCard step={item} ships={(m.facts.prs ?? []).filter((p) => p.steps.includes(item.id))} go={go} /></ol>
          )}
          {!drawn && <p className="px-5 py-4 text-sm text-muted-ink sm:px-6">{COPY.item.notPorted}</p>}
          {questions.length > 0 && (
            <div className="grid gap-3 px-5 pb-5 sm:px-6 lg:grid-cols-2">{questions.map((q) => <QuestionCard key={q.id} q={q} />)}</div>
          )}
        </FoldScope.Provider>
      </div>
    </article>
  )
}

function CardHead({ item, body, canFold }: { item: Item; body: string; canFold: boolean }) {
  const { review } = usePage()
  const why = "touches" in item ? item.touches.map((t) => TOUCH_WHY[t]).join(". ") : ""
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <h3 className="font-heading text-lg font-medium">{item.title}</h3>
          <StatusPill item={item} />
          {why && itemState(review, item) === "open" && <span className="text-xs text-muted-ink">{why}</span>}
        </div>
        {item.why && <p className="mt-1 max-w-[68ch] text-sm leading-6 text-muted-foreground">{item.why}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CommentButton item={item} /><VerdictButtons item={item} />{canFold && <FoldButton foldKey={item.id} open controls={body} />}
      </div>
    </header>
  )
}

/** The row slim folds a card to: its title and status, what its views say, every loose end in them, the default each question in
 *  it runs on, and its verdict buttons. */
function RowHead({ item, body }: { item: Item; body: string }) {
  const { data, review } = usePage()
  const m = data.manifest, prs = m.facts.prs ?? []
  const lines = (item.body ?? []).flatMap((_, i) => rowOf(data.blocks[`${item.id}:${i}`]) ?? [])
  if (item.type === "grant") lines.push(grantRow(item, prs))
  if (item.type === "step" && !item.body?.length) lines.push({ ...unitsRow({ steps: [item], ships: { [item.id]: prs.filter((p) => p.steps.includes(item.id)) } }), says: "" })
  const says = lines.map((l) => l.says).filter(Boolean).join(". ")
  const loose = lines.flatMap((l) => l.loose)
  const defaults = m.items.filter(isQuestion).filter((q) => hostOf(m, q) === item && questionState(review, q) === "default")
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1"><span className="font-medium">{item.title}</span><StatusPill item={item} />{says && <span className="text-muted-ink">{says}</span>}</div>
        {loose.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5" data-part="row-loose">{loose.map((l, i) => <LooseEnd key={i}>{l}</LooseEnd>)}</div>}
        {defaults.map((q) => (
          <p key={q.id} className="mt-1.5 max-w-[80ch] text-sm leading-6" data-part="row-default"><span className="text-muted-ink">{COPY.question.runsOn(q.id)}</span> {defaultWords(q)}</p>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2"><VerdictButtons item={item} /><FoldButton foldKey={item.id} open={false} controls={body} label={`${COPY.fold.show} ${item.title}`} /></div>
    </div>
  )
}

/** A question. Slim folds one the draft had answered to its answer and Change, and one that runs on a default to that default and
 *  Show. A blocking question with no answer stays open. */
export function QuestionCard({ q }: { q: Question }) {
  const { review, act, data, slim } = usePage()
  const scope = useContext(FoldScope)
  const s = questionState(review, q)
  const answer = review.answers[q.id]
  const key: EditorKey = `answer:${q.id}`, typed = review.typing[key] ?? ""
  const defaultLabel = defaultWords(q)
  const label = (id: string) => q.options?.find((o) => o.id === id)?.label ?? id
  const answerText = () => { const text = typed.trim(); if (text) act({ type: "answer", id: q.id, answer: { text } }, key) }
  const facts: FoldFacts = {
    full: slim.view === "full", forced: slim.changed.has(q.id) || scope?.forced === true, keep: waitsOn(data.manifest, review, q),
    opened: slim.opened.has(q.id), folds: slim.folding.has(q.id),
  }
  const open = isOpen(facts)
  const id = useId()
  const body = useUntilFound(!open, () => slim.setFold(q.id, true))
  const defaultLine = !holds(q) && defaultLabel && <p className="mt-3 text-sm leading-6"><span className="text-muted-ink">{COPY.question.defaultIs}</span> {defaultLabel}</p>
  return (
    <div id={`item-${q.id}`} data-question={q.id} data-ref={q.id} data-state={s} data-fold={q.id} data-open={open} data-fold-dependent={answer ? "" : undefined}
      className={`scroll-mt-28 rounded-3xl p-4 ring-1 ${s === "open" ? "ring-ask-line" : "ring-foreground/10"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <IdChip id={q.id} />
        {s === "answered" ? <Badge variant="pass"><CheckIcon />{COPY.question.answered}</Badge>
          : s === "open" ? <Badge variant="askline">{COPY.question.open}</Badge>
          : <Badge variant="dashed">{COPY.question.default}</Badge>}
        {q.serves?.map((r) => <IdChip key={r} id={r} />)}
        {open && canFold(facts) && <span className="ml-auto"><FoldButton foldKey={q.id} open controls={id} /></span>}
      </div>
      <div className="mt-2 font-medium">{q.title}</div>
      {!open && !answer && <div className="flex flex-wrap items-baseline gap-x-2">{defaultLine}<FoldButton foldKey={q.id} open={false} controls={id} /></div>}
      <div ref={body} id={id}>
        {q.why && <p className="mt-0.5 text-sm text-muted-ink">{q.why}</p>}
        {answer ? null : q.options?.length ? (
          <>
            {defaultLine}
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={q.title}>
              {q.options.map((o, i) => (
                <Button key={o.id} variant="outline" size="sm" data-focus={i === 0 ? key : undefined} className="h-auto min-h-8 py-1.5 text-left whitespace-normal"
                  onClick={() => act({ type: "answer", id: q.id, answer: { option: o.id } }, key)}>
                  {o.label}{o.id === q.recommended && <span className="text-xs font-normal text-muted-ink">{COPY.question.recommended}</span>}
                </Button>
              ))}
            </div>
          </>
        ) : (
          <>
            {defaultLine}
            <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); answerText() }}>
              <input type="text" data-focus={key} value={typed} onChange={(e) => act({ type: "type", key, text: e.target.value })} placeholder={q.placeholder ?? COPY.question.placeholder} aria-label={q.title}
                className="h-9 min-w-0 flex-1 basis-56 rounded-2xl border border-transparent bg-input/50 px-3 text-sm placeholder:text-muted-foreground" />
              <Button type="submit" variant="outline" size="sm">{COPY.question.answer}</Button>
            </form>
          </>
        )}
      </div>
      {answer && (
        <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
          <p className="min-w-0 flex-1 text-sm leading-6"><CheckIcon className="mr-1.5 inline size-4 text-pass-ink" />{"option" in answer ? label(answer.option) : answer.text}</p>
          <Button key="change" variant="ghost" size="xs" data-focus={key} onClick={() => { slim.setFold(q.id, true); act({ type: "clearAnswer", id: q.id }, key) }}>{COPY.question.change}</Button>
        </div>
      )}
    </div>
  )
}
