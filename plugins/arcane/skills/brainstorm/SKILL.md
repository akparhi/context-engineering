---
name: brainstorm
description: Interview the human one question at a time to pin intent, then write a brief or spec before design. Use only for /brainstorm, 'brainstorm this', 'grill me', 'interview me', or when alchemy routes here because a new project or subsystem arrives without a stated purpose or success criteria. Not for work whose intent the request or the repo already settles.
---

# Brainstorm

Pin down what the human wants before anyone designs it. Question the human, write the answers back as a brief, get one approval, then hand off to the autonomous workflow.

This is the scoped exception to the **never-block-on-the-human** principle skill. Its boundary says product direction comes from the human. Brainstorm collects that direction up front, in one sitting, so execution never has to stop for it later. Once the brief is approved, autonomy resumes.

## Skip when

Say which rule applies and route on. Don't interview.

- The request already states the outcome, who it serves, and how success is judged. Reflect it back in two lines and proceed.
- The change is bounded: the flow it touches already exists in the repo to read. Go to the matching alchemy playbook.
- Every open question is a fact an experiment can answer (behavior, timing, output, perf). Run `skills/alchemy/playbooks/prototype.md`.
- A full-autonomy grant is in force. Apply defaults, report each with the word that reverses it, per alchemy's Non-negotiables.

## Start

Open a todolist with one entry per phase.

1. Ground
2. Size
3. Grill
4. Brief
5. Approve
6. Hand off

## Phase 1: Ground

Read before asking. Check the repo, its docs, and recent commits. Run the **how** skill on any subsystem the work touches. Every question the code can answer is one you don't ask.

If the request spans several independent subsystems, say so now and propose the split. Brainstorm the first piece only. Each piece gets its own brief.

## Phase 2: Size

Pick the artifact and say it out loud, so the human can override.

- **Brief**: the work fits one feature or one PR. Output is a short brief in chat.
- **Spec**: new project, new subsystem, or a change to interfaces others depend on. Output is a spec file.

A mid-interview surprise can upgrade brief to spec. Say so when it does.

## Phase 3: Grill

Walk the decision tree one branch at a time. Resolve the choices other choices depend on first.

- One question per message. Use `AskUserQuestion` with 2-4 options and put your recommendation first, with the reason.
- Ask only product and preference calls: purpose, audience, success criteria, scope, non-goals, trade-offs the human owns. Execution calls (names, file layout, libraries, patterns) are yours. Decide them later and report them.
- A question whose answer is observable goes to a prototype, not the human.
- Apply the **laziness-protocol** principle skill to scope. Offer to cut features. Never cut one the human asked for.
- Stop when every remaining unknown is an execution call. Most briefs need three to six questions. Past ten, stop and write the brief with the gaps marked.

## Phase 4: Brief

Write the answers back so the human can spot what you got wrong.

```markdown
# <Topic>

**Goal.** <The outcome, for whom, in one or two sentences.>
**Success.** <How the human will judge it done. Observable where possible.>
**Constraints.** <Hard limits: platforms, deadlines, dependencies, compatibility.>
**Non-goals.** <What this deliberately won't do.>
**Approach.** <Your recommended shape and one runner-up, each in a sentence, with why you prefer the first.>
**Decided by the human.** <Each answer from Phase 3.>
**Assumed.** <Each call you made without asking. The human corrects these.>
**Open.** <Anything still unknown, and who settles it.>
```

For a spec, use the same headings, then add sections for components, data flow, error handling, and verification, each scaled to its complexity. Stop at the level of behavior and interfaces. Types and signatures belong to the **architect** skill. Write the spec to the path the human names, or under the agent store at `~/.claude/orchestrate/<slug>/docs/<YYYY-MM-DD>-<topic>-spec.md`. Write it per the **technical-writing** skill, then **unslop**.

Before showing it, reread it once for placeholders, contradictions, and any requirement that reads two ways. Fix them in place.

## Phase 5: Approve

The one gate. Show the brief, or post the spec path, and stop. Wait for an explicit yes.

Corrections loop back to the phase they touch: a wrong goal goes to Phase 3, a wrong assumption only needs the brief edited. Don't ask for approval section by section.

## Phase 6: Hand off

Once approved, the brief is the contract. Don't ask again about anything it settles.

- **Brief** → run the alchemy playbook for the task (Feature, Refactoring, and the like) with the brief as the task statement.
- **Spec** → the **architect** skill for code shape, or `skills/alchemy/playbooks/multi-phase-plan.md` when the work spans phases or PRs. Pass the spec path.

Downstream gates are whatever those playbooks already set. Brainstorm adds none. If execution finds a gap the brief doesn't cover, decide it when it's an execution call. When it's a product call, record the default you picked in the decision trail and flag it in the report, per **never-block-on-the-human**.
