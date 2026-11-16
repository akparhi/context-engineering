# Checks and revisions

`artifacts check <plan-dir>` runs two tiers and prints one line per finding:

```
check /abs/plan-dir: 9 artifacts
error type/ref pr-plan: unit U4 ships in no pull request. Name it in a pull request's steps
warn  plan/trace requirements: trace hole: R3 has no acceptance row
1 errors, 1 warnings
```

Each line gives the level, `<tier>/<rule>`, the artifact id when the finding is about one artifact, and the message. Exit 1 means at least one error. Warnings alone exit 0.

## Contents

- [Type tier](#type-tier)
- [Plan tier](#plan-tier)
- [What stays with sign-off](#what-stays-with-sign-off)
- [artifactRev](#artifactrev)

## Type tier

The type tier checks each artifact alone. It reads the artifact, checks every file the artifact names, then runs the type's own rules from `scripts/types/<type>.ts`. `check` leaves an artifact that fails `schema` out of every later check, the plan tier included, so fix schema errors first.

Every type-tier finding is an error unless the table says warning.

| Rule | Types | Fails when |
| --- | --- | --- |
| `schema` | every artifact, and `plan.json` | `plan.json` is missing, is not JSON, or breaks its schema. An artifact's file name is not lowercase letters, digits and hyphens. The file is not JSON, or not an object. `type` is not one of the 14 types. `v` is not the type's version. A field breaks the type's schema, and the message gives the field's path. An unknown field fails too. A named file path is empty, absolute, uses a backslash, or holds `..` or `#` |
| `file` | every type that names files | a named file does not exist inside the plan folder, or has no section under the named `heading`. A symlink that leads out of the folder reads as missing. An optional file, such as a run's `report.md`, may be absent |
| `id` | every type with ids | two things in one artifact share an id. In `risks` the risks and defaults share one namespace, in `decisions` the decisions and options do, and in `pr-plan` the units and pull requests do. In `decisions`, `chosen` is not one of the decision's options |
| `ref` | `screens` | `from` names a screen state the artifact lacks |
| `ref` | `components` | `parent` or `shows` names a component the artifact lacks |
| `ref` | `statechart` | a rule name is not a key of `says`. A note key is not `<run>:<rule>`, or names an unknown run. A run's `report.json` is not JSON, or is not a statechart report. The first run's report is not version 1. `triggers` names a step, or `stored` names a state, that the first run's chart does not draw |
| `ref` | `db-schema` | a listed table, or a column in `columns`, `writers` or `loose`, is not in the applied schema. Runs only with `sql` |
| `ref` | `pr-plan` | `after` names an unknown pull request, `steps` names an unknown unit, or a unit ships in no pull request |
| `jargon` | `requirements`, `screens` | a string holds a code span. The rule skips fields that hold machine words, such as `id` and `serves` |
| `render` | `screens` | no region of a screen state names its `component` |
| `reuse` | `components` | a `reused` component lacks `repo` or `file` |
| `trigger` | `statechart` | a step the first run's chart draws has no trigger |
| `ddl` | `db-schema` | `base` does not apply to an empty Postgres, or `sql` does not apply to `base` |
| `table-mark` | `db-schema` | a table marked `new` is in `base`, or a table only `sql` creates is not marked `new` |
| `index` | `db-schema` | a listed index is not in the applied schema, or its uniqueness or `where` differs from `sql` |
| `outcome` | `api` | an endpoint has no outcome |
| `test` | `test-plan` | a test proves no row, or a test that is not `live` lacks a `run` command or one `file` |
| `trace`, warning | `components` | a component serves no requirement |
| `trace`, warning | `statechart` | a rule in `serves` guards no requirement and is not in `hide` |
| `trace`, warning | `acceptance` | a row has `requirement: null` |

The `db-schema` rules `ddl`, `table-mark`, `index` and `ref` run only when the artifact has `sql`. [types.md](types.md#db-schema) says how they apply the schema.

## Plan tier

The plan tier, in `scripts/plan-rules.ts`, checks rules across artifacts. A pool is the union of one list over every artifact of a type, such as every endpoint in every `api` artifact. A check that joins to a type the plan lacks does not run. So with no `components` artifact, `check` does not ask whether a screen region's `component` exists.

Every plan-tier finding is an error unless the list says warning. Each finding names the artifact it is in, except `id` and `one`.

- `id`: an id repeats across artifacts. Two endpoints in two `api` artifacts share an id, or a unit in `pr-plan` and a risk in `risks` do. A repeat inside one artifact is the type tier's `id` rule.
- `ref`: a reference names something no artifact holds. Each check runs only when the plan has the type it names:
  - With `requirements`, a `serves` anywhere, or an acceptance row's `requirement`, names no requirement.
  - With `components`, a screen region's `component` names no component.
  - With `api`, a component's `reads` names no endpoint, and a chart trigger's `endpoint` names no endpoint.
  - With `screens`, an acceptance row's `screens` names no screen state. With `statechart`, its `guards` or `addedFor` names no chart rule.
  - With `acceptance`, a test's `proves` names no row. With `pr-plan`, its `unit` names no unit.
  - A component's `repo` is not a key of `plan.json` `repos`.
  - A decision's `dependsOn` names something that is not a unit or a decision. A unit's `mergesAfter` or `startsAfter.units` names something that is not a unit. These checks always run.
  - A unit's `delivers` names something that is not an endpoint, a component, or `db:<table>` for a table. `check` tests a `db:` entry only when the plan has a `db-schema` whose schema is known, which means it has no `sql` or its `sql` applies. It tests any other entry only when the plan has `api` or `components`.
  - When `sql` applies, an endpoint body field's `column` is not in the applied schema.
  - When the plan has a `db-schema` and the first run of its `statechart` has a version 1 report, a `writers` entry names a step the chart does not draw.
- `order`: a unit's `startsAfter` has no `reason`, units wait on each other in a cycle through `mergesAfter` and `startsAfter`, or pull requests do. A pull request merges after those its `after` names and those that ship a unit its own units wait on. A unit starts with the others on stubs unless it names the contract that is not fixed yet.
- `write`: with a `statechart`, a `POST`, `PUT`, `PATCH` or `DELETE` endpoint is no chart step's trigger and has no `noTransition`.
- `stored`: when `sql` applies, the column a chart state is stored in is not in the applied schema.
- `reuse`: a `reused` component has a `repo` and a `file`, and either `repo` is not a key of `plan.json` `repos` or that checkout has no such file. Without a `repo` or a `file`, the type tier's `reuse` rule reports it.
- `jargon`: a string in the `requirements` or `screens` artifact names a tech term of this plan. A tech term is a name that looks like code, with a lowercase letter before a capital, or a `/`, `.`, `_` or `@`. The names come from tables, the applied schema's columns, component names and files, endpoint paths, and unit files.
- `one`: the plan has more than one artifact of `requirements`, `statechart`, `db-schema`, `acceptance`, `test-plan`, `pr-plan` or `grant`.
- `trace`, warnings:
  - With `api`, `components` or `db-schema`, no endpoint, component, table or column serves a requirement.
  - With `acceptance`, a requirement has no acceptance row.
  - With `test-plan`, an acceptance row has no test.

## What stays with sign-off

Sign-off checks what only a review needs, and this skill checks none of it:

- `touch`: which items need a person, from the facts each item shows.
- `cite`: every heading in a cited plan file has an item that cites it.
- `section`: the sections a plan of its `kind` must have.
- `log`: the lines of `reviews/events.jsonl`.
- Whether `api` `access.ask` names a real question. Questions live in sign-off.

## artifactRev

`artifactRev(data, files, read)` in `scripts/rev.ts` is one artifact's revision. A reviewer compares it with the revision a person gave a verdict on, to know whether the artifact changed since. No command prints it. Pass the parsed data, without `type` and `v`, and the type's `files(data)`.

It is a SHA-256 hash, cut to 12 hex digits, of two things:

- The artifact's data, as JSON with sorted keys.
- The words of each file the type names, except a `derived` file. With a `heading`, only that section counts.

What counts as a file's words:

- JSON counts as data, so key order and layout do not count.
- In `.sql`, `.dbml`, `.mmd` and `.md`, comments are dropped and each run of whitespace collapses to one space. A `.md` comment is `<!-- -->`.
- A quoted string in `.sql` or `.dbml` counts as written, with its spaces and any comment marker in it. In SQL that is a `'...'` string, a `"..."` name and a `$$...$$` body.
- A `prose` artifact's file counts as written, so a reflowed line counts.
- A statechart run's `report.json` counts with its states and arrows as sets, so their order does not count. Of `report.md`, only the line that opens "TLC reached" counts.
- Any other file counts as written. In YAML the indent is meaning.

Three limits follow from reading text this way:

- Whitespace added where there was none moves the rev. `create table holds (id int);` and the same table with `id int` on its own line have different revs, because a space now sits beside each bracket.
- A reflowed function body between `$$` moves the rev, because the body is a quoted string.
- A backslash escape in a SQL `E'...'` string is not read. The string ends at the escaped quote, so the text after it is read as SQL.

These never move an artifact's rev:

- The order of keys in the artifact's JSON.
- The artifact's id, `type` and `v`.
- A derived file, such as the DBML drawn from `sql`.
- Text outside the named section of a file.
- `plan.json`, and every file no artifact names.

`artifactRev` throws when a required file or its heading is missing, for the same cause the `file` rule reports. Run `check` first.
