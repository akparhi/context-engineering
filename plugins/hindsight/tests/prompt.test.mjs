import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDistillPrompt } from '../src/prompt.mjs'

const candidates = [
  {
    id: 'abc12345',
    mistake: 'Used moment.js',
    correction: 'Use date-fns',
    rule: 'Format dates with date-fns',
    trigger: 'adding date formatting',
    files_touched: ['src/api/orders.ts'],
  },
]

test('includes the candidates and their fields', () => {
  const prompt = buildDistillPrompt({ candidates, current: { crossCutting: [], areas: {} } })
  assert.match(prompt, /moment\.js/)
  assert.match(prompt, /date-fns/)
  assert.match(prompt, /src\/api\/orders\.ts/)
})

test('states the caps numerically', () => {
  const prompt = buildDistillPrompt({ candidates, current: { crossCutting: [], areas: {} } })
  assert.match(prompt, /7/)
  assert.match(prompt, /12/)
  assert.match(prompt, /5/)
})

test('demands merging over appending and requires JSON output', () => {
  const prompt = buildDistillPrompt({ candidates, current: { crossCutting: [], areas: {} } })
  assert.match(prompt, /merge/i)
  assert.match(prompt, /JSON/)
  assert.match(prompt, /quarantine/i)
})

test('includes existing lessons so they can be merged into', () => {
  const prompt = buildDistillPrompt({
    candidates,
    current: {
      crossCutting: [{ text: 'Existing lesson', date: '2026-08-01', trigger: 't', count: 1 }],
      areas: {},
    },
  })
  assert.match(prompt, /Existing lesson/)
})

test('instructs reader to call hindsight__apply tool', () => {
  const prompt = buildDistillPrompt({ candidates, current: { crossCutting: [], areas: {} } })
  assert.match(prompt, /hindsight__apply/)
})
