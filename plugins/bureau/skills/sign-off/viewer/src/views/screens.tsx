import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import { CircleAlertIcon, LockIcon, SearchIcon } from "lucide-react"
import type { Screen, ScreensInput } from "../../../scripts/views.ts"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { COPY } from "../copy.ts"
import { fullSize } from "../full-size.ts"
import { IdChip, LooseEnd, SourceLink, usePage } from "../parts.tsx"
import type { ViewProps } from "../views.tsx"

type Region = Screen["regions"][number]
type Sketch = Region["sketch"]
type SampleOf<S extends Sketch> = NonNullable<Extract<Region, { sketch: S }>["sample"]>
/** Which regions to outline, by the part each one draws, and what picking a region's part does. Both only in the components view,
 *  where a region's head names its part's id and leaves the requirements to the parts list.
 *  `foldReused` boxes each reused or copied region's head and sample together, only in the screens view. */
type Lighting = { lit?: ReadonlySet<string>; onPick?: (component: string) => void; foldReused?: boolean }

export function ScreensView({ input, focus }: ViewProps<ScreensInput>) {
  const { screens } = input
  const [picked, setPicked] = useState(screens[0]?.id)
  useEffect(() => { if (focus && screens.some((s) => s.id === focus)) setPicked(focus) }, [focus, screens])
  const screen = screens.find((s) => s.id === picked) ?? screens[0]
  if (!screen) return null
  return (
    <>
      <FlowStrip screens={screens} picked={screen.id} onPick={setPicked} />
      <p className="mt-4 text-base leading-7 text-muted-foreground">
        <span className="font-medium text-foreground">{screen.label}.</span> {screen.when}
        <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">{screen.serves.map((r) => <IdChip key={r} id={r} />)}</span>
        {screen.on && <span className="ml-2 text-sm text-muted-ink">{COPY.screens.after(screens.find((x) => x.id === screen.from)?.label, screen.on)}</span>}
        {screen.links && <span className="ml-2 inline-flex flex-wrap gap-x-3 text-sm">{screen.links.map((l) => <SourceLink key={l.url} href={l.url}>{l.label}</SourceLink>)}</span>}
      </p>
      <div className="mt-3"><ScreenPicture screen={screen} foldReused /></div>
      {screen.image && <Mockup path={screen.image} label={screen.label} />}
    </>
  )
}

/** The state's mockup, which `build` inlined as a `data:` URL. Clicking opens it full size in a new tab. Its blob URL lives until the
 *  mockup unmounts or shows another image. */
function Mockup({ path, label }: { path: string; label: string }) {
  const src = usePage().data.images[path]
  const viewer = useMemo(() => src ? fullSize(src) : null, [src])
  useEffect(() => () => viewer?.close(), [viewer])
  if (!src || !viewer) return null
  return (
    <button type="button" onClick={viewer.open} title={COPY.screens.fullSize}
      className="mt-3 block w-full cursor-zoom-in overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <img src={src} alt={COPY.screens.mockup(label)} className="block h-auto w-full" /><span className="sr-only">{COPY.head.opensNewTab}</span>
    </button>
  )
}

const MARK_BADGE = { new: "delta", changed: "deltaline", reused: "dashed", copy: "dashed" } as const
export const MarkBadge = ({ mark }: { mark: Region["mark"] }) => <Badge variant={MARK_BADGE[mark]}>{COPY.screens.marks[mark]}</Badge>
const gates = (mark: Region["mark"]) => mark === "new" || mark === "changed"

/** Every state of the page as one row of tabs, by name. */
export function FlowStrip({ screens, picked, onPick }: { screens: Screen[]; picked: string; onPick: (id: string) => void }) {
  return (
    <Tabs value={picked} onValueChange={(v) => onPick(String(v))} data-part="strip">
      <TabsList aria-label={COPY.screens.flow} className="h-auto! max-w-full flex-wrap justify-start">
        {screens.map((s) => <TabsTrigger key={s.id} value={s.id} data-ref={s.id} className="h-7 flex-none scroll-mt-28">{s.label}</TabsTrigger>)}
      </TabsList>
    </Tabs>
  )
}

/** The page in one state: nav regions in a side column, a sheet over the dimmed page, every other region in order.
 *  The page and each sheet share one grid cell, so the picture is as tall as the taller of them. A sheet is `relative` to paint over the dimmed page's opacity layer. */
