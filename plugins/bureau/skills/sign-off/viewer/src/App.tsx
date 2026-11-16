import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type MouseEvent, type ReactNode } from "react"
import { ArrowLeftIcon, ArrowRightIcon, CheckCheckIcon, CheckIcon, CircleCheckIcon, CircleDashedIcon, DownloadIcon, ExternalLinkIcon, MessageSquareIcon, MoonIcon, SunIcon, Undo2Icon } from "lucide-react"
import type { Item, Manifest } from "../../scripts/manifest.ts"
import type { Act } from "../../scripts/model.ts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuBadge,
  SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar"
import { changedFor, readName, readShown } from "./changed.ts"
import { ACT_COPY, actEyebrow, COPY, holdLine, TOUCH_WHY } from "./copy.ts"
import { LinkedDrawer } from "./linked.tsx"
import { Card, IdChip, PageContext, QuestionCard, StatusPill, Subhead, usePage, type Page } from "./parts.tsx"
import { PLACED } from "./placed.tsx"
import { ACTS, actOf, holds, isQuestion, refIndex, type PageData, type Question, type Ref } from "./plan.ts"
import {
  answerWords, decisionsOf, draftKey, emptyReview, itemState, parseDraft, questionState, reduceReview, serializeDraft, tally, type Decision, type ItemState, type ReviewAction,
} from "./review.ts"
import { hashOf, heldBy, homesOf, itemsOf, stepItems, stepsOf, stopOf, walkOf, type Step, type StepId, type Stop } from "./steps.ts"
import { saveAs, SubmitDialog } from "./submit.tsx"
import { THEME_KEY } from "./theme.ts"
import { PlacedViews } from "./views.tsx"

type DraftSays = keyof typeof COPY.draft
function loadDraft(key: string) {
  try { const review = parseDraft(localStorage.getItem(key)); return { review: review ?? emptyReview, says: (review ? "restored" : "kept") as DraftSays } }
  catch { return { review: emptyReview, says: "none" as DraftSays } }
}
const NARROW = "(max-width: 767px)"
const FLASH_MS = 1900
/** The surface every block on a step shares with `Card`. */
const SURFACE = "mt-6 rounded-4xl bg-card text-sm text-card-foreground shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10"
const actOfStep = (id: StepId): Act | undefined => (id === "gates" || id === "decide" ? undefined : id)

