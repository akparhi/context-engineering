import type { Effort } from './responses.ts';

export const MODELS = {
  'astra': 'gpt-6-astra',
  'sol': 'gpt-6-sol',
  'luna': 'gpt-6-luna',
};

export const LABELS: Readonly<Record<string, string>> = {
  'gpt-6-astra': 'Astra',
  'gpt-6-sol': 'Sol',
  'gpt-6-luna': 'Luna',
};

/** Picker descriptions, verbatim from Codex's own model picker. */
export const DESCRIPTIONS: Readonly<Record<string, string>> = {
  'gpt-6-astra': 'Frontier intelligence for the most demanding work.',
  'gpt-6-sol': 'Workhorse model for coding and everyday work.',
  'gpt-6-luna': 'Fast and affordable model for easier tasks.',
};

/** A registered native worker: the OpenAI model it runs on and its reasoning effort. */
export interface Worker {
  model: string;
  effort: Effort;
}

export const OPENAI_WORKERS: Readonly<Record<string, Worker>> = Object.freeze(
  Object.fromEntries(
    Object.entries(MODELS).map(([name, model]) => [name, { model, effort: 'medium' as const }]),
  ),
);
