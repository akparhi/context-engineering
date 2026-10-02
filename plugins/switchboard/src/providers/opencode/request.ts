import type { ContentBlock, MessagesRequest } from '../../gateway/messages.ts';
import { estimateInputTokens, estimateTextTokens } from '../../gateway/tokens.ts';
import { toResponses } from '../codex/responses.ts';
import { toChat } from './chat.ts';
import { DEEPSEEK } from './models.ts';

const PDF_NOTE = `[PDF omitted: ${DEEPSEEK.id} cannot read PDF attachments.]`;

/**
 * DeepSeek reads images but not PDFs. A rejected PDF would stay in history and fail every later
 * turn, so each one becomes a note the model can read and report.
 */
function withoutPdfs(blocks: ContentBlock[]): ContentBlock[] {
  return blocks.map((block) => {
    if (block.type === 'document') {
      return { type: 'text', text: PDF_NOTE };
    }
    if (block.type === 'tool_result' && Array.isArray(block.content)) {
      return { ...block, content: withoutPdfs(block.content) };
    }
    return block;
  });
}

/** Pure translation keeps repeated prefixes byte-stable; the caller owns credentials. */
export function zenRequest(request: MessagesRequest) {
  if (request.model !== DEEPSEEK.model) {
    throw new Error(`Unknown Zen model. Switchboard supports only ${DEEPSEEK.model}.`);
  }
  if (
    request.max_tokens !== undefined &&
    (!Number.isSafeInteger(request.max_tokens) ||
      request.max_tokens < 1 ||
      request.max_tokens > DEEPSEEK.maxOutputTokens)
  ) {
    throw new Error(`Zen max_tokens must be between 1 and ${DEEPSEEK.maxOutputTokens}`);
  }
  const body = {
    ...request,
    messages: request.messages?.map((message) =>
      Array.isArray(message.content) ? { ...message, content: withoutPdfs(message.content) } : message,
    ),
  };
  // Claude supplies an effort even though DeepSeek has none to adjust; it reasons natively.
  const chat = toChat({ ...body, max_tokens: body.max_tokens ?? 32000 }, DEEPSEEK.id);
  const reasoningTokens = chat.messages.reduce(
    (total, message) =>
      total +
      ('reasoning_content' in message ? estimateTextTokens(message.reasoning_content ?? '') : 0),
    0,
  );
  return {
    inputTokens: estimateInputTokens(toResponses(body, DEEPSEEK.id)) + reasoningTokens,
    body: chat,
  };
}
