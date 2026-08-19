import { existsSync, renameSync, writeFileSync } from 'node:fs'
import { readCandidates } from './candidates.mjs'
import { hindsightPaths } from './paths.mjs'

export const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000

// A candidate nobody confirmed within a day is dropped rather than held: if the
// mistake recurs it gets recorded again, and recurrence is the signal worth
// keeping. An unreadable or absent timestamp counts as fresh — deleting on a
// parse failure would lose work silently.
function isExpired(candidate, now, maxAgeMs) {
  const stamp = Date.parse(candidate?.recorded_at ?? '')
  if (Number.isNaN(stamp)) return false
  return now - stamp > maxAgeMs
}

export function expireCandidates(root, { now = Date.now(), maxAgeMs = TWENTY_FOUR_HOURS } = {}) {
  const paths = hindsightPaths(root)
  if (!existsSync(paths.candidates)) return { kept: [], expired: [] }

  let all
  try {
    all = readCandidates(root)
  } catch {
    return { kept: [], expired: [] }
  }
  const kept = all.filter((candidate) => !isExpired(candidate, now, maxAgeMs))
  const expired = all.filter((candidate) => isExpired(candidate, now, maxAgeMs))
  if (!expired.length) return { kept, expired }

  try {
    const tmp = `${paths.candidates}.tmp`
    writeFileSync(tmp, kept.map((candidate) => JSON.stringify(candidate)).join('\n') + (kept.length ? '\n' : ''))
    renameSync(tmp, paths.candidates)
  } catch {
    // Never fail the session over housekeeping; the stale entries get another
    // chance to expire at the next session start.
    return { kept: all, expired: [] }
  }
  return { kept, expired }
}
