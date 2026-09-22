import type { Effort } from '../codex/responses.ts';

type ZenProtocol = 'responses' | 'chat';

export interface ZenModel {
  id: string;
  worker: string;
  protocol: ZenProtocol;
  label: string;
  description: string;
  efforts?: readonly Effort[];
  images: boolean;
  documents: boolean;
  maxOutputTokens: number;
}

export interface ZenModelOption extends ZenModel {
  model: string;
  nativeWorker: true;
}

export interface ZenWorker {
  model: string;
  effort?: Effort;
}

// OpenCode Go catalog, verified against zen/go/v1/models on 2026-09-23.
export const ZEN_MODELS: readonly ZenModel[] = Object.freeze([
  {
    id: 'deepseek-v4.1-flash',
    worker: 'deepseek',
    protocol: 'chat',
    label: 'DeepSeek V4.1 Flash',
    description: 'OpenCode Go · Chat Completions',
    images: false,
    documents: false,
    maxOutputTokens: 384000,
  },
]);

// Curated default picker; other supported models remain explicitly selectable.
const DEFAULT_ZEN_MODELS = ['deepseek-v4.1-flash'];

const modelById = new Map(ZEN_MODELS.map((model) => [model.id, model]));

function route(id: string): string {
  return `switchboard/zen/${id}`;
}

/** Build picker rows, optionally intersected with a discovered Zen catalog. */
export function zenModelOptions(availableIds?: readonly string[]): ZenModelOption[] {
  const available = availableIds === undefined ? undefined : new Set(availableIds);
  return ZEN_MODELS.filter((model) => available?.has(model.id) ?? true).map((model) => ({
    ...model,
    model: route(model.id),
    nativeWorker: true,
  }));
}

export const ZEN_WORKERS: Readonly<Record<string, ZenWorker>> = Object.freeze(
  Object.fromEntries(
    ZEN_MODELS.flatMap((model) => {
      const base = [
        [model.worker, { model: route(model.id), effort: defaultEffort(model) }],
      ];
      const efforts = (model.efforts ?? []).map((effort) => [
        `${model.worker}-${effort}`,
        { model: route(model.id), effort },
      ]);
      return [...base, ...efforts];
    }),
  ),
);

function defaultEffort(model: ZenModel): Effort | undefined {
  return model.efforts?.includes('medium') ? 'medium' : undefined;
}

export function zenModel(id: string): ZenModel | undefined {
  return modelById.get(id);
}

/** Restrict Zen rows without hiding subscription providers. */
export function zenPickerOptions(selection: string | undefined): ZenModelOption[] {
  if (selection === undefined) {
    return zenModelOptions(DEFAULT_ZEN_MODELS);
  }
  return [
    ...new Set(
      selection
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ].map((id) => {
    const option = zenModelOptions([id])[0];
    if (!option) {
      throw new Error(`SWITCHBOARD_ZEN_MODELS: unknown Zen model: ${id}`);
    }
    return option;
  });
}
