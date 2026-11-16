import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ACTS } from "../../scripts/model.ts"
import { acceptanceProps, prCardProps, testDetailProps } from "./adapter.ts"
import { actEyebrow, COPY, KIND_LABEL } from "./copy.ts"
import { usePage, Subhead } from "./parts.tsx"
import type { Ref, RefInfo } from "./plan.ts"
import { PrCard } from "./views/prs.tsx"
import { AcceptanceDetail } from "./verify.tsx"
import { TestDetail } from "./views/trace.tsx"

const CHIP = "inline-flex h-5 shrink-0 cursor-pointer items-center rounded-md bg-secondary px-1.5 font-mono text-xs font-medium text-foreground ring-1 ring-foreground/10 hover:ring-foreground/30"
const closeOf = (popup: HTMLElement | null) => popup?.querySelector<HTMLElement>('[data-slot="sheet-close"]') ?? null

/** One ref in a drawer: the detail its kind's view draws for it (a pull request's card, a test's detail, an acceptance row), a requirement's
 *  text, then everything it links to, grouped by act and kind. Focus moves to the close button on open and on each
 *  re-centre. Escape, Close or a press outside hand focus back through `onClose`. `at` is null while closed. */
export function LinkedDrawer({ at, onClose, onRecenter }: { at: Ref | null; onClose: () => void; onRecenter: (ref: Ref) => void }) {
  const popup = useRef<HTMLDivElement>(null)
  const shownWhileClosing = useRef(at)
  if (at !== null) shownWhileClosing.current = at
  const ref = at ?? shownWhileClosing.current

  useEffect(() => { if (at !== null) closeOf(popup.current)?.focus({ preventScroll: true }) }, [at])

  return (
    <Sheet open={at !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent ref={popup} data-linked={ref ?? undefined} initialFocus={() => closeOf(popup.current) ?? true} finalFocus={false}
        className="gap-0 antialiased data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        {ref !== null && <LinkedBody key={ref} at={ref} onRecenter={onRecenter} />}
      </SheetContent>
    </Sheet>
  )
}

function LinkedBody({ at, onRecenter }: { at: Ref; onRecenter: (ref: Ref) => void }) {
  const { data, refs, go } = usePage()
  const self = refs.get(at)
  const linked = (data.links[at] ?? []).flatMap((r) => { const info = refs.get(r); return info ? [info] : [] })
  const requirement = self?.kind === "requirement" && !("none" in data.manifest.product) ? data.manifest.product.requirements.find((r) => r.id === at) : undefined
  const pr = self?.kind === "pr" ? prCardProps(data, at, go) : null
  const test = self?.kind === "test" ? testDetailProps(data, at) : null
  const acceptance = self?.kind === "acceptance" ? acceptanceProps(data, at) : null
  const groups = ACTS.flatMap((act) => {
    const inAct = linked.filter((l) => l.act === act)
    const kinds = [...new Set(inAct.map((l) => l.kind))]
    return kinds.map((kind) => ({ key: `${act}:${kind}`, head: `${actEyebrow(act)} · ${KIND_LABEL[kind]}`, rows: inAct.filter((l) => l.kind === kind) }))
  })
  const row = (l: RefInfo) => (
    <li key={l.ref} className="flex items-start gap-2 text-sm leading-5">
      <button type="button" className={CHIP} aria-label={COPY.linked.recenter(l.ref)} onClick={() => onRecenter(l.ref)}>{l.ref}</button>
      {l.home ? <button type="button" className="min-w-0 text-left text-link underline decoration-link/30 underline-offset-4 hover:decoration-link" onClick={() => go(l.ref)}>{l.label}</button>
        : <span className="min-w-0">{l.label}</span>}
    </li>
  )
  return (
    <>
      <SheetHeader className="gap-0 border-b px-5 py-3.5 pr-14">
        <div className="text-xs text-muted-ink">{COPY.linked.title}</div>
        <SheetTitle className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-sm">{at}</span><span className="truncate">{self?.label !== at ? self?.label : ""}</span>
        </SheetTitle>
        {requirement && <SheetDescription className="mt-1 leading-6">{requirement.text}</SheetDescription>}
      </SheetHeader>
      {/* Opaque, so a scrolling body rasters its text over the drawer's color, as the page does, not over transparency. */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-popover px-5 pb-5">
        {pr && <ul className="mt-4"><PrCard {...pr} /></ul>}
        {test && <div className="mt-4"><TestDetail {...test} /></div>}
        {acceptance && <AcceptanceDetail {...acceptance} />}
        {self?.home && <Button variant="outline" size="sm" className="mt-4" onClick={() => go(at)}>{COPY.linked.showIt}</Button>}
        {groups.length === 0 && <p className="mt-4 text-sm text-muted-ink">{COPY.linked.nothing}</p>}
        {groups.map((g) => <section key={g.key} className="mt-5"><Subhead>{g.head}</Subhead><ul className="flex flex-col gap-2">{g.rows.map(row)}</ul></section>)}
      </div>
    </>
  )
}
