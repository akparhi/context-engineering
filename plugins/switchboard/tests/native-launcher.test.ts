import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import {
  checkLauncherArgumentLimit,
  workerDefinitions,
} from '../src/launcher.ts';
import { LABELS, MODELS } from '../src/providers/codex/models.ts';
import { removeTemporary } from './temporary.ts';

async function writeClaudeFixture(bin: string, source: string): Promise<void> {
  if (process.platform === 'win32') {
    await writeFile(path.join(bin, 'claude-fixture.js'), source);
    await writeFile(
      path.join(bin, 'claude.cmd'),
      // npm's global shim layout, so the launcher runs the fixture through Node directly.
      `endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\claude-fixture.js" %*\r\n`,
    );
    return;
  }
  await writeFile(path.join(bin, 'claude'), source, { mode: 0o755 });
}

/** Windows reads the profile and data roots from these, not from HOME. */
function windowsHome(root: string): NodeJS.ProcessEnv {
  if (process.platform !== 'win32') {
    return {};
  }
  return {
    USERPROFILE: root,
    APPDATA: path.join(root, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(root, 'AppData', 'Local'),
  };
}

test('launcher preserves native auth, disables unavailable auto mode, and merges caller settings', {
  skip: process.platform === 'win32',
}, async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'launcher-test-'));
  t.after(() => removeTemporary(cwd));
  await mkdir(path.join(cwd, 'bin'));
  await writeClaudeFixture(
    path.join(cwd, 'bin'),
    `#!/usr/bin/env node
const fs=require('node:fs');const args=process.argv.slice(2);
if(args.includes('plugin')&&args.includes('list')){console.log(process.env.TEST_PLUGIN==='enabled'?JSON.stringify([{id:'switchboard@akparhi',enabled:true,installPath:process.cwd()}]):'[]');process.exit(0)}
if(args[0]==='--version'){console.log(process.env.TEST_CLAUDE_VERSION??'2.1.272');process.exit(0)}
const result=(value)=>{const base=process.env.SWITCHBOARD_MOD_GATEWAY_URL;if(!base){console.log(value);return}const url=new URL(base+'/switchboard/mod/session');const req=require('node:http').request(url,{method:'POST',headers:{'content-type':'application/json','x-switchboard-gateway-token':process.env.SWITCHBOARD_GATEWAY_TOKEN}},()=>console.log(value));req.on('error',()=>console.log(value));req.end(JSON.stringify({sessionId:'fixture',event:'start'}));};
if(args[0]==='auth'){if(process.env.TEST_AUTH==='malformed'){console.log('not-json');process.exit(0)}if(process.env.TEST_AUTH==='error'){process.exit(2)}if(process.env.TEST_AUTH==='missing'){console.log('{}');process.exit(0)}process.stdout.write(JSON.stringify({loggedIn:process.env.TEST_AUTH==='yes'}));process.exitCode=process.env.TEST_AUTH==='yes'?0:1}else{
const settings=JSON.parse(fs.readFileSync(args[args.indexOf('--settings')+1],'utf8'));
 result(JSON.stringify({agentView:process.env.CLAUDE_CODE_DISABLE_AGENT_VIEW,backgroundTasks:process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS,functionHooks:process.env.CLAUDE_CODE_ENABLE_FUNCTION_HOOKS,settings,models:args.filter(x=>x.startsWith('switchboard/')),args,settingsCount:args.filter(x=>x==='--settings').length,hasLocalToken:!!process.env.SWITCHBOARD_GATEWAY_TOKEN,apiTimeout:process.env.API_TIMEOUT_MS,toolSearch:process.env.ENABLE_TOOL_SEARCH,auth:process.env.ANTHROPIC_API_KEY?'api':process.env.ANTHROPIC_AUTH_TOKEN?'local':'native'}));}
`,
  );
  const launcher = fileURLToPath(
    new URL('../src/launcher.ts', import.meta.url),
  );
  for (const auth of ['no', 'yes', 'api']) {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        launcher,
        '--',
        '--model',
        'switchboard/openai/gpt-6-luna',
        '--settings',
        JSON.stringify({
          disableAgentView: false,
          permissions: { deny: ['Bash(denied)'] },
          hooks: { Stop: [] },
        }),
      ],
      {
        cwd,
        timeout: 20000,
        env: {
          PATH: path.join(cwd, 'bin') + path.delimiter + process.env.PATH,
          HOME: cwd,
          ...windowsHome(cwd),
          CLAUDE_CONFIG_DIR: path.join(cwd, 'claude'),
          CODEX_HOME: cwd,
          TEST_AUTH: auth,
          CLAUDE_CODE_DISABLE_AGENT_VIEW: '0',
          API_TIMEOUT_MS: auth === 'api' ? '1000' : undefined,
          ENABLE_TOOL_SEARCH: auth === 'api' ? 'false' : undefined,
          ...(auth === 'api' ? { ANTHROPIC_API_KEY: 'fake-test-key' } : {}),
        },
      },
    );
    const result = JSON.parse(stdout);
    assert.equal(result.args.at(-2), '--plugin-dir');
    assert.equal(result.args.at(-1), path.resolve(path.dirname(launcher), '..'));
    assert.equal(result.settingsCount, 1);
    assert.equal(result.settings.disableAgentView, true);
    assert.equal(result.agentView, '1');
    assert.equal(result.backgroundTasks, undefined);
    assert.equal(result.functionHooks, '1');
    assert.equal(result.apiTimeout, auth === 'api' ? '1000' : '2147483647');
    assert.equal(result.toolSearch, auth === 'api' ? 'false' : 'auto');
    assert.deepEqual(result.settings.permissions.deny, ['Bash(denied)']);
    assert.equal(
      result.settings.permissions.disableAutoMode,
      auth === 'no' ? 'disable' : undefined,
    );
    assert.equal(
      result.hasLocalToken,
      true,
      'local hooks authenticate independently of Claude login',
    );
    assert.equal(result.auth, { no: 'local', api: 'api', yes: 'native' }[auth]);
    assert.equal(result.settings.hooks.PreToolUse?.length, 1);
  }
  const baseEnvironment = {
    PATH: path.join(cwd, 'bin') + path.delimiter + process.env.PATH,
    HOME: cwd,
    ...windowsHome(cwd),
    CLAUDE_CONFIG_DIR: path.join(cwd, 'claude'),
    CODEX_HOME: cwd,
  };
  const enabled = JSON.parse(
    (
      await promisify(execFile)(process.execPath, [launcher], {
        cwd,
        timeout: 20000,
        env: { ...baseEnvironment, TEST_PLUGIN: 'enabled' },
      })
    ).stdout,
  );
  assert(!enabled.args.includes('--plugin-dir'));
  const supplied = JSON.parse(
    (
      await promisify(execFile)(
        process.execPath,
        [launcher, '--', '--plugin-dir', path.resolve(path.dirname(launcher), '..')],
        { cwd, timeout: 20000, env: baseEnvironment },
      )
    ).stdout,
  );
  assert.equal(supplied.args.filter((arg: string) => arg === '--plugin-dir').length, 1);
  for (const auth of ['malformed', 'error', 'missing']) {
    await assert.rejects(
      promisify(execFile)(process.execPath, [launcher, '--', '--model', 'switchboard/openai/gpt-6-luna'], {
        cwd,
        timeout: 20000,
        env: {
          PATH: path.join(cwd, 'bin') + path.delimiter + process.env.PATH,
          HOME: cwd,
          ...windowsHome(cwd),
          CLAUDE_CONFIG_DIR: path.join(cwd, 'claude'),
          CODEX_HOME: cwd,
          TEST_AUTH: auth,
        },
      }),
      /Claude auth status probe (returned invalid JSON|failed|returned no boolean loggedIn field)/,
    );
  }
  await assert.rejects(
    promisify(execFile)(process.execPath, [launcher], {
      cwd,
      timeout: 20000,
      env: {
        PATH: path.join(cwd, 'bin') + path.delimiter + process.env.PATH,
        HOME: cwd,
        ...windowsHome(cwd),
        CLAUDE_CONFIG_DIR: path.join(cwd, 'claude'),
        CODEX_HOME: cwd,
        TEST_CLAUDE_VERSION: '2.1.271',
      },
    }),
    /Claude Code 2\.1\.272 or newer with function hooks is required/,
  );
  await mkdir(path.join(cwd, 'claude'));
  await writeFile(
    path.join(cwd, 'claude', 'settings.json'),
    JSON.stringify({ model: 'switchboard/zen/gpt-5.6-luna' }),
  );
  const { stdout } = await promisify(execFile)(process.execPath, [launcher], {
    cwd,
    timeout: 20000,
    env: {
      PATH: path.join(cwd, 'bin') + path.delimiter + process.env.PATH,
      HOME: cwd,
      ...windowsHome(cwd),
      CLAUDE_CONFIG_DIR: path.join(cwd, 'claude'),
      CODEX_HOME: cwd,
    },
  });
  const saved = JSON.parse(stdout);
  assert.deepEqual(
    saved.models,
    [],
    'Keep the native saved model instead of forcing a launcher default',
  );
  assert.equal(saved.settings.permissions.disableAutoMode, 'disable');
});

