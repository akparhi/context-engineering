import { UserIcon } from "lucide-react"
import type { Product } from "../../../scripts/manifest.ts"
import { COPY, holdLine, plural } from "../copy.ts"
import { IdChip, LooseEnd, QuestionCard, Subhead } from "../parts.tsx"
import { holds, type Question } from "../plan.ts"
import type { ViewProps } from "../views.tsx"

/** The product plan, plus per requirement the screens it is seen on and how many checks prove it. */
export type SpecInput = { product: Product; reach: Record<string, { checks: number; screens: { id: string; label: string }[] }>; questions: Question[] }

export function SpecView({ input, go }: ViewProps<SpecInput>) {
  const { product, reach, questions } = input
  const hold = questions.filter(holds).length
  const s = COPY.spec
  return (
    <>
      <section><Subhead>{s.problem}</Subhead><p className="max-w-[62ch] text-base leading-7">{product.problem}</p></section>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <section>
          <Subhead>{s.users}</Subhead>
          <div>
            <ul className="flex flex-col gap-3">
              {product.users.map((u, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-ink"><UserIcon className="size-4" /></span>
                  <div><div className="font-medium">{u.who}</div><p className="text-sm leading-6 text-muted-foreground">{u.need}</p></div>
                </li>
              ))}
            </ul>
          </div>
          {product.notFor && <p className="mt-3 text-sm leading-6 text-muted-foreground"><span className="font-medium text-foreground">{s.notFor}</span> {product.notFor}</p>}
        </section>
        <section>
          <Subhead>{s.goals}</Subhead>
          <ol className="flex flex-col gap-2.5">
            {product.goals.map((g, i) => (
              <li key={i} className="flex gap-3 text-sm leading-6">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-foreground text-xs font-medium text-background">{i + 1}</span>{g}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="mt-8">
        <Subhead extra={s.requirementsExtra}>{plural(product.requirements.length, "requirement")}</Subhead>
        <ul className="divide-y divide-border/70 border-y border-border/70">
          {product.requirements.map((r) => {
            const { checks, screens } = reach[r.id] ?? { checks: 0, screens: [] }
            return (
              <li key={r.id} data-ref={r.id} className="grid scroll-mt-28 grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 py-4">
                <span className="mt-0.5"><IdChip id={r.id} /></span>
                <div className="min-w-0">
                  <div className="font-medium">{r.title}</div>
                  <p className="mt-0.5 max-w-[66ch] text-sm leading-6 text-muted-foreground">{r.text}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-ink empty:hidden">
                    {screens.length > 0 && (
                      <span>{s.seenOn} {screens.map((sc, i) => (
                        <span key={sc.id}>{i > 0 && ", "}<button type="button" onClick={() => go(sc.id)} className="rounded-md text-link underline decoration-link/30 underline-offset-4 hover:decoration-link">{sc.label}</button></span>
                      ))}</span>
                    )}
                    {checks > 0 && <span>{s.proves(checks)}</span>}
                    {checks === 0 && <LooseEnd>{s.unproven}</LooseEnd>}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <section>
          <Subhead>{s.nonGoals}</Subhead>
          <ul className="flex flex-col gap-2">
            {product.nonGoals.map((n, i) => (
              <li key={i} className="text-sm leading-6">
                {n.why ? <div><NonGoal what={n.what} /> <span className="text-muted-foreground">{n.why}</span></div> : <NonGoal what={n.what} />}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-8">
        <Subhead>{s.rollout}</Subhead>
        <div>
          <ol className="grid gap-x-3 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            {product.rollout.map((r, i) => (
              <li key={i} className="border-t-2 border-foreground/15 pt-3">
                <div className="flex items-center gap-2"><span className="grid size-5 place-items-center rounded-full bg-muted text-xs font-medium">{i + 1}</span><span className="font-medium">{r.stage}</span></div>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{r.says}</p>
              </li>
            ))}
          </ol>
        </div>
        {product.metric && (
          <p className="mt-4 text-sm leading-6"><span className="font-medium">{s.metric}</span> <span className="text-muted-foreground">{product.metric.target}.</span>{product.metric.readFrom && <> <span className="font-medium">{s.readFrom}</span> <span className="text-muted-foreground">{product.metric.readFrom}.</span></>}</p>
        )}
      </section>

      {questions.length > 0 && (
        <section className="mt-8">
          <Subhead extra={holdLine(hold, questions.length - hold)}>{s.questions}</Subhead>
          <div className="grid gap-3 lg:grid-cols-3">{questions.map((q) => <QuestionCard key={q.id} q={q} />)}</div>
        </section>
      )}
    </>
  )
}

const NonGoal = ({ what }: { what: string }) => <span className="font-medium">{what}.</span>
