import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, renameSync, rmSync, readdirSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const hook = resolve(import.meta.dirname, '../plugins/breathe/hooks/breathe.sh')
const GiB = 1048576 // KiB

// Session 100 has an MCP server in its own group (200) and two Bash tool shells (300, 400) whose
// commands run in their shells' groups. Session 700 runs one small command. Its breathe watcher (900) is not an agent command. 500 is a user app.
const ps = [
  [100, 1, 100, 2 * GiB, '/Users/me/.local/bin/claude --resume'],
  [200, 100, 100, 3 * GiB, 'node mcp-server.js'],
  [300, 100, 300, 4096, '/bin/zsh -c bun test'],
  [301, 300, 300, 2 * GiB, 'bun test --parallel'],
  [302, 301, 300, 3 * GiB, 'bun test worker'],
  [400, 100, 400, 4096, '/bin/zsh -c next dev'],
  [401, 400, 400, 1 * GiB, 'node "next" dev'],
  [500, 1, 500, 20 * GiB, '/Applications/Docker.app/Contents/MacOS/Docker'],
  [700, 1, 700, 1 * GiB, 'claude'],
  [800, 700, 800, 4096, '/bin/zsh -c tsc'],
  [801, 800, 800, GiB / 2, 'node tsc --watch'],
  [900, 700, 900, 4096, '/bin/zsh -c /p/hooks/breathe.sh watch'],
  [901, 900, 900, 2048, '/bin/bash /p/hooks/breathe.sh watch'],
].map(row => row.join(' ')).join('\n') + '\n'

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'breathe-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const psFile = join(dir, 'ps.txt')
  writeFileSync(psFile, ps)
  const state = join(dir, 'state')
  const hookEnv = (readings, env) => ({
    PATH: process.env.PATH, HOME: dir, CLAUDE_CODE_SESSION_ID: 's1', BREATHE_SESSION_PID: '100',
    BREATHE_STATE_DIR: state, BREATHE_PS_FILE: psFile, BREATHE_MEMSIZE: String(16 * GiB * 1024),
    BREATHE_READINGS: readings, ...env,
  })
  const run = (readings, env = {}, input = '') => {
    const result = spawnSync(hook, ['PostToolUse'], { encoding: 'utf8', input, env: hookEnv(readings, env) })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stderr, '')
    if (!result.stdout) return ''
    const out = JSON.parse(result.stdout).hookSpecificOutput
    assert.equal(out.hookEventName, 'PostToolUse')
    return out.additionalContext
  }
  const runConcurrently = (n, readings) => Promise.all(Array.from({ length: n }, () => new Promise(done => {
    let out = ''
    const child = spawn(hook, ['PostToolUse'], { env: hookEnv(readings, {}) })
    child.stdout.on('data', chunk => { out += chunk })
    child.stdin.end()
    child.on('close', () => done(out))
  })))
  // Stands in for a minute passing: every marker in the state dir is two minutes old.
  const age = () => {
    const then = new Date(Date.now() - 120_000)
    for (const name of readdirSync(state)) utimesSync(join(state, name), then, then)
  }
  return { run, runConcurrently, age, psFile }
}

test('silent while memory and disk are fine', t => {
  const { run } = setup(t)
  assert.equal(run('80 200'), '')
})

test('memory trip tells the heaviest session its own groups by summed memory, and lists the others', t => {
  const { run } = setup(t)
  const note = run('10 200')
  assert.match(note, /Free memory is 10% \(floor 15%, clear at 30%\)/)
  assert.match(note, /Your commands hold 6\.0 GiB, the most of any session\. Stop or shrink them now/)
  const groups = note.split('\n').filter(line => /^\d+ {2}/.test(line))
  assert.deepEqual(groups, ['300  5.0 GiB  bun test worker', '400  1.0 GiB  node  next  dev'])
  assert.match(note, /Other sessions, whose processes you must not touch:\nclaude pid 700: 0\.5 GiB, largest command: node tsc --watch/)
  assert.doesNotMatch(note, /mcp-server|claude --resume|outside the agents|Free disk/)
})

test('memory trip tells a light session it is not the cause and names the heavy one', t => {
  const { run } = setup(t)
  const note = run('10 200', { BREATHE_SESSION_PID: '700' })
  assert.match(note, /Your commands hold only 0\.5 GiB, so you are not the cause\. Only hold off new heavy work\./)
  assert.match(note, /\n800 {2}0\.5 GiB {2}node tsc --watch\n/)
  assert.match(note, /claude pid 100: 6\.0 GiB, largest command: bun test worker/)
  assert.doesNotMatch(note, /^300 /m)
})

test('a session with no commands of its own is told it is not the cause', t => {
  const { run } = setup(t)
  assert.match(run('10 200', { BREATHE_SESSION_PID: '999' }), /You run no agent commands now, so you are not the cause/)
})

