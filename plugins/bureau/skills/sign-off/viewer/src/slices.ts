import type { BlockData } from "../../scripts/build.ts"
import type { Item } from "../../scripts/manifest.ts"
import type { View as ViewKind } from "../../scripts/views.ts"
import { COPY } from "./copy.ts"

/** One stop's share of a card too tall for a screen. The card mounts whole through the original views, and the stop hides the rest
 *  with `hide`, CSS selectors under the stop's frame, so every drawing stays the original's. `list` draws a trace block as one of
 *  the shell's brief lists in place of the matrix. */
export type Part = { key: string; label: string; hide: string[]; css?: string; list?: "acceptance" | "tests" | "coverage" }

type BlockOf<V extends ViewKind> = Extract<BlockData, { view: V }>
type Slicer<V extends ViewKind> = (block: BlockOf<V>, root: string) => Part[]

/** A card's body holds one wrapper per drawn block, in body order. */
const blockRoot = (k: number) => `section[data-step] > article > div:last-child > :nth-child(${k + 1})`
const REQUIREMENTS_PER_STOP = 5
type TraceRow = BlockOf<"trace">["input"]["rows"][number]
/** The table rows one Acceptance or Coverage stop holds, in px at a 1440 by 900 window: a screen less the step's and the card's heads. */
const ROWS_PER_STOP = 560
/** Estimates of what `verify.tsx` draws. An Acceptance row is one line. A Coverage row is as tall as its sentence or its fullest
 *  layer, whose test names wrap at about `NAME` characters. */
const LINE = 36, TEXT = 20, SENTENCE = 46, NAME = 20
const acceptanceHeight = (row: TraceRow) => LINE * (1 + row.acceptance.length)
const coverageHeight = (row: TraceRow) => LINE + row.acceptance.reduce((sum, a) => {
  const proving = row.tests.filter((x) => x.proves.includes(a.id))
  const layers = [...new Set(proving.map((x) => x.type))].map((l) => proving.filter((x) => x.type === l).reduce((h, x) => h + 8 + TEXT * Math.ceil(x.name.length / NAME), 0))
  const words = a.says ?? [a.given, a.when, a.then].filter(Boolean).join(". ")
  return sum + 12 + Math.max(TEXT * Math.ceil(words.length / SENTENCE), ...layers)
}, 0)

/** The requirements' rows in runs that each fit a stop. A requirement's rows stay together, so one taller than a stop is a stop. */
function stopsOf(rows: TraceRow[], height: (row: TraceRow) => number): TraceRow[][] {
  const stops: TraceRow[][] = []
  let room = 0
  for (const row of rows) {
    const h = height(row)
    if (h > room || !stops.length) { stops.push([]); room = ROWS_PER_STOP }
    stops.at(-1)!.push(row)
    room -= h
  }
  return stops
}
/** The components view's own grouping of roles, which it does not export. */
const GROUP_OF = { route: "page", layout: "page", component: "page", data: "data", wiring: "wiring" } as const
const s = COPY.steps.parts

/** How each tall view splits into stops by the parts it draws. A view with no row stays one stop. Each selector names the view's
 *  own markup, which the views guard keeps as `main` drew it. */
