import { useState, type ReactNode } from "react"
import { ChevronDownIcon, LockIcon } from "lucide-react"
import type { Mark } from "../../../scripts/model.ts"
import type { Endpoint, EndpointsInput } from "../../../scripts/views.ts"
import { Badge } from "@/components/ui/badge"
import { COPY } from "../copy.ts"
import { Fold, FullOnly, IdChip, Subhead } from "../parts.tsx"
import type { Ref } from "../plan.ts"
import type { RowLine, ViewProps } from "../views.tsx"
import { BuiltIn } from "./components.tsx"

type Access = NonNullable<EndpointsInput["access"]>
type Call = EndpointsInput["endpoints"][number]
type Outcome = Endpoint["outcomes"][number]
type Go = (ref: Ref) => void

const s = COPY.endpoints
const MONO = "font-mono text-xs"
const LINK = "rounded-md text-link underline decoration-link/30 underline-offset-4 hover:decoration-link"

/** `reused` draws nothing: only what the plan adds or changes earns a tag. */
const MARK_TAG: Record<Mark, { variant: "delta" | "deltaline"; word: string } | null> = {
  new: { variant: "delta", word: "New" },
  changed: { variant: "deltaline", word: "Changed" },
  reused: null,
}
function MarkTag({ mark }: { mark: Mark }) {
  const tag = MARK_TAG[mark]
  return tag && <Badge variant={tag.variant}>{tag.word}</Badge>
}

const Chips = ({ ids }: { ids?: string[] }) => <>{ids?.map((r) => <IdChip key={r} id={r} />)}</>

/** Comments and keys stand out from the rest of a TypeScript-like shape. No hue: the shape is read, not judged. */
const TOKEN = /(\/\/[^\n]*)|^(\s*)(\w+)(\??:)/gm
function Shape({ src }: { src: string }) {
  const out: ReactNode[] = []
  let last = 0
  for (const m of src.matchAll(TOKEN)) {
    out.push(src.slice(last, m.index))
    const [, comment, indent, key, colon] = m
    out.push(comment !== undefined
      ? <span key={m.index} className="text-muted-ink">{comment}</span>
      : <span key={m.index}>{indent}<span className="font-medium text-foreground">{key}</span>{colon}</span>)
    last = m.index + m[0].length
  }
  out.push(src.slice(last))
  return <pre className="overflow-x-auto rounded-xl bg-card px-3 py-2.5 font-mono text-xs leading-5 text-muted-foreground ring-1 ring-foreground/10">{out}</pre>
}

function AccessPanel({ access, envelope, go }: { access?: Access; envelope?: string; go: Go }) {
  const ask = access?.ask
  return (
    <section className="rounded-3xl bg-muted/60 p-4 dark:bg-muted/40" aria-label={s.access}>
      {access && (
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium"><LockIcon className="size-4 text-muted-ink" />{s.access}<Chips ids={access.serves} /></div>
      )}
      {access && (
        <dl className="mt-2 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm leading-6">
          <dt className="text-muted-ink">{s.role}</dt>
          <dd>{access.who}{ask && <> <button type="button" className={LINK} onClick={() => go(ask)}>{ask}</button> {s.widens}</>}</dd>
          <dt className="text-muted-ink">{s.permission}</dt><dd className={`${MONO} leading-6 [overflow-wrap:anywhere]`}>{access.permission}</dd>
          {access.switch && <><dt className="text-muted-ink">{s.switch}</dt><dd className={`${MONO} leading-6 [overflow-wrap:anywhere]`}>{access.switch}</dd></>}
        </dl>
      )}
      {envelope && (
        <Fold part="envelope" className={access ? "mt-1.5" : undefined}>
          <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 text-sm leading-6">
            <dt className="text-muted-ink" data-part="envelope">{s.wrapped}</dt><dd className={`${MONO} leading-6 [overflow-wrap:anywhere]`} data-part="envelope">{envelope}</dd>
          </dl>
        </Fold>
      )}
    </section>
  )
}

