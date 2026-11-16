import { UserIcon, UserXIcon } from "lucide-react"
import type { Product } from "../../../scripts/manifest.ts"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { COPY, holdLine, plural } from "../copy.ts"
import { IdChip, LooseEnd, QuestionCard, Subhead } from "../parts.tsx"
import { holds, type Question } from "../plan.ts"
import type { ViewProps } from "../views.tsx"

/** The product plan, plus per requirement the screens it is seen on and how many checks prove it. */
export type SpecInput = { product: Product; reach: Record<string, { checks: number; screens: { id: string; label: string }[] }>; questions: Question[] }

const HEAD = "h-9 px-2 text-xs font-normal text-muted-ink"
const CELL = "px-2 py-3 align-top whitespace-normal"

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
                  <div><div className="font-medium">{u.who}</div><p className="text-base leading-7 text-muted-foreground">{u.need}</p></div>
                </li>
              ))}
              {product.notFor && (
                <li className="flex gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-foreground/25 text-muted-ink"><UserXIcon className="size-4" /></span>
                  <div><div className="font-medium">{s.notFor}</div><p className="text-base leading-7 text-muted-foreground">{product.notFor}</p></div>
                </li>
              )}
            </ul>
          </div>
        </section>
        <section>
          <Subhead>{s.goals}</Subhead>
          <ol className="flex flex-col gap-2.5">
            {product.goals.map((g, i) => (
              <li key={i} className="flex gap-3 text-base leading-7">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-foreground text-xs font-medium text-background">{i + 1}</span>{g}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="mt-8">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={`${HEAD} w-14`}><span className="sr-only">{COPY.verify.id}</span></TableHead>
              <TableHead className={HEAD}>{plural(product.requirements.length, "requirement")}</TableHead>
              <TableHead className={`${HEAD} w-[24%]`}>{s.seenOn}</TableHead>
              <TableHead className={`${HEAD} w-20 text-right`}>{s.checks}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {product.requirements.map((r) => {
              const { checks, screens } = reach[r.id] ?? { checks: 0, screens: [] }
              return (
                <TableRow key={r.id} data-ref={r.id} className="scroll-mt-28 hover:bg-transparent">
                  <TableCell className={`${CELL} pt-3.5`}><IdChip id={r.id} /></TableCell>
                  <TableCell className={CELL}>
                    <div className="text-base font-medium">{r.title}</div>
                    <p className="mt-0.5 text-base leading-6 text-muted-foreground">{r.text}</p>
                  </TableCell>
                  <TableCell className={`${CELL} text-sm leading-6`}>
                    {screens.map((sc, i) => (
                      <span key={sc.id}>{i > 0 && ", "}<button type="button" onClick={() => go(sc.id)} className="rounded-md text-link underline decoration-link/30 underline-offset-4 hover:decoration-link">{sc.label}</button></span>
                    ))}
                  </TableCell>
                  <TableCell className={`${CELL} text-right text-sm leading-6 tabular-nums`}>{checks > 0 ? checks : <LooseEnd>{s.unproven}</LooseEnd>}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
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
