import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { ArrowRightIcon, ChevronDownIcon, ChevronLeftIcon, KeyRoundIcon, LinkIcon, TableIcon, XIcon } from "lucide-react"
import type { ErdColumn, ErdDrawing, ErdLayout, ErdRelation, ErdTable } from "../../../scripts/layout/erd.ts"
import type { Mark } from "../../../scripts/model.ts"
import type { ErdInput } from "../../../scripts/views.ts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { COPY } from "../copy.ts"
import { Fold, IdChip, LooseEnd, Subhead } from "../parts.tsx"
import type { Ref } from "../plan.ts"
import type { RowLine, ViewProps } from "../views.tsx"

const e = COPY.erd
const ROW = 26, HEAD = 40

type Pick = { table: string | null; col: string | null }
type PickFn = (table: string | null, col?: string | null) => void
type Box = ErdDrawing["tables"][number]
type Point = ErdDrawing["relations"][number]["points"][number]

const MARK_TAG: Record<Mark, ReactNode> = {
  new: <Badge variant="delta">New</Badge>,
  changed: <Badge variant="deltaline">Changed</Badge>,
  reused: <Badge variant="dashed">Reused</Badge>,
}

function pickOf(ref: Ref | null): Pick | null {
  const m = ref?.match(/^db:([^.]+)(?:\.(.+))?$/)
  return m ? { table: m[1], col: m[2] ?? null } : null
}

const touches = (r: ErdRelation, p: Pick) =>
  p.col ? (r.from === p.table && r.fromCol === p.col) || (r.to === p.table && r.toCol === p.col) : r.from === p.table || r.to === p.table

