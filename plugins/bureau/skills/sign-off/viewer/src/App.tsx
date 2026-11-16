import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type MouseEvent, type ReactNode } from "react"
import { ArrowLeftIcon, ArrowRightIcon, CheckCheckIcon, CheckIcon, CircleCheckIcon, CircleDashedIcon, DownloadIcon, ExternalLinkIcon, InfoIcon, MessageSquareIcon, MoonIcon, SunIcon, Undo2Icon } from "lucide-react"
import type { Item, Manifest } from "../../scripts/manifest.ts"
import type { Act } from "../../scripts/model.ts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuBadge,
  SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar"
import { changedFor, readName, readShown } from "./changed.ts"
import { ACT_COPY, actEyebrow, COPY, holdLine, TOUCH_WHY } from "./copy.ts"
import { LinkedDrawer } from "./linked.tsx"
import { BackStrip, Card, Disclosure, IdChip, PageContext, QuestionCard, StatusPill, Subhead, usePage, VerdictButtons, type Page } from "./parts.tsx"
import { PLACED } from "./placed.tsx"
import { ACTS, actOf, holds, hostOf, isGate, isQuestion, refIndex, type PageData, type Question, type Ref } from "./plan.ts"
import {
  answerWords, decisionsOf, draftKey, emptyReview, itemState, parseDraft, questionState, reduceReview, serializeDraft, tally, type Decision, type ItemState, type ReviewAction,
} from "./review.ts"
import type { Part } from "./slices.ts"
import { hashOf, heldBy, homesOf, itemsOf, questionsOf, stepItems, stepsOf, stopOf, walkOf, type Step, type StepId, type Stop } from "./steps.ts"
import { AcceptanceList, CoverageList, TestList } from "./verify.tsx"
import { GrantView } from "./views/grant.tsx"
import { saveAs, SubmitDialog } from "./submit.tsx"
import { THEME_KEY } from "./theme.ts"
import { PlacedViews, VIEWS } from "./views.tsx"

/** `kept` is false when this browser has no storage, so a reload loses the review. */
function loadDraft(key: string) {
  try { return { review: parseDraft(localStorage.getItem(key)) ?? emptyReview, kept: true } }
  catch { return { review: emptyReview, kept: false } }
}
const NARROW = "(max-width: 767px)"
const FLASH_MS = 1900
/** The surface every block on a step shares with `Card`. */
const SURFACE = "mt-6 rounded-4xl bg-card text-sm text-card-foreground shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10"
const actOfStep = (id: StepId): Act | undefined => (id === "gates" || id === "decide" ? undefined : id)
/** What a stop is called in the footer and the mobile bar: a card's part names its card too. */
const stopLabel = ({ sub }: Stop) => (sub.kind === "card" && sub.part ? `${sub.item.title} · ${sub.part.label}` : sub.label)

