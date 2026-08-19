import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { appendCandidate } from '../src/candidates.mjs'
import { hindsightPaths } from '../src/paths.mjs'

const SERVER = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'server.mjs')

function newProject() {
  const root = mkdtempSync(join(tmpdir(), 'hs-'))
  mkdirSync(join(root, '.claude'))
  return root
}

// Speaks just enough MCP to call one tool and read one reply.
async function callTool(cwd, name, args) {
  const child = spawn(process.execPath, [SERVER], { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
  const send = (msg) => child.stdin.write(JSON.stringify(msg) + '\n')
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } } })
  send({ jsonrpc: '2.0', method: 'notifications/initialized' })
  send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } })

  let buffer = ''
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('timeout')) }, 15_000)
    child.stdout.on('data', (chunk) => {
      buffer += chunk
      for (const line of buffer.split('\n')) {
        if (!line.trim()) continue
        let msg
        try { msg = JSON.parse(line) } catch { continue }
        if (msg.id === 2) {
          clearTimeout(timer)
          child.kill()
          resolve(msg)
        }
      }
    })
    child.on('error', reject)
  })
}

test('distill returns instructions when candidates are pending', async () => {
  const root = newProject()
  appendCandidate(root, { mistake: 'Used moment.js', correction: 'Use date-fns', rule: 'Format dates with date-fns', trigger: 'adding date formatting', files_touched: ['src/api/orders.ts'] })
  const reply = await callTool(root, 'distill', {})
  const body = reply.result.content[0].text
  assert.match(body, /hindsight__apply/)
  assert.match(body, /moment\.js/)
})

test('distill reports an empty queue without writing anything', async () => {
  const root = newProject()
  const reply = await callTool(root, 'distill', {})
  assert.match(reply.result.content[0].text, /no pending candidates/i)
})

test('apply persists a valid lesson set', async () => {
  const root = newProject()
  appendCandidate(root, { mistake: 'm', correction: 'c', rule: 'r', trigger: 't', files_touched: ['src/api/a.ts'] })
  const reply = await callTool(root, 'apply', {
    crossCutting: [{ text: 'Format dates with date-fns', date: '2026-08-18', trigger: 'date-formatting', count: 1 }],
    areas: { api: { paths: ['src/api/**/*.ts'], lessons: [{ text: 'Validate bodies with Zod', date: '2026-08-18', trigger: 'api-edit', count: 1 }] } },
  })
  assert.match(reply.result.content[0].text, /ok|applied/i)
  assert.match(readFileSync(hindsightPaths(root).crossCutting, 'utf8'), /date-fns/)
})

test('a tool returns a text error instead of throwing when there is no project root', async () => {
  const bare = mkdtempSync(join(tmpdir(), 'hs-bare-'))
  const reply = await callTool(bare, 'list', {})
  assert.ok(reply.result, 'expected a tool result, not an MCP protocol error')
  assert.match(reply.result.content[0].text, /hindsight error/i)
})

test('apply reports the rejection reason so the model can retry', async () => {
  const root = newProject()
  appendCandidate(root, { mistake: 'm', correction: 'c', rule: 'r', trigger: 't' })
  const reply = await callTool(root, 'apply', { crossCutting: [{ text: '' }], areas: {} })
  const body = reply.result.content[0].text
  assert.match(body, /reject|failed/i)
  assert.ok(body.length > 20, 'rejection must explain why, not just say no')
})

test('list shows pending candidate ids so they can be removed', async () => {
  const root = newProject()
  const { id } = appendCandidate(root, { mistake: 'm', correction: 'c', rule: 'a memorable rule', trigger: 't' })
  const reply = await callTool(root, 'list', {})
  const body = reply.result.content[0].text
  assert.match(body, new RegExp(id))
  assert.match(body, /a memorable rule/)
})

// Claude Code loads .claude/rules/ once at session start, so a freshly applied
// lesson is inert until the next session unless the tool result carries it back.
test('apply echoes the applied lessons so they bind for the rest of the session', async () => {
  const root = newProject()
  appendCandidate(root, { mistake: 'm', correction: 'c', rule: 'r', trigger: 't' })
  const reply = await callTool(root, 'apply', {
    crossCutting: [{ text: 'Prefer fd over find', date: '2026-08-19', trigger: 'searching for files' }],
    areas: {
      api: {
        paths: ['src/api/**'],
        lessons: [{ text: 'Validate request bodies with Zod', date: '2026-08-19', trigger: 'editing a route' }],
      },
    },
  })
  const body = reply.result.content[0].text
  assert.match(body, /Prefer fd over find/, 'cross-cutting lesson text must come back')
  assert.match(body, /Validate request bodies with Zod/, 'area lesson text must come back')
  assert.match(body, /src\/api\/\*\*/, 'an area lesson without its glob reads as universal')
  assert.match(body, /in effect/i, 'the echo must say the lessons are binding, not just list them')
})

test('apply says so plainly when the applied set is empty', async () => {
  const root = newProject()
  appendCandidate(root, { mistake: 'm', correction: 'c', rule: 'r', trigger: 't' })
  const reply = await callTool(root, 'apply', { crossCutting: [], areas: {} })
  assert.match(reply.result.content[0].text, /empty/i)
})
