import { useEffect, useState } from "react"
import type { Build, Component, ComponentsInput, Screen } from "../../../scripts/views.ts"
import { COPY, plural } from "../copy.ts"
import { IdChip, LooseEnd, Subhead } from "../parts.tsx"
import type { Ref } from "../plan.ts"
import type { ViewProps } from "../views.tsx"
import { FlowStrip, MarkBadge, ScreenPicture } from "./screens.tsx"

type Group = keyof typeof COPY.components.groups
const GROUP_OF: Record<Component["role"], Group> = { route: "page", layout: "page", component: "page", data: "data", wiring: "wiring" }
/** Wiring draws in a plain box, not a section of its own. */
const FOLDED: ReadonlySet<Group> = new Set(["wiring"])
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

/** The page picture beside the parts list. Picking a part outlines where it sits, and picking a region picks its part. */
export function ComponentsView({ input, focus, go }: ViewProps<ComponentsInput>) {
  const { components, screens, builtIn, note } = input
  const c = COPY.components
  const [picked, setPicked] = useState<string | null>(null)
  const [screenId, setScreenId] = useState<string | undefined>(screens[0]?.id)
  const part = components.find((x) => x.id === picked)
  const lit = litBy(part, components, screens)
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
    return parts.length ? [{ g, rows: treeOf(parts) }] : []
  })
  const repos = [...new Set(components.flatMap((x) => x.repo ?? []))]
  const nameOf = (id: string) => components.find((x) => x.id === id)?.name ?? id
  const drawnIn = (id: string) => screens.filter((s) => s.regions.some((r) => r.component === id))
  const states = screens.reduce((n, s) => n + (s.states?.length ?? 0), 0)
  const shown = screen ? draws(screen, lit) : 0
  const says = !part ? c.pick : shown ? (lit.has(part.id) ? c.outlined(part.name) : c.worksThrough(part.name, shown))
    : lit.size ? c.offPicture(part.name) : c.nowhere(part.name)
  return (
    <>
      <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">{c.intro(repos, groups.length, states, screens.length)}</p>
      {screen && <div className="mt-5"><FlowStrip screens={screens} picked={screen.id} onPick={setScreenId} /></div>}
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        {screen && (
          <div className="min-w-0 lg:sticky lg:top-20">
            <p className="mb-2 px-1 text-sm text-muted-ink" aria-live="polite">{says}</p>
            <div className="rounded-3xl bg-muted/60 p-2 sm:p-3 dark:bg-muted/40">
              <ScreenPicture screen={screen} lit={lit} onPick={(id) => pick(id === picked ? null : id)} />
            </div>
            {screen.states?.length ? (
              <div className="mt-4 px-1">
                <Subhead>{c.pageStates}</Subhead>
                <ul className="flex flex-col gap-2">
                  {screen.states.map((st) => <li key={st.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm leading-6"><IdChip id={st.id} /><span className="text-muted-foreground">{st.says}</span></li>)}
                </ul>
              </div>
            ) : null}
          </div>
        )}
        <div className="min-w-0">
          {groups.map(({ g, rows }) => {
            const list = <ul className="mt-2 flex flex-col gap-1">{rows.map((r) => (
              <PartRow key={r.c.id} {...r} lit={picked === r.c.id} drawnIn={drawnIn(r.c.id)} nameOf={nameOf} go={go} onPick={() => pick(picked === r.c.id ? null : r.c.id)} />
            ))}</ul>
            const title = (
              <span className="flex flex-col">
                <span className="font-medium text-foreground">{c.groups[g].title}</span>
                <span className="text-muted-ink">{plural(rows.length, "part")}. {c.groups[g].says}</span>
              </span>
            )
            const section = <><h4 className="px-3 text-sm">{title}</h4>{list}</>
            if (!FOLDED.has(g)) return <section key={g} className="mt-6">{section}</section>
            return (
              <div key={g} className="mt-6">
                {section}
              </div>
            )
          })}
          {(builtIn.length > 0 || note) && (
            <p className="mt-6 px-3 text-sm leading-6 text-muted-foreground">
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

/** One part: its mark, id and name, what it reads and serves, the sentence on what it does, then where it lives and shows. */
function PartRow({ c, depth, lit, drawnIn, nameOf, go, onPick }: Row & { lit: boolean; drawnIn: Screen[]; nameOf: (id: string) => string; go: (ref: Ref) => void; onPick: () => void }) {
  const t = COPY.components
  const meta = [
    c.file && <span key="file" className="font-mono [overflow-wrap:anywhere]">{c.file}</span>,
    c.shows && <span key="shows">{t.shows} {links([c.shows], nameOf, go)}</span>,
    drawnIn.length > 0 && <span key="drawn">{t.drawnIn} {links(drawnIn.map((s) => s.id), (id) => drawnIn.find((s) => s.id === id)?.label ?? id, go)}</span>,
  ].filter(Boolean)
  return (
    <li data-ref={c.id} style={{ marginInlineStart: `${depth * 1.25}rem` }}
      className={`scroll-mt-28 rounded-2xl px-3 py-2.5 ${depth ? "rounded-l-none border-l border-border" : ""} ${lit ? "bg-muted outline-2 outline-focus" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <MarkBadge mark={c.mark} /><IdChip id={c.id} />
        <button type="button" aria-pressed={lit} onClick={onPick} className="min-w-0 rounded-md text-left font-mono text-[13px] font-medium [overflow-wrap:anywhere] outline-offset-2 hover:text-link focus-visible:outline-2 focus-visible:outline-focus">{c.name}</button>
        <span className="ml-auto flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1">
          {c.reads?.length ? <span className="text-xs text-muted-ink">{t.reads} {links(c.reads, (id) => id, go)}</span> : null}
          {c.serves?.length ? <span className="inline-flex flex-wrap gap-1">{c.serves.map((r) => <IdChip key={r} id={r} />)}</span> : <LooseEnd>{t.servesNone}</LooseEnd>}
        </span>
      </div>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{c.does}</p>
      {meta.length > 0 && <p className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-ink">{meta}</p>}
    </li>
  )
}
