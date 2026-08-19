import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { appendCandidate, readCandidates } from '../src/candidates.mjs'
import { hindsightPaths } from '../src/paths.mjs'

const hook = fileURLToPath(new URL('../hooks/sessionstart.mjs', import.meta.url))

function newProject() {
  const root = mkdtempSync(join(tmpdir(), 'hs-'))
  mkdirSync(join(root, '.claude'))
  return root
}

function runHook(cwd) {
  const out = execFileSync('node', [hook], { cwd, input: '{}', encoding: 'utf8' })
  return JSON.parse(out)
}

test('emits the capture contract as additionalContext', () => {
  const root = mkdtempSync(join(tmpdir(), 'hs-'))
  mkdirSync(join(root, '.claude'))
  const parsed = runHook(root)
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'SessionStart')
  const ctx = parsed.hookSpecificOutput.additionalContext
  assert.match(ctx, /hindsight__record/)
  assert.match(ctx, /<hindsight>/)
  assert.match(ctx, /Do NOT record/)
})

test('mentions pending candidates when the queue is non-empty', () => {
  const root = mkdtempSync(join(tmpdir(), 'hs-'))
  mkdirSync(join(root, '.claude'))
  appendCandidate(root, { mistake: 'm', correction: 'c', rule: 'r', trigger: 't', files_touched: [] })
  const ctx = runHook(root).hookSpecificOutput.additionalContext
  assert.match(ctx, /1 candidate/)
})

test('exits 0 with no output outside a project', () => {
  const bare = mkdtempSync(join(tmpdir(), 'hs-bare-'))
  const out = execFileSync('node', [hook], { cwd: bare, input: '{}', encoding: 'utf8' })
  assert.equal(out.trim(), '')
})

test('injects the demotion clause', () => {
  const root = mkdtempSync(join(tmpdir(), 'hs-'))
  mkdirSync(join(root, '.claude'))
  const context = runHook(root).hookSpecificOutput.additionalContext
  assert.match(context, /memory aid/i)
  assert.match(context, /current message|current instruction/i)
})

test('routes pending candidates to the distill tool', () => {
  const root = mkdtempSync(join(tmpdir(), 'hs-'))
  mkdirSync(join(root, '.claude'))
  appendCandidate(root, { mistake: 'm', correction: 'c', rule: 'r', trigger: 't' })
  const context = runHook(root).hookSpecificOutput.additionalContext
  assert.match(context, /1 candidate/)
  assert.match(context, /hindsight__distill/)
})

test('routes pending candidates to distill without offering to skip', () => {
  const root = newProject()
  appendCandidate(root, { mistake: 'm', correction: 'c', rule: 'r', trigger: 't' })
  const context = runHook(root).hookSpecificOutput.additionalContext
  assert.match(context, /hindsight__distill/)
  assert.doesNotMatch(context, /or leave them queued/, 'the hook must not present skipping as an equal option')
})

test('treats a repeated request as a recordable trigger', () => {
  const root = newProject()
  const context = runHook(root).hookSpecificOutput.additionalContext
  assert.match(context, /same thing a second or third time/i)
})

test('tells Claude to distill after recording rather than waiting to be asked', () => {
  const root = newProject()
  const context = runHook(root).hookSpecificOutput.additionalContext
  assert.match(context, /after you record/i)
  assert.match(context, /without being asked|do not wait to be asked/i)
})

// The merge rules and confirm cases live in buildDistillPrompt, not the
// injection — see prompt.test.mjs. The hook only has to route to the tool.
test('routes to distill rather than restating its rules', () => {
  const root = newProject()
  const context = runHook(root).hookSpecificOutput.additionalContext
  assert.match(context, /hindsight__distill/)
  assert.doesNotMatch(context, /contradicts a lesson/i, 'confirm cases belong to the distill prompt')
})

test('keeps the pending note inside the hindsight tag', () => {
  const root = newProject()
  appendCandidate(root, { mistake: 'm', correction: 'c', rule: 'r', trigger: 't' })
  const context = runHook(root).hookSpecificOutput.additionalContext
  assert.match(context, /1 candidate from earlier is pending/)
  assert.ok(context.trimEnd().endsWith('</hindsight>'), 'nothing may land outside the tag')
})

test('expires stale candidates at session start', () => {
  const root = newProject()
  const paths = hindsightPaths(root)
  const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  mkdirSync(paths.dir, { recursive: true })
  writeFileSync(paths.candidates, JSON.stringify({ id: 'aaaaaaaa', recorded_at: old, mistake: 'm', correction: 'c', rule: 'r', trigger: 't' }) + '\n')
  const context = runHook(root).hookSpecificOutput.additionalContext
  assert.doesNotMatch(context, /1 candidate\(s\) from earlier are pending/, 'an expired candidate must not be reported as pending')
  assert.equal(readCandidates(root).length, 0, 'session start must have dropped it')
})

test('states the 24-hour expiry so an unconfirmed candidate is not assumed permanent', () => {
  const root = newProject()
  const context = runHook(root).hookSpecificOutput.additionalContext
  assert.match(context, /24 hours/)
})

test('stays silent when its own modules cannot be loaded', () => {
  const root = mkdtempSync(join(tmpdir(), 'hs-'))
  mkdirSync(join(root, '.claude'))
  const broken = mkdtempSync(join(tmpdir(), 'hs-broken-'))
  copyFileSync(hook, join(broken, 'sessionstart.mjs'))
  // No src/ alongside it: every dynamic import fails.
  const result = spawnSync(process.execPath, [join(broken, 'sessionstart.mjs')], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, 'hook must never fail the session')
  assert.equal(result.stdout.trim(), '', 'a broken hook emits nothing rather than partial JSON')
})
