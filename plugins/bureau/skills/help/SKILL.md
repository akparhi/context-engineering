---
name: help
description: Guides users through bureau setup, /hotline, and picking the skill, playbook, or principle for a task. Type /bureau:help with a question.
disable-model-invocation: true
---

# Bureau help

Answer the user's question about bureau, hand them a prompt they can send, and link the file the answer came from. For a help question, don't start the work. The user asked how, and a bureau run spends real tokens, so let them send the prompt.

A message that asks for work, such as "use hotline to fix this bug", is not a help question. Read [`hotline`](../hotline/SKILL.md) and do the work under it.

This file maps questions to the installed skills, playbooks, and hooks that own the answers. Read the matching source before answering. Its instructions take precedence over this map and over the upstream pstack-claude guide, which describes `setup-pstack` and other runtimes that this fork drops. The local links point into the installed plugin, so give the user the file's public copy: `https://github.com/akparhi/context-engineering/blob/main/plugins/bureau/` followed by its path relative to the plugin root.

## Find out what they need

Infer the need from the message and the conversation. A named situation, such as "which skill reviews a PR?", goes straight to its section. If the need is still unclear, ask one multiple-choice question with these options, then answer only the section they pick:

- Get set up
- Start a task with `/hotline`
- Pick a skill for a situation
- Fix a run that went wrong
- Make bureau my own

Check the state that changes the answer, and mention it only when it does:

- For model questions, read the `# Bureau models` block the SessionStart hook injected into this chat. It is [`models.json`](../../models.json) with the user's `/config` choices merged in, so it shows which models actually run. Check it before saying whether defaults or overrides apply.
- No project `verify` or `verify-*` skill or other app harness means agents have no scripted way to drive the app. Mention `/create-verification-skill` when the question is about proving a change works.
- No formal verification skill in the project means no property is checked past what tests reach. Mention `/create-formal-verification-skill` when the question is about a race, an invariant, or another case tests rarely hit. When one exists and the code it covers changed after the commit it records as last in sync, mention `/maintain-formal-verification-skill` if the question touches that code.

## Get set up

