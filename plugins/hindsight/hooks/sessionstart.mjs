#!/usr/bin/env node
import { readCandidates } from '../src/candidates.mjs'
import { findProjectRoot } from '../src/paths.mjs'

const CONTRACT = `<lesson_capture>
Call hindsight__record the moment any of these occur — before continuing the work:
- The user corrects an approach, tool, pattern, or value you chose
- The user rejects a tool call or plan, then explains why
- An approach failed for a reason that would repeat (a wrong assumption about this repo, not a typo)
- You discover a project constraint that contradicts what you assumed

Pass the earliest observable condition that should have told you — a file path, a
command, or a task type — as \`trigger\`. Pass your own one-line generalization as
\`rule\`, written as neutral project guidance: no second person, no quoting the user.

Do NOT record: one-off typos, transient environment failures, anything already in
.claude/rules/, style nits with no repeat risk, or facts derivable from the code itself.
</lesson_capture>`

function main() {
  const root = findProjectRoot(process.cwd())
  if (!root) return
  const pending = readCandidates(root).length
  const note = pending
    ? `\n\n${pending} candidate(s) from an earlier session are still pending distillation.`
    : ''
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: CONTRACT + note,
      },
    })
  )
}

try {
  main()
} catch {
  // Never fail the session.
}
process.exit(0)
