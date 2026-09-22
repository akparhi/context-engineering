import type { Effort } from '../codex/responses.ts';

type ZenProtocol = 'responses' | 'chat';

export interface ZenModel {
  id: string;
  protocol: ZenProtocol;
  label: string;
  description: string;
  efforts?: readonly Effort[];
  images: boolean;
  documents: boolean;
  maxOutputTokens: number;
}

export interface ZenWorker {
  model: string;
  effort?: Effort;
}

export const ZEN_MODELS: readonly ZenModel[] = Object.freeze([
  {
    id: 'deepseek-v4.1-flash',
    protocol: 'chat',
    label: 'DeepSeek V4.1 Flash',
    description: 'OpenCode Zen · Chat Completions',
    images: false,
    documents: false,
    maxOutputTokens: 384000,
  },
]);

const modelById = new Map(ZEN_MODELS.map((model) => [model.id, model]));

function workerName(id: string): string {
  return `zen-${id}`;
}

function route(id: string): string {
  return `switchboard/zen/${id}`;
}

export const ZEN_WORKERS: Readonly<Record<string, ZenWorker>> = Object.freeze(
  Object.fromEntries(
    ZEN_MODELS.flatMap((model) => {
      const base = [
        [workerName(model.id), { model: route(model.id), effort: defaultEffort(model) }],
      ];
      const efforts = (model.efforts ?? []).map((effort) => [
        `${workerName(model.id)}-${effort}`,
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

