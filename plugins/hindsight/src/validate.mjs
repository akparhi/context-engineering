export const CAPS = { crossCutting: 7, perArea: 12, areaFiles: 5 }

function lessonErrors(lesson, where) {
  const errors = []
  if (!lesson.text || !lesson.text.trim()) errors.push(`${where}: empty lesson text`)
  if (lesson.text && lesson.text.includes('\n')) errors.push(`${where}: lesson must be one line`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lesson.date || '')) errors.push(`${where}: bad or missing @date`)
  return errors
}

export function validateLessonSet(set) {
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
    if (!area.paths?.length) errors.push(`area '${name}': needs at least one paths glob`)
    if ((area.lessons ?? []).length > CAPS.perArea) {
      errors.push(`area '${name}': ${area.lessons.length} lessons > ${CAPS.perArea}`)
    }
    ;(area.lessons ?? []).forEach((lesson, i) => errors.push(...lessonErrors(lesson, `${name}[${i}]`)))
  }

  return { ok: errors.length === 0, errors }
}

// Newest wins: a merged lesson gets its date refreshed, so recurring lessons survive.
function newestFirst(lessons) {
  return [...lessons].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

export function enforceCaps(set) {
  const crossCutting = newestFirst(set.crossCutting ?? []).slice(0, CAPS.crossCutting)
  const entries = Object.entries(set.areas ?? {}).map(([name, area]) => [
    name,
    { ...area, lessons: newestFirst(area.lessons ?? []).slice(0, CAPS.perArea) },
  ])
  const areaAge = ([, area]) => newestFirst(area.lessons)[0]?.date ?? '0000-00-00'
  const areas = Object.fromEntries(
    entries.sort((a, b) => (areaAge(a) < areaAge(b) ? 1 : -1)).slice(0, CAPS.areaFiles)
  )
  return { crossCutting, areas }
}
