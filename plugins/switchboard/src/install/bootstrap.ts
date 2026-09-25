import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Installation, readInstallation, uninstall } from './installation.ts';
import { installedPlugins, settingsArguments } from './plugins.ts';
import { run } from './process.ts';

// These exit without a session, so the launcher would wait out its session.start ack
// timeout; health checks like T3 Code's `--version` probe give up long before that.
const sessionlessCommands = new Set([
  '--version',
  '-v',
  '--help',
  '-h',
  'auth',
  'mcp',
  'plugin',
  'plugins',
  'doctor',
  'update',
  'upgrade',
  'install',
  'setup-token',
]);

async function dispatch(state: Installation, args: string[], management: boolean) {
  if (!management && sessionlessCommands.has(args[0])) {
    return run(state.claude, args);
  }
  const { root, providers } = await installedPlugins(state.claude, settingsArguments(args));
  if (management && args[0] === 'status') {
    console.log(JSON.stringify({ core: root ?? null, providers, claude: state.claude }, null, 2));
    return 0;
  }
  if (!management && (!root || providers.length === 0)) {
    return run(state.claude, args);
  }
  if (!management && state.command === 'claude' && process.env.SWITCHBOARD_GATEWAY_TOKEN) {
    // A launch command named `claude` also catches Claude's own nested runs (agents
    // calling `claude -p`, SDK spawns, hooks). Inside a Switchboard session those must
    // reach the real executable rather than start a second gateway.
    return run(state.claude, args);
  }
  if (!root) {
    throw new Error('Enable switchboard at user scope before using Switchboard commands.');
  }
  const manifest = JSON.parse(
    await readFile(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'),
  );
  if (manifest.name !== 'switchboard') {
    throw new Error('Installed core manifest does not identify switchboard');
  }
  const env = {
    ...process.env,
    ...(state.models !== undefined && process.env.SWITCHBOARD_MODELS === undefined
      ? { SWITCHBOARD_MODELS: state.models }
      : {}),
    SWITCHBOARD_REAL_CLAUDE: state.claude,
    SWITCHBOARD_ENABLED_PROVIDERS: providers.join(','),
  };
  const entry = management ? 'account.ts' : 'launcher.ts';
  return run(state.node, [path.join(root, 'src', entry), ...args], {
    env,
  });
}

async function main() {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const state = await readInstallation(directory);
  const args = process.argv.slice(2);
  // As VS Code's claudeProcessWrapper, the bundled Claude path arrives first; the
  // installation's own Claude runs instead.
  if (
    args[0] &&
    path.isAbsolute(args[0]) &&
    ['claude', 'claude.exe'].includes(path.basename(args[0]).toLowerCase())
  ) {
    args.shift();
  }
  if (args[0] === '--switchboard') {
    if (args[1] !== 'uninstall') {
      return dispatch(state, args.slice(1), true);
    }
    await uninstall(directory);
    console.log('Switchboard startup removed. Open a new terminal. Provider logins are preserved.');
    return 0;
  }
  return dispatch(state, args, false);
}

void main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`Switchboard: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  },
);
