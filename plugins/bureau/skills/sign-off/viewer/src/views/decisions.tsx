import type { DecisionsInput } from "../../../scripts/views.ts"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { COPY } from "../copy.ts"
import { IdChip } from "../parts.tsx"
import type { ViewProps } from "../views.tsx"

type Option = DecisionsInput["decisions"][number]["options"][number]
const HEAD = "h-9 px-2 text-xs font-normal text-muted-ink"
const CELL = "px-2 py-3 align-top whitespace-normal"

/** Choices the plan already made, one row each: the decision, the option taken with what settled it, and the ones turned down. */
export function DecisionsView({ input }: ViewProps<DecisionsInput>) {
  const c = COPY.decisions
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={`${HEAD} w-[26%]`}>{c.decision}</TableHead>
          <TableHead className={HEAD}>{c.chosen}</TableHead>
          <TableHead className={`${HEAD} w-[32%]`}>{c.other}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {input.decisions.map((d) => {
          const chosen = d.options.find((o) => o.id === d.chosen)
          return (
            <TableRow key={d.id} data-ref={d.id} className="scroll-mt-28 hover:bg-transparent">
              <TableCell className={CELL}>
                <div className="flex items-start gap-2"><IdChip id={d.id} /><span className="text-base leading-6 font-medium text-balance">{d.title}</span></div>
                {d.serves?.length ? <div className="mt-2 flex flex-wrap gap-1">{d.serves.map((r) => <IdChip key={r} id={r} />)}</div> : null}
              </TableCell>
              <TableCell className={CELL}>
                {chosen && <Side option={chosen} />}
                {d.why && <p className="mt-2 text-sm leading-6"><span className="text-muted-ink">{c.settledBy}</span> {d.why}</p>}
              </TableCell>
              <TableCell className={`${CELL} text-muted-ink`}>
                <div className="flex flex-col gap-3">{d.options.filter((o) => o !== chosen).map((o) => <Side key={o.id} option={o} />)}</div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function Side({ option: o }: { option: Option }) {
  return (
    <div>
      <div className="text-base leading-6 font-medium">{o.label}</div>
      {o.detail && <p className="mt-0.5 text-sm leading-6 text-pretty text-muted-foreground">{o.detail}</p>}
      {o.facts?.length ? (
        <dl className="mt-1.5 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs leading-5">
          {o.facts.map(([k, v], i) => <div key={i} className="contents"><dt className="text-muted-ink">{k}</dt><dd>{v}</dd></div>)}
        </dl>
      ) : null}
    </div>
  )
}
