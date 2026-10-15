#!/usr/bin/env node
// Regenerates arcane's /config options (plugin.json userConfig) from models.json,
// so each row's default shows the file's current value as "models.json: <value>".
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../plugins/arcane/', import.meta.url);
const manifestPath = new URL('.claude-plugin/plugin.json', root);
const models = JSON.parse(readFileSync(new URL('models.json', root)));
const manifest = JSON.parse(readFileSync(manifestPath));

const SWITCHBOARD_MODELS = ['astra', 'sol'];
const FROM_FILE = 'models.json: ';
const SWITCHBOARD_NOTE = 'astra and sol need the switchboard plugin.';
const EFFORT_NOTE = 'A /config model keeps the models.json effort.';

const modelChoices = [...models.available, 'inherit-parent', ...SWITCHBOARD_MODELS];
const panel = models.tiers.panel;
const panelSlots = Math.max(3, panel.length);

const picker = (title, description, fileValue, choices = modelChoices) => ({
  type: 'string',
  title,
  description,
  options: [FROM_FILE + fileValue, ...choices],
  default: FROM_FILE + fileValue,
});

// A role value is "<tier or model>" with an optional " @<effort>".
const parseRole = (value) => {
  const [tier, effort] = value.split(' @');
  return { tier, effortSuffix: effort ? ` @${effort}` : '' };
};

const tierUsers = (tier) =>
  models.roles.filter((r) => parseRole(r.models).tier === tier).map((r) => r.role).join('; ');

const userConfig = {};
for (const tier of ['default', 'strongest', 'fast']) {
  userConfig[`${tier}_model`] = picker(
    `${tier[0].toUpperCase()}${tier.slice(1)} model`,
    `Model for the ${tier} tier, used by: ${tierUsers(tier)}. ${SWITCHBOARD_NOTE}`,
    models.tiers[tier],
  );
}
for (let slot = 1; slot <= panelSlots; slot++) {
  userConfig[`panel_model_${slot}`] = picker(
    `Panel model ${slot}`,
    `One subagent of the panel tier, used by: ${tierUsers('panel')}. none drops the slot. ${SWITCHBOARD_NOTE}`,
    panel[slot - 1] ?? 'none',
    [...modelChoices, 'none'],
  );
}
userConfig.default_effort = picker(
  'Default effort',
  'Reasoning effort for arcane subagents. session keeps the parent session effort.',
  models.defaultEffort,
  ['session', ...models.efforts],
);

for (const { role, models: value, skill } of models.roles) {
  const { tier, effortSuffix } = parseRole(value);
  const key = `role_${role.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '')}`;
  const title = `Role: ${role}`;
  if (tier === 'panel') {
    userConfig[key] = {
      type: 'string',
      title,
      description: `Comma-separated models for ${skill}, one subagent each. Keep the models.json value to follow the panel tier. ${EFFORT_NOTE} ${SWITCHBOARD_NOTE}`,
      default: `${FROM_FILE}panel (${panel.join(', ')})${effortSuffix}`,
    };
  } else {
    userConfig[key] = picker(
      title,
      `Model for this ${skill} role. The models.json value follows the ${tier} tier, including its /config value. ${EFFORT_NOTE} ${SWITCHBOARD_NOTE}`,
      `${tier} (${models.tiers[tier]})${effortSuffix}`,
    );
  }
}

manifest.userConfig = userConfig;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`arcane userConfig: ${Object.keys(userConfig).length} options`);
