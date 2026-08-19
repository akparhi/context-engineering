import { existsSync } from 'node:fs'
import { dirname, join, parse } from 'node:path'

export function findProjectRoot(startDir) {
  let dir = startDir
  const { root } = parse(startDir)
  while (true) {
    if (existsSync(join(dir, '.claude'))) return dir
    if (dir === root) return null
    dir = dirname(dir)
  }
}

// Area names reach us from LLM output, so they are untrusted path input.
export function slugifyArea(area) {
  const slug = area
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'misc'
}

export function hindsightPaths(root) {
  const dir = join(root, '.claude', 'hindsight')
  const rulesDir = join(root, '.claude', 'rules')
  return {
    dir,
    candidates: join(dir, 'candidates.jsonl'),
    quarantine: join(dir, 'quarantine.jsonl'),
    log: join(dir, 'distill.log'),
    rulesDir,
    crossCutting: join(rulesDir, 'hindsight.md'),
    areaFile: (area) => join(rulesDir, `hindsight-${slugifyArea(area)}.md`),
  }
}
