---
name: artifacts
description: "Write a plan, or any change you propose, as typed JSON artifacts and check them. Use whenever you propose a schema or table change, endpoints, a state machine, components, tests or a pull-request split while planning. Also use to build from a plan's artifacts, or when `artifacts check` reports a finding."
---

# Artifacts

An artifact is one part of a plan, held as one typed JSON file. A plan folder holds the plan's artifacts and every file they name. A planner writes and checks the artifacts, and an executor builds from them. Neither needs sign-off, and a proposal of one table or one endpoint is already a plan. When a person must approve the plan, the [sign-off](../sign-off/SKILL.md) skill runs the review. It keeps the items a person decides, the questions and the log of verdicts.

## The plan folder

```
<plan-dir>/
  plan.json                 the plan's identity: id, kind, title, ask, and optionally ticket, sources, repos
  artifacts/<id>.json       one artifact: { "type": "<type>", "v": 1, ...data }. The file name is its id
  <the files artifacts name>
  sign-off.json, reviews/   only when a person reviews the plan. Sign-off owns them
```

- An artifact id is lowercase letters, digits and hyphens. When the plan has one artifact of a type, name the file after the type, such as `artifacts/api.json`.
- A file an artifact names is a path relative to the plan folder, with forward slashes and no `..`. A heading goes in the artifact's `heading` field, never in the path. So you can copy, check and read the folder with nothing beside it.
- In `plan.json`, `kind` is `change`, `design` or `questions`. `repos` maps a repo name to its checkout, as a path relative to the plan folder or an absolute path. Prefer a relative path. A checkout may sit outside the folder. `ticket` and each of `sources` take an http or https URL. Fill them from the ticket and never guess a URL.

## The types

[references/types.md](references/types.md) gives each type's fields, the files it names, its rules and its facts. The schema in `scripts/types/<type>.ts` is the contract.

| Type | Holds |
| --- | --- |
| `requirements` | the problem, who has it, goals, non-goals, rollout, the metric, and the requirements every other artifact serves. Or `{ "none": "<why>" }` |
| `screens` | the page states a person sees, each as regions with a sketch and a sample |
| `evidence` | the numbers the plan rests on, each with where it was read |
| `statechart` | the behavior model: each rule in words, the runs of `bureau:statechart`, and what makes each step happen |
| `db-schema` | the database change: Postgres DDL, its baseline, DBML for the picture, and the marked tables and indexes |
| `api` | the endpoints with their outcomes, an OpenAPI fragment, access, the envelope and shared shapes |
| `components` | the parts of the code the plan builds or reuses, and how they nest |
| `risks` | risks with their bound, and the defaults the plan runs on |
| `decisions` | choices already made, each with the alternatives considered |
| `prose` | a Markdown file, or one section of it, as written |
| `acceptance` | rows a reader can check to know a requirement is met |
| `test-plan` | tests, each with the rows it proves, its unit, its file and its command |
| `pr-plan` | the units of work and the pull requests that ship them, in order, with who merges each |
| `grant` | what the agent may do without asking, what it asks first, and when a pull request merges with no person |

A plan holds at most one each of `requirements`, `statechart`, `db-schema`, `acceptance`, `test-plan`, `pr-plan` and `grant`. Other types may repeat, such as two `prose` files.

## Propose

When you propose a schema or table change, endpoints, a state machine, components, tests or a pull-request split, write the proposal as artifacts before you describe it. Do this with no sign-off and no formal plan too. `check` then finds a column no table has, or an endpoint that serves a requirement nobody wrote, before a person reads the proposal.

1. Make a plan folder with a `plan.json`.
2. Write one artifact for each part you propose, and only those. One new table is one `db-schema` artifact and its DDL. A rule that joins two types runs only when the plan has both. [fixtures/plan](fixtures/plan) is a whole plan with one artifact of every type. Copy from it.
3. Run `check` until it reports 0 errors.
4. Show the proposal in your reply. Give the plan folder's path, and put what the person decides on in the reply itself: the DDL, each endpoint with its outcomes, the chart's rules in words, the units and their pull requests. This skill draws nothing yet. A drawn view of one artifact comes when the renderers move into this skill. Until then sign-off's `render` needs a `sign-off.json`, so it fails on a folder that holds artifacts alone.

## Run

Run the command by path:

```sh
bun ${CLAUDE_SKILL_DIR}/scripts/artifacts check <plan-dir>
```

The first run installs the pinned dependencies with bun. `--help` or `-h`, alone or after `check`, prints the usage line and exits 0. Bad arguments print the usage line and exit 2, and so does a folder that does not exist. Otherwise exit 0 means no errors, though warnings may print, and exit 1 means `check` found an error.

## Check

`check` runs two tiers. The type tier checks each artifact alone: its schema, the files it names, and its type's rules. The plan tier checks rules across artifacts, over every artifact that passed its schema. Each finding prints as `error <tier>/<rule> <artifact>: <message>`, or with `warn` for a warning.

Run `check` until it reports 0 errors. A warning is a trace hole. Fix it, or say why it stays. [references/checks.md](references/checks.md) lists every rule, what fails it and its level, and how `artifactRev` gives each artifact its revision.

## Who reads artifacts

- **A planner** writes `plan.json` and one artifact per part, whether for a whole plan or one proposed change, by [references/types.md](references/types.md), then runs `check`. For a statechart, run `bureau:statechart` with `--out` inside the plan folder, and name that folder in the artifact's `runs`.
- **An executor** reads the artifacts and nothing of sign-off's. `pr-plan` gives each unit's repo, files, deliverables, merge order and done line, and each pull request's branch, base, units and merge. `api`, `db-schema` and `components` say what to build. `acceptance` and `test-plan` say how to prove it. Start every unit at once, each on stubs of the contracts it consumes. `mergesAfter` orders merges only, and a unit waits to start only when it has a `startsAfter`. Work under the authority your task already has. A `grant` artifact proposes a boundary and grants nothing.
- **A run that requires sign-off** before work starts reads `sign-off status` itself. No check in this skill gates work.
- **A reviewer such as sign-off** gets two things from this skill. Each type's `facts` say what the artifact shows, such as `schema` when a table is new or changed. `artifactRev` changes when the artifact's data or the words of a file it names change. JSON key order does not move it, and neither do comments or the width of whitespace in SQL, DBML, Mermaid and Markdown. A quoted string counts as written. [references/checks.md](references/checks.md#artifactrev) says what counts in each kind of file, and which layout changes still move it. The reviewer decides what a fact means and which parts need a person.
