import { EFFORTS, type Effort } from './responses.ts';

/** Public model ID (the bare alias clients send) -> OpenAI slug. Bumping a model is a one-line edit here. */
export const MODELS = {
  'sol': 'gpt-6.1-sol',
  'astra': 'gpt-6-astra',
  'terra': 'gpt-6.1-terra',
  'luna': 'gpt-6-luna',
};

type Alias = keyof typeof MODELS;

/** The OpenAI slug behind a public alias, or undefined when the ID is not an OpenAI alias. */
export function openaiSlug(id: string): string | undefined {
  return Object.hasOwn(MODELS, id) ? MODELS[id as keyof typeof MODELS] : undefined;
}

/** Provider segment of a public model ID: aliases are OpenAI, `switchboard/<provider>/<model>` names its own. */
export function modelProvider(id: string): string | undefined {
  return openaiSlug(id) === undefined ? id.split('/')[1] : 'openai';
}

/** Aliases `/config` fast mode moves to Codex's priority tier. Astra never: the owner keeps it on the default tier. */
export const FAST_MODELS: ReadonlySet<string> = new Set(['sol', 'terra', 'luna']);

/** Fast mode is opt-in; Codex bills the priority tier at a higher usage rate. */
export const fastMode = (options: PluginOptions) => String(options.fast) === 'true';

export const LABELS: Readonly<Record<string, string>> = {
  sol: 'Sol',
  astra: 'Astra',
  terra: 'Terra',
  luna: 'Luna',
};

/** Picker descriptions, verbatim from Codex's own model picker. */
export const DESCRIPTIONS: Readonly<Record<string, string>> = {
  sol: 'Latest workhorse model for coding and everyday work.',
  astra: 'Frontier intelligence for the most demanding work.',
  terra: 'GPT-6.1 Terra Codex model.',
  luna: 'Fast and affordable model for easier tasks.',
};

/** A native worker: the alias it runs on and its reasoning effort; no effort follows the session's. */
export interface Worker {
  model: Alias;
  effort?: Effort;
}

/** One worker per alias, named after it. */
export const OPENAI_WORKERS: Readonly<Record<string, Worker>> = Object.freeze(
  Object.fromEntries((Object.keys(MODELS) as Alias[]).map((model) => [model, { model }])),
);

/** Switchboard's `/config` values, as Claude Code stores them under `pluginConfigs[<id>].options`. */
export type PluginOptions = Readonly<Record<string, unknown>>;

/** `/config` choices for every OpenAI worker's effort. `session` follows the session's; `max` is never offered. */
export const GPT_EFFORTS = ['session', ...EFFORTS.filter((effort) => effort !== 'max')] as const;

/** Workers whose `/config` toggle is not off, all at the `gpt_effort` choice. */
export function enabledWorkers(options: PluginOptions): Record<string, Worker> {
  const choice = String(options.gpt_effort);
  const effort = EFFORTS.find((level) => level === choice && level !== 'max');
  return Object.fromEntries(
    Object.entries(OPENAI_WORKERS)
      .filter(([name]) => String(options[name]) !== 'false')
      .map(([name, worker]) => [name, effort ? { ...worker, effort } : worker]),
  );
}
