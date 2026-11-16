/** The views draw as `main` (BASE) drew them. The guard parses parts.tsx and each view file at BASE and now, drops imports,
 *  comments and formatting, and compares them top-level declaration by declaration:
 *  - same name, same code: passes;
 *  - gone since BASE, or new: needs a REMOVED or ADDED row;
 *  - same name, different code: passes when its JSX equals BASE's after slim removal's rewrites (below) and the rest of its code
 *    only lost tokens (identifiers, strings, numbers, operators), as when a slim hook goes. Otherwise it needs a CHANGED row,
 *    pinned to a hash of its code now, so the next edit to it fails until someone reviews it and updates the pin.
 *  JSX compares as a tree: tag, attributes with their value code, children in order with their expression code. Slim removal's
 *  rewrites of BASE: `<Fold className=…>` drew `<div className=…>` (only `key` and `className` stay), `<FullOnly>` drew its
 *  children, and `c ? x : x` is `x`. Styling files stay byte-identical, and the views/ file list and each view's exports match
 *  BASE apart from their tables. */
import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parse } from "@babel/parser"

const BASE = "56d282f"
const VIEWER = resolve(import.meta.dir, "..")

type Row = { file: string; name: string; why: string }
const rows = (file: string, names: string[], why: string): Row[] => names.map((name) => ({ file, name, why }))

/** The slim `*Row` views BASE exported and the step page no longer draws. */
const REMOVED_EXPORTS = ["componentsRow", "decisionsRow", "endpointsRow", "erdRow", "figuresRow", "grantRow", "prsRow", "risksRow", "screensRow", "specRow", "statechartRow", "traceRow", "unitsRow"]
/** Declarations BASE had that are gone now. Each drew or decided only the slim view. */
const REMOVED: Row[] = [
  ...REMOVED_EXPORTS.map((name) => ({ file: `src/views/${name.slice(0, -"Row".length)}.tsx`, name, why: "the card's folded row" })),
  ...rows("src/parts.tsx", ["Slim", "FoldScope", "useUntilFound", "FoldButton", "Fold", "FullOnly", "useOpenFold", "useRowOpened"], "slim's fold machinery"),
  ...rows("src/parts.tsx", ["RowHead", "ROW"], "the row a folded card drew, and its class"),
  ...rows("src/views/decisions.tsx", ["Taken"], "the folded decision's summary"),
  ...rows("src/views/endpoints.tsx", ["ParamNames"], "the folded params' summary"),
  ...rows("src/views/erd.tsx", ["FreshTables"], "the folded diagram's summary"),
  ...rows("src/views/prs.tsx", ["orderSays", "list"], "the folded order's summary, and its list helper"),
  ...rows("src/views/spec.tsx", ["rowKeys"], "fold keys for non-goal rows"),
  ...rows("src/views/statechart.tsx", ["ChartFold", "chartFold", "BrokenWay"], "how slim folded a run, and the folded chart's summary"),
  ...rows("src/views/trace.tsx", ["TESTS", "Coverage", "rowsOf"], "the tests fold's key, its summary, and traceRow's helper"),
  ...rows("src/views/trace.tsx", ["LayerHeads"], "lane heads drawn only in slim"),
]
/** Declarations BASE did not have. */
const ADDED: Row[] = []
/** Declarations whose JSX differs from BASE's after the rewrites, or whose code gained tokens. `pin` is `pin()` of the code now:
 *  an edit to the declaration fails until someone reviews it and sets the new pin. */
const CHANGED: (Row & { what: string; pin: string })[] = [
  { file: "src/parts.tsx", name: "Card", pin: "301982faab5b",
    what: "EXCEPTION: no longer draws its item's questions grid. Also always CARD and CardHead, with no fold wiring",
    why: "the user's named exception: each step opens with its questions, so the step page draws a step's questions in the step's first sub-step, and QuestionCard draws each as before. Slim folded a card to RowHead, full drew it open" },
  { file: "src/parts.tsx", name: "CardHead", what: "no fold button, no body and canFold props", pin: "b7f6eb4e1481", why: "the button folded the card in slim" },
  { file: "src/parts.tsx", name: "QuestionCard", what: "no fold attributes or fold buttons, Change no longer opens a fold", pin: "af7196e2bec7", why: "slim folded an answered question" },
  { file: "src/parts.tsx", name: "Page", what: "`changed` and `reader` move up from `slim`", pin: "286891eca6f9", why: "the rest of Slim is gone" },
  { file: "src/parts.tsx", name: "RevisedStrip", what: "reads `changed` and `reader` from Page", pin: "e04877966f3b", why: "they moved up from `slim`" },
  { file: "src/views/endpoints.tsx", name: "OutcomeRow", what: "no onToggle, no open prop on OutcomeLine", pin: "bd89482f7f70", why: "open only told OutcomeLine whether slim hid its refs" },
  { file: "src/views/statechart.tsx", name: "StatechartView", what: "no fold prop on Rules", pin: "2b2ca6085e8b", why: "fold chose Rules' slim fold" },
  { file: "src/views/trace.tsx", name: "AccRow", what: "no <LayerHeads />", pin: "06102cdb0b0f", why: "LayerHeads drew only in slim" },
]