test('memory trip says the pressure is outside the agents when they hold under a quarter of used memory', t => {
  const { run } = setup(t)
  // 10% free of 256 GiB leaves 230 GiB in use; the agents hold 6 GiB.
  const note = run('10 200', { BREATHE_MEMSIZE: String(256 * GiB * 1024) })
  assert.match(note, /most of the pressure comes from outside the agents/)
  assert.match(note, /Your commands hold 6\.0 GiB\. Stop the ones you no longer need\./, 'the largest session is not called the cause')
})

test('disk trip names free GiB and what agents fill, without listing processes', t => {
  const { run } = setup(t)
  const note = run('80 9')
  assert.match(note, /Free disk is 9 GiB \(floor 15 GiB\)/)
  assert.match(note, /worktrees, node_modules/)
  assert.doesNotMatch(note, /Free memory|GiB {2}/)
})

test('stays tripped between floor and recover, then reports recovery once', t => {
  const { run, age } = setup(t)
  assert.notEqual(run('10 200'), '')
  age()
  assert.match(run('20 200'), /low on resources/)
  age()
  assert.equal(run('29 200').includes('low on resources'), true)
  assert.match(run('30 200'), /back to 30% free memory and 200 GiB free disk\. Normal work can resume\./)
  assert.equal(run('30 200'), '')
  assert.equal(run('20 200'), '', 'under recover but over the floor does not trip again')
})

test('every session that was warned hears about recovery', t => {
  const { run } = setup(t)
  run('10 200')
  run('10 200', { CLAUDE_CODE_SESSION_ID: 's2' })
  assert.match(run('40 200'), /Normal work can resume/)
  assert.match(run('40 200', { CLAUDE_CODE_SESSION_ID: 's2' }), /Normal work can resume/)
  assert.equal(run('40 200', { CLAUDE_CODE_SESSION_ID: 's3' }), '')
})

test('while tripped, each session gets the note at most once a minute, and recovery is never held back', t => {
  const { run, age } = setup(t)
  assert.match(run('10 200'), /low on resources/)
  assert.equal(run('10 200'), '', 'a second run within the minute stays quiet')
  assert.match(run('10 200', { CLAUDE_CODE_SESSION_ID: 's2' }), /low on resources/, 'another session still hears it')
  age()
  assert.match(run('10 200'), /low on resources/, 'after a minute the note comes back')
  assert.match(run('40 200'), /Normal work can resume/, 'recovery right after a note is not throttled')
})

test('concurrent healthy runs report recovery to a warned session exactly once', async t => {
  const { run, runConcurrently } = setup(t)
  for (let burst = 0; burst < 5; burst++) {
    run('10 200')
    const outputs = await runConcurrently(12, '40 200')
    assert.equal(outputs.filter(out => out.includes('Normal work can resume')).length, 1, `burst ${burst}`)
  }
})

test('concurrent tripped runs give one agent the note exactly once', async t => {
  const { runConcurrently, age } = setup(t)
  for (let burst = 0; burst < 5; burst++) {
    if (burst) age()
    const outputs = await runConcurrently(12, '10 200')
    assert.equal(outputs.filter(out => out.includes('low on resources')).length, 1, `burst ${burst}`)
  }
})

test('the breathe watcher never counts as an agent command', t => {
  for (const pid of ['100', '700']) {
    const note = setup(t).run('10 200', { BREATHE_SESSION_PID: pid })
    assert.match(note, /low on resources/)
    assert.doesNotMatch(note, /breathe\.sh/, `session ${pid}`)
  }
})

test('the agent that was warned hears about recovery, not the next agent to fire a hook', t => {
  const { run } = setup(t)
  const inSubagent = id => JSON.stringify({ session_id: 's1', hook_event_name: 'PostToolUse', agent_id: id, agent_type: 'Explore' })
  run('10 200')
  run('10 200', {}, inSubagent('agent-a'))
  assert.equal(run('40 200', {}, inSubagent('agent-b')), '', 'a new subagent was never warned')
  assert.match(run('40 200', {}, inSubagent('agent-a')), /Normal work can resume/)
  assert.match(run('40 200'), /Normal work can resume/, 'the main agent still hears it')
})

