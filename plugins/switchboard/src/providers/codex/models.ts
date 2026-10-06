import { EFFORTS, type Effort } from './responses.ts';

/** Public model ID (the bare alias clients send) -> OpenAI slug. Bumping a model is a one-line edit here. */
export const MODELS = {
  'astra': 'gpt-6-astra',
  'sol': 'gpt-6.1-sol',
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
export const FAST_MODELS: ReadonlySet<string> = new Set(['sol', 'luna']);

/** Fast mode is opt-in; Codex bills the priority tier at a higher usage rate. */
export const fastMode = (options: PluginOptions) => String(options.fast) === 'true';

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

/** A native worker: the alias it runs on and its reasoning effort; no effort follows the session's. */
export interface Worker {
  model: Alias;
  effort?: Effort;
}

/** Every worker `/config` can show: one per alias, plus an `<alias>-<effort>` variant per effort below `max`. */
export const OPENAI_WORKERS: Readonly<Record<string, Worker>> = Object.freeze(
  Object.fromEntries(
    (Object.keys(MODELS) as Alias[]).flatMap((model) => [
      [model, { model }],
      ...EFFORTS.filter((effort) => effort !== 'max').map((effort) => [`${model}-${effort}`, { model, effort }]),
    ]),
  ),
);

/** Switchboard's `/config` values, as Claude Code stores them under `pluginConfigs[<id>].options`. */
export type PluginOptions = Readonly<Record<string, unknown>>;

/** The `/config` key that shows a worker: `sol`, `sol_high`. */
export const workerOptionKey = (name: string) => name.replace('-', '_');

/** Workers whose `/config` toggle is on; unset shows base workers and hides effort variants. */
export function enabledWorkers(options: PluginOptions): Record<string, Worker> {
  return Object.fromEntries(
    Object.entries(OPENAI_WORKERS).filter(([name, worker]) => {
      const value = String(options[workerOptionKey(name)]);
      return value === 'true' || (value !== 'false' && worker.effort === undefined);
    }),
  );
}
