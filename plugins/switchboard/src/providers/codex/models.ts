import type { Effort } from './responses.ts';

export const MODELS = {
  'openai-native': 'gpt-6-astra',
  'openai-sol': 'gpt-6-sol',
  'openai-luna': 'gpt-6-luna',
};

const LABELS: Record<string, string> = {
  'gpt-6-astra': 'Astra',
  'gpt-6-sol': 'Sol',
  'gpt-6-luna': 'Luna',
};

/** Efforts offered as their own picker row, because `/effort` cannot pick them per session. */
const PINS: Record<string, readonly Effort[]> = {
  'gpt-6-astra': ['low'],
  'gpt-6-sol': ['low'],
  'gpt-6-luna': ['none', 'low', 'medium'],
};

/** A registered native worker: the OpenAI model it runs on and its reasoning effort. */
export interface Worker {
  model: string;
  effort: Effort;
}

/** Pinned picker ids, `<model>-<effort>`; the gateway applies the effort over the request's. */
export const PINNED: ReadonlyMap<string, Worker> = new Map(
  Object.entries(PINS).flatMap(([model, efforts]) =>
    efforts.map((effort) => [`${model}-${effort}`, { model, effort }] as const),
  ),
);

const DESCRIPTION = 'OpenAI subscription · native Claude Code harness';

export const OPENAI_PICKER = Object.values(MODELS).flatMap((model) => [
  { id: model, label: LABELS[model] ?? model, description: DESCRIPTION },
  ...(PINS[model] ?? []).map((effort) => ({
    id: `${model}-${effort}`,
    label: `${LABELS[model] ?? model} ${effort[0]?.toUpperCase()}${effort.slice(1)}`,
    description: `${DESCRIPTION} · ${effort} reasoning`,
  })),
]);

export const OPENAI_WORKERS: Readonly<Record<string, Worker>> = Object.freeze({
  ...Object.fromEntries(
    Object.entries(MODELS).flatMap(([name, model]) =>
      (['', 'low', 'medium', 'high', 'xhigh', 'max'] as const).map((level) => [
        level ? `${name}-${level}` : name,
        { model, effort: level || 'medium' },
      ]),
    ),
  ),
  'openai-luna-none': { model: 'gpt-6-luna', effort: 'none' },
});
