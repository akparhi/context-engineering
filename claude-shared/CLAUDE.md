<EXTREMELY-IMPORTANT>

# Directives: Just do it

- Clear directive → do it. No confirm, no alternatives, no options menu. Includes destructive-but-recoverable git actions.
- **IMPORTANT**: Irreversible + unrecoverable (data loss, outward-facing sends): one short confirm.
- Report in one line what I can't see: CI bypasses, failed checks, unexpected repo state. Then keep going.

**CRITICAL**: Directive scope = that request only. Commit/push/merge actions on master/main branch, PR/sends/deploys need explicit ask, every time. "Commit and push" earlier ≠ permission for later changes. (**Checkpoint commits** are an exception.)

# Working Principles

- End every plan with unresolved questions, if any. While planning, ask clarifying questions without hesitation.
- **IMPORTANT RULES**:
  - If available, use codex for adversarial review of research, specs and implementation plans.
  - If available, you MUST use t3-code browser tools for all browser tasks — via the `t3-browser` skill. Multi-step flow → Jev element selection always.
- **Checkpoint commits**: during phased development, commit at checkpoints with task ID from implementation plan — `<phase>-<task-id>: <description>`.
- Always kill process (e.g., dev server) you started if no longer needed.
- For repeated tests, write reusable scripts and reuse them.
- **CRITICAL RULE**: For large/multi-phase goals or noisy-process tasks, act as orchestrator and spawn subagents — for independent work chunks/testing/deep exploration and to save orchestrator context window.
  - **Large/multi-phase goals:** always delegate self-contained chunks (implementers per task, reviewers, research fan-out); main session stays coordinator — preserves its context for orchestration/judgment, keeps each chunk focused.
  - **Delegate to save orchestrator context window:** noisy-process/small-conclusion tasks (multi-search research, browser/Playwright exploration, log-heavy debugging) go to a subagent even as single tasks — orchestrator gets the report, not the trail.
  - **Subagent type:** Least-powerful model that fits: transcription/normal exploration → haiku, implementation/integration/testing/judgment/research/deep exploration → sonnet, architecture/final-review → opus.
    - **Exception — high fidelity tasks (initial planning, complex architecture/features, 3d work/game development)**: use fable for planning/architecture, opus for implementation/integration (3D/game implementation → `use-codex`). Never fable for routine subagents.
    - **CRITICAL**: pass `model` explicitly on every Agent call, and tell workers to do the same for their helpers.
    - **Forward to Codex (`subagent_type: "use-codex"`)** when: 3D/graphics/game implementation (Codex model beats Claude here), on-demand. Prompt = brief file path + acceptance criteria; append `--background` for long work, `--resume` to continue same Codex thread. Background job → same agent with `status <job-id>` then `result <job-id>`.
  - Hand artifacts as files (briefs, report paths, diffs), not pasted into prompts.
  - Spawn in background; keep working on independent parts while they run. Wait only when next step needs the result.
  - **Do NOT fan out** for small targeted tasks or one-off debugging asks.

# Compact instructions

Preserve exactly: what I asked, decided, ruled out, or set as constraint (near my words); approaches tried or set aside + why; problems hit + how resolved; where things stand; open items / next steps; hard-to-reconstruct details (paths, names, numbers, exact wording, links). Condense your own reasoning to conclusions.

</EXTREMELY-IMPORTANT>

<coding-standards>

# Global Coding Standards

**Write for the next reader** — they lack your context. Readability wins over any rule below.

**Structure** (non-trivial change):

- Happy path reads top-to-bottom without chasing callers; errors, invalid states, cleanup explicit.
- Abstract on what varies (storage, transport, vendor SDK, auth, tenancy, clock/randomness), never on caller count. Can't name the axis → duplicate.
- Abstraction must hide complexity from callers — no pass-through wrappers.
- Dependencies point inward: core never imports frameworks, DBs, HTTP, queues, UI, vendor types — core-owned ports, wired at edge.
- Business rules in the model; controllers/handlers/hooks/serializers only translate.
- Organize by feature, not `utils/`/`common/`/`*Service`. One term per concept, domain language.
- Split command from query; split functions mixing abstraction levels or hiding side effects.

**Data & contracts** (persistence, messaging, cross-service/version):

- Important writes name source of truth + consistency/durability/visibility expectation.
- Derived data (caches, indexes, projections) declares staleness, lag, rebuild path.
- Retried/replayed/queued work idempotent or transactional — no casual exactly-once.
- Schemas/APIs/events/enums are versioned contracts: survive old code, old data, rolling upgrades, in-flight messages. Additive, nullable by default.
- Assume crashes, partial writes, timeouts, duplicates, reordering, stale replicas, unknown success.
- Validate at trust boundaries; make invalid states unrepresentable over checking everywhere.


## YAGNI: laziest thing that works

Understand the problem first (read what change touches, trace real flow) — climb this ladder and stop at first rung that holds:

1. Needs to exist? → no: skip.
2. Already available (codebase, stdlib, platform feature like DB constraint, installed dep)? → reuse.
3. Trivial + stable? → one line inline.
4. Non-trivial (parsing, dates, crypto, retries, validation)? → prefer mature library over hand-rolling; pick best, note choice + runner-up, proceed. Ask only if consequential (lock-in, security, heavy/unmaintained dep).
5. Only then: minimum implementation.

- Laziest = reuse over new code, not avoid new code/deps. Decide and move.
- **IMPORTANT**: Fix root cause, not every caller. **Fewest files, shortest diff.**
- Mark deliberate shortcuts with ceiling + upgrade path: `// yagni: global lock, per-account if throughput matters`.
- **CRITICAL**: Never simplify away anything I explicitly asked for. Ladder governs implementation, not requirements.

## Comments

Default = none. Inline = **why**, one line, two max; longer → doc comment (what + contract).

- Only for: non-obvious constraint, landmine, deliberate shortcut + upgrade path.
- Never narrate diff ("previously", "used to") — git owns history.
- Comment explains *what* → code needed a better name. Named constant/function first.

```ts
// bad: history + restating
// Used to fetch in useEffect but that double-fetched on mount. 30 min for admins.
const timeout = auth?.role === 'Admin' ? 30 * 60 * 1000 : 15 * 60 * 1000

// good: names carry it
const IDLE_TIMEOUT_ADMIN = 30 * 60 * 1000
const IDLE_TIMEOUT_USER = 15 * 60 * 1000
```
</coding-standards>
