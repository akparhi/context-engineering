#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import { appendCandidate, readCandidates } from './candidates.mjs'
import { applyLessonSet, readCurrentSet } from './distill.mjs'
import { findProjectRoot, hindsightPaths } from './paths.mjs'
import { buildDistillPrompt } from './prompt.mjs'

const server = new McpServer({ name: 'hindsight', version: '0.1.0' })

function requireRoot() {
  const root = findProjectRoot(process.cwd())
  if (!root) throw new Error('hindsight: no .claude directory found above ' + process.cwd())
  return root
}

function text(body) {
  return { content: [{ type: 'text', text: body }] }
}

// A throw here would surface as an opaque MCP protocol error with no body, so
// every handler returns its failure as text the model can act on.
async function guarded(fn) {
  try {
    return await fn()
  } catch (error) {
    return text(`hindsight error: ${error.message}`)
  }
}

server.tool(
  'record',
  'Record a correction as a lesson candidate. Call this the moment the user corrects an approach you chose, rejects a tool call and explains why, an approach fails for a reason that would repeat, you discover a project constraint that contradicts what you assumed, or the user asks for the same thing a second or third time. This only queues the candidate; nothing reaches .claude/rules/ until you call distill and then apply.',
  {
    mistake: z.string().min(1).describe('What you actually did that was wrong'),
    correction: z.string().min(1).describe('What was correct instead'),
    rule: z
      .string()
      .min(1)
      .describe('Your proposed lesson, as one line of neutral project guidance. No second person, no quoting the user.'),
    trigger: z
      .string()
      .min(1)
      .describe(
        'The earliest observable condition that should have told you — a file path, a command, or a task type. Be concrete; a vague trigger is quarantined rather than kept.'
      ),
    files_touched: z.array(z.string()).optional().describe('Files involved, used to infer the paths glob for this lesson'),
  },
  async ({ mistake, correction, rule, trigger, files_touched = [] }) => guarded(async () => {
    const root = requireRoot()
    const { added, id } = appendCandidate(root, { mistake, correction, rule, trigger, files_touched })
    return text(
      added
        ? `Recorded candidate ${id}. Call the distill tool to fold pending candidates into .claude/rules/.`
        : `Already recorded this session (${id}); nothing added.`
    )
  })
)

server.tool(
  'list',
  'List current hindsight lessons and the count of pending candidates. With no area argument, lists all lessons — the cross-cutting file and every area file. With an area argument (e.g. "api"), lists only that area\'s file.',
  { area: z.string().optional().describe('Filter to one area file, e.g. "api"') },
  async ({ area }) => guarded(async () => {
    const root = requireRoot()
    const paths = hindsightPaths(root)
    let files
    if (area) {
      files = [paths.areaFile(area)]
    } else {
      files = [paths.crossCutting]
      if (existsSync(paths.rulesDir)) {
        const areaFiles = readdirSync(paths.rulesDir)
          .filter((name) => name.startsWith('hindsight-') && name.endsWith('.md'))
          .map((name) => paths.areaFile(name.slice('hindsight-'.length, -'.md'.length)))
        files.push(...areaFiles)
      }
    }
    const bodies = files
      .filter((file) => existsSync(file))
      .map((file) => `# ${file}\n${readFileSync(file, 'utf8')}`)
    const pending = readCandidates(root)
    const queue = pending.length
      ? `\nPending candidates (${pending.length}):\n${pending.map((c) => `- ${c.id}: ${c.rule}`).join('\n')}`
      : '\nPending candidates: 0'
    return text([bodies.length ? bodies.join('\n\n') : 'No lesson files yet.', queue].join('\n'))
  })
)

server.tool(
  'remove',
  'Remove a pending candidate by its id. To remove an established lesson, edit the file in .claude/rules/ directly — hand edits are preserved.',
  { id: z.string().min(1).describe('Candidate id as reported by record or list') },
  async ({ id }) => guarded(async () => {
    const root = requireRoot()
    const paths = hindsightPaths(root)
    const kept = readCandidates(root).filter((candidate) => candidate.id !== id)
    writeFileSync(paths.candidates, kept.map((candidate) => JSON.stringify(candidate)).join('\n') + (kept.length ? '\n' : ''))
    return text(`Removed candidate ${id}.`)
  })
)

const lessonShape = z.object({
  text: z.string(),
  date: z.string().optional(),
  trigger: z.string().optional(),
  count: z.number().optional(),
})

server.tool(
  'distill',
  'Fold the pending correction candidates into the project lesson set. Call this when candidates are pending — the session-start note tells you the count — or when the user asks to distill. Returns instructions; it writes nothing. Follow them, then call apply with your proposed set.',
  {},
  async () => guarded(async () => {
    const root = requireRoot()
    const candidates = readCandidates(root)
    if (!candidates.length) return text('No pending candidates; nothing to distill.')
    return text(buildDistillPrompt({ candidates, current: readCurrentSet(root) }))
  })
)

server.tool(
  'apply',
  'Persist a distilled lesson set to .claude/rules/. Prefer areas over crossCutting — area-scoped lessons load only when matching files are in context, while cross-cutting lessons cost context in every future session. Validates caps and writes atomically. On rejection nothing is written and the reason is returned — fix what it reports and call again.',
  {
    crossCutting: z.array(lessonShape).describe('Lessons that apply regardless of which files are touched. Capped; keep this list short.'),
    areas: z
      .record(z.object({ paths: z.array(z.string()), lessons: z.array(lessonShape) }))
      .describe('Area name to its paths globs and lessons. Prefer these over crossCutting.'),
    quarantine: z.array(z.string()).optional().describe('Candidate ids to quarantine rather than turn into lessons'),
  },
  async ({ crossCutting, areas, quarantine = [] }) => guarded(async () => {
    const root = requireRoot()
    const result = applyLessonSet(root, { crossCutting, areas, quarantine })
    return text(
      result.status === 'ok'
        ? 'Applied. Lessons written to .claude/rules/ and the candidate queue cleared.'
        : `Rejected, nothing written: ${result.reason}. Fix this and call apply again.`
    )
  })
)

await server.connect(new StdioServerTransport())