/** What the caller can send, by name. Types, defaults and limits are the implementer's, and fold behind Show. */
const ParamNames = ({ narrows }: { narrows: NonNullable<Endpoint["narrows"]> }) => (
  <span className="text-sm leading-6"><span className="text-muted-ink">{s.sends}.</span> {s.sent(narrows.map((n) => n.name))}</span>
)

function Params({ narrows }: { narrows: NonNullable<Endpoint["narrows"]> }) {
  return (
    <div data-part="params">
      <Subhead>{s.sends}</Subhead>
      <ul className="divide-y divide-border/60">
        {narrows.map((n) => (
          <li key={n.name} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 py-2">
            <span className={`${MONO} font-medium break-all`}>{n.name}</span>
            <span className="min-w-0 text-sm leading-5">
              <span className={`${MONO} break-words text-muted-ink`}>{n.type}</span>
              {n.default && <span className="text-xs text-muted-ink"> {s.defaultIs} <span className="font-mono">{n.default}</span></span>}
              {n.means && <span className="block text-xs text-muted-ink">{n.means}</span>}
            </span>
            <span className="flex gap-1"><Chips ids={n.serves} /></span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const StatusCode = ({ status }: { status: number }) => (
  <span className={`mt-px inline-flex h-5 w-10 shrink-0 items-center justify-center rounded-md bg-secondary font-mono text-xs font-medium ring-1 ring-foreground/10 ${status < 400 ? "text-foreground" : "text-muted-ink"}`}>{status}</span>
)

/** The status, name and sentence stay. The requirement chips and the shape name are cross-references: slim draws them only when the
 *  outcome's shape is open. */
function OutcomeLine({ o, open }: { o: Outcome; open: boolean }) {
  const refs = (o.serves?.length || o.shape) && (
    <span className="mt-1 flex flex-wrap items-center gap-1" data-part="outcome-refs">
      <Chips ids={o.serves} />
      {o.shape && <span className={`ml-1 first:ml-0 ${MONO} text-muted-ink`}>{o.shape}</span>}
    </span>
  )
  return (
    <span className="min-w-0 flex-1 text-sm leading-5">
      <span className="font-medium">{o.title}.</span> <span className="text-muted-foreground">{o.when}</span>
      {open ? refs : <FullOnly>{refs}</FullOnly>}
    </span>
  )
}

/** The fields this outcome names, each with what it means and the column it is stored in. */
function Fields({ body, go }: { body: NonNullable<Outcome["body"]>; go: Go }) {
  return (
    <dl className="mt-2 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs leading-5">
      {body.map((f) => (
        <div key={f.name} className="contents">
          <dt className="font-mono font-medium">{f.name}</dt>
          <dd className="min-w-0">
            <span className="font-mono break-words text-muted-ink">{f.type}</span>
            {f.means && <span className="text-muted-foreground"> {f.means}</span>}
            {f.column && <span className="block text-muted-ink">{s.column} <button type="button" className={`${LINK} font-mono`} onClick={() => go(`db:${f.column}`)}>{f.column}</button></span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function OutcomeRow({ o, shapes, go }: { o: Outcome; shapes: Record<string, string>; go: Go }) {
  const [open, setOpen] = useState(false)
  const shape = o.shape ? shapes[o.shape] : undefined
  if (!shape && !o.body?.length) return <li className="flex items-start gap-3 px-2.5 py-2"><StatusCode status={o.status} /><OutcomeLine o={o} open={false} /></li>
  return (
    <li>
      <details onToggle={(e) => setOpen(e.currentTarget.open)} className="group/details rounded-2xl hover:bg-muted/50 open:bg-muted/50 dark:open:bg-muted/30">
        <summary className="flex cursor-pointer list-none items-start gap-3 rounded-2xl px-2.5 py-2 outline-none focus-visible:ring-2 focus-visible:ring-focus [&::-webkit-details-marker]:hidden">
          <StatusCode status={o.status} /><OutcomeLine o={o} open={open} />
          <ChevronDownIcon className="mt-0.5 size-4 shrink-0 text-muted-ink motion-safe:transition-transform group-open/details:rotate-180" />
        </summary>
        <div className="mx-2.5 pb-2.5">
          {shape && <Shape src={shape} />}
          {o.body?.length ? <Fields body={o.body} go={go} /> : null}
        </div>
      </details>
    </li>
  )
}

function EndpointCard({ e, shapes, go }: { e: Call; shapes: Record<string, string>; go: Go }) {
  const narrows = e.narrows ?? []
  const opens = e.outcomes.some((o) => (o.shape && shapes[o.shape]) || o.body?.length)
  return (
    <section data-ref={e.id} aria-label={`${e.id} ${e.method} ${e.path}`} className="scroll-mt-28 overflow-hidden rounded-3xl ring-1 ring-foreground/10">
      <div className="border-b px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <IdChip id={e.id} /><MarkTag mark={e.mark} />
          <span className="font-mono text-sm font-medium break-all"><span className="text-muted-ink">{e.method}</span> {e.path}</span>
        </div>
        <p className="mt-1.5 max-w-[70ch] text-sm leading-6">{e.answers}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-ink">
          <span className="inline-flex flex-wrap items-center gap-1.5">{s.serves} <Chips ids={e.serves} /></span>
          <span data-part="who">{s.who} <span className="text-foreground">{e.who.text}</span> <MarkTag mark={e.who.mark} /></span>
          <FullOnly>
            {e.readBy.length > 0 && (
              <span data-part="read-by">{s.readBy} {e.readBy.map((c, i) => <span key={c.id}>{i > 0 && ", "}<button type="button" className={`${LINK} font-mono`} onClick={() => go(c.id)}>{c.name}</button></span>)}</span>
            )}
            {e.builtIn.length > 0 && <span data-part="built-in">{s.builtIn} <BuiltIn builds={e.builtIn} go={go} /></span>}
          </FullOnly>
        </div>
        {e.noTransition && <p className="mt-1.5 max-w-[70ch] text-xs leading-5 text-muted-ink">{s.noTransition} {e.noTransition}</p>}
      </div>
      <div className={narrows.length ? "grid divide-border/70 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:divide-x max-lg:divide-y" : "grid"}>
        {narrows.length > 0 && (
          <Fold part="params" row={e.id} className="px-4 py-3 sm:px-5" summary={<ParamNames narrows={narrows} />}>
            <Params narrows={narrows} />
          </Fold>
        )}
        <div className="px-4 py-3 sm:px-5">
          <Subhead extra={opens ? s.openShape : undefined}>{s.answers}</Subhead>
          <ul className="flex flex-col gap-1.5">{e.outcomes.map((o) => <OutcomeRow key={`${o.status}:${o.title}`} o={o} shapes={shapes} go={go} />)}</ul>
        </div>
      </div>
    </section>
  )
}

/** One card per call: what it answers, who may call it, what the caller sends and every outcome with its shape. */
export function EndpointsView({ input, go }: ViewProps<EndpointsInput>) {
  const { access, envelope, shapes = {}, endpoints } = input
  const panel = access || envelope
  return (
    <>
      {panel && <AccessPanel access={access} envelope={envelope} go={go} />}
      <div className={`${panel ? "mt-5 " : ""}flex flex-col gap-4`}>
        {endpoints.map((e) => <EndpointCard key={e.id} e={e} shapes={shapes} go={go} />)}
      </div>
    </>
  )
}

/** The folded API card: how many calls, and how many are new or changed. The view draws no loose end of its own. */
export const endpointsRow = ({ endpoints }: EndpointsInput): RowLine => ({
  says: s.row(endpoints.length, endpoints.filter((e) => e.mark === "new").length, endpoints.filter((e) => e.mark === "changed").length),
  loose: [],
})
