import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type MouseEvent, type ReactNode } from "react"
import { CheckIcon, CircleCheckIcon, CircleDashedIcon, DownloadIcon, ExternalLinkIcon, FoldVerticalIcon, MoonIcon, SendIcon, SunIcon, UnfoldVerticalIcon } from "lucide-react"
import type { Item, Manifest, SubmitView } from "../../scripts/manifest.ts"
import type { Act } from "../../scripts/model.ts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ACT_COPY, actEyebrow, COPY } from "./copy.ts"
import { LinkedPanel } from "./linked.tsx"
import { Card, PageContext, QuestionCard, usePage, type Page } from "./parts.tsx"
import { ACTS, actOf, hostOf, isQuestion, ownsCard, refIndex, type PageData, type Ref } from "./plan.ts"
import { draftKey, emptyReview, itemState, parseDraft, questionState, reduceReview, serializeDraft, tally, type ItemState, type ReviewAction } from "./review.ts"
import { changedFor, foldingAtBoot, survey, unopened, VIEW_KEY, viewAtBoot, type FoldEntry, type View } from "./slim.ts"
import { readName, readShown, saveAs, SubmitDialog } from "./submit.tsx"

const THEME_KEY = "sign-off:theme"
/** Called before the first render, so a dark page never paints light first. */
export function applySavedTheme() {
  let saved: string | null = null
  try { saved = localStorage.getItem(THEME_KEY) } catch { /* no storage: follow the system */ }
  document.documentElement.classList.toggle("dark", saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches)
}

type DraftSays = keyof typeof COPY.draft
function loadDraft(key: string) {
  try { const review = parseDraft(localStorage.getItem(key)); return { review: review ?? emptyReview, says: (review ? "restored" : "kept") as DraftSays } }
  catch { return { review: emptyReview, says: "none" as DraftSays } }
}
const NARROW = "(max-width: 767px)"
const FLASH_MS = 1900

/** Every fold on the page, read from the attributes `Fold`, `Card` and `QuestionCard` publish. There is no second registry. */
function readFolds(): FoldEntry[] {
  return [...document.querySelectorAll<HTMLElement>("[data-fold]")].map((el) => ({
    key: el.dataset.fold!, open: el.dataset.open === "true", part: el.dataset.foldPart, dependent: el.dataset.foldDependent !== undefined,
    parent: el.parentElement?.closest<HTMLElement>("[data-fold]")?.dataset.fold ?? null,
  }))
}
/** The closed folds at `target` and around it, which a followed link opens. */
function closedAround(target: Element): string[] {
  const keys: string[] = []
  for (let el = target.closest<HTMLElement>("[data-fold]"); el; el = el.parentElement?.closest<HTMLElement>("[data-fold]") ?? null) {
    if (el.dataset.open === "false") keys.push(el.dataset.fold!)
  }
  return keys
}
/** The first drawn card, fold or ref whose top is under the nav, and that top. A toggle restores it, so the page keeps its place. */
function anchorUnderNav(): { el: Element; top: number } | null {
  const below = document.querySelector("[data-nav]")?.getBoundingClientRect().bottom ?? 0
  for (const el of document.querySelectorAll("main [data-item], main [data-fold], main [data-ref]")) {
    if (el.closest("[hidden]")) continue
    const top = el.getBoundingClientRect().top
    if (top >= below) return { el, top }
  }
  return null
}
/** The anchor, or the fold that now hides it. */
const visibleFrom = (el: Element): Element => { const hidden = el.closest("[hidden]"); return hidden?.parentElement ? visibleFrom(hidden.parentElement) : el }

function bootSlim(data: PageData, review: Page["review"]) {
  let stored: string | null = null
  try { stored = localStorage.getItem(VIEW_KEY) } catch { /* no storage: slim */ }
  const pinned = document.querySelector<HTMLMetaElement>('meta[name="sign-off-view"]')?.content ?? null
  const reader = readName()
  return {
    ...viewAtBoot(stored, pinned),
    reader,
    changed: changedFor(data.manifest, data.revs, data.events, reader, review, readShown(data.manifest.id)),
    folding: foldingAtBoot(data.manifest, review),
  }
}

