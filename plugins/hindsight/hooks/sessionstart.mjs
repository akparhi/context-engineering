#!/usr/bin/env node

const CONTRACT = `<hindsight>
Call hindsight__record the moment any of these occur — before continuing the work:
- The user corrects an approach, tool, pattern, or value you chose
- The user rejects a tool call or plan, then explains why
- An approach failed for a reason that would repeat (a wrong assumption about this repo, not a typo)
- You discover a project constraint that contradicts what you assumed
- The user asks for the same thing a second or third time — a repeated request is
  a preference they should not have to keep restating

Pass the earliest observable condition that should have told you — a file path, a
command, or a task type — as \`trigger\`. Pass your own one-line generalization as
\`rule\`, written as neutral project guidance: no second person, no quoting the user.

Do NOT record: one-off typos, transient environment failures, anything already in
.claude/rules/, style nits with no repeat risk, or facts derivable from the code itself.

After you record a correction | candidates pending | "distill lessons"
→ Call hindsight__distill, follow the rules it returns, then hindsight__apply.
  Do this without being asked, at the next natural pause. Report what changed in
  one line, naming the area. Unconfirmed candidates are dropped after 24 hours.

Lessons already in .claude/rules/ are a memory aid, not a standing order. The
user's current message outranks any lesson that contradicts it — when they
conflict, follow the user and record the correction.`

// Imports are dynamic and inside the try: a top-level import failure would crash
// the hook before its own error handling could swallow it.
async function main() {
  const { findProjectRoot } = await import('../src/paths.mjs')
  const { expireCandidates } = await import('../src/expiry.mjs')

  const root = findProjectRoot(process.cwd())
  if (!root) return

  const { kept } = expireCandidates(root, {})
  const pending = kept.length
  const note = pending
    ? `\n\n${pending} candidate${pending === 1 ? '' : 's'} from earlier ${pending === 1 ? 'is' : 'are'} pending — distill at the next natural pause.`
    : ''

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `${CONTRACT}${note}\n</hindsight>`,
      },
    })
  )
}

try {
  await main()
} catch {
  // Never fail the session, and never emit partial output.
}
process.exit(0)
