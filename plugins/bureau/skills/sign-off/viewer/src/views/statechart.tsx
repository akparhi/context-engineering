import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { ArrowRightIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, PlayIcon, XIcon } from "lucide-react"
import type { ArrowId, BugPath, ChartGraph, ChartLayout, RunLayout, StateId } from "../../../scripts/layout/chart.ts"
import { FONTS, textWidth } from "../../../scripts/layout/text.ts"
import type { ReportJson, StatechartInput } from "../../../scripts/views.ts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { COPY } from "../copy.ts"
import { Fold, IdChip, LooseEnd, Subhead, useOpenFold } from "../parts.tsx"
import type { Links, Ref } from "../plan.ts"
import type { RowLine, ViewProps } from "../views.tsx"

type Run = StatechartInput["runs"][number]
type Status = "holds" | "breaks" | "unchecked"
type Trigger = NonNullable<StatechartInput["triggers"]>[string]
type Note = NonNullable<StatechartInput["notes"]>[string]
type Go = (ref: Ref) => void
type Look = { run: string; all: boolean; bug: string | null; step: number }

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
/** A rule that guards no requirement and is not parked: a loose end, so slim never folds it away. */
const guardsNone = (input: StatechartInput, rule: string) => !input.serves?.[rule]?.length && !input.parked?.[rule]

/** How slim folds one run. `breaks`: the chart folds to the way a rule breaks, and the rules that hold to a count. `hold`: every rule
 *  holds, so the chart and the rules fold together to that count. `show`: no chart, no report or a rule not checked, so it all shows. */
type ChartFold = "breaks" | "hold" | "show"
function chartFold(input: StatechartInput, run: Run, chart: RunLayout | undefined): ChartFold {
  // With no report every rule is not checked.
  const status = ruleNames(input).map((n) => statusOf(run.report, n))
  if (!chart) return "show"
  return status.includes("breaks") ? "breaks" : status.includes("unchecked") ? "show" : "hold"
}

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

function Glossary({ terms }: { terms: NonNullable<StatechartInput["terms"]> }) {
  return (
    <dl className="grid gap-x-6 gap-y-1.5 text-sm leading-6 md:grid-cols-3" data-part="glossary">
      {terms.map((t) => <div key={t.word}><dt className="inline font-medium">{t.word}:</dt> <dd className="inline text-muted-foreground">{t.means}</dd></div>)}
    </dl>
  )
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
        <button key={r.id} type="button" aria-pressed={r.id === current} onClick={() => onPick(r.id)}
          className="h-8 rounded-4xl px-3 text-sm font-medium text-muted-ink outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-xs">
          {r.label} · {word(r)}
        </button>
      ))}
    </div>
  )
}

