import { Fragment, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { ArrowRightIcon, CircleAlertIcon } from "lucide-react"
import type { PrsInput, PullRequest } from "../../../scripts/views.ts"
import { Badge } from "@/components/ui/badge"
import { COPY } from "../copy.ts"
import type { Links, Ref } from "../plan.ts"
import { Disclosure, IdChip, LooseEnd } from "../parts.tsx"
import type { ViewProps } from "../views.tsx"

/** A pull request and its column in the merge order: one more than the latest stage it merges after. */
type Placed = PrsInput["prs"][number] & { stage: number }

function place(prs: PrsInput["prs"]): Placed[] {
  const byId = new Map(prs.map((p) => [p.id, p]))
  const stage = new Map<string, number>()
  const stageOf = (p: PullRequest, seen: ReadonlySet<string>): number => {
    const known = stage.get(p.id)
    if (known) return known
    const before = (p.after ?? []).flatMap((id) => { const q = byId.get(id); return q && !seen.has(id) ? [stageOf(q, new Set(seen).add(id))] : [] })
    const s = 1 + Math.max(0, ...before)
    stage.set(p.id, s)
    return s
  }
  return prs.map((p) => ({ ...p, stage: stageOf(p, new Set([p.id])) }))
}

const and = (nodes: ReactNode[]) => nodes.map((n, i) => (
  <Fragment key={i}>{i === 0 ? "" : i === nodes.length - 1 ? " and " : ", "}{n}</Fragment>
))
const Mono = ({ children }: { children: ReactNode }) => <span className="font-mono text-xs [overflow-wrap:anywhere]">{children}</span>

/** The pull requests: what holds for all of them once, the order they open in, then one card each with what differs. */
type Pr = PrsInput["prs"][number]

export function PrsView({ input, links, go }: ViewProps<PrsInput>) {
  const prs = useMemo(() => place(input.prs), [input.prs])
  const repos = useMemo(() => [...new Set(prs.map((p) => p.repo))], [prs])
  return (
    <>
      <PrLanes prs={prs} repos={repos} go={go} />
      <SharedFacts input={input} />
      <ul className="mt-6 grid gap-4 lg:grid-cols-2">{prs.map((p) => <PrCard key={p.id} pr={p} units={input.units} links={links} go={go} />)}</ul>
    </>
  )
}

/** What holds for every pull request: who merges, who reviews, and the reviewer named. The planner's notes sit behind a fold. */
function SharedFacts({ input }: { input: PrsInput }) {
  const s = COPY.prs
  const auto = input.prs.filter((p) => p.merge.by !== "human")
  const row = (term: string, value: ReactNode) => (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-1.5"><dt className="text-xs leading-6 font-medium text-muted-ink">{term}</dt><dd className="min-w-0 text-sm leading-6">{value}</dd></div>
  )
  const reviewers = [...new Set(input.prs.flatMap((p) => p.reviewer ?? []))]
  return (
    <div className="mt-4" data-part="shared">
      <dl className="max-w-xl divide-y divide-border/60">
        {row(s.merge, auto.length
          ? <>{auto.map((p) => <span key={p.id} className="mr-3">{s.by[p.merge.by]} · {p.id}</span>)}{auto.length < input.prs.length && <span>{s.by.human} · {s.rest}</span>}</>
          : <>{s.by.human} · {s.all(input.prs.length)}</>)}
        {input.bot && row(s.review, <><Mono>{input.bot}</Mono>{input.label && <> · {s.label} <Mono>{input.label}</Mono></>}</>)}
        {row(s.reviewer, reviewers.length ? reviewers.join(", ") : <LooseEnd>{s.unnamed}</LooseEnd>)}
      </dl>
      {input.notes?.length ? (
        <div className="mt-2"><Disclosure label={s.notes}><ul className="flex flex-col gap-1 text-sm leading-6 text-muted-foreground">{input.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></Disclosure></div>
      ) : null}
    </div>
  )
}

type Box = { l: number; r: number; t: number; h: number }
type Pt = { x: number; y: number }

/** An orthogonal path with its corners rounded to `r`, or less where a leg is short. */
function rounded(pts: Pt[], r: number) {
  const toward = (a: Pt, b: Pt, d: number) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    return { x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len }
  }
  let d = `M${pts[0]!.x},${pts[0]!.y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!, b = pts[i]!, c = pts[i + 1]!
    const k = Math.min(r, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2)
    const p = toward(b, a, k), q = toward(b, c, k)
    d += ` L${p.x},${p.y} Q${b.x},${b.y} ${q.x},${q.y}`
  }
  const end = pts[pts.length - 1]!
  return `${d} L${end.x},${end.y}`
}

/** Each arrow leaves into the gutter right of its source column and owns a channel there. The arrow that drops furthest takes the
 *  leftmost channel, and ports stack in channel order, so no two arrows cross in a gutter. */
function arrows(root: HTMLElement, prs: Placed[], repos: string[], stages: number) {
  const R = root.getBoundingClientRect()
  const box = (el: Element | null): Box | null => {
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { l: b.left - R.left, r: b.right - R.left, t: b.top - R.top, h: b.height }
  }
  const col = (s: number) => box(root.querySelector(`[data-col="${s}"]`))
  const node = (id: string) => box(root.querySelector(`[data-pr="${CSS.escape(id)}"]`))
  const byId = new Map(prs.map((p) => [p.id, p]))
  const row = (p: Placed) => repos.indexOf(p.repo)
  const edges = prs.flatMap((to) => (to.after ?? []).flatMap((id) => { const from = byId.get(id); return from ? [{ from, to, x: 0 }] : [] }))
  for (let s = 1; s < stages; s++) {
    const here = edges.filter((e) => e.from.stage === s).sort((a, b) => row(b.to) - row(a.to) || row(b.from) - row(a.from))
    const left = col(s), right = col(s + 1)
    if (!left || !right) continue
    here.forEach((e, i) => { e.x = left.r + ((right.l - left.r) * (i + 1)) / (here.length + 1) })
  }
  const port = (list: typeof edges, e: (typeof edges)[number], b: Box) => b.t + (b.h * (list.indexOf(e) + 1)) / (list.length + 1)
  const byX = (a: { x: number }, b: { x: number }) => b.x - a.x
  return edges.flatMap((e) => {
    const a = node(e.from.id), b = node(e.to.id)
    if (!a || !b) return []
    const y1 = port(edges.filter((x) => x.from === e.from).sort(byX), e, a)
    const y2 = port(edges.filter((x) => x.to === e.to).sort(byX), e, b)
    return [{ key: `${e.from.id}-${e.to.id}`, d: rounded([{ x: a.r, y: y1 }, { x: e.x, y: y1 }, { x: e.x, y: y2 }, { x: b.l - 2, y: y2 }], 6) }]
  })
}

/** The order: a lane per repo, a column per stage, an arrow from each pull request to each one that merges after it. It pans when it is
 *  wider than the card. */
function PrLanes({ prs, repos, go }: { prs: Placed[]; repos: string[]; go: (ref: Ref) => void }) {
  const stages = Math.max(1, ...prs.map((p) => p.stage))
  const root = useRef<HTMLDivElement>(null)
  const marker = `pr-arrow${useId().replace(/[^\w-]/g, "")}`
  const [paths, setPaths] = useState<{ key: string; d: string }[]>([])
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const draw = () => setPaths(arrows(el, prs, repos, stages))
    draw()
    const watch = new ResizeObserver(draw)
    watch.observe(el)
    return () => watch.disconnect()
  }, [prs, repos, stages])

  return (
    <div className="overflow-x-auto rounded-3xl p-3 ring-1 ring-foreground/10 sm:p-4">
      <div ref={root} className="relative min-w-[calc(8rem+var(--stages)*12rem)]" style={{ "--stages": stages } as CSSProperties}>
        <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
          <defs>
            <marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,1 L9,5 L0,9 z" className="fill-muted-ink" />
            </marker>
          </defs>
          {paths.map((p) => <path key={p.key} d={p.d} fill="none" className="stroke-muted-ink" strokeOpacity={0.75} strokeWidth={1.5} markerEnd={`url(#${marker})`} />)}
        </svg>
        <div className="grid grid-cols-[8rem_repeat(var(--stages),minmax(0,1fr))] gap-x-10 gap-y-3">
          <div />
          {Array.from({ length: stages }, (_, i) => (
            <div key={i} data-col={i + 1} className="text-xs font-medium text-muted-ink"><span className="font-mono">{i + 1}</span></div>
          ))}
          {repos.map((repo) => (
            <Fragment key={repo}>
              <div className="self-center rounded-xl bg-act-paper-strong px-3 py-2 font-mono text-xs [overflow-wrap:anywhere]">{repo}</div>
              {Array.from({ length: stages }, (_, i) => (
                <div key={i} className="flex min-h-16 flex-col gap-3">
                  {prs.filter((p) => p.repo === repo && p.stage === i + 1).map((p) => <PrNode key={p.id} pr={p} go={go} />)}
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}

function PrNode({ pr: p, go }: { pr: Placed; go: (ref: Ref) => void }) {
  return (
    <button type="button" data-pr={p.id} onClick={() => go(p.id)} aria-label={`${COPY.prs.show(p.id)}: ${p.title}`}
      className="relative block w-full rounded-2xl bg-card p-2.5 text-left shadow-sm ring-1 ring-foreground/15 outline-none hover:ring-foreground/30 focus-visible:ring-2 focus-visible:ring-focus">
      <span className="flex items-center justify-between gap-2">
        <span className="inline-flex h-5 items-center rounded-md bg-secondary px-1.5 font-mono text-xs font-medium ring-1 ring-foreground/10">{p.id}</span>
        <span className="font-mono text-xs text-muted-ink">{p.steps.join(" ")}</span>
      </span>
      <span className="mt-1 block text-[13px] leading-5 font-medium [overflow-wrap:anywhere]">{p.title}</span>
      <span className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-muted-ink">
        {COPY.prs.into} <span className="font-mono text-foreground [overflow-wrap:anywhere]">{p.into}</span>
        {p.planInto && <CircleAlertIcon className="size-3.5 text-revise-ink" aria-hidden />}
      </span>
    </button>
  )
}

/** The id, repo and units of a pull request, then its title. `units` names each unit by its title. */
export const PrHead = ({ pr: p, units = {} }: { pr: PullRequest; units?: PrsInput["units"] }) => (
  <>
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <IdChip id={p.id} /><span className="font-mono text-xs text-muted-ink">{p.repo}</span>
      {p.steps.map((id) => <span key={id} className="text-xs text-muted-ink">{id}{units[id] && ` ${units[id]}`}</span>)}
    </div>
    <div className="mt-1.5 font-medium leading-6 text-balance [overflow-wrap:anywhere]">{p.title}</div>
  </>
)

/** Tests and other ids the page knows go in one row of chips, and the sentences follow as a list. */
function Evidence({ evidence, links }: { evidence: string[]; links: Links }) {
  const ids = evidence.filter((e) => e in links), said = evidence.filter((e) => !(e in links))
  return (
    <>
      {ids.length > 0 && <div className="mb-1 flex flex-wrap gap-1">{ids.map((id) => <IdChip key={id} id={id} />)}</div>}
      <ul className="flex flex-col gap-0.5">
        {said.map((e, i) => <li key={i} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />{e}</li>)}
      </ul>
    </>
  )
}

export function PrCard({ pr: p, units, links, go }: { pr: Pr; units: PrsInput["units"]; links: Links; go: (ref: Ref) => void }) {
  const s = COPY.prs
  const row = (term: string, value: ReactNode) => (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-3"><dt className="text-xs leading-5 font-medium text-muted-ink">{term}</dt><dd className="min-w-0 text-[13px] leading-5">{value}</dd></div>
  )
  const jump = (id: string) => (
    <button type="button" onClick={() => go(id)} className="rounded-md text-link underline decoration-link/30 underline-offset-4 hover:decoration-link">{id}</button>
  )
  const bases = [p.into, ...(p.promotes ?? [])]
  return (
    <li data-ref={p.id} className="scroll-mt-28 rounded-3xl px-4 pt-3.5 pb-1 ring-1 ring-foreground/10">
      <PrHead pr={p} units={units} />
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-ink" data-part="pr-line">
        {s.into} <Mono><span className="text-foreground">{p.into}</span></Mono>
        {p.planInto && <LooseEnd>{s.planSays(p.planInto)}</LooseEnd>}
        {!p.serves.length && <LooseEnd>{s.servesNone}</LooseEnd>}
      </div>
      <div className="mt-1">
        <dl className="divide-y divide-border/60">
          {row(s.branch, (
            <>
              <div className="font-mono text-xs leading-5 [overflow-wrap:anywhere]">{p.branch}</div>
              <div className="mt-0.5 text-xs text-muted-ink">{s.from} <Mono><span className="text-foreground">{p.from}</span></Mono></div>
              {p.planInto && <p className="mt-1 text-xs leading-5 text-muted-ink">{s.planDiffers(p.repo, p.into, p.planInto)}</p>}
            </>
          ))}
          {row(s.mergesAfter, (
            <>{p.after?.length ? and(p.after.map(jump)) : s.first}{p.waits && <>. <span className="text-muted-foreground">{p.waits}</span></>}</>
          ))}
          {p.promotes?.length ? row(s.promotion, (
            <div className="flex flex-wrap items-center gap-1">
              {bases.map((b, i) => (
                <Fragment key={i}>
                  {i > 0 && <ArrowRightIcon className="size-3 text-muted-ink" aria-hidden />}
                  <Badge variant={i ? "dashed" : "outline"} className="rounded-md font-mono font-normal">{b}</Badge>
                </Fragment>
              ))}
            </div>
          )) : null}
          {p.serves.length > 0 && row(s.serves, <span className="flex flex-wrap gap-1">{p.serves.map((r) => <IdChip key={r} id={r} />)}</span>)}
          {row(s.evidence, <Evidence evidence={p.evidence} links={links} />)}
          {row(s.review, p.review)}
          {p.reviewer && row(s.reviewer, p.reviewer)}
          {row(s.merge, <><span className="font-medium">{s.by[p.merge.by]}</span>{p.merge.why && <> · <span className="text-muted-foreground">{p.merge.why}</span></>}</>)}
          {p.note && row(s.note, <span className="text-muted-foreground">{p.note}</span>)}
        </dl>
      </div>
    </li>
  )
}
