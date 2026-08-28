import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const serverPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'server.mjs')

// Drives the server over real stdio rather than importing it: the transport is
// the part that breaks, and an import-level test would not exercise it.
function request(messages) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverPath])
    let out = ''
    child.stdout.on('data', (chunk) => {
      out += chunk
    })
    child.on('error', reject)
    child.on('close', () =>
      resolve(
        out
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      )
    )
    for (const message of messages) child.stdin.write(JSON.stringify(message) + '\n')
    child.stdin.end()
  })
}

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
}

test('exposes a single think tool with a required thought', async () => {
  const [, listed] = await request([initialize, { jsonrpc: '2.0', id: 2, method: 'tools/list' }])
  const tools = listed.result.tools
  assert.equal(tools.length, 1)
  assert.equal(tools[0].name, 'think')
  assert.deepEqual(tools[0].inputSchema.required, ['thought'])
})

test('description names the domains it was tuned for', async () => {
  const [, listed] = await request([initialize, { jsonrpc: '2.0', id: 2, method: 'tools/list' }])
  const description = listed.result.tools[0].description
  for (const trigger of ['abstraction', 'write code', 'refactor', 'fix a bug', 'delegate']) {
    assert.ok(description.includes(trigger), `description should mention ${trigger}`)
  }
})

test('returns nothing, so the call cannot read as a lookup', async () => {
  const [, , called] = await request([
    initialize,
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'think', arguments: { thought: 'weighing two options' } } },
  ])
  assert.deepEqual(called.result.content, [])
})

test('rejects an empty thought', async () => {
  const [, , called] = await request([
    initialize,
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'think', arguments: { thought: '' } } },
  ])
  assert.ok(called.result.isError, 'an empty thought should be an error')
})