1. bureau runs on Claude Code only. Give the install commands from the repository [README](https://github.com/akparhi/context-engineering/blob/main/README.md#plugins): `claude plugin marketplace add akparhi/context-engineering`, then `claude plugin install bureau@akparhi`, then a restart.
2. Read the [SessionStart hook](../../hooks/session-start.sh), its [routing context](../../hooks/session-start-context.md), and [`models.json`](../../models.json) before explaining model choices, effort, or automatic routing. Routing is always on, with no setting to turn it off. Each role keeps its `models.json` model until the user overrides a tier, the default effort, or the role in `/config`. The hook runs at startup, resume, `/clear`, and compaction, so a `/config` change applies from the next of those. If the project has no verification skill or formal verification skill, offer `/create-verification-skill` or `/create-formal-verification-skill` once each.
3. Offer a first task prompt with a goal and a check that can pass or fail, per [`references/prompting.md`](references/prompting.md). Each skill answers to `/<name>`, and to `/bureau:<name>` when another plugin uses the same name.

If cost is the worry, say where the tokens go and how to spend less. bureau spends extra tokens on subagents and review panels. In `/config`, pick a lower default effort or cheaper tier models. A role or tier set to `inherit-parent` runs on the chat's model, which costs less when the chat runs on a cheaper model. Setting a panel slot to `none` drops it, and the panel runs one subagent for each slot left. Save `/hotline` for work that needs rigor.

## Start a task with `/hotline`

`/hotline` matches the task to a playbook, copies the playbook's steps into the todo list, and runs the other skills as the steps need them. A step it skips stays in the list as `skip: <reason>`. A good prompt states the goal and how to tell it's done. It doesn't list skills, because a hand-written sequence tends to drop or reorder steps the playbook would keep. Read [`references/prompting.md`](references/prompting.md) before you help word one.

The SessionStart hook routes a task to hotline on its own when it touches more than one file, changes a signature other files call, involves a design choice, or is a bug with an unknown cause or a performance issue. For anything smaller, invoke `/hotline` by hand. Mid-chat, "new task" makes the mode match a fresh playbook. For subagent defaults, read [hotline's Subagents section](../hotline/SKILL.md#subagents).

## Pick a skill

The default answer is `/hotline`, which runs most of the others when its steps need them. Name a skill directly when the user wants more or less of something than the playbook gives. Read the skill before you recommend it, and give one example prompt.

| The user wants to | Skill |
|---|---|
| Do any non-trivial task with rigor | [`/hotline`](../hotline/SKILL.md) |
| Get interviewed one question at a time to pin down intent before design | [`/brainstorm`](../brainstorm/SKILL.md) |
| Aim a task higher before starting: more expert, more outcome-focused, not overspecified | [`/sharpen`](../sharpen/SKILL.md) |
| Know how code works now, or where new code should live | [`/how`](../how/SKILL.md) |
| Know why code is shaped this way, or where a number came from | [`/why`](../why/SKILL.md) |
| Understand a change or subsystem, explained plainly | [`/teach`](../teach/SKILL.md) |
| See the current topic as diagrams, code-shape sketches, or a small HTML page | [`/show-me`](../show-me/SKILL.md) |
| Catch up on their own recent work on a topic | [`/recall`](../recall/SKILL.md) |
| Catch up on what changed in this chat since their last message, in plain words and small visuals, with every item waiting on them listed and decidable from the reply alone | [`/ketchup`](../ketchup/SKILL.md) |
| Know what a small diff could break outside itself | [`/blast-radius`](../blast-radius/SKILL.md) |
| Settle types and module shape before code that crosses a function boundary | [`/architect`](../architect/SKILL.md) |
| Get several attempts at one brief, merged into the best one | [`/arena`](../arena/SKILL.md) |
| Run parallel checks over slices, or race workers | [`/swarm`](../swarm/SKILL.md) |
| Get a change or a plan reviewed by parallel correctness, code-quality, and adversarial reviewers | [`/review`](../review/SKILL.md) |
| Have different models review a diff and try to break it | [`/interrogate`](../interrogate/SKILL.md) |
| Fix a bug test-first when a cheap local test exists | [`/tdd`](../tdd/SKILL.md) |
| Write or audit tests so they check behavior and earn their place (loads on its own, with no slash command) | [`bureau:test-audit`](../test-audit/SKILL.md) |
| Apply TypeScript rules to `.ts` or `.tsx` work | [`/typescript-best-practices`](../typescript-best-practices/SKILL.md) |
| Strip comments before review, using a reviewer that didn't write them | [`/no-comments`](../no-comments/SKILL.md) |
| Open or tidy a PR with a description and commits a reviewer can follow | [`/pr`](../pr/SKILL.md) |
| Clean AI tells out of prose | [`/unslop`](../unslop/SKILL.md) |
| Write docs, an RFC, a README, a PR description, or a commit message to a standard | [`/technical-writing`](../technical-writing/SKILL.md) |
| Give agents a scripted way to drive the app and prove behavior | [`/create-verification-skill`](../create-verification-skill/SKILL.md) |
| Bring a verification skill and its feature map back in line with the app | [`/maintain-verification-skill`](../maintain-verification-skill/SKILL.md) |
| Formally verify a race, invariant, or other property that tests rarely reach | [`/create-formal-verification-skill`](../create-formal-verification-skill/SKILL.md) |
| Bring a formal verification back in line after the code it covers changed, and learn whether a failure is drift or a bug | [`/maintain-formal-verification-skill`](../maintain-formal-verification-skill/SKILL.md) |
| Vet a performance number before reporting or acting on it | [`/benchmark-checklist`](../benchmark-checklist/SKILL.md) |
| Run a large or cross-cutting change, or one to review after stepping away | [`/figure-it-out`](../figure-it-out/SKILL.md) |
| Keep a decision log during a run, and review it afterward | [`/show-me-your-work`](../show-me-your-work/SKILL.md) |
| Pick a model for each role and a default effort | `/config`, which overrides [`models.json`](../../models.json) per user |
| Turn their own working habits into a personal mode skill | [`/automate-me`](../automate-me/SKILL.md) |
| Turn what a finished task taught into skill edits | [`/reflect`](../reflect/SKILL.md) |
| Find out from past sessions why a skill, workflow, or habit went badly | [`/retro`](../retro/SKILL.md) |
| Stop agents from repeating the same mistakes in this repo | [`/correct`](../correct/SKILL.md) |
| Find their way around bureau | `/bureau:help` |

If a skill directory next to this one is missing from the table, read its frontmatter and route by its description. The `principle-*` directories are covered under principles below.

Close calls:

- `/how` explains what the code does. `/why` explains the reasons. `/teach` runs one or both and explains the result plainly.
- `/arena` gives every worker the same brief and merges the best parts. `/swarm` splits work into slices or a race and returns one report.
- `/architect` implements right after it settles the design. Add "with checkpoint" to review the design before it writes code.
- `/review` runs fixed correctness and code-quality lenses over a change or a plan. `/interrogate` has different models attack the diff. `/blast-radius` looks for breakage outside the diff and proves the one fact that makes the change safe.
- `/recall` rebuilds context across recent chats. `/ketchup` covers only this chat since the user's last message. Resuming one specific chat or branch is the Session pickup playbook.
- `/reflect` turns one finished session into skill edits. `/retro` answers a question across many past sessions with measured evidence.
- `/figure-it-out` designs one rigorous run. The Orchestrate playbook runs a program that spans days and many PRs. The Autonomous run playbook drives one task to a finish condition.

Not in bureau:

- The Cursor driver skills have no port. The driver policy in hotline's Non-negotiables names the Claude Code equivalents, the `run` skill and a project `verify` skill.
- `/loop` is a Claude Code bundled skill, and the **plugin-dev:skill-development** skill is Claude Code's skill-authoring guidance.
- bureau has no orchestrate skill. Orchestrate is a `/hotline` playbook. If the slash menu shows an orchestrate command, another plugin provides it.
- bureau has no setup skill. Model choices live in [`models.json`](../../models.json) and `/config`.

## Playbooks and principles

Playbooks are step lists inside `/hotline`, not skills, so they have no slash command. Inside `/hotline`, describing the task picks one, and these phrases name one directly:

- "babysit this pr" or "check on pr 123" runs Babysit. It drives the PR to merge-ready and stops there. It doesn't merge unless the user asks to merge, land, or ship.
- "land the stack" runs Shipping.
- "take over this branch" runs Session pickup.
- "pause safely" runs Pause safely.
- "full autopilot on this queue" runs [Autopilot-full](../hotline/playbooks/autopilot-full.md). "stack them, don't ship" runs [Autopilot-stack](../hotline/playbooks/autopilot-stack.md). Read the selected playbook's merge rules before explaining what runs unattended.
- "run the eval playbook" runs Eval.

Without `/hotline`, a phrase such as "babysit this pr" can start bureau's standalone [`/babysit`](../babysit/SKILL.md) skill instead. The [Playbooks section](../hotline/SKILL.md#playbooks) lists every playbook and when it applies. Read [Babysit](../hotline/playbooks/babysit.md) or [Shipping](../hotline/playbooks/shipping.md) for the PR workflow.

bureau has no planning skill. Claude Code's plan mode works alongside it. For work that spans phases or stacked PRs, asking `/hotline` for a plan runs the [Multi-phase plan playbook](../hotline/playbooks/multi-phase-plan.md), which writes the plan and doesn't implement it. For a design question, the Prototype playbook or `/architect` settles it in code first.

Principles are one-rule skills that `/hotline` reads and cites in its replies. The user rarely invokes one. They steer with the names instead, as in "apply prove it works. show me the real output." The `principle-*` leaves are hidden from the slash menu, and the model loads them when their situation comes up. The [Principles index](../hotline/SKILL.md#principles) lists them.

## Fix a run that went wrong

| Symptom | Fix |
|---|---|
| The mode stopped applying after a few turns | The hook routes only the tasks named under [Start a task](#start-a-task-with-hotline). Invoke `/hotline` for any other task. |
| A question got treated as the next step of the last task | Say "new task", or say the turn doesn't need the mode. |
| A new model choice had no effect | Check that the `/config` value isn't the `models.json: ...` option, which keeps the file's value. Then start a new session or run `/clear` so the SessionStart hook reruns, and read the injected `# Bureau models` block. A model outside its `available` list runs as an agent type of that name, which another plugin such as switchboard must provide. |
| Runs cost more than expected | See the cost paragraph under Get set up. |
| A skill didn't load on its own | Read its description. A skill marked `disable-model-invocation: true` runs only when the user types it. Invoke it explicitly when needed; `/hotline` doesn't run every skill. |
| Parallel agents overwrote each other | Give each agent its own worktree. |
| An overnight run moved but finished nothing | Read [Autonomous run](../hotline/playbooks/autonomous-run.md) and give `/loop` the finish condition. For a queue, read the selected Autopilot playbook above. Give the run a check that can pass or fail. |
| The reply claims success from a green build | Ask for the real command, flow, stored value, or profile. That's the prove-it-works principle. |

For a run that drifts, [`references/prompting.md`](references/prompting.md) has one-line steers, and [`references/recipes.md`](references/recipes.md) has prompts to adapt.

## Make bureau my own

- [`/automate-me`](../automate-me/SKILL.md) drafts a personal mode skill from the user's own history, to use alongside `/hotline`.
- [`/reflect`](../reflect/SKILL.md) after a session turns its lessons into skill edits the user approves.
- `/hotline write a skill for <workflow>` runs the authoring playbook. The eval playbook tests a skill change blind.
- Fix a misbehaving skill in its own PR, not inside the feature work where it went wrong.

## Reply

Lead with the answer. Give at most one example prompt in a code block, adapted from [`references/recipes.md`](references/recipes.md) when one fits, then the link to that file. Keep it short unless the user asked for the whole map.