/** `builtPage` is the file as it was built, read before React drew anything. Share downloads it, not the live page. */
export function App({ data, builtPage }: { data: PageData; builtPage: string }) {
  const m = data.manifest
  const refs = useMemo(() => refIndex(m), [m])
  const walk = useMemo(() => walkOf(stepsOf(m, data.blocks)), [m, data.blocks])
  const homes = useMemo(() => homesOf(walk), [walk])
  const key = draftKey(data)
  const [boot] = useState(() => {
    const draft = loadDraft(key), reader = readName()
    return { ...draft, reader, changed: changedFor(m, data.revs, data.events, reader, draft.review, readShown(m.id)) }
  })
  const [review, dispatch] = useReducer(reduceReview, boot.review)
  const [draftKept, setDraftKept] = useState(boot.kept)
  const [at, setAt] = useState(() => stopOf(walk, location.hash) ?? 0)
  const [focused, setFocused] = useState<Page["focused"]>(null)
  const [linked, setLinked] = useState<{ ref: Ref; opener: HTMLElement | null } | null>(null)
  const [submit, setSubmit] = useState<HTMLElement | null>(null)
  const focusNext = useRef<string[]>([])
  const goNext = useRef<{ ref: Ref; home: string | undefined; focus: boolean } | null>(null)
  const shownAt = useRef(at)

  useEffect(() => {
    try { localStorage.setItem(key, serializeDraft(review)) } catch { setDraftKept(false) }
  }, [key, review])

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
    const card = g.home ? document.getElementById(`item-${g.home}`) : null
    const shown = (attr: string) => [...(card ?? document).querySelectorAll<HTMLElement>(`[${attr}="${CSS.escape(g.ref)}"]`)].find((el) => el.checkVisibility())
    const found = g.ref === g.home ? null : shown("data-ref") ?? shown("data-pr")
    // A card split into parts draws a ref on one of them: try the card's next part before settling on the card.
    const here = walk[at], next = walk[at + 1]
    if (!found && g.ref !== g.home && here?.sub.kind === "card" && next?.sub.kind === "card" && next.sub.item === here.sub.item) {
      history.replaceState(null, "", hashOf(next))
      setAt(next.n)
      return
    }
    goNext.current = null
    const target = found ?? card
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
          <SidebarInset className="min-w-0">
            <MobileBar stop={stop} />
            <div className="min-w-0 flex-1 px-4 pt-6 pb-10">
              {stop.n === 0 && <Header manifest={m} onSkip={() => moveTo(walk.length - 1)} />}
              <StepFrame key={stop.sub.kind === "card" ? `card:${stop.sub.item.id}` : hashOf(stop)} stop={stop} number={steps.indexOf(stop.step) + 1} compact={walk[stop.n - 1]?.step === stop.step}>
                <SubStepBody stop={stop} walk={walk} homes={homes} draftKept={draftKept} />
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
                      {byCard(stops).map(({ first, title, parts }) => (
                        <SidebarMenuSubItem key={hashOf(first)}>
                          <SidebarMenuSubButton isActive={!parts.length && first.n === at} {...link(first.n)} aria-current={!parts.length && first.n === at ? "page" : undefined}>
                            <span className="min-w-0 flex-1 truncate">{title}</span>
                            <span className="text-xs">{first.sub.kind === "decide" ? null : count(open(itemsOf(first.sub, m)))}</span>
                          </SidebarMenuSubButton>
                          {parts.length > 0 && (
                            <SidebarMenuSub className="mr-0 pr-0">
                              {parts.map((p) => (
                                <SidebarMenuSubItem key={hashOf(p)}>
                                  <SidebarMenuSubButton size="sm" isActive={p.n === at} {...link(p.n)} aria-current={p.n === at ? "page" : undefined}>
                                    <span className="min-w-0 flex-1 truncate">{p.sub.label}</span>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          )}
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
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-sm" data-focus="theme" onClick={toggle} aria-label={COPY.nav.theme(dark)} />}>{dark ? <SunIcon /> : <MoonIcon />}</TooltipTrigger>
            <TooltipContent>{COPY.nav.theme(dark)}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="sm" onClick={onShare} />}><DownloadIcon />{COPY.nav.share}</TooltipTrigger>
            <TooltipContent>{COPY.nav.shareTitle}</TooltipContent>
          </Tooltip>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

/** A step's stops as the sidebar lists them: each card once, with its parts under it when it has several. */
function byCard(stops: Stop[]) {
  const out: { first: Stop; title: string; parts: Stop[] }[] = []
  for (const s of stops) {
    const prev = out.at(-1)
    if (s.sub.kind === "card" && s.sub.part && prev?.first.sub.kind === "card" && prev.first.sub.item === s.sub.item) prev.parts.push(s)
    else out.push({ first: s, title: s.sub.kind === "card" ? s.sub.item.title : s.sub.label, parts: s.sub.kind === "card" && s.sub.part ? [s] : [] })
  }
  return out
}

/** On a narrow screen the sidebar is a sheet, and this bar opens it. */
function MobileBar({ stop }: { stop: Stop }) {
  const { data } = usePage()
  return (
    <div data-nav className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border/70 bg-background/85 px-3 backdrop-blur-md md:hidden">
      <SidebarTrigger />
      <span className="font-heading text-sm font-medium">{data.manifest.id}</span>
      <span className="min-w-0 truncate text-sm text-muted-foreground">{COPY.steps.name[stop.step.id]} · {stopLabel(stop)}</span>
    </div>
  )
}

/** Back and Next, always at the bottom of the viewport, with the page's one Approve for a card. One filled button: Approve on the
 *  last stop of a card that waits on a verdict, Submit on the last stop, Next otherwise. */
function StepFooter({ walk, at, onMove, onSubmit }: { walk: Stop[]; at: number; onMove: (n: number) => void; onSubmit: (e: MouseEvent<HTMLElement>) => void }) {
  const { data, review, act } = usePage()
  const here = walk[at]!, prev = walk[at - 1], next = walk[at + 1]
  const left = tally(review, data.manifest.items).waiting
  const awaits = here.sub.kind === "card" && itemState(review, here.sub.item) === "open" ? here.sub.item : null
  const moreToRead = here.sub.kind === "card" && next?.sub.kind === "card" && next.sub.item === here.sub.item
  return (
    <div data-nav className="sticky bottom-0 z-20 border-t border-border/70 bg-background/85 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2">
        <Button variant="ghost" size="sm" disabled={!prev} onClick={() => prev && onMove(prev.n)}><ArrowLeftIcon />{COPY.steps.back}</Button>
        <div className="min-w-0 flex-1 truncate text-center text-xs text-muted-ink tabular-nums">
          {[...new Set([COPY.steps.name[here.step.id], stopLabel(here)])].join(" · ")} · {COPY.steps.at(at + 1, walk.length)}
        </div>
        {awaits && (
          <Button variant={moreToRead ? "outline" : "default"} size="sm" data-focus={`verdict:${awaits.id}`} onClick={() => act({ type: "approve", ids: [awaits.id] }, "foot:next")}>
            <CheckIcon />{COPY.steps.approve}
          </Button>
        )}
        {next ? (
          <Button variant={awaits && !moreToRead ? "outline" : "default"} size="sm" data-focus="foot:next" title={next.sub.label} onClick={() => onMove(next.n)}>
            {COPY.steps.next}<ArrowRightIcon />
          </Button>
        ) : (
          <>
            <span className="text-xs text-muted-ink tabular-nums" role="status">{COPY.decide.left(left)}</span>
            <Button size="sm" data-focus="submit:foot" aria-haspopup="dialog" disabled={left > 0} onClick={onSubmit}><CheckCheckIcon />{COPY.nav.submit}</Button>
          </>
        )}
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

function Header({ manifest, onSkip }: { manifest: Manifest; onSkip: () => void }) {
  return (
    <header className="mx-auto max-w-6xl px-1 pt-2 pb-6">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-ink">
        {manifest.ticket ? <SourceLink href={manifest.ticket} className="font-mono">{manifest.id}</SourceLink> : <span className="font-mono">{manifest.id}</span>}
        {manifest.revision && <><span aria-hidden>·</span><span>{COPY.head.plan(manifest.revision)}</span></>}
        {manifest.sources?.map((source) => <span key={source.url} className="contents"><span aria-hidden>·</span><SourceLink href={source.url}>{source.label}</SourceLink></span>)}
      </div>
      <h1 className="mt-2 font-heading text-3xl font-medium tracking-tight text-balance sm:text-4xl">{manifest.title}</h1>
      <p className="mt-2 max-w-[62ch] text-base leading-7 text-pretty text-muted-foreground">{manifest.ask}</p>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        {manifest.note && (
          <figure className="max-w-[70ch] min-w-0 flex-1 rounded-3xl bg-muted/60 px-4 py-3 text-sm leading-6 dark:bg-muted/40">
            <figcaption className="text-xs font-medium text-muted-ink">{COPY.head.note}</figcaption>
            <blockquote className="mt-0.5">{manifest.note}</blockquote>
          </figure>
        )}
        <Button variant="outline" size="sm" data-skip onClick={onSkip}><CheckCheckIcon />{COPY.steps.skip}</Button>
      </div>
    </header>
  )
}

const GATE_BAR: Record<ItemState, string> = { open: "bg-ask-solid", approved: "bg-pass-solid", changes: "bg-revise-solid", objected: "bg-revise-solid", fyi: "bg-muted" }

/** A same-page link to an item that goes through `go`, so it moves to its sub-step, then scrolls to and flashes it. */
function ItemLink({ id, className, children, ...rest }: { id: string; className: string; children: ReactNode; "aria-label"?: string }) {
  const { go } = usePage()
  return <a href={`#item-${id}`} {...rest} className={className} onClick={(e) => { e.preventDefault(); go(id) }}>{children}</a>
}

/** The act's paper and heading around one sub-step. `compact` is one line, for every stop after a step's first. */
function StepFrame({ stop, number, compact, children }: { stop: Stop; number: number; compact: boolean; children: ReactNode }) {
  const id = stop.step.id, act = actOfStep(id)
  const eyebrow = act ? actEyebrow(act) : COPY.steps.eyebrow[id === "gates" ? "gates" : "decide"]
  const title = act ? ACT_COPY[act].title : COPY.steps.title[id === "gates" ? "gates" : "decide"]
  return (
    <section data-act={act} data-step={hashOf(stop).slice(1)} aria-labelledby="step-title"
      className={`mx-auto max-w-6xl rounded-4xl px-3 pb-4 sm:px-6 sm:pb-6 ${compact ? "pt-3 [&>article]:mt-3" : "pt-5"} ${act ? "bg-act-paper" : "bg-muted/50 dark:bg-muted/25"}`}>
      {compact ? (
        <div className="flex items-center gap-2.5 px-1">
          <StepBadge id={id} n={number} className="size-6 text-xs" />
          <span className="text-xs font-medium tracking-wide text-muted-ink uppercase">{eyebrow}</span>
          <h2 id="step-title" className="font-heading text-sm font-medium">{title}</h2>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-1">
          <StepBadge id={id} n={number} className="size-8 font-heading text-sm" />
          <div className="min-w-0">
            <div className="text-xs font-medium tracking-wide text-muted-ink uppercase">{eyebrow}</div>
            <h2 id="step-title" className="font-heading text-xl font-medium tracking-tight">{title}</h2>
          </div>
        </div>
      )}
      {children}
    </section>
  )
}

function SubStepBody({ stop, walk, homes, draftKept }: { stop: Stop; walk: Stop[]; homes: Map<string, number>; draftKept: boolean }) {
  const { sub } = stop
  switch (sub.kind) {
    case "questions": return <Questions questions={sub.questions} />
    case "none": return <><p className="mt-4 px-1 text-base leading-7 text-muted-foreground">{sub.says}</p>{sub.questions.length > 0 && <Questions questions={sub.questions} />}</>
    case "card": {
      const prev = walk[stop.n - 1]
      return <CardStop item={sub.item} part={sub.part} later={prev?.sub.kind === "card" && prev.sub.item === sub.item} />
    }
    case "gates": return <GateList gates={sub.gates} />
    case "decide": return <Decide walk={walk} homes={homes} draftKept={draftKept} />
  }
}

const LISTS = { acceptance: AcceptanceList, tests: TestList, coverage: CoverageList } satisfies Record<NonNullable<Part["list"]>, typeof VIEWS.trace>

/** A card, or one part of it: the whole card mounts and the part's rules hide the rest, so each view still draws as it does. The
 *  frame is keyed by card, so the card keeps its state across its parts. A `later` part drops the card's reason, read on the first. */
function CardStop({ item, part, later }: { item: Item; part: Part | null; later: boolean }) {
  const hide = [...(part?.hide ?? []), ...(later ? ["section[data-step] > article > header [data-part=why]"] : [])]
  const css = [...hide.map((selector) => `${selector}{display:none!important}`), part?.css ?? ""].join("\n")
  return (
    <>
      <style>{css}</style>
      <PlacedViews.Provider value={part?.list ? { ...PLACED, trace: LISTS[part.list] } : PLACED}><Card item={item} /></PlacedViews.Provider>
    </>
  )
}

function Questions({ questions }: { questions: Question[] }) {
  const hold = questions.filter(holds).length
  return (
    <div className={`${SURFACE} px-5 py-5 sm:px-6`}>
      <Subhead extra={holdLine(hold, questions.length - hold)}>{COPY.spec.questions}</Subhead>
      <div className="grid gap-3 lg:grid-cols-2">{questions.map((q) => <QuestionCard key={q.id} q={q} wide={!holds(q)} />)}</div>
    </div>
  )
}

/** Every gate in one table: what it is, whether it is settled, and which build steps wait on it, those that hold a step first.
 *  Each title opens the gate's card. */
function GateList({ gates }: { gates: Item[] }) {
  const { data } = usePage()
  const held = useMemo(() => heldBy(data.manifest), [data.manifest])
  const holdsOf = (g: Item) => held.get(g.id) ?? []
  const cell = "px-5 py-3 whitespace-normal sm:px-6"
  return (
    <div className={`${SURFACE} overflow-hidden`}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {[COPY.steps.gate.item, COPY.steps.gate.why, COPY.steps.holds].map((h) => <TableHead key={h} className="h-10 px-5 text-xs text-muted-ink sm:px-6">{h}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {gates.toSorted((a, b) => Number(holdsOf(b).length > 0) - Number(holdsOf(a).length > 0)).map((g) => (
            <TableRow key={g.id} data-gate={g.id} className="hover:bg-transparent">
              <TableCell className={cell}>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                  <ItemLink id={g.id} className="text-base font-medium underline decoration-foreground/20 underline-offset-4 hover:decoration-current">{g.title}</ItemLink>
                  <StatusPill item={g} />
                </div>
              </TableCell>
              <TableCell className={`${cell} text-muted-foreground`}>{gateWhy(g)}</TableCell>
              <TableCell className={cell}>
                {holdsOf(g).length ? <div className="flex flex-wrap gap-1.5">{holdsOf(g).map((id) => <IdChip key={id} id={id} />)}</div> : <span className="text-xs text-muted-ink">{COPY.steps.holdsNothing}</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
const gateWhy = (item: Item) => (item.type === "grant" ? COPY.steps.grantWhy : "touches" in item ? item.touches.map((t) => TOUCH_WHY[t]).join(". ") : "")

/** Everything the agent needs, on one page: every verdict by step with its controls on the left, and a rail that stays in view
 *  with the progress, the questions and Approve all. Nothing here needs another step. Submit is the footer's. The rail sits beside
 *  the verdicts only once this column is wide enough for both, whatever the window and the sidebar leave it; until then it lies above. */
function Decide({ walk, homes, draftKept }: { walk: Stop[]; homes: Map<string, number>; draftKept: boolean }) {
  const { data, review } = usePage()
  const m = data.manifest
  const decided = decisionsOf(review, m.items).length > 0
  const stepOf = (it: Item) => walk[homes.get(it.id) ?? homes.get(hostOf(m, it)?.id ?? "") ?? -1]?.step
  const steps = [...new Set(walk.map((s) => s.step))].filter((s) => s.id !== "decide")
  return (
    <div className="@container mt-6">
    <div className="grid items-start gap-x-6 gap-y-4 @5xl:grid-cols-[minmax(0,1fr)_23rem]">
      <DecideRail draftKept={draftKept} />
      <div className="min-w-0 @5xl:col-start-1 @5xl:row-start-1">
        <h3 className="px-1 text-xs font-medium tracking-wide text-muted-ink uppercase">{COPY.steps.byStep(decided)}</h3>
        {steps.map((step) => (
          <StepSummary key={step.id} step={step} n={steps.indexOf(step) + 1} items={m.items.filter((it) => stepOf(it) === step)} />
        ))}
      </div>
    </div>
    </div>
  )
}

/** What waits, as a count and one bar per gate and blocking question, then every question in place and Approve all. */
function DecideRail({ draftKept }: { draftKept: boolean }) {
  const { data, review, act } = usePage()
  const items = data.manifest.items
  const t = tally(review, items)
  const questions = questionsOf(data.manifest)
  const bulk = t.openGates.filter((it) => it.type !== "grant")
  return (
    <aside className="rounded-3xl bg-card p-4 shadow-md ring-1 ring-foreground/5 @5xl:sticky @5xl:top-6 @5xl:col-start-2 dark:ring-foreground/10">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium" role="status">{COPY.head.waiting(t.waiting)}</div>
        <Popover>
          <PopoverTrigger render={<Button variant="ghost" size="icon-xs" aria-label={COPY.head.ruleLabel} />}><InfoIcon /></PopoverTrigger>
          <PopoverContent align="end" className="w-80 text-sm leading-6">{COPY.head.rule(t.gates.length, t.blocking.length)}</PopoverContent>
        </Popover>
      </div>
      <div className="text-xs text-muted-ink tabular-nums">{COPY.head.counts(t.approved.length, t.gates.length, t.back.length, t.blocking.length - t.openQuestions.length, t.blocking.length)}</div>
      <div className="mt-3 flex gap-1" aria-hidden>
        {t.gates.map((it) => <span key={it.id} className={`h-1.5 flex-1 rounded-full ${GATE_BAR[itemState(review, it)]}`} />)}
        {t.blocking.map((q) => <span key={q.id} className={`h-1.5 flex-1 rounded-full ${questionState(review, q) === "open" ? "border border-ask-solid" : "bg-pass-solid"}`} />)}
      </div>
      {!draftKept && <p data-draft="none" className="mt-3 text-xs leading-5 text-revise-ink">{COPY.draft.none}</p>}
      {questions.length > 0 && <QuestionTabs questions={questions} />}
      {bulk.length > 0 && (
        <div className="mt-4">
          <Button variant="outline" size="sm" className="w-full" data-focus="approve-all" onClick={() => act({ type: "approve", ids: bulk.map((it) => it.id) }, "approve-all", "foot:next", "submit:foot")}>
            <CheckCheckIcon />{COPY.decide.approveAll(bulk.length)}
          </Button>
          <p className="mt-1.5 text-center text-xs text-muted-ink">{COPY.decide.approveAllWhy}</p>
        </div>
      )}
    </aside>
  )
}

/** Every question in the plan as tabs, in id order. A tab's mark says whether its question is open; nothing reorders. The answer is
 *  the same review state the question's own step shows. */
function QuestionTabs({ questions }: { questions: Question[] }) {
  const { review } = usePage()
  const [at, setAt] = useState(() => questions.find((q) => questionState(review, q) === "open")?.id ?? questions[0]!.id)
  const open = questions.filter((q) => questionState(review, q) === "open").length
  return (
    <section className="mt-4" data-decide="questions">
      <Subhead extra={COPY.decide.questionsExtra(open, questions.length)}>{COPY.decide.questions}</Subhead>
      <Tabs value={at} onValueChange={(v) => setAt(String(v))} className="gap-3">
        <TabsList className="h-auto! w-full flex-wrap justify-start">
          {questions.map((q) => (
            <TabsTrigger key={q.id} value={q.id} className="h-7 flex-none font-mono text-xs" aria-label={`${q.id} ${q.title}`}>
              {questionState(review, q) === "open" ? <span aria-hidden className="size-2 rounded-full border border-ask-solid" /> : <CheckIcon className="size-3.5 text-pass-ink" />}{q.id}
            </TabsTrigger>
          ))}
        </TabsList>
        {questions.map((q) => <TabsContent key={q.id} value={q.id}><QuestionCard q={q} /></TabsContent>)}
      </Tabs>
    </section>
  )
}

/** One step's share of the decision: its verdicts with their controls, then what the reader decided on the rest. */
function StepSummary({ step, n, items }: { step: Step; n: number; items: Item[] }) {
  const { review } = usePage()
  const t = tally(review, items)
  const gates = items.filter(isGate)
  const rest = decisionsOf(review, items.filter((it) => !isGate(it)))
  if (!gates.length && !t.questions.length && !rest.length) return null
  const done = t.waiting === 0
  return (
    <div data-act={actOfStep(step.id)} data-decisions={step.id} className="mt-3 overflow-hidden rounded-3xl bg-card/70 ring-1 ring-foreground/5 dark:ring-foreground/10">
      <div className="flex items-center gap-2.5 px-4 py-2.5 text-sm leading-6">
        <StepBadge id={step.id} n={n} className="size-6 text-xs" />
        <span className="font-medium">{COPY.steps.name[step.id]}</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-ink">
          {done ? <CircleCheckIcon className={`size-4 shrink-0 ${t.back.length ? "text-muted-ink" : "text-pass-ink"}`} /> : <CircleDashedIcon className="size-4 shrink-0" />}
          {done ? (t.back.length ? COPY.act.sentBack(t.back.length) : COPY.act.nothing) : COPY.act.waiting(t.waiting)}
        </span>
      </div>
      {(gates.length > 0 || rest.length > 0) && (
        <ul className="divide-y divide-border/70 border-t border-border/70">
          {gates.map((it) => <VerdictLine key={it.id} item={it} step={step} />)}
          {rest.map((d) => <DecisionRow key={d.item.id} decision={d} />)}
        </ul>
      )}
    </div>
  )
}

/** One item that takes a verdict: what it is, why it asks, Approve or Request changes in place, and a link to its step. The grant
 *  folds its list of what the agent may do alone under its row. */
function VerdictLine({ item, step }: { item: Item; step: Step }) {
  const { data, review } = usePage()
  const comments = review.comments.filter((c) => c.item === item.id)
  return (
    <li data-verdict={item.id} className="text-sm leading-6">
      <div className="flex items-center justify-between gap-x-4 py-2 pr-4 pl-4 sm:pl-[3.25rem]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5">
            <ItemLink id={item.id} aria-label={COPY.decide.openIn(item.title, COPY.steps.name[step.id])} className="font-medium underline decoration-foreground/20 underline-offset-4 hover:decoration-current">{item.title}</ItemLink>
            <StatusPill item={item} />
          </div>
          <p className="text-xs leading-5 text-muted-ink">{gateWhy(item)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2"><VerdictButtons item={item} /></div>
      </div>
      <BackStrip item={item} />
      {comments.map((c, i) => (
        <div key={i} className="px-4 pb-3 sm:pl-[3.25rem]">
          <ReaderNote icon={<MessageSquareIcon className="mt-1 size-3.5 shrink-0 text-revise-ink" />} label={`${COPY.comment.yours}${c.anchor ? ` · ${c.anchor}` : ""}`} text={c.text} />
        </div>
      ))}
      {item.type === "grant" && (
        <div className="px-4 pb-3 sm:pl-[3.25rem]" data-decide="grant">
          <Disclosure label={COPY.decide.grant}><GrantView grant={item} prs={data.manifest.facts.prs ?? []} /></Disclosure>
        </div>
      )}
    </li>
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
    <li data-decision={item.id} className="py-2.5 pr-4 pl-4 text-sm leading-6 sm:pl-[3.25rem]">
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
