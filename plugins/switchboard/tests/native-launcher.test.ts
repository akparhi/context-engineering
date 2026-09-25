import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  checkLauncherArgumentLimit,
  workerDefinitions,
} from '../src/launcher.ts';
import { LABELS, MODELS } from '../src/providers/codex/models.ts';
import { ZEN_MODELS } from '../src/providers/opencode/models.ts';
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
        'switchboard/zen/gpt-5.6-luna',
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
      promisify(execFile)(process.execPath, [launcher, '--', '--model', 'switchboard/zen/gpt-5.6-luna'], {
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

test('Zen credentials add picker models and named workers without leaking the key to Claude', {
  skip: process.platform === 'win32',
}, async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'launcher-zen-test-'));
  t.after(() => removeTemporary(cwd));
  const bin = path.join(cwd, 'bin');
  await mkdir(bin);
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
result(JSON.stringify({settings,agents:Object.keys(agents),models:args.filter(x=>x.startsWith('switchboard/')),zenKeyInChild:process.env.OPENCODE_API_KEY,args}));}
`,
  );
  const launcher = fileURLToPath(
    new URL('../src/launcher.ts', import.meta.url),
  );
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [launcher, '--', '--model', 'switchboard/zen/gpt-5.6-luna', '--dangerously-skip-permissions'],
    {
      cwd,
      timeout: 20000,
      env: {
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        HOME: cwd,
        ...windowsHome(cwd),
        XDG_DATA_HOME: path.join(cwd, 'data'),
        CLAUDE_CONFIG_DIR: path.join(cwd, 'claude'),
        CODEX_HOME: cwd,
        OPENCODE_API_KEY: 'zen-fixture-key',
      },
    },
  );
  const result = JSON.parse(stdout);
  const pickerModels = result.settings.modelPicker.options.map(
    (option: { model: string }) => option.model,
  );
  assert(pickerModels.includes('switchboard/zen/deepseek-v4.1-flash'));
  assert.equal(
    result.settings.modelPicker.options.find(
      (row: { model: string }) => row.model === 'switchboard/zen/deepseek-v4.1-flash',
    ).behavesAs,
    'claude-haiku-4-5',
  );
  assert.match(
    result.settings.modelPicker.options.find(
      (row: { model: string }) => row.model === 'switchboard/zen/deepseek-v4.1-flash',
    ).description,
    /effort not applicable/,
  );
  assert.equal(result.zenKeyInChild, undefined);
  assert.equal(result.settings.permissions.disableAutoMode, 'disable');
  assert(result.args.includes('--dangerously-skip-permissions'));
  assert.deepEqual(result.models, ['switchboard/zen/gpt-5.6-luna']);
  const disabled = await promisify(execFile)(process.execPath, [launcher], {
    cwd,
    timeout: 20000,
    env: {
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      HOME: cwd,
      ...windowsHome(cwd),
      XDG_DATA_HOME: path.join(cwd, 'data'),
      CLAUDE_CONFIG_DIR: path.join(cwd, 'claude'),
      CODEX_HOME: cwd,
      OPENCODE_API_KEY: 'invalid key must not be read',
      SWITCHBOARD_ENABLED_PROVIDERS: '',
    },
  });
  const withoutProviders = JSON.parse(disabled.stdout);
  assert.deepEqual(withoutProviders.settings.modelPicker.options, []);
  assert.deepEqual(withoutProviders.agents, []);

  const launchFiltered = (selection: string, args: string[] = []) =>
    promisify(execFile)(process.execPath, [launcher, ...args], {
      cwd,
      timeout: 20000,
      env: {
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        HOME: cwd,
        ...windowsHome(cwd),
        XDG_DATA_HOME: path.join(cwd, 'data'),
        CLAUDE_CONFIG_DIR: path.join(cwd, 'claude'),
        CODEX_HOME: cwd,
        OPENCODE_API_KEY: 'zen-fixture-key',
        SWITCHBOARD_MODELS: selection,
        SWITCHBOARD_ZEN_MODELS: 'deepseek-v4.1-flash',
      },
    });
  const filtered = JSON.parse(
    (await launchFiltered(' switchboard/zen/deepseek-v4.1-flash,switchboard/zen/deepseek-v4.1-flash ')).stdout,
  );
  assert.deepEqual(
    filtered.settings.modelPicker.options.map((option: { model: string }) => option.model),
    ['switchboard/zen/deepseek-v4.1-flash'],
  );
  assert.deepEqual(filtered.models, ['switchboard/zen/deepseek-v4.1-flash']);
  assert.deepEqual(filtered.agents.sort(), ['deepseek']);
  const outsideDefaults = JSON.parse((await launchFiltered('switchboard/zen/deepseek-v4.1-flash')).stdout);
  assert.deepEqual(
    outsideDefaults.settings.modelPicker.options.map((option: { model: string }) => option.model),
    ['switchboard/zen/deepseek-v4.1-flash'],
  );
  assert.deepEqual(outsideDefaults.agents, ['deepseek']);
  const all = JSON.parse((await launchFiltered('all')).stdout);
  assert(all.settings.modelPicker.options.length >= ZEN_MODELS.length);
  assert(all.agents.includes('deepseek'));
  const plus = JSON.parse((await launchFiltered('+switchboard/zen/deepseek-v4.1-flash')).stdout);
  assert(
    plus.settings.modelPicker.options.some(
      (option: { model: string }) => option.model === 'switchboard/zen/deepseek-v4.1-flash',
    ),
  );
  assert(plus.agents.includes('deepseek'));
  const hidden = JSON.parse(
    (await launchFiltered('', ['--model', 'switchboard/zen/gpt-5.6-luna'])).stdout,
  );
  assert.deepEqual(hidden.settings.modelPicker.options, []);
  assert.deepEqual(hidden.agents, []);
  assert.deepEqual(hidden.models, ['switchboard/zen/gpt-5.6-luna']);
  await assert.rejects(launchFiltered('switchboard/zen/typo'), /SWITCHBOARD_MODELS: model is not available/);
});

test('Zen saved auth supplies the no-login fallback without exposing credentials', {
  skip: process.platform === 'win32',
}, async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'launcher-zen-saved-test-'));
  t.after(() => removeTemporary(cwd));
  const bin = path.join(cwd, 'bin');
  const data = path.join(cwd, 'data', 'opencode');
  await mkdir(bin);
  await mkdir(data, { recursive: true });
  await writeFile(
    path.join(data, 'auth.json'),
    JSON.stringify({ opencode: { type: 'api', key: 'saved-zen-fixture-key' } }),
  );
  await writeClaudeFixture(
    bin,
    `#!/usr/bin/env node
