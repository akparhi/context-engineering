import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendCandidate, readCandidates, clearCandidates } from '../src/candidates.mjs'
import { hindsightPaths } from '../src/paths.mjs'

function newProject() {
  const root = mkdtempSync(join(tmpdir(), 'hs-'))
  mkdirSync(join(root, '.claude'))
  return root
}

const sample = {
  mistake: 'Used moment.js for date formatting',
  correction: 'Use date-fns, already a dependency',
  rule: 'Format dates with date-fns; moment.js is not used in this repo',
  trigger: 'adding date formatting code',
  files_touched: ['src/api/orders.ts'],
}

test('appendCandidate writes a candidate and stamps id and timestamp', () => {
  const root = newProject()
  const { added, id } = appendCandidate(root, sample)
  assert.equal(added, true)
  assert.equal(typeof id, 'string')
  const all = readCandidates(root)
  assert.equal(all.length, 1)
  assert.equal(all[0].rule, sample.rule)
  assert.equal(all[0].id, id)
  assert.match(all[0].recorded_at, /^\d{4}-\d{2}-\d{2}T/)
})

test('appendCandidate suppresses an identical duplicate', () => {
  const root = newProject()
  appendCandidate(root, sample)
  const second = appendCandidate(root, sample)
  assert.equal(second.added, false)
  assert.equal(readCandidates(root).length, 1)
})

test('appendCandidate keeps a different candidate', () => {
  const root = newProject()
  appendCandidate(root, sample)
  appendCandidate(root, { ...sample, rule: 'Something else entirely' })
  assert.equal(readCandidates(root).length, 2)
})

test('readCandidates returns empty array when the file is absent', () => {
  assert.deepEqual(readCandidates(newProject()), [])
})

test('readCandidates skips corrupt lines instead of throwing', () => {
  const root = newProject()
  appendCandidate(root, sample)
  appendFileSync(hindsightPaths(root).candidates, 'not json at all\n')
  assert.equal(readCandidates(root).length, 1)
})

test('clearCandidates empties the queue', () => {
  const root = newProject()
  appendCandidate(root, sample)
  clearCandidates(root)
  assert.deepEqual(readCandidates(root), [])
})

test('appendCandidate creates the hindsight dir with a gitignore', () => {
  const root = newProject()
  appendCandidate(root, sample)
  const paths = hindsightPaths(root)
  assert.ok(existsSync(paths.dir), 'hindsight dir should exist')
  const ignorePath = join(paths.dir, '.gitignore')
  assert.ok(existsSync(ignorePath), '.gitignore should exist')
  assert.match(readFileSync(ignorePath, 'utf8'), /^\*$/m)
})
