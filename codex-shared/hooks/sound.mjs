#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

// Hooks must never hold up or alter the agent's decision.
try {
  const event = JSON.parse(readFileSync(0, 'utf8') || '{}')
  const kind = process.argv[2]
  if (!event.agent_id && !event.stop_hook_active && ['attention', 'complete'].includes(kind)) {
    const path = `/System/Library/Sounds/${kind === 'attention' ? 'Funk' : 'Submarine'}.aiff`
    if (process.platform === 'darwin' && existsSync(path)) {
      spawnSync('/usr/bin/afplay', [path], { stdio: 'ignore', timeout: 2500 })
    }
  }
} catch {}
process.stdout.write('{}\n')
