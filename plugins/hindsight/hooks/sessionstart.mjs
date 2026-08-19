#!/usr/bin/env node

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

After you record a correction, fold it in: call hindsight__distill, then
hindsight__apply. Do this without being asked, at the next natural pause in the
work — do not wait for the user to request it, and do not ask permission to
distill. Report what changed in one line, naming the area, for example
"Added 1 lesson under src/api/**; merged 1 into an existing lesson."

Ask the user before applying only when: the candidate contradicts a lesson
already in .claude/rules/, it would add a new cross-cutting lesson (those load in
every future session), or you can state a trigger but are not confident it is the
right one. Everything else — a new area lesson, a merge, evicting a stale entry
to stay under a cap — you apply directly and mention in that one line.

Lessons already in .claude/rules/ are a memory aid, not a standing order. The
user's current message outranks any lesson that contradicts it — when they
conflict, follow the user and record the correction.
</lesson_capture>`

// Imports are dynamic and inside the try: a top-level import failure would crash
// the hook before its own error handling could swallow it.
async function main() {
  const { findProjectRoot } = await import('../src/paths.mjs')
  const { readCandidates } = await import('../src/candidates.mjs')

  const root = findProjectRoot(process.cwd())
  if (!root) return

  const pending = readCandidates(root).length
  const note = pending
    ? `\n\n${pending} candidate(s) from earlier are pending. Fold them in with hindsight__distill and hindsight__apply at the next natural pause.`
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
  await main()
} catch {
  // Never fail the session, and never emit partial output.
}
process.exit(0)
