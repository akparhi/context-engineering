import assert from 'node:assert/strict';
import test from 'node:test';
import type { ResponsesRequest } from '../src/providers/codex/responses.ts';
import { toResponses } from '../src/providers/codex/responses.ts';

const functionTools = (request: ResponsesRequest) =>
  request.tools.flatMap((tool) => (tool.type === 'function' ? [tool] : []));

const body = {
  model: 'switchboard/openai/gpt-6-luna',
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'call-1',
          content: [{ type: 'tool_reference', tool_name: 'mcp__search' }],
        },
      ],
    },
  ],
  tools: [
    {
      name: 'mcp__search',
      description: 'Search the workspace',
      input_schema: { type: 'object' },
      defer_loading: true,
    },
    {
      name: 'Read',
      description: 'Read a file',
      input_schema: { type: 'object' },
    },
  ],
};

test('OpenAI omits deferred declarations and preserves loaded tools and references', () => {
  const initialRequest = toResponses(
    { ...body, messages: [{ role: 'user', content: 'find a file' }] },
    body.model,
  );
  assert.deepEqual(
    functionTools(initialRequest).map((tool) => tool.name),
    ['Read'],
  );
  const request = toResponses(body, body.model);
  assert.deepEqual(
    functionTools(request).map((tool) => tool.name),
    ['mcp__search', 'Read'],
  );
  const output = request.input.at(-1);
  assert(output && 'output' in output);
  assert.match(JSON.stringify(output.output), /Available tool: mcp__search/);
});

test('named tool choices retain the requested deferred declaration', () => {
  const initialBody = { ...body, messages: [{ role: 'user', content: 'find a file' }] };
  const request = toResponses(
    { ...initialBody, tool_choice: { type: 'tool', name: 'mcp__search' } },
    body.model,
  );
  assert.deepEqual(
    functionTools(request).map((tool) => tool.name),
    ['mcp__search', 'Read'],
  );
});
