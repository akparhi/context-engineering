# Artifact types

Each type is one file in `scripts/types/`, and its zod schema is the contract. This page says what each field means, which files the type names, which rules the type tier runs on it, and which facts it reports. The rules that join artifacts are in [checks.md](checks.md#plan-tier).

## Contents

- [Every artifact](#every-artifact)
- [requirements](#requirements)
- [screens](#screens)
- [evidence](#evidence)
- [statechart](#statechart)
- [db-schema](#db-schema)
- [api](#api)
- [components](#components)
- [risks](#risks)
- [decisions](#decisions)
- [prose](#prose)
- [acceptance](#acceptance)
- [test-plan](#test-plan)
- [pr-plan](#pr-plan)
- [grant](#grant)

## Every artifact

An artifact file is a JSON object with `type`, `v` and the data fields:

```json
{ "type": "risks", "v": 1,
  "risks": [{ "id": "K1", "title": "The desk lends a held copy", "bound": "The printed slip is the guard.", "serves": ["R2"] }] }
```

- `type` is one of the 14 names on this page, and `v` is that type's version, now `1` for each. The schema rejects a field it does not name.
- An `id` is a non-empty string. `serves` is a list of requirement ids, wherever it appears.
- A `mark` is `new`, `changed` or `reused`.
- A field the schema types as `FileRef` names a plan file: a path relative to the plan folder, with forward slashes, no `..`, and no `#`. A `heading` beside it names one section of that Markdown file, up to the next heading of any level.
- Paths in a repo checkout are plain strings, not plan files: a unit's `files`, a component's `file` and a test's `file`.
- A type that reports facts has a `facts` function. It returns a key for each fact the artifact reports, with the data behind the fact as the value. It reads the data, and `statechart` also reads its first run's report. Each type's **Facts** line below says when a fact holds. No command prints facts.

## requirements

The product part of the plan, in product words. People outside engineering read it.

- `problem`: the problem, in one or two sentences.
- `users`: `{ who, need }` for each kind of person who has the problem.
- `notFor`: who the plan does not serve. Optional.
- `goals`: sentences.
- `nonGoals`: `{ what, why? }`.
- `requirements`: `{ id, title, text, who? }`. Every other artifact's `serves` names these ids.
- `rollout`: `{ stage, says }`. A stage is audience words, never a branch name.
- `metric`: `{ name, target, readFrom? }`. Optional.

A plan with no product act holds `{ "none": "<why>" }` and no other field.

**Files.** None.

**Rules.**
- `jargon`: a string holds a code span in backticks. The rule skips the fields `id`, `serves`, `component`, `sketch`, `mark`, `states`, `from` and `chart`, because they hold machine words.
- `id`: two requirements share an id.

**Facts.** `scope`, always. Its value is the requirements, or the `{ none }` object.

## screens

The page states a person sees.

- `screens`: a list of screen states. Each has:
  - `id`, `screen` (the page's name), `label` (this state's name) and `when` (when a person sees it).
  - `regions`: the parts of the page, described below.
  - `serves`.
  - `subtitle`: optional.
  - `chart`: the statechart state this picture draws, such as `sc:HoldQueue/On the hold shelf`. Optional. No rule reads it.
  - `from` and `on`: the screen state before this one and the event that leads here, for the flow strip. Optional.
  - `states`: `{ id, says }` for each page state in code that this picture draws. Optional.

A region has `mark`, `name`, `sketch`, and optionally `serves`, `component` (a component id) and `sample`. Its `mark` may also be `copy`. `sketch` picks the drawing, and `sample` has that sketch's shape:

| `sketch` | `sample` |
| --- | --- |
| `nav` | `items`: `{ t, open?, sub?, entry? }`, and `entryHidden?` |
| `figures` | `figures`: `[label, value]` pairs, and `note?` |
| `tabs` | `tabs`: `[label, count]` pairs |
| `filters` | `search` and `pills` |
| `table` | `columns?` and `rows`, each row a list of strings or a column-to-string object |
| `pagination` | `text` |
| `message` | `tone` (`empty`, `wait`, `error` or `lock`), `title`, `text` and `action?` |
| `sheet` | `title`, and optionally `sub`, `badge`, `figures`, `bars`, `rows` and `button` |
| `form` | `title`, `fields` as `[label, value]` pairs, `button` and `note?` |

**Files.** None.

**Rules.**
- `id`: two screen states share an id.
- `ref`: `from` names a screen state that does not exist.
- `render`: no region of a screen state names its `component`.
- `jargon`: a string holds a code span, with the same skipped fields as `requirements`.

**Facts.** `user-visible`, when a screen state has a region marked `new` or `changed`. Its value is those screen states. A screen of only reused regions shows a person nothing new.

## evidence

The numbers the plan rests on.

- `figures`: `{ value, label, source?, inferred?, serves? }`. `source` says where the number was read, in words. It is not a plan file. `inferred: true` marks a number that was inferred, not measured.

**Files, rules, facts.** None.

## statechart

A model of the plan's behavior that [statechart](../../statechart/SKILL.md) checks with TLC. Each run is one version of the model, and the first run is this plan.

- `says`: rule name to the rule in the reader's words. Every other field that names a rule names a key of `says`.
- `runs`: `{ id, label, note, dir }`. `dir` is a plan folder that holds statechart's `report.json`, and `report.md` when the run wrote one. Optional.
- `mmd`: a bare Mermaid chart, with every rule not checked. Optional.
- `terms`: `{ word, means }` for words the reader may not know. Optional.
- `serves`: rule name to the requirements it guards. Optional.
- `hide`: rules too technical to list. Optional.
- `parked`: rule name to why it guards no requirement yet. Optional.
- `steps`: step words to a short arrow label. Optional.
- `notes`: `<run id>:<rule name>` to `{ verdict, text, decision? }`, which says what a break in that run means. `verdict` is `open` when the plan keeps the break and `fixed` when a later version fixes it. `decision` is `{ chosen, other }`, each a `[label, why]` pair. Optional.
- `triggers`: step words, exactly as the chart draws them on an arrow, to what makes the step happen. Give exactly one key: `{ "endpoint": "<id>" }`, `{ "event": "..." }`, `{ "job": "..." }`, `{ "ops": "<the tool a person uses>" }`, or `{ "time": "..." }` when nothing writes and time passes. Optional.
- `stored`: chart state to the `table.column` that holds it. Leave out a state that is transient or derived. Optional.

**Files.** `mmd`. For each run, `<dir>/report.json` and, optionally, `<dir>/report.md`.

**Rules.** Every run's `report.json` is checked as JSON and as a statechart report. The version, chart and trigger checks read the first run only.
- `id`: two runs share an id.
- `ref`, in each of these cases:
  - `serves`, `hide`, `parked` or a note names a rule that `says` does not define.
  - A note's key is not `<run>:<rule>`, or names a run that `runs` lacks.
  - A run's `report.json` is not JSON, or lacks a field check reads. Check reads `rules`, each with an `outcome`, and, when the report has a `chart`, its `states`, each with a `path`, and its `arrows`, each with a `step`.
  - The first run's `report.json` has a `v` other than `1`.
  - `triggers` names a step the first run's chart does not draw.
  - `stored` names a state the first run's chart does not draw.
- `trigger`: a step the first run's chart draws has no trigger. An arrow label that joins steps with " or " splits into the step words `triggers` knows, longest match first.
- `trace`, a warning: a rule in `serves` guards no requirement and is not in `hide`.

**Facts.** `open-rule`, unless the first run's `report.json` reads as version 1 and every rule in it holds. With no runs, or no readable report, every rule counts as open. The value is `{ rules, notes }`: the report's rules that do not hold, or `null` with no report, and the notes keyed to the first run. A note's `verdict` never changes the fact.

## db-schema

The plan's database change.

- `src`: DBML for the picture. With `sql`, you generate it from `sql`.
- `sql`: the Postgres DDL the schema change must produce, partial indexes included. This is the source. Optional.
- `base`: today's schema, the DDL that `sql` applies to. Optional.
- `tables`: `{ name, mark, role?, serves? }`. Optional.
- `indexes`: `{ name, unique?, where?, serves? }`, as the applied schema must have them. A missing `unique` means not unique. Optional.
- `says`: words about the change. Optional.
- `writers`: `{ column, states }`, the step words that write each `table.column`. Optional.
- `columns`: `{ column, serves }`, for a `table.column` that serves a requirement. Optional.
- `unused`: `{ value, why }`, for each enum value that serves nothing. Optional.
- `loose`: `{ from, to }`, for each join by id with no foreign key. Optional.

**Files.** `src`, `sql` and `base`. With `sql`, `src` is derived: it must exist, and no rev hashes it. Regenerate it whenever `sql` changes, with the command in sign-off's [Data reference](../../sign-off/references/manifest.md#data-dbsql-and-basesql).

**Rules.** These run only with `sql`. They apply `base`, then `sql`, to an empty Postgres in PGlite with the `uuid-ossp` extension, and read tables, columns and indexes back from the catalog.
- `ddl`: `base` does not apply to an empty database, or `sql` does not apply to `base`. The message carries Postgres's error.
- `table-mark`: a table marked `new` is in `base`, or a table that only `sql` creates is not marked `new`.
- `index`: a listed index is not in the applied schema, or its uniqueness or `where` differs. The declared `where` passes through Postgres before the compare, so `x IS NOT NULL` matches the catalog's `(x IS NOT NULL)`.
- `ref`: a listed table does not exist, or a column in `columns`, `writers` or `loose` is not in the applied schema. In `columns`, `writers` and `loose`, `<table>.*` names the whole table, as in `{ "column": "book_holds.*", "serves": ["R1"] }`.

**Facts.** `schema`, when a table is marked `new` or `changed`. Its value is `{ tables, indexes }`.

## api

The endpoints the plan adds, changes or reuses.

- `endpoints`: a list. Optional. Each endpoint has:
  - `id`, `method`, `path`, `mark`, and `answers` (what it answers, in a sentence).
  - `who`: `{ text, mark }`, who may call it.
  - `narrows`: `{ name, type, means?, default?, serves? }` for each query parameter. Optional.
  - `outcomes`: `{ status, when, title, body?, shape?, serves? }`. `body` is a list of fields `{ name, type, means?, column? }`, where `column` is the `table.column` the field comes from. `shape` names a key of `shapes`.
  - `serves`.
  - `noTransition`: why this write moves no chart state. Optional.
- `src`: an OpenAPI 3.1 fragment. Optional.
- `access`: `{ who, permission, switch?, serves, ask? }`. `ask` is the id of the sign-off question that decides access. This skill does not resolve it. Optional.
- `envelope`: the response envelope every endpoint shares. Optional.
- `shapes`: shape name to its definition. Optional.

**Files.** `src`.

**Rules.**
- `id`: two endpoints share an id.
- `outcome`: an endpoint has no outcome.

**Facts.**
- `api`, when an endpoint is marked `new` or `changed`. Its value is those endpoints.
- `permission`, when an endpoint's `who` is marked `new` or `changed`. Its value is `{ endpoints, access }`, where `endpoints` lists `id`, `method`, `path` and `who` for each such endpoint.

## components

The parts of the code the plan builds or reuses.

- `components`: a list. Each has:
  - `id`, `name`, `does` and `mark`.
  - `role`: `route`, `layout`, `component`, `data` or `wiring`.
  - `parent`: the component it nests in. Optional.
  - `shows`: the component it appears through. Optional.
  - `reads`: endpoint ids. Optional.
  - `repo`: a key of `plan.json` `repos`. Optional.
  - `file`: a path in that checkout. Optional.
  - `serves`: optional.
- `note`: one note for the whole list. Optional.

When the code has its own version of a part, such as a feature error boundary, mark it `new`.

**Files.** None. `file` is a path in a repo checkout.

**Rules.**
- `id`: two components share an id.
- `ref`: `parent` or `shows` names a component that does not exist.
- `reuse`: a `reused` component lacks `repo` or `file`. A reused component proves it exists. The plan tier checks that the file is in the checkout.
- `trace`, a warning: a component serves no requirement.

**Facts.** None.

## risks

- `risks`: `{ id, title, bound, serves }`. `bound` says what keeps the harm small. Optional.
- `defaults`: `{ id, says, note?, serves }`, each a choice the plan runs on until someone says otherwise. Optional.

**Files.** None.

**Rules.** `id`: two risks or defaults share an id.

**Facts.** None.

## decisions

Choices already made, with the alternatives considered. A question for a person is not a decision. Questions stay in sign-off.

- `decisions`: a list. Each has:
  - `id` and `title`.
  - `why`: optional.
  - `source` and `heading`: the plan text the decision comes from. A `heading` needs a `source`. Optional.
  - `serves` and `dependsOn`: optional.
  - `options`: `{ id, label, detail?, facts? }`. `facts` is a list of `[label, value]` pairs.
  - `chosen`: the id of the option chosen.

**Files.** Each `source`, at its `heading` when it has one.

**Rules.** `id`: two decisions or options share an id, or `chosen` is not one of the decision's options.

**Facts.** None.

## prose

A Markdown file shown as written.

- `src`: the file.
- `heading`: one section of it. Optional.

**Files.** `src`, at `heading` when it has one. The text counts as written, so a reflowed line changes this artifact's rev.

**Rules, facts.** None.

## acceptance

What a reader can check to know a requirement is met.

- `rows`: a list. Each row has:
  - `id`.
  - `requirement`: a requirement id, or `null` for a row that checks no requirement.
  - `given`, `when` and `then`, or `says` in their place. A row needs `says`, or both `when` and `then`.
  - `screens`: screen state ids. Optional.
  - `guards`: the chart rule it proves, as `rule:<name>`. Optional.
  - `addedFor`: the broken chart rule it was added for, as `rule:<name>`. Optional.

**Files.** None.

**Rules.**
- `id`: two rows share an id.
- `trace`, a warning: a row checks no requirement.

**Facts.** `acceptance`, always. Its value is the rows.

## test-plan

The tests that prove the acceptance rows.

- `tests`: a list. Each test has:
  - `id`, `name`, and `says` (what it shows).
  - `type`: `unit`, `behavior`, `e2e` or `live`. A `live` test is a check run by hand, in a browser or on a real environment. Its `says` is the instruction, and its evidence goes in the pull request.
  - `proves`: acceptance row ids.
  - `unit`: the `pr-plan` unit that holds the test.
  - `file`: the one file that holds the test, as a path in the unit's repo. Optional.
  - `run`: the command that runs this one test. Optional.
  - `proposed`: `true` when the plan does not name the test yet. Optional.

**Files.** None.

**Rules.**
- `id`: two tests share an id.
- `test`: a test proves no row. A test that is not `live` has no `run` command, has no `file`, or names something that is not one file.

**Facts.** None.

## pr-plan

The units of work and the pull requests that ship them.

The plan's other artifacts fix the contracts: the schema, the endpoint shapes, the component props. So every unit starts at once and builds against stubs of the contracts it consumes. A unit with no `startsAfter` is in the one start wave.

- `units`: a list. Each unit has:
  - `id` and `title`. Keep an id the plan already gave the unit, like `U2`.
  - `why`: optional.
  - `source` and `heading`: the plan text the unit draws from. A `heading` needs a `source`. Optional.
  - `serves`: optional.
  - `mergesAfter`: the unit ids whose pull requests merge before this unit's. It orders merges and the proof against the real upstream. It never delays the start. Optional.
  - `startsAfter`: `{ units, reason }`, the unit ids this unit waits for before it starts, and the contract that is not fixed until they finish, such as an open question or a spike. Optional, and rare.
  - `repo`: optional.
  - `files`: paths in the repo's checkout. Optional.
  - `delivers`: what the unit builds, each an endpoint id, a component id or `db:<table>`. Optional.
  - `tasks`: a count. Optional.
  - `qa`: optional.
  - `done`: the line that says the unit is finished. Optional.
- `prs`: a list. Each pull request has:
  - `id`, `title`, `repo` and `branch`.
  - `from`: the branch it is cut from.
  - `into`: the branch it merges into.
  - `planInto`: the base the plan named, when it disagrees with `into`. Optional.
  - `promotes`: the branches it reaches after `into`, such as `main`. Optional.
  - `after`: pull request ids that merge first. Optional.
  - `steps`: the unit ids it ships.
  - `review`: who reviews it and how.
  - `merge`: `{ by, why }`, where `by` is `human`, `agent` or `bot`.
  - `evidence`: what the pull request carries as proof, such as test ids and checks in words.
  - `reviewer`, `note` and `waits`: optional.
- `bot`, `label`, `notes` and `note`: optional notes for the whole list.

**Files.** Each unit's `source`, at its `heading` when it has one.

**Rules.**
- `id`: two units or pull requests share an id.
- `ref`, in each of these cases:
  - `after` names a pull request that does not exist.
  - `steps` names a unit that does not exist.
  - A unit ships in no pull request.

The plan tier checks `mergesAfter` and `startsAfter` ([checks.md](checks.md#plan-tier)).

**Facts.** `merges-alone`, when a pull request's `merge.by` is not `human`. Its value is `[id, merge]` for each such pull request.

## grant

What the agent may do without asking, what it asks first, and when a pull request may merge with no person. The artifact proposes this boundary. It grants nothing, and no rule in this skill enforces it.

- `allow`: `{ says, key }`. Each sentence keeps the key of the grant line it comes from.
- `ask`: `{ says, key }`.
- `clearance`: when a pull request may merge with no person. Optional.

**Files, rules.** None.

**Facts.** `grant`, always. Its value is the whole grant.
