import { useState, type ReactNode } from "react"
import { ArrowRightIcon, CheckIcon, FlaskConicalIcon, GlobeIcon, LayersIcon, MonitorIcon, type LucideIcon } from "lucide-react"
import type { Acceptance, RuleWords, Test, TraceInput } from "../../../scripts/views.ts"
import { COPY } from "../copy.ts"
import { IdChip, LooseEnd } from "../parts.tsx"
import type { Ref } from "../plan.ts"
import type { ViewProps } from "../views.tsx"

type Layer = Test["type"]
type Row = TraceInput["rows"][number]
type Go = (ref: Ref) => void
/** What every row reads beside its own data: the pull requests per unit, and each named rule's words and verdict. */
type Joins = Pick<TraceInput, "prsOf" | "rules"> & { go: Go }

const s = COPY.trace
/** The column order. A layer is zinc with an icon and never gets a hue of its own. */
const LAYERS = ["unit", "behavior", "e2e", "live"] as const satisfies readonly Layer[]
const LAYER_ICON: Record<Layer, LucideIcon> = { unit: FlaskConicalIcon, behavior: LayersIcon, e2e: MonitorIcon, live: GlobeIcon }
/** One template for the lane head and every row, so the four layer columns line up down the whole view. */
const TRACE_GRID = "grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 gap-y-2 lg:grid-cols-[2.75rem_minmax(0,1.6fr)_repeat(4,minmax(0,1fr))_5.5rem] lg:gap-x-4"
const LINK = "rounded-md text-link underline decoration-link/30 underline-offset-4 hover:decoration-link"
const NAMED = "bg-secondary text-foreground ring-1 ring-foreground/10"
const PROPOSED = "border border-dashed border-foreground/35 text-muted-ink"
const HOLE = "rounded-lg border border-dashed border-foreground/20"

function LayerLabel({ layer, className = "" }: { layer: Layer; className?: string }) {
  const Icon = LAYER_ICON[layer]
  return <span className={`inline-flex items-center gap-1.5 text-xs text-muted-ink ${className}`}><Icon className="size-3.5 shrink-0" />{s.layers[layer]}</span>
}

const provesRow = (a: Acceptance) => (t: Test) => t.proves.includes(a.id)

/** Per layer, how many tests the plan names and how many it only proposes, and how many row-layer cells have no test. */
export function LayerCounts({ tests, acceptance }: { tests: Test[]; acceptance: { a: Acceptance; tests: Test[] }[] }) {
  const holes = acceptance.reduce((sum, { tests: ts }) => sum + LAYERS.filter((l) => !ts.some((t) => t.type === l)).length, 0)
  return (
    <p className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm" data-part="counts">
      {LAYERS.map((l) => {
        const ts = tests.filter((t) => t.type === l), proposed = ts.filter((t) => t.proposed).length
        return <span key={l} className="inline-flex items-center gap-1.5"><LayerLabel layer={l} className="text-sm text-foreground" /><span className="font-medium tabular-nums">{s.count(ts.length - proposed, proposed)}</span></span>
      })}
      <span className="text-muted-foreground"><span className="font-medium tabular-nums text-foreground">{holes}</span> {s.holes(holes)} {s.inRows(acceptance.length)}</span>
    </p>
  )
}

const Sample = ({ className, children }: { className: string; children?: string }) => (
  <span className={`inline-flex min-h-6 items-center rounded-lg px-2 font-mono text-xs ${className}`}>{children}</span>
)
function Legend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-ink" data-part="legend">
      <span className="inline-flex items-center gap-2"><Sample className={NAMED}>test</Sample>{s.named}</span>
      <span className="inline-flex items-center gap-2"><Sample className={PROPOSED}>test</Sample>{s.proposed}</span>
      <span className="inline-flex items-center gap-2"><span className={`block h-6 w-12 ${HOLE}`} />{s.hole}</span>
    </div>
  )
}

