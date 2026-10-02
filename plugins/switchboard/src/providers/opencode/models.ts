/**
 * The one Zen model: DeepSeek on OpenCode Go's Chat Completions endpoint, verified against
 * zen/go/v1/models on 2026-09-23. It runs as the `deepseek` subagent only, never a `/model` row,
 * because Claude's WebSearch fails when DeepSeek is the main model. Vision, no PDFs, no effort presets.
 */
export const DEEPSEEK = {
  id: 'deepseek-v4.1-flash',
  model: 'switchboard/zen/deepseek-v4.1-flash',
  worker: 'deepseek',
  maxOutputTokens: 384000,
} as const;
