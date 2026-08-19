export const CAPS = { crossCutting: 7, perArea: 12, areaFiles: 5 }

// Must stay in sync with slugifyArea in paths.mjs — tests enforce this.
export function slugifyArea(area) {
  const slug = String(area)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'misc'
}

function lessonErrors(lesson, where) {
  if (lesson === null || lesson === undefined || typeof lesson !== 'object' || Array.isArray(lesson)) {
    return [`${where}: lesson must be an object`]
  }
  const errors = []
  if (!lesson.text || !lesson.text.trim()) errors.push(`${where}: empty lesson text`)
  if (lesson.text && lesson.text.includes('\n')) errors.push(`${where}: lesson must be one line`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lesson.date || '')) errors.push(`${where}: bad or missing @date`)
  return errors
}

export function validateLessonSet(set) {
  if (set === null || set === undefined || typeof set !== 'object' || Array.isArray(set)) {
    return { ok: false, errors: ['invalid lesson set: expected an object'] }
  }

  const errors = []
  const crossCutting = set.crossCutting ?? []
  const areas = set.areas ?? {}

  if (crossCutting.length > CAPS.crossCutting) {
    errors.push(`too many cross-cutting lessons: ${crossCutting.length} > ${CAPS.crossCutting}`)
  }
  crossCutting.forEach((lesson, i) => errors.push(...lessonErrors(lesson, `cross-cutting[${i}]`)))

  const areaNames = Object.keys(areas)
  if (areaNames.length > CAPS.areaFiles) {
    errors.push(`too many area files: ${areaNames.length} > ${CAPS.areaFiles}`)
  }
  for (const name of areaNames) {
    const area = areas[name]
    if (area === null || area === undefined || typeof area !== 'object' || Array.isArray(area)) {
      errors.push(`area '${name}': must be an object`)
      continue
    }
    const paths = area.paths ?? []
    if (!paths.length) {
      errors.push(`area '${name}': needs at least one paths glob`)
    } else if (!paths.every((p) => typeof p === 'string' && p.length > 0)) {
      errors.push(`area '${name}': paths entries must be non-empty strings`)
    }
    if ((area.lessons ?? []).length > CAPS.perArea) {
      errors.push(`area '${name}': ${area.lessons.length} lessons > ${CAPS.perArea}`)
    }
    ;(area.lessons ?? []).forEach((lesson, i) => errors.push(...lessonErrors(lesson, `${name}[${i}]`)))
  }

  return { ok: errors.length === 0, errors }
}

// Newest wins: a merged lesson gets its date refreshed, so recurring lessons survive.
function newestFirst(lessons) {
  return [...lessons].sort((a, b) => {
    const da = (a && a.date) || ''
    const db = (b && b.date) || ''
    return da < db ? 1 : da > db ? -1 : 0
  })
}

export function enforceCaps(set) {
  const rawCC = set.crossCutting ?? []
  const crossCutting = newestFirst(rawCC.filter((l) => l !== null && l !== undefined)).slice(0, CAPS.crossCutting)

  // Collapse areas that share the same slug before applying per-area and file caps,
  // so two names like 'api' and 'API' are merged rather than both truncated independently.
  const bySlug = new Map()
  for (const [name, area] of Object.entries(set.areas ?? {})) {
    if (area === null || area === undefined || typeof area !== 'object' || Array.isArray(area)) continue
    const slug = slugifyArea(name)
    const prior = bySlug.get(slug)
    if (prior) {
      bySlug.set(slug, {
        paths: [...new Set([...prior.paths, ...(area.paths ?? [])])],
        lessons: [...prior.lessons, ...(area.lessons ?? []).filter((l) => l !== null && l !== undefined)],
      })
    } else {
      bySlug.set(slug, {
        paths: area.paths ?? [],
        lessons: (area.lessons ?? []).filter((l) => l !== null && l !== undefined),
      })
    }
  }

  const entries = [...bySlug.entries()].map(([slug, area]) => [
    slug,
    { ...area, lessons: newestFirst(area.lessons).slice(0, CAPS.perArea) },
  ])
  const areaAge = ([, area]) => newestFirst(area.lessons)[0]?.date ?? '0000-00-00'
  const areas = Object.fromEntries(
    entries.sort((a, b) => (areaAge(a) < areaAge(b) ? 1 : -1)).slice(0, CAPS.areaFiles)
  )
  return { crossCutting, areas }
}
