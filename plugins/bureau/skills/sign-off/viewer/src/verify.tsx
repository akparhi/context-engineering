import type { MouseEvent, ReactNode } from "react"
import { ArrowRightIcon } from "lucide-react"
import type { Acceptance, Test, TraceInput } from "../../scripts/views.ts"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { PropsOf } from "./adapter.ts"
import { COPY } from "./copy.ts"
import { IdChip, LooseEnd, Subhead, usePage } from "./parts.tsx"
import type { Ref } from "./plan.ts"
import { LayerCounts, TestDetail } from "./views/trace.tsx"

type Row = TraceInput["rows"][number]
const LAYERS = ["unit", "behavior", "e2e", "live"] as const satisfies readonly Test["type"][]
const t = COPY.trace, v = COPY.verify
const ID = "inline-flex h-5 w-10 shrink-0 items-center justify-center rounded-md bg-secondary px-1.5 font-mono text-xs font-medium text-foreground ring-1 ring-foreground/10"
const MARK = { named: "bg-foreground/70", proposed: "border border-dashed border-foreground/50", hole: "ring-1 ring-foreground/10" } as const
const NAME = { named: "bg-secondary text-foreground ring-1 ring-foreground/10", proposed: "border border-dashed border-foreground/35 text-muted-ink" } as const
const LINK = "rounded-md text-link underline decoration-link/30 underline-offset-4 hover:decoration-link"
const PRESS = "cursor-pointer rounded-md text-left outline-none hover:text-link focus-visible:ring-2 focus-visible:ring-focus"
const HEAD = "h-9 px-2 text-xs font-normal text-muted-ink"

const sentence = (a: Acceptance) => a.says ?? [a.given && `${t.given} ${a.given}`, a.when && `${t.when} ${a.when}`, a.then && `${t.then} ${a.then}`].filter(Boolean).join(". ")
const markOf = (tests: Test[]) => (tests.some((x) => !x.proposed) ? "named" : tests.length ? "proposed" : "hole")
const testsOf = (rows: Row[]) => [...new Map(rows.flatMap((r) => r.tests).map((x) => [x.id, x])).values()]

/** Each row opens its detail in the drawer, as an id chip does. */
function useOpen() {
  const { openLinked } = usePage()
  return (ref: Ref) => (e: MouseEvent<HTMLElement>) => openLinked(ref, e.currentTarget)
}

const Mark = ({ layer, tests }: { layer: Test["type"]; tests: Test[] }) => {
  const mark = markOf(tests)
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="mx-auto grid h-6 w-10 place-items-center" role="img" aria-label={v.mark(t.layers[layer], mark)} />}>
        <span className={`block h-3 w-7 rounded-[4px] ${MARK[mark]}`} />
      </TooltipTrigger>
      <TooltipContent>{v.mark(t.layers[layer], mark)}</TooltipContent>
    </Tooltip>
  )
}

/** One table for the Acceptance and Coverage stops: the layers named once in the head, a row per requirement, then one row per
 *  acceptance row whose sentence opens the drawer. Each body row names its requirement, which a stop of some requirements hides by. `cell` draws a row's share of one layer; `wrap` lets the sentence run on. */
function LayerTable({ rows, wrap, cell }: { rows: Row[]; wrap: boolean; cell: (layer: Test["type"], tests: Test[]) => ReactNode }) {
  const open = useOpen()
  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-foreground/10">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={`${HEAD} w-14 pl-3`}><span className="sr-only">{v.id}</span></TableHead>
            <TableHead className={HEAD}>{v.row}</TableHead>
            {LAYERS.map((l) => <TableHead key={l} className={`${HEAD} ${wrap ? "w-[17%]" : "w-20 text-center"}`}>{t.layers[l]}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.flatMap((row) => [
            <TableRow key={`head:${row.requirement?.id ?? "none"}`} data-requirement={row.requirement?.id ?? ""} className="bg-act-paper-strong hover:bg-act-paper-strong dark:bg-act-paper-strong/60 dark:hover:bg-act-paper-strong/60">
              <TableCell colSpan={2 + LAYERS.length} className="px-3 py-1.5 whitespace-normal">
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                  {row.requirement ? <><IdChip id={row.requirement.id} /><span className="min-w-0 font-medium">{row.requirement.title}</span></> : <><LooseEnd>{t.noRequirement}</LooseEnd><span className="font-medium">{t.checksNothing}</span></>}
                </div>
              </TableCell>
            </TableRow>,
            ...row.acceptance.map((a) => {
              const proving = row.tests.filter((x) => x.proves.includes(a.id))
              return (
                <TableRow key={a.id} data-ref={a.id} data-requirement={row.requirement?.id ?? ""} className="scroll-mt-28 hover:bg-transparent">
                  <TableCell className="py-1.5 pr-2 pl-3 align-top"><span className={ID}>{a.id}</span></TableCell>
                  <TableCell className={`px-2 py-1.5 align-top ${wrap ? "whitespace-normal" : ""}`}>
                    <button type="button" aria-haspopup="dialog" onClick={open(a.id)} title={wrap ? undefined : sentence(a)}
                      className={`${PRESS} block w-full ${wrap ? "text-sm leading-5" : "truncate text-base leading-6"}`}>{sentence(a)}</button>
                  </TableCell>
                  {LAYERS.map((l) => <TableCell key={l} className="px-2 py-1.5 align-top whitespace-normal">{cell(l, proving.filter((x) => x.type === l))}</TableCell>)}
                </TableRow>
              )
            }),
          ])}
        </TableBody>
      </Table>
    </div>
  )
}

