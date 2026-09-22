import assert from 'node:assert/strict';
import test from 'node:test';
import type { MessagesRequest } from '../src/gateway/messages.ts';
import { fromResponses } from '../src/providers/codex/responses.ts';
import { toChat } from '../src/providers/opencode/chat.ts';
import { zenRequest } from '../src/providers/opencode/request.ts';

const chatModel = 'switchboard/zen/deepseek-v4.1-flash';
const textMessage = { role: 'user' as const, content: 'hello' };

function request(model = chatModel): MessagesRequest {
  return { model, max_tokens: 100, system: 'stable system', messages: [textMessage] };
}

function imageMessage() {
  return {
    role: 'user' as const,
    content: [
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' },
      },
    ],
  };
}

function pdfMessage() {
  return {
    role: 'user' as const,
    content: [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: Buffer.from('%PDF-1.4 fixture').toString('base64'),
        },
      },
    ],
  };
}

async function* sse(events: unknown[]) {
  for (const event of events) {
    yield Buffer.from(`data: ${JSON.stringify(event)}\n\n`);
  }
}

function reasoningResponse() {
  return [
    { type: 'response.created', response: { id: 'response-1' } },
    {
      type: 'response.completed',
      response: {
        id: 'response-1',
        status: 'completed',
        output: [
          {
            type: 'reasoning',
            id: 'reasoning-1',
            encrypted_content: 'opaque-state',
            summary: [{ type: 'summary_text', text: 'Compaction summary' }],
          },
        ],
        usage: {
          input_tokens: 100,
          input_tokens_details: { cached_tokens: 30, cache_write_tokens: 20 },
          output_tokens: 8,
        },
      },
    },
  ];
}

test('Zen request enforces capabilities, output limits, and protocol-specific effort', () => {
  assert.throws(
    () => zenRequest({ ...request(), messages: [imageMessage()] }, 'cache-key'),
    /does not support images/,
  );
  assert.throws(
    () => zenRequest({ ...request(), messages: [pdfMessage()] }, 'cache-key'),
    /does not support PDF/,
  );
  assert.throws(
    () => zenRequest({ ...request(), max_tokens: 384001 }, 'cache-key'),
    /between 1 and 384000/,
  );

  const chat = zenRequest(
    { ...request(chatModel), output_config: { effort: 'high' } },
    'cache-key',
  );
  assert.equal(chat.endpoint, 'chat/completions');
  assert.equal('reasoning_effort' in chat.body, false);
  assert.equal('effort' in chat.body, false);
  assert.equal(toChat(request(chatModel), 'deepseek-v4.1-flash').messages[1]?.role, 'user');
});

test('Zen Responses maps raw cache reads and writes into Claude usage fields', async () => {
  const result = await fromResponses(sse(reasoningResponse()), 'gpt-5.6-luna');
  assert.deepEqual(result.usage, {
    input_tokens: 50,
    output_tokens: 8,
    cache_read_input_tokens: 30,
    cache_creation_input_tokens: 20,
  });
});
