#!/usr/bin/env node
// Regenerates bureau's /config options (plugin.json userConfig) from models.json,
// so each row's default shows the file's current value as "models.json: <value>".
// Also regenerates the principle index in context/subagent-start.md from each principle skill's description.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const root = new URL('../plugins/bureau/', import.meta.url);
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

const usersOf = (tier, field) =>
  models.roles.filter((r) => parseRole(r[field]).tier === tier).map((r) => r.role).join('; ') || 'no role yet';
const tierUsers = (tier) => `${usersOf(tier, 'models')}. With fast mode on: ${usersOf(tier, 'fast')}`;

const userConfig = {};
userConfig.fast_mode = {
  type: 'boolean',
  title: 'Fast mode',
  description: 'Trade depth for speed and cost: every role switches to its "fast" value in models.json, a lighter tier or a lower effort. Any model or role you pick below still wins.',
  default: false,
};
for (const tier of ['default', 'strongest', 'fast', 'worker', 'skillprose']) {
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
  'Reasoning effort for bureau subagents. session keeps the parent session effort.',
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

userConfig.terse_reminder = {
  type: 'boolean',
  title: 'Terse style: remind every prompt',
  description: "Repeat the terse output style's core rules on every prompt. Turn off if /output-style uses another style.",
  default: true,
};

manifest.userConfig = userConfig;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`bureau userConfig: ${Object.keys(userConfig).length} options`);

// Subagents need this index: sol's budget-trimmed skill listing drops the principle descriptions.
// Hotline's index owns the groups and their priority order; each skill's description owns its trigger.
const PRINCIPLES_HEADING = '## Principles';
const MAIN_SESSION_ONLY = new Set(['principle-guard-the-context-window']);

const hotline = readFileSync(new URL('skills/hotline/SKILL.md', root), 'utf8');
const hotlineIndex = hotline.slice(hotline.indexOf(`${PRINCIPLES_HEADING}\n`), hotline.indexOf('\n## Autonomy\n'));
const groups = [];
for (const line of hotlineIndex.split('\n')) {
  const group = line.match(/^\*\*(\w+)\*\*$/);
  if (group) groups.push({ title: group[1], names: [] });
  // "- **Title.**" or "- **Title** (**principle-name**)."; the title becomes kebab case unless a name is given.
  const entry = line.match(/^- \*\*([^*]+?)\.?\*\*(?: \(\*\*(principle-[a-z-]+)\*\*\))?/);
  if (entry) {
    const slug = entry[1].toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ +/g, '-');
    groups.at(-1).names.push(entry[2] ?? `principle-${slug}`);
  }
}

const skillDirs = readdirSync(new URL('skills/', root)).filter((name) => name.startsWith('principle-'));
const indexed = groups.flatMap((g) => g.names);
const missing = skillDirs.filter((name) => !indexed.includes(name));
const unknown = indexed.filter((name) => !skillDirs.includes(name));
if (missing.length || unknown.length) {
  throw new Error(`hotline's principle index and skills/ disagree. Not in hotline: ${missing.join(', ') || 'none'}. No skill dir: ${unknown.join(', ') || 'none'}.`);
}

const trigger = (name) => {
  const skill = readFileSync(new URL(`skills/${name}/SKILL.md`, root), 'utf8');
  const [, doubleQuoted, singleQuoted, plain] = skill.match(/^description:\s*(?:"(.*)"|'(.*)'|(.*?))\s*$/m);
  // A sentence ends at a period followed by a capital, so "e.g. the" doesn't split.
  return (doubleQuoted ?? singleQuoted ?? plain).split(/(?<=\.)\s+(?=[A-Z])/)[0];
};
const indexGroups = groups
  .map(({ title, names }) => ({ title, names: names.filter((name) => !MAIN_SESSION_ONLY.has(name)) }))
  .filter(({ names }) => names.length)
  .map(({ title, names }) => `**${title}**\n\n${names.map((name) => `- \`bureau:${name}\`: ${trigger(name)}`).join('\n')}`);

const subagentContextPath = new URL('context/subagent-start.md', root);
// The index goes last, after the rules that point to it.
const otherSections = readFileSync(subagentContextPath, 'utf8')
  .split(/^(?=## )/m)
  .filter((section) => !section.startsWith(`${PRINCIPLES_HEADING}\n`))
  .map((section) => section.trimEnd());
writeFileSync(subagentContextPath, [...otherSections, PRINCIPLES_HEADING, ...indexGroups].join('\n\n') + '\n');
console.log(`bureau principle index: ${indexGroups.length} groups, ${indexed.length - MAIN_SESSION_ONLY.size} principles`);
