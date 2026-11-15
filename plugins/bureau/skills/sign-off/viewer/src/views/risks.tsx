import type { Default, Risk, RisksInput } from "../../../scripts/views.ts"
import { COPY } from "../copy.ts"
import { Fold, IdChip, LooseEnd, Subhead } from "../parts.tsx"
import type { RowLine, ViewProps } from "../views.tsx"

/** The risks the plan accepts, beside the defaults it chose without asking. Slim folds each risk's bound behind its title and the
 *  defaults to a count. A risk that touches no requirement keeps that loose end beside its title. */
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
          <Fold part="defaults" summary={<span className="text-sm leading-6">{r.defaultsFolded(input.defaults.length)}</span>}>
            <ul className="divide-y divide-border/70 border-y border-border/70">{input.defaults.map((d) => <DefaultRow key={d.id} value={d} />)}</ul>
          </Fold>
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
        <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{k.title}</span>{!k.serves.length && <LooseEnd>{COPY.risks.servesNone}</LooseEnd>}</div>
        <Fold part="bound" row={k.id} summary={<span className="text-sm leading-6 text-muted-ink">{COPY.risks.bound}</span>}>
          <RiskBound risk={k} />
        </Fold>
      </div>
    </li>
  )
}

const RiskBound = ({ risk: k }: { risk: Risk }) => (
  <>
    <p className="mt-0.5 text-sm leading-6 text-pretty text-muted-foreground">{k.bound}</p>
    {k.serves.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{k.serves.map((r) => <IdChip key={r} id={r} />)}</div>}
  </>
)

function DefaultRow({ value: d }: { value: Default }) {
  return (
    <li data-ref={d.id} className={ROW}>
      <span className="mt-0.5"><IdChip id={d.id} /></span>
      <div className="min-w-0">
        <p className="text-sm leading-6 text-pretty">{d.says}{d.note && <> <span className="text-muted-ink">{d.note}</span></>}</p>
        <div className="mt-1.5 flex flex-wrap gap-1">{d.serves.map((r) => <IdChip key={r} id={r} />)}</div>
      </div>
    </li>
  )
}

/** The folded Risks card: how many risks and defaults, and a loose end for each risk that touches no requirement. */
export const risksRow = ({ risks, defaults }: RisksInput): RowLine => ({
  says: COPY.risks.row(risks.length, defaults.length),
  loose: risks.filter((k) => !k.serves.length).map((k) => COPY.risks.servesNoneFor(k.id)),
})
