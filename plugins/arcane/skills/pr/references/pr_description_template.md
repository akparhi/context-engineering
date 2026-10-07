[{RELEVANT LINK}]({RELEVANT LINK})  | [{RELEVANT LINK 2}]({RELEVANT LINK 2})  | ...

## Why

{Exactly one sentence explaining the problem this PR solves and what becomes possible after it ships.}

## Reviewer notes

- {List 1-3 reviewer-relevant warnings, migrations, constraints, deliberate omissions, or surprising decisions. Flag unrelated changes, one-way doors (data migration, deletion, public contract change) and name what breaks.}
- **Blast radius:** {Who or what the change touches, and why it is safe or risky. Always present.}
- **Tradeoff:** {A rejected alternative a reviewer would otherwise ask about, and why. One bullet each; omit when there was no real choice.}

## Change outline

{Use the smallest combination of the following `/show-me`-style views that explains the implementation. Prefer `diff` blocks for changes to existing shapes and complete blocks for mostly new shapes. Do not include headings for views that are not relevant.}

{...short-description...}

```diff|sql|json|etc
{Show changed SQL tables, important columns and relationships, and endpoint request/response contracts.}
```

{...short-description...}

```typescript|python|etc
{show new data structures that are key to the implementation}
```

{...short-description...}

```diff
{Show concise pseudocode for the changed behavior.}
```


{...short-description...}

```diff
{Show a shallow file tree with changed responsibilities.}
```


{...short-description...}

```diff
{Show changed React component trees, important hooks or state, and package boundaries.}
```

{...short-description...}

```diff
{Show changed call trees, call stacks, control flow, or data flow.}
```

{Tell the story in the order that makes it easiest to understand. It may make sense to show files first, or it may make sense to establish a data structure, SQL table, or API contract first. All views and subheadings are optional. Use only the views that help explain the pr, and name or order them based on the change rather than a fixed template. It should be written as one human would write to another. Use `diff` for a focused change to an existing shape. Show the complete target shape in a language-specific or `text` block when it is new, high-level, or clearer without diff notation.}

## Evidence

- `{exact command run}`: {result}

| # | Where | Step | Observed | Result |
|---|---|---|---|---|
| 1 | {environment} (before) | {action} | {value or behavior seen} | {bug present} |
| 2 | {environment} (after) | {action} | {value or behavior seen} | {pass} |

{Bug fix:}

| Case | Before | After |
|---|---|---|
| {scenario, e.g. real data} | ![01-before-{name}.png]({url}) | ![01-after-{name}.png]({url}) |
| {scenario new to this PR, e.g. API 500} | — | ![02-after-{name}.png]({url}) |

{Anything else:}

![01-{name}.png]({url from upload-proofs.sh})
![02-{name}.png]({url from upload-proofs.sh})

Skipped: {check}. {reason}

{Concrete evidence that the change works. Show a before and after. Screenshots are S-tier - when the environment is set up for it and the change is visual. Execution-based evidence is A-tier. Test results, console output. Show the exact test that now fails and passes, using pseudocode. One table row per step; number proof files to match their rows. Bug fix screenshots go in the Case / Before / After table, one row per scenario (data states, roles, error paths), `—` where before has no equivalent; image URLs come from upload-proofs.sh. Other PRs paste its markdown as-is. Drop either table, the images, or the Skipped line when there is nothing to put in them. When the change has no runtime behavior, write "None." with the reason.}
