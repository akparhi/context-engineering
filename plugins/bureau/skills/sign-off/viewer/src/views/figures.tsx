import type { Figure, FiguresInput } from "../../../scripts/views.ts"
import { Badge } from "@/components/ui/badge"
import { COPY } from "../copy.ts"
import { IdChip } from "../parts.tsx"
import type { RowLine, ViewProps } from "../views.tsx"

/** The numbers the design rests on, one tile each. An inferred number gets a dashed edge, so it never reads as measured. */
export function FiguresView({ input }: ViewProps<FiguresInput>) {
  return <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{input.facts.map((f, i) => <FigureTile key={i} figure={f} />)}</ul>
}

function FigureTile({ figure: f }: { figure: Figure }) {
  return (
    <li className={`flex flex-col rounded-3xl p-4 ${f.inferred ? "border border-dashed border-foreground/30" : "ring-1 ring-foreground/10"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-heading text-2xl font-medium tabular-nums">{f.value}</span>
        {f.inferred && <Badge variant="dashed">{COPY.figures.inferred}</Badge>}
      </div>
      <p className="mt-1 flex-1 text-sm leading-6 text-pretty text-muted-foreground">{f.label}</p>
      {(f.source || f.serves?.length) && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-xs text-muted-ink [overflow-wrap:anywhere]">{f.source}</span>
          <span className="flex flex-wrap gap-1">{f.serves?.map((r) => <IdChip key={r} id={r} />)}</span>
        </div>
      )}
    </li>
  )
}

/** The folded Evidence card: how many numbers, and how many are inferred. An inferred number is a caveat, not a loose end. */
export const figuresRow = ({ facts }: FiguresInput): RowLine => ({ says: COPY.figures.row(facts.length, facts.filter((f) => f.inferred).length), loose: [] })
