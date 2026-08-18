import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLessonFile, renderLessonFile } from '../src/lessons.mjs'

const withPaths = `---
paths:
  - "src/api/**/*.ts"
---
<!-- hindsight: managed file. Hand-edits preserved; bullets may be merged or evicted at session end. -->
## Lessons

- Validate request bodies with Zod before returning <!-- @date:2026-08-18 @trigger:src/api-edit @count:2 -->
- Return { data } | { error } shapes from handlers <!-- @date:2026-08-17 @trigger:handler-return @count:1 -->
`

test('parses paths frontmatter and lesson metadata', () => {
  const parsed = parseLessonFile(withPaths)
  assert.deepEqual(parsed.paths, ['src/api/**/*.ts'])
  assert.equal(parsed.lessons.length, 2)
  assert.equal(parsed.lessons[0].text, 'Validate request bodies with Zod before returning')
  assert.equal(parsed.lessons[0].date, '2026-08-18')
  assert.equal(parsed.lessons[0].trigger, 'src/api-edit')
  assert.equal(parsed.lessons[0].count, 2)
})

test('parses a cross-cutting file with no frontmatter', () => {
  const parsed = parseLessonFile('## Lessons\n\n- Do the thing <!-- @date:2026-08-18 @trigger:t @count:1 -->\n')
  assert.deepEqual(parsed.paths, [])
  assert.equal(parsed.lessons.length, 1)
})

test('tolerates a hand-added bullet with no metadata', () => {
  const parsed = parseLessonFile('## Lessons\n\n- Hand written lesson\n')
  assert.equal(parsed.lessons.length, 1)
  assert.equal(parsed.lessons[0].text, 'Hand written lesson')
  assert.equal(parsed.lessons[0].count, 1)
  assert.equal(parsed.lessons[0].trigger, '')
})

test('ignores non-bullet prose', () => {
  const parsed = parseLessonFile('## Lessons\n\nSome note a human left.\n\n- Real lesson\n')
  assert.equal(parsed.lessons.length, 1)
})

test('render round-trips through parse', () => {
  const parsed = parseLessonFile(withPaths)
  const reparsed = parseLessonFile(renderLessonFile(parsed))
  assert.deepEqual(reparsed.paths, parsed.paths)
  assert.deepEqual(reparsed.lessons, parsed.lessons)
})

test('render omits frontmatter when there are no paths', () => {
  const out = renderLessonFile({
    paths: [],
    lessons: [{ text: 'A', date: '2026-08-18', trigger: 't', count: 1 }],
  })
  assert.ok(!out.startsWith('---'))
  assert.match(out, /^<!-- hindsight/m)
  assert.match(out, /- A <!-- @date:2026-08-18 @trigger:t @count:1 -->/)
})

test('render emits frontmatter when paths are present', () => {
  const out = renderLessonFile({
    paths: ['src/**/*.ts'],
    lessons: [{ text: 'A', date: '2026-08-18', trigger: 't', count: 1 }],
  })
  assert.ok(out.startsWith('---\npaths:\n  - "src/**/*.ts"\n---\n'))
})

test('render omits @trigger when empty and round-trips to empty', () => {
  const out = renderLessonFile({
    paths: [],
    lessons: [{ text: 'A lesson with no trigger', date: '2026-08-18', trigger: '', count: 1 }],
  })
  assert.ok(!out.includes('@trigger'), 'no @trigger field should be rendered')
  assert.match(out, /@date:2026-08-18 @count:1/)
  const reparsed = parseLessonFile(out)
  assert.equal(reparsed.lessons[0].trigger, '')
  assert.equal(reparsed.lessons[0].text, 'A lesson with no trigger')
})