function TestChip({ t, open, onToggle, detailId }: { t: Test; open: boolean; onToggle: () => void; detailId: string }) {
  return (
    <button type="button" data-ref={t.id} aria-expanded={open} aria-controls={detailId} onClick={onToggle}
      className={`inline-flex min-h-6 max-w-full scroll-mt-28 items-center rounded-lg px-2 py-0.5 text-left font-mono text-xs leading-4 [overflow-wrap:anywhere] outline-none hover:text-link focus-visible:ring-2 focus-visible:ring-focus ${t.proposed ? PROPOSED : NAMED} ${open ? "ring-2 ring-foreground/30" : ""}`}>
      {t.name}{t.proposed && <span className="sr-only"> {s.proposedLabel}</span>}
    </button>
  )
}

/** What one test proves, opened from its chip. */
export function TestDetail({ t, id }: { t: Test; id: string }) {
  return (
    <div id={id} className="col-span-full rounded-2xl bg-muted/50 px-3 py-2.5 text-sm leading-6 lg:col-start-2 dark:bg-muted/30" data-part="test-detail">
      <div className="flex flex-wrap items-center gap-2"><IdChip id={t.id} /><span className="font-mono text-xs font-medium">{t.name}</span><LayerLabel layer={t.type} /><IdChip id={t.unit} /></div>
      <p className="mt-1">{t.says}</p>
      {t.proposed && <p className="text-xs text-muted-ink">{s.notInPlan}</p>}
      <dl className="mt-1 grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 text-xs leading-5">
        {t.file && <><dt className="text-muted-ink">{s.file}</dt><dd className="font-mono break-all">{t.file}</dd></>}
        {t.run && <><dt className="text-muted-ink">{s.run}</dt><dd className="font-mono break-all">{t.run}</dd></>}
      </dl>
    </div>
  )
}

/** The acceptance sentence: `says`, or given, when and then. */
function Sentence({ a }: { a: Acceptance }) {
  if (a.says) return <p className="text-sm leading-6">{a.says}</p>
  const clause = (word: string, text?: string) => text && <span className="block"><span className="font-medium text-muted-ink">{word}</span> {text}</span>
  return <p className="text-sm leading-6">{clause(s.given, a.given)}{clause(s.when, a.when)}{clause(s.then, a.then)}</p>
}

/** The rule a row guards, said by whether the plan's own model check shows it holding. A row with no requirement adds why the rule
 *  is parked. */
function Guards({ words, rule, loose }: { words?: RuleWords; rule: ReactNode; loose: boolean }) {
  const parked = loose && words?.parked ? <> {words.parked}</> : null
  if (words?.outcome === "holds") return <span><CheckIcon aria-hidden className="mr-1 inline size-3.5 -translate-y-px text-pass-ink" />{s.holds[0]}{rule}{s.holds[1]}{parked}</span>
  if (words?.outcome === "broken") return <span>{s.breaks[0]}{rule}{s.breaks[1]}{parked}</span>
  return <span>{s.guards} {rule}.{parked}</span>
}

/** Where the row points outside this view: the screens it is seen on, and the rule it guards or was added for. */
function RowNotes({ a, rules, go }: { a: Acceptance } & Omit<Joins, "prsOf">) {
  const name = (ref: string) => ref.replace(/^rule:/, "")
  const rule = (ref: string) => <button type="button" className={LINK} onClick={() => go(ref)}>{rules[name(ref)]?.says ?? name(ref)}</button>
  if (!a.screens?.length && !a.guards && !a.addedFor) return null
  const words = a.guards ? rules[name(a.guards)] : undefined
  const guard = a.guards && <Guards words={words} rule={rule(a.guards)} loose={a.requirement === null} />
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-muted-ink" data-part="row-notes">
      {a.addedFor && <span>{s.addedFor} {rule(a.addedFor)}.</span>}
      {quiet(a, words) ? <div>{guard}</div> : guard}
      {a.screens?.length ? <span className="inline-flex flex-wrap items-center gap-1">{s.seenOn} {a.screens.map((id) => <IdChip key={id} id={id} />)}</span> : null}
    </div>
  )
}

/** A guard whose rule the model check shows holding is a passing check, drawn in a box of its own. */
const quiet = (a: Acceptance, words?: RuleWords) => words?.outcome === "holds" && !(a.requirement === null && words.parked)

