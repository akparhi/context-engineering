import type { Effort } from './providers/codex/responses.ts';

export interface CatalogEntry {
  id: string;
  source: 'openai' | 'zen';
  label: string;
  description: string;
  prompt: string;
  /** Empty means the model has no effort dial; only a bare row is emitted. */
  efforts: readonly Effort[];
}

export interface PickerRow {
  model: string;
  label: string;
  description: string;
  behavesAs: string;
}

export interface AgentDefinition {
  description: string;
  prompt: string;
  model: string;
  tools: string[];
  effort?: Effort;
}

const TOOLS = ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write'];

export const CATALOG: readonly CatalogEntry[] = Object.freeze([
  {
    id: 'gpt-5.6-sol',
    source: 'openai',
    label: 'GPT-5.6 Sol',
    description: 'Codex subscription. Broad coding and review work.',
    prompt:
      'Complete the delegated task using the repository as the source of truth. Read before you edit, and report what you changed.',
    efforts: ['low'],
  },
  {
    id: 'gpt-5.6-luna',
    source: 'openai',
    label: 'GPT-5.6 Luna',
    description: 'Codex subscription. Fast delegate for scoped implementation and investigation.',
    prompt:
      'Complete the delegated task. Prefer the smallest change that works, and state any assumption you had to make.',
    efforts: ['none', 'low', 'medium'],
  },
  {
    id: 'gpt-6-astra',
    source: 'openai',
    label: 'GPT-6 Astra',
    description: 'Codex subscription. Deepest reasoning; use for architecture and hard diagnosis.',
    prompt:
      'Complete the delegated task. Trace the real execution path before concluding, and name what you verified versus what you inferred.',
    efforts: ['low'],
  },
  {
    id: 'deepseek-v4.1-flash',
    source: 'zen',
    label: 'DeepSeek V4.1 Flash',
    description: 'OpenCode Zen billing. Native reasoning; /effort does not apply.',
    prompt:
      'Complete the delegated task. Keep the diff tight and report the outcome in one line.',
    efforts: [],
  },
]);

function modelId(entry: CatalogEntry, effort?: Effort): string {
  const suffix = effort ? `-${effort}` : '';
  return `switchboard/${entry.source}/${entry.id}${suffix}`;
}

/** Both profiles resolve to 200K today; the dial decides which one Claude Code assumes. */
function pickerProfile(adjustableEffort: boolean): string {
  return adjustableEffort ? 'claude-sonnet-4-6' : 'claude-haiku-4-5';
}

function workerName(entry: CatalogEntry, effort?: Effort): string {
  const family = entry.id.replace(/^gpt-[\d.]+-/, '').replace(/^gpt-\d+-/, '');
  const prefix = entry.source === 'openai' ? 'openai' : 'zen';
  return `${prefix}-${family}${effort ? `-${effort}` : ''}`;
}

export function pickerRows(catalog: readonly CatalogEntry[] = CATALOG): PickerRow[] {
  return catalog.flatMap((entry) => {
    const adjustable = entry.efforts.length > 0;
    const bare: PickerRow = {
      model: modelId(entry),
      label: entry.label,
      description: entry.description,
      behavesAs: pickerProfile(adjustable),
    };
    const pinned = entry.efforts.map((effort) => ({
      model: modelId(entry, effort),
      label: `${entry.label} · ${effort}`,
      description: `${entry.description} Pinned to ${effort} reasoning.`,
      behavesAs: pickerProfile(true),
    }));
    return [bare, ...pinned];
  });
}

export function workerDefinitions(
  catalog: readonly CatalogEntry[] = CATALOG,
): Record<string, AgentDefinition> {
  const workers: Record<string, AgentDefinition> = {};
  for (const entry of catalog) {
    workers[workerName(entry)] = {
      description: `${entry.label}. ${entry.description}`,
      prompt: entry.prompt,
      model: modelId(entry),
      tools: [...TOOLS],
    };
    for (const effort of entry.efforts) {
      workers[workerName(entry, effort)] = {
        description: `${entry.label}, ${effort} reasoning. ${entry.description}`,
        prompt: entry.prompt,
        model: modelId(entry, effort),
        tools: [...TOOLS],
        effort,
      };
    }
  }
  return workers;
}