function roundedPath(points: Point[], r: number) {
  if (points.length < 3) return `M${points.map((p) => `${p.x},${p.y}`).join(" L")}`
  let d = `M${points[0].x},${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i - 1], c = points[i], n = points[i + 1]
    const l1 = Math.hypot(c.x - p.x, c.y - p.y), l2 = Math.hypot(n.x - c.x, n.y - c.y), k = Math.min(r, l1 / 2, l2 / 2)
    d += ` L${c.x - ((c.x - p.x) / l1) * k},${c.y - ((c.y - p.y) / l1) * k} Q${c.x},${c.y} ${c.x + ((n.x - c.x) / l2) * k},${c.y + ((n.y - c.y) / l2) * k}`
  }
  const last = points.at(-1)!
  return `${d} L${last.x},${last.y}`
}

function Relation({ r, points, lit, dim, strong }: { r: ErdRelation; points: Point[]; lit: boolean; dim: boolean; strong: boolean }) {
  if (points.length < 2) return null
  const a = points[0], b = points.at(-1)!
  const da = Math.sign(points[1].x - a.x) || 1, db = Math.sign(points.at(-2)!.x - b.x) || -1
  const bars = (p: Point, d: number) => `M${p.x + d * 7},${p.y - 6}v12M${p.x + d * 12},${p.y - 6}v12`
  const foot = `M${a.x + da * 12},${a.y}L${a.x},${a.y - 6}M${a.x + da * 12},${a.y}L${a.x},${a.y + 6}${r.optional ? "" : `M${a.x + da * 16},${a.y - 6}v12`}`
  const stroke = lit ? "stroke-focus" : strong ? "stroke-muted-foreground/85" : "stroke-muted-foreground/55"
  return (
    <g data-relation={r.id} className={`fill-none ${stroke} ${dim ? "opacity-40" : ""} motion-safe:transition-opacity`} strokeWidth={lit ? 2 : 1.25}>
      <path d={roundedPath(points, 6)} strokeDasharray={r.kind === "loose" ? "5 4" : undefined} />
      {r.kind !== "loose" && <path d={`${r.kind === "one" ? bars(a, da) : foot} ${bars(b, db)}`} />}
      {r.kind === "many" && r.optional && <circle cx={a.x + da * 19.5} cy={a.y} r={3.5} className="fill-card" />}
    </g>
  )
}

const ROW_BTN = "flex w-full items-center justify-between gap-4 px-3 text-left font-mono text-xs outline-none hover:bg-muted focus-visible:bg-muted focus-visible:shadow-[inset_0_0_0_2px_var(--color-focus)]"

const fkOf = (layout: ErdLayout, t: ErdTable) => new Set(layout.relations.filter((r) => r.from === t.name).map((r) => r.fromCol))
const markedCol = (t: ErdTable, c: ErdColumn) => c.mark && t.mark !== "new"
const MARKED_TINT = "bg-delta-soft/70 shadow-[inset_2px_0_0_var(--color-delta-solid)]"

function ColumnLabel({ t, c, fk }: { t: ErdTable; c: ErdColumn; fk: boolean }) {
  return (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        {c.pk ? <KeyRoundIcon aria-hidden className="size-3 shrink-0 text-muted-foreground" /> : fk ? <LinkIcon aria-hidden className="size-3 shrink-0 text-muted-foreground" /> : <span className="w-3 shrink-0" />}
        <span className={`truncate ${c.pk ? "font-medium" : ""}`}>{c.name}</span>
        {markedCol(t, c) && <span className="sr-only">, {e.changedCol(c.mark!)}</span>}
      </span>
      <span className="shrink-0 text-muted-foreground">{c.short}</span>
    </>
  )
}

function ColumnRow({ t, c, fk, picked, onPick }: { t: ErdTable; c: ErdColumn; fk: boolean; picked: boolean; onPick: PickFn }) {
  const tint = picked ? "bg-focus/12 shadow-[inset_2px_0_0_var(--color-focus)]" : markedCol(t, c) ? MARKED_TINT : ""
  return (
    <button type="button" data-ref={`db:${t.name}.${c.name}`} aria-pressed={picked} onClick={() => onPick(t.name, c.name)} className={`${ROW_BTN} ${tint}`} style={{ height: ROW }}>
      <ColumnLabel t={t} c={c} fk={fk} />
    </button>
  )
}

/** The folded diagram: each New or Changed table with every column, since the new stored shape is what the item gates, then one line
 *  that names the reused tables. A column opens the diagram on it. */
function FreshTables({ layout, go }: { layout: ErdLayout; go: (ref: Ref) => void }) {
  const fresh = layout.tables.filter((t) => t.mark !== "reused")
  return (
    <>
      <div className="mb-2 grid basis-full items-start gap-3 @2xl/erd:grid-cols-2" data-part="fresh-tables">
        {fresh.map((t) => {
          const fk = fkOf(layout, t)
          return (
            <div key={t.name} className="overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-delta-line">
              <div className={`flex items-center justify-between gap-3 border-b border-delta-line px-3 ${t.mark === "new" ? "bg-delta-soft" : "bg-delta-soft/50"}`} style={{ height: HEAD }}>
                <span className="truncate font-mono text-[13px] font-semibold">{t.name}</span>{MARK_TAG[t.mark]}
              </div>
              {t.columns.map((c) => (
                <button key={c.name} type="button" onClick={() => go(`db:${t.name}.${c.name}`)} className={`${ROW_BTN} ${markedCol(t, c) ? MARKED_TINT : ""}`} style={{ height: ROW }}>
                  <ColumnLabel t={t} c={c} fk={fk.has(c.name)} />
                </button>
              ))}
            </div>
          )
        })}
      </div>
      <span className="text-sm">{e.joins(layout.tables.filter((t) => t.mark === "reused").map((t) => t.name))}</span>
    </>
  )
}

function TableBox({ t, box, fk, pick, open, onPick, onFold }: {
  t: ErdTable; box: Box; fk: Set<string>; pick: Pick; open: boolean; onPick: PickFn; onFold: () => void
}) {
  const on = pick.table === t.name, fresh = t.mark !== "reused"
  const cols = box.rows.map((n) => t.columns.find((c) => c.name === n)!)
  const ring = on ? "ring-2 ring-focus" : fresh ? "ring-1 ring-delta-line" : "ring-1 ring-foreground/15"
  return (
    <div data-table={t.name} className={`absolute overflow-hidden rounded-xl bg-card shadow-xs ${ring}`} style={{ left: box.x, top: box.y, width: box.width, height: box.height }}>
      <button type="button" data-ref={`db:${t.name}`} aria-pressed={on && !pick.col} onClick={() => onPick(t.name)}
        className={`flex w-full items-center justify-between gap-3 border-b px-3 text-left outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-focus)] ${fresh ? `border-delta-line ${t.mark === "new" ? "bg-delta-soft" : "bg-delta-soft/50"}` : "border-border bg-muted/70"}`}
        style={{ height: HEAD }}>
        <span className="truncate font-mono text-[13px] font-semibold">{t.name}</span>{MARK_TAG[t.mark]}
      </button>
      {cols.map((c) => <ColumnRow key={c.name} t={t} c={c} fk={fk.has(c.name)} picked={on && pick.col === c.name} onPick={onPick} />)}
      {box.toggle && (
        <button type="button" aria-expanded={open} onClick={onFold} style={{ height: ROW }}
          className="flex w-full items-center gap-1.5 px-3 text-left text-xs text-muted-ink outline-none hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:shadow-[inset_0_0_0_2px_var(--color-focus)]">
          <ChevronDownIcon aria-hidden className={`size-3.5 motion-safe:transition-transform ${open ? "rotate-180" : ""}`} />
          {open ? e.fewer : e.more(t.columns.length - box.rows.length)}
        </button>
      )}
    </div>
  )
}

function Diagram({ layout, drawing, pick, open, onPick, onFold }: {
  layout: ErdLayout; drawing: ErdDrawing; pick: Pick; open: boolean; onPick: PickFn; onFold: () => void
}) {
  const pan = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState(false)
  useLayoutEffect(() => {
    const el = pan.current
    if (!el) return
    const check = () => setWide(el.scrollWidth > el.clientWidth + 1)
    check()
    const watch = new ResizeObserver(check)
    watch.observe(el)
    return () => watch.disconnect()
  }, [drawing])
  useEffect(() => {
    const el = pan.current, box = drawing.tables.find((b) => b.name === pick.table)
    if (el && box && (box.x < el.scrollLeft || box.x + box.width > el.scrollLeft + el.clientWidth)) el.scrollLeft = box.x - 20
  }, [pick.table, drawing])

  const tables = new Map(layout.tables.map((t) => [t.name, t]))
  const rels = new Map(layout.relations.map((r) => [r.id, r]))
  const anyLit = pick.table !== null && layout.relations.some((r) => touches(r, pick))
  const isLit = (r: ErdRelation) => anyLit && touches(r, pick)
  const order = drawing.relations.flatMap((d) => { const r = rels.get(d.id); return r ? [{ r, points: d.points }] : [] })
    .sort((x, y) => Number(isLit(x.r)) - Number(isLit(y.r)))
  return (
    <>
      <div ref={pan} role="region" aria-label={e.diagram(drawing.tables.length)} tabIndex={0} data-part="diagram"
        className="overflow-x-auto overscroll-x-contain rounded-2xl bg-muted/50 ring-1 ring-foreground/10 outline-none focus-visible:ring-2 focus-visible:ring-focus dark:bg-muted/30">
        <div className="relative" style={{ width: drawing.width, height: drawing.height }}>
          <svg aria-hidden className="absolute inset-0 overflow-visible" width={drawing.width} height={drawing.height}>
            {order.map(({ r, points }) => (
              <Relation key={r.id} r={r} points={points} lit={isLit(r)} dim={anyLit && !isLit(r)}
                strong={tables.get(r.from)?.mark !== "reused" || tables.get(r.to)?.mark !== "reused"} />
            ))}
          </svg>
          {drawing.tables.map((box) => {
            const t = tables.get(box.name)
            if (!t) return null
            return <TableBox key={box.name} t={t} box={box} fk={fkOf(layout, t)} pick={pick} open={open} onPick={onPick} onFold={onFold} />
          })}
        </div>
      </div>
      {wide && <p className="mt-2 text-xs text-muted-ink">{e.pan}</p>}
    </>
  )
}

const Glyph = ({ d, dash }: { d: string; dash?: string }) => (
  <svg width={28} height={12} aria-hidden className="shrink-0 fill-none stroke-muted-foreground" strokeWidth={1.25}><path d={d} strokeDasharray={dash} /></svg>
)
function ErdLegend({ layout }: { layout: ErdLayout }) {
  const has = (k: ErdRelation["kind"]) => layout.relations.some((r) => r.kind === k)
  const marks = new Set(layout.tables.flatMap((t) => [t.mark, ...t.columns.flatMap((c) => (c.mark ? [c.mark] : []))]))
  const item = (mark: ReactNode, text: string) => <span className="inline-flex items-center gap-1.5">{mark}{text}</span>
  const l = e.legend
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-ink" data-part="legend">
      {marks.has("new") && item(MARK_TAG.new, l.new)}
      {marks.has("changed") && item(MARK_TAG.changed, l.changed)}
      {marks.has("reused") && item(MARK_TAG.reused, l.reused)}
      {has("many") && item(<Glyph d="M0 6h28M10 6L1 1M10 6L1 11M14 1v10M20 1v10M24 1v10" />, l.many)}
      {has("one") && item(<Glyph d="M0 6h28M4 1v10M8 1v10M20 1v10M24 1v10" />, l.one)}
      {has("loose") && item(<Glyph d="M0 6h28" dash="4 3" />, l.loose)}
      {layout.tables.some((t) => t.columns.some((c) => c.short.endsWith("?"))) && item(<span className="font-mono text-foreground">?</span>, l.empty)}
    </div>
  )
}

const PICK = "rounded-md font-mono text-[13px] outline-none hover:text-link focus-visible:ring-2 focus-visible:ring-focus"
const PickButton = ({ table, col, onPick, className = "" }: { table: string; col: string | null; onPick: PickFn; className?: string }) => (
  <button type="button" className={`${PICK} ${className}`} onClick={() => onPick(table, col)}>{col ? `${table}.${col}` : table}</button>
)
const Chips = ({ ids }: { ids: readonly string[] }) => <>{ids.map((r) => <IdChip key={r} id={r} />)}</>
const Mono = ({ children }: { children: ReactNode }) => <span className="font-mono text-xs [overflow-wrap:anywhere]">{children}</span>
const CheckList = ({ checks }: { checks: string[] }) => (
  <ul className="flex flex-col gap-1.5">{checks.map((c) => <li key={c} className="font-mono text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">{c.replace(/^CHECK\s+/, "")}</li>)}</ul>
)

function UnusedValues({ input, layout, onPick }: { input: ErdInput; layout: ErdLayout; onPick: PickFn }) {
  const rows = (input.unused ?? []).flatMap((u) => {
    const [en, value] = u.value.split(".")
    const t = layout.tables.find((x) => x.columns.some((c) => c.type === en))
    const c = t?.columns.find((x) => x.type === en)
    return t && c ? [{ ...u, value, t: t.name, c: c.name }] : []
  })
  if (!rows.length) return null
  return (
    <ul className="mt-3 flex flex-col gap-1.5" data-part="unused">
      {rows.map((u) => (
        <li key={`${u.t}.${u.value}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-6">
          <LooseEnd>{e.unusedValue}</LooseEnd>
          <span>{e.theValue} <span className="font-mono text-[13px]">{u.value}</span> {e.of} <PickButton table={u.t} col={u.c} onPick={onPick} className="underline decoration-foreground/20 underline-offset-4" />. {u.why}</span>
        </li>
      ))}
    </ul>
  )
}

