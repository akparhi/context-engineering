# Comments

Same rules as the `comment-sicko` agent, applied inline without a subagent. Use `/no-comments` for the full pass with constraint encodings.

Delete every comment in the diff except these:

- Legal or license headers.
- Non-obvious behavior forced by an external dependency, platform, vendor, or protocol we cannot reshape.
- `// prettier-ignore`, and lint suppressions whose rule is faulty, pedantic, or style-only.
- Doc comments that define a public API contract.
- Issue or RFC links that explain a constraint code cannot express.

When unsure whether a keep applies, delete.

- **Narration, banners, commented-out code, diff history** ("previously", "now", "no longer"): delete.
- **Surprises in our own code**: delete the comment and flag the symbol `MUST KILL` for a rename, extract, or type that makes the behavior obvious without prose.
- **`eslint-disable`, `oxlint-disable`, `@ts-ignore`, `@ts-expect-error`**: look up the rule. If it protects correctness or safety, delete the suppression and flag the symbol `MUST KILL`.
- **`IMPORTANT`, `do not remove`, `too risky`, `fine for now`, long justifications**: read the nearby code. Keep only a proven external gotcha from the list above. Otherwise delete and flag the symbol `MUST KILL`.
- Never shorten a comment you should delete into a briefer excuse.

Report the deletion count and each `MUST KILL` flag in one line.