/** Exports a view file gained since BASE, so the step page can draw one part of a view somewhere else. */
const ALLOWED_EXPORTS: Row[] = [
  { file: "src/views/prs.tsx", name: "PrCard", why: "the drawer draws a pull request's card" },
  { file: "src/views/trace.tsx", name: "TestDetail", why: "the drawer draws a test's detail" },
]
/** Files in `src/views/` that BASE did not have, or that are gone since. */
const VIEW_FILES_CHANGED: { file: string; why: string }[] = []

const IDENTICAL = ["src/index.css", "components.json", "src/components/ui/badge.tsx", "src/components/ui/button.tsx"]

// Babel AST nodes, walked generically by key.
type Ast = any

const program = (source: string): Ast => parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] }).program
const POSITION_AND_COMMENTS = new Set(["start", "end", "loc", "range", "extra", "leadingComments", "trailingComments", "innerComments"])

/** JSX text as React renders it: lines trimmed where they meet a line break, blank lines dropped. */
function jsxText(value: string): string {
  const lines = value.split(/\r\n|\n|\r/)
  return lines.map((l, i) => (i > 0 ? l.trimStart() : l)).map((l, i) => (i < lines.length - 1 ? l.trimEnd() : l)).filter(Boolean).join(" ")
}

/** The code of a node with positions, comments and formatting dropped. */
const canonical = (node: unknown): string => JSON.stringify(node, (key, value) => {
  if (POSITION_AND_COMMENTS.has(key)) return undefined
  if (key === "children" && Array.isArray(value)) return value.filter((c: Ast) => c.type !== "JSXText" || jsxText(c.value))
  if (value?.type === "JSXText") return { type: "JSXText", value: jsxText(value.value) }
  return value
})
const pin = (node: Ast) => createHash("sha256").update(canonical(node)).digest("hex").slice(0, 12)

/** Each top-level declaration by name. Imports are left out: what a file imports shows where a declaration uses it. */
function declarations(source: string): Map<string, Ast> {
  const out = new Map<string, Ast>()
  for (const statement of program(source).body) {
    if (statement.type === "ImportDeclaration" || (statement.type === "ExportNamedDeclaration" && !statement.declaration)) continue
    const node = statement.declaration ?? statement
    const name: string = node.id?.name ?? node.declarations?.map((d: Ast) => d.id.name).join(", ") ?? node.type
    out.set(out.has(name) ? `${name} (${node.type})` : name, node)
  }
  return out
}

const isTag = (n: Ast, name: string) => n?.type === "JSXElement" && n.openingElement.name.type === "JSXIdentifier" && n.openingElement.name.name === name
const renamed = (n: Ast, name: string) => n && { ...n, name: { ...n.name, name } }

/** `children` that stand in an expression's place, as React draws them. */
function asExpression(children: Ast[]): Ast {
  const drawn = children.filter((c) => c.type !== "JSXText" || jsxText(c.value))
  if (drawn.length === 1 && drawn[0].type === "JSXExpressionContainer") return drawn[0].expression
  if (drawn.length === 1 && drawn[0].type !== "JSXText") return drawn[0]
  return { type: "JSXFragment", openingFragment: { type: "JSXOpeningFragment" }, closingFragment: { type: "JSXClosingFragment" }, children }
}

/** BASE code as it reads with slim removed: Fold is the div it drew, FullOnly is its children, `c ? x : x` is `x`. */
function unslim(node: Ast): Ast {
  if (Array.isArray(node)) return node.map(unslim)
  if (!node || typeof node !== "object") return node
  const out: Ast = Object.fromEntries(Object.entries(node).map(([k, v]) =>
    [k, k === "children" ? (v as Ast[]).flatMap((c) => (isTag(c, "FullOnly") ? unslim(c.children) : [unslim(c)])) : unslim(v)]))
  if (isTag(out, "Fold")) {
    const attributes = out.openingElement.attributes.filter((a: Ast) => a.type === "JSXAttribute" && ["key", "className"].includes(a.name.name))
    return { ...out, openingElement: { ...renamed(out.openingElement, "div"), attributes }, closingElement: renamed(out.closingElement, "div") }
  }
  if (isTag(out, "FullOnly")) return asExpression(out.children)
  if (out.type === "ConditionalExpression" && canonical(out.consequent) === canonical(out.alternate)) return out.consequent
  return out
}

