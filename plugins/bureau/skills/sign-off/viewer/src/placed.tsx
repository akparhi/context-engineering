import { Fragment, useState, type MouseEvent } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { endpointProps, type PropsOf } from "./adapter.ts"
import { usePage } from "./parts.tsx"
import type { Ref } from "./plan.ts"
import type { VIEWS } from "./views.tsx"
import { EndpointsView } from "./views/endpoints.tsx"
import { PrsView } from "./views/prs.tsx"

/** The PR plan sub-step: the shared facts and the order diagram, and a pull request's card opens in the drawer from its node.
 *  yagni: `PrsView` may not change, so its trailing card list is hidden from outside and a node's press is taken before it reaches
 *  the node's own `go`. Split `PrsView` into facts, diagram and cards once view files may change. */
function PrPlan(props: PropsOf<"prs">) {
  const { openLinked } = usePage()
  const openCard = (e: MouseEvent<HTMLElement>) => {
    const node = (e.target as Element).closest<HTMLElement>("[data-pr]")
    if (!node?.dataset.pr) return
    e.stopPropagation()
    openLinked(node.dataset.pr, node)
  }
  return <div data-placed="prs" className="[&>ul:last-child]:hidden" onClickCapture={openCard}><PrsView {...props} /></div>
}

/** A path that wraps after a slash before it breaks inside a segment. */
const atSlashes = (path: string) => path.split("/").map((part, i) => <Fragment key={i}>{i > 0 && <>/<wbr /></>}{part}</Fragment>)

/** One tab per endpoint, each panel the original endpoints view narrowed to that endpoint. A link to an endpoint selects its tab
 *  in the same render, so `go` finds the card it scrolls to. Each `go` sets a new `focused`, so the same link followed twice selects
 *  its tab again, and a render no link caused keeps the tab picked by hand. */
function EndpointTabs(props: PropsOf<"endpoints">) {
  const { focused } = usePage()
  const ids = props.input.endpoints.map((e) => e.id)
  const named = (ref: Ref | null) => (ref !== null && ids.includes(ref) ? ref : null)
  const [tab, setTab] = useState(() => named(props.focus) ?? ids[0])
  const [seen, setSeen] = useState(focused)
  if (seen !== focused) {
    setSeen(focused)
    const to = named(props.focus)
    if (to) setTab(to)
  }
  if (ids.length < 2) return <EndpointsView {...props} />
  return (
    <Tabs orientation="vertical" value={tab} onValueChange={(v) => setTab(String(v))} className="items-start gap-5">
      <TabsList className="w-52 shrink-0">
        {props.input.endpoints.map((e) => (
          <TabsTrigger key={e.id} value={e.id} className="h-auto py-2 text-left font-mono text-xs leading-5 font-normal whitespace-normal [overflow-wrap:anywhere]">
            <span><span className="font-medium text-muted-ink">{e.method}</span> {atSlashes(e.path)}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {ids.map((id) => <TabsContent key={id} value={id} className="min-w-0"><EndpointsView {...endpointProps(props, id)} /></TabsContent>)}
    </Tabs>
  )
}

/** The kinds the step page places its own way around the original view. Every other kind draws as `VIEWS` does. */
export const PLACED: typeof VIEWS = { prs: PrPlan, endpoints: EndpointTabs }
