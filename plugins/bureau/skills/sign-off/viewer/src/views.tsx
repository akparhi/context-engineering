import type { ComponentType, ReactNode } from "react"
import type { BlockData } from "../../scripts/build.ts"
import type { Inputs, View as ViewKind } from "../../scripts/views.ts"
import type { Links, Ref } from "./plan.ts"
import { ComponentsView, componentsRow } from "./views/components.tsx"
import { DecisionsView, decisionsRow } from "./views/decisions.tsx"
import { EndpointsView, endpointsRow } from "./views/endpoints.tsx"
import { ErdView, erdRow } from "./views/erd.tsx"
import { FiguresView, figuresRow } from "./views/figures.tsx"
import { ProseView } from "./views/prose.tsx"
import { PrsView, prsRow } from "./views/prs.tsx"
import { RisksView, risksRow } from "./views/risks.tsx"
import { ScreensView, screensRow } from "./views/screens.tsx"
import { SpecView, specRow } from "./views/spec.tsx"
import { StatechartView, statechartRow } from "./views/statechart.tsx"
import { TraceView, traceRow } from "./views/trace.tsx"
import { UnitsView, unitsRow } from "./views/units.tsx"

type BlockOf<V extends ViewKind> = Extract<BlockData, { view: V }>
/** The build-time drawing of a statechart or erd block, and `never` for every other view. */
export type LayoutOf<V extends ViewKind> = BlockOf<V> extends { layout: infer L } ? L : never

/** What the shell hands every view. `focus` is the ref the reader went to inside this card, so the view can light it. `layout` is
 *  the block's build-time drawing, for the views that have one. `sources` is the page's text of each file ref a block shows. */
export type ViewProps<I, L = never> = {
  input: I; layout?: L; links: Links; sources: Record<string, string>; focus: Ref | null; go: (ref: Ref) => void
}
type Shell = Omit<ViewProps<never>, "input" | "layout">

/** What a card says when slim folds it to a row. `says` sums up the whole view ("21 parts, 12 new, 4 changed, 5 reused"). Each
 *  `loose` line is a loose end the row must keep in sight ("HowWeFindDialog serves no requirement"). */
export type RowLine = { says: string; loose: string[] }

/** A registered view. `asks` means the view draws its section's questions itself, so the card does not add them. `row` is the
 *  view's folded row; a view without one folds to its title and status alone. */
type Entry<V extends ViewKind> = { draw: (block: BlockOf<V>, shell: Shell) => ReactNode; asks: boolean; row?: (block: BlockOf<V>) => RowLine }

const view = <I, L = never>(Body: ComponentType<ViewProps<I, L>>, { asks = false, row }: { asks?: boolean; row?: (input: I, layout?: L) => RowLine } = {}) => ({
  asks,
  draw: (block: { input: I; layout?: L }, shell: Shell) => <Body input={block.input} layout={block.layout} {...shell} />,
  row: row && ((block: { input: I; layout?: L }) => row(block.input, block.layout)),
})

/** Add a view by adding its row. A block whose view has no row draws nothing, and its card still carries the verdict. */
export const VIEWS: { [V in ViewKind]?: Entry<V> } = {
  // A plan with no product act has nothing for the spec view to draw.
  spec: view<Inputs["spec"]>(({ input, ...shell }) => input.product && <SpecView input={{ ...input, product: input.product }} {...shell} />, { asks: true, row: specRow }),
  screens: view(ScreensView, { row: screensRow }),
  components: view(ComponentsView, { row: componentsRow }),
  endpoints: view(EndpointsView, { row: endpointsRow }),
  trace: view(TraceView, { row: traceRow }),
  prs: view(PrsView, { row: prsRow }),
  figures: view(FiguresView, { row: figuresRow }),
  decisions: view(DecisionsView, { row: decisionsRow }),
  units: view(UnitsView, { row: unitsRow }),
  risks: view(RisksView, { row: risksRow }),
  prose: view(ProseView),
  statechart: view<Inputs["statechart"], LayoutOf<"statechart">>(StatechartView, { row: statechartRow }),
  erd: view<Inputs["erd"], LayoutOf<"erd">>(ErdView, { row: erdRow }),
}

// TS cannot correlate `block.view` with the row it picks.
const entryOf = (block: BlockData) => VIEWS[block.view] as Entry<ViewKind> | undefined

/** Draws one embedded block with its registered view, or nothing when its view has no row. */
export const drawBlock = (block: BlockData, shell: Shell): ReactNode => entryOf(block)?.draw(block, shell)
/** The block's folded row line, or undefined when its view has none. */
export const rowOf = (block: BlockData): RowLine | undefined => entryOf(block)?.row?.(block)
