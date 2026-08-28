#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({ name: 'think', version: '0.1.0' })

server.tool(
  'think',
  [
    'Use the tool to think about something. It will not obtain new information or make any changes, but just log the thought. Use it when complex reasoning or brainstorming is needed. For example:',
    '- About to choose an abstraction, module boundary, or data model: brainstorm several designs and assess which is simplest and cheapest to change later.',
    '- About to refactor/write code, or fix a bug: brainstorm several unique approaches and assess which is likely to be simplest and most effective.',
    '- About to delegate work: brainstorm how to split it, what each subagent needs, and which model tier fits.',
  ].join('\n'),
  {
    thought: z.string().min(1).describe('Your thoughts.'),
  },
  // The blog's think tool logs the thought and returns nothing; the empty result
  // is what keeps the call from reading as if something was looked up or verified.
  async () => ({ content: [] })
)

await server.connect(new StdioServerTransport())
