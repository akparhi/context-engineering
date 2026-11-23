import { useEffect, useRef, useState } from "react"
import { CheckIcon, CopyIcon, DownloadIcon, Undo2Icon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ACT_COPY, COPY } from "./copy.ts"
import { readerAtSubmit, saveShown } from "./changed.ts"
import { usePage } from "./parts.tsx"
import { actOf, type PageData } from "./plan.ts"
import { buildReviewText, resultOf, tally } from "./review.ts"
import type { Act } from "../../scripts/model.ts"
import type { SubmitView } from "../../scripts/manifest.ts"

/** What the server recorded: the items whose verdicts count now, the ones that changed since this page was built, and how many
 *  events were new to the log. */
type Outcome = { current: string[]; stale: string[]; appended: number }

const isIds = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string")

/** The server's `{ reviews: [{ current, stale, appended }] }` summed over its reviews, or null when the body is not that shape. */
function outcomeOf(body: unknown): Outcome | null {
  if (!body || typeof body !== "object" || !("reviews" in body) || !Array.isArray(body.reviews)) return null
  const reviews: unknown[] = body.reviews
  const out: Outcome = { current: [], stale: [], appended: 0 }
  for (const r of reviews) {
    if (!r || typeof r !== "object" || !("current" in r) || !("stale" in r) || !("appended" in r)) return null
    if (!isIds(r.current) || !isIds(r.stale) || typeof r.appended !== "number") return null
    out.current.push(...r.current)
    out.stale.push(...r.stale)
    out.appended += r.appended
  }
  return out
}

/** Posts to the server that served this page, with the nonce it put in the page. The outcome only once the server has recorded the
 *  review; null on any other page or any failure, so Submit falls to Copy and Download. */
async function sendToAgent(text: string): Promise<Outcome | null> {
  const nonce = document.querySelector<HTMLMetaElement>('meta[name="sign-off-nonce"]')?.content
  if (!nonce || location.protocol !== "http:") return null
  try {
    const res = await fetch("/review", {
      method: "POST", body: text, signal: AbortSignal.timeout(15_000),
      headers: { "content-type": "text/plain; charset=utf-8", "x-sign-off-nonce": nonce },
    })
    return res.ok ? outcomeOf(await res.json()) : null
  } catch {
    return null
  }
}

export function saveAs(name: string, text: string, type: string) {
  const a = document.createElement("a")
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(a.href)
}

/** The page draws every part, so the record's view is always full with nothing left unopened. The record keeps its schema, so
 *  older logs and readers still parse it. */
const VIEW: SubmitView = { mode: "full", unopened: [], count: 0 }

type Stage = { kind: "confirm" } | { kind: "sending" } | { kind: "text"; text: string } | { kind: "sent"; outcome: Outcome }

