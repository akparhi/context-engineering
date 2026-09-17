#!/usr/bin/env node
import { lstatSync, mkdirSync, readlinkSync, readdirSync, renameSync, symlinkSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'

const repo = resolve(import.meta.dirname, '..')
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { 'skip-plugins': { type: 'boolean' }, help: { type: 'boolean' } },
})
if (values.help) {
  console.log('Usage: node bin/setup-codex.mjs [profile=default] [destination=~/.codex] [--skip-plugins]')
  process.exit(0)
}
const expand = p => resolve(p === '~' ? homedir() : p.startsWith('~/') ? join(homedir(), p.slice(2)) : p)
const [profile = 'default', directory = process.env.CODEX_HOME || join(homedir(), '.codex')] = positionals
const profiles = readdirSync(join(repo, 'codex-profiles')).filter(p => p.endsWith('.toml')).map(p => p.slice(0, -5))
if (positionals.length > 2 || !profiles.includes(profile)) {
  console.error(`Unknown profile or extra argument. Available profiles: ${profiles.join(', ')}`)
  process.exit(1)
}
const dest = expand(directory)
const sharedSkills = join(repo, 'shared/skills')
const standardHome = dest === join(homedir(), '.codex')
const skills = standardHome ? join(homedir(), '.agents/skills') : join(dest, 'skills')
const skillLinks = standardHome
  ? [[sharedSkills, skills]]
  : readdirSync(sharedSkills, { withFileTypes: true }).filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).map(entry => [join(sharedSkills, entry.name), join(skills, entry.name)])
const links = [
  [join(repo, `codex-profiles/${profile}.toml`), join(dest, 'config.toml')],
  ...['AGENTS.md', 'agents', 'hooks.json', 'hooks'].map(name => [join(repo, 'codex-shared', name), join(dest, name)]),
  ...skillLinks,
]
// Validate every source before replacing any destination.
for (const [source] of links) lstatSync(source)
for (const [source, destination] of links) {
  mkdirSync(dirname(destination), { recursive: true })
  let existing
  try { existing = lstatSync(destination) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (existing?.isSymbolicLink() && resolve(dirname(destination), readlinkSync(destination)) === source) {
    console.log(`ok      ${destination}`)
    continue
  }
  if (existing?.isSymbolicLink()) unlinkSync(destination)
  else if (existing) {
    const backup = `${destination}.bak.${Date.now()}`
    renameSync(destination, backup)
    console.log(`backup  ${backup}`)
  }
  symlinkSync(source, destination)
  console.log(`linked  ${destination}`)
}
if (!values['skip-plugins']) {
  const result = spawnSync('codex', ['plugin', 'add', 'superpowers@openai-curated-remote', '-c', 'features.remote_plugin=true'], {
    env: { ...process.env, CODEX_HOME: dest }, stdio: 'inherit',
  })
  if (result.error || result.status !== 0) {
    console.error('Superpowers installation failed; config links are installed. Retry setup without --skip-plugins.')
    process.exit(1)
  }
}
console.log(`Restart Codex; use /hooks to review and trust the sound hooks. Shared skills linked at ${skills}.`)
