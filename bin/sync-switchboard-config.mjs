#!/usr/bin/env node
// Regenerates switchboard's /config options (plugin.json userConfig) from its model and worker registry.
import { readFileSync, writeFileSync } from 'node:fs';
import { LABELS, OPENAI_WORKERS, workerOptionKey } from '../plugins/switchboard/src/providers/codex/models.ts';
import { DEEPSEEK } from '../plugins/switchboard/src/providers/opencode/models.ts';

const manifestPath = new URL('../plugins/switchboard/.claude-plugin/plugin.json', import.meta.url);
const manifest = JSON.parse(readFileSync(manifestPath));

const userConfig = {
  fast: {
    type: 'boolean',
    title: 'Fast mode for Sol and Luna (uses more Codex allowance; never Astra)',
    description: '',
    default: false,
  },
};
for (const [name, { model, effort }] of Object.entries(OPENAI_WORKERS)) {
  userConfig[workerOptionKey(name)] = {
    type: 'boolean',
    title: `Show ${effort ? name : LABELS[model]} subagent`,
    // The manifest requires a description; blank hides it in the config form.
    description: '',
    default: !effort,
  };
}

// The launcher shows deepseek only when it also finds a Zen key.
userConfig[DEEPSEEK.worker] = {
  type: 'boolean',
  title: 'Show DeepSeek subagent (needs a Zen key)',
  description: '',
  default: true,
};

manifest.userConfig = userConfig;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`switchboard userConfig: ${Object.keys(userConfig).length} options`);