/** `builtPage` is the file as it was built, read before React drew anything. Share downloads it, not the live page. */
export function App({ data, builtPage }: { data: PageData; builtPage: string }) {
  const m = data.manifest
  const refs = useMemo(() => refIndex(m), [m])
  const key = draftKey(data)
  const [boot] = useState(() => { const draft = loadDraft(key); return { ...draft, slim: bootSlim(data, draft.review) } })
  const [review, dispatch] = useReducer(reduceReview, boot.review)
  const [draftSays, setDraftSays] = useState<DraftSays>(boot.says)
  const [view, setView] = useState<View>(boot.slim.view)
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const [folded, setFolded] = useState(0)
  const [focused, setFocused] = useState<Page["focused"]>(null)
  const [linked, setLinked] = useState<{ ref: Ref; opener: HTMLElement | null } | null>(null)
  const [submit, setSubmit] = useState<{ from: HTMLElement; record: SubmitView } | null>(null)
  const focusNext = useRef<string[]>([])
  const goNext = useRef<{ ref: Ref; home: string | undefined; narrow: boolean; opening: boolean } | null>(null)
  const anchor = useRef<{ el: Element; top: number } | null>(null)

  useEffect(() => {
    try { localStorage.setItem(key, serializeDraft(review)) } catch { setDraftSays("none") }
  }, [key, review])

  // After every render: the count on the switch, and each fold drawn open joins the draft's `seen`. The record copy shares the
  // draft's key and always draws full, so it adds nothing.
  useEffect(() => {
    const now = survey(readFolds())
    setFolded(now.folded)
    const fresh = boot.slim.pinned ? [] : now.drawn.filter((k) => !review.seen.includes(k))
    if (fresh.length) dispatch({ type: "seen", keys: fresh })
  })

  useLayoutEffect(() => {
    const a = anchor.current
    anchor.current = null
    if (a?.el.isConnected) { const el = visibleFrom(a.el); window.scrollBy(0, el.getBoundingClientRect().top - a.top) }
    const keys = focusNext.current
    focusNext.current = []
    for (const k of keys) {
      const el = document.querySelector<HTMLElement>(`[data-focus="${CSS.escape(k)}"]`)
      if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: "nearest" }); break }
    }
    const g = goNext.current
    if (!g) return
    const card = g.home ? document.getElementById(`item-${g.home}`) : null
    const target = (g.ref === g.home ? null : (card ?? document).querySelector<HTMLElement>(`[data-ref="${CSS.escape(g.ref)}"]`)) ?? card
    // A closed fold hides the target, so open it and every fold around it, and scroll after that redraw.
    const closed = target && !g.opening ? closedAround(target) : []
    if (closed.length) { g.opening = true; setOpened((o) => new Set([...o, ...closed])); return }
    goNext.current = null
    if (!target) return
    target.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
    target.setAttribute("data-flash", "")
    setTimeout(() => target.removeAttribute("data-flash"), FLASH_MS)
    if (g.narrow) (target.tabIndex >= 0 || target === card ? target : card)?.focus({ preventScroll: true })
  })

  const act = useCallback((action: ReviewAction, ...focus: string[]) => { focusNext.current = focus; dispatch(action) }, [])
  const linkedNow = useRef(linked)
  linkedNow.current = linked
  const closeLinked = useCallback((returnFocus: boolean) => {
    const opener = linkedNow.current?.opener
    setLinked(null)
    if (returnFocus && opener?.isConnected) opener.focus({ preventScroll: true })
  }, [])
  const openLinked = useCallback((ref: Ref, opener: HTMLElement) => {
    setLinked((l) => ({ ref, opener: l && opener.closest("[data-linked]") ? l.opener : opener }))
  }, [])
  /** Every in-page link to an item or a ref comes here. A question outside any card has no home and is found by its own ref. */
  const go = useCallback((ref: Ref) => {
    const info = refs.get(ref)
    if (!info) return
    const narrow = matchMedia(NARROW).matches
    if (narrow) closeLinked(false)
    setFocused({ item: info.home ?? ref, ref })
    goNext.current = { ref, home: info.home, narrow, opening: false }
  }, [refs, closeLinked])
  const setFold = useCallback((key: string, open: boolean, ...focus: string[]) => {
    if (focus.length) focusNext.current = focus
    setOpened((o) => { const next = new Set(o); if (open) next.add(key); else next.delete(key); return next })
  }, [])
  /** `keep`: save the choice for every later plan, as the switch does. */
  const toggleView = (keep: boolean) => {
    const next = view === "slim" ? "full" : "slim"
    anchor.current = anchorUnderNav()
    focusNext.current = ["view"]
    if (keep && !boot.slim.pinned) try { localStorage.setItem(VIEW_KEY, next) } catch { /* the choice lasts this visit */ }
    setView(next)
  }

  const page: Page = { data, refs, review, focused, act, go, openLinked, slim: { view, opened, setFold, changed: boot.slim.changed, folding: boot.slim.folding, reader: boot.slim.reader } }
  const acts = ACTS.filter((a) => m.items.some((it) => actOf(it) === a) || (a === "product" && "none" in m.product))
  /** What the review records about the view. A fold drawn in this render counts, even before the effect adds it to `seen`. */
  const record = (): SubmitView => {
    const folds = readFolds()
    const left = unopened(folds, new Set([...review.seen, ...survey(folds).drawn]))
    return { mode: view, unopened: left.keys, count: left.count }
  }
  const openSubmit = (e: MouseEvent<HTMLElement>) => setSubmit({ from: e.currentTarget, record: record() })
  const closeSubmit = () => { submit?.from.focus(); setSubmit(null) }
  const showAllFromSubmit = () => { setSubmit(null); if (view === "slim") toggleView(false) }

  return (
    <PageContext.Provider value={page}>
      <div className="min-h-dvh bg-background px-4 pb-24 font-sans text-foreground antialiased">
        <Nav acts={acts} folded={folded} onView={() => toggleView(true)} onSubmit={openSubmit}
          onShare={() => saveAs(`${m.id}-${m.revision ?? "plan"}.html`, builtPage, "text/html")} onTheme={(k) => { focusNext.current = [k] }} />
        <Header manifest={m} draftSays={draftSays} />
        <main>
          {acts.map((a) => <ActSection key={a} act={a} onSubmit={openSubmit} />)}
        </main>
        <footer className="mx-auto max-w-6xl px-1 pt-8 text-xs leading-5 text-muted-ink">{COPY.footer}</footer>
      </div>
      {linked && <LinkedPanel at={linked.ref} onClose={() => closeLinked(true)} onRecenter={(ref) => setLinked((l) => l && { ...l, ref })} />}
      {submit && <SubmitDialog acts={acts} record={submit.record} onShowAll={showAllFromSubmit} onClose={closeSubmit} />}
    </PageContext.Provider>
  )
}