test('settings move the thresholds; bad settings fall back to the defaults', t => {
  const { run, age } = setup(t)
  const opt = (floor, recover, disk) => ({
    CLAUDE_PLUGIN_OPTION_BREATHE_MEMORY_FLOOR_PCT: floor,
    CLAUDE_PLUGIN_OPTION_BREATHE_RECOVER_PCT: recover,
    CLAUDE_PLUGIN_OPTION_BREATHE_DISK_FLOOR_GIB: disk,
  })
  assert.match(run('20 200', opt('25', '40', '15')), /floor 25%, clear at 40%/)
  assert.match(run('50 200', opt('25', '40', '15')), /Normal work can resume/)
  for (const bad of [opt('40', '30', '15'), opt('-5', '30', '15'), opt('abc', '30', '15'), opt('15', '101', '15')]) {
    assert.equal(run('20 200', bad), '', JSON.stringify(bad))
    assert.match(run('10 200', bad), /floor 15%, clear at 30%/, JSON.stringify(bad))
    run('80 200', bad)
  }
  assert.match(run('80 12', opt('15', '30', '0')), /floor 15 GiB/, 'a zero disk floor falls back to 15')
  age()
  assert.match(run('80 12', opt('15', '30', 'x')), /floor 15 GiB/)
})

test('silent when turned off in /config', t => {
  const { run } = setup(t)
  assert.equal(run('5 1', { CLAUDE_PLUGIN_OPTION_BREATHE: 'false' }), '')
})

test('real readings and real ps produce valid output', t => {
  const { run } = setup(t)
  for (const readings of ['', '1 1']) run(readings, { BREATHE_PS_FILE: '', BREATHE_MEMSIZE: '' })
})

function watcher(t, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'breathe-watch-'))
  const session = spawn('sleep', ['60'])
  t.after(() => { session.kill(); rmSync(dir, { recursive: true, force: true }) })
  const readings = join(dir, 'readings')
  const set = value => { writeFileSync(`${readings}.tmp`, `${value}\n`); renameSync(`${readings}.tmp`, readings) }
  set('80 200')
  const child = spawn(hook, ['watch'], {
    env: { PATH: process.env.PATH, HOME: dir, CLAUDE_PID: String(session.pid), BREATHE_READINGS_FILE: readings, BREATHE_INTERVAL: '0.02', ...env },
  })
  child.stdin.end()
  t.after(() => child.kill())
  let out = ''
  child.stdout.on('data', chunk => { out += chunk })
  const exited = new Promise(done => child.on('exit', code => done(code)))
  const lines = () => out.split('\n').filter(Boolean)
  // Ten watch passes at the 20 ms interval.
  const settle = () => new Promise(done => setTimeout(done, 200))
  return { set, lines, settle, exited, session, child }
}

test('watch prints one line on each trip and nothing else', async t => {
  const { set, lines, settle } = watcher(t)
  await settle()
  assert.deepEqual(lines(), [], 'silent while fine')
  set('10 200')
  await settle()
  assert.deepEqual(lines(), ['breathe: the Mac is low, free memory is 10% (floor 15%). The breathe note on this turn names what to stop.'])
  set('5 9')
  await settle()
  set('20 200')
  await settle()
  set('29 200')
  await settle()
  assert.equal(lines().length, 1, 'no repeat while tripped or between floor and recover')
  set('30 200')
  await settle()
  set('80 9')
  await settle()
  assert.equal(lines().length, 2, 'trips again after recovery')
  assert.equal(lines()[1], 'breathe: the Mac is low, free disk is 9 GiB (floor 15 GiB). The breathe note on this turn names what to stop.')
})

test('watch exits when the session it watches is gone', async t => {
  const { exited, session, child, settle } = watcher(t)
  await settle()
  assert.equal(child.exitCode, null, 'runs while the session lives')
  session.kill()
  assert.equal(await exited, 0)
})

test('watch reads the breathe options from user settings', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'breathe-settings-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const settings = options => writeFileSync(join(dir, 'settings.json'), JSON.stringify({ pluginConfigs: { 'breathe@mkt': { options } } }))
  settings({ breathe_memory_floor_pct: 25, breathe_recover_pct: 40 })
  const tuned = watcher(t, { CLAUDE_CONFIG_DIR: dir })
  tuned.set('20 200')
  await tuned.settle()
  assert.match(tuned.lines()[0] ?? '', /free memory is 20% \(floor 25%\)/)
  settings({ breathe: false })
  const off = watcher(t, { CLAUDE_CONFIG_DIR: dir })
  off.set('5 1')
  assert.equal(await off.exited, 0)
  assert.deepEqual(off.lines(), [])
})

test('a running watch goes quiet when breathe is turned off', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'breathe-settings-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const settings = options => writeFileSync(join(dir, 'settings.json'), JSON.stringify({ pluginConfigs: { 'breathe@mkt': { options } } }))
  settings({ breathe: true })
  const running = watcher(t, { CLAUDE_CONFIG_DIR: dir })
  await running.settle()
  settings({ breathe: false })
  running.set('5 1')
  await running.settle()
  assert.deepEqual(running.lines(), [])
  assert.equal(await running.exited, 0)
})
