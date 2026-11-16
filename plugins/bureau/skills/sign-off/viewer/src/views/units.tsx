import { useMemo, type ReactNode } from "react"
import { unitOrder } from "../../../scripts/order.ts"
import type { UnitsInput } from "../../../scripts/views.ts"
import { COPY, plural } from "../copy.ts"
import { IdChip, LooseEnd } from "../parts.tsx"
import type { Ref } from "../plan.ts"
import type { ViewProps } from "../views.tsx"

type Step = UnitsInput["steps"][number]

/** The work cut into units: how they start and merge in one line, one card each, then the plan's sentence on how they run. */
export function UnitsView({ input, go }: ViewProps<UnitsInput>) {
  return (
    <>
      {input.steps.length > 1 && <UnitsOrder steps={input.steps} />}
      <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">{input.steps.map((s) => <UnitCard key={s.id} step={s} ships={input.ships[s.id] ?? []} go={go} />)}</ol>
      {input.note && <UnitsNote note={input.note} />}
    </>
  )
}

/** Start waves, merge order and critical path. Nothing draws for units that wait on each other, which `check` fails. */
function UnitsOrder({ steps }: { steps: Step[] }) {
  const order = useMemo(() => unitOrder(steps), [steps])
  if (!order) return null
  const u = COPY.units
  const byId = new Map(steps.map((s) => [s.id, s]))
  const [first = [], ...later] = order.starts
  const start = [u.atOnce(first.length, later.length === 0), ...later.flat().map((id) => u.then(id, byId.get(id)?.startsAfter?.units ?? []))].join(", ")
  const part = (term: string, value: string) => <span><span className="text-muted-ink">{term}</span> <span className="font-medium">{value}.</span></span>
  return (
    <p data-part="order" className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-sm leading-6">
      {part(u.start, start)}
      {part(u.mergeOrder, order.merges.map((level) => level.join(", ")).join(", then "))}
      {part(u.critical, order.critical.join(", "))}
    </p>
  )
}

const LINK = "rounded-md text-link underline decoration-link/30 underline-offset-4 hover:decoration-link"

/** One unit: also the whole body of a gated step's own card. */
export function UnitCard({ step: s, ships, go }: { step: Step; ships: UnitsInput["ships"][string]; go: (ref: Ref) => void }) {
  const u = COPY.units
  const row = (term: string, value: ReactNode) => <><dt className="text-muted-ink">{term}</dt><dd className="min-w-0">{value}</dd></>
  const startsAfter = s.startsAfter?.units ?? []
  const stubbed = (s.mergesAfter ?? []).filter((id) => !startsAfter.includes(id))
  return (
    <li data-ref={s.id} className="flex scroll-mt-28 flex-col rounded-3xl p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center gap-2"><IdChip id={s.id} /><span className="font-medium">{s.title}</span></div>
      {s.repo && <div className="mt-1 font-mono text-xs text-muted-ink">{s.repo}</div>}
      <p className="mt-2 flex-1 text-base leading-7 text-pretty text-muted-foreground">{s.done}</p>
      <dl className="mt-3 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs leading-5">
        {s.tasks !== undefined && row(u.size, plural(s.tasks, "task"))}
        {s.qa && row(u.qa, s.qa)}
        {row(u.starts, <>{s.startsAfter ? u.after(startsAfter, s.startsAfter.reason) : u.together}{stubbed.length > 0 && <span className="text-muted-foreground">, {u.stubbed(stubbed)}</span>}</>)}
        {row(u.mergesAfter, s.mergesAfter?.length ? <span className="flex flex-wrap gap-1">{s.mergesAfter.map((d) => <IdChip key={d} id={d} />)}</span> : u.first)}
        {ships.length > 0 && row(u.goesInto, <span className="font-mono [overflow-wrap:anywhere]">{[...new Set(ships.map((p) => p.into))].join(", ")}</span>)}
        {row(u.shipsAs, ships.length
          ? <span className="flex flex-wrap gap-x-2">{ships.map((p) => <button key={p.id} type="button" className={`${LINK} font-mono`} onClick={() => go(p.id)}>{p.id}</button>)}</span>
          : <LooseEnd>{u.noPr}</LooseEnd>)}
      </dl>
    </li>
  )
}

const UnitsNote = ({ note }: { note: string }) => <p className="mt-4 max-w-[78ch] text-base leading-7 text-pretty text-muted-foreground">{note}</p>
