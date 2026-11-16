import { createContext, useContext, type ComponentType, type ReactNode } from "react"
import type { BlockData } from "../../scripts/build.ts"
import type { View as ViewKind } from "../../scripts/views.ts"
import { propsOf, type PropsOf } from "./adapter.ts"
import type { Links, Ref } from "./plan.ts"
import { ComponentsView } from "./views/components.tsx"
import { DecisionsView } from "./views/decisions.tsx"
import { EndpointsView } from "./views/endpoints.tsx"
import { ErdView } from "./views/erd.tsx"
import { FiguresView } from "./views/figures.tsx"
import { ProseView } from "./views/prose.tsx"
import { PrsView } from "./views/prs.tsx"
import { RisksView } from "./views/risks.tsx"
import { ScreensView } from "./views/screens.tsx"
import { SpecView } from "./views/spec.tsx"
import { StatechartView } from "./views/statechart.tsx"
import { TraceView } from "./views/trace.tsx"
import { UnitsView } from "./views/units.tsx"

type BlockOf<V extends ViewKind> = Extract<BlockData, { view: V }>
/** The build-time drawing of a statechart or erd block, and `never` for every other view. */
export type LayoutOf<V extends ViewKind> = BlockOf<V> extends { layout: infer L } ? L : never

/** What the shell hands every view. `focus` is the ref the reader went to inside this card, so the view can light it. `layout` is
 *  the block's build-time drawing, for the views that have one. `sources` is the page's text of each file ref a block shows. */
export type ViewProps<I, L = never> = {
  input: I; layout?: L; links: Links; sources: Record<string, string>; focus: Ref | null; go: (ref: Ref) => void
}
export type Shell = Omit<ViewProps<never>, "input" | "layout">

/** Add a view by adding its row, and its row in `adapter.ts`. A block whose view has no row draws nothing, and its card still
 *  carries the verdict. */
export const VIEWS: { [V in ViewKind]?: ComponentType<PropsOf<V>> } = {
  // A plan with no product act has nothing for the spec view to draw.
  spec: ({ input, ...shell }) => input.product && <SpecView input={{ ...input, product: input.product }} {...shell} />,
  screens: ScreensView,
  components: ComponentsView,
  endpoints: EndpointsView,
  trace: TraceView,
  prs: PrsView,
  figures: FiguresView,
  decisions: DecisionsView,
  units: UnitsView,
  risks: RisksView,
  prose: ProseView,
  statechart: StatechartView,
  erd: ErdView,
}

/** The step page draws a few kinds its own way around the original view (the API tabs, the PR diagram). A part page sets none, so
 *  it draws every kind as `VIEWS` does. */
export const PlacedViews = createContext<typeof VIEWS>({})

function Block({ block, shell }: { block: BlockData; shell: Shell }) {
  // TS cannot correlate `block.view` with the row it picks.
  const View = (useContext(PlacedViews)[block.view] ?? VIEWS[block.view]) as ComponentType<PropsOf<ViewKind>> | undefined
  return View ? <View {...propsOf(block, shell)} /> : null
}

/** Draws one embedded block with its registered view, or nothing when its view has no row. */
export const drawBlock = (block: BlockData, shell: Shell): ReactNode => <Block block={block} shell={shell} />
