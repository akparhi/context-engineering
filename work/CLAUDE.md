<EXTREMELY-IMPORTANT>
# Directives: Just do it

- Clear directive → do it. No confirm, no alternatives, no options menu. Includes destructive-but-recoverable git actions.
- **IMPORTANT**: Irreversible + unrecoverable (data loss, outward-facing sends): one short confirm.
- Otherwise report in one line what I can't see: CI bypasses, failed checks, unexpected repo state. Then keep going.
- **Checkpoint commits** during phased development or when explicitly asked to do checkpoint commits, always do them at sensible checkpoints.

**CRITICAL**: Directive scope = that request only. Commit/push/merge actions on master/main branch, PR/sends/deploys need explicit ask, every time. "Commit and push" earlier ≠ permission for later changes. (**Checkpoint commits** are an exception, but never push them without explicit ask.)

# Working Principles

- End every plan with unresolved questions. Ask clarifying questions without hesitation.
- **CRITICAL RULE**: For large/multi-phase goals, act as orchestrator and spawn subagents for independent work chunks/testing/deep exploration.
  - **Large/multi-phase goals:** always delegate self-contained chunks (implementers per task, reviewers, research fan-out); main session stays coordinator — preserves its context for orchestration/judgment, keeps each chunk focused.
  - **Subagent type:** Least-powerful model that fits: transcription/normal exploration → haiku, implementation/integration/testing/judgment/deep exploration → sonnet, architecture/final-review → opus.
  - Hand artifacts as files (briefs, report paths, diffs), not pasted into prompts.
  - **Do NOT fan out** for small targeted tasks or one-off debugging asks — do those inline.

# Code Exploration

- Searching TS/TSX/JS code → **`ast-grep`** by default (bin `ast-grep`): `ast-grep run -p '<pattern>' src`, `--json=compact`, `--debug-query`. Non-trivial pattern → `ast-grep` skill; mapping a file/dir's shape before reading it → `ast-grep-outline` skill. Grep only when the target isn't syntax — strings/comments, non-JS/TS files, log output.
- Finding files → **`fd`**, not `find`.
- Symbol types, definitions, usages → **`LSP`** tool (IMPORTANT: Prefer any graph tool if available), never grep-guessing.
</EXTREMELY-IMPORTANT>

<GLOBAL-CODING-STANDARDS>
# Global Coding Standards

**Write for the next reader.** They have none of your context — not this session, not why the old code was wrong. Where any rule below conflicts with readability, readability wins.

**Structure** — any non-trivial change:

- Happy path reads top-to-bottom, understandable without chasing callers; errors, invalid states, cleanup explicit.
- Abstract on what varies (storage, transport, vendor SDK, auth, tenancy, clock/randomness), never on caller count. Can't name the axis → duplicate; a boundary at the wrong joint can't be moved.
- Abstractions earn their place by hiding complexity from callers — no pass-through wrappers or indirection-only helpers.
- Dependencies point inward: core logic never imports frameworks, DBs, HTTP, queues, UI, vendor types — behind core-owned ports, wired at the edge.
- Business rules live in the model; controllers, handlers, hooks, serializers only translate.
- Organize by feature, not `utils/`/`common/`/`*Service` grab-bags. One term per concept, matching domain language.
- Split command from query; split functions mixing abstraction levels or hiding side effects.

**Data & contracts** — persistence, messaging, cross-service/cross-version boundaries:

- Every important write names its source of truth + consistency, durability, visibility expectation.
- Derived data (caches, indexes, projections) declares staleness, lag, rebuild path.
- Retried/replayed/queued work is idempotent or transactional — no casual exactly-once claims.
- Schemas, APIs, events, enums are versioned contracts: must survive old code, old data, rolling upgrades, in-flight messages. Additive and nullable by default.
- Assume crashes, partial writes, timeouts, duplicates, reordering, stale replicas, unknown success.
- Validate at trust boundaries; prefer making invalid states unrepresentable over checking everywhere.

## YAGNI: laziest thing that works

After understanding the problem — read what the change touches, trace the real flow — climb this ladder and stop at the first rung that holds:

1. Does it need to exist? → no: skip it.
2. Already in this codebase? → reuse, don't rewrite.
3. Stdlib covers it? → use it.
4. Native platform feature? → use it (e.g., DB constraint over app logic).
5. Already-installed dep? → use it.
6. Trivial + stable? → one line inline.
7. Non-trivial (parsing, dates, crypto, retries, validation)? → prefer a mature library over hand-rolling; pick best, note choice + runner-up, proceed. Ask only if consequential (lock-in, security, heavy/unmaintained dep).
8. Only then: minimum implementation.

- "Laziest" = reuse over new code, NOT avoid new code/dependencies. Decide and move; don't stop on every choice.
- Fix root cause (the shared function), not every caller.
- Once the problem is understood: fewest files, shortest diff.

Mark deliberate shortcuts with ceiling and upgrade path: e.g., `// yagni: global lock, per-account if throughput matters`.

**Verify before claiming done:** decisive review/testing/verification with an independent subagent; a model review is never proof when an executable check exists. Report `not verified` when verification was unavailable. Never claim a check that did not run or pass.

**CRITICAL**: Never simplify away: input validation, error handling that prevents data loss, security, accessibility, or anything I explicitly asked for. The ladder governs implementation, not my requirements.

## Code comments

Default = no comment. One line, two max — longer means a jsdoc/similar comment.

- Inline comments say **why**, never what. Doc comments may say what + contract.
- Earn one only for: a non-obvious constraint, a landmine, or a deliberate shortcut with its upgrade path.
- **Never narrate the diff** — no "changed from", "previously", "we used to". Git owns history.

```ts
// bad: history + restating
// We used to fetch in useEffect but that double-fetched on mount. 30 min for admins.
const timeout = auth?.role === 'Admin' ? 30 * 60 * 1000 : 15 * 60 * 1000

// good: names carry it
const IDLE_TIMEOUT_ADMIN = 30 * 60 * 1000
const IDLE_TIMEOUT_USER = 15 * 60 * 1000
```
</GLOBAL-CODING-STANDARDS>
