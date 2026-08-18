#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import { appendCandidate, readCandidates } from './candidates.mjs'
import { findProjectRoot, hindsightPaths } from './paths.mjs'

const server = new McpServer({ name: 'hindsight', version: '0.1.0' })

function requireRoot() {
  const root = findProjectRoot(process.cwd())
  if (!root) throw new Error('hindsight: no .claude directory found above ' + process.cwd())
  return root
}

function text(body) {
  return { content: [{ type: 'text', text: body }] }
}

server.tool(
  'record',
  'Record a correction as a lesson candidate. Call this the moment the user corrects an approach you chose, rejects a tool call and explains why, an approach fails for a reason that would repeat, or you discover a project constraint that contradicts what you assumed. Candidates are distilled into .claude/rules/ at session end.',
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
  async ({ mistake, correction, rule, trigger, files_touched = [] }) => {
    const root = requireRoot()
    const { added, id } = appendCandidate(root, { mistake, correction, rule, trigger, files_touched })
    return text(
      added
        ? `Recorded candidate ${id}. It will be distilled into .claude/rules/ at session end.`
        : `Already recorded this session (${id}); nothing added.`
    )
  }
)

server.tool(
  'list',
  'List current hindsight lessons and the count of pending candidates. With no area argument, lists all lessons — the cross-cutting file and every area file. With an area argument (e.g. "api"), lists only that area\'s file.',
  { area: z.string().optional().describe('Filter to one area file, e.g. "api"') },
  async ({ area }) => {
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
    const pending = readCandidates(root).length
    return text(
      [bodies.length ? bodies.join('\n\n') : 'No lesson files yet.', `\nPending candidates: ${pending}`].join('\n')
    )
  }
)

server.tool(
  'remove',
  'Remove a pending candidate by its id. To remove an established lesson, edit the file in .claude/rules/ directly — hand edits are preserved.',
  { id: z.string().min(1).describe('Candidate id as reported by record or list') },
  async ({ id }) => {
    const root = requireRoot()
    const paths = hindsightPaths(root)
    const kept = readCandidates(root).filter((candidate) => candidate.id !== id)
    writeFileSync(paths.candidates, kept.map((candidate) => JSON.stringify(candidate)).join('\n') + (kept.length ? '\n' : ''))
    return text(`Removed candidate ${id}.`)
  }
)

await server.connect(new StdioServerTransport())
