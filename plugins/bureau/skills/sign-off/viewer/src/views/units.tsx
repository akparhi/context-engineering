import type { ReactNode } from "react"
import type { UnitsInput } from "../../../scripts/views.ts"
import { COPY, plural } from "../copy.ts"
import { IdChip, LooseEnd } from "../parts.tsx"
import type { Ref } from "../plan.ts"
import type { ViewProps } from "../views.tsx"

type Step = UnitsInput["steps"][number]

/** The work cut into units, one card each, then the plan's sentence on how they run. */
export function UnitsView({ input, go }: ViewProps<UnitsInput>) {
  return (
    <>
      <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">{input.steps.map((s) => <UnitCard key={s.id} step={s} ships={input.ships[s.id] ?? []} go={go} />)}</ol>
      {input.note && <UnitsNote note={input.note} />}
    </>
  )
}

const LINK = "rounded-md text-link underline decoration-link/30 underline-offset-4 hover:decoration-link"

/** One unit: also the whole body of a gated step's own card. */
export function UnitCard({ step: s, ships, go }: { step: Step; ships: UnitsInput["ships"][string]; go: (ref: Ref) => void }) {
  const u = COPY.units
  const row = (term: string, value: ReactNode) => <><dt className="text-muted-ink">{term}</dt><dd className="min-w-0">{value}</dd></>
  return (
    <li data-ref={s.id} className="flex scroll-mt-28 flex-col rounded-3xl p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center gap-2"><IdChip id={s.id} /><span className="font-medium">{s.title}</span></div>
      {s.repo && <div className="mt-1 font-mono text-xs text-muted-ink">{s.repo}</div>}
      <p className="mt-2 flex-1 text-sm leading-6 text-pretty text-muted-foreground">{s.done}</p>
      <dl className="mt-3 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs leading-5">
        {s.tasks !== undefined && row(u.size, plural(s.tasks, "task"))}
        {s.qa && row(u.qa, s.qa)}
        {row(u.waitsFor, s.dependsOn?.length ? <span className="flex flex-wrap gap-1">{s.dependsOn.map((d) => <IdChip key={d} id={d} />)}</span> : u.startsFirst)}
        {ships.length > 0 && row(u.goesInto, <span className="font-mono [overflow-wrap:anywhere]">{[...new Set(ships.map((p) => p.into))].join(", ")}</span>)}
        {row(u.shipsAs, ships.length
          ? <span className="flex flex-wrap gap-x-2">{ships.map((p) => <button key={p.id} type="button" className={`${LINK} font-mono`} onClick={() => go(p.id)}>{p.id}</button>)}</span>
          : <LooseEnd>{u.noPr}</LooseEnd>)}
      </dl>
    </li>
  )
}

const UnitsNote = ({ note }: { note: string }) => <p className="mt-4 max-w-[78ch] text-sm leading-6 text-pretty text-muted-foreground">{note}</p>