test('OpenAI login adds picker models and named workers, filtered by SWITCHBOARD_MODELS', {
  skip: process.platform === 'win32',
}, async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'launcher-openai-test-'));
  t.after(() => removeTemporary(cwd));
  const bin = path.join(cwd, 'bin');
  await mkdir(bin);
  await writeFile(
    path.join(cwd, 'auth.json'),
    JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'codex-fixture', account_id: 'fixture' } }),
  );
  const preload = path.join(cwd, 'preload.mjs');
  await writeFile(preload, 'globalThis.fetch = async () => Response.json({ models: [] });\n');
  await writeClaudeFixture(
    bin,
    `#!/usr/bin/env node
const fs=require('node:fs');const args=process.argv.slice(2);
if(args.includes('plugin')&&args.includes('list')){console.log('[]');process.exit(0)}
if(args[0]==='--version'){console.log(process.env.TEST_CLAUDE_VERSION??'2.1.272');process.exit(0)}
const result=(value)=>{const base=process.env.SWITCHBOARD_MOD_GATEWAY_URL;if(!base){console.log(value);return}const url=new URL(base+'/switchboard/mod/session');const req=require('node:http').request(url,{method:'POST',headers:{'content-type':'application/json','x-switchboard-gateway-token':process.env.SWITCHBOARD_GATEWAY_TOKEN}},()=>console.log(value));req.on('error',()=>console.log(value));req.end(JSON.stringify({sessionId:'fixture',event:'start'}));};
if(args[0]==='auth'){process.stdout.write(JSON.stringify({loggedIn:false}));process.exitCode=1}else{
const settings=JSON.parse(fs.readFileSync(args[args.indexOf('--settings')+1],'utf8'));
const agents=JSON.parse(args[args.indexOf('--agents')+1]);
result(JSON.stringify({settings,agents:Object.keys(agents),models:args.filter(x=>x.startsWith('switchboard/')),args}));}
`,
  );
  const launcher = fileURLToPath(
    new URL('../src/launcher.ts', import.meta.url),
  );
  const launch = (env: NodeJS.ProcessEnv, args: string[] = []) =>
    promisify(execFile)(process.execPath, ['--import', pathToFileURL(preload).href, launcher, ...args], {
      cwd,
      timeout: 20000,
      env: {
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        HOME: cwd,
        ...windowsHome(cwd),
        CLAUDE_CONFIG_DIR: path.join(cwd, 'claude'),
        CODEX_HOME: cwd,
        ...env,
      },
    });
  const result = JSON.parse(
    (await launch({}, ['--', '--model', 'switchboard/openai/gpt-6-sol', '--dangerously-skip-permissions'])).stdout,
  );
  const pickerModels = result.settings.modelPicker.options.map(
    (option: { model: string }) => option.model,
  );
  assert.deepEqual(pickerModels, Object.values(MODELS).map((model) => `switchboard/openai/${model}`));
  assert(result.settings.modelPicker.options.every((row: { behavesAs: string }) => row.behavesAs === 'claude-sonnet-4-6'));
  assert.deepEqual(result.agents.sort(), ['astra', 'luna', 'sol']);
  assert.equal(result.settings.permissions.disableAutoMode, 'disable');
  assert(result.args.includes('--dangerously-skip-permissions'));
  assert.deepEqual(result.models, ['switchboard/openai/gpt-6-sol']);
  const withoutProviders = JSON.parse((await launch({ SWITCHBOARD_ENABLED_PROVIDERS: '' })).stdout);
  assert.deepEqual(withoutProviders.settings.modelPicker.options, []);
  assert.deepEqual(withoutProviders.agents, []);
  // Older installs may still enable the retired zen provider; it is ignored, not fatal.
  const retired = JSON.parse((await launch({ SWITCHBOARD_ENABLED_PROVIDERS: 'openai,zen' })).stdout);
  assert.deepEqual(retired.agents.sort(), ['astra', 'luna', 'sol']);

  const launchFiltered = (selection: string, args: string[] = []) =>
    launch({ SWITCHBOARD_MODELS: selection }, args);
  const filtered = JSON.parse(
    (await launchFiltered(' switchboard/openai/gpt-6-sol,switchboard/openai/gpt-6-sol ')).stdout,
  );
  assert.deepEqual(
    filtered.settings.modelPicker.options.map((option: { model: string }) => option.model),
    ['switchboard/openai/gpt-6-sol'],
  );
  assert.deepEqual(filtered.models, ['switchboard/openai/gpt-6-sol']);
  assert.deepEqual(filtered.agents, ['sol']);
  const all = JSON.parse((await launchFiltered('all')).stdout);
  assert.equal(all.settings.modelPicker.options.length, Object.keys(MODELS).length);
  const plus = JSON.parse((await launchFiltered('+switchboard/openai/gpt-6-sol')).stdout);
  assert.deepEqual(plus.agents.sort(), ['astra', 'luna', 'sol']);
  // A saved selection may still name retired zen models; they are skipped.
  const saved = JSON.parse(
    (await launchFiltered('switchboard/zen/deepseek-v4.1-flash,switchboard/openai/gpt-6-luna')).stdout,
  );
  assert.deepEqual(
    saved.settings.modelPicker.options.map((option: { model: string }) => option.model),
    ['switchboard/openai/gpt-6-luna'],
  );
  const hidden = JSON.parse(
    (await launchFiltered('', ['--', '--model', 'switchboard/openai/gpt-6-sol'])).stdout,
  );
  assert.deepEqual(hidden.settings.modelPicker.options, []);
  assert.deepEqual(hidden.agents, []);
  assert.deepEqual(hidden.models, ['switchboard/openai/gpt-6-sol']);
  await assert.rejects(launchFiltered('switchboard/openai/typo'), /SWITCHBOARD_MODELS: model is not available/);
  const fallback = JSON.parse((await launch({})).stdout);
  assert.deepEqual(fallback.models, ['switchboard/openai/gpt-6-luna'], 'no Claude login starts on Luna');
});

