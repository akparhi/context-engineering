import type { DecisionsInput } from "../../../scripts/views.ts"
import { COPY } from "../copy.ts"
import { Fold, IdChip } from "../parts.tsx"
import type { RowLine, ViewProps } from "../views.tsx"

type Decision = DecisionsInput["decisions"][number]
type Option = Decision["options"][number]

/** Choices the plan already made. Each decision is its line and the option taken. Slim folds the rest behind each line: the
 *  option's detail, the ones turned down and what settled it. */
export function DecisionsView({ input }: ViewProps<DecisionsInput>) {
  return (
    <ul className="divide-y divide-border/70">
      {input.decisions.map((d) => (
        <li key={d.id} data-ref={d.id} className="scroll-mt-28 py-5 first:pt-0 last:pb-0">
          <DecisionLine decision={d} />
          <Fold part="detail" row={d.id} className="mt-2" summary={<Taken decision={d} />}>
            <DecisionSides decision={d} />
          </Fold>
        </li>
      ))}
    </ul>
  )
}

/** The folded Decisions card: how many there are. A decision has no loose end of its own. */
export const decisionsRow = ({ decisions }: DecisionsInput): RowLine => ({ says: COPY.decisions.row(decisions.length), loose: [] })

function Taken({ decision: d }: { decision: Decision }) {
  return <span className="text-sm leading-6"><span className="text-muted-ink">{COPY.decisions.chosen}.</span> {d.options.find((o) => o.id === d.chosen)?.label}</span>
}

function DecisionLine({ decision: d }: { decision: Decision }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <IdChip id={d.id} /><span className="font-medium text-balance">{d.title}</span>
      {d.serves?.map((r) => <IdChip key={r} id={r} />)}
    </div>
  )
}

function DecisionSides({ decision: d }: { decision: Decision }) {
  const chosen = d.options.find((o) => o.id === d.chosen)
  const others = d.options.filter((o) => o !== chosen)
  return (
    <>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {chosen && <Side option={chosen} chosen />}
        {others.map((o) => <Side key={o.id} option={o} chosen={false} />)}
      </div>
      {d.why && <p className="mt-2.5 text-sm leading-6"><span className="text-muted-ink">{COPY.decisions.settledBy}</span> {d.why}</p>}
    </>
  )
}

function Side({ option: o, chosen }: { option: Option; chosen: boolean }) {
  return (
    <div className={`rounded-2xl p-3.5 ${chosen ? "bg-muted/60 ring-1 ring-foreground/15 dark:bg-muted/40" : "border border-dashed border-foreground/25"}`}>
      <div className="text-xs font-medium text-muted-ink">{chosen ? COPY.decisions.chosen : COPY.decisions.other}</div>
      <div className={`mt-1 font-medium ${chosen ? "" : "text-muted-foreground"}`}>{o.label}</div>
      {o.detail && <p className="mt-1 text-sm leading-6 text-pretty text-muted-foreground">{o.detail}</p>}
      {o.facts?.length ? (
        <dl className="mt-2 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs leading-5">
          {o.facts.map(([k, v], i) => <div key={i} className="contents"><dt className="text-muted-ink">{k}</dt><dd>{v}</dd></div>)}
        </dl>
      ) : null}
    </div>
  )
}
