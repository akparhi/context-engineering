import type {
  ResponsesInputContent,
  ResponsesRequest,
} from '../providers/codex/responses.ts';

// o200k_base measured 3.5-4.2 bytes/token on code, docs and transcripts; the low end
// overestimates, which keeps compaction early. A real encoder costs ~140 MB RSS per gateway.
const BYTES_PER_TOKEN = 3.5;

/** Shared local text estimate; providers report real usage at message end. */
export function estimateTextTokens(value: string): number {
  return Math.ceil(Buffer.byteLength(value) / BYTES_PER_TOKEN);
}

/** Local estimate, not a provider billing count. Media expansion uses heuristics. */
export function estimateInputTokens(request: ResponsesRequest): number {
  const text = estimateTextTokens;
  // ponytail: media allowances are heuristic; replace with provider counting if the subscription endpoint exposes it.
  const partTokens = (part: ResponsesInputContent): number => {
    if (part.type === 'input_image') {
      return 4096;
    }
    if (part.type === 'input_file') {
      return Math.ceil((Buffer.byteLength(part.file_data) * 3) / 4);
    }
    return text(part.text);
  };
  const parts = (content: ResponsesInputContent[]) =>
    content.reduce((total, part) => total + partTokens(part), 0);
  let total = text(request.instructions) + text(JSON.stringify(request.tools)) + 8;
  for (const item of request.input) {
    total += 8;
    if ('role' in item) {
      total += parts(item.content);
    } else if (item.type === 'function_call') {
      total += text(item.name) + text(item.arguments);
    } else if (item.type === 'function_call_output') {
      total += typeof item.output === 'string' ? text(item.output) : parts(item.output);
    }
    // Opaque reasoning is not text input; do not tokenize the ciphertext.
  }
  if (request.text) {
    total += text(JSON.stringify(request.text));
  }
  return total;
}