function AccRow({ a, tests, prsOf, rules, go }: { a: Acceptance; tests: Test[] } & Joins) {
  const [open, setOpen] = useState<string | null>(null)
  const units = [...new Set(tests.map((t) => t.unit))].sort()
  const shown = tests.find((t) => t.id === open)
  const detailId = `test-detail-${a.id}`
  return (
    <li data-ref={a.id} className={`${TRACE_GRID} scroll-mt-28 border-t border-border/60 px-3 py-3`}>
      <span className="pt-0.5"><IdChip id={a.id} /></span>
      <div className="min-w-0"><Sentence a={a} /><RowNotes a={a} rules={rules} go={go} /></div>
      <div className="col-start-2 min-w-0 lg:col-span-5 lg:col-start-3">
        <div className="grid gap-y-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_5.5rem] lg:gap-x-4">
          {LAYERS.map((l) => {
            const ts = tests.filter((t) => t.type === l)
            return (
              <div key={l} className="flex min-w-0 items-start gap-3" data-part="layer">
                <LayerLabel layer={l} className="w-24 shrink-0 pt-1 lg:hidden" />
                <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                  {ts.length ? ts.map((t) => <TestChip key={t.id} t={t} open={open === t.id} detailId={detailId} onToggle={() => setOpen(open === t.id ? null : t.id)} />)
                    : <span className={`block h-6 w-full ${HOLE}`} role="img" aria-label={s.noTest(s.layers[l])} />}
                </div>
              </div>
            )
          })}
          <div className="flex min-w-0 items-start gap-3" data-part="built-in">
            <span className="w-24 shrink-0 pt-0.5 text-xs text-muted-ink lg:hidden">{s.builtIn}</span>
            <div className="flex flex-wrap gap-x-2 gap-y-1 lg:flex-col">
              {units.map((u) => (
                <span key={u} className="inline-flex items-center gap-1">
                  <IdChip id={u} />
                  {(prsOf[u] ?? []).map((p) => <span key={p} className="inline-flex items-center gap-1"><ArrowRightIcon aria-hidden className="size-3 text-muted-ink" /><button type="button" className={`${LINK} font-mono text-xs`} onClick={() => go(p)}>{p}</button></span>)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      {shown && <TestDetail t={shown} id={detailId} />}
    </li>
  )
}

function Lane({ row, ...joins }: { row: Row } & Joins) {
  const r = row.requirement
  return (
    <section aria-label={r ? `${r.id} ${r.title}` : s.checksNothing} className="overflow-hidden rounded-2xl ring-1 ring-foreground/10">
      <div className={`${TRACE_GRID} items-center bg-act-paper-strong px-3 py-2 dark:bg-act-paper-strong/60`}>
        <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-2 text-sm">
          {r ? <><IdChip id={r.id} /><span className="min-w-0 font-medium">{r.title}</span></> : <><LooseEnd>{s.noRequirement}</LooseEnd><span className="font-medium">{s.checksNothing}</span></>}
        </div>
        {LAYERS.map((l) => <span key={l} className="hidden lg:block"><LayerLabel layer={l} /></span>)}
        <span className="hidden text-xs text-muted-ink lg:block">{s.builtIn}</span>
      </div>
      <ul>{row.acceptance.map((a) => <AccRow key={a.id} a={a} tests={row.tests.filter(provesRow(a))} {...joins} />)}</ul>
    </section>
  )
}

/** Every requirement lane at once: each acceptance row, the tests that prove it in four fixed layer columns, and the unit that builds it. */
export function TraceView({ input, go }: ViewProps<TraceInput>) {
  const tests = [...new Map(input.rows.flatMap((r) => r.tests).map((t) => [t.id, t])).values()]
  const acceptance = input.rows.flatMap((r) => r.acceptance.map((a) => ({ a, tests: r.tests.filter(provesRow(a)) })))
  return (
    <>
      <LayerCounts tests={tests} acceptance={acceptance} />
      <Legend />
      <div className="mt-5 flex flex-col gap-4">{input.rows.map((row) => <Lane key={row.requirement?.id ?? "none"} row={row} prsOf={input.prsOf} rules={input.rules} go={go} />)}</div>
    </>
  )
}
