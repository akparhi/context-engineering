import assert from 'node:assert/strict';
import test from 'node:test';
import type { MessagesRequest } from '../src/gateway/messages.ts';
import { fromResponses } from '../src/providers/codex/responses.ts';
import { toChat } from '../src/providers/opencode/chat.ts';
import { zenRequest } from '../src/providers/opencode/request.ts';

const chatModel = 'switchboard/zen/deepseek-v4.1-flash';
const textMessage = { role: 'user' as const, content: 'hello' };

test('DeepSeek uses chat completions protocol and rejects unsupported media', () => {
  const base = request(chatModel);
  const translated = zenRequest(base, 'cache-key');
  assert.equal(translated.endpoint, 'chat/completions');
  assert.equal(translated.body.model, 'deepseek-v4.1-flash');
  assert.throws(
    () => zenRequest({ ...base, messages: [imageMessage()] }, 'cache-key'),
    /does not support images/,
  );
  assert.throws(
    () => zenRequest({ ...base, messages: [pdfMessage()] }, 'cache-key'),
    /does not support PDF/,
  );
});

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

test('Zen request enforces output limits for chat model', () => {
  assert.throws(
    () => zenRequest({ ...request(), max_tokens: 384001 }, 'cache-key'),
    /between 1 and 384000/,
  );
  assert.doesNotThrow(() => zenRequest({ ...request(), max_tokens: 384000 }, 'cache-key'));
  // Chat model: effort field is not forwarded
  const chat = zenRequest(
    { ...request(chatModel), output_config: { effort: 'high' } },
    'cache-key',
  );
  assert.equal(chat.endpoint, 'chat/completions');
  assert.equal('reasoning_effort' in chat.body, false);
  assert.equal('effort' in chat.body, false);
  assert.equal(toChat(request(chatModel), 'deepseek-v4.1-flash').messages[1]?.role, 'user');
});

test('Zen reasoning signatures stay isolated across providers by prefix check', async () => {
  // fromResponses is still exercised for OpenAI-originated reasoning blocks;
  // the signature isolation logic lives in the translation layer, not zenRequest.
  const result = await fromResponses(sse(reasoningResponse()), 'openai-native', undefined, {
    signaturePrefix: 'switchboard-openai:openai-native:',
  });
  const thinking = result.content.find((block) => block.type === 'thinking');
  assert(thinking?.type === 'thinking');
  assert(thinking.signature.startsWith('switchboard-openai:openai-native:'));
  // A chat-protocol zen request does not carry thinking blocks forward.
  const continued: MessagesRequest = {
    ...request(),
    messages: [
      { role: 'assistant', content: [thinking] },
      { role: 'user', content: 'after compaction' },
    ],
  };
  const chat = zenRequest(continued, 'cache-key');
  assert.equal(chat.endpoint, 'chat/completions');
  // toChat strips thinking blocks from chat messages
  const chatMessages = toChat(continued, 'deepseek-v4.1-flash').messages;
  assert.equal(chatMessages.some((m) => 'signature' in m), false);
});

test('Zen Responses maps raw cache reads and writes into Claude usage fields', async () => {
  // fromResponses is used by the Codex/Astra pipeline; verify it maps usage correctly
  const result = await fromResponses(sse(reasoningResponse()), 'gpt-5.6-sol');
  assert.deepEqual(result.usage, {
    input_tokens: 50,
    output_tokens: 8,
    cache_read_input_tokens: 30,
    cache_creation_input_tokens: 20,
  });
});

test('Zen unknown model is rejected', () => {
  assert.throws(
    () => zenRequest({ ...request(), model: 'switchboard/zen/not-a-model' }, 'cache-key'),
    /Unknown Zen model/,
  );
});