export function ScreenPicture({ screen, lit, onPick, foldReused }: { screen: Screen } & Lighting) {
  const box = (r: Region, key: number) => <RegionBox key={key} region={r} lit={!!r.component && !!lit?.has(r.component)} onPick={onPick} foldReused={foldReused} />
  const nav: Region[] = screen.regions.filter((r) => r.sketch === "nav")
  const sheets: Region[] = screen.regions.filter((r) => r.sketch === "sheet")
  const main = screen.regions.filter((r) => !nav.includes(r) && !sheets.includes(r))
  return (
    <div role="group" aria-label={COPY.screens.picture(screen.label)} className="@container/pic grid overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 *:[grid-area:1/1]">
      <div className={`grid content-start gap-4 p-4 ${nav.length ? "@2xl/pic:grid-cols-[11rem_minmax(0,1fr)]" : ""} ${sheets.length ? "opacity-30" : ""}`} inert={sheets.length > 0}>
        {nav.length > 0 && <div className="flex min-w-0 flex-col gap-4">{nav.map(box)}</div>}
        <div className="@container flex min-w-0 flex-col gap-4">
          {(screen.screen || screen.subtitle) && (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-heading text-lg font-medium">{screen.screen}</span>
              {screen.subtitle && <span className="text-xs text-muted-foreground">{screen.subtitle}</span>}
            </div>
          )}
          {main.map(box)}
          {sheets.length > 0 && !main.length && <PageBehind />}
        </div>
      </div>
      {sheets.map((r, i) => (
        <div key={i} className="relative w-[min(100%,24rem)] justify-self-end border-l border-border bg-card p-4 shadow-xl">{box(r, i)}</div>
      ))}
    </div>
  )
}

/** Placeholder content for the dimmed page under a sheet when the state draws nothing else, so it reads as a page. */
const PageBehind = () => (
  <div aria-hidden className="flex flex-col gap-3">
    <div className="grid grid-cols-3 gap-3">{[0, 1, 2].map((k) => <span key={k} className="h-12 rounded-lg bg-foreground/8" />)}</div>
    {WAIT_BARS.map((w) => <span key={w} className={`h-3 rounded-full bg-foreground/8 ${w}`} />)}
  </div>
)

/** Requirement ids as quiet text, each opening its drawer as an id chip does. An id the page cannot open is plain text. */
function RefIds({ ids }: { ids: string[] }) {
  const { refs, openLinked } = usePage()
  return (
    <span className="inline-flex gap-1.5 font-mono text-xs text-muted-foreground">
      {ids.map((id) => refs.get(id)
        ? <button key={id} type="button" aria-haspopup="dialog" aria-label={COPY.linked.open(id)} onClick={(e) => openLinked(id, e.currentTarget)}
          className="rounded-sm underline-offset-4 outline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-focus">{id}</button>
        : <span key={id}>{id}</span>)}
    </span>
  )
}

/** The mark as a word in the region's label line: new and changed in the delta ink, reused and copied quiet. */
const MARK_INK = { new: "text-delta-ink", changed: "text-delta-ink", reused: "text-muted-foreground", copy: "text-muted-foreground" } as const

/** One region, marked by a rule down its left edge rather than a frame: solid for new or changed, dashed for reused or copied,
 *  which do not gate. Its label line holds the name, the mark as a word and the requirements it serves. */
export function RegionBox({ region, lit = false, onPick, foldReused = false }: { region: Region; lit?: boolean } & Pick<Lighting, "onPick" | "foldReused">) {
  const serves = region.serves ?? []
  const part = region.component
  const head = (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs leading-5">
      {onPick && part && <span className="font-mono text-muted-ink">{part}</span>}
      {onPick && part
        ? <button type="button" aria-pressed={lit} onClick={() => onPick(part)} className="rounded-md font-medium underline-offset-4 outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus">{region.name}</button>
        : <span className="font-medium">{region.name}</span>}
      <span className={MARK_INK[region.mark]}>{COPY.screens.marks[region.mark]}</span>
      {!onPick && serves.length > 0 && <span className="ml-auto"><RefIds ids={serves} /></span>}
      {!onPick && !serves.length && gates(region.mark) && <LooseEnd>{COPY.screens.servesNone}</LooseEnd>}
    </div>
  )
  const sample = <div className="mt-2">{region.sample ? drawSample(region.sketch, region.sample) : <p className="text-xs text-muted-ink">{COPY.screens.notSketched}</p>}</div>
  return (
    <div data-mark={region.mark} data-lit={lit || undefined}
      className={`min-w-0 rounded-r-lg border-l-2 py-1 pr-2 pl-3 ${gates(region.mark) ? "border-delta-line" : "border-dashed border-foreground/20"} ${lit ? "bg-muted/60 outline-2 outline-offset-2 outline-focus" : ""}`}>
      {foldReused && !gates(region.mark)
        ? <div>{head}{sample}</div>
        : <>{head}{sample}</>}
    </div>
  )
}