test('launcher keeps the representative catalog under 30 KB', () => {
  const agents = workerDefinitions(true);
  const definitions = JSON.stringify(agents);
  const definitionBytes = Buffer.byteLength(definitions);
  assert(definitionBytes < 30000, `representative worker JSON was ${definitionBytes} bytes`);
});

test('worker registration follows selected models with one worker per model', () => {
  const selected = ['switchboard/openai/gpt-6-luna', 'switchboard/openai/gpt-6-sol'];
  const agents = workerDefinitions(true, selected);
  assert.deepEqual(new Set(Object.values(agents).map((worker) => worker.model)), new Set(selected));
  assert.equal(agents['luna'].effort, 'medium');
  assert.equal(agents['luna-high'], undefined);
  assert.ok(agents['luna'].disallowedTools.includes('Agent'));
  assert.deepEqual(workerDefinitions(true, []), {});
});

test('launcher argument limits are platform-aware and identify largest providers', () => {
  const agents = {
    'openai-worker': {
      model: 'switchboard/openai/model',
      description: 'OpenAI',
      prompt: 'Complete the delegated task.',
      disallowedTools: ['WebSearch'],
    },
    'other-worker': {
      model: 'switchboard/other/model',
      description: 'Other',
      prompt: 'Complete the delegated task.',
      disallowedTools: ['WebSearch'],
    },
  };
  const invocation = {
    command: 'claude',
    args: ['--settings', 'settings.json', '--agents', 'x'.repeat(32000)],
  };
  assert.throws(
    () => checkLauncherArgumentLimit(agents, invocation, 'claude.exe', 'win32'),
    /above the Windows limit of 32,000.*openai.*Disable providers or extra models/,
  );
  assert.doesNotThrow(() =>
    checkLauncherArgumentLimit(
      agents,
      { command: 'cmd.exe', args: ['/c', 'claude.cmd', 'x'.repeat(7900)] },
      'C:\\bin\\claude.cmd',
      'win32',
    ),
  );
  assert.throws(
    () =>
      checkLauncherArgumentLimit(
        agents,
        { command: 'cmd.exe', args: ['/c', 'claude.cmd', 'x'.repeat(8000)] },
        'C:\\bin\\claude.cmd',
        'win32',
      ),
    /Windows cmd.exe shim limit of 8,000/,
  );
});

