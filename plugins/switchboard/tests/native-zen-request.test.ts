import assert from 'node:assert/strict';
import test from 'node:test';
import type { MessagesRequest } from '../src/gateway/messages.ts';
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

test('Zen request keeps images, turns PDFs into notes, enforces output limits, and ignores effort', () => {
  const readResult = {
    role: 'user' as const,
    content: [{ type: 'tool_result', tool_use_id: 'call_1', content: imageMessage().content }],
  };
  const assistantRead = {
    role: 'assistant' as const,
    content: [{ type: 'tool_use', id: 'call_1', name: 'Read', input: { file_path: 'pixel.png' } }],
  };
  const sent = JSON.stringify(
    zenRequest({ ...request(), messages: [imageMessage(), pdfMessage(), assistantRead, readResult] }).body,
  );
  assert.equal(sent.match(/data:image\/png;base64,aGVsbG8=/g)?.length, 2, 'user and tool-result images reach Zen');
  assert(!sent.includes(Buffer.from('%PDF-1.4 fixture').toString('base64')), 'PDF bytes must not reach Zen');
  assert.match(sent, /PDF omitted: deepseek-v4.1-flash cannot read PDF attachments/);
  assert.throws(() => zenRequest({ ...request(), max_tokens: 384001 }), /between 1 and 384000/);

  const chat = zenRequest({ ...request(chatModel), output_config: { effort: 'high' } });
  assert.equal('reasoning_effort' in chat.body, false);
  assert.equal('effort' in chat.body, false);
  assert.equal(toChat(request(chatModel), 'deepseek-v4.1-flash').messages[1]?.role, 'user');
  assert.throws(() => zenRequest(request('switchboard/zen/other')), /supports only switchboard\/zen\/deepseek-v4.1-flash/);
});
