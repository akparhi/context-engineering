import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { appendCandidate } from '../src/candidates.mjs'

const hook = fileURLToPath(new URL('../hooks/sessionstart.mjs', import.meta.url))

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
  assert.match(ctx, /<lesson_capture>/)
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
