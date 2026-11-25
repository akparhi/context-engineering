# Bureau

@non-negotiables.md

## Skills Usage

- If a skill applies to your own work, invoke it. Load a principle skill (`bureau:principle-*`) whenever its trigger in the index below matches.
- **Understanding code.** Use `bureau:how` for how it works and `bureau:why` for why it is built this way.
- **Tests.** Use `bureau:test-audit` when writing, changing, or reviewing tests. Use `bureau:tdd` when the failing test comes first.
- **Before every commit.** Run `bureau:deslop` on the diff.
- **TypeScript.** Use `bureau:typescript-best-practices` when reading or editing `.ts` or `.tsx` files.
- **Launching subagents.** Follow **Bureau models** below.

## Principles

**Core**

- `bureau:principle-laziness-protocol`: Apply when refactoring, evaluating diff size, or tempted to add abstractions, layers, or signal threading.
- `bureau:principle-foundational-thinking`: Apply before writing logic: choosing core types and data structures, sequencing scaffold-vs-feature work, asking what concurrent actors share.
- `bureau:principle-redesign-from-first-principles`: Apply when integrating a new requirement into an existing design.
- `bureau:principle-attack-the-premise`: Apply when two or more fixes that share one premise have failed the same gate.
- `bureau:principle-subtract-before-you-add`: Apply when sequencing an addition, refactor, or rewrite.
- `bureau:principle-minimize-reader-load`: Apply when reviewing or shaping code that's hard to trace.
- `bureau:principle-outcome-oriented-execution`: Apply during planned rewrites and migrations with explicit phase boundaries.
- `bureau:principle-experience-first`: Apply when product, UX, or feature-scope tradeoffs come up.
- `bureau:principle-exhaust-the-design-space`: Apply when facing a novel UI interaction or architectural decision with no precedent in the codebase.
- `bureau:principle-build-the-lever`: Apply to any non-trivial work, not just bulk work: edits, migrations, analyses, checks.

**Architecture**

- `bureau:principle-model-the-domain`: Apply when writing stateful logic, or when code branches a lot or repeats a shape assumption across files.
- `bureau:principle-boundary-discipline`: Apply when wiring validation, error handling, or framework adapters.
- `bureau:principle-type-system-discipline`: Apply when designing types, reviewing a function signature, or writing code in any statically-typed language.
- `bureau:principle-make-operations-idempotent`: Apply when designing commands, lifecycle steps, or processing loops that run amid crashes, restarts, and retries.
- `bureau:principle-migrate-callers-then-delete-legacy-apis`: Apply when introducing a new internal API while old callers still exist.
- `bureau:principle-separate-before-serializing-shared-state`: Apply when concurrent actors might write to the same file, branch, key, or state object.

**Verification**

- `bureau:principle-prove-it-works`: Apply after completing a task, before declaring done.
- `bureau:principle-fix-root-causes`: Apply when debugging.
- `bureau:principle-sequence-verifiable-units`: Apply to multi-step work (sweeps, migrations, runs of similar edits) and to how you stack commits and PRs.
- `bureau:principle-test-behavior-not-implementation`: Apply when you write, change, or keep a test.
- `bureau:principle-explain-the-number`: Apply before you measure, and before you trust, report, or act on a number you measured: a speedup, a regression, a throughput, a latency, or an eval result.

**Delegation**

- `bureau:principle-never-block-on-the-human`: Apply when tempted to ask 'should I do X?' on reversible work.

**Meta**

- `bureau:principle-encode-lessons-in-structure`: Apply when you catch yourself writing the same instruction a second time, or notice a recurring correction.