/** Every JSX tree in a declaration, outermost first: nested JSX is part of its parent's tree. */
function jsxTrees(node: Ast, out: Ast[] = []): Ast[] {
  if (Array.isArray(node)) node.forEach((n) => jsxTrees(n, out))
  else if (node?.type === "JSXElement" || node?.type === "JSXFragment") out.push(node)
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) if (!POSITION_AND_COMMENTS.has(k)) jsxTrees(v, out)
  return out
}

/** A multiset of identifiers, strings, numbers and operators. */
function tokens(node: Ast, bag = new Map<string, number>()): Map<string, number> {
  const add = (t: string) => bag.set(t, (bag.get(t) ?? 0) + 1)
  if (Array.isArray(node)) { node.forEach((n) => tokens(n, bag)); return bag }
  if (!node || typeof node !== "object") return bag
  if (node.type === "Identifier" || node.type === "JSXIdentifier") add(`id:${node.name}`)
  if (node.type === "StringLiteral") add(`str:${node.value}`)
  if (node.type === "JSXText" && jsxText(node.value)) add(`str:${jsxText(node.value)}`)
  if (node.type === "TemplateElement") add(`str:${node.value.cooked}`)
  if (node.type === "NumericLiteral") add(`num:${node.value}`)
  if (typeof node.operator === "string") add(`op:${node.operator}`)
  for (const [k, v] of Object.entries(node)) if (!POSITION_AND_COMMENTS.has(k)) tokens(v, bag)
  return bag
}

/** How `now` differs from `base` beyond slim removal, or null when it does not. */
function change(base: Ast, now: Ast): string | null {
  const before = unslim(base)
  if (canonical(jsxTrees(before)) !== canonical(jsxTrees(now))) return "its JSX differs from BASE's"
  const had = tokens(before)
  const gained = [...tokens(now)].filter(([t, n]) => n > (had.get(t) ?? 0)).map(([t]) => t)
  return gained.length ? `it gains ${gained.join(" ")}` : null
}

/** Every difference between `base` and `now` that the tables do not name, and every table row that names nothing. */
function judge(file: string, base: string, now: string): string[] {
  const before = declarations(base)
  const after = declarations(now)
  const row = <R extends Row>(table: R[], name: string) => table.find((r) => r.file === file && r.name === name)
  const problems: string[] = []
  for (const name of before.keys()) if (!after.has(name) && !row(REMOVED, name)) problems.push(`${file} ${name}: gone since ${BASE}, and REMOVED has no row`)
  for (const name of after.keys()) if (!before.has(name) && !row(ADDED, name)) problems.push(`${file} ${name}: new since ${BASE}, and ADDED has no row`)
  for (const [name, node] of after) {
    if (!before.has(name)) continue
    const what = change(before.get(name), node)
    const changed = row(CHANGED, name)
    if (what && !changed) problems.push(`${file} ${name}: ${what}, and CHANGED has no row`)
    if (!what && changed) problems.push(`${file} ${name}: matches ${BASE} now, so its CHANGED row should go`)
    if (what && changed && changed.pin !== pin(node)) problems.push(`${file} ${name}: edited since its CHANGED row was pinned. Review it, then set pin to "${pin(node)}"`)
  }
  for (const r of REMOVED.filter((r) => r.file === file && (after.has(r.name) || !before.has(r.name)))) problems.push(`${file} ${r.name}: REMOVED row, but it is not gone`)
  for (const r of ADDED.filter((r) => r.file === file && (before.has(r.name) || !after.has(r.name)))) problems.push(`${file} ${r.name}: ADDED row, but it is not new`)
  for (const r of CHANGED.filter((r) => r.file === file && !(before.has(r.name) && after.has(r.name)))) problems.push(`${file} ${r.name}: CHANGED row, but it is not in both`)
  return problems
}

