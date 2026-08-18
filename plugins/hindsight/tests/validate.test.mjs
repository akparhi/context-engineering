import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CAPS, validateLessonSet, enforceCaps } from '../src/validate.mjs'

const lesson = (text, date = '2026-08-18') => ({ text, date, trigger: 't', count: 1 })
const many = (n, prefix) => Array.from({ length: n }, (_, i) => lesson(`${prefix} ${i}`, `2026-08-${String(i + 1).padStart(2, '0')}`))

test('caps match the spec', () => {
  assert.deepEqual(CAPS, { crossCutting: 7, perArea: 12, areaFiles: 5 })
})

test('accepts a well-formed set', () => {
  const result = validateLessonSet({
    crossCutting: many(3, 'x'),
    areas: { api: { paths: ['src/api/**'], lessons: many(2, 'a') } },
  })
  assert.equal(result.ok, true, result.errors.join('; '))
})

test('rejects too many cross-cutting lessons', () => {
  const result = validateLessonSet({ crossCutting: many(8, 'x'), areas: {} })
  assert.equal(result.ok, false)
  assert.match(result.errors.join(' '), /cross-cutting/)
})

test('rejects too many lessons in one area', () => {
  const result = validateLessonSet({ crossCutting: [], areas: { api: { paths: ['a/**'], lessons: many(13, 'a') } } })
  assert.equal(result.ok, false)
  assert.match(result.errors.join(' '), /area 'api'/)
})

test('rejects too many area files', () => {
  const areas = {}
  for (const name of ['a', 'b', 'c', 'd', 'e', 'f']) areas[name] = { paths: [`${name}/**`], lessons: [lesson('l')] }
  const result = validateLessonSet({ crossCutting: [], areas })
  assert.equal(result.ok, false)
  assert.match(result.errors.join(' '), /area files/)
})

test('rejects an area with no paths glob', () => {
  const result = validateLessonSet({ crossCutting: [], areas: { api: { paths: [], lessons: [lesson('l')] } } })
  assert.equal(result.ok, false)
  assert.match(result.errors.join(' '), /paths/)
})

test('rejects an empty lesson text', () => {
  const result = validateLessonSet({ crossCutting: [lesson('')], areas: {} })
  assert.equal(result.ok, false)
})

test('rejects a multi-line lesson', () => {
  const result = validateLessonSet({ crossCutting: [lesson('line one\nline two')], areas: {} })
  assert.equal(result.ok, false)
  assert.match(result.errors.join(' '), /one line/)
})

test('enforceCaps evicts the oldest cross-cutting lessons', () => {
  const set = enforceCaps({ crossCutting: many(10, 'x'), areas: {} })
  assert.equal(set.crossCutting.length, 7)
  assert.ok(!set.crossCutting.some((l) => l.text === 'x 0'))
  assert.ok(set.crossCutting.some((l) => l.text === 'x 9'))
})

test('enforceCaps evicts the oldest area files', () => {
  const areas = {}
  for (const [i, name] of ['a', 'b', 'c', 'd', 'e', 'f'].entries()) {
    areas[name] = { paths: [`${name}/**`], lessons: [lesson('l', `2026-08-0${i + 1}`)] }
  }
  const set = enforceCaps({ crossCutting: [], areas })
  assert.equal(Object.keys(set.areas).length, 5)
  assert.ok(!('a' in set.areas))
})

test('enforceCaps output always validates', () => {
  const set = enforceCaps({ crossCutting: many(20, 'x'), areas: { api: { paths: ['a/**'], lessons: many(30, 'a') } } })
  assert.equal(validateLessonSet(set).ok, true)
})
