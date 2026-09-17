import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, readlinkSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const repo = resolve(import.meta.dirname, '..')
test('setup preserves real config, repairs broken links and is idempotent', () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-setup-test-'))
  try {
    const dest = join(root, 'codex home')
    const skills = join(dest, 'skills')
    mkdirSync(join(skills, '.system'), { recursive: true })
    writeFileSync(join(skills, '.system', 'runtime-marker'), 'preserve')
    writeFileSync(join(dest, 'config.toml'), '# original config\n')
    symlinkSync('/missing/old-target', join(dest, 'AGENTS.md'))
    const args = ['bin/setup-codex.mjs', 'default', dest, '--skip-plugins']
    for (let i = 0; i < 2; i++) {
      const result = spawnSync(process.execPath, args, { cwd: repo, encoding: 'utf8' })
      assert.equal(result.status, 0, result.stderr)
    }
    const backups = readdirSync(dest).filter(n => n.startsWith('config.toml.bak.'))
    assert.equal(backups.length, 1)
    assert.equal(readFileSync(join(dest, backups[0]), 'utf8'), '# original config\n')
    assert.equal(readlinkSync(join(dest, 'config.toml')), join(repo, 'codex-profiles/default.toml'))
    assert.equal(readlinkSync(join(dest, 'AGENTS.md')), join(repo, 'codex-shared/AGENTS.md'))
    assert.equal(readlinkSync(join(skills, 'frontend-design')), join(repo, 'shared/skills/frontend-design'))
    assert.equal(readFileSync(join(skills, '.system/runtime-marker'), 'utf8'), 'preserve')
    assert.equal(readlinkSync(join(dest, 'agents')), join(repo, 'codex-shared/agents'))
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('unknown profiles fail without mutating the destination', () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-setup-test-'))
  try {
    const result = spawnSync(process.execPath, ['bin/setup-codex.mjs', '../bad', join(root, 'config'), '--skip-plugins'], { cwd: repo, encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.deepEqual(readdirSync(root), [])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('sound hooks tolerate malformed input and suppress child completion', () => {
  for (const input of ['not JSON', '{"agent_id":"child","hook_event_name":"SubagentStop"}', '{"stop_hook_active":true}']) {
    const result = spawnSync(process.execPath, ['codex-shared/hooks/sound.mjs', 'complete'], { cwd: repo, input, encoding: 'utf8' })
    assert.equal(result.status, 0)
    assert.deepEqual(JSON.parse(result.stdout), {})
    assert.equal(result.stderr, '')
  }
})
