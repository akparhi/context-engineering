#!/usr/bin/env node
//
// Interactive setup: pick a profile and a destination, symlink the config into
// place, then optionally install plugins from this marketplace.
//
//   bun run setup                          # ask for both
//   bun run setup darkforest               # ask only for the destination
//   bun run setup darkforest ~/.darkforest/claude
//
// Re-running is safe: an existing symlink is repointed, and a real file or
// directory is moved aside rather than overwritten.

import { createInterface } from 'node:readline'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, symlinkSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const profilesDir = join(repo, 'claude-profiles')
const sharedDir = join(repo, 'claude-shared')
const marketplaceFile = join(repo, '.claude-plugin', 'marketplace.json')

const expandHome = (input) => (input.startsWith('~') ? join(homedir(), input.slice(1)) : input)

// 'default' sorts first regardless of what other profiles exist: it is what
// almost everyone wants, so it is the offered default rather than whatever
// happens to be alphabetically first.
function listProfiles() {
  const names = readdirSync(profilesDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => basename(name, '.json'))
    .sort()
  return names.includes('default') ? ['default', ...names.filter((n) => n !== 'default')] : names
}

function listPlugins() {
  if (!existsSync(marketplaceFile)) return []
  try {
    const parsed = JSON.parse(readFileSync(marketplaceFile, 'utf8'))
    const marketplace = parsed.name
    return (parsed.plugins ?? []).map((plugin) => ({
      name: plugin.name,
      description: plugin.description ?? '',
      source: plugin.source,
      ref: marketplace ? `${plugin.name}@${marketplace}` : plugin.name,
    }))
  } catch {
    return []
  }
}

function run(command, args, cwd = repo) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  return result.status === 0
}

// Plugins declaring an MCP server need their dependencies present or the server
// will not start, leaving the plugin registered but its tools missing.
function installPlugin(plugin) {
  const dir = plugin.source?.startsWith('./') ? join(repo, plugin.source) : null
  if (dir && existsSync(join(dir, 'package.json'))) {
    const bun = spawnSync('bun', ['--version'], { stdio: 'ignore' }).status === 0
    console.log(`\n  installing dependencies for ${plugin.name}`)
    const ok = bun
      ? run('bun', ['install', '--frozen-lockfile'], dir)
      : run('npm', ['ci'], dir)
    if (!ok) {
      console.error(`  error: dependency install failed for ${plugin.name}; its tools will not load`)
      return false
    }
  }
  console.log(`\n  installing plugin ${plugin.ref}`)
  return run('claude', ['plugin', 'install', plugin.ref])
}

// Reports what it did rather than staying silent: the whole point of running
// this is to find out which links changed.
function link(target, path) {
  const label = basename(path)
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true })

  let existing = null
  try {
    existing = lstatSync(path)
  } catch {}

  if (existing?.isSymbolicLink()) {
    const current = readlinkSync(path)
    if (current === target) return `  ok        ${label}`
    rmSync(path)
    symlinkSync(target, path)
    return `  relinked  ${label}  (was ${current})`
  }

  if (existing) {
    // A real file here is the only copy of that config; never clobber it.
    const backup = `${path}.bak.${Date.now()}`
    renameSync(path, backup)
    symlinkSync(target, path)
    return `  backed up ${label} -> ${basename(backup)}`
  }

  symlinkSync(target, path)
  return `  linked    ${label}`
}

async function main() {
  const profiles = listProfiles()
  if (!profiles.length) {
    console.error(`error: no profiles in ${profilesDir}`)
    process.exit(1)
  }

  let [profile, dest] = process.argv.slice(2)

  // One line-reader for both cases. A piped stdin emits 'close' before readline
  // hands over buffered lines, so racing a question against 'close' silently
  // drops real answers; pulling lines from one async iterator avoids that
  // entirely and returns null once input runs out, so prompts fall back to
  // their defaults instead of hanging.
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })[Symbol.asyncIterator]()
  const nextLine = async () => {
    const { value, done } = await lines.next()
    return done ? null : value
  }

  const ask = async (prompt, fallback) => {
    process.stdout.write(prompt)
    const line = await nextLine()
    return line === null ? fallback : line.trim() || fallback
  }

  try {
    if (!profile) {
      console.log('Profiles:')
      profiles.forEach((name, i) => console.log(`  ${i + 1}) ${name}`))
      const answer = await ask(`Which profile? [${profiles[0]}] `, profiles[0])
      // Accept either the number shown or the name typed.
      profile = profiles[Number(answer) - 1] ?? answer
    }

    if (!profiles.includes(profile)) {
      console.error(`error: no such profile '${profile}' (have: ${profiles.join(', ')})`)
      process.exit(1)
    }

    if (!dest) {
      dest = await ask('Config directory? [~/.claude] ', '~/.claude')
    }

    dest = resolve(expandHome(dest))
    mkdirSync(dest, { recursive: true })

    console.log(`\nprofile '${profile}' -> ${dest}`)
    for (const line of [
      link(join(profilesDir, `${profile}.json`), join(dest, 'settings.json')),
      link(join(sharedDir, 'skills'), join(dest, 'skills')),
      link(join(sharedDir, 'output-styles'), join(dest, 'output-styles')),
      link(join(sharedDir, 'rules'), join(dest, 'rules')),
      link(join(sharedDir, 'CLAUDE.md'), join(dest, 'CLAUDE.md')),
    ]) {
      console.log(line)
    }

    const plugins = listPlugins()
    if (!plugins.length) return

    console.log('\nPlugins:')
    plugins.forEach((plugin, i) => console.log(`  ${i + 1}) ${plugin.name} — ${plugin.description}`))
    const answer = await ask('Install which? (numbers, names, "all", or blank to skip) ', '')
    if (!answer) {
      console.log('  skipped')
      return
    }

    const wanted =
      answer.toLowerCase() === 'all'
        ? plugins
        : answer
            .split(/[\s,]+/)
            .filter(Boolean)
            .map((token) => plugins[Number(token) - 1] ?? plugins.find((p) => p.name === token))
            .filter(Boolean)

    if (!wanted.length) {
      console.error(`  error: no plugin matched '${answer}'`)
      return
    }

    // Installing from a local marketplace needs it registered first; adding an
    // already-registered marketplace is a harmless no-op.
    run('claude', ['plugin', 'marketplace', 'add', repo])
    for (const plugin of wanted) installPlugin(plugin)
  } finally {
    await lines.return?.()
  }
}

await main()
