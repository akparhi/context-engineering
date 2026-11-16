# The sign-off manifest

`sign-off.json` sits in the plan folder, beside `plan.md`. It holds the facts the page draws and the items the reader decides. The zod schema in [../scripts/manifest.ts](../scripts/manifest.ts) is the contract, and this file says how to fill it. [../fixtures/plan/sign-off.json](../fixtures/plan/sign-off.json) fills every part. Copy from it.

Every path in the manifest is relative to the plan folder. Every id is unique across the whole manifest. Requirements, items, options and every fact pool share one namespace.

## Contents

- [Top level](#top-level)
- [Product](#product)
- [Items](#items)
- [Facts](#facts)
- [Blocks](#blocks)
- [Cite and revs](#cite-and-revs)
- [Behavior: triggers, writes and stored states](#behavior-triggers-writes-and-stored-states)
- [Data: db.sql and base.sql](#data-dbsql-and-basesql)
- [Components: reuse](#components-reuse)
- [Rule notes](#rule-notes)
- [The revise event](#the-revise-event)
- [Removed fields](#removed-fields)
- [Fixing check errors](#fixing-check-errors)

## Top level

```json
{
  "format": 1,
  "id": "LIB-7",
  "kind": "change",
  "title": "Holds on books that are out",
  "ask": "Approve the plan for holds on books that are out, and answer the question that blocks the endpoints.",
  "revision": "r2",
  "ticket": "https://tracker.example.com/browse/LIB-7",
  "sources": [{ "label": "Figma", "url": "https://design.example.com/file/holds" }],
  "note": "One rule in the model still breaks in this plan, and its note tells you why the plan accepts it.",
  "repos": { "shelf-web": "repos/shelf-web" },
  "product": { "...": "see Product" },
  "facts": {},
  "items": []
}
```

- `id` is the ticket id. `kind` is `change`, `design` or `questions`, and it sets the sections the plan needs (see `section` below).
- `ask` is one sentence in the agent's voice, addressed to the reader.
- `revision` is the label people use, like `r2`. It is optional.
- `ticket` is the ticket's URL. The header links `id` to it.
- `sources` are the designs and documents the plan came from, such as a Figma file or a PRD, linked in the header after the revision.
- Fill `ticket` and `sources` from the ticket and its attachments. Never build or guess a URL. When the ticket links no design, leave `sources` out. With no ticket URL, leave `ticket` out too. Both take http or https URLs only, and neither enters a rev.
- `repos` maps a repo name to its checkout, relative to the plan folder. A reused component's `repo` names a key here.

## Product

Act one, in product words. A plan with no product act sets `"product": { "none": "<why>" }`.

```json
{
  "problem": "Members cannot reserve a book that is out.",
  "users": [{ "who": "Member", "need": "Places a hold and sees their place in line." }],
  "notFor": "Branch managers.",
  "goals": ["A member can hold any book whose copies are all out."],
  "nonGoals": [{ "what": "Pausing a hold", "why": "Few members asked for it." }],
  "requirements": [{ "id": "R1", "title": "Place a hold on a book that is out", "text": "When every copy is lent, a member can join the line from the book page.", "who": "Member" }],
  "rollout": [{ "stage": "Staff only", "says": "Desk librarians try holds on their own cards for one week." }],
  "metric": { "name": "Holds collected", "target": "8 in 10 holds end in a pickup", "readFrom": "The weekly hold report" }
}
```

`rollout` stages are audience words, never branch names. The `jargon` rule reads all of `product`.

## Items

An item is one thing the reader sees as a card. Each has `id`, `type`, `section` and `title`, and optionally `why` (the plan-specific reason this item needs the reader, 16 words or fewer; omit it when the title and `touches` already say it, so not "What gets built, for whom, and what is left out" on Scope), `body` (its blocks), `source` (the `plan.md` heading it comes from), and `serves` (requirement ids).

The section places the item in an act:

| Act | Sections |
| --- | --- |
| Product | Scope, Screens |
| Tech | Evidence, Decisions, Behavior, Data, API, Components, Units, Risks |
| Verification | Acceptance |
| Pull requests | Pull requests, Grant |

What the reader owes an item follows from its type and `touches`:

| Reader owes | Items | Settled when |
| --- | --- | --- |
| Approve | any item with a non-empty `touches`, and the grant | a reader approves it and no current `changes` holds it |
| Answer | a question | the reader answers it. A question with a `default` settles on its default until then |
| FYI | an item with `touches: []` | always. The reader can still object with `changes` |

The types:

```json
{ "id": "data", "type": "part", "section": "Data", "title": "Data", "touches": ["schema"], "source": "plan.md#Data", "body": [{ "view": "erd", "src": "design/schema.dbml" }] }
```

```json
{ "id": "U2", "type": "step", "section": "Units", "title": "Holds endpoints", "touches": [], "source": "plan.md#U2 Holds endpoints",
  "repo": "shelf-api", "files": ["src/holds/routes.ts"], "delivers": ["E1", "E2"], "mergesAfter": ["U1"], "tasks": 5, "done": "All behavior tests pass." }
```

```json
{ "id": "D1", "type": "decision", "section": "Decisions", "title": "Do you agree with how a returned copy reaches the next member?", "touches": [],
  "options": [{ "id": "D1a", "label": "The desk scan shelves it" }, { "id": "D1b", "label": "A nightly job shelves it" }], "chosen": "D1a" }
```

```json
{ "id": "Q1", "type": "question", "section": "Scope", "title": "Do you want members to hold a book while a copy is on the open shelf?",
  "options": [{ "id": "Q1a", "label": "No, only when every copy is out" }, { "id": "Q1b", "label": "Yes" }],
  "recommended": "Q1a", "default": null, "blocks": ["U2"] }
```

```json
{ "id": "grant", "type": "grant", "section": "Grant", "title": "Grant", "source": "plan.md#Grant",
  "allow": [{ "says": "Pushes the unit branches, never with force.", "key": "push" }],
  "ask": [{ "says": "Merging P1 or P2.", "key": "merge" }],
  "clearance": "The review bot may merge P3 once its checks pass." }
```

- **part** draws its blocks.
- **step** is a unit of work. Use the id the plan already gave it, like `U2`. `delivers` names what it builds: an endpoint id, a component id, or `db:<table>`. An approved plan fixes the contracts, so every unit starts at once and builds on stubs. `mergesAfter` names the units whose pull requests merge first. It orders merges and never delays a start. `startsAfter` is `{ "units": ["U0"], "reason": "..." }`. Give it only when a contract is not fixed until those units finish, and say why in `reason`. `check` fails a `startsAfter` with no reason, units that wait on each other through either field, and pull requests that wait on each other through `after` or through the order of their units. A step may run when it is approved or FYI in a settled act, the grant is approved, everything in `delivers` and each unit in `startsAfter` is approved, and each blocking question that lists it is answered. The Units part and the Pull requests diagram draw their order from these two fields.
- **decision** records an option already chosen, with the options it beat. An option takes `detail` and `facts`, a list of `[label, value]` pairs.
- **question** asks the reader. `default: null` makes it blocking. No step it `blocks` may run until the reader answers it. A non-null `default` is an option id or a sentence, and the plan runs on it. `placeholder` hints a free-text answer. The `title` of a question or a decision asks the reader as "you", per [the voice](../SKILL.md#the-voice).
- **grant** is what the agent may do without asking (`allow`) and what it asks first (`ask`). Each line keeps the key of the grant line it comes from. A plan has one grant.

`touches` says why an item needs a person. `check` derives most touches from the item's blocks and fails both a missing and an extra one:

| Touch | Derived when the item has |
| --- | --- |
| `scope` | a `spec` block |
| `acceptance` | a `trace` block |
| `open-rule` | a `statechart` block, and the plan's run has a rule that does not hold, or no run |
| `user-visible` | a `screens` block showing a region marked new or changed |
| `schema` | an `erd` block with a table marked new or changed |
| `api` | an `endpoints` block showing an endpoint marked new or changed |
| `permission` | an `endpoints` block showing an endpoint whose `who` is marked new or changed |

Declare these yourself, because no fact shows them: `money`, `dependency`, `authority`, `data-migration`, `delete`, `deploy`, `external-message` and `force-push`. Declare `authority` on an item that lets the agent act alone in a way the grant does not name, such as a job that runs with no person. Merges that need no person are already gated by the grant, so do not declare `authority` for them.

## Facts

`facts` holds pools the blocks draw from: `screens`, `components`, `endpoints`, `acceptance`, `tests`, `prs`, `risks` and `defaults`. Every pool is optional. A `mark` is `new`, `changed` or `reused`. `serves` lists requirement ids everywhere it appears.

```json
{
  "screens": [{ "id": "book-out", "screen": "Book page", "label": "Every copy is out", "when": "A member opens a book whose copies are all lent.", "serves": ["R1"],
    "regions": [{ "mark": "new", "name": "Place a hold", "component": "C12", "sketch": "form",
      "sample": { "title": "Place a hold", "fields": [["Pick up at", "Central branch"]], "button": "Place hold" } }] }],
  "components": [{ "id": "C12", "name": "PlaceHoldForm", "role": "component", "does": "Asks where to pick the copy up.", "mark": "new", "reads": ["E1"], "serves": ["R1"] }],
  "endpoints": [{ "id": "E1", "method": "POST", "path": "/holds", "mark": "new", "answers": "Puts the member in line.", "serves": ["R1"],
    "who": { "text": "Signed-in members", "mark": "reused" },
    "outcomes": [{ "status": 201, "when": "Every copy is lent.", "title": "In line", "body": [{ "name": "status", "type": "'waiting'", "column": "book_holds.status" }] }] }],
  "acceptance": [{ "id": "A1", "requirement": "R1", "given": "Every copy is lent", "when": "a member places a hold", "then": "they see their place", "screens": ["book-out"] }],
  "tests": [{ "id": "T1", "type": "unit", "name": "queue-order", "proves": ["A1"], "unit": "U1", "file": "src/holds/queue.test.ts", "run": "bun test src/holds/queue.test.ts", "says": "The oldest waiting hold comes first." }],
  "prs": [{ "id": "P1", "title": "Holds table", "repo": "shelf-api", "branch": "feat/LIB-7-holds", "from": "develop", "into": "develop", "steps": ["U1"],
    "review": "A maintainer reviews every migration.", "merge": { "by": "human", "why": "It changes the schema." }, "evidence": ["T1"] }],
  "risks": [{ "id": "K1", "title": "The desk lends a held copy", "bound": "The printed slip is the guard.", "serves": ["R2"] }],
  "defaults": [{ "id": "F1", "says": "Three opening days count from the morning after shelving.", "serves": ["R3"] }]
}
```

- A region's `sketch` is one of `nav`, `figures`, `tabs`, `filters`, `table`, `pagination`, `message`, `sheet` and `form`, and its `sample` has that sketch's shape in `SAMPLES` in `manifest.ts`. A region's `mark` may also be `copy`. Every screen state needs at least one region that names its `component`.
- A screen state takes `from` (the state before) and `on` (the event) for the flow strip, and `states` for the page states in code it draws.
- A component's `role` is `route`, `layout`, `component`, `data` or `wiring`. `parent` and `shows` name other components. Set `parent` on every part another part mounts, so the list indents as the tree it is. Set `file` on a new or changed part too: the page shows it when the reader hovers the name.
- An acceptance row takes `says` in place of `given`, `when` and `then`, and needs one or the other. `requirement: null` is a row that checks no requirement. `guards` or `addedFor` names a chart rule as `rule:<name>`.
- A test's `type` is `unit`, `behavior`, `e2e` or `live`. `unit` names the step that holds it. Every test proves at least one row. Every test but a `live` one names one `file` and the `run` command for it. A `live` test is a check run by hand, in a browser or on a real environment. Its `says` is the instruction, and its evidence goes in the PR.
- A PR's `merge.by` is `human`, `agent` or `bot`. A PR that merges with no person is part of the grant's rev.

## Blocks

A block is `{ "view": "<name>", ...fields }` in an item's `body`. Each view draws from the fields shown and the facts named.

| View | Fields | Draws |
| --- | --- | --- |
| `spec` | none | `product`, the plan's title, ask and note, the questions in its own section, and the figures and defaults that serve a requirement |
| `screens` | `ids?` | the screen states, all of them when `ids` is absent |
| `figures` | `facts`: `{ value, label, source?, inferred?, serves? }[]` | the numbers the plan rests on |
| `statechart` | `says` (rule to sentence), `runs`, `terms?`, `serves?`, `hide?`, `parked?`, `steps?`, `notes?`, `triggers?`, `stored?`, `accepts?`, `mmd?` | the chart and its rules from each run's `report.json` |
| `erd` | `src` (DBML), `sql?`, `base?`, `tables?`, `indexes?`, `columns?`, `writers?`, `says?`, `unused?`, `loose?` | the schema drawn from the applied `sql`, or from the DBML when there is no `sql` |
| `endpoints` | `ids?`, `src?` (OpenAPI 3.1 fragment), `access?`, `envelope?`, `shapes?` | the endpoints, with the components that read each and the units that build it |
| `components` | `note?` | every component, with the screens they render and the units that build them |
| `decisions` | none | every decision item |
| `units` | `note?` | every step, with the PRs that ship it and the branch each goes into |
| `risks` | none | every risk and default |
| `trace` | `requirements?` | one lane per requirement: its acceptance rows, their tests and PRs, and each rule a row guards |
| `prs` | `bot?`, `label?`, `notes?` | every PR, with what it serves and its steps' titles |
| `prose` | `src` (`file` or `file#Heading`) | that Markdown as written |

```json
{ "view": "statechart", "says": { "HeldForSomeone": "A copy on the hold shelf is always held for a member" },
  "runs": [{ "id": "plan", "label": "This plan", "note": "The plan as it stands.", "dir": "statechart/out-plan" }],
  "serves": { "HeldForSomeone": ["R3"] }, "steps": { "a member places a hold": "hold" },
  "triggers": { "a member places a hold": { "endpoint": "E1" } }, "stored": { "On the hold shelf": "book_holds.copy_id" } }
```

- A `statechart` run's `dir` holds the `report.json` that `bureau:statechart` writes. The first run judges this plan. Later runs are earlier versions, such as the draft before review. `mmd` draws a bare chart with every rule not checked.
- `hide` lists rules too technical to show. `parked` maps a rule to why it guards no requirement yet. `steps` maps a step's words to a short arrow label.
- A plan has at most one `erd` block and one `statechart` block.
- `access` on `endpoints` is `{ who, permission, switch?, serves, ask? }`, and `ask` names the question that decides it.

## Cite and revs

`source` ties an item to the `plan.md` heading that says it: `plan.md#<heading text>`. The heading must exist. For each file that items cite, every heading with text under it needs an item that cites it, so that no edit to the plan escapes every rev. The file's leading `#` title is exempt, and so is a heading whose only content is subheadings.

An `itemRev` hashes what the reader saw: the item, each block's resolved input, the words of each source file a block draws, and the cited section. `planRev` hashes the item revs. So:

- A changed fact, block or cited section gives the item a new rev, and the item reopens.
- Reflowed lines, blank lines and comments in `.sql`, `.dbml`, `.mmd` and `.md` sources change no rev. JSON counts as data, so key order changes nothing. Any other file counts as written.
- The order of a chart's states and arrows in `report.json` changes no rev.
- `title`, `ask` and `note` are in the rev of the item with a `spec` block, or in `planRev` when no item has one.
- `ticket`, `sources` and `reviews/` are in no rev.

## Behavior: triggers, writes and stored states

These tie the chart to the API and the schema.

- `triggers` maps each step's words, exactly as the chart draws them on an arrow, to what makes it happen. Give exactly one key: `{ "endpoint": "<id>" }`, `{ "event": "..." }`, `{ "job": "..." }`, `{ "ops": "<the tool a person uses>" }`, or `{ "time": "..." }` when nothing writes and time passes. Every step the first run draws needs a trigger, and every trigger names a drawn step. A label that keeps a bracketed condition, like `someone opens the page [newer rules deployed]`, keeps the bracket in its key.
- Every `POST`, `PUT`, `PATCH` or `DELETE` endpoint is a trigger of some step, or sets `noTransition` to say why it moves no state. A plan with no statechart sets `noTransition` on every write.
- `stored` maps a chart state to the `table.column` that holds it. The column must be in the applied schema. Leave out a state that is transient or derived.
- An `erd` block's `writers` lists, per column, the step words that write it. Each must be a step the chart draws.

## Data: db.sql and base.sql

`sql` is the source of the Data block. It holds the Postgres DDL the migration must produce, partial indexes included. `base` is today's schema that `sql` applies to. `src` is DBML derived from `sql`. With `sql`, the drawing comes from the applied schema and the page shows the DBML as text. `check` only checks that the file exists, so regenerate it whenever `sql` changes. Run this from the skill's `scripts/` folder:

```sh
bun -e 'import { importer } from "@dbml/core"; import { readFileSync } from "fs"; const [base, sql] = process.argv.slice(-2).map((f) => readFileSync(f, "utf8")); console.log(importer.import(`${base}\n${sql}`, "postgres")); process.exit(0)' <plan-dir>/design/base.sql <plan-dir>/design/db.sql > <plan-dir>/design/schema.dbml
```

With no `sql`, `build` draws from the DBML and fails when it does not parse.

```json
{ "view": "erd", "src": "design/schema.dbml", "sql": "design/db.sql", "base": "design/base.sql",
  "tables": [{ "name": "book_holds", "mark": "new", "serves": ["R1"] }, { "name": "copies", "mark": "reused" }],
  "indexes": [{ "name": "book_holds_queue", "where": "status = 'waiting'", "serves": ["R2"] }],
  "loose": [{ "from": "book_holds.pickup_branch_id", "to": "branches.id" }] }
```

`check` applies `base`, then `sql`, to an empty Postgres in PGlite, with the `uuid-ossp` extension. Then it reads tables, columns and indexes back from the catalog:

- Each listed table exists. A table marked `new` is not in `base`. A table that only `sql` creates is marked `new`.
- Each listed index exists, with the same uniqueness and the same `where`. Set `"unique": true` on a unique index, since a missing `unique` means not unique. `check` passes the declared `where` through Postgres before it compares, so `renewed_from IS NOT NULL` matches the catalog's `(renewed_from IS NOT NULL)`.
- Every `table.column` the plan names exists: in `columns`, `writers`, `loose`, `stored`, and an endpoint field's `column`. `column: "*"` names the whole table.

With no `sql`, nothing runs. The tables come from the `tables` list, and `check` skips the `ddl`, `table-mark` and `index` rules. `loose` lists joins by id that have no foreign key. `unused` lists enum values that serve nothing, each with why.

## Components: reuse

A component marked `reused` proves it exists. Give it `repo`, a key of the top-level `repos`, and `file`, relative to that checkout:

```json
{ "id": "C1", "name": "AccountLayout", "role": "layout", "does": "The account frame with the side menu.", "mark": "reused", "repo": "shelf-web", "file": "src/layouts/account.tsx" }
```

When the code has its own version of the part, such as a feature error boundary, mark it `new`.

## Rule notes

A statechart block's `notes` explains a rule's outcome in one run. The key is `<run id>:<rule name>`.

```json
"notes": {
  "plan:NoTurnSkipped": { "verdict": "open", "text": "The desk app does not read holds.",
    "decision": { "chosen": ["Print a hold slip", "The desk reads the slip before lending."], "other": ["Block the loan in the desk app", "Another team owns it."] } },
  "draft:HeldForSomeone": { "verdict": "fixed", "text": "A cancel on the shelf now passes the copy on." }
}
```

`verdict` is `open` (the plan accepts the break) or `fixed` (a later version fixes it). It is for the reader only. The `open-rule` touch reads the run's report, never the note, so a broken rule still gates its item.

## The revise event

When you revise an item the reader sent back, edit it, run `check`, then record the revision:

```sh
sign-off revise <plan-dir> api --note "Cancel answers 404 for another member's hold."
```

It appends one `revise` event to `reviews/events.jsonl`. `from` is the `itemRev` in the item's latest review event or revise, and `to` is its `itemRev` now. `revise` refuses an item that no review covered, and an item whose `itemRev` is still `from`.

`status` shows the note on the item while `to` matches its current rev. If you edit the item again after `revise`, run `revise` again.

## Removed fields

`check` fails these as unknown keys. Older plans may still have them.

| Removed | Use instead |
| --- | --- |
| `product.figures` | a `figures` block. `spec` draws each figure that serves a requirement |
| `product.defaults` | `facts.defaults` |
| `runs[].cmd`, `runs[].cfg` | nothing. A run is `id`, `label`, `note` and `dir` |
| the statechart block's `dir` | `runs`, whose first entry is this plan |
| the components block's `root` | nothing |
| a note verdict other than `open` or `fixed` | `open` or `fixed` |

## Fixing check errors

`check` prints `error <rule>: <message>`. The list below covers every message in `scripts/check.ts`.

**schema.** The file is missing, is not JSON, or breaks `manifest.ts`. The message gives the path of the bad field. Fix that field. An unknown key is usually a removed field (see above). A `ticket` or source URL must be http or https.

**id.** `duplicate id X: a <kind> and a <kind>`. Rename one. Ids share one namespace across requirements, items, options and facts.

**ref.** A reference names something that does not exist. The message says where and what. Fix the id or the path, or add the missing thing:
- `source X has no heading "H"`: use the heading text exactly as `plan.md` writes it.
- `deliverable X does not exist`: a step's `delivers` takes an endpoint id, a component id or `db:<table>`.
- `column T.C is not in the applied schema`: fix the name, or add the column to `db.sql`.
- `Behavior: run R has no <dir>/report.json`, `is not JSON`, or `has version N`: run `bureau:statechart` again with `--out <dir>`.
- `triggers names the step "S", which the chart does not draw`, `stored names the state "S", which the chart does not draw`, `writer C names the step "S", which no chart draws`: copy the words from the first run's `report.json`, `chart.arrows[].step` and `chart.states[].path`.
- `acceptance A: rule R does not exist`: name a key of the chart's `says`, as `rule:<name>`.

**cite.** `the heading "H" has text, and no item cites it`. Set `source` on the item that holds that content. Several items may cite one heading.

**section.** A `change` plan needs Units, Pull requests and Grant sections. A `design` plan needs Scope or Screens, and one of Behavior, Data, API or Screens. A `questions` plan needs a question. A plan has one grant, and at most one `erd` and one `statechart` block.

**touch.** `its facts make it touch T, and touches does not declare it`: add T. `declares T, and no fact in it shows that`: remove T, or add the fact that shows it. See the table in Items.

**jargon.** Act one names a tech term of this plan or has a code span. Act one is `product`, the title and `why` of each Scope and Screens item, a question's options, default and placeholder, and every screen state when one of those items has a `screens` block. A tech term is a name this plan uses that looks like code, with a lowercase letter before a capital or a `/`, `.`, `_` or `@` in it: a table or column, a component's name or file, an endpoint path, or a step's file. Say it in product words, and keep the code in the tech act.

**log.** A line of `reviews/events.jsonl` is not JSON, is not a valid event, or names an item that does not exist. Fix or remove a line written by hand. Never edit a line a command wrote.

**ddl.** `base` does not apply to an empty database, or `sql` does not apply to `base`. The message carries Postgres's error. Fix the SQL. `base` must hold every table `sql` refers to.

**table-mark.** A table is marked `new` and `base` has it, or `sql` alone creates a table not marked `new`. Fix the mark.

**index.** A listed index is not in the applied schema, or its uniqueness or `where` differs from `sql`. Make the block say what `sql` does.

**trigger.** `the chart step "S" has no trigger`. Add S to `triggers` (see Behavior).

**write.** `endpoint E writes, and no chart step names it as a trigger`. Add it as a step's trigger, or set `noTransition` on the endpoint.

**stored.** `the state "S" is stored in T.C, which is not in the applied schema`. Fix the column, or add it to `db.sql`.

**render.** `screen S: no region names the component that renders it`. Set `component` on a region.

**reuse.** A `reused` component has no `repo` and `file`, or the file is not in that checkout. Give both, fix the path, or mark the component `new`.

**test.** `test T has no run command`, `has no file`, `is not one file` or `proves no acceptance row`. Give the test the one file that holds it, the command that runs it, and the rows it proves. A check run by hand is a `live` test, which needs neither.

**Warnings.** A trace hole is a requirement no endpoint, component, table or column serves, a requirement with no acceptance row, a component that serves nothing, a shown rule that guards nothing, or an acceptance row with no requirement or no test. More than 7 gates warns too. Fix a hole, or tell the reader why it stays.
