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

const FLUFF = "user asked: cut the fluff, engineers know these, explainers live in a tooltip, hover card or collapsible"
const LAYOUT = "user asked: pages are messy, one screen per stop, shadcn components only"
const PARALLEL = "user asked: units start together, and a dependency orders merges only"
const COMPONENTS = "user asked: Components keeps its structure with a better UI"
const MOCKUPS = "user asked: each screen state shows its real mockup and its design links"
const NO_SIDEWAYS = "user asked: no page-level sideways scroll, a wide table fits or scrolls in its own box"

/** The slim `*Row` views BASE exported and the step page no longer draws. */
const REMOVED_EXPORTS = ["componentsRow", "decisionsRow", "endpointsRow", "erdRow", "figuresRow", "grantRow", "prsRow", "risksRow", "screensRow", "specRow", "statechartRow", "traceRow", "unitsRow"]
/** Declarations BASE had that are gone now. Each drew or decided only the slim view. */
const BEHAVIOR = "user asked: Behavior as one stop, a band naming the broken rule and a rail beside the chart (option D)"
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
  ...rows("src/views/components.tsx", ["FOLDED"], `${COMPONENTS}: every group is a titled section, none a plain box`),
  ...rows("src/views/decisions.tsx", ["Decision", "DecisionLine", "DecisionSides"], `${LAYOUT}: a decision is one Table row, not a line over two cards`),
  ...rows("src/views/risks.tsx", ["RiskBound"], `${LAYOUT}: the requirement chips moved to the title line, so the bound is one paragraph in RiskRow`),
  ...rows("src/views/statechart.tsx", ["Glossary", "Rules"], `${BEHAVIOR}: glossary words are HoverCards in the band's note, and the other rules sit behind the band's button`),
  ...rows("src/views/screens.tsx", ["Thumb", "THUMB_ROW"], `${LAYOUT}: the flow strip is one row of Tabs, with no thumbnails`),
]
/** Declarations BASE did not have. */
const ADDED: Row[] = [
  ...rows("src/views/units.tsx", ["UnitsOrder"], `${PARALLEL}: the start waves, merge order and critical path in one line above the cards`),
  ...rows("src/views/statechart.tsx", ["Term", "wordOf", "TermWord", "Termed", "OtherRules", "RuleBand"], BEHAVIOR),
  ...rows("src/views/screens.tsx", ["RefIds", "MARK_INK"], "user asked for the Screens view cleanup: a region's requirements and mark as quiet words, not chips and pills"),
  ...rows("src/parts.tsx", ["Why", "WHY_WORDS", "longWhy"], `${FLUFF}: a why within the word budget prints under the title; a longer one is the word Why on the title line and opens in a HoverCard`),
  ...rows("src/parts.tsx", ["Disclosure"], `${FLUFF}: the Collapsible that holds what few readers need`),
  ...rows("src/views/components.tsx", ["atSlashes", "QUIET_ID", "RAIL", "ROLE_ORDER"], `${COMPONENTS}: the path in a HoverCard, a quiet id, a rail for the mark, and the route first`),
  ...rows("src/views/decisions.tsx", ["HEAD", "CELL"], `${LAYOUT}: the Table's head and cell classes`),
  ...rows("src/views/spec.tsx", ["HEAD", "CELL"], `${LAYOUT}: the requirements Table's head and cell classes`),
  ...rows("src/views/screens.tsx", ["Mockup"], `${MOCKUPS}: the state's inlined mockup under the sketch, opening full size in a new tab`),
  ...rows("src/parts.tsx", ["SourceLink"], `${MOCKUPS}: the header's outbound link, moved here so a screen state's design links share it`),
]
/** Declarations whose JSX differs from BASE's after the rewrites, or whose code gained tokens. `pin` is `pin()` of the code now:
 *  an edit to the declaration fails until someone reviews it and sets the new pin. */
