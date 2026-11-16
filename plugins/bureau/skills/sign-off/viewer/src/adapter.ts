import type { ComponentProps } from "react"
import type { BlockData, PageData } from "../../scripts/build.ts"
import type { View as ViewKind } from "../../scripts/views.ts"
import type { Ref } from "./plan.ts"
import type { LayoutOf, Shell, ViewProps } from "./views.tsx"
import type { PrCard } from "./views/prs.tsx"
import type { TestDetail } from "./views/trace.tsx"

type BlockOf<V extends ViewKind> = Extract<BlockData, { view: V }>
/** What the view of kind `V` draws from: its block's input and drawing, and the page's links and sources. */
export type PropsOf<V extends ViewKind> = ViewProps<BlockOf<V>["input"], LayoutOf<V>>
type Adapt<V extends ViewKind> = (block: BlockOf<V>, shell: Shell) => PropsOf<V>

const asBuilt = <I>(block: { input: I }, shell: Shell) => ({ ...shell, input: block.input })
const withLayout = <I, L>(block: { input: I; layout: L }, shell: Shell) => ({ ...shell, input: block.input, layout: block.layout })

/** One row per view kind: the props it draws, built from the page's data. Every view gets the block as `build` embedded it, except
 *  the spec, which gets no questions because the step's Questions sub-step draws them. */
const ADAPT: { [V in ViewKind]: Adapt<V> } = {
  spec: (block, shell) => ({ ...shell, input: { ...block.input, questions: [] } }),
  screens: asBuilt, components: asBuilt, endpoints: asBuilt, trace: asBuilt, prs: asBuilt, figures: asBuilt,
  decisions: asBuilt, units: asBuilt, risks: asBuilt, prose: asBuilt,
  statechart: withLayout, erd: withLayout,
}

// TS cannot correlate `block.view` with the row it picks.
export const propsOf = (block: BlockData, shell: Shell): PropsOf<ViewKind> => (ADAPT[block.view] as Adapt<ViewKind>)(block, shell)

const blocksOf = <V extends ViewKind>(data: PageData, view: V) =>
  Object.values(data.blocks).filter((b): b is BlockOf<V> => b.view === view)

/** The endpoints view for one endpoint: the block's input with `endpoints` narrowed to it, so the access panel and the card draw as
 *  the whole view draws them. */
export const endpointProps = (props: PropsOf<"endpoints">, id: Ref): PropsOf<"endpoints"> =>
  ({ ...props, input: { ...props.input, endpoints: props.input.endpoints.filter((e) => e.id === id) } })

/** A pull request's card as the prs view draws it, or null when no prs block names it. */
export function prCardProps(data: PageData, id: Ref, go: (ref: Ref) => void): ComponentProps<typeof PrCard> | null {
  for (const { input } of blocksOf(data, "prs")) {
    const pr = input.prs.find((p) => p.id === id)
    if (pr) return { pr, units: input.units, links: data.links, go }
  }
  return null
}

/** A test's detail as the trace view draws it under a pressed chip, or null when no trace block names it. `id` is the test's.
 *  The detail gets an element id of its own, apart from the one the trace view gives it. */
export function testDetailProps(data: PageData, id: Ref): ComponentProps<typeof TestDetail> | null {
  const t = blocksOf(data, "trace").flatMap((b) => b.input.rows.flatMap((r) => r.tests)).find((x) => x.id === id)
  return t ? { t, id: `linked-test-${id}` } : null
}

/** Every block of one view kind, in manifest order, with the item that holds it: what a part page draws. */
export const partBlocks = (data: PageData, view: ViewKind) =>
  data.manifest.items.flatMap((item) => (item.body ?? []).flatMap((b, i) => {
    const block = data.blocks[`${item.id}:${i}`]
    return b.view === view && block ? [{ item, key: `${item.id}:${i}`, block }] : []
  }))
