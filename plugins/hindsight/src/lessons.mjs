const MANAGED_NOTE =
  '<!-- hindsight: managed file. Hand-edits preserved; bullets may be merged or evicted at session end. -->'
const TODAY = () => new Date().toISOString().slice(0, 10)

function parseFrontmatter(content) {
  if (!content.startsWith('---\n')) return { paths: [], body: content }
  // Search for the closing --- only after the opening, never mistake body `---` as terminator
  const end = content.indexOf('\n---', 4)
  if (end === -1) return { paths: [], body: content }
  const block = content.slice(4, end)
  const paths = [...block.matchAll(/^\s*-\s*"?([^"\n]+?)"?\s*$/gm)].map((m) => m[1])
  return { paths, body: content.slice(end + 4).replace(/^\n/, '') }
}

function parseLesson(line) {
  const meta = line.match(/<!--\s*(.*?)\s*-->\s*$/)
  const text = line
    .replace(/^\s*-\s*/, '')
    .replace(/<!--.*?-->\s*$/, '')
    .trim()
  const field = (name, fallback) => {
    const hit = meta?.[1].match(new RegExp(`@${name}:(\\S+)`))
    return hit ? hit[1] : fallback
  }
  return {
    text,
    date: field('date', TODAY()),
    trigger: field('trigger', ''),
    count: Number(field('count', '1')),
  }
}

export function parseLessonFile(content) {
  const { paths, body } = parseFrontmatter(content)
  const lessons = body
    .split('\n')
    .filter((line) => /^\s*-\s+\S/.test(line))
    .map(parseLesson)
    .filter((lesson) => lesson.text)
  const preamble = body.startsWith(MANAGED_NOTE) ? MANAGED_NOTE : ''
  return { paths, lessons, preamble }
}

export function renderLessonFile({ paths = [], lessons = [] }) {
  const head = paths.length
    ? `---\npaths:\n${paths.map((p) => `  - "${p}"`).join('\n')}\n---\n`
    : ''
  const bullets = lessons
    .map((lesson) => {
      const triggerPart = lesson.trigger ? ` @trigger:${lesson.trigger}` : ''
      return `- ${lesson.text} <!-- @date:${lesson.date}${triggerPart} @count:${lesson.count} -->`
    })
    .join('\n')
  return `${head}${MANAGED_NOTE}\n## Lessons\n\n${bullets}\n`
}