const drawSample = <S extends Sketch>(sketch: S, sample: SampleOf<S>) => DRAW[sketch](sample)

const MockPill = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex h-7 items-center gap-1 rounded-full border border-border px-2.5 text-xs text-muted-foreground">{children}</span>
)
const MockBadge = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-foreground/8 px-2 text-xs font-medium whitespace-nowrap">{children}</span>
)
const Figure = ({ pair: [value, label], small }: { pair: [string, string]; small?: boolean }) => (
  <div className="min-w-0"><div className={`font-heading font-medium tabular-nums ${small ? "text-sm" : "text-base"}`}>{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>
)
const Avatar = ({ text, size = "size-6 rounded-md text-xs" }: { text: string; size?: string }) => (
  <span aria-hidden className={`grid shrink-0 place-items-center bg-foreground/10 font-medium ${size}`}>{text.charAt(0)}</span>
)
const WAIT_BARS = ["w-full", "w-3/4", "w-5/6"]
const MESSAGE_ICON = { empty: SearchIcon, error: CircleAlertIcon, lock: LockIcon } as const

/** A table row as cells. A record row reads `columns` in order, or its own keys, and its `badge` sits beside the first cell. */
function cellsOf(row: string[] | Record<string, string>, columns?: string[]) {
  if (Array.isArray(row)) return { cells: row, badge: undefined }
  const { badge, ...rest } = row
  return { cells: (columns ?? Object.keys(rest)).map((k) => rest[k] ?? ""), badge }
}

const DRAW: { [S in Sketch]: (s: SampleOf<S>) => ReactNode } = {
  nav: (s) => (
    <ul className="flex flex-wrap gap-1 text-xs text-muted-foreground @2xl/pic:flex-col">
      {s.items.map((i, k) => (
        <li key={k} className={!i.entry ? `px-2 py-1 ${i.sub ? "@2xl/pic:pl-5" : ""} ${i.open ? "font-medium text-foreground" : ""}`
          : s.entryHidden ? "rounded-md border border-dashed border-foreground/25 px-2 py-1 line-through decoration-foreground/40 @2xl/pic:ml-3"
          : "rounded-md bg-muted px-2 py-1 font-medium text-foreground @2xl/pic:ml-3"}>{i.t}</li>
      ))}
    </ul>
  ),
  figures: (s) => (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-3">{s.figures.map((f, k) => <Figure key={k} pair={f} />)}</div>
      {s.note && <p className="mt-2 text-xs text-muted-foreground">{s.note}</p>}
    </>
  ),
  tabs: (s) => (
    <div className="flex flex-wrap gap-1.5 text-xs">
      {s.tabs.map(([t, n], k) => <span key={k} className={`rounded-full px-2.5 py-1 ${k ? "text-muted-foreground" : "bg-foreground font-medium text-background"}`}>{t} <span className="tabular-nums">{n}</span></span>)}
    </div>
  ),
  filters: (s) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <MockPill><SearchIcon aria-hidden className="size-3" />{s.search}</MockPill>
      {s.pills.map((p, k) => <MockPill key={k}>{p}</MockPill>)}
    </div>
  ),
  table: (s) => {
    const rows = s.rows.map((r) => cellsOf(r, s.columns))
    const width = Math.max(0, ...rows.map((r) => r.cells.length))
    const grid = width > 2 ? "@lg:grid-cols-[minmax(0,1.6fr)_repeat(var(--mid),minmax(0,1fr))_6.5rem]" : ""
    const style = { "--mid": Math.max(1, width - 2) } as CSSProperties
    const cells = (cs: string[], head: boolean) => cs.map((c, k) => {
      const first = k === 0, last = k === cs.length - 1 && k > 0
      if (first || last) return null
      return <div key={k} className={`hidden min-w-0 truncate text-xs @lg:block ${head ? "" : "text-muted-foreground"}`}>{c}</div>
    })
    return (
      <div className="divide-y divide-border/70" style={style}>
        {s.columns && (
          <div className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 pb-1.5 text-xs text-muted-ink ${grid}`}>
            <div>{s.columns[0]}</div>{cells(s.columns, true)}{width > 1 && <div className="text-right">{s.columns[width - 1]}</div>}
          </div>
        )}
        {rows.map(({ cells: cs, badge }, k) => (
          <div key={k} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-2 ${grid}`}>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {cs[0] && <Avatar text={cs[0]} />}<span className="text-sm font-medium">{cs[0]}</span>{badge && <MockBadge>{badge}</MockBadge>}
            </div>
            {cells(cs, false)}
            {cs.length > 1 && <div className="text-right text-sm tabular-nums">{cs.at(-1)}</div>}
          </div>
        ))}
      </div>
    )
  },
  pagination: (s) => (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{s.text}</span><span className="flex gap-1"><MockPill>{COPY.screens.previous}</MockPill><MockPill>{COPY.screens.next}</MockPill></span>
    </div>
  ),
  message: (s) => {
    const Icon = s.tone === "wait" ? null : MESSAGE_ICON[s.tone]
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-2 py-6 text-center">
        {Icon ? <span className="mb-1 grid size-9 place-items-center rounded-full bg-muted text-muted-foreground"><Icon aria-hidden className="size-4" /></span>
          : <span aria-hidden className="mb-2 flex w-40 flex-col gap-1.5">{WAIT_BARS.map((w) => <span key={w} className={`h-2 rounded-full bg-foreground/12 motion-safe:animate-pulse ${w}`} />)}</span>}
        <div className="font-heading text-base font-medium">{s.title}</div>
        <p className="max-w-[38ch] text-sm leading-6 text-muted-foreground">{s.text}</p>
        {s.action && <span className="mt-1 inline-flex h-8 items-center rounded-full border border-border px-3 text-xs font-medium">{s.action}</span>}
      </div>
    )
  },
  sheet: (s) => (
    <>
      <div className="flex items-start gap-2">
        <Avatar text={s.title} size="size-8 rounded-lg text-sm" />
        <div className="min-w-0 flex-1"><div className="text-sm font-medium">{s.title}</div>{s.sub && <div className="text-xs text-muted-foreground">{s.sub}</div>}</div>
        {s.badge && <MockBadge>{s.badge}</MockBadge>}
      </div>
      {s.figures && <div className="mt-3 grid grid-cols-2 gap-2">{s.figures.map((f, k) => <Figure key={k} pair={f} small />)}</div>}
      {s.bars && (
        <div aria-hidden className="mt-3 flex h-12 items-end gap-1">
          {s.bars.map((h, k) => <span key={k} className={`flex-1 rounded-sm ${h > 60 ? "bg-foreground/45" : "bg-foreground/15"}`} style={{ height: `${h || 4}%` }} />)}
        </div>
      )}
      {s.rows && (
        <div className="mt-3 divide-y divide-border/70 text-xs">
          {s.rows.map((cells, k) => (
            <div key={k} className="flex items-center justify-between gap-2 py-1.5">{cells.map((c, i) => <span key={i} className={i === 1 ? "tabular-nums" : "text-muted-foreground"}>{c}</span>)}</div>
          ))}
        </div>
      )}
      {s.button && <span className="mt-3 inline-flex h-8 items-center rounded-full border border-border px-3 text-xs font-medium">{s.button}</span>}
    </>
  ),
  form: (s) => (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-medium">{s.title}</div>
      {s.fields.map(([label, value], k) => (
        <div key={k} className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="flex h-8 items-center rounded-lg border border-border px-2.5 text-sm">{value}</span>
        </div>
      ))}
      <span className="inline-flex h-8 w-fit items-center rounded-full bg-foreground px-3 text-xs font-medium text-background">{s.button}</span>
      {s.note && <p className="text-xs text-muted-foreground">{s.note}</p>}
    </div>
  ),
}