const relWord = (r: ErdRelation) => e.relWord[r.kind]

function TableDetail({ t, input, layout, onPick }: { t: ErdTable; input: ErdInput; layout: ErdLayout; onPick: PickFn }) {
  const meta = input.tables?.find((m) => m.name === t.name)
  const mine = layout.relations.filter((r) => r.from === t.name || r.to === t.name)
  const indexMeta = new Map((input.indexes ?? []).map((ix) => [ix.name, ix]))
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 pr-9">
        <TableIcon aria-hidden className="size-4 text-muted-foreground" />
        <span className="font-mono text-[13px] font-medium">{t.name}</span>{MARK_TAG[t.mark]}
      </div>
      {meta?.role && <p className="mt-2 text-sm leading-6">{meta.role}</p>}
      {meta?.serves?.length ? <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{e.serves} <Chips ids={meta.serves} /></div> : null}
      {!meta && t.mark === "reused" && <p className="mt-2 text-sm leading-6 text-muted-foreground">{e.reusedTable(t.columns.length)}</p>}
      {t.note && <p className="mt-2 text-[13px] leading-5 text-muted-foreground">{t.note}</p>}
      {t.indexes.length > 0 && (
        <div className="mt-4">
          <Subhead>{e.indexes}</Subhead>
          <ul className="flex flex-col gap-2">
            {t.indexes.map((ix, i) => {
              const m = ix.name ? indexMeta.get(ix.name) : undefined
              return (
                <li key={ix.name ?? i} className="text-[13px] leading-5">
                  <span className="flex flex-wrap items-center gap-1.5"><span className="font-mono">({ix.columns.join(", ")})</span>{ix.unique && <Badge variant="secondary">{e.unique}</Badge>}{m?.serves && <Chips ids={m.serves} />}</span>
                  {ix.where && <span className="block font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">WHERE {ix.where}</span>}
                  {ix.note && <span className="block text-xs text-muted-foreground">{ix.note}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {t.checks.length > 0 && <div className="mt-4"><Subhead>{e.checks}</Subhead><CheckList checks={t.checks} /></div>}
      <div className="mt-4">
        <Subhead>{e.relations}</Subhead>
        <ul className="flex flex-col gap-2">
          {mine.length ? mine.map((r) => (
            <li key={r.id} className="text-[13px] leading-5">
              <PickButton table={r.from} col={r.fromCol} onPick={onPick} /> <ArrowRightIcon aria-hidden className="inline size-3 text-muted-foreground" /> <PickButton table={r.to} col={r.toCol} onPick={onPick} />
              <span className="block text-xs text-muted-foreground">{relWord(r)}</span>
            </li>
          )) : <li className="text-xs text-muted-foreground">{e.none}</li>}
        </ul>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{e.pickColumn}</p>
    </>
  )
}

const Fact = ({ k, children }: { k: string; children: ReactNode }) => (
  <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 py-1.5 text-[13px] leading-5"><span className="text-muted-foreground">{k}</span><span className="min-w-0">{children}</span></div>
)

/** A writer's step words, linked to the chart state the step leads into when the plan's chart draws that step. */
function Steps({ words, input, go }: { words: string[]; input: ErdInput; go: (ref: Ref) => void }) {
  return words.map((w, i) => {
    const ref = input.steps[w]
    return (
      <span key={w}>
        {i > 0 && ", "}
        {ref ? <button type="button" onClick={() => go(ref)} className={STEP_LINK}>{w}</button> : w}
      </span>
    )
  })
}
const STEP_LINK = "rounded-sm text-left text-link underline decoration-link/30 underline-offset-4 outline-none hover:decoration-link focus-visible:ring-2 focus-visible:ring-focus"

function ColumnDetail({ t, col, input, layout, onPick, go }: { t: ErdTable; col: ErdColumn; input: ErdInput; layout: ErdLayout; onPick: PickFn; go: (ref: Ref) => void }) {
  const key = `${t.name}.${col.name}`
  const meta = input.tables?.find((m) => m.name === t.name)
  const writerOf = (c: string) => input.writers?.find((w) => w.column === c)?.states
  const writers = writerOf(key) ?? (t.mark !== "reused" ? writerOf(`${t.name}.*`) ?? [] : null)
  const serves = input.columns?.find((c) => c.column === key)?.serves
  const en = layout.enums.find((x) => x.name === col.type)
  const unused = new Map((input.unused ?? []).map((u) => [u.value, u.why]))
  const checks = t.checks.filter((c) => new RegExp(`\\b${col.name}\\b`).test(c))
  const idx = t.indexes.filter((ix) => ix.columns.includes(col.name))
  const rel = layout.relations.filter((r) => (r.from === t.name && r.fromCol === col.name) || (r.to === t.name && r.toCol === col.name))
  const f = e.fact
  return (
    <>
      <button type="button" onClick={() => onPick(t.name)} className="inline-flex items-center gap-1 rounded-md font-mono text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus">
        <ChevronLeftIcon aria-hidden className="size-3.5" />{t.name}
      </button>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 pr-9">
        <span className="font-mono text-sm font-medium">{col.name}</span>
        {col.pk && <Badge variant="secondary"><KeyRoundIcon />{e.pk}</Badge>}
        {col.mark && t.mark !== "new" && MARK_TAG[col.mark]}
      </div>
      <div className="mt-2 divide-y divide-border/60">
        <Fact k={f.type}><Mono>{col.type}</Mono></Fact>
        <Fact k={f.empty}>{e.empty[col.empty]}</Fact>
        {col.default && <Fact k={f.default}><Mono>{col.default}</Mono></Fact>}
        {col.note && <Fact k={f.note}>{col.note}</Fact>}
        {rel.length > 0 && (
          <Fact k={f.relation}>
            {rel.map((r) => {
              const [ot, oc] = r.from === t.name && r.fromCol === col.name ? [r.to, r.toCol] : [r.from, r.fromCol]
              return <span key={r.id} className="block"><PickButton table={ot} col={oc} onPick={onPick} className="text-xs" /> <span className="text-xs text-muted-foreground">{relWord(r)}</span></span>
            })}
          </Fact>
        )}
        {idx.length > 0 && <Fact k={f.indexed}>{idx.map((ix, i) => <span key={ix.name ?? i} className="block"><Mono>({ix.columns.join(", ")})</Mono>{ix.unique && ` ${e.unique}`}</span>)}</Fact>}
        <Fact k={f.writtenBy}>
          {writers === null ? <span className="text-muted-foreground">{e.otherServices}</span> : writers.length ? <Steps words={writers} input={input} go={go} /> : e.writtenOnce}
        </Fact>
        <Fact k={f.serves}>
          {serves ? <span className="flex flex-wrap gap-1.5"><Chips ids={serves} /></span>
            : meta?.serves ? <><span className="flex flex-wrap gap-1.5"><Chips ids={meta.serves} /></span><span className="mt-1 block text-xs text-muted-foreground">{e.throughTable}</span></>
            : <span className="text-muted-foreground">{e.readAsInput}</span>}
        </Fact>
      </div>
      {en && (
        <div className="mt-3">
          <Subhead>{e.values}</Subhead>
          <ul className="flex flex-col gap-2">
            {en.values.map((v) => {
              const why = unused.get(`${en.name}.${v.name}`)
              return (
                <li key={v.name} className="text-[13px] leading-5">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-mono">{v.name}</span>{why && <LooseEnd>{e.unusedValue}</LooseEnd>}</div>
                  {why && <span className="block text-xs text-muted-foreground">{why}</span>}
                  {v.note && <span className="block text-xs text-muted-foreground">{v.note.charAt(0).toUpperCase()}{v.note.slice(1)}.</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {checks.length > 0 && <div className="mt-3"><Subhead>{e.checks}</Subhead><CheckList checks={checks} /></div>}
    </>
  )
}

function Tabs({ tab, onTab }: { tab: "diagram" | "source"; onTab: (tab: "diagram" | "source") => void }) {
  return (
    <div className="mt-5 inline-flex rounded-4xl bg-muted p-1" role="group" aria-label={e.tabs}>
      {(["diagram", "source"] as const).map((k) => (
        <button key={k} type="button" aria-pressed={tab === k} onClick={() => onTab(k)}
          className="h-8 rounded-4xl px-3 text-sm font-medium text-muted-ink outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-xs">
          {e.tab[k]}
        </button>
      ))}
    </div>
  )
}

/** The files the drawing comes from, as written: the DDL when the block has it, else the DBML, then the baseline it applies to. */
function ErdSource({ input, sources }: { input: ErdInput; sources: Record<string, string> }) {
  const files = [input.sql ?? input.src, ...(input.base ? [input.base] : [])]
  return (
    <div className="mt-3 flex flex-col gap-4" data-part="source">
      {files.map((f) => (
        <figure key={f}>
          <figcaption className="font-mono text-xs text-muted-ink [overflow-wrap:anywhere]">{f === input.base ? e.baseOf(f) : f}</figcaption>
          <pre className="mt-2 max-h-[32rem] overflow-auto rounded-2xl bg-muted/60 px-4 py-3 font-mono text-[13px] leading-6 dark:bg-muted/40">{sources[f] ?? ""}</pre>
        </figure>
      ))}
    </div>
  )
}

/** The schema this plan touches, laid out by `build`: New and Changed tables and columns against base, crow's-foot relations,
 *  and a detail panel for the picked table or column. Folding is one switch for every reused table. */
export function ErdView({ layout, ...props }: ViewProps<ErdInput, ErdLayout>) {
  return layout ? <Erd layout={layout} {...props} /> : null
}

function Erd({ input, layout, sources, focus, go }: Omit<ViewProps<ErdInput>, "layout"> & { layout: ErdLayout }) {
  const [pick, setPick] = useState<Pick>({ table: null, col: null })
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"diagram" | "source">("diagram")
  const [seen, setSeen] = useState<Ref | null>(null)
  const diagram = useRef<HTMLDivElement>(null), aside = useRef<HTMLElement>(null)
  const drawing = layout.drawings[open ? "open" : "folded"]

  const shown = (table: string, col: string) => layout.drawings.folded.tables.find((b) => b.name === table)?.rows.includes(col) ?? true
  const choose = (p: Pick) => {
    if (p.table && p.col && !shown(p.table, p.col)) setOpen(true)
    setPick(p)
  }
  // Applied while rendering, not in an effect, so a hidden column's row is in the DOM when the shell scrolls to it.
  if (focus !== seen) {
    setSeen(focus)
    const p = pickOf(focus)
    if (p && layout.tables.some((t) => t.name === p.table)) { choose(p); setTab("diagram") }
  }

  const onPick: PickFn = (table, col = null) => {
    choose({ table, col })
    requestAnimationFrame(() => {
      if (table && aside.current && diagram.current && aside.current.offsetTop > diagram.current.offsetTop + 8) aside.current.scrollIntoView({ block: "nearest" })
    })
  }
  const onFold = () => {
    if (open && pick.table && pick.col && !shown(pick.table, pick.col)) setPick({ ...pick, col: null })
    setOpen(!open)
  }
  const t = pick.table ? layout.tables.find((x) => x.name === pick.table) : undefined
  const col = t && pick.col ? t.columns.find((c) => c.name === pick.col) : undefined

  return (
    <div className="@container/erd">
      {input.says && (
        <div className="flex max-w-[72ch] flex-col gap-2 text-[15px] leading-7" data-part="says">
          {input.says.split(/\n\s*\n/).map((para) => <p key={para}>{para}</p>)}
        </div>
      )}
      <UnusedValues input={input} layout={layout} onPick={(table, c) => go(`db:${table}${c ? `.${c}` : ""}`)} />
      <Tabs tab={tab} onTab={setTab} />
      {tab === "source" ? <ErdSource input={input} sources={sources} /> : (
      <Fold part="diagram" keep={layout.tables.every((x) => x.mark !== "reused")} summary={<FreshTables layout={layout} go={go} />} className="mt-3">
      <div className={`grid gap-5 ${t ? "@4xl/erd:grid-cols-[minmax(0,1fr)_19rem]" : ""}`}>
        <div ref={diagram} className="min-w-0">
          <Diagram layout={layout} drawing={drawing} pick={pick} open={open} onPick={onPick} onFold={onFold} />
          <div className="mt-3"><ErdLegend layout={layout} /></div>
        </div>
        {t && (
          <aside ref={aside} className="relative min-w-0 self-start rounded-2xl p-4 ring-1 ring-foreground/10" data-part="inspector" aria-label={col ? `${t.name}.${col.name}` : t.name}>
            <Button variant="ghost" size="icon-sm" className="absolute top-2 right-2" aria-label={e.close} onClick={() => setPick({ table: null, col: null })}><XIcon /></Button>
            {col ? <ColumnDetail t={t} col={col} input={input} layout={layout} onPick={onPick} go={go} /> : <TableDetail t={t} input={input} layout={layout} onPick={onPick} />}
          </aside>
        )}
      </div>
      </Fold>
      )}
    </div>
  )
}

/** The folded Data card: the tables by mark, and each enum value that serves nothing as a loose end. The layout has every table the
 *  schema draws; without it the row counts the tables the plan declares, which may leave some out. */
export function erdRow({ tables = [], unused = [] }: ErdInput, layout?: ErdLayout): RowLine {
  const marks = (layout?.tables ?? tables).map((t) => t.mark)
  const count = (mark: Mark) => marks.filter((m) => m === mark).length
  return { says: e.row(count("new"), count("changed"), count("reused")), loose: unused.map((u) => e.unusedLine(u.value.split(".").at(-1)!)) }
}
