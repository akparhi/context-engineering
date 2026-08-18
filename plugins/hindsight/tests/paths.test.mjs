import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findProjectRoot, hindsightPaths } from '../src/paths.mjs'

test('findProjectRoot finds the dir containing .claude', () => {
  const root = mkdtempSync(join(tmpdir(), 'hs-'))
  mkdirSync(join(root, '.claude'))
  const nested = join(root, 'src', 'deep')
  mkdirSync(nested, { recursive: true })
  assert.equal(findProjectRoot(nested), root)
})

test('findProjectRoot returns null when no .claude exists', () => {
  const root = mkdtempSync(join(tmpdir(), 'hs-'))
  assert.equal(findProjectRoot(root), null)
})

test('hindsightPaths builds every path under the root', () => {
  const p = hindsightPaths('/proj')
  assert.equal(p.dir, '/proj/.claude/hindsight')
  assert.equal(p.candidates, '/proj/.claude/hindsight/candidates.jsonl')
  assert.equal(p.quarantine, '/proj/.claude/hindsight/quarantine.jsonl')
  assert.equal(p.log, '/proj/.claude/hindsight/distill.log')
  assert.equal(p.rulesDir, '/proj/.claude/rules')
  assert.equal(p.crossCutting, '/proj/.claude/rules/hindsight.md')
  assert.equal(p.areaFile('api'), '/proj/.claude/rules/hindsight-api.md')
})

test('areaFile slugifies unsafe area names', () => {
  const p = hindsightPaths('/proj')
  assert.equal(p.areaFile('API Layer'), '/proj/.claude/rules/hindsight-api-layer.md')
  assert.equal(p.areaFile('../escape'), '/proj/.claude/rules/hindsight-escape.md')
})
