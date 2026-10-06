[{RELEVANT LINK}]({RELEVANT LINK})  | [{RELEVANT LINK 2}]({RELEVANT LINK 2})  | ...

## Why the change

{Exactly one sentence explaining the problem this PR solves and what becomes possible after it ships.}

## Special things to note

- {List 1-3 reviewer-relevant warnings, migrations, constraints, deliberate omissions, or surprising decisions.
- Call out migration order, rollout plan, and feature flags. When the change is a one-way door (data migration, deletion, public contract change), say so and name what breaks.
- Use "None." when there are no special considerations.}

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

- **Before:** {screenshot/output/failing test run}
  **After:** {screenshot/output/passing test run}

{Concrete evidence that the change works. Show a before and after. Screenshots are S-tier - when the environment is set up for it and the change is visual. Execution-based evidence is A-tier. Test results, console output. Show the exact test that now fails and passes, using pseudocode. When the change has no runtime behavior, write "None." with the reason.}