/** The Acceptance stop: the layer counts, then one line per acceptance row with one coverage mark per test layer. */
export function AcceptanceList({ input }: PropsOf<"trace">) {
  const acceptance = input.rows.flatMap((r) => r.acceptance.map((a) => ({ a, tests: r.tests.filter((x) => x.proves.includes(a.id)) })))
  return (
    <div data-placed="acceptance">
      <LayerCounts tests={testsOf(input.rows)} acceptance={acceptance} />
      <div className="mt-4"><LayerTable rows={input.rows} wrap={false} cell={(layer, tests) => <Mark layer={layer} tests={tests} />} /></div>
    </div>
  )
}

/** The Coverage stop: the Acceptance table with each layer's tests by name in place of the mark. A name opens its test. */
export function CoverageList({ input }: PropsOf<"trace">) {
  const open = useOpen()
  return (
    <div data-placed="coverage">
      <LayerTable rows={input.rows} wrap cell={(layer, tests) => (
        tests.length ? (
          <div className="flex flex-col items-start gap-1">
            {tests.map((x) => (
              <button key={x.id} type="button" aria-haspopup="dialog" onClick={open(x.id)}
                className={`${PRESS} max-w-full rounded-lg px-1.5 py-0.5 font-mono text-xs leading-4 [overflow-wrap:anywhere] ${NAME[x.proposed ? "proposed" : "named"]}`}>
                {x.name}{x.proposed && <span className="sr-only"> {t.proposedLabel}</span>}
              </button>
            ))}
          </div>
        ) : <span className={`mt-1 block h-3 w-7 rounded-[4px] ${MARK.hole}`} role="img" aria-label={v.mark(t.layers[layer], "hole")} />
      )} />
    </div>
  )
}

/** The Tests stop: every test the plan names or proposes, under its layer. */
export function TestList({ input }: PropsOf<"trace">) {
  const open = useOpen()
  const tests = testsOf(input.rows)
  return (
    <div data-placed="tests">
      <Subhead extra={v.tests(tests.length)}>{COPY.steps.parts.tests}</Subhead>
      <div className="flex flex-col gap-4">
        {LAYERS.map((l) => {
          const mine = tests.filter((x) => x.type === l)
          if (!mine.length) return null
          return (
            <section key={l}>
              <h5 className="mb-1.5 text-sm font-medium">{t.layers[l]} <span className="font-normal text-muted-ink tabular-nums">{mine.length}</span></h5>
              <ul className="gap-x-6 lg:columns-2">
                {mine.map((x) => (
                  <li key={x.id} data-ref={x.id} className="scroll-mt-28 break-inside-avoid border-b border-border/60">
                    <button type="button" className={`${PRESS} flex w-full items-center gap-3 px-1 py-1.5 hover:bg-muted/50`} aria-haspopup="dialog" onClick={open(x.id)}>
                      <span className={ID}>{x.id}</span>
                      <span className="min-w-0 flex-1 truncate font-mono text-xs leading-6" title={x.name}>{x.name}</span>
                      {x.proposed && <span className="shrink-0 rounded-md border border-dashed border-foreground/35 px-1.5 text-xs text-muted-ink">{v.proposed}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}

/** One acceptance row in the drawer: what must be true, the rule it guards, its tests per layer with the trace view's own detail,
 *  and the units and pull requests that build it. */
export function AcceptanceDetail({ a, tests, prsOf, rules }: { a: Acceptance; tests: Test[] } & Pick<TraceInput, "prsOf" | "rules">) {
  const { go } = usePage()
  const rule = (ref: string) => {
    const name = ref.replace(/^rule:/, "")
    return <button type="button" className={LINK} onClick={() => go(ref)}>{rules[name]?.says ?? name}</button>
  }
  const units = [...new Set(tests.map((x) => x.unit))].sort()
  return (
    <div className="mt-4 flex flex-col gap-5 text-sm leading-6">
      <div>
        <p className="text-base leading-7">{sentence(a)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-muted-ink">
          {a.requirement ? <IdChip id={a.requirement} /> : <LooseEnd>{t.noRequirement}</LooseEnd>}
          {a.addedFor && <span>{t.addedFor} {rule(a.addedFor)}.</span>}
          {a.guards && <span>{t.guards} {rule(a.guards)}.</span>}
          {a.screens?.length ? <span className="inline-flex flex-wrap items-center gap-1">{t.seenOn} {a.screens.map((id) => <IdChip key={id} id={id} />)}</span> : null}
        </div>
      </div>
      {LAYERS.map((l) => {
        const ts = tests.filter((x) => x.type === l)
        return (
          <section key={l}>
            <Subhead>{t.layers[l]}</Subhead>
            {ts.length ? <div className="flex flex-col gap-2">{ts.map((x) => <TestDetail key={x.id} t={x} id={`linked-acc-test-${x.id}`} />)}</div>
              : <p className="rounded-lg border border-dashed border-foreground/20 px-3 py-1.5 text-xs text-muted-ink">{v.layerNone}</p>}
          </section>
        )
      })}
      {units.length > 0 && (
        <section>
          <Subhead>{v.builtIn}</Subhead>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {units.map((u) => (
              <span key={u} className="inline-flex items-center gap-1">
                <IdChip id={u} />
                {(prsOf[u] ?? []).map((p) => <span key={p} className="inline-flex items-center gap-1"><ArrowRightIcon aria-hidden className="size-3 text-muted-ink" /><IdChip id={p} /></span>)}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
