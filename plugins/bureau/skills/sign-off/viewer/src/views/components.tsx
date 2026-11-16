import { Fragment, useEffect, useState, type MouseEvent } from "react"
import type { Build, Component, ComponentsInput, Screen } from "../../../scripts/views.ts"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { COPY } from "../copy.ts"
import { IdChip, LooseEnd, Subhead, usePage } from "../parts.tsx"
import type { Ref } from "../plan.ts"
import type { ViewProps } from "../views.tsx"
import { FlowStrip, MarkBadge, ScreenPicture } from "./screens.tsx"

type Group = keyof typeof COPY.components.groups
const GROUP_OF: Record<Component["role"], Group> = { route: "page", layout: "page", component: "page", data: "data", wiring: "wiring" }
/** With no `parent` set, the route leads, then the layout, then what they hold. */
const ROLE_ORDER: Component["role"][] = ["route", "layout", "component", "data", "wiring"]
type Row = { c: Component; depth: number }

/** The group's parts in tree order: each part under its parent when the parent is in the same group. */
function treeOf(parts: Component[]): Row[] {
  const ids = new Set(parts.map((c) => c.id))
  const tops = parts.filter((c) => !c.parent || !ids.has(c.parent))
  const out: Row[] = []
  const walk = (c: Component, depth: number) => { out.push({ c, depth }); for (const k of parts) if (k.parent === c.id) walk(k, depth + 1) }
  for (const c of tops) walk(c, 0)
  return out
}

/** The parts a picked part outlines: its own region, else the region it shows through, else every drawn part that reads an
 *  endpoint it reads. */
function litBy(part: Component | undefined, components: Component[], screens: Screen[]): ReadonlySet<string> {
  if (!part) return new Set()
  const drawn = new Set(screens.flatMap((s) => s.regions.flatMap((r) => r.component ?? [])))
  if (drawn.has(part.id)) return new Set([part.id])
  if (part.shows) return new Set([part.shows])
  const reads = part.reads ?? []
  return new Set(components.filter((c) => drawn.has(c.id) && c.reads?.some((e) => reads.includes(e))).map((c) => c.id))
}
const draws = (s: Screen, lit: ReadonlySet<string>) => s.regions.filter((r) => r.component !== undefined && lit.has(r.component)).length
/** The state to show after a pick: the current one when it outlines something, else the first state that does. */
function stateFor(current: string | undefined, lit: ReadonlySet<string>, screens: Screen[]) {
  const shown = screens.find((s) => s.id === current)
  return !lit.size || (shown && draws(shown, lit)) ? current : (screens.find((s) => draws(s, lit))?.id ?? current)
}

/** The page picture beside the parts list. Hovering a part outlines where it sits, picking it pins the outline, and picking a
 *  region picks its part. */