const SLICERS: { [V in ViewKind]?: Slicer<V> } = {
  spec: ({ input }, root) => {
    const reqs = input.product?.requirements ?? []
    if (reqs.length <= REQUIREMENTS_PER_STOP) return []
    const chunks = Array.from({ length: Math.ceil(reqs.length / REQUIREMENTS_PER_STOP) }, (_, i) => reqs.slice(i * REQUIREMENTS_PER_STOP, (i + 1) * REQUIREMENTS_PER_STOP))
    return [
      { key: "problem", label: s.problem, hide: [`${root} > :nth-child(n+3)`] },
      ...chunks.map((chunk, i) => {
        const from = i * REQUIREMENTS_PER_STOP + 1, to = from + chunk.length - 1
        return {
          key: `requirements-${i + 1}`, label: s.requirements(chunk[0]!.id, chunk.at(-1)!.id),
          hide: [`${root} > :not(:nth-child(3))`, `${root} > :nth-child(3) tbody > tr:not(:nth-child(n+${from}):nth-child(-n+${to}))`],
          css: `${root} > :nth-child(3){margin-top:0}`,
        }
      }),
      { key: "left-out", label: s.leftOut, hide: [`${root} > :nth-child(-n+3)`], css: `${root} > :nth-child(4){margin-top:0}` },
    ]
  },
  components: ({ input }, root) => {
    const groups = (Object.keys(COPY.components.groups) as (keyof typeof COPY.components.groups)[]).filter((g) => input.components.some((c) => GROUP_OF[c.role] === g))
    if (groups.length < 2) return []
    return groups.map((g, k) => {
      const others = [`${root} section[data-group]:not([data-group=${g}])`, ...(k === groups.length - 1 ? [] : [`${root} [data-part=built-in]`])]
      if (g === "page") return { key: g, label: COPY.components.groups[g], hide: others }
      return {
        key: g, label: COPY.components.groups[g], hide: [...others, `${root} [data-part=strip]`, `${root} [data-part=picture]`],
        css: `${root} [data-part=split]{display:block;margin-top:0}\n@media (min-width:1024px){${root} section[data-group] > ul{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:2rem}}`,
      }
    })
  },
  trace: ({ input }, root) => {
    const table = (list: "acceptance" | "coverage", height: (row: TraceRow) => number): Part[] => {
      const stops = stopsOf(input.rows, height)
      if (stops.length < 2) return [{ key: list, label: s[list], hide: [], list }]
      return stops.map((rows, i) => {
        const ids = rows.flatMap((r) => r.requirement?.id ?? [])
        const mine = rows.map((r) => `[data-requirement=${JSON.stringify(r.requirement?.id ?? "")}]`).join(",")
        return {
          key: `${list}-${i + 1}`, label: s.of(s[list], ids[0], ids.at(-1)), list,
          hide: [`${root} tr[data-requirement]:not(${mine})`, ...(i ? [`${root} [data-placed] > [data-part=counts]`] : [])],
          css: i ? `${root} [data-placed] > [data-part=counts] + div{margin-top:0}` : undefined,
        }
      })
    }
    return [...table("acceptance", acceptanceHeight), { key: "tests", label: s.tests, hide: [], list: "tests" }, ...table("coverage", coverageHeight)]
  },
}

/** The stops a card splits into, or none when it fits one. A card with several drawn blocks gives each block its stops, and hides the
 *  other blocks on each. */
export function partsOf(item: Item, blocks: Record<string, BlockData>): Part[] {
  const own = (item.body ?? []).flatMap((_, i) => blocks[`${item.id}:${i}`] ?? [])
  const sliced = own.map((block, k) => {
    // TS cannot correlate `block.view` with the row it picks.
    const slicer = SLICERS[block.view] as Slicer<ViewKind> | undefined
    return { block, k, parts: slicer?.(block, blockRoot(k)) ?? [] }
  })
  if (own.length < 2) return sliced[0]?.parts ?? []
  const others = (k: number) => own.flatMap((_, j) => (j === k ? [] : [blockRoot(j)]))
  const seen = new Map<string, number>()
  return sliced.flatMap(({ block, k, parts }) => {
    const n = (seen.get(block.view) ?? 0) + 1
    seen.set(block.view, n)
    // Part keys never name a view, so a key is unique in its card once a repeated view is numbered.
    const keyed = (key: string) => (n > 1 ? `${key}-${n}` : key)
    if (!parts.length) return [{ key: keyed(block.view), label: s.view[block.view], hide: others(k) }]
    return parts.map((p) => ({ ...p, key: keyed(p.key), hide: [...others(k), ...p.hide] }))
  })
}
