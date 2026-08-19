import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { clearCandidates, readCandidates } from './candidates.mjs'
import { parseLessonFile, renderLessonFile } from './lessons.mjs'
import { hindsightPaths } from './paths.mjs'
import { enforceCaps, validateLessonSet } from './validate.mjs'

const AREA_PREFIX = 'hindsight-'

function logFailure(root, message) {
  const paths = hindsightPaths(root)
  mkdirSync(paths.dir, { recursive: true })
  appendFileSync(paths.log, `${new Date().toISOString()} ${message}\n`)
}

export function readCurrentSet(root) {
  const paths = hindsightPaths(root)
  const crossCutting = existsSync(paths.crossCutting)
    ? parseLessonFile(readFileSync(paths.crossCutting, 'utf8')).lessons
    : []
  const areas = {}
  if (existsSync(paths.rulesDir)) {
    for (const file of readdirSync(paths.rulesDir)) {
      if (!file.startsWith(AREA_PREFIX) || !file.endsWith('.md')) continue
      const area = basename(file, '.md').slice(AREA_PREFIX.length)
      const parsed = parseLessonFile(readFileSync(join(paths.rulesDir, file), 'utf8'))
      areas[area] = { paths: parsed.paths, lessons: parsed.lessons }
    }
  }
  return { crossCutting, areas }
}

// Atomic: every file is written to a temp path, then renamed into place.
export function writeLessonSet(root, set) {
  const paths = hindsightPaths(root)
  mkdirSync(paths.rulesDir, { recursive: true })

  const writes = [[paths.crossCutting, renderLessonFile({ paths: [], lessons: set.crossCutting })]]
  const keep = new Set([basename(paths.crossCutting)])
  // Distinct area names can slugify to one filename; merge them so two writes
  // never race for the same path and silently drop one.
  const byFile = new Map()
  for (const [area, body] of Object.entries(set.areas)) {
    const file = paths.areaFile(area)
    const prior = byFile.get(file)
    byFile.set(
      file,
      prior
        ? {
            paths: [...new Set([...prior.paths, ...(body.paths ?? [])])],
            lessons: [...prior.lessons, ...(body.lessons ?? [])],
          }
        : { paths: body.paths ?? [], lessons: body.lessons ?? [] }
    )
  }
  for (const [file, body] of byFile) {
    keep.add(basename(file))
    writes.push([file, renderLessonFile(body)])
  }

  // Stage every file before moving any into place: a failure mid-staging leaves
  // the live rule files untouched rather than half-updated.
  const staged = []
  try {
    for (const [file, content] of writes) {
      const tmp = `${file}.tmp`
      writeFileSync(tmp, content)
      staged.push([tmp, file])
    }
    for (const [tmp, file] of staged) renameSync(tmp, file)
  } catch (error) {
    for (const [tmp] of staged) rmSync(tmp, { force: true })
    throw error
  }

  for (const file of readdirSync(paths.rulesDir)) {
    if (file.startsWith(AREA_PREFIX) && file.endsWith('.md') && !keep.has(file)) {
      rmSync(join(paths.rulesDir, file))
    }
  }
}

function quarantineCandidates(root, candidates, ids) {
  if (!ids.length) return
  const paths = hindsightPaths(root)
  const existing = existsSync(paths.quarantine)
    ? readFileSync(paths.quarantine, 'utf8')
        .split('\n')
        .filter((line) => line.trim())
        .flatMap((line) => {
          try {
            return [JSON.parse(line)]
          } catch {
            return []
          }
        })
    : []

  const byId = new Map(existing.map((entry) => [entry.id, entry]))
  for (const id of ids) {
    const candidate = candidates.find((c) => c.id === id)
    if (!candidate) continue
    const prior = byId.get(id)
    byId.set(id, { ...candidate, count: (prior?.count ?? 0) + 1 })
  }
  writeFileSync(paths.quarantine, [...byId.values()].map((entry) => JSON.stringify(entry)).join('\n') + '\n')
}

// The gate between the model's proposal and the files on disk. Everything the
// in-session Claude proposes arrives here; nothing else writes rule files.
export function applyLessonSet(root, proposed) {
  if (!proposed || typeof proposed !== 'object' || Array.isArray(proposed)) {
    const reason = 'proposal must be an object with crossCutting and areas'
    logFailure(root, `rejected invalid proposal: ${reason}`)
    return { status: 'failed', reason }
  }

  const candidates = readCandidates(root)
  const capped = enforceCaps({
    crossCutting: proposed.crossCutting ?? [],
    areas: proposed.areas ?? {},
  })

  const { ok, errors } = validateLessonSet(capped)
  if (!ok) {
    const reason = errors.join('; ')
    logFailure(root, `rejected invalid lesson set: ${reason}`)
    return { status: 'failed', reason }
  }

  try {
    writeLessonSet(root, capped)
    quarantineCandidates(root, candidates, Array.isArray(proposed.quarantine) ? proposed.quarantine : [])
    clearCandidates(root)
  } catch (error) {
    logFailure(root, `failed to persist lesson set: ${error.message}`)
    return { status: 'failed', reason: error.message }
  }
  return { status: 'ok' }
}
