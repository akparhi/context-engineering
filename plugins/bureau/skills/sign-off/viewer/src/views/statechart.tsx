import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { ArrowRightIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import type { ArrowId, BugPath, ChartGraph, ChartLayout, RunLayout, StateId } from "../../../scripts/layout/chart.ts"
import { FONTS, textWidth } from "../../../scripts/layout/text.ts"
import type { ReportJson, StatechartInput } from "../../../scripts/views.ts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { COPY } from "../copy.ts"
import { IdChip, LooseEnd } from "../parts.tsx"
import type { Links, Ref } from "../plan.ts"
import type { ViewProps } from "../views.tsx"

type Run = StatechartInput["runs"][number]
type Status = "holds" | "breaks" | "unchecked"
type Trigger = NonNullable<StatechartInput["triggers"]>[string]
type Note = NonNullable<StatechartInput["notes"]>[string]
type Go = (ref: Ref) => void
/** `bug` is the rule the reader picked, else the chart's own. `step` is the step shown, and null is the last one. */
type Look = { run: string; all: boolean; bug: string | null; step: number | null }

const s = COPY.statechart
const ROW_H = 17, PAD = 12, BOX_PAD = 12

const BARE = "chart"
const runsOf = (input: StatechartInput, layout: ChartLayout): Run[] =>
  input.runs.length ? input.runs : layout[BARE] ? [{ id: BARE, label: "", note: "", report: null, checked: null }] : []

function statusOf(report: ReportJson | null, rule: string): Status {
  const outcome = report?.rules.find((r) => r.name === rule)?.outcome
  return outcome === "broken" ? "breaks" : outcome === "holds" ? "holds" : "unchecked"
}
const noteOf = (input: StatechartInput, run: string, rule: string): Note | undefined => input.notes?.[`${run}:${rule}`]
const isFixed = (input: StatechartInput, run: string, rule: string) => noteOf(input, run, rule)?.verdict === "fixed"
const ruleNames = (input: StatechartInput) => Object.keys(input.says).filter((n) => !input.hide?.includes(n))
/** A rule that guards no requirement and is not parked: a loose end. */
const guardsNone = (input: StatechartInput, rule: string) => !input.serves?.[rule]?.length && !input.parked?.[rule]

const redRule = (look: Look, chart: RunLayout | undefined) => (look.bug ?? chart?.focus ?? null)

function graphOf(chart: RunLayout, look: Look, rule: string | null): ChartGraph {
  const at = look.all ? chart.pick.all : rule !== null && rule in chart.pick.rules ? chart.pick.rules[rule] : chart.pick.none
  return chart.graphs[at]
}

function roundedPath(points: { x: number; y: number }[], r: number) {
  if (points.length < 3) return `M${points.map((p) => `${p.x},${p.y}`).join(" L")}`
  let d = `M${points[0].x},${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i - 1], c = points[i], n = points[i + 1]
    const l1 = Math.hypot(c.x - p.x, c.y - p.y), l2 = Math.hypot(n.x - c.x, n.y - c.y), k = Math.min(r, l1 / 2, l2 / 2)
    d += ` L${c.x - ((c.x - p.x) / l1) * k},${c.y - ((c.y - p.y) / l1) * k} Q${c.x},${c.y} ${c.x + ((n.x - c.x) / l2) * k},${c.y + ((n.y - c.y) / l2) * k}`
  }
  const last = points.at(-1)!
  return `${d} L${last.x},${last.y}`
}

type Term = NonNullable<StatechartInput["terms"]>[number]
const wordOf = (terms: Term[]) => new RegExp(`\\b(${terms.map((t) => t.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi")

/** A word of the plan's glossary, with what it means on hover or focus. */
const TermWord = ({ term, children }: { term: Term; children: ReactNode }) => (
  <HoverCard>
    <HoverCardTrigger delay={150} render={<span tabIndex={0} className="cursor-help rounded-sm underline decoration-foreground/40 decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-focus" />}>{children}</HoverCardTrigger>
    <HoverCardContent align="start" className="w-auto max-w-80 px-3 py-2 text-sm leading-6"><span className="font-medium">{term.word}:</span> {term.means}</HoverCardContent>
  </HoverCard>
)

/** `text` with each glossary word it uses turned into a TermWord. */
function Termed({ text, terms }: { text: string; terms: Term[] }) {
  if (!terms.length) return text
  return text.split(wordOf(terms)).map((piece, i) => {
    const term = i % 2 ? terms.find((t) => t.word.toLowerCase() === piece.toLowerCase()) : undefined
    return term ? <TermWord key={i} term={term}>{piece}</TermWord> : piece
  })
}

function RunTabs({ runs, input, current, onPick }: { runs: Run[]; input: StatechartInput; current: string; onPick: (run: string) => void }) {
  const word = (run: Run) => {
    const broken = run.report?.rules.filter((r) => r.outcome === "broken") ?? []
    const fixed = broken.filter((r) => isFixed(input, run.id, r.name)).length
    return s.tabWord(broken.length - fixed, fixed, run.report !== null)
  }
  return (
    <div role="group" aria-label={s.versions} className="inline-flex flex-wrap gap-1 rounded-4xl bg-muted p-1">
      {runs.map((r) => (
        <Tooltip key={r.id} disabled={!r.note}>
          <TooltipTrigger render={<button type="button" aria-pressed={r.id === current} onClick={() => onPick(r.id)}
            className="h-8 rounded-4xl px-3 text-sm font-medium text-muted-ink outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-xs" />}>
            {r.label} · {word(r)}
          </TooltipTrigger>
          <TooltipContent className="max-w-80">{r.note}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

type Lit = { nodes: Set<StateId>; edges: Set<ArrowId>; curNode: StateId | null; curEdge: ArrowId | null; stepping: boolean; upTo: number; path: BugPath | null }
function litOf(chart: RunLayout, look: Look, rule: string | null): Lit {
  const path = rule === null ? null : chart.paths[rule] ?? null
  const last = path ? path.states.length - 1 : -1
  const upTo = Math.min(look.step ?? last, last)
  const stepping = path !== null && upTo < last
  return {
    path, stepping, upTo,
    nodes: new Set(path?.states.slice(0, upTo + 1)),
    edges: new Set(path?.arrows.slice(1, upTo + 1).filter((a): a is ArrowId => a !== null)),
    curNode: stepping ? path.states[upTo] : null,
    curEdge: stepping ? path.arrows[upTo] : null,
  }
}

const GREY_LINE = "stroke-muted-foreground/70"
function Edge({ e, lit, marker }: { e: ChartGraph["edges"][number]; lit: Lit; marker: (red: boolean) => string }) {
  if (e.points.length < 2) return null
  const red = e.id !== "start" && (lit.edges.has(e.id) || e.id === lit.curEdge)
  const dim = lit.stepping && e.id !== "start" && !red
  return (
    <path d={roundedPath(e.points, 8)} fill="none" data-edge={e.id} markerEnd={`url(#${marker(red)})`}
      className={`${red ? "stroke-break-solid" : GREY_LINE} motion-safe:transition-opacity ${dim ? "opacity-45" : ""}`}
      strokeWidth={e.id === lit.curEdge ? 2.4 : red ? 1.8 : 1.2} />
  )
}

function EdgeLabel({ e, lit, steps }: { e: ChartGraph["edges"][number]; lit: Lit; steps: string }) {
  const l = e.label
  if (!l) return null
  const red = e.id !== "start" && (lit.edges.has(e.id) || e.id === lit.curEdge)
  return (
    <g transform={`translate(${l.x},${l.y})`} className={`motion-safe:transition-opacity ${lit.stepping && !red ? "opacity-45" : ""}`}>
      <title>{steps}</title>
      <rect width={l.width} height={l.height} rx={6} className={`fill-card ${red ? "stroke-break-line" : "stroke-foreground/10"}`} />
      <text textAnchor="middle" className={`text-[12px] font-medium ${red ? "fill-break-ink" : "fill-muted-ink"}`}>
        {l.lines.map((line, i) => <tspan key={i} x={l.width / 2} y={14 + i * 15}>{line}</tspan>)}
      </text>
    </g>
  )
}

function StateBox({ n, lit, broken, mayBreak, focused }: { n: ChartGraph["nodes"][number]; lit: Lit; broken: boolean; mayBreak: boolean; focused: boolean }) {
  const on = lit.nodes.has(n.id), cur = n.id === lit.curNode
  const visits = lit.path ? lit.path.states.flatMap((id, i) => (id === n.id && i <= lit.upTo ? [i] : [])) : []
  const chip = visits.join(", "), chipW = Math.max(22, textWidth(chip, FONTS.chip) + 14)
  const stroke = on || broken ? "stroke-break-solid" : mayBreak ? "stroke-break-line" : "stroke-foreground/25"
  return (
    <g data-ref={n.id} data-state={n.id} className={`motion-safe:transition-opacity ${lit.stepping && !on ? "opacity-45" : ""}`}>
      <rect x={n.x} y={n.y} width={n.width} height={n.height} rx={10} className="fill-card" />
      <rect x={n.x} y={n.y} width={n.width} height={n.height} rx={10} className={`${broken ? "fill-break-soft" : "fill-none"} ${stroke}`}
        strokeWidth={cur || broken ? 2 : on ? 1.5 : 1} strokeDasharray={mayBreak && !broken && !on ? "4 3" : undefined} />
      {cur && <rect x={n.x - 4} y={n.y - 4} width={n.width + 8} height={n.height + 8} rx={13} className="fill-none stroke-break-solid" strokeWidth={1.5} strokeDasharray="3 3" />}
      {focused && !cur && <rect x={n.x - 4} y={n.y - 4} width={n.width + 8} height={n.height + 8} rx={13} className="fill-none stroke-focus" strokeWidth={2} />}
      <text textAnchor="middle" className="fill-foreground text-[13px] font-medium">
        {n.lines.map((line, i) => <tspan key={i} x={n.x + n.width / 2} y={n.y + n.titleHeight / 2 + 4.5 + (i - (n.lines.length - 1) / 2) * 17}>{line}</tspan>)}
      </text>
      {n.rows.length > 0 && <line x1={n.x + 8} x2={n.x + n.width - 8} y1={n.y + n.titleHeight} y2={n.y + n.titleHeight} className="stroke-foreground/12" />}
      {n.rows.map((r, i) => (
        <text key={r.arrow} x={n.x + 14} y={n.y + n.titleHeight + 17 + i * ROW_H} className="fill-muted-ink text-[12px]">
          <title>{s.rowTitle(r.on, r.to)}</title>
          <tspan className="fill-foreground font-medium">{r.on}</tspan> → {r.to}
        </text>
      ))}
      {visits.length > 0 && (
        <g transform={`translate(${n.x - 10},${n.y - 11})`}>
          <rect width={chipW} height={22} rx={11} className={`fill-secondary ${cur ? "stroke-break-solid" : "stroke-border"}`} strokeWidth={cur ? 1.5 : 1} />
          <text x={chipW / 2} y={15.5} textAnchor="middle" className="fill-foreground text-[12px] font-semibold">{chip}</text>
        </g>
      )}
    </g>
  )
}

function Chart({ chart, graph, lit, focus, label }: { chart: RunLayout; graph: ChartGraph; lit: Lit; focus: Ref | null; label: string }) {
  const uid = useId().replace(/[^\w-]/g, "")
  const marker = (red: boolean) => `${uid}-${red ? "break" : "arrow"}`
  const stepsOf = new Map(chart.arrows.map((a) => [a.id, a.steps.join(" or ")]))
  const brokenAt = new Set([...Object.values(chart.paths).map((p) => p.states.at(-1)!), ...chart.states.flatMap((st) => (st.mark === "breaks" ? [st.id] : []))])
  const mayBreak = new Set(chart.states.flatMap((st) => (st.mark === "mayBreak" ? [st.id] : [])))
  const W = graph.width + PAD * 2, H = graph.height + PAD * 2
  const pan = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = pan.current, n = graph.nodes.find((x) => x.id === (lit.curNode ?? focus))
    if (!el || !n || el.scrollWidth <= el.clientWidth) return
    const left = BOX_PAD + PAD + n.x
    if (left < el.scrollLeft || left + n.width > el.scrollLeft + el.clientWidth) el.scrollTo({ left: left + n.width / 2 - el.clientWidth / 2, behavior: "smooth" })
  }, [lit.curNode, focus, graph])
  return (
    <div ref={pan} role="region" aria-label={label} tabIndex={0} data-part="chart"
      className="overflow-x-auto overscroll-x-contain rounded-3xl bg-card p-3 ring-1 ring-foreground/10 outline-none focus-visible:ring-2 focus-visible:ring-focus">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="mx-auto block font-sans">
        <defs>
          {[false, true].map((red) => (
            <marker key={String(red)} id={marker(red)} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
              <path d="M0,1 L9,5 L0,9 z" className={red ? "fill-break-solid" : "fill-muted-foreground/85"} />
            </marker>
          ))}
        </defs>
        <g transform={`translate(${PAD},${PAD})`}>
          {graph.groups.map((g) => (
            <rect key={g.name} x={g.x} y={g.y} width={g.width} height={g.height} rx={16} className="fill-muted/60 stroke-foreground/22" strokeDasharray="4 4" />
          ))}
          {graph.edges.map((e) => <Edge key={e.id} e={e} lit={lit} marker={marker} />)}
          {graph.groups.map((g) => {
            const w = textWidth(g.name, FONTS.label) + 16
            return (
              <g key={g.name} transform={`translate(${g.x + 10},${g.y + 9})`}>
                <rect width={w} height={22} rx={11} className="fill-card" />
                <text x={8} y={15.5} className="fill-muted-ink text-[12px] font-medium">{g.name}</text>
              </g>
            )
          })}
          {graph.edges.map((e) => <EdgeLabel key={e.id} e={e} lit={lit} steps={e.id === "start" ? "" : stepsOf.get(e.id) ?? ""} />)}
          <circle cx={graph.start.x + 7} cy={graph.start.y + 7} r={7} className="fill-foreground" />
          {graph.nodes.map((n) => <StateBox key={n.id} n={n} lit={lit} broken={brokenAt.has(n.id)} mayBreak={mayBreak.has(n.id)} focused={focus === n.id} />)}
        </g>
      </svg>
    </div>
  )
}

const Swatch = ({ className }: { className: string }) => <span aria-hidden className={`h-3 w-4 shrink-0 rounded-[4px] ${className}`} />
/** `red` adds the two red marks. The view leaves them out when a band already names the break. */
function ChartLegend({ chart, graph, red }: { chart: RunLayout; graph: ChartGraph; red: boolean }) {
  const row = graph.nodes.flatMap((n) => n.rows)[0]
  const l = s.legend
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-ink" data-part="legend">
      <span className="inline-flex items-center gap-1.5"><Swatch className="bg-card ring-1 ring-foreground/25" />{l.state}</span>
      {graph.groups.length > 0 && <span className="inline-flex items-center gap-1.5"><Swatch className="border border-dashed border-foreground/30 bg-muted/60" />{l.group}</span>}
      {row && <span className="inline-flex items-center gap-1"><span className="font-medium text-foreground">{row.on}</span>→ {row.to}{l.row}</span>}
      {red && <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4 bg-break-solid" />{l.path}</span>}
      {red && Object.keys(chart.paths).length > 0 && <span className="inline-flex items-center gap-1.5"><Swatch className="bg-break-soft ring-[1.5px] ring-break-solid" />{l.breaks}</span>}
      {chart.states.some((st) => st.mark === "mayBreak") && <span className="inline-flex items-center gap-1.5"><Swatch className="border border-dashed border-break-line" />{l.mayBreak}</span>}
    </div>
  )
}

const LINK = "rounded-md text-link underline decoration-link/30 underline-offset-4 outline-none hover:decoration-link focus-visible:ring-2 focus-visible:ring-focus"

function TriggerLine({ trigger }: { trigger: Trigger }) {
  if ("endpoint" in trigger) return <span className="inline-flex items-center gap-1.5">{s.trigger.endpoint} <IdChip id={trigger.endpoint} /></span>
  const [lead, words] = "event" in trigger ? [s.trigger.event, trigger.event] : "job" in trigger ? [s.trigger.job, trigger.job]
    : "ops" in trigger ? [s.trigger.ops, trigger.ops] : [s.trigger.time, trigger.time]
  return <span>{lead} {words}</span>
}

function StepRow({ i, k, last, at, input, onPick, go }: {
  i: number; k: number; last: number; at: { state: string; step?: string }; input: StatechartInput; onPick: () => void; go: Go
}) {
  const trigger = at.step === undefined ? undefined : input.triggers?.[at.step]
  const stored = input.stored?.[at.state]
  return (
    <li className={`rounded-xl ${i === k ? "bg-muted" : ""} ${i > k ? "opacity-45" : ""} motion-safe:transition-opacity`}>
      <button type="button" aria-current={i === k ? "step" : undefined} onClick={onPick}
        className="flex w-full min-w-0 items-baseline gap-2.5 rounded-xl px-2 py-1 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-focus">
        <span className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-xs font-semibold tabular-nums ${i === k ? "ring-[1.5px] ring-break-solid" : ""}`}>{i}</span>
        <span className="min-w-0">
          {at.step && <><span className="text-muted-foreground">{at.step}</span> <ArrowRightIcon aria-hidden className="inline size-3.5 text-muted-foreground" /> </>}
          <span className={`font-medium ${i === last ? "text-break-ink" : ""}`}>{at.state}</span>
        </span>
      </button>
      {i === k && (trigger || stored) && (
        <span className="flex flex-wrap gap-x-3 gap-y-0.5 pr-2 pb-1.5 pl-[2.625rem] text-xs leading-5 text-muted-ink">
          {trigger && <TriggerLine trigger={trigger} />}
          {stored && <span>{s.kept} <button type="button" className={`${LINK} font-mono`} onClick={() => go(`db:${stored}`)}>{stored}</button></span>}
        </span>
      )}
    </li>
  )
}

/** The shortest path to the break, always open: the band above it names the rule. */
function Stepper({ rule, run, k, input, runs, onStep, onRun, go }: {
  rule: string; run: Run; k: number; input: StatechartInput; runs: Run[]; onStep: (k: number) => void; onRun: (run: string) => void; go: Go
}) {
  const broken = run.report?.rules.find((r) => r.name === rule)
  const path = broken?.outcome === "broken" ? broken.path ?? [] : []
  const last = path.length - 1
  const loop = broken?.outcome === "broken" ? broken.loop : undefined
  const plan = runs[0]
  return (
    <section aria-label={s.stepsTitle} data-part="stepper">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">{s.stepsTitle}</h4>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon-sm" disabled={k === 0} aria-label={s.previous} onClick={() => onStep(k - 1)}><ChevronLeftIcon /></Button>
          <span className="w-20 text-center text-sm text-muted-foreground tabular-nums" aria-live="polite">{s.stepOf(k, last)}</span>
          <Button variant="outline" size="icon-sm" disabled={k === last} aria-label={s.next} onClick={() => onStep(k + 1)}><ChevronRightIcon /></Button>
        </div>
      </div>
      <ol className="mt-2 flex flex-col gap-0.5">
        {path.map((at, i) => <StepRow key={i} i={i} k={k} last={last} at={at} input={input} onPick={() => onStep(i)} go={go} />)}
      </ol>
      {loop && <p className="mt-2 text-sm text-muted-foreground">{loop.stutters ? s.stutters(loop.start) : s.loop(loop.start)}</p>}
      {isFixed(input, run.id, rule) && plan && plan.id !== run.id && (
        <p className="mt-2 text-sm text-muted-foreground"><button type="button" className={LINK} onClick={() => onRun(plan.id)}>{s.switchTo(plan.label)}</button> {s.holdsThere}</p>
      )}
    </section>
  )
}

/** Both sides of the open rule's decision, the plan's first. Each label says which button takes that side. */
function Decision({ decision }: { decision: NonNullable<Note["decision"]> }) {
  const side = ([head, text]: readonly [string, string], chosen: boolean) => (
    <div className={`rounded-2xl p-3 ${chosen ? "bg-muted/60 ring-1 ring-foreground/15 dark:bg-muted/40" : "border border-dashed border-foreground/25"}`}>
      <div className="text-xs font-medium text-muted-ink">{chosen ? s.chosen : s.other}</div>
      <div className={`mt-1 text-sm leading-5 font-medium ${chosen ? "" : "text-muted-foreground"}`}>{head}</div>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">{text}</p>
    </div>
  )
  return <section className="grid gap-2" data-part="decision">{side(decision.chosen, true)}{side(decision.other, false)}</section>
}

const STATUS_BADGE: Record<Status, ReactNode> = {
  holds: <Badge variant="pass"><CheckIcon />{s.status.holds}</Badge>,
  breaks: <Badge variant="break">{s.status.breaks}</Badge>,
  unchecked: <Badge variant="dashed">{s.status.unchecked}</Badge>,
}

/** `onShow` is set for a rule with a path to its break: the row then offers to put that rule in the band. */
function RuleRow({ name, run, input, onShow }: { name: string; run: Run; input: StatechartInput; onShow?: () => void }) {
  const status = statusOf(run.report, name), note = noteOf(input, run.id, name), fixed = isFixed(input, run.id, name)
  const open = status === "breaks" && !fixed
  const serves = input.serves?.[name] ?? [], parked = input.parked?.[name]
  return (
    <li data-ref={`rule:${name}`} data-rule={name} data-status={status} className={`scroll-mt-28 rounded-2xl p-3 ${open ? "bg-break-soft" : ""}`}>
      <div className="text-sm leading-5 font-medium">{input.says[name]}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {STATUS_BADGE[status]}
        {fixed && <Badge variant="pass"><CheckIcon />{s.fixed}</Badge>}
        {serves.map((r) => <IdChip key={r} id={r} />)}
        {guardsNone(input, name) && <LooseEnd>{s.guardsNone}</LooseEnd>}
        <span className="font-mono text-xs text-muted-ink">{name}</span>
        {onShow && <Button variant="outline" size="xs" className="ml-auto" onClick={onShow}>{s.showPath}</Button>}
      </div>
      {parked && !serves.length && <p className="mt-1.5 text-sm leading-6 text-muted-foreground"><span className="font-medium text-foreground">{s.parked}</span> {parked}</p>}
      {note && status === "breaks" && <p className={`mt-2 text-sm leading-6 ${open ? "text-muted-ink" : "text-muted-foreground"}`}>{note.text}</p>}
    </li>
  )
}

const RANK: Record<Status, number> = { breaks: 0, unchecked: 1, holds: 2 }

/** Every rule but the one the band names, behind one button that counts the ones that hold. */
function OtherRules({ names, run, input, open, onOpen, paths, onRule }: {
  names: string[]; run: Run; input: StatechartInput; open: boolean; onOpen: (open: boolean) => void; paths: string[]; onRule: (rule: string) => void
}) {
  if (!names.length) return null
  const holding = names.filter((n) => statusOf(run.report, n) === "holds" && !guardsNone(input, n)).length
  return (
    <Popover open={open} onOpenChange={onOpen}>
      <PopoverTrigger render={<Button variant="outline" size="sm" data-part="rules" />}>{s.rulesCount(names.length - holding, holding)}<ChevronDownIcon /></PopoverTrigger>
      <PopoverContent align="end" className="w-[min(420px,90vw)] p-2">
        <ul className="flex max-h-[28rem] flex-col gap-1 overflow-y-auto">{names.map((n) => <RuleRow key={n} name={n} run={run} input={input} onShow={paths.includes(n) ? () => { onRule(n); onOpen(false) } : undefined} />)}</ul>
      </PopoverContent>
    </Popover>
  )
}

/** The rule the chart is red for, at full width: what breaks, what it guards, the test that replays it, and why it matters.
 *  `broken` lists every rule with a path when there is more than one, so the reader can switch. */
function RuleBand({ rule, broken, run, input, links, others, onRule }: {
  rule: string; broken: string[]; run: Run; input: StatechartInput; links: Links; others: ReactNode; onRule: (rule: string) => void
}) {
  const note = noteOf(input, run.id, rule), serves = input.serves?.[rule] ?? [], proven = links[`rule:${rule}`] ?? []
  const fixed = isFixed(input, run.id, rule)
  return (
    <section data-part="band" data-ref={`rule:${rule}`} data-rule={rule} data-status="breaks"
      className={`mt-3 scroll-mt-28 rounded-2xl p-3.5 ring-1 ${fixed ? "bg-muted/60 ring-foreground/10" : "bg-break-soft ring-break-line"}`}>
      {broken.length > 1 && (
        <div role="group" aria-label={s.brokenRules} className="mb-2 flex flex-wrap gap-1">
          {broken.map((n) => <Button key={n} variant={n === rule ? "secondary" : "ghost"} size="xs" className="font-mono" aria-pressed={n === rule} onClick={() => onRule(n)}>{n}</Button>)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        {fixed ? <Badge variant="pass"><CheckIcon />{s.fixed}</Badge> : <Badge variant="break">{s.status.breaks}</Badge>}
        <h4 className="font-heading text-xl font-medium tracking-tight">{input.says[rule]}</h4>
        {serves.map((r) => <IdChip key={r} id={r} />)}
        {guardsNone(input, rule) && <LooseEnd>{s.guardsNone}</LooseEnd>}
        <span className="font-mono text-xs text-muted-ink">{rule}</span>
        <span className="ml-auto flex flex-wrap items-center gap-1.5 text-sm text-muted-ink">
          {proven.length ? <>{s.provenBy} {proven.map((id) => <IdChip key={id} id={id} />)}</> : <LooseEnd>{s.noReplay}</LooseEnd>}
          {others}
        </span>
      </div>
      {note && <p className="mt-2 text-sm leading-5 text-muted-ink"><Termed text={note.text} terms={input.terms ?? []} /></p>}
    </section>
  )
}

function ChartSource({ module, chart, checked }: { module: string; chart: RunLayout; checked: string | null }) {
  return (
    <details className="group/details mt-6" data-part="source">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md text-xs font-medium tracking-wide text-muted-ink uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus [&::-webkit-details-marker]:hidden">
        <ChevronDownIcon aria-hidden className="size-4 motion-safe:transition-transform group-open/details:rotate-180" />{s.source}
      </summary>
      <p className="mt-2 max-w-[78ch] text-sm leading-6 text-muted-foreground">{s.sourceSays(module, chart.states.length, chart.arrows.length)}</p>
      {checked && <p className="mt-1 max-w-[78ch] text-sm leading-6 text-muted-foreground" data-part="checked">{s.checked(checked)}</p>}
    </details>
  )
}

/** The states a system moves through, laid out by `build`. A bar holds the versions, the key and the arrow switch. When a rule
 *  breaks, a band names it, and a rail beside the chart steps its shortest path and shows both sides of its decision. The step lights
 *  the states and arrows walked so far and dims the rest; at the last step the whole path is red and nothing is dimmed. */
export function StatechartView({ input, layout = {}, links, focus, go }: ViewProps<StatechartInput, ChartLayout>) {
  const runs = runsOf(input, layout)
  const [look, setLook] = useState<Look>({ run: runs[0]?.id ?? BARE, all: false, bug: null, step: null })
  const [rulesOpen, setRulesOpen] = useState(false)
  const run = runs.find((r) => r.id === look.run) ?? runs[0]
  const chart = run && layout[run.id]
  const rule = redRule(look, chart)
  const path = rule === null ? undefined : chart?.paths[rule]
  const lit = chart ? litOf(chart, look, rule) : null
  const graph = chart && graphOf(chart, look, rule)

  useEffect(() => {
    if (!focus?.startsWith("rule:") && !focus?.startsWith("sc:")) return
    const first = runs[0]?.id, name = focus.startsWith("rule:") ? focus.slice("rule:".length) : null
    const breaks = name !== null && first !== undefined && layout[first]?.paths[name] !== undefined
    setLook((l) => ({ ...l, run: first ?? l.run, ...(breaks ? { bug: name, step: null } : {}) }))
    if (name !== null && !breaks) setRulesOpen(true)
  }, [focus])

  if (!run) return null
  const pickRun = (id: string) => setLook((l) => ({ ...l, run: id, bug: null, step: null }))
  const last = path ? path.states.length - 1 : 0
  const k = look.step ?? last
  const step = (n: number) => setLook((l) => ({ ...l, step: Math.max(0, Math.min(last, n)) }))
  const onKey = (e: KeyboardEvent) => {
    if (!path || (e.key !== "ArrowRight" && e.key !== "ArrowLeft") || (e.target instanceof Element && e.target.closest("textarea,input,[role=region]"))) return
    e.preventDefault()
    step(k + (e.key === "ArrowRight" ? 1 : -1))
  }
  const drawn = graph ? graph.edges.filter((e) => e.id !== "start").length : 0
  const back = chart ? chart.arrows.length - drawn : 0
  const banded = rule !== null && path !== undefined ? rule : null
  const note = banded && run.report ? noteOf(input, run.id, banded) : undefined
  const module = run.report?.module ?? chart?.states[0]?.id.match(/^sc:([^/]+)\//)?.[1] ?? ""
  const names = ruleNames(input).sort((a, b) => RANK[statusOf(run.report, a)] - RANK[statusOf(run.report, b)])
  const paths = names.filter((n) => chart?.paths[n])
  const pickRule = (n: string) => setLook((l) => ({ ...l, bug: n, step: null }))
  const others = <OtherRules names={names.filter((n) => n !== banded)} run={run} input={input} open={rulesOpen} onOpen={setRulesOpen} paths={paths} onRule={pickRule} />
  const loose = (input.terms ?? []).filter((t) => !banded || !noteOf(input, run.id, banded)?.text.match(wordOf([t])))

  return (
    <div onKeyDown={onKey} className="@container">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-part="bar">
        {(runs.length > 1 || run.id !== BARE) && <RunTabs runs={runs} input={input} current={run.id} onPick={pickRun} />}
        {chart && graph && lit && <ChartLegend chart={chart} graph={graph} red={lit.path !== null && !banded} />}
        {loose.length > 0 && <span className="flex flex-wrap gap-x-3 text-xs text-muted-ink" data-part="glossary">{loose.map((t) => <TermWord key={t.word} term={t}>{t.word}</TermWord>)}</span>}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {!banded && others}
          {chart && (look.all || back > 0) && (
            <Button variant={look.all ? "secondary" : "outline"} size="sm" aria-pressed={look.all} onClick={() => setLook((l) => ({ ...l, all: !l.all }))}>
              {look.all ? s.listBack : s.drawAll(chart.arrows.length)}
            </Button>
          )}
        </span>
      </div>
      {(!chart || !run.report) && <p className="mt-3 text-sm leading-6 text-muted-ink">{!chart ? s.noChart : s.noReport}</p>}
      {banded && <RuleBand rule={banded} broken={paths} run={run} input={input} links={links} others={others} onRule={pickRule} />}
      {chart && graph && lit && (
        <div className={`mt-3 grid items-start gap-4 ${banded ? "@[60rem]:grid-cols-[642px_minmax(0,1fr)]" : ""}`}>
          <div className="min-w-0">
            <Chart chart={chart} graph={graph} lit={lit} focus={focus} label={s.chartLabel(module, chart.states.length)} />
            {module && <ChartSource module={module} chart={chart} checked={run.checked} />}
          </div>
          {banded && (
            <aside className="order-first grid min-w-0 items-start gap-3 @2xl:grid-cols-2 @[60rem]:sticky @[60rem]:top-4 @[60rem]:order-none @[60rem]:grid-cols-1" data-part="rail">
              <Stepper rule={banded} run={run} k={k} input={input} runs={runs} onStep={step} onRun={pickRun} go={go} />
              {note?.decision && <Decision decision={note.decision} />}
            </aside>
          )}
        </div>
      )}
    </div>
  )
}
