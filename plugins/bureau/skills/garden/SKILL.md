---
name: garden
description: Audit a codebase for the competing patterns, stale code and unenforced rules that agents would copy, and write a plan that leaves one supported way per concern, enforced by code. Counts every variant with a rerunnable census, ranks by replication risk, and orders each fix as guardrail, migration, verification, then prose removal. Changes no code. Use for /garden.
disable-model-invocation: true
---

# Garden

The codebase is the largest input an agent reads. An agent copies whatever looks established, debt included. Find what it would copy wrongly and plan its removal.

Assume every contributor is an agent that opens the nearest file, takes the top search hit, and trusts a green gate. A pattern is a weed when that agent would reproduce it and nothing would fail.

Garden writes a plan and leaves the audited checkout and shared services unchanged. It writes only to the plan folder and to disposable scratch copies. An argument narrows the audit to a path or a concern. With none, audit the whole repo. Given several repos, run Ground through Rank per repo, with one census script and every result labelled by repo. Then merge the classes that share a cause, rank the combined findings, write one plan, and report the combined ranking and its top three. [`correct`](../correct/SKILL.md) starts from mistakes the operator already corrected and fixes them now. Garden starts from the code and needs no history.

Label every claim **read** (you saw the line or counted it), **inferred**, or **not run**. Cite `file:line`. A search that finds nothing is a finding.

## Ground

1. Read the agent instruction files: `AGENTS.md`, `CLAUDE.md`, rules, skills, and the review bot's rules. List each rule they state and the example file they tell agents to copy.
2. Read the guardrails: lint config, type-check config, CI workflows, pre-commit hooks, test config, and the merge rules. Follow each to the shared workflow, preset or scaffold template it comes from, and read that too.
3. Trace each gate the instructions name to the command that does the work, then run it. Run a gate that writes, such as `--fix`, a migration, a database reset or a network call, only in a scratch copy with disposable services and credentials. Otherwise mark it not run. A gate counts only when it would fail on a bad change. Look for these failures. A task runner finds no task and exits 0. A lint step fixes where it should fail. Rules are set to `warn` with no warning limit. A type-check skips test files. A test runner ignores type errors. CI skips tests. A status job counts a skipped job as passed. A check runs locally but not in CI. The merge rules don't require a check. If you can't run a gate, say so and mark what depends on it not run.

## Census

1. List the concerns this stack has. Start from type strictness and its escape hatches, errors, HTTP clients, config and env, money and units, dates, data access, transactions, queues and events, auth, logging, module layout, and tests. Add the ones the repo's domain brings and drop the ones it lacks.
2. Group the concerns and fan out one worker per group through `bureau:swarm`. Each worker returns, per concern, every variant in use with its count, two or three cites, the variant the rules name, and the variant newer code uses.
3. Save the queries as one script in the plan folder, written in the repo's own scripting language. It prints one line per concern and variant with its count. Run it and save the output as the baseline. Every count in the plan comes from this script, per `bureau:principle-build-the-lever`.

The plan folder is where the repo keeps plans. With no convention, use `.garden/` at the repo root. For several repos, use one folder outside them.

## Weeds

A concern with one variant and an enforcing check is healthy. Skip it. For the rest, and across the repo, look for these spreaders:

- Legacy code that sits next to its replacement, with nothing marking which one to use.
- A per-app or per-package copy of code that a shared package already holds.
- An API that needs nuance to use well and is open to all product code.
- An import that crosses a boundary the directory layout implies.
- Commented-out code, and a comment, TODO or rule that justifies a workaround.
- A prose rule that no check enforces. Count how often the code breaks it.
- A rule that prescribes a weed, claims what the config contradicts, or conflicts with another rule.
- The example the instructions name, when it breaks the rules it stands for.
- A gate from Ground that passes without checking.
- Code with no importers that still looks canonical. First rule out public exports, executable and registration entry points, discovery by name or decorator, and external consumers. Where consumers can't be ruled out, record it as unproven.
- A map of the repo in the instructions that omits or misnames what exists.

## Rank

Score each weed on three things, and rank by all three together.

- **Copy likelihood.** It sits in the file an agent opens first for that task, it is the top search hit for the obvious name, it is one line, or the named example carries it.
- **Spread.** The count of each variant, from the census, and how it moved. Run the same census script at two or three dated revisions in a scratch copy. Record the revision, the source scope and the code size with each count. Where history is unavailable, mark growth not run. Growth per source line breaks ties only among weeds of comparable cost and copy likelihood.
- **Cost.** Money, security and data loss first, then correctness, then maintainability. Say what goes wrong when the copy lands somewhere the original's assumptions don't hold.

Name one canonical exemplar per concern. It is a file that follows every rule, and the instructions can point agents to it. If none exists, the plan builds one before anything else for that concern.

## Plan

Write `plan.md` in the plan folder. Each weed class gets one entry with the pattern, spread, cites, why an agent copies it, cost, the supported way, the exemplar, where the fix lands, and the rung of [`correct`](../correct/SKILL.md)'s ladder it lands on. Take the highest rung that works and say why a higher one didn't. When a shared workflow, preset or scaffold template carries the weed, plan the fix there, ahead of the per-repo units.

Order the work inside each class this way:

1. **Guardrail.** A check that fails on every new occurrence. Its error names the file, type or function to use instead. It tells new from existing by identity, the file and symbol of each occurrence. Either it compares the occurrences at the pull request's base and head, which needs no checked-in baseline, or it keeps a baseline that lists each existing offender. CI stays green on day one either way. A count tracks progress only. As a gate, it lets a new offender replace a removed one. Delete any rule that prescribes the old way in the same unit.
2. **Migrate and delete.** Move the existing callers to the supported way and delete the old way in the same wave, per `bureau:principle-migrate-callers-then-delete-legacy-apis`. The baseline shrinks to zero and then goes.
3. **Verify.** The test or run that proves the behavior held. Where the repo can't drive the app, plan `bureau:create-verification-skill`. Where the risk is a path through states, plan `bureau:statechart`.
4. **Shrink the prose.** Delete the rule, comment or doc the check now replaces. Plan `bureau:no-comments` and `bureau:deslop` for the comment and dead-code classes.

Order the classes this way:

- Gates that pass without checking come first. No guardrail holds until the gates run.
- Deletions with no callers come next, per `bureau:principle-subtract-before-you-add`. Code that has external consumers, or whose consumers are unproven, gets a deprecation step or a compatibility decision before it is deleted.
- The rest follow the ranking.

Cut the plan into PR-sized units per `bureau:principle-sequence-verifiable-units`. Each unit names its check and the census line that must move, with the count before and the count after.

Prove each guardrail before it enters the plan. Draft the rule in a scratch copy. Run it against a real offender from the census, and against a swap where one existing offender goes and a new one appears. Paste both failures. If you can't run it, mark the guardrail not run and make "fails on `<cite>`" the first check of its unit.

End the plan with the rule table: each rule paired with what enforces it today and what will enforce it after the plan, per `bureau:principle-encode-lessons-in-structure`. A rule that stays prose says which judgment call keeps it there. Then list open questions, such as two variants with no clear winner. Recommend one and say what would change the pick.

## Review and present

Run `bureau:review` on the plan and fix what it proves. If the user wants to approve the plan before work starts, present it through `bureau:sign-off`. Start no unit until the user asks.

**Reply:** which gates really run, the ranked table (pattern, spread, cost, fix), the top three in full, what you could not see or run, and the paths to the plan, the census script and its baseline.
