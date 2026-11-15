import { useEffect, useRef } from "react"
import { XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ACTS } from "../../scripts/model.ts"
import { actEyebrow, COPY, KIND_LABEL } from "./copy.ts"
import { usePage, Subhead } from "./parts.tsx"
import type { Ref, RefInfo } from "./plan.ts"

const CHIP = "inline-flex h-5 shrink-0 cursor-pointer items-center rounded-md bg-secondary px-1.5 font-mono text-xs font-medium text-foreground ring-1 ring-foreground/10 hover:ring-foreground/30"

/** Everything one ref links to, grouped by act and kind. Not modal: there is no backdrop, and the page behind it stays live.
 *  Focus moves to its close button on open. Escape or Close hands focus back through `onClose`. */
export function LinkedPanel({ at, onClose, onRecenter }: { at: Ref; onClose: () => void; onRecenter: (ref: Ref) => void }) {
  const { data, refs, go } = usePage()
  const close = useRef<HTMLButtonElement>(null)
  const self = refs.get(at)
  const linked = (data.links[at] ?? []).flatMap((ref) => { const info = refs.get(ref); return info ? [info] : [] })

  useEffect(() => { close.current?.focus({ preventScroll: true }) }, [at])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("dialog:modal")) onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

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
    <aside role="dialog" aria-modal="false" aria-labelledby="linked-title" data-linked={at}
      className="fixed inset-x-0 bottom-0 z-40 flex max-h-[78dvh] flex-col rounded-t-4xl bg-card text-sm text-card-foreground shadow-2xl ring-1 ring-foreground/10 md:inset-x-auto md:top-3 md:right-3 md:bottom-3 md:max-h-none md:w-[27rem] md:rounded-4xl">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="min-w-0">
          <div className="text-xs text-muted-ink">{COPY.linked.title}</div>
          <h2 id="linked-title" className="flex min-w-0 items-center gap-2 font-heading text-base font-medium">
            <span className="font-mono text-sm">{at}</span><span className="truncate">{self?.label !== at ? self?.label : ""}</span>
          </h2>
        </div>
        <Button ref={close} variant="ghost" size="icon-sm" aria-label={COPY.linked.close} onClick={onClose}><XIcon /></Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {self?.home && <Button variant="outline" size="sm" className="mt-4" onClick={() => go(at)}>{COPY.linked.showIt}</Button>}
        {groups.length === 0 && <p className="mt-4 text-sm text-muted-ink">{COPY.linked.nothing}</p>}
        {groups.map((g) => <section key={g.key} className="mt-5"><Subhead>{g.head}</Subhead><ul className="flex flex-col gap-2">{g.rows.map(row)}</ul></section>)}
      </div>
    </aside>
  )
}
