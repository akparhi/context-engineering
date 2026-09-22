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

/** A registered native worker: the OpenAI model it runs on and its reasoning effort. */
export interface Worker {
  model: string;
  effort: Effort;
}

export const OPENAI_WORKERS: Readonly<Record<string, Worker>> = Object.freeze(
  Object.fromEntries(
    Object.entries(MODELS).flatMap(([name, model]) =>
      (['', 'low', 'medium', 'high', 'xhigh', 'max'] as const).map((level) => [
        level ? `${name}-${level}` : name,
        { model, effort: level || 'medium' },
      ]),
    ),
  ),
);