describe("the structural comparer", () => {
  const base = `function View({ s }) { return <section><p className="a">{s.problem}</p><Fold part="x" className="b"><FullOnly><i>{s.goal}</i></FullOnly></Fold></section> }`
  test.each([
    ["slim removal passes", `function View({ s }) { return <section><p className="a">{s.problem}</p><div className="b"><i>{s.goal}</i></div></section> }`, []],
    ["a moved class fails", `function View({ s }) { return <section className="a"><p>{s.problem}</p><div className="b"><i>{s.goal}</i></div></section> }`, ["probe.tsx View: its JSX differs from BASE's, and CHANGED has no row"]],
    ["a removed node fails", `function View({ s }) { return <section><p className="a">{s.problem}</p><div className="b"></div></section> }`, ["probe.tsx View: its JSX differs from BASE's, and CHANGED has no row"]],
    ["a changed expression fails", `function View({ s }) { return <section><p className="a">{s.rollout}</p><div className="b"><i>{s.goal}</i></div></section> }`, ["probe.tsx View: its JSX differs from BASE's, and CHANGED has no row"]],
    ["a gained token outside JSX fails", `function View({ s }) { const g = s.rollout; return <section><p className="a">{s.problem}</p><div className="b"><i>{s.goal}</i></div></section> }`, ["probe.tsx View: it gains id:s id:g id:rollout, and CHANGED has no row"]],
  ])("%s", (_, now, problems) => {
    expect(judge("probe.tsx", base, now)).toEqual(problems)
  })
})

const git = (...args: string[]) => Bun.spawnSync(["git", ...args], { cwd: VIEWER })
const reachable = git("cat-file", "-e", `${BASE}^{commit}`).exitCode === 0
const atBase = (path: string) => { const r = git("show", `${BASE}:./${path}`); return r.exitCode === 0 ? r.stdout.toString() : null }
if (!reachable) console.log(`views-unchanged: skipped, ${BASE} is not in this clone (shallow?). Fetch it to run the guard.`)

function exportNames(source: string): string[] {
  const names = program(source).body.flatMap((n: Ast) => {
    if (n.type !== "ExportNamedDeclaration") return []
    const d = n.declaration
    if (!d) return n.specifiers.map((s: Ast) => s.exported.name)
    return d.type === "VariableDeclaration" ? d.declarations.map((v: Ast) => v.id.name) : [d.id.name]
  })
  return names.sort()
}

describe.skipIf(!reachable)(`guarded viewer files against ${BASE}`, () => {
  test.each(IDENTICAL)("%s is byte-identical", (path) => {
    expect(readFileSync(resolve(VIEWER, path), "utf8")).toBe(atBase(path)!)
  })

  test("views/ holds the same files, apart from the table", () => {
    const base = git("ls-tree", "--name-only", BASE, "src/views/").stdout.toString().trim().split("\n").map((p) => p.slice("src/views/".length))
    const now = readdirSync(resolve(VIEWER, "src/views"))
    const named = new Set(VIEW_FILES_CHANGED.map((f) => f.file))
    const diff = [...base.filter((f) => !now.includes(f)), ...now.filter((f) => !base.includes(f))].filter((f) => !named.has(f))
    expect(diff).toEqual([])
  })

  const guarded = ["src/parts.tsx", ...readdirSync(resolve(VIEWER, "src/views")).filter((f) => f.endsWith(".tsx")).map((f) => `src/views/${f}`)]
  test("every table row names a guarded file, and each declaration once", () => {
    const named = [...REMOVED, ...ADDED, ...CHANGED].map((r) => `${r.file} ${r.name}`)
    expect([...REMOVED, ...ADDED, ...CHANGED, ...ALLOWED_EXPORTS].map((r) => r.file).filter((f) => !guarded.includes(f))).toEqual([])
    expect(named.filter((n, i) => named.indexOf(n) !== i)).toEqual([])
  })
  test.each(guarded.filter((f) => f.startsWith("src/views/")))("%s exports what BASE did, minus the slim rows, plus ALLOWED_EXPORTS", (path) => {
    const base = atBase(path)
    if (base === null) return
    const expected = [...exportNames(base).filter((n) => !REMOVED_EXPORTS.includes(n)), ...ALLOWED_EXPORTS.filter((r) => r.file === path).map((r) => r.name)]
    expect(exportNames(readFileSync(resolve(VIEWER, path), "utf8"))).toEqual(expected.sort())
  })
  test.each(guarded)("%s draws what BASE drew, apart from REMOVED, ADDED and CHANGED", (path) => {
    const base = atBase(path)
    if (base === null) return // a new file: the views/ file test judges it
    expect(judge(path, base, readFileSync(resolve(VIEWER, path), "utf8"))).toEqual([])
  })
})