function useTheme(onToggle: (focusKey: string) => void) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"))
  useEffect(() => { document.documentElement.classList.toggle("dark", dark) }, [dark])
  const toggle = () => {
    onToggle("theme")
    setDark((d) => { try { localStorage.setItem(THEME_KEY, d ? "light" : "dark") } catch { /* the choice lasts this visit */ } return !d })
  }
  return { dark, toggle }
}

/** `folded` is the count of closed folds with no closed fold around them, read from the page after each render. */
function Nav({ acts, folded, onView, onSubmit, onShare, onTheme }: {
  acts: Act[]; folded: number; onView: () => void; onSubmit: (e: MouseEvent<HTMLElement>) => void; onShare: () => void; onTheme: (focusKey: string) => void
}) {
  const { data, review, slim } = usePage()
  const m = data.manifest
  const { dark, toggle } = useTheme(onTheme)
  const isSlim = slim.view === "slim"
  return (
    <div data-nav className="sticky top-0 z-30 -mx-4 border-b border-border/70 bg-background/85 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-1.5">
        <span className="mr-1 hidden font-heading text-sm font-medium lg:inline">{m.id}</span>
        <nav aria-label={COPY.nav.acts} className="scrollbar-none flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {acts.map((a) => {
            const t = tally(review, m.items.filter((it) => actOf(it) === a))
            return (
              <a key={a} href={`#act-${a}`} data-act={a} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full pr-2.5 pl-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                <span className="grid size-6 place-items-center rounded-full bg-act-paper-strong text-xs font-medium text-foreground">{ACT_COPY[a].n}</span>
                <span className="hidden sm:inline">{ACT_COPY[a].short}</span>
                {t.waiting ? <span className="text-xs font-medium text-ask-ink tabular-nums">{t.waiting}</span>
                  : t.gates.length ? <CheckIcon className="size-3.5 text-pass-ink" aria-label={COPY.nav.nothingWaits} /> : null}
              </a>
            )
          })}
        </nav>
        <Button variant="ghost" size="sm" data-focus="view" data-view={slim.view} onClick={onView}
          title={isSlim ? COPY.nav.showAllTitle(folded) : COPY.nav.slimTitle} aria-label={isSlim ? `${COPY.nav.showAll}, ${COPY.nav.folded(folded)}` : COPY.nav.slim}>
          {isSlim ? <UnfoldVerticalIcon /> : <FoldVerticalIcon />}<span className="hidden lg:inline">{isSlim ? COPY.nav.showAll : COPY.nav.slim}</span>
          {isSlim && <span className="tabular-nums" data-folded-count>{folded}</span>}
        </Button>
        <Button variant="ghost" size="icon-sm" data-focus="theme" onClick={toggle} aria-label={COPY.nav.theme(dark)} title={COPY.nav.theme(dark)}>
          {dark ? <SunIcon /> : <MoonIcon />}
        </Button>
        <Button variant="ghost" size="sm" title={COPY.nav.shareTitle} onClick={onShare}><DownloadIcon /><span className="hidden md:inline">{COPY.nav.share}</span></Button>
        <Button size="sm" data-focus="submit:nav" aria-haspopup="dialog" onClick={onSubmit}><SendIcon />{COPY.nav.submit}</Button>
      </div>
    </div>
  )
}