/** A native modal: `showModal` keeps focus inside, makes the page inert and closes on Escape. `onClose` runs however it closes. */
export function SubmitDialog({ acts, onClose }: { acts: Act[]; onClose: () => void }) {
  const { data, review } = usePage()
  const ref = useRef<HTMLDialogElement>(null)
  const [stage, setStage] = useState<Stage>({ kind: "confirm" })
  const [said, setSaid] = useState("")
  const m = data.manifest, revision = m.revision ?? ""
  const all = tally(review, m.items), result = resultOf(all)

  useEffect(() => { ref.current?.showModal() }, [])

  const submit = async () => {
    const by = readerAtSubmit()
    saveShown(m.id, data.revs.items)
    const text = buildReviewText(review, data, by, new Date().toISOString(), VIEW)
    setStage({ kind: "sending" })
    const outcome = await sendToAgent(text)
    setStage(outcome ? { kind: "sent", outcome } : { kind: "text", text })
  }
  const copy = (text: string) =>
    (navigator.clipboard?.writeText(text) ?? Promise.reject()).then(() => setSaid(COPY.submit.copied), () => setSaid(COPY.submit.noClipboard))

  const title = stage.kind === "text" ? COPY.submit.readyTitle : stage.kind === "sent" ? COPY.submit.sentTitle : COPY.submit.title
  return (
    <dialog ref={ref} aria-labelledby="dialog-title" onClose={onClose} onClick={(e) => { if (e.target === e.currentTarget) ref.current?.close() }}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-y-auto border-0 bg-transparent px-3 py-14 text-foreground backdrop:bg-zinc-950/45">
      <div className="mx-auto h-fit w-full max-w-2xl rounded-4xl bg-card text-sm text-card-foreground shadow-2xl ring-1 ring-foreground/10">
        <div className="border-b px-5 py-4 sm:px-6">
          <h2 id="dialog-title" className="font-heading text-lg font-medium">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{COPY.submit.sub(revision)}</p>
        </div>
        <div className="px-5 py-5 sm:px-6">
          <Covers data={data} acts={acts} />
          <div className="mt-4 flex flex-wrap items-start gap-2.5">
            {result === "approved" ? <Badge variant="pass"><CheckIcon />{COPY.submit.result.approved}</Badge>
              : result === "partial" ? <Badge variant="ask">{COPY.submit.result.partial}</Badge>
              : <Badge variant="revise"><Undo2Icon />{COPY.submit.result.changes}</Badge>}
            <p className="min-w-0 flex-1 basis-64 leading-6">{COPY.submit.says[result]}{all.waiting ? ` ${COPY.submit.stillOpen(all.waiting)}` : ""}</p>
          </div>
          {stage.kind === "text" && (
            <div className="mt-5">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-xs font-medium tracking-wide text-muted-ink uppercase">{COPY.submit.yourReview}</h3>
                <span className="text-xs text-muted-ink">{COPY.submit.chars(stage.text.length)}</span>
              </div>
              <pre id="review-text" tabIndex={0} className="overflow-x-auto rounded-2xl bg-muted/60 px-4 py-3 font-mono text-xs leading-5 break-all whitespace-pre-wrap dark:bg-muted/40">{stage.text}</pre>
              <p className="mt-2 text-xs leading-5 text-muted-ink">{COPY.submit.howToSend}</p>
            </div>
          )}
          {stage.kind === "sent" && <Sent outcome={stage.outcome} />}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-3.5 sm:px-6">
          {stage.kind === "text" ? (
            <>
              <span className="mr-auto text-xs text-muted-ink" role="status">{said}</span>
              <Button variant="outline" size="sm" onClick={() => saveAs(`${m.id}-${revision}-review.txt`, stage.text, "text/plain")}><DownloadIcon />{COPY.submit.download}</Button>
              <Button variant="outline" size="sm" autoFocus onClick={() => void copy(stage.text)}><CopyIcon />{COPY.submit.copy}</Button>
              <Button variant="ghost" size="sm" onClick={() => ref.current?.close()}>{COPY.submit.close}</Button>
            </>
          ) : stage.kind === "sent" ? (
            <Button variant="ghost" size="sm" autoFocus onClick={() => ref.current?.close()}>{COPY.submit.close}</Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => ref.current?.close()}>{COPY.submit.keep}</Button>
              <Button size="sm" autoFocus disabled={stage.kind === "sending"} onClick={() => void submit()}>{stage.kind === "sending" ? COPY.submit.sending : COPY.submit.go}</Button>
            </>
          )}
        </div>
      </div>
    </dialog>
  )
}

function Sent({ outcome }: { outcome: Outcome }) {
  const { data } = usePage()
  const c = COPY.submit
  const title = (id: string) => data.manifest.items.find((it) => it.id === id)?.title ?? id
  const list = (ids: string[], part: string) => (
    <ul className="mt-1.5 flex flex-wrap gap-1.5" data-part={part}>
      {ids.map((id) => <li key={id} data-id={id} className="rounded-xl bg-muted px-2 py-0.5 text-xs leading-5">{title(id)}</li>)}
    </ul>
  )
  return (
    <div className="mt-5 flex flex-col gap-4 leading-6" data-part="outcome">
      <p>{outcome.appended ? c.sent : c.already}</p>
      {outcome.current.length > 0 && <section><h3 className="text-xs font-medium text-pass-ink">{c.recorded} ({outcome.current.length})</h3>{list(outcome.current, "current")}</section>}
      {outcome.stale.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-revise-ink">{c.stale} ({outcome.stale.length})</h3>
          {list(outcome.stale, "stale")}
          <p className="mt-1.5 text-xs leading-5 text-muted-ink">{c.staleWhy}</p>
        </section>
      )}
    </div>
  )
}

function Covers({ data, acts }: { data: PageData; acts: Act[] }) {
  const { review } = usePage()
  const c = COPY.submit.covers
  const cell = (n: number, tone: string) => <td className={`px-3 py-2 text-right tabular-nums ${n ? tone : "text-muted-ink"}`}>{n}</td>
  return (
    <div className="overflow-x-auto rounded-2xl ring-1 ring-foreground/10">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-ink dark:bg-muted/30">
          <tr><th scope="col" className="px-3 py-2 text-left font-medium">{c.act}</th>{[c.approved, c.sentBack, c.answered, c.open].map((h) => <th key={h} scope="col" className="px-3 py-2 text-right font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {acts.map((a) => {
            const t = tally(review, data.manifest.items.filter((it) => actOf(it) === a))
            return (
              <tr key={a} data-act={a}>
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <span className="inline-flex items-center gap-2"><span className="grid size-5 place-items-center rounded-full bg-act-paper-strong text-xs font-medium">{ACT_COPY[a].n}</span>{ACT_COPY[a].name}</span>
                </th>
                {cell(t.approved.length, "text-pass-ink")}{cell(t.back.length, "text-revise-ink")}{cell(t.answered.length, "text-pass-ink")}{cell(t.waiting, "text-ask-ink")}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
