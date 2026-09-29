import type { Effort } from './responses.ts';

/** Public model ID (the bare alias clients send) -> OpenAI slug. Bumping a model is a one-line edit here. */
export const MODELS = {
  'astra': 'gpt-6-astra',
  'sol': 'gpt-6.1-sol',
  'luna': 'gpt-6-luna',
};

/** The OpenAI slug behind a public alias, or undefined when the ID is not an OpenAI alias. */
export function openaiSlug(id: string): string | undefined {
  return Object.hasOwn(MODELS, id) ? MODELS[id as keyof typeof MODELS] : undefined;
}

/** Provider segment of a public model ID: aliases are OpenAI, `switchboard/<provider>/<model>` names its own. */
export function modelProvider(id: string): string | undefined {
  return openaiSlug(id) === undefined ? id.split('/')[1] : 'openai';
}

export const LABELS: Readonly<Record<string, string>> = {
  astra: 'Astra',
  sol: 'Sol',
  luna: 'Luna',
};

/** Picker descriptions, verbatim from Codex's own model picker. */
export const DESCRIPTIONS: Readonly<Record<string, string>> = {
  astra: 'Frontier intelligence for the most demanding work.',
  sol: 'Latest workhorse model for coding and everyday work.',
  luna: 'Fast and affordable model for easier tasks.',
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