export function ComponentsView({ input, focus, go }: ViewProps<ComponentsInput>) {
  const { components, screens, builtIn, note } = input
  const c = COPY.components
  const [picked, setPicked] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [screenId, setScreenId] = useState<string | undefined>(screens[0]?.id)
  const part = components.find((x) => x.id === picked)
  const lit = litBy(components.find((x) => x.id === hovered) ?? part, components, screens)
  const screen = screens.find((s) => s.id === screenId) ?? screens[0]
  const pick = (id: string | null) => {
    setPicked(id)
    setScreenId((current) => stateFor(current, litBy(components.find((x) => x.id === id), components, screens), screens))
  }
  useEffect(() => {
    const target = components.find((x) => x.id === focus)
    if (!target) return
    setPicked(target.id)
    setScreenId((current) => stateFor(current, litBy(target, components, screens), screens))
  }, [focus, components, screens])

  const groups = (Object.keys(c.groups) as Group[]).flatMap((g) => {
    const parts = components.filter((x) => GROUP_OF[x.role] === g)
    return parts.length ? [{ g, rows: treeOf(parts.toSorted((x, y) => ROLE_ORDER.indexOf(x.role) - ROLE_ORDER.indexOf(y.role))) }] : []
  })
  const nameOf = (id: string) => components.find((x) => x.id === id)?.name ?? id
  const drawn = new Set(screens.flatMap((s) => s.regions.flatMap((r) => r.component ?? [])))
  const here = new Set(screen?.regions.flatMap((r) => r.component ?? []))
  const pinned = part ? litBy(part, components, screens) : null
  const shown = screen && pinned ? draws(screen, pinned) : 0
  const says = !part || !pinned || (shown && pinned.has(part.id)) ? "" : shown ? c.worksThrough(part.name, shown) : pinned.size ? c.offPicture : c.nowhere
  return (
    <>
      {screen && <FlowStrip screens={screens} picked={screen.id} onPick={setScreenId} />}
      <div data-part="split" className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        {screen && (
          <div data-part="picture" className="min-w-0 lg:sticky lg:top-4">
            <ScreenPicture screen={screen} lit={lit} onPick={(id) => pick(id === picked ? null : id)} />
            <p className="mt-2 min-h-5 px-1 text-sm text-muted-ink" aria-live="polite">{says}</p>
            {screen.states?.length ? (
              <div className="mt-2 px-1">
                <Subhead>{c.pageStates}</Subhead>
                <ul className="flex flex-col gap-2">
                  {screen.states.map((st) => <li key={st.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm leading-6"><IdChip id={st.id} /><span className="text-muted-foreground">{st.says}</span></li>)}
                </ul>
              </div>
            ) : null}
          </div>
        )}
        <div data-part="parts" className="flex min-w-0 flex-col gap-8">
          {groups.map(({ g, rows }) => (
            <section key={g} data-group={g}>
              <h4 className="flex items-baseline gap-2 border-b border-border/70 pb-2 text-sm font-medium">{c.groups[g]}<span className="font-normal text-muted-ink tabular-nums">{rows.length}</span></h4>
              <ul>{rows.map((r) => (
                <PartRow key={r.c.id} {...r} lit={picked === r.c.id} dim={g === "page" && drawn.has(r.c.id) && !here.has(r.c.id) && picked !== r.c.id} nameOf={nameOf} go={go}
                  onPick={() => pick(picked === r.c.id ? null : r.c.id)} onHover={(on) => setHovered(on ? r.c.id : null)} />
              ))}</ul>
            </section>
          ))}
          {(builtIn.length > 0 || note) && (
            <p data-part="built-in" className="text-sm leading-6 text-muted-foreground">
              {builtIn.length > 0 && <>{c.builtIn} <BuiltIn builds={builtIn} go={go} />.</>}{builtIn.length > 0 && note && " "}{note}
            </p>
          )}
        </div>
      </div>
    </>
  )
}

const LINK = "rounded-md text-link underline decoration-link/30 underline-offset-4 outline-offset-2 hover:decoration-link focus-visible:outline-2 focus-visible:outline-focus"
const links = (ids: string[], label: (id: string) => string, go: (ref: Ref) => void) => ids.map((id, i) => (
  <span key={id}>{i > 0 && ", "}<button type="button" className={LINK} onClick={() => go(id)}>{label(id)}</button></span>
))

/** Each unit as `U3 shelf-web`, linked to the pull request that ships it. A unit no pull request ships is plain text. */
export const BuiltIn = ({ builds, go }: { builds: Build[]; go: (ref: Ref) => void }) => builds.map((b, i) => {
  const label = [b.unit, b.repo].filter(Boolean).join(" ")
  return <span key={b.unit}>{i > 0 && ", "}{b.prs.length ? links(b.prs, () => label, go) : label}</span>
})

/** A path that wraps after a slash before it breaks inside a segment. */
export const atSlashes = (path: string) => path.split("/").map((part, i) => <Fragment key={i}>{i > 0 && <>/<wbr /></>}{part}</Fragment>)

const QUIET_ID = "rounded-sm font-mono text-sm text-muted-ink underline-offset-4 outline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-focus"
const RAIL: Record<Component["mark"], string> = { new: "border-delta-line", changed: "border-delta-line", reused: "border-dashed border-foreground/25" }

/** One part in three short lines: id, name and its mark; what it does; then what it reads, the requirements it serves and, for a
 *  reused part, where it lives. A press anywhere on the row pins it on the picture. `dim` is a part drawn on another picture. */
function PartRow({ c, depth, lit, dim, nameOf, go, onPick, onHover }: Row & {
  lit: boolean; dim: boolean; nameOf: (id: string) => string; go: (ref: Ref) => void; onPick: () => void; onHover: (on: boolean) => void
}) {
  const t = COPY.components
  const { refs, openLinked } = usePage()
  const reused = c.mark === "reused"
  const name = "min-w-0 rounded-md text-left font-mono text-[15px] leading-6 font-medium [overflow-wrap:anywhere] outline-offset-2 hover:text-link focus-visible:outline-2 focus-visible:outline-focus"
  const path = c.file && <span className="font-mono [overflow-wrap:anywhere]">{atSlashes(c.file)}</span>
  const meta = [
    c.reads?.length ? <span key="reads">{t.reads} {links(c.reads, (id) => id, go)}</span> : null,
    c.serves?.length ? <span key="serves" className="inline-flex flex-wrap gap-1">{c.serves.map((r) => <IdChip key={r} id={r} />)}</span> : <LooseEnd key="serves">{t.servesNone}</LooseEnd>,
    c.shows ? <span key="shows">{t.shows} {links([c.shows], nameOf, go)}</span> : null,
    reused && path ? <span key="file" className="min-w-0 flex-1 basis-40">{path}</span> : null,
  ].filter(Boolean)
  // The row is a pointer target only: the name is its button, so the links inside stay links.
  const inert = (e: MouseEvent) => (e.target as Element).closest("button, a") !== null
  return (
    <li data-ref={c.id} data-dim={dim || undefined} style={{ marginInlineStart: `${depth * 1.25}rem` }}
      onClick={(e) => { if (!inert(e)) onPick() }} onPointerEnter={() => onHover(true)} onPointerLeave={() => onHover(false)}
      className={`scroll-mt-28 cursor-pointer border-b border-l-[3px] border-b-border/60 py-3 pr-1 pl-3 transition-opacity ${RAIL[c.mark]} ${lit ? "bg-muted" : "hover:bg-muted/50"} ${dim ? "opacity-55 hover:opacity-100 focus-within:opacity-100" : ""}`}>
      <div className="flex items-start gap-x-2">
        {refs.get(c.id)
          ? <button type="button" aria-haspopup="dialog" aria-label={COPY.linked.open(c.id)} onClick={(e) => openLinked(c.id, e.currentTarget)} className={`${QUIET_ID} leading-6`}>{c.id}</button>
          : <span className="font-mono text-sm leading-6 text-muted-ink">{c.id}</span>}
        {path && !reused ? (
          <HoverCard>
            <HoverCardTrigger delay={250} render={<button type="button" aria-pressed={lit} onClick={onPick} className={name} />}>{c.name}</HoverCardTrigger>
            <HoverCardContent align="start" className="w-auto max-w-96 rounded-2xl px-3 py-2 text-xs leading-5">{c.repo && <div className="text-muted-ink">{c.repo}</div>}{path}</HoverCardContent>
          </HoverCard>
        ) : <button type="button" aria-pressed={lit} onClick={onPick} className={name}>{c.name}</button>}
        <span className="ml-auto shrink-0"><MarkBadge mark={c.mark} /></span>
      </div>
      <p className="mt-1 text-base leading-6 text-muted-ink">{c.does}</p>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-ink">
        {meta.map((m, i) => <Fragment key={i}>{i > 0 && <span aria-hidden>·</span>}{m}</Fragment>)}
      </p>
    </li>
  )
}
