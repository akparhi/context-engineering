import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { hindsightPaths } from './paths.mjs'

const IGNORE_BODY = '# hindsight working state — not shared\n*\n'

function ensureDir(paths) {
  if (existsSync(paths.dir)) return
  mkdirSync(paths.dir, { recursive: true })
  writeFileSync(join(paths.dir, '.gitignore'), IGNORE_BODY)
}

function fingerprint(candidate) {
  const basis = [candidate.mistake, candidate.correction, candidate.rule, candidate.trigger].join('\n')
  return createHash('sha256').update(basis).digest('hex').slice(0, 8)
}

export function readCandidates(root) {
  const paths = hindsightPaths(root)
  if (!existsSync(paths.candidates)) return []
  return readFileSync(paths.candidates, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })
}

export function appendCandidate(root, candidate) {
  const paths = hindsightPaths(root)
  ensureDir(paths)
  const id = fingerprint(candidate)
  if (readCandidates(root).some((existing) => existing.id === id)) {
    return { added: false, id }
  }
  const record = { id, recorded_at: new Date().toISOString(), ...candidate }
  appendFileSync(paths.candidates, `${JSON.stringify(record)}\n`)
  return { added: true, id }
}

export function clearCandidates(root) {
  const paths = hindsightPaths(root)
  ensureDir(paths)
  writeFileSync(paths.candidates, '')
}
