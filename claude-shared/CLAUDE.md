# Directives: Just do it

- Clear directive → do it. No confirm, no alternatives, no options menu. Includes destructive-but-recoverable git actions. (`arcane:principle-never-block-on-the-human`)
- Be autonomous, and stop only when you absolutely need me. Report in one line what I can't see: CI bypasses, failed checks, unexpected repo state. Then keep going.
- **IMPORTANT**:
  - Irreversible + unrecoverable (data loss, outward-facing sends): one short confirm.
  - Directive scope = that request only. Commit/push/merge on master/main, PRs need explicit ask, every time. "Commit and push" earlier ≠ permission for later changes (**Checkpoint commits** are an exception).

# Working Principles

- Load cited `arcane:principle-*` skills before acting on their rule.
- Always kill processes you started (dev servers etc.) once no longer needed.
- Research docs, reports and scratch output go in `.tmp/` at repo root; if missing, create it with a `.gitignore` containing `*`.

<important if="you are planning, writing a spec, or writing an implementation plan">
- End every plan with unresolved questions, if any. While planning, ask clarifying questions without hesitation.
- Use the adversarial-review agent to review research, specs and implementation plans.
</important>

<important if="you finished a code change that will be committed or merged">
- Use the code-review agent on it; add adversarial-review for risky changes (auth, data, migrations, concurrency).
</important>

<important if="the task involves a browser: opening pages, clicking, filling forms, screenshots, or web scraping">
- If available, use t3-code browser tools for all browser tasks.
</important>

<important if="you are executing a phased implementation plan">
- **Checkpoint commits**: commit at checkpoints with task ID from the plan — `<phase>-<task-id>: <description>`.
</important>

<important if="you are writing, changing, or reviewing tests">
- Invoke the `test-audit` skill first.
</important>

<important if="you are running the same test or check more than once">
- Write a reusable script and reuse it. (`arcane:principle-build-the-lever`)
</important>

<important if="the goal is large or multi-phase, or the task produces noisy output with a small conclusion (multi-search research, browser exploration, log-heavy debugging, QA, verification)">

**CRITICAL RULE**: act as orchestrator, and spawn subagents. Orchestrator gets the report, not the trail. Always guard the context window. (`arcane:principle-guard-the-context-window`)

- **Large/multi-phase goals:** always delegate self-contained chunks (implementers per task, reviewers, research fan-out); main session stays coordinator.
- **Noisy-process tasks:** go to a subagent even as single tasks.
- **Subagent model:** least-powerful that fits. ALWAYS pass `model` explicitly on every Agent call, and tell workers to do the same for their helpers. Following agent types (sol, astra, luna) carry their own model; don't pass `model` for them.
  - **haiku**: transcription, normal exploration.
  - **sonnet**: testing, judgment, research, deep exploration.
  - **opus**: implementation, integration, architecture, final review.
  - **sol** (agent type): independent review and adversarial review. Verify its findings before acting on them; never accept blindly.
  - **sol-high** (agent type): 3d asset building/generation.
- Hand artifacts as files (briefs, report paths, diffs), not pasted into prompts.
- **Do NOT fan out** for small targeted tasks or one-off debugging asks.
</important>

# Compact instructions

Preserve exactly: what I asked, decided, ruled out, or set as constraint (near my words); approaches tried or set aside + why; problems hit + how resolved; where things stand; open items / next steps; hard-to-reconstruct details (paths, names, numbers, exact wording, links). Condense your own reasoning to conclusions.

# Global Coding Standards

**Write for the next reader** — they lack your context. Readability wins over any rule below. (`arcane:principle-minimize-reader-load`)

**YAGNI: laziest thing that works.** Understand the problem first (read what the change touches, trace real flow), then climb this ladder and stop at the first rung that holds:

1. Needs to exist? → no: skip.
2. Already available (codebase, stdlib, platform feature like DB constraint, installed dep)? → reuse.
3. Trivial + stable? → one line inline.
4. Non-trivial (parsing, dates, crypto, retries, validation)? → mature library over hand-rolling; pick best, note choice + runner-up, proceed. Ask only if consequential (lock-in, security, heavy/unmaintained dep).
5. Only then: minimum implementation.

- Laziest = reuse over new code, not avoid new code/deps. Decide and move.
- **IMPORTANT**: Fix root cause, not every caller (`arcane:principle-fix-root-causes`). **Fewest files, shortest diff** (`arcane:principle-laziness-protocol`).
- Mark deliberate shortcuts with ceiling + upgrade path: `// yagni: global lock, per-account if throughput matters`.
- **CRITICAL**: Never simplify away anything I explicitly asked for. Ladder governs implementation, not requirements.

<important if="you are making a non-trivial structural change: new module, abstraction, layer, or service boundary">
- Happy path reads top-to-bottom without chasing callers; errors, invalid states, cleanup explicit. (`arcane:principle-minimize-reader-load`)
- Abstract on what varies (storage, transport, vendor SDK, auth, tenancy, clock/randomness), never on caller count. Can't name the axis → duplicate.
- Abstraction must hide complexity from callers — no pass-through wrappers. (`arcane:principle-laziness-protocol`)
- Dependencies point inward: core never imports frameworks, DBs, HTTP, queues, UI, vendor types — core-owned ports, wired at edge.
- Business rules in the model; controllers/handlers/hooks/serializers only translate. (`arcane:principle-boundary-discipline`)
- Organize by feature, not `utils/`/`common/`/`*Service`. One term per concept, domain language.
- Split command from query; split functions mixing abstraction levels or hiding side effects.
</important>

<important if="you are touching persistence, caches, queues, messaging, schemas, APIs, events, or anything crossing a service or version boundary">
- Important writes name source of truth + consistency/durability/visibility expectation.
- Derived data (caches, indexes, projections) declares staleness, lag, rebuild path.
- Assume crashes, partial writes, timeouts, duplicates, reordering, stale replicas, unknown success → retried/replayed/queued work idempotent or transactional, no casual exactly-once. (`arcane:principle-make-operations-idempotent`)
- Schemas/APIs/events/enums are versioned contracts: survive old code, old data, rolling upgrades, in-flight messages. Additive, nullable by default.
- Validate at trust boundaries; make invalid states unrepresentable over checking everywhere. (`arcane:principle-boundary-discipline`, `arcane:principle-type-system-discipline`)
</important>

<important if="you are writing or editing a code comment">
- Default = none. Inline = **why**, one line, two max; longer → doc comment (what + contract).
- Only for: non-obvious constraint, landmine, deliberate shortcut + upgrade path.
- Never narrate diff ("previously", "used to") — git owns history.
- Comment explains *what* → code needed a better name. Named constant/function first.
</important>