/** An outside link in the header's meta row. The global `:focus-visible` outline shows focus. */
function SourceLink({ href, className = "", children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 rounded-sm underline decoration-foreground/25 underline-offset-2 hover:text-foreground hover:decoration-current ${className}`}>
      {children}<ExternalLinkIcon aria-hidden className="size-3 shrink-0" /><span className="sr-only">{COPY.head.opensNewTab}</span>
    </a>
  )
}

function Header({ manifest, draftSays }: { manifest: Manifest; draftSays: DraftSays }) {
  return (
    <header className="mx-auto max-w-6xl pt-8 pb-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-ink">
        {manifest.ticket ? <SourceLink href={manifest.ticket} className="font-mono">{manifest.id}</SourceLink> : <span className="font-mono">{manifest.id}</span>}
        {manifest.revision && <><span aria-hidden>·</span><span>{COPY.head.plan(manifest.revision)}</span></>}
        {manifest.sources?.map((source) => <span key={source.url} className="contents"><span aria-hidden>·</span><SourceLink href={source.url}>{source.label}</SourceLink></span>)}
      </div>
      <h1 className="mt-2 font-heading text-3xl font-medium tracking-tight text-balance sm:text-4xl">{manifest.title}</h1>
      <p className="mt-2 max-w-[62ch] text-base leading-7 text-pretty text-muted-foreground">{manifest.ask}</p>
      {manifest.note && (
        <figure className="mt-4 max-w-[70ch] rounded-3xl bg-muted/60 px-4 py-3 text-sm leading-6 dark:bg-muted/40">
          <figcaption className="text-xs font-medium text-muted-ink">{COPY.head.note}</figcaption>
          <blockquote className="mt-0.5">{manifest.note}</blockquote>
        </figure>
      )}
      <VerdictBar draftSays={draftSays} />
    </header>
  )
}

const GATE_TONE: Record<ItemState, { bar: string; pill: string }> = {
  open: { bar: "bg-ask-solid", pill: "bg-ask-soft text-ask-ink" },
  approved: { bar: "bg-pass-solid", pill: "bg-pass-soft text-pass-ink" },
  changes: { bar: "bg-revise-solid", pill: "bg-revise-soft text-revise-ink" },
  objected: { bar: "bg-revise-solid", pill: "bg-revise-soft text-revise-ink" },
  fyi: { bar: "bg-muted", pill: "bg-muted text-muted-ink" },
}

function VerdictBar({ draftSays }: { draftSays: DraftSays }) {
  const { data, review } = usePage()
  const t = tally(review, data.manifest.items)
  const answered = t.blocking.length - t.openQuestions.length
  const segment = "inline-flex min-h-7 max-w-full items-center gap-1 rounded-3xl border border-transparent px-2.5 py-1 text-xs leading-4 font-medium [overflow-wrap:anywhere] hover:ring-1 hover:ring-foreground/20 [&>svg]:size-3 [&>svg]:shrink-0"
  return (
    <div className="mt-6 rounded-3xl bg-card p-4 shadow-md ring-1 ring-foreground/5 sm:p-5 dark:ring-foreground/10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="text-sm font-medium" role="status">{COPY.head.waiting(t.waiting)}</div>
        <div className="text-xs text-muted-ink tabular-nums">{COPY.head.counts(t.approved.length, t.gates.length, t.back.length, answered, t.blocking.length)}</div>
      </div>
      <div className="mt-3 flex gap-1" aria-hidden>
        {t.gates.map((it) => <span key={it.id} className={`h-1.5 flex-1 rounded-full ${GATE_TONE[itemState(review, it)].bar}`} />)}
        {t.blocking.map((q) => <span key={q.id} className={`h-1.5 flex-1 rounded-full ${questionState(review, q) === "open" ? "border border-ask-solid" : "bg-pass-solid"}`} />)}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {t.gates.map((it) => <ItemLink key={it.id} id={it.id} className={`${segment} ${GATE_TONE[itemState(review, it)].pill}`}>{itemState(review, it) === "approved" && <CheckIcon />}{it.title}</ItemLink>)}
        {t.blocking.map((q) => {
          const open = questionState(review, q) === "open"
          return <ItemLink key={q.id} id={q.id} className={`${segment} ${open ? "border-ask-line text-ask-ink" : "bg-pass-soft text-pass-ink"}`}>{!open && <CheckIcon />}{q.id} {q.title}</ItemLink>
        })}
      </div>
      <p className="mt-3 max-w-[78ch] text-xs leading-5 text-muted-ink">{COPY.head.rule(t.gates.length, t.blocking.length)} <span data-draft={draftSays}>{COPY.draft[draftSays]}</span></p>
    </div>
  )
}

/** A same-page link to an item that goes through `go`, so it opens the folds that hide its target. */
function ItemLink({ id, className, children }: { id: string; className: string; children: ReactNode }) {
  const { go } = usePage()
  return <a href={`#item-${id}`} className={className} onClick={(e) => { e.preventDefault(); go(id) }}>{children}</a>
}

function ActSection({ act, onSubmit }: { act: Act; onSubmit: (e: MouseEvent<HTMLElement>) => void }) {
  const { data } = usePage()
  const m = data.manifest
  const copy = ACT_COPY[act]
  const items = m.items.filter((it) => actOf(it) === act)
  const loose = items.filter(isQuestion).filter((q) => !hostOf(m, q))
  if ("none" in m.product && act === "product") {
    return (
      <section id={`act-${act}`} data-act={act} className="mx-auto mt-10 max-w-6xl scroll-mt-16 rounded-4xl bg-act-paper px-4 py-4 text-sm leading-6 sm:px-7">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="grid size-8 place-items-center rounded-full bg-act-paper-strong font-heading text-sm font-medium">{copy.n}</span>
          <span className="font-medium">{actEyebrow(act)}.</span><span className="min-w-0 text-muted-foreground">{m.product.none}</span>
        </div>
        {loose.map((q) => <div key={q.id} className="mt-3"><QuestionCard q={q} /></div>)}
      </section>
    )
  }
  return (
    <section id={`act-${act}`} data-act={act} aria-labelledby={`act-${act}-title`} className="mx-auto mt-10 max-w-6xl scroll-mt-16 rounded-4xl bg-act-paper px-3 pt-7 pb-4 sm:px-6 sm:pb-6">
      <div className="flex items-center gap-3 px-1">
        <span className="grid size-8 place-items-center rounded-full bg-act-paper-strong font-heading text-sm font-medium">{copy.n}</span>
        <div className="text-xs font-medium tracking-wide text-muted-ink uppercase">{actEyebrow(act)}</div>
      </div>
      <h2 id={`act-${act}-title`} className="mt-3 px-1 font-heading text-2xl font-medium tracking-tight">{copy.title}</h2>
      <p className="mt-1 max-w-[64ch] px-1 text-sm leading-6 text-muted-foreground">{copy.sub}</p>
      <ActChips items={items.filter(ownsCard)} />
      {items.map((it) => {
        if (ownsCard(it)) return <Card key={it.id} item={it} />
        if (isQuestion(it) && !hostOf(m, it)) return <div key={it.id} className="mt-3"><QuestionCard q={it} /></div>
        return null
      })}
      <ActFooter act={act} items={items} onSubmit={onSubmit} />
    </section>
  )
}

function ActChips({ items }: { items: Item[] }) {
  const { review } = usePage()
  return (
    <div className="mt-3 flex flex-wrap gap-1.5 px-1">
      {items.map((it) => {
        const s = itemState(review, it)
        return (
          <ItemLink key={it.id} id={it.id} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-act-paper-strong px-3 text-xs font-medium hover:ring-1 hover:ring-foreground/20">
            {it.title}
            {s === "open" ? <span className="size-1.5 rounded-full bg-ask-solid" title={COPY.item.open} /> : s === "approved" ? <CheckIcon className="size-3 text-pass-ink" /> : null}
          </ItemLink>
        )
      })}
    </div>
  )
}

function ActFooter({ act, items, onSubmit }: { act: Act; items: Item[]; onSubmit: (e: MouseEvent<HTMLElement>) => void }) {
  const { review, act: apply } = usePage()
  const t = tally(review, items)
  const bulk = t.openGates.filter((it) => it.type !== "grant")
  const open = [...t.openGates.map((it) => ({ id: it.id, label: it.title })), ...t.openQuestions.map((q) => ({ id: q.id, label: q.id }))]
  const done = t.waiting === 0
  return (
    <div id={`foot-${act}`} data-focus={`foot:${act}`} tabIndex={-1} className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-card/70 px-5 py-3.5 ring-1 ring-foreground/5 outline-none focus-visible:ring-2 focus-visible:ring-focus dark:ring-foreground/10">
      <div className="flex min-w-0 items-start gap-2.5 text-sm leading-6">
        {done ? <CircleCheckIcon className={`mt-1 size-4 shrink-0 ${t.back.length ? "text-muted-ink" : "text-pass-ink"}`} /> : <CircleDashedIcon className="mt-1 size-4 shrink-0 text-muted-ink" />}
        <p className="min-w-0">
          {done ? (t.back.length ? COPY.act.nothingElse(t.back.length) : COPY.act.nothing) : (
            <>{COPY.act.waiting(t.waiting)} {open.map((o, i) => (
              <span key={o.id}>{i > 0 && ", "}<ItemLink id={o.id} className="text-link underline decoration-link/30 underline-offset-4 hover:decoration-link">{o.label}</ItemLink></span>
            ))}.</>
          )}
          {act === "product" && <span className="text-muted-ink"> {COPY.act.productEnd}</span>}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {bulk.length > 0 ? (
          <Button variant="outline" size="sm" onClick={() => apply({ type: "approve", ids: bulk.map((it) => it.id) }, `foot:${act}`)}>
            <CheckIcon />{COPY.act.approveAll(bulk.length)}
          </Button>
        ) : t.openGates.length > 0 ? <Badge variant="dashed">{COPY.act.grantAlone}</Badge> : null}
        {act === "product" && <Button size="sm" data-focus="submit:product" aria-haspopup="dialog" onClick={onSubmit}><SendIcon />{COPY.nav.submit}</Button>}
      </div>
    </div>
  )
}