const fs=require('node:fs');const args=process.argv.slice(2);
if(args.includes('plugin')&&args.includes('list')){console.log('[]');process.exit(0)}
if(args[0]==='--version'){console.log(process.env.TEST_CLAUDE_VERSION??'2.1.272');process.exit(0)}
const result=(value)=>{const base=process.env.SWITCHBOARD_MOD_GATEWAY_URL;if(!base){console.log(value);return}const url=new URL(base+'/switchboard/mod/session');const req=require('node:http').request(url,{method:'POST',headers:{'content-type':'application/json','x-switchboard-gateway-token':process.env.SWITCHBOARD_GATEWAY_TOKEN}},()=>console.log(value));req.on('error',()=>console.log(value));req.end(JSON.stringify({sessionId:'fixture',event:'start'}));};
if(args[0]==='auth'){process.stdout.write(JSON.stringify({loggedIn:false}));process.exitCode=1}else{
const settings=JSON.parse(fs.readFileSync(args[args.indexOf('--settings')+1],'utf8'));
result(JSON.stringify({settings,models:args.filter(x=>x.startsWith('switchboard/')),zenKeyInChild:process.env.OPENCODE_API_KEY}));}
`,
  );
  const launcher = fileURLToPath(
    new URL('../src/launcher.ts', import.meta.url),
  );
  const { stdout } = await promisify(execFile)(process.execPath, [launcher], {
    cwd,
    timeout: 20000,
    env: {
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      HOME: cwd,
      ...windowsHome(cwd),
      XDG_DATA_HOME: path.join(cwd, 'data'),
      CLAUDE_CONFIG_DIR: path.join(cwd, 'claude'),
      CODEX_HOME: cwd,
      SWITCHBOARD_ZEN_MODELS: 'deepseek-v4.1-flash',
    },
  });
  const result = JSON.parse(stdout);
  assert.deepEqual(result.models, ['switchboard/zen/deepseek-v4.1-flash']);
  assert.equal(result.zenKeyInChild, undefined);
  assert.deepEqual(
    result.settings.modelPicker.options.map((option: { model: string }) => option.model),
    ['switchboard/zen/deepseek-v4.1-flash'],
  );
});

test('launcher keeps the representative catalog under 30 KB', () => {
  const agents = workerDefinitions(true, true);
  const definitions = JSON.stringify(agents);
  const definitionBytes = Buffer.byteLength(definitions);
  assert(definitionBytes < 30000, `representative worker JSON was ${definitionBytes} bytes`);
  assert.equal(ZEN_MODELS.length, 1);
});

test('worker registration follows selected models with one worker per model', () => {
  const selected = ['switchboard/openai/gpt-6-luna', 'switchboard/zen/deepseek-v4.1-flash'];
  const agents = workerDefinitions(true, true, selected);
  assert.deepEqual(new Set(Object.values(agents).map((worker) => worker.model)), new Set(selected));
  assert.equal(agents['luna'].effort, 'medium');
  assert.equal(agents['luna-high'], undefined);
  assert.ok(agents['luna'].disallowedTools.includes('Agent'));
  assert.equal(agents['deepseek'].effort, undefined);
  assert.equal(agents['deepseek-max'], undefined);
  assert.deepEqual(workerDefinitions(true, true, []), {});
});

test('launcher argument limits are platform-aware and identify largest providers', () => {
  const agents = {
    'openai-worker': {
      model: 'switchboard/openai/model',
      description: 'OpenAI',
      prompt: 'Complete the delegated task.',
      disallowedTools: ['WebSearch'],
    },
    'zen-worker': {
      model: 'switchboard/zen/model',
      description: 'Zen',
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

test('the Zen model listing is available without authentication', async () => {
  const launcher = fileURLToPath(
    new URL('../src/launcher.ts', import.meta.url),
  );
  const { stdout } = await promisify(execFile)(process.execPath, [launcher, '--zen-models'], {
    timeout: 20000,
    env: {
      PATH: process.env.PATH,
      HOME: os.tmpdir(),
      XDG_DATA_HOME: path.join(os.tmpdir(), 'missing-zen-data'),
    },
  });
  const models = JSON.parse(stdout);
  assert(models.some((model: { id: string }) => model.id === 'deepseek-v4.1-flash'));
});

test('OpenAI models carry short picker labels', () => {
  assert.deepEqual(
    Object.values(MODELS).map((model) => LABELS[model]),
    ['Astra', 'Sol', 'Luna'],
  );
});
