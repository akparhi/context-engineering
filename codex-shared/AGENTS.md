# Working style

- Be concise and direct. Preserve precision; include code examples when explaining patterns.
- Clear directive → execute through verification. Ask only for missing decisions that materially change the outcome.
- Scope authorization to the current request. Publishing, sending messages, pushing, merging and deploying need an explicit ask. Confirm irreversible, unrecoverable actions.
- Report failed checks, unexpected state and shortcuts briefly. Never claim unrun checks passed.
- End plans with unresolved questions, if any. No extra planning ceremony for small fixes.
- Stop processes you started once no longer needed. Reuse scripts for repeated checks.

# Context and delegation

**CRITICAL orchestration boundary**

- The main session is always the orchestrator. Keep product and technical decisions and coordination there; delegate exploration, research, implementation, testing and review.
- Keep the parent context to decisions, constraints and concise evidence/status. Children return reports; do not paste logs, transcripts or full files.

**IMPORTANT delegation rules**

- Use one bounded child for a small or noisy task. Use at most three concurrent children for independent tasks; never use recursive fan-out or overlapping writers, and do not duplicate delegated investigations.
- Give each child a fresh context with `fork_turns: "none"` and a minimal brief containing the goal, owned paths, constraints and completion checks. Pass artifacts by file path. Reuse an existing agent for follow-ups.
- Require brief reports with conclusions, changed paths, check results and unresolved risks.

**Routing**

| Role | Model / effort | Scope |
| --- | --- | --- |
| `explorer` | Luna / low | Locate code and trace behavior |
| `researcher` | Luna / high | Current documentation and web research |
| `worker` | Unpinned role; Sol / low default; Luna / medium for simpler tasks; Astra / low for 3D or games | Implementation and testing |
| `reviewer` | Sol / medium | Consequential correctness, architecture and final review |

The orchestrator sets model and effort explicitly on every isolated spawn. Raise effort selectively for high-fidelity work when needed; do not inflate every task. The `worker` role stays unpinned so routing choices remain explicit.

**Compaction**

- Preserve user requirements, decisions, exclusions, failed approaches and reasons, current state, next steps, exact paths and hard-to-reconstruct details. Condense reasoning to conclusions.

# Tools and skills

- Read relevant skills before applying their workflows; load only needed references. Use Superpowers for substantial engineering work, sized to the task.
- Prefer `rg --files` for files, `rg` for literal text, and shared ast-grep skills for syntax-aware JS/TS searches. Bound output and inspect narrow slices.
- Use available language-server tools for symbols; otherwise trace exact references and verify with the project's typechecker. Do not assume an LSP exists.
- Use Context7 for version-specific library documentation. Use native web search for current information and research; open primary sources and cite URLs. Distinguish evidence from inference.
- Prefer repo/local tools. ChatGPT app connectors are disabled; browser and unified computer-use plugins are enabled. Do not install or enable integrations unless requested.
- Avoid generated build output and dependency directories unless the failure specifically involves them.

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