test('callers that disable hooks run the real executable untouched', {
  skip: process.platform === 'win32',
}, async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'launcher-hooks-off-'));
  t.after(() => removeTemporary(cwd));
  await mkdir(path.join(cwd, 'bin'));
  await writeClaudeFixture(
    path.join(cwd, 'bin'),
    `#!/usr/bin/env node
console.log(JSON.stringify({args:process.argv.slice(2),gateway:!!process.env.SWITCHBOARD_GATEWAY_TOKEN}));
`,
  );
  const launcher = fileURLToPath(new URL('../src/launcher.ts', import.meta.url));
  const launch = (args: string[]) =>
    promisify(execFile)(process.execPath, [launcher, '--', ...args], {
      cwd,
      timeout: 20000,
      env: { PATH: path.join(cwd, 'bin') + path.delimiter + process.env.PATH, HOME: cwd },
    });
  const args = ['-p', '--settings', '{"disableAllHooks":true}', '--model', 'sonnet'];
  assert.deepEqual(JSON.parse((await launch(args)).stdout), { args, gateway: false });
  await assert.rejects(
    launch(['-p', '--settings={"disableAllHooks":true}', '--model', 'switchboard/openai/gpt-6-luna']),
    /Switchboard models need hooks/,
  );
});

test('OpenAI models carry short picker labels', () => {
  assert.deepEqual(
    Object.values(MODELS).map((model) => LABELS[model]),
    ['Astra', 'Sol', 'Luna'],
  );
});