const TYPE = "user asked for the scratched build's text weights: body sentences at text-base leading-7"
const SCREENS = "user asked for the Screens view cleanup"
const CHANGED: (Row & { what: string; pin: string })[] = [
  { file: "src/parts.tsx", name: "Card", pin: "0841c117927f",
    what: "EXCEPTION: no longer draws its item's questions grid. Also always CARD and CardHead, with no fold wiring, and the body inherits text-base. Clips its overflow so a wide table scrolls inside it",
    why: "the user's named exception: each step opens with its questions, so the step page draws a step's questions in the step's first sub-step, and QuestionCard draws each as before. Slim folded a card to RowHead, full drew it open. The body inherits text-base because the user asked for the scratched build's text weights. It clips because the user asked: no page-level sideways scroll" },
  { file: "src/parts.tsx", name: "Subhead", what: "sentence case, no uppercase tracking", pin: "fa4789b09298", why: TYPE },
  { file: "src/parts.tsx", name: "Page", what: "`changed` and `reader` move up from `slim`", pin: "286891eca6f9", why: "the rest of Slim is gone" },
  { file: "src/parts.tsx", name: "RevisedStrip", what: "reads `changed` and `reader` from Page", pin: "e04877966f3b", why: "they moved up from `slim`" },
  { file: "src/views/endpoints.tsx", name: "OutcomeRow", what: "no onToggle, no open prop on OutcomeLine", pin: "bd89482f7f70", why: "open only told OutcomeLine whether slim hid its refs" },
  { file: "src/views/prose.tsx", name: "ProseView", what: "the prose body at text-base leading-7", pin: "f79892e190fb", why: TYPE },
  { file: "src/views/units.tsx", name: "UnitsView", what: "the order line above the cards", pin: "98faab93db8e", why: PARALLEL },
  { file: "src/views/units.tsx", name: "UnitCard", what: "the done line at text-base leading-7; Starts and Merges after in place of Waits for", pin: "260c91b7021a", why: `${TYPE}; ${PARALLEL}` },
  { file: "src/views/units.tsx", name: "UnitsNote", what: "the note at text-base leading-7", pin: "c6a36c66d3ce", why: TYPE },
  { file: "src/parts.tsx", name: "CardHead", what: "no fold button, no body and canFold props. Round 3: the actions stay top right on one row, Approve moves to the footer, and the why line is <Why>", pin: "c23b8317ba19", why: `the button folded the card in slim. ${LAYOUT}; ${FLUFF}` },
  { file: "src/parts.tsx", name: "QuestionCard", what: "no fold attributes or fold buttons, Change no longer opens a fold. Round 3: `wide` lays a question out as one full-width row", pin: "33115742efb9", why: `slim folded an answered question. ${LAYOUT}` },
  { file: "src/parts.tsx", name: "StatusPill", what: "the For reading badge explains itself in a Tooltip", pin: "8fb7c918b345", why: FLUFF },
  { file: "src/parts.tsx", name: "VerdictButtons", what: "`approve` leaves the Approve button out where the footer holds it", pin: "926ebed87347", why: LAYOUT },
  { file: "src/views/components.tsx", name: "ComponentsView", what: "option A: titled group sections with counts, the route first, a sticky picture with a status line, hover outlines a part, and data attributes for the slicer", pin: "f9a521483f14", why: COMPONENTS },
  { file: "src/views/components.tsx", name: "PartRow", what: "option A: id, name and mark on one line, what it does, then one meta line; a rail carries the mark, the path sits in a HoverCard, a part drawn on another picture dims", pin: "166930535539", why: COMPONENTS },
  { file: "src/views/decisions.tsx", name: "DecisionsView", what: "a shadcn Table: Decision, The plan does, Turned down", pin: "e0775de2d796", why: LAYOUT },
  { file: "src/views/decisions.tsx", name: "Option", what: "reads its type from DecisionsInput, since the Decision alias is gone", pin: "f42ba7d19770", why: LAYOUT },
  { file: "src/views/decisions.tsx", name: "Side", what: "a table cell's content, with no card and no repeated label; detail at text-sm", pin: "0349893970a4", why: LAYOUT },
  { file: "src/views/erd.tsx", name: "Erd", what: "the two paragraphs sit side by side and the legend shares the tabs row", pin: "689b1bf7f8c5", why: LAYOUT },
  { file: "src/views/erd.tsx", name: "Diagram", what: "no line that says how to scroll", pin: "0f67c6786eae", why: FLUFF },
  { file: "src/views/erd.tsx", name: "TableDetail", what: "no line that says to pick a column", pin: "45fb718726f8", why: FLUFF },
  { file: "src/views/grant.tsx", name: "GrantView", what: "Asks you first on the left with the merge line under it", pin: "55ffc3db7bed", why: `${LAYOUT}; ${FLUFF}` },
  { file: "src/views/grant.tsx", name: "Lines", what: "each line of the grant at text-base, in 36px rows", pin: "34e609cad5bc", why: `${TYPE}; ${LAYOUT}` },
  { file: "src/views/prs.tsx", name: "PrsView", what: "the order diagram first, the shared facts under it, no count line", pin: "f1d509a0b5cf", why: `${LAYOUT}; ${FLUFF}` },
  { file: "src/views/prs.tsx", name: "SharedFacts", what: "a three-row list (Merge, Review, Reviewer) in place of five sentences; the planner's notes behind a Collapsible", pin: "dbd777a8daf9", why: FLUFF },
  { file: "src/views/prs.tsx", name: "PrLanes", what: "stage columns keep their number only, and no caption defines an arrow", pin: "5cbab6d8db3e", why: FLUFF },
  { file: "src/views/prs.tsx", name: "PrCard", what: "no Units row, Promotion only when the plan promotes, the Branch row names the base once, Merge reads who and why; Merges after in place of Waits for", pin: "21b8a9b85272", why: `${FLUFF}; ${PARALLEL}` },
  { file: "src/views/risks.tsx", name: "RiskRow", what: "the requirement chips sit at the right end of the title line", pin: "1cd38ef38224", why: LAYOUT },
  { file: "src/views/risks.tsx", name: "DefaultRow", what: "the default's sentence at text-base leading-7, its chips at the right end of the line", pin: "9cd92285fcfa", why: `${TYPE}; ${LAYOUT}` },
  { file: "src/views/screens.tsx", name: "ScreensView", what: "one frame round the wireframe, not two; the lead at text-base leading-7. Round 3: the caption carries what led to the state. The caption ends with the state's design links, and the mockup sits under the sketch", pin: "38b04a5e6e2c", why: `${SCREENS}; ${LAYOUT}; ${MOCKUPS}` },
  { file: "src/views/screens.tsx", name: "RegionBox", what: "a left rule marks each region in place of a frame; the head is the name, the mark as a word and quiet requirement ids. Round 3: in the components view the head shows the part id and no requirement ids", pin: "bf2863769a10", why: `${SCREENS}; ${COMPONENTS}` },
  { file: "src/views/screens.tsx", name: "FlowStrip", what: "one row of shadcn Tabs, with no thumbnails and no lane titles", pin: "7ea938f0bf28", why: LAYOUT },
  { file: "src/views/spec.tsx", name: "SpecView", what: "users' needs and goals at text-base leading-7. Round 3: Not for is the third entry of Who it is for, and the requirements are a four-column shadcn Table", pin: "f8c0cc7168d5", why: `${TYPE}; ${LAYOUT}` },
  { file: "src/views/trace.tsx", name: "TraceView", what: "no paragraph that explains the layers", pin: "2822594fa1ac", why: FLUFF },
  { file: "src/views/statechart.tsx", name: "StatechartView", what: "a bar, the broken rule's band, then the chart beside a sticky rail; no reading paragraph, no Rules section", pin: "f9677d65e0a2", why: BEHAVIOR },
  { file: "src/views/statechart.tsx", name: "ChartLegend", what: "the breaks mark shows only with red, which the view turns off under a band; the row key ends in a way back", pin: "45fe569709da", why: BEHAVIOR },
  { file: "src/views/statechart.tsx", name: "RunTabs", what: "a run's note is a Tooltip on its tab", pin: "0f3047bee403", why: BEHAVIOR },
  { file: "src/views/statechart.tsx", name: "litOf", what: "the step defaults to the last one, where the whole path is red and nothing dims", pin: "8f7eb61d3193", why: BEHAVIOR },
  { file: "src/views/statechart.tsx", name: "StepRow", what: "the trigger and stored table are a second line under the current row only", pin: "00353746d5d6", why: BEHAVIOR },
  { file: "src/views/statechart.tsx", name: "Stepper", what: "always open, no card ring, a fixed title; Proven next by moved to the band", pin: "1276256ebb31", why: BEHAVIOR },
  { file: "src/views/statechart.tsx", name: "Decision", what: "the two sides stacked, each label naming its button, no heading", pin: "bcea930cd332", why: BEHAVIOR },
  { file: "src/views/statechart.tsx", name: "RuleRow", what: "no Step through button, no steppable path, no decision", pin: "ef344f2f8dab", why: BEHAVIOR },
  { file: "src/views/trace.tsx", name: "AccRow", what: "no <LayerHeads />", pin: "06102cdb0b0f", why: "LayerHeads drew only in slim" },
]

/** Exports a view file gained since BASE, so the step page can draw one part of a view somewhere else. */
const ALLOWED_EXPORTS: Row[] = [
  { file: "src/views/prs.tsx", name: "PrCard", why: "the drawer draws a pull request's card" },
  { file: "src/views/trace.tsx", name: "TestDetail", why: "the drawer draws a test's detail" },
  { file: "src/views/trace.tsx", name: "LayerCounts", why: `${NO_SIDEWAYS}: the Acceptance stop draws the layer counts above its table` },
  { file: "src/views/components.tsx", name: "atSlashes", why: "the drawer wraps a path the same way" },
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
