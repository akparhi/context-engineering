import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendCandidate, readCandidates } from '../src/candidates.mjs'
import { expireCandidates, TWENTY_FOUR_HOURS } from '../src/expiry.mjs'
import { hindsightPaths } from '../src/paths.mjs'

function newProject() {
  const root = mkdtempSync(join(tmpdir(), 'hs-'))
  mkdirSync(join(root, '.claude'))
  return root
}

const candidate = (n) => ({ mistake: `m${n}`, correction: `c${n}`, rule: `r${n}`, trigger: `t${n}` })

test('keeps candidates younger than the window', () => {
  const root = newProject()
  appendCandidate(root, candidate(1))
  const { kept, expired } = expireCandidates(root, {})
  assert.equal(kept.length, 1)
  assert.equal(expired.length, 0)
  assert.equal(readCandidates(root).length, 1)
})

test('drops candidates older than 24 hours', () => {
  const root = newProject()
  appendCandidate(root, candidate(1))
  const { kept, expired } = expireCandidates(root, { now: Date.now() + TWENTY_FOUR_HOURS + 1000 })
  assert.equal(kept.length, 0)
  assert.equal(expired.length, 1)
  assert.equal(readCandidates(root).length, 0, 'the queue file must actually be rewritten')
})

test('keeps the young and drops the old in one pass', () => {
  const root = newProject()
  const paths = hindsightPaths(root)
  const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const fresh = new Date().toISOString()
  mkdirSync(paths.dir, { recursive: true })
  writeFileSync(
    paths.candidates,
    [
      JSON.stringify({ id: 'aaaaaaaa', recorded_at: old, ...candidate(1) }),
      JSON.stringify({ id: 'bbbbbbbb', recorded_at: fresh, ...candidate(2) }),
    ].join('\n') + '\n'
  )
  const { kept, expired } = expireCandidates(root, {})
  assert.deepEqual(kept.map((c) => c.id), ['bbbbbbbb'])
  assert.deepEqual(expired.map((c) => c.id), ['aaaaaaaa'])
})

test('treats a candidate with no recorded_at as fresh rather than dropping it', () => {
  const root = newProject()
  const paths = hindsightPaths(root)
  mkdirSync(paths.dir, { recursive: true })
  writeFileSync(paths.candidates, JSON.stringify({ id: 'cccccccc', ...candidate(1) }) + '\n')
  const { kept, expired } = expireCandidates(root, { now: Date.now() + 10 * TWENTY_FOUR_HOURS })
  assert.equal(kept.length, 1, 'a missing timestamp must not cause silent deletion')
  assert.equal(expired.length, 0)
})

test('treats an unparseable recorded_at as fresh', () => {
  const root = newProject()
  const paths = hindsightPaths(root)
  mkdirSync(paths.dir, { recursive: true })
  writeFileSync(paths.candidates, JSON.stringify({ id: 'dddddddd', recorded_at: 'not a date', ...candidate(1) }) + '\n')
  const { kept } = expireCandidates(root, { now: Date.now() + 10 * TWENTY_FOUR_HOURS })
  assert.equal(kept.length, 1)
})

test('is a no-op when there is no queue file', () => {
  const root = newProject()
  const { kept, expired } = expireCandidates(root, {})
  assert.deepEqual(kept, [])
  assert.deepEqual(expired, [])
})

test('does not throw when the queue cannot be rewritten', () => {
  const root = newProject()
  appendCandidate(root, candidate(1))
  const paths = hindsightPaths(root)
  // Replace the queue file with a directory so the rewrite fails.
  rmSync(paths.candidates)
  mkdirSync(paths.candidates)
  const result = expireCandidates(root, { now: Date.now() + TWENTY_FOUR_HOURS + 1000 })
  assert.ok(result, 'expiry must never throw into the session-start hook')
})
