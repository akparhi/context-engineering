// Works out the terminal's background and foreground colors from its config,
// so a diagram can be drawn on the terminal's own background: the parts of a
// diagram that mask what lies under them (an edge label's box, a subgraph)
// are filled with the background color.
//
// `terminalColors({ terminal, prefersDark })`, with `ghostty` or `kitty`,
// answers `{ ok: true, background, foreground, palette, source }` or `{ ok: false,
// reason }`. It reads the terminal's config files and theme files, and on
// macOS the system's dark mode setting when the Ghostty theme depends on it.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { readIfExists } from './font-metrics.mjs'

// What the terminals draw when nothing is configured.
const GHOSTTY_DEFAULT = { background: '#282c34', foreground: '#ffffff' }
const KITTY_DEFAULT = { background: '#000000', foreground: '#dddddd' }
const NAMED = { black: '#000000', white: '#ffffff' }

// `#rrggbb`, `rrggbb`, `#rgb` or a few names, as #rrggbb; anything else undefined.
export function normalizeColor(value) {
  const text = value.trim().toLowerCase()
  if (NAMED[text]) return NAMED[text]
  const hex = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/.exec(text)
  if (!hex) return undefined
  const digits = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1]
  return '#' + digits
}

function unquote(value) {
  return value.replace(/^"(.*)"$/, '$1').trim()
}

// The 16 ANSI colors as an array; later entries win per index.
function mergePalette(into, from) {
  if (!from) return into
  const palette = [...(into ?? [])]
  from.forEach((color, i) => { if (color) palette[i] = color })
  return palette
}

// Ghostty's `key = value` lines: the last background, foreground, theme and
// `palette = N=#hex` win; `config-file` includes are followed, relative to the including file.
export function parseGhosttyColors(text, dir = '', readFile = readIfExists, depth = 0) {
  const out = {}
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    const value = unquote(line.slice(eq + 1).trim())
    if (key === 'background' || key === 'foreground') {
      const color = normalizeColor(value)
      if (color) out[key] = color
    }
    if (key === 'theme') out.theme = value === '' ? undefined : value
    const entry = key === 'palette' && /^(\d+)\s*=\s*(.+)$/.exec(value)
    if (entry && Number(entry[1]) < 16 && normalizeColor(entry[2])) {
      out.palette ??= []
      out.palette[Number(entry[1])] = normalizeColor(entry[2])
    }
    if (key === 'config-file' && depth < 4 && value !== '') {
      const file = value.replace(/^\?/, '')
      const resolved = path.isAbsolute(file) ? file : path.join(dir, file)
      const included = parseGhosttyColors(readFile(resolved), path.dirname(resolved), readFile, depth + 1)
      Object.assign(out, included, { palette: mergePalette(out.palette, included.palette) })
    }
  }
  return out
}

// `theme = name` or `theme = light:one,dark:other`: the name for this mode.
export function themeName(theme, prefersDark) {
  if (!theme.includes(':')) return theme
  const pairs = Object.fromEntries(
    theme.split(',').map(part => {
      const at = part.indexOf(':')
      return [part.slice(0, at).trim(), part.slice(at + 1).trim()]
    }),
  )
  return (prefersDark ? pairs.dark : pairs.light) ?? pairs.dark ?? pairs.light
}

function ghosttyThemeDirs(home, xdg, platform, resourcesDir) {
  const dirs = [path.join(xdg, 'ghostty/themes')]
  if (resourcesDir) dirs.push(path.join(resourcesDir, 'themes'))
  if (platform === 'darwin') {
    for (const app of ['Ghostty.app', 'cmux.app', 'Aberrant.app']) {
      dirs.push(`/Applications/${app}/Contents/Resources/ghostty/themes`, path.join(home, 'Applications', app, 'Contents/Resources/ghostty/themes'))
    }
  } else {
    dirs.push('/usr/share/ghostty/themes', '/usr/local/share/ghostty/themes')
  }
  return dirs
}

