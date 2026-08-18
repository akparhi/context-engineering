import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendCandidate, readCandidates } from '../src/candidates.mjs'
import { applyLessonSet, readCurrentSet, writeLessonSet } from '../src/distill.mjs'
import { hindsightPaths } from '../src/paths.mjs'

function newProject() {
  const root = mkdtempSync(join(tmpdir(), 'hs-'))
  mkdirSync(join(root, '.claude'))
  return root
}

const candidate = {
  mistake: 'Used moment.js',
  correction: 'Use date-fns',
  rule: 'Format dates with date-fns',
  trigger: 'adding date formatting',
  files_touched: ['src/api/orders.ts'],
}

const goodSet = () => ({
  crossCutting: [{ text: 'Format dates with date-fns; moment.js is not a dependency', date: '2026-08-18', trigger: 'date-formatting', count: 1 }],
  areas: { api: { paths: ['src/api/**/*.ts'], lessons: [{ text: 'When editing src/api/, validate bodies with Zod', date: '2026-08-18', trigger: 'api-edit', count: 1 }] } },
  quarantine: [],
})

test('writes both lesson files and clears the queue on success', () => {
  const root = newProject()
  appendCandidate(root, candidate)
  const result = applyLessonSet(root, goodSet())
  assert.equal(result.status, 'ok', result.reason)
  const paths = hindsightPaths(root)
  const cross = readFileSync(paths.crossCutting, 'utf8')
  assert.match(cross, /date-fns/)
  assert.ok(!cross.startsWith('---'))
  const area = readFileSync(paths.areaFile('api'), 'utf8')
  assert.ok(area.startsWith('---\npaths:\n  - "src/api/**/*.ts"\n---\n'))
  assert.deepEqual(readCandidates(root), [])
})

test('keeps existing rules and the queue when the proposal is not an object', () => {
  const root = newProject()
  appendCandidate(root, candidate)
  const paths = hindsightPaths(root)
  mkdirSync(paths.rulesDir, { recursive: true })
  writeFileSync(paths.crossCutting, '## Lessons\n\n- Untouched lesson <!-- @date:2026-08-01 @trigger:t @count:1 -->\n')
  for (const junk of [null, 'not an object', 42, []]) {
    const result = applyLessonSet(root, junk)
    assert.equal(result.status, 'failed')
  }
  assert.match(readFileSync(paths.crossCutting, 'utf8'), /Untouched lesson/)
  assert.equal(readCandidates(root).length, 1)
})

test('rejects a malformed lesson set without touching disk', () => {
  const root = newProject()
  appendCandidate(root, candidate)
  const result = applyLessonSet(root, { crossCutting: [{ text: '' }], areas: {} })
  assert.equal(result.status, 'failed')
  assert.ok(result.reason)
  assert.ok(!existsSync(hindsightPaths(root).crossCutting))
  assert.equal(readCandidates(root).length, 1)
})

test('caps an oversized proposal instead of rejecting it', () => {
  const root = newProject()
  appendCandidate(root, candidate)
  const many = {
    crossCutting: Array.from({ length: 9 }, (_, i) => ({ text: `Lesson number ${i}`, date: `2026-08-0${(i % 9) + 1}`, trigger: 't', count: 1 })),
    areas: {},
    quarantine: [],
  }
  const result = applyLessonSet(root, many)
  assert.equal(result.status, 'ok', result.reason)
  const written = readFileSync(hindsightPaths(root).crossCutting, 'utf8')
  const bullets = written.split('\n').filter((line) => /^-\s+\S/.test(line))
  assert.equal(bullets.length, 7)
})

test('logs rejections to distill.log', () => {
  const root = newProject()
  appendCandidate(root, candidate)
  applyLessonSet(root, 'not an object')
  assert.match(readFileSync(hindsightPaths(root).log, 'utf8'), /reject|invalid/i)
})

test('moves quarantined candidates to quarantine.jsonl', () => {
  const root = newProject()
  const { id } = appendCandidate(root, candidate)
  const result = applyLessonSet(root, { crossCutting: [], areas: {}, quarantine: [id] })
  assert.equal(result.status, 'ok', result.reason)
  assert.match(readFileSync(hindsightPaths(root).quarantine, 'utf8'), new RegExp(id))
  assert.deepEqual(readCandidates(root), [])
})

test('a quarantined candidate seen twice carries count 2', () => {
  const root = newProject()
  const { id } = appendCandidate(root, candidate)
  applyLessonSet(root, { crossCutting: [], areas: {}, quarantine: [id] })
  appendCandidate(root, candidate)
  applyLessonSet(root, { crossCutting: [], areas: {}, quarantine: [id] })
  const lines = readFileSync(hindsightPaths(root).quarantine, 'utf8').trim().split('\n').map(JSON.parse)
  assert.equal(lines.find((l) => l.id === id).count, 2)
})

test('readCurrentSet reads cross-cutting and area files back', () => {
  const root = newProject()
  writeLessonSet(root, {
    crossCutting: [{ text: 'A', date: '2026-08-18', trigger: 't', count: 1 }],
    areas: { api: { paths: ['src/api/**'], lessons: [{ text: 'B', date: '2026-08-18', trigger: 't', count: 1 }] } },
  })
  const set = readCurrentSet(root)
  assert.equal(set.crossCutting[0].text, 'A')
  assert.equal(set.areas.api.lessons[0].text, 'B')
  assert.deepEqual(set.areas.api.paths, ['src/api/**'])
})

test('writeLessonSet deletes area files that are no longer in the set', () => {
  const root = newProject()
  writeLessonSet(root, { crossCutting: [], areas: { api: { paths: ['a/**'], lessons: [{ text: 'A', date: '2026-08-18', trigger: 't', count: 1 }] } } })
  assert.ok(existsSync(hindsightPaths(root).areaFile('api')))
  writeLessonSet(root, { crossCutting: [], areas: {} })
  assert.ok(!existsSync(hindsightPaths(root).areaFile('api')))
})