/** `builtPage` is the file as it was built, read before React drew anything. Share downloads it, not the live page. */
export function App({ data, builtPage }: { data: PageData; builtPage: string }) {
  const m = data.manifest
  const refs = useMemo(() => refIndex(m), [m])
  const walk = useMemo(() => walkOf(stepsOf(m)), [m])
  const homes = useMemo(() => homesOf(walk), [walk])
  const key = draftKey(data)
  const [boot] = useState(() => {
    const draft = loadDraft(key), reader = readName()
    return { ...draft, reader, changed: changedFor(m, data.revs, data.events, reader, draft.review, readShown(m.id)) }
  })
  const [review, dispatch] = useReducer(reduceReview, boot.review)
  const [draftSays, setDraftSays] = useState<DraftSays>(boot.says)
  const [at, setAt] = useState(() => stopOf(walk, location.hash) ?? 0)
  const [focused, setFocused] = useState<Page["focused"]>(null)
  const [linked, setLinked] = useState<{ ref: Ref; opener: HTMLElement | null } | null>(null)
  const [submit, setSubmit] = useState<HTMLElement | null>(null)
  const focusNext = useRef<string[]>([])
  const goNext = useRef<{ ref: Ref; home: string | undefined; focus: boolean } | null>(null)
  const shownAt = useRef(at)

  useEffect(() => {
    try { localStorage.setItem(key, serializeDraft(review)) } catch { setDraftSays("none") }
  }, [key, review])

  // The hash is the location, so reload, the browser's Back, deep links and scripts all land on a step. A hash naming no step keeps
  // the reader where they are, and the hash is rewritten to the stop shown.
  useEffect(() => {
    const follow = () => setAt((n) => stopOf(walk, location.hash) ?? n)
    follow() // a hash set between the first render and this listener
    addEventListener("popstate", follow)
    addEventListener("hashchange", follow)
    return () => { removeEventListener("popstate", follow); removeEventListener("hashchange", follow) }
  }, [walk])
  useEffect(() => {
    const shown = walk[at]
    // A hash that names another stop is a move `follow` has not taken yet, so it stays.
    if (shown && location.hash !== hashOf(shown) && (stopOf(walk, location.hash) ?? at) === at) history.replaceState(null, "", hashOf(shown))
  }, [walk, at])

  useLayoutEffect(() => {
    if (shownAt.current === at) return
    shownAt.current = at
    if (!goNext.current) scrollTo(0, 0)
  })

  useLayoutEffect(() => {
    const keys = focusNext.current
    focusNext.current = []
    for (const k of keys) {
      const el = document.querySelector<HTMLElement>(`[data-focus="${CSS.escape(k)}"]`)
      if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: "nearest" }); break }
    }
    const g = goNext.current
    if (!g) return
    goNext.current = null
    const card = g.home ? document.getElementById(`item-${g.home}`) : null
    const shown = (attr: string) => [...(card ?? document).querySelectorAll<HTMLElement>(`[${attr}="${CSS.escape(g.ref)}"]`)].find((el) => el.checkVisibility())
    const target = (g.ref === g.home ? null : shown("data-ref") ?? shown("data-pr")) ?? card
    if (!target) return
    target.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
    target.setAttribute("data-flash", "")
    setTimeout(() => target.removeAttribute("data-flash"), FLASH_MS)
    if (g.focus) (target.tabIndex >= 0 || target === card ? target : card)?.focus({ preventScroll: true })
  })

  const act = useCallback((action: ReviewAction, ...focus: string[]) => { focusNext.current = focus; dispatch(action) }, [])
  const moveTo = useCallback((n: number) => {
    const stop = walk[n]
    if (!stop) return
    if (location.hash !== hashOf(stop)) history.pushState(null, "", hashOf(stop))
    setAt(n)
  }, [walk])
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
  /** Every in-page link to an item or a ref comes here: it moves to the sub-step that draws the ref, then scrolls to it and flashes it.
   *  The drawer covers the page, so a link followed from inside it closes it and hands focus to what it shows. */
  const go = useCallback((ref: Ref) => {
    const info = refs.get(ref)
    const n = homes.get(ref) ?? (info?.home === undefined ? undefined : homes.get(info.home))
    if (!info || n === undefined) return
    const fromDrawer = linkedNow.current !== null
    if (fromDrawer) closeLinked(false)
    setFocused({ item: info.home ?? ref, ref })
    goNext.current = { ref, home: info.home, focus: fromDrawer || matchMedia(NARROW).matches }
    moveTo(n)
  }, [refs, homes, closeLinked, moveTo])
  const page: Page = { data, refs, review, focused, act, go, openLinked, changed: boot.changed, reader: boot.reader }
  const acts = ACTS.filter((a) => m.items.some((it) => actOf(it) === a) || (a === "product" && "none" in m.product))
  const openSubmit = (e: MouseEvent<HTMLElement>) => setSubmit(e.currentTarget)
  const closeSubmit = () => { submit?.focus(); setSubmit(null) }
  const stop = walk[at] ?? walk[0]!
  const steps = [...new Set(walk.map((s) => s.step))]

  return (
    <PageContext.Provider value={page}>
      <PlacedViews.Provider value={PLACED}>
        <SidebarProvider className="font-sans text-foreground antialiased">
          <StepSidebar walk={walk} steps={steps} at={stop.n} onMove={moveTo}
            onShare={() => saveAs(`${m.id}-${m.revision ?? "plan"}.html`, builtPage, "text/html")} onTheme={(k) => { focusNext.current = [k] }} />
          <SidebarInset>
            <MobileBar stop={stop} />
            <div className="flex-1 px-4 pt-6 pb-10">
              {stop.n === 0 && <Header manifest={m} />}
              <StepFrame key={hashOf(stop)} stop={stop} number={steps.indexOf(stop.step) + 1}>
                <SubStepBody stop={stop} acts={acts} draftSays={draftSays} />
              </StepFrame>
            </div>
            <StepFooter walk={walk} at={stop.n} onMove={moveTo} onSubmit={openSubmit} />
          </SidebarInset>
        </SidebarProvider>
        <LinkedDrawer at={linked?.ref ?? null} onClose={() => closeLinked(true)} onRecenter={(ref) => setLinked((l) => l && { ...l, ref })} />
        {submit && <SubmitDialog acts={acts} onClose={closeSubmit} />}
      </PlacedViews.Provider>
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

/** A step's number badge, in its act's paper. Gates and Decide have no act, so theirs is neutral. */
const StepBadge = ({ id, n, className }: { id: StepId; n: number; className: string }) => (
  <span className={`grid shrink-0 place-items-center rounded-full font-medium text-foreground ${actOfStep(id) ? "bg-act-paper-strong" : "bg-muted ring-1 ring-foreground/10"} ${className}`}>{n}</span>
)

function StepSidebar({ walk, steps, at, onMove, onShare, onTheme }: {
  walk: Stop[]; steps: Step[]; at: number; onMove: (n: number) => void; onShare: () => void; onTheme: (focusKey: string) => void
}) {
  const { data, review } = usePage()
  const m = data.manifest
  const { dark, toggle } = useTheme(onTheme)
  const { setOpenMobile } = useSidebar()
  const t = tally(review, m.items)
  const here = walk[at]!
  const move = (n: number) => { setOpenMobile(false); onMove(n) }
  const link = (n: number) => ({ href: hashOf(walk[n]!), onClick: (e: MouseEvent) => { e.preventDefault(); move(n) } })
  const open = (items: Item[]) => tally(review, items).waiting
  const count = (n: number) => (n ? <span className="text-ask-ink tabular-nums">{n}</span> : <CheckIcon className="size-3.5 text-pass-ink" aria-label={COPY.nav.nothingWaits} />)
  return (
    <Sidebar>
      <SidebarHeader className="gap-1 px-4 pt-5 pb-3">
        <div className="font-mono text-xs text-muted-ink">{m.id}{m.revision && ` · ${COPY.head.plan(m.revision)}`}</div>
        <div className="font-heading text-base leading-snug font-medium text-balance">{m.title}</div>
        <div className="mt-1 text-xs leading-5 text-muted-ink tabular-nums" role="status">
          <div className="font-medium text-foreground">{COPY.head.waiting(t.waiting)}</div>
          <div>{COPY.head.counts(t.approved.length, t.gates.length, t.back.length, t.blocking.length - t.openQuestions.length, t.blocking.length)}</div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{COPY.nav.steps}</SidebarGroupLabel>
          <SidebarMenu>
            {steps.map((step, i) => {
              const stops = walk.filter((s) => s.step === step)
              const current = here.step === step
              return (
                <SidebarMenuItem key={step.id} data-act={actOfStep(step.id)}>
                  <SidebarMenuButton isActive={current} render={<a {...link(stops[0]!.n)} aria-current={current ? "step" : undefined} />}>
                    <StepBadge id={step.id} n={i + 1} className="size-6 text-xs" />
                    <span>{COPY.steps.name[step.id]}</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>{count(open(stepItems(step, m)))}</SidebarMenuBadge>
                  {current && stops.length > 1 && (
                    <SidebarMenuSub>
                      {stops.map((s) => (
                        <SidebarMenuSubItem key={s.sub.id}>
                          <SidebarMenuSubButton isActive={s.n === at} {...link(s.n)} aria-current={s.n === at ? "page" : undefined}>
                            <span className="min-w-0 flex-1 truncate">{s.sub.label}</span>
                            <span className="text-xs">{s.sub.kind === "decide" ? null : count(open(itemsOf(s.sub, m)))}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-2 p-3">
        <Button variant="outline" size="sm" className="w-full" onClick={() => move(walk.length - 1)}><CheckCheckIcon />{COPY.nav.decide}</Button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" data-focus="theme" onClick={toggle} aria-label={COPY.nav.theme(dark)} title={COPY.nav.theme(dark)}>
            {dark ? <SunIcon /> : <MoonIcon />}
          </Button>
          <Button variant="ghost" size="sm" title={COPY.nav.shareTitle} onClick={onShare}><DownloadIcon />{COPY.nav.share}</Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

/** On a narrow screen the sidebar is a sheet, and this bar opens it. */
function MobileBar({ stop }: { stop: Stop }) {
  const { data } = usePage()
  return (
    <div data-nav className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border/70 bg-background/85 px-3 backdrop-blur-md md:hidden">
      <SidebarTrigger />
      <span className="font-heading text-sm font-medium">{data.manifest.id}</span>
      <span className="min-w-0 truncate text-sm text-muted-foreground">{COPY.steps.name[stop.step.id]} · {stop.sub.label}</span>
    </div>
  )
}

/** Back and Next, always at the bottom of the viewport. One filled button: Approve while the card waits on a verdict, Submit on the
 *  last stop, Next otherwise. */
function StepFooter({ walk, at, onMove, onSubmit }: { walk: Stop[]; at: number; onMove: (n: number) => void; onSubmit: (e: MouseEvent<HTMLElement>) => void }) {
  const { review, act } = usePage()
  const here = walk[at]!, prev = walk[at - 1], next = walk[at + 1]
  const awaits = here.sub.kind === "card" && itemState(review, here.sub.item) === "open" ? here.sub.item : null
  return (
    <div data-nav className="sticky bottom-0 z-20 border-t border-border/70 bg-background/85 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2">
        <Button variant="ghost" size="sm" disabled={!prev} onClick={() => prev && onMove(prev.n)}><ArrowLeftIcon />{COPY.steps.back}</Button>
        <div className="min-w-0 flex-1 truncate text-center text-xs text-muted-ink tabular-nums">
          {[...new Set([COPY.steps.name[here.step.id], here.sub.label])].join(" · ")} · {COPY.steps.at(at + 1, walk.length)}
        </div>
        {awaits && <Button size="sm" onClick={() => act({ type: "approve", ids: [awaits.id] }, "foot:next")}><CheckIcon />{COPY.steps.approve}</Button>}
        {next ? (
          <Button variant={awaits ? "outline" : "default"} size="sm" data-focus="foot:next" title={next.sub.label} onClick={() => onMove(next.n)}>
            {COPY.steps.next}<ArrowRightIcon />
          </Button>
        ) : <Button size="sm" data-focus="submit:foot" aria-haspopup="dialog" onClick={onSubmit}><CheckCheckIcon />{COPY.nav.submit}</Button>}
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

function Header({ manifest }: { manifest: Manifest }) {
  return (
    <header className="mx-auto max-w-6xl px-1 pt-2 pb-8">
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

/** A same-page link to an item that goes through `go`, so it moves to its sub-step, then scrolls to and flashes it. */
function ItemLink({ id, className, children }: { id: string; className: string; children: ReactNode }) {
  const { go } = usePage()
  return <a href={`#item-${id}`} className={className} onClick={(e) => { e.preventDefault(); go(id) }}>{children}</a>
}

/** The act's paper and heading around one sub-step, kept short so the card starts near the top. */
function StepFrame({ stop, number, children }: { stop: Stop; number: number; children: ReactNode }) {
  const id = stop.step.id, act = actOfStep(id)
  const eyebrow = act ? actEyebrow(act) : COPY.steps.eyebrow[id === "gates" ? "gates" : "decide"]
  const title = act ? ACT_COPY[act].title : COPY.steps.title[id === "gates" ? "gates" : "decide"]
  return (
    <section data-act={act} data-step={`${id}/${stop.sub.id}`} aria-labelledby="step-title"
      className={`mx-auto max-w-6xl rounded-4xl px-3 pt-5 pb-4 sm:px-6 sm:pb-6 ${act ? "bg-act-paper" : "bg-muted/50 dark:bg-muted/25"}`}>
      <div className="flex items-center gap-3 px-1">
        <StepBadge id={id} n={number} className="size-8 font-heading text-sm" />
        <div className="min-w-0">
          <div className="text-xs font-medium tracking-wide text-muted-ink uppercase">{eyebrow}</div>
          <h2 id="step-title" className="font-heading text-xl font-medium tracking-tight">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  )
}

function SubStepBody({ stop, acts, draftSays }: { stop: Stop; acts: Act[]; draftSays: DraftSays }) {
  const { sub } = stop
  switch (sub.kind) {
    case "questions": return <Questions questions={sub.questions} />
    case "none": return <><p className="mt-4 px-1 text-sm leading-6 text-muted-foreground">{sub.says}</p>{sub.questions.length > 0 && <Questions questions={sub.questions} />}</>
    case "card": return <Card item={sub.item} />
    case "gates": return <GateList gates={sub.gates} />
    case "decide": return <Decide acts={acts} draftSays={draftSays} />
  }
}

function Questions({ questions }: { questions: Question[] }) {
  const hold = questions.filter(holds).length
  return (
    <div className={`${SURFACE} px-5 py-5 sm:px-6`}>
      <Subhead extra={holdLine(hold, questions.length - hold)}>{COPY.spec.questions}</Subhead>
      <div className="grid gap-3 lg:grid-cols-2">{questions.map((q) => <QuestionCard key={q.id} q={q} />)}</div>
    </div>
  )
}

/** Every gate on one line: what it is, whether it is settled, and which build steps wait on it. Each title opens the gate's card. */
function GateList({ gates }: { gates: Item[] }) {
  const { data } = usePage()
  const held = useMemo(() => heldBy(data.manifest), [data.manifest])
  return (
    <ul className={`${SURFACE} divide-y divide-border/70 overflow-hidden`}>
      {gates.map((g) => {
        const why = g.type === "grant" ? COPY.steps.grantWhy : "touches" in g ? g.touches.map((t) => TOUCH_WHY[t]).join(". ") : ""
        const steps = held.get(g.id) ?? []
        return (
          <li key={g.id} data-gate={g.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <ItemLink id={g.id} className="font-heading text-lg font-medium underline decoration-foreground/20 underline-offset-4 hover:decoration-current">{g.title}</ItemLink>
                <StatusPill item={g} />
              </div>
              <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{why}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-ink">
              {steps.length ? <>{COPY.steps.holds} {steps.map((id) => <IdChip key={id} id={id} />)}</> : COPY.steps.holdsNothing}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** The decision strip, then each act: what still waits with its bulk approve, and what the reader decided. Submit is the footer's. */
function Decide({ acts, draftSays }: { acts: Act[]; draftSays: DraftSays }) {
  const { data, review } = usePage()
  const decided = decisionsOf(review, data.manifest.items).length > 0
  return (
    <>
      <VerdictBar draftSays={draftSays} />
      <h3 className="mt-8 px-1 text-xs font-medium tracking-wide text-muted-ink uppercase">{COPY.steps.byAct(decided)}</h3>
      {acts.map((a) => <ActFooter key={a} act={a} items={data.manifest.items.filter((it) => actOf(it) === a)} />)}
      <p className="px-1 pt-6 text-xs leading-5 text-muted-ink">{COPY.footer}</p>
    </>
  )
}

function ActFooter({ act, items }: { act: Act; items: Item[] }) {
  const { review, act: apply } = usePage()
  const t = tally(review, items)
  const bulk = t.openGates.filter((it) => it.type !== "grant")
  const open = [...t.openGates.map((it) => ({ id: it.id, label: it.title })), ...t.openQuestions.map((q) => ({ id: q.id, label: q.id }))]
  const done = t.waiting === 0
  const decisions = decisionsOf(review, items)
  return (
    <div id={`foot-${act}`} data-act={act} data-focus={`foot:${act}`} tabIndex={-1} className="mt-3 overflow-hidden rounded-3xl bg-card/70 ring-1 ring-foreground/5 outline-none focus-visible:ring-2 focus-visible:ring-focus dark:ring-foreground/10">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <div className="flex min-w-0 items-start gap-2.5 text-sm leading-6">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-act-paper-strong text-xs font-medium">{ACT_COPY[act].n}</span>
          {done ? <CircleCheckIcon className={`mt-1 size-4 shrink-0 ${t.back.length ? "text-muted-ink" : "text-pass-ink"}`} /> : <CircleDashedIcon className="mt-1 size-4 shrink-0 text-muted-ink" />}
          <p className="min-w-0">
            <span className="font-medium">{ACT_COPY[act].name}.</span>{" "}
            {done ? (t.back.length ? COPY.act.nothingElse(t.back.length) : COPY.act.nothing) : (
              <>{COPY.act.waiting(t.waiting)} {open.map((o, i) => (
                <span key={o.id}>{i > 0 && ", "}<ItemLink id={o.id} className="text-link underline decoration-link/30 underline-offset-4 hover:decoration-link">{o.label}</ItemLink></span>
              ))}.</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {bulk.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => apply({ type: "approve", ids: bulk.map((it) => it.id) }, `foot:${act}`)}>
              <CheckIcon />{COPY.act.approveAll(bulk.length)}
            </Button>
          ) : t.openGates.length > 0 ? <Badge variant="dashed">{COPY.act.grantAlone}</Badge> : null}
        </div>
      </div>
      {decisions.length > 0 && (
        <ul className="divide-y divide-border/70 border-t border-border/70" data-decisions={act}>
          {decisions.map((d) => <DecisionRow key={d.item.id} decision={d} />)}
        </ul>
      )}
    </div>
  )
}

/** A note the reader wrote, in full and with its line breaks, on the tint of the card's own "Your note" strip. */
const ReaderNote = ({ icon, label, text }: { icon: ReactNode; label: string; text: string }) => (
  <div className="mt-2 flex max-w-[80ch] items-start gap-2 rounded-2xl bg-revise-soft/60 px-3 py-2">
    {icon}
    <span className="min-w-0 flex-1"><span className="text-xs font-medium text-revise-ink">{label}</span><span className="block whitespace-pre-line">{text}</span></span>
  </div>
)

/** One item the reader acted on, indented under the act row's text: its title, linked to it, and what they decided, with every note. */
function DecisionRow({ decision: { item, verdict, answer, comments } }: { decision: Decision }) {
  const q = isQuestion(item) ? item : null
  return (
    <li data-decision={item.id} className="py-3 pr-5 pl-5 text-sm leading-6 sm:pl-20">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        {q && <IdChip id={q.id} />}
        <ItemLink id={item.id} className="font-medium underline decoration-foreground/20 underline-offset-4 hover:decoration-current">{item.title}</ItemLink>
        {q ? answer && <Badge variant="pass"><CheckIcon />{COPY.question.answered}</Badge> : verdict && <StatusPill item={item} />}
      </div>
      {q && answer && <p className="mt-1"><CheckIcon className="mr-1.5 inline size-4 text-pass-ink" />{answerWords(q, answer)}</p>}
      {verdict?.verdict === "changes" && <ReaderNote icon={<Undo2Icon className="mt-1 size-3.5 shrink-0 text-revise-ink" />} label={COPY.item.yourNote} text={verdict.note} />}
      {comments.map((c, i) => (
        <ReaderNote key={i} icon={<MessageSquareIcon className="mt-1 size-3.5 shrink-0 text-revise-ink" />} label={`${COPY.comment.yours}${c.anchor ? ` · ${c.anchor}` : ""}`} text={c.text} />
      ))}
    </li>
  )
}
