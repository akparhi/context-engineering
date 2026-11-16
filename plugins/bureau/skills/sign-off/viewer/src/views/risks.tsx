import type { Default, Risk, RisksInput } from "../../../scripts/views.ts"
import { COPY } from "../copy.ts"
import { IdChip, LooseEnd, Subhead } from "../parts.tsx"
import type { ViewProps } from "../views.tsx"

/** The risks the plan accepts, beside the defaults it chose without asking. A risk that touches no requirement keeps that loose
 *  end beside its title. */
export function RisksView({ input }: ViewProps<RisksInput>) {
  const r = COPY.risks
  return (
    <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
      {input.risks.length > 0 && (
        <section>
          <Subhead>{r.risks}</Subhead>
          <ul className="divide-y divide-border/70 border-y border-border/70">{input.risks.map((k) => <RiskRow key={k.id} risk={k} />)}</ul>
        </section>
      )}
      {input.defaults.length > 0 && (
        <section>
          <Subhead>{r.defaults}</Subhead>
          <div>
            <ul className="divide-y divide-border/70 border-y border-border/70">{input.defaults.map((d) => <DefaultRow key={d.id} value={d} />)}</ul>
          </div>
        </section>
      )}
    </div>
  )
}

const ROW = "grid scroll-mt-28 grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 py-3"

function RiskRow({ risk: k }: { risk: Risk }) {
  return (
    <li data-ref={k.id} className={ROW}>
      <span className="mt-0.5"><IdChip id={k.id} /></span>
      <div className="min-w-0">
        <div className="flex items-start gap-2">
          <span className="min-w-0 flex-1 font-medium">{k.title}</span>
          {k.serves.length ? <span className="flex shrink-0 gap-1">{k.serves.map((r) => <IdChip key={r} id={r} />)}</span> : <LooseEnd>{COPY.risks.servesNone}</LooseEnd>}
        </div>
        <p className="mt-0.5 text-base leading-7 text-pretty text-muted-foreground">{k.bound}</p>
      </div>
    </li>
  )
}

function DefaultRow({ value: d }: { value: Default }) {
  return (
    <li data-ref={d.id} className={ROW}>
      <span className="mt-0.5"><IdChip id={d.id} /></span>
      <div className="flex min-w-0 items-start gap-2">
        <p className="min-w-0 flex-1 text-base leading-7 text-pretty">{d.says}{d.note && <> <span className="text-muted-ink">{d.note}</span></>}</p>
        <span className="mt-1 flex shrink-0 gap-1">{d.serves.map((r) => <IdChip key={r} id={r} />)}</span>
      </div>
    </li>
  )
}