type Lit = { nodes: Set<StateId>; edges: Set<ArrowId>; curNode: StateId | null; curEdge: ArrowId | null; stepping: boolean; upTo: number; path: BugPath | null }
function litOf(chart: RunLayout, look: Look, rule: string | null): Lit {
  const path = rule === null ? null : chart.paths[rule] ?? null
  const stepping = look.bug !== null && path !== null
  const upTo = stepping ? look.step : path ? path.states.length - 1 : -1
  return {
    path, stepping, upTo,
    nodes: new Set(path?.states.slice(0, upTo + 1)),
    edges: new Set(path?.arrows.slice(1, upTo + 1).filter((a): a is ArrowId => a !== null)),
    curNode: stepping ? path!.states[look.step] : null,
    curEdge: stepping ? path!.arrows[look.step] : null,
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
function ChartLegend({ chart, graph, red }: { chart: RunLayout; graph: ChartGraph; red: boolean }) {
  const row = graph.nodes.flatMap((n) => n.rows)[0]
  const l = s.legend
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-ink" data-part="legend">
      <span className="inline-flex items-center gap-1.5"><Swatch className="bg-card ring-1 ring-foreground/25" />{l.state}</span>
      {graph.groups.length > 0 && <span className="inline-flex items-center gap-1.5"><Swatch className="border border-dashed border-foreground/30 bg-muted/60" />{l.group}</span>}
      {row && <span className="inline-flex items-center gap-1"><span className="font-medium text-foreground">{row.on}</span>→ {row.to}{l.row}</span>}
      {red && <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4 bg-break-solid" />{l.path}</span>}
      {Object.keys(chart.paths).length > 0 && <span className="inline-flex items-center gap-1.5"><Swatch className="bg-break-soft ring-[1.5px] ring-break-solid" />{l.breaks}</span>}
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
    <li className={`flex items-start gap-1 rounded-xl ${i === k ? "bg-muted" : ""} ${i > k ? "opacity-45" : ""} motion-safe:transition-opacity`}>
      <button type="button" aria-current={i === k ? "step" : undefined} onClick={onPick}
        className="flex min-w-0 flex-1 items-baseline gap-3 rounded-xl px-2.5 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-focus">
        <span className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-xs font-semibold tabular-nums ${i === k ? "ring-[1.5px] ring-break-solid" : ""}`}>{i}</span>
        <span className="min-w-0">
          {at.step && <><span className="text-muted-foreground">{at.step}</span> <ArrowRightIcon aria-hidden className="inline size-3.5 text-muted-foreground" /> </>}
          <span className={`font-medium ${i === last ? "text-break-ink" : ""}`}>{at.state}</span>
        </span>
      </button>
      {(trigger || stored) && (
        <span className="flex shrink-0 flex-col items-end gap-0.5 px-2.5 py-1.5 text-right text-xs leading-5 text-muted-ink max-sm:hidden">
          {trigger && <TriggerLine trigger={trigger} />}
          {stored && <span>{s.kept} <button type="button" className={`${LINK} font-mono`} onClick={() => go(`db:${stored}`)}>{stored}</button></span>}
        </span>
      )}
    </li>
  )
}

function Stepper({ rule, run, look, input, links, runs, onStep, onRun, go }: {
  rule: string; run: Run; look: Look; input: StatechartInput; links: Links; runs: Run[]
  onStep: (k: number) => void; onRun: (run: string) => void; go: Go
}) {
  const broken = run.report?.rules.find((r) => r.name === rule)
  const path = broken?.outcome === "broken" ? broken.path ?? [] : []
  const k = look.step, last = path.length - 1
  const loop = broken?.outcome === "broken" ? broken.loop : undefined
  const proven = links[`rule:${rule}`] ?? []
  const plan = runs[0]
  return (
    <section className="mt-4 rounded-3xl p-4 ring-1 ring-foreground/10" aria-label={s.stepsTitle(input.says[rule] ?? rule)} data-part="stepper">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-medium">{s.stepsTitle(input.says[rule] ?? rule)}</h4>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon-sm" disabled={k === 0} aria-label={s.previous} onClick={() => onStep(k - 1)}><ChevronLeftIcon /></Button>
          <span className="w-20 text-center text-sm text-muted-foreground tabular-nums" aria-live="polite">{s.stepOf(k, last)}</span>
          <Button variant="outline" size="icon-sm" disabled={k === last} aria-label={s.next} onClick={() => onStep(k + 1)}><ChevronRightIcon /></Button>
        </div>
      </div>
      <ol className="mt-3 flex flex-col gap-1">
        {path.map((at, i) => <StepRow key={i} i={i} k={k} last={last} at={at} input={input} onPick={() => onStep(i)} go={go} />)}
      </ol>
      {loop && <p className="mt-2 text-sm text-muted-foreground">{loop.stutters ? s.stutters(loop.start) : s.loop(loop.start)}</p>}
      <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {isFixed(input, run.id, rule) && plan && plan.id !== run.id
          ? <><button type="button" className={LINK} onClick={() => onRun(plan.id)}>{s.switchTo(plan.label)}</button> {s.holdsThere}</>
          : proven.length ? <>{s.provenBy} {proven.map((id) => <IdChip key={id} id={id} />)}</>
          : <LooseEnd>{s.noReplay}</LooseEnd>}
      </p>
    </section>
  )
}

function Decision({ decision }: { decision: NonNullable<Note["decision"]> }) {
  const side = ([head, text]: readonly [string, string], chosen: boolean) => (
    <div className={`rounded-2xl p-3.5 ${chosen ? "bg-muted/60 ring-1 ring-foreground/15 dark:bg-muted/40" : "border border-dashed border-foreground/25"}`}>
      <div className="text-xs font-medium text-muted-ink">{chosen ? s.chosen : s.other}</div>
      <div className={`mt-1 font-medium ${chosen ? "" : "text-muted-foreground"}`}>{head}</div>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  )
  return (
    <section className="mt-6" data-part="decision">
      <Subhead>{s.decision}</Subhead>
      <div className="grid gap-3 md:grid-cols-2">{side(decision.chosen, true)}{side(decision.other, false)}</div>
      <p className="mt-2.5 text-sm leading-6">{s.decisionSays}</p>
    </section>
  )
}

const STATUS_BADGE: Record<Status, ReactNode> = {
  holds: <Badge variant="pass"><CheckIcon />{s.status.holds}</Badge>,
  breaks: <Badge variant="break">{s.status.breaks}</Badge>,
  unchecked: <Badge variant="dashed">{s.status.unchecked}</Badge>,
}

function RuleRow({ name, run, input, chart, stepping, onStep }: {
  name: string; run: Run; input: StatechartInput; chart: RunLayout | undefined; stepping: boolean; onStep: () => void
}) {
  const status = statusOf(run.report, name), note = noteOf(input, run.id, name), fixed = isFixed(input, run.id, name)
  const open = status === "breaks" && !fixed
  const path = status === "breaks" ? chart?.paths[name] : undefined
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
      </div>
      {parked && !serves.length && <p className="mt-1.5 text-sm leading-6 text-muted-foreground"><span className="font-medium text-foreground">{s.parked}</span> {parked}</p>}
      {note && status === "breaks" && <p className={`mt-2 text-sm leading-6 ${open ? "text-muted-ink" : "text-muted-foreground"}`}>{note.text}</p>}
      {path && (
        <Button variant={stepping ? "secondary" : "outline"} size="xs" className="mt-2.5" aria-pressed={stepping} onClick={onStep}>
          {stepping ? <XIcon /> : <PlayIcon />}{stepping ? s.stop : s.stepThrough(path.states.length - 1)}
        </Button>
      )}
    </li>
  )
}

const RANK: Record<Status, number> = { breaks: 0, unchecked: 1, holds: 2 }

function Rules({ run, input, chart, look, fold, onBug }: {
  run: Run; input: StatechartInput; chart: RunLayout | undefined; look: Look; fold: ChartFold; onBug: (rule: string) => void
}) {
  const names = ruleNames(input)
    .sort((a, b) => RANK[statusOf(run.report, a)] - RANK[statusOf(run.report, b)])
  const row = (n: string) => <RuleRow key={n} name={n} run={run} input={input} chart={chart} stepping={look.bug === n} onStep={() => onBug(n)} />
  const holding = names.filter((n) => statusOf(run.report, n) === "holds" && !guardsNone(input, n))
  const rest = names.filter((n) => !holding.includes(n))
  return (
    <section className="mt-6">
      <Subhead extra={s.rulesCount(rest.length, holding.length)}>{s.rules}</Subhead>
      {rest.length > 0 && <ul className="grid gap-2 lg:grid-cols-2" data-part="rules-open">{rest.map(row)}</ul>}
      {holding.length > 0 && (
        <Fold part={fold === "hold" ? "chart" : "rules"} summary={fold === "hold" ? undefined : s.othersHold(holding.length)} className={rest.length ? "mt-2" : ""}>
          <ul className="grid gap-2 lg:grid-cols-2" data-part="rules-holding">{holding.map(row)}</ul>
        </Fold>
      )}
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

/** The states a system moves through, laid out by `build`, the rules the checker tested, and each broken rule's shortest path
 *  as a step-through that lights the states and arrows of each step and dims the rest. */
export function StatechartView({ input, layout = {}, links, focus, go }: ViewProps<StatechartInput, ChartLayout>) {
  const runs = runsOf(input, layout)
  const [look, setLook] = useState<Look>({ run: runs[0]?.id ?? BARE, all: false, bug: null, step: 0 })
  const openFold = useOpenFold()
  const run = runs.find((r) => r.id === look.run) ?? runs[0]
  const chart = run && layout[run.id]
  const rule = redRule(look, chart)
  const lit = chart ? litOf(chart, look, rule) : null
  const graph = chart && graphOf(chart, look, rule)

  useEffect(() => {
    if (focus?.startsWith("rule:") || focus?.startsWith("sc:")) setLook((l) => ({ ...l, run: runs[0]?.id ?? l.run }))
  }, [focus])

  if (!run) return null
  const pickRun = (id: string) => setLook((l) => ({ ...l, run: id, bug: null, step: 0 }))
  const bug = (name: string) => {
    if (look.bug !== name) openFold("chart")
    setLook((l) => (l.bug === name ? { ...l, bug: null, step: 0 } : { ...l, bug: name, step: 1 }))
  }
  const last = look.bug && chart?.paths[look.bug] ? chart.paths[look.bug].states.length - 1 : 0
  const step = (k: number) => setLook((l) => ({ ...l, step: Math.max(0, Math.min(last, k)) }))
  const onKey = (e: KeyboardEvent) => {
    if (!look.bug || (e.key !== "ArrowRight" && e.key !== "ArrowLeft") || (e.target instanceof Element && e.target.closest("textarea,input,[role=region]"))) return
    e.preventDefault()
    step(look.step + (e.key === "ArrowRight" ? 1 : -1))
  }
  const drawn = graph ? graph.edges.filter((e) => e.id !== "start").length : 0
  const back = chart ? chart.arrows.length - drawn : 0
  const decision = rule && run.report ? noteOf(input, run.id, rule)?.decision : undefined
  const module = run.report?.module ?? chart?.states[0]?.id.match(/^sc:([^/]+)\//)?.[1] ?? ""
  const fold = chartFold(input, run, chart)
  const shown = rule !== null && statusOf(run.report, rule) === "breaks" ? rule : ruleNames(input).find((n) => statusOf(run.report, n) === "breaks")
  const broken = run.report?.rules.find((r) => r.name === shown)
  const way = broken?.outcome === "broken" ? (broken.path ?? []).map((at) => at.state) : []
  const summary = fold === "breaks" ? <BrokenWay states={way} /> : <span className="text-sm">{s.allHold(ruleNames(input).length)}</span>

  return (
    <div onKeyDown={onKey}>
      {input.terms?.length ? <Glossary terms={input.terms} /> : null}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        {runs.length > 1 || run.id !== BARE ? <RunTabs runs={runs} input={input} current={run.id} onPick={pickRun} /> : <span />}
        {chart && (look.all || back > 0) && (
          <Fold part="chart" keep={fold === "show"}>
            <Button variant={look.all ? "secondary" : "outline"} size="sm" aria-pressed={look.all} onClick={() => setLook((l) => ({ ...l, all: !l.all }))}>
              {look.all ? s.listBack : s.drawAll(chart.arrows.length)}
            </Button>
          </Fold>
        )}
      </div>
      <Fold part="chart" keep={fold === "show"} summary={summary} className="mt-3">
        <p className="max-w-[78ch] text-sm leading-6 text-muted-foreground" data-part="reading">
          {run.note && <>{run.note} </>}
          <span className="text-foreground">{!chart ? s.noChart : look.all ? s.readAll(chart.arrows.length) : s.read(drawn, back)}</span>
          {!run.report && <> {s.noReport}</>}
        </p>
        {chart && graph && lit && (
          <>
            <div className="mt-4"><Chart chart={chart} graph={graph} lit={lit} focus={focus} label={s.chartLabel(module, chart.states.length)} /></div>
            <div className="mt-3"><ChartLegend chart={chart} graph={graph} red={lit.path !== null} /></div>
          </>
        )}
      </Fold>
      {look.bug && chart?.paths[look.bug] && (
        <Stepper rule={look.bug} run={run} look={look} input={input} links={links} runs={runs} onStep={step} onRun={pickRun} go={go} />
      )}
      {decision && <Decision decision={decision} />}
      <Rules run={run} input={input} chart={chart} look={look} fold={fold} onBug={bug} />
      {chart && module && <ChartSource module={module} chart={chart} checked={run.checked} />}
    </div>
  )
}

/** The folded chart: the states on the way the rule breaks, the last one where it breaks. */
function BrokenWay({ states }: { states: string[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-sm" data-part="broken-way">
      <span className="text-muted-ink">{s.bugPath}</span>
      {states.map((st, i) => (
        <Fragment key={i}>
          {i > 0 && <ArrowRightIcon aria-hidden className="size-3.5 text-muted-foreground" />}
          <span className={`rounded-lg px-2 py-0.5 font-medium ring-1 ${i === states.length - 1 ? "bg-break-soft text-break-ink ring-break-solid" : "ring-foreground/15"}`}>{st}</span>
        </Fragment>
      ))}
    </span>
  )
}

/** The folded Behavior card, from the plan's own run: how many rules and how many hold, then each broken rule, each rule not checked
 *  and each rule that guards no requirement as a loose end. */
export function statechartRow(input: StatechartInput): RowLine {
  const run = input.runs[0]
  const report = run?.report ?? null
  const names = ruleNames(input)
  const count = (status: Status) => names.filter((n) => statusOf(report, n) === status).length
  const breaks = names.filter((n) => statusOf(report, n) === "breaks" && !isFixed(input, run?.id ?? "", n)).length
  const unchecked = count("unchecked")
  const unguarded = names.filter((n) => guardsNone(input, n))
  return {
    says: s.row(names.length, report ? count("holds") : null),
    loose: [...(breaks ? [s.breaksLine(breaks)] : []), ...(unchecked ? [s.uncheckedLine(unchecked)] : []), ...unguarded.map((n) => s.guardsNoneLine(input.says[n]))],
  }
}
