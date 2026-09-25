import { providerSelection } from './install/plugins.ts';
import { run } from './install/process.ts';

async function main() {
  const [command, provider, ...args] = process.argv.slice(2);
  const enabled = providerSelection(process.env.SWITCHBOARD_ENABLED_PROVIDERS) ?? [];
  if (!enabled.some((name) => name === provider)) {
    throw new Error('Install and enable the requested Switchboard provider plugin first.');
  }
  if (command !== 'login') {
    throw new Error(
      'Usage: switchboard-ctl status | login openai [--device-auth] | uninstall',
    );
  }
  if (!args.every((arg) => arg === '--device-auth')) {
    throw new Error('Unsupported login arguments');
  }
  return run('codex', ['-c', 'cli_auth_credentials_store="file"', 'login', ...args]);
}

// Browser links are emitted by the provider-owned login process. Never read tokens.
void main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  },
);