// macOS's dark mode: `defaults` answers Dark, and fails in light mode.
function macPrefersDark() {
  try {
    return execFileSync('defaults', ['read', '-g', 'AppleInterfaceStyle'], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim() === 'Dark'
  } catch {
    return false
  }
}

/** `themeOverride` is the file a Ghostty-based app (cmux, aberrant) writes its theme to; it loads after the Ghostty config. */
export function ghosttyColors({ home, xdgConfigHome, platform, resourcesDir, prefersDark, themeOverride, readFile = readIfExists }) {
  const xdg = xdgConfigHome || path.join(home, '.config')
  const files = [path.join(xdg, 'ghostty/config'), path.join(xdg, 'ghostty/config.ghostty')]
  if (platform === 'darwin') {
    const support = path.join(home, 'Library/Application Support/com.mitchellh.ghostty')
    files.push(path.join(support, 'config'), path.join(support, 'config.ghostty'))
  }
  if (themeOverride) files.push(themeOverride)
  const config = {}
  for (const file of files) {
    const parsed = parseGhosttyColors(readFile(file), path.dirname(file), readFile)
    Object.assign(config, parsed, { palette: mergePalette(config.palette, parsed.palette) })
  }

  let colors = { ...GHOSTTY_DEFAULT }
  let source = 'Ghostty default', themeTitle, themePalette
  if (config.theme) {
    const dark = platform === 'darwin' && config.theme.includes(':') ? macPrefersDark() : prefersDark
    const name = themeName(config.theme, dark)
    const candidates = path.isAbsolute(name) ? [name] : ghosttyThemeDirs(home, xdg, platform, resourcesDir).map(dir => path.join(dir, name))
    const found = candidates.find(file => readFile(file) !== '')
    if (found === undefined) return { ok: false, reason: `Ghostty theme "${name}" not found` }
    const theme = parseGhosttyColors(readFile(found), path.dirname(found), readFile)
    colors = { background: theme.background ?? colors.background, foreground: theme.foreground ?? colors.foreground }
    source = `Ghostty theme ${name}`
    themeTitle = name
    themePalette = theme.palette
  }
  if (config.background) source = 'Ghostty config'
  return {
    ok: true,
    background: config.background ?? colors.background,
    foreground: config.foreground ?? colors.foreground,
    palette: mergePalette(themePalette, config.palette),
    theme: themeTitle,
    source,
  }
}

// kitty.conf's `key value` lines, following `include` and `globinclude` (as
// a theme set by `kitten themes` is); the last background and foreground win.
export function parseKittyColors(text, dir, readFile = readIfExists, depth = 0) {
  const out = {}
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const [key, ...rest] = line.split(/\s+/)
    const value = rest.join(' ')
    if (key === 'background' || key === 'foreground') {
      const color = normalizeColor(value)
      if (color) out[key] = color
    }
    if ((key === 'include' || key === 'globinclude') && depth < 4 && value !== '') {
      const resolved = path.isAbsolute(value) ? value : path.join(dir, value)
      const files = key === 'include' ? [resolved] : globFiles(resolved)
      for (const file of files) Object.assign(out, parseKittyColors(readFile(file), path.dirname(file), readFile, depth + 1))
    }
  }
  return out
}

// The files a `globinclude` pattern names: `*` in the last path segment only.
function globFiles(pattern) {
  const dir = path.dirname(pattern)
  const re = new RegExp(`^${path.basename(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`)
  try {
    return fs.readdirSync(dir).filter(name => re.test(name)).sort().map(name => path.join(dir, name))
  } catch {
    return []
  }
}

export function kittyColors({ home, xdgConfigHome, readFile = readIfExists }) {
  const xdg = xdgConfigHome || path.join(home, '.config')
  const dir = path.join(xdg, 'kitty')
  const config = parseKittyColors(readFile(path.join(dir, 'kitty.conf')), dir, readFile)
  return {
    ok: true,
    background: config.background ?? KITTY_DEFAULT.background,
    foreground: config.foreground ?? KITTY_DEFAULT.foreground,
    source: config.background ? 'kitty.conf' : 'kitty default',
  }
}

export function terminalColors({
  terminal,
  prefersDark = true,
  home = os.homedir(),
  xdgConfigHome = process.env.XDG_CONFIG_HOME,
  platform = process.platform,
  resourcesDir = process.env.GHOSTTY_RESOURCES_DIR,
  themeOverride,
}) {
  if (terminal === 'ghostty') return ghosttyColors({ home, xdgConfigHome, platform, resourcesDir, prefersDark, themeOverride })
  if (terminal === 'kitty') return kittyColors({ home, xdgConfigHome })
  return { ok: false, reason: `no color rules for terminal "${terminal}"` }
}
