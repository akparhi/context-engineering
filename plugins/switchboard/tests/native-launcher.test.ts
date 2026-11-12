import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import {
  checkLauncherArgumentLimit,
  connectorsAllowed,
  workerDefinitions,
} from '../src/launcher.ts';
import {
  LABELS,
  MODELS,
  OPENAI_WORKERS,
} from '../src/providers/codex/models.ts';
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
 result(JSON.stringify({agentView:process.env.CLAUDE_CODE_DISABLE_AGENT_VIEW,backgroundTasks:process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS,functionHooks:process.env.CLAUDE_CODE_ENABLE_FUNCTION_HOOKS,settings,models:args.filter(x=>x.startsWith('switchboard/')||['astra','sol','luna'].includes(x)),args,settingsCount:args.filter(x=>x==='--settings').length,hasLocalToken:!!process.env.SWITCHBOARD_GATEWAY_TOKEN,apiTimeout:process.env.API_TIMEOUT_MS,toolSearch:process.env.ENABLE_TOOL_SEARCH,auth:process.env.ANTHROPIC_API_KEY?'api':process.env.ANTHROPIC_AUTH_TOKEN?'local':'native'}));}
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
        'luna',
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
      promisify(execFile)(process.execPath, [launcher, '--', '--model', 'luna'], {
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
result(JSON.stringify({settings,agents:Object.keys(agents),models:args.filter(x=>x.startsWith('switchboard/')||['astra','sol','luna'].includes(x)),args}));}
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
    (await launch({}, ['--', '--model', 'sol', '--dangerously-skip-permissions'])).stdout,
  );
  const pickerModels = result.settings.modelPicker.options.map(
    (option: { model: string }) => option.model,
  );
  assert.deepEqual(pickerModels, Object.keys(MODELS));
  assert(result.settings.modelPicker.options.every((row: { behavesAs: string }) => row.behavesAs === 'claude-sonnet-4-6'));
  assert.deepEqual(result.agents.sort(), ['astra', 'luna', 'sol', 'terra']);
  assert.equal(result.settings.permissions.disableAutoMode, 'disable');
  assert(result.args.includes('--dangerously-skip-permissions'));
  assert.deepEqual(result.models, ['sol']);
  const withoutProviders = JSON.parse((await launch({ SWITCHBOARD_ENABLED_PROVIDERS: '' })).stdout);
  assert.deepEqual(withoutProviders.settings.modelPicker.options, []);
  assert.deepEqual(withoutProviders.agents, []);
  const zen = JSON.parse((await launch({ OPENCODE_API_KEY: 'zen-fixture' })).stdout);
  assert.deepEqual(zen.agents.sort(), ['astra', 'deepseek', 'luna', 'sol', 'terra']);
  assert.deepEqual(zen.settings.modelPicker.options.map((option: { model: string }) => option.model), Object.keys(MODELS));
  const badKey = await launch({ OPENCODE_API_KEY: 'bad key' });
  assert.match(badKey.stderr, /deepseek unavailable: Invalid OpenCode Zen API key/);
  assert.deepEqual(JSON.parse(badKey.stdout).agents.sort(), ['astra', 'luna', 'sol', 'terra']);
  const zenDisabled = JSON.parse(
    (await launch({ OPENCODE_API_KEY: 'zen-fixture', SWITCHBOARD_ENABLED_PROVIDERS: 'openai' })).stdout,
  );
  assert.deepEqual(zenDisabled.agents.sort(), ['astra', 'luna', 'sol', 'terra']);

  const launchFiltered = (selection: string, args: string[] = []) =>
    launch({ SWITCHBOARD_MODELS: selection }, args);
  const filtered = JSON.parse(
    (await launchFiltered(' sol,sol ')).stdout,
  );
  assert.deepEqual(
    filtered.settings.modelPicker.options.map((option: { model: string }) => option.model),
    ['sol'],
  );
  assert.deepEqual(filtered.models, ['sol']);
  assert.deepEqual(filtered.agents, ['sol']);
  const all = JSON.parse((await launchFiltered('all')).stdout);
  assert.equal(all.settings.modelPicker.options.length, Object.keys(MODELS).length);
  const plus = JSON.parse((await launchFiltered('+sol')).stdout);
  assert.deepEqual(plus.agents.sort(), ['astra', 'luna', 'sol', 'terra']);
  // A saved selection may still name retired zen models; they are skipped.
  const saved = JSON.parse(
    (await launchFiltered('switchboard/zen/deepseek-v4.1-flash,luna')).stdout,
  );
  assert.deepEqual(
    saved.settings.modelPicker.options.map((option: { model: string }) => option.model),
    ['luna'],
  );
  // A saved pre-alias ID is dropped (with a warning), not fatal.
  const stale = await launchFiltered('switchboard/openai/gpt-6.1-sol,luna');
  assert.match(stale.stderr, /switchboard\/openai\/gpt-6\.1-sol is retired; use sol/);
  assert.deepEqual(
    JSON.parse(stale.stdout).settings.modelPicker.options.map((option: { model: string }) => option.model),
    ['luna'],
  );
  // Claude's own saved /model may still be a pre-alias ID; fall back instead of 400ing every turn.
  await mkdir(path.join(cwd, 'claude'), { recursive: true });
  await writeFile(
    path.join(cwd, 'claude', 'settings.json'),
    JSON.stringify({ model: 'switchboard/openai/gpt-6-sol' }),
  );
  const savedStale = await launch({});
  assert.match(savedStale.stderr, /switchboard\/openai\/gpt-6-sol is retired; use sol/);
  assert.deepEqual(JSON.parse(savedStale.stdout).models, ['luna']);
  await writeFile(
    path.join(cwd, 'claude', 'settings.json'),
    JSON.stringify({
      pluginConfigs: {
        'switchboard@akparhi': {
          options: { sol: false, gpt_effort: 'high' },
        },
      },
    }),
  );
  const configured = await launch({});
  assert.deepEqual(JSON.parse(configured.stdout).agents.sort(), ['astra', 'luna', 'terra']);
  await rm(path.join(cwd, 'claude', 'settings.json'));
  const hidden = JSON.parse(
    (await launchFiltered('', ['--', '--model', 'sol'])).stdout,
  );
  assert.deepEqual(hidden.settings.modelPicker.options, []);
  assert.deepEqual(hidden.agents, []);
  assert.deepEqual(hidden.models, ['sol']);
  await assert.rejects(launchFiltered('typo'), /SWITCHBOARD_MODELS: model is not available/);
  const fallback = JSON.parse((await launch({})).stdout);
  assert.deepEqual(fallback.models, ['luna'], 'no Claude login starts on Luna');
});

test('deepseek is a Zen-key subagent that ignores the picker and borrows WebSearch from Codex', () => {
  const deepseek = (codexSignedIn: boolean, selected?: string[], options = {}) =>
    workerDefinitions(codexSignedIn, selected, options, true).deepseek;
  assert.equal(workerDefinitions(true, undefined, {}, false).deepseek, undefined);
  assert.equal(deepseek(true, [])?.model, 'switchboard/zen/deepseek-v4.1-flash');
  assert.equal(deepseek(true, [])?.effort, undefined);
  assert.equal(deepseek(true, undefined, { deepseek: false }), undefined);
  assert.deepEqual(deepseek(true)?.disallowedTools, [
    'Agent', 'DesignSync', 'RemoteTrigger', 'ShareOnboardingGuide', 'ReportFindings', 'EnterWorktree', 'ExitWorktree',
  ]);
  assert.deepEqual(deepseek(false)?.disallowedTools.slice(-1), ['WebSearch']);
});

test('launcher keeps the full worker catalog under 30 KB', () => {
  const agents = workerDefinitions(
    true,
    undefined,
    Object.fromEntries(Object.keys(OPENAI_WORKERS).map((name) => [name, true])),
    true,
  );
  assert.equal(Object.keys(agents).length, 5);
  const definitions = JSON.stringify(agents);
  const definitionBytes = Buffer.byteLength(definitions);
  assert(definitionBytes < 30000, `representative worker JSON was ${definitionBytes} bytes`);
});

test('default config registers one session-effort worker per selected model', () => {
  const all = workerDefinitions(true);
  assert.deepEqual(Object.keys(all), ['sol', 'astra', 'terra', 'luna']);
  for (const worker of Object.values(all)) {
    assert.equal('effort' in worker, false);
    assert.match(worker.description, /^gpt-[^,]+, session reasoning\./);
  }
  const agents = workerDefinitions(true, ['luna', 'sol']);
  assert.deepEqual(Object.keys(agents), ['sol', 'luna']);
  assert.ok(agents['luna'].disallowedTools.includes('Agent'));
  assert.deepEqual(workerDefinitions(true, []), {});
});

test('config hides workers and sets one effort for all, still filtered by picker models', () => {
  const options = { sol: false, astra: 'false', gpt_effort: 'low' };
  const agents = workerDefinitions(true, undefined, options);
  assert.deepEqual(Object.keys(agents), ['terra', 'luna']);
  assert.equal(agents['luna'].effort, 'low');
  assert.match(agents['luna'].description, /^gpt-6-luna, low reasoning\./);
  assert.equal(workerDefinitions(true, undefined, { gpt_effort: 'max' })['luna'].effort, undefined);
  assert.deepEqual(Object.keys(workerDefinitions(true, ['luna'], options)), ['luna']);
  assert.deepEqual(workerDefinitions(false, undefined, options), {});
});

test('launcher argument limits are platform-aware and identify largest providers', () => {
  const agents = {
    'openai-worker': {
      model: 'luna',
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
    launch(['-p', '--settings={"disableAllHooks":true}', '--model', 'luna']),
    /Switchboard models need hooks/,
  );
});

test('Claude traffic chains through the gateway to the user ANTHROPIC_BASE_URL proxy', {
  skip: process.platform === 'win32',
}, async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'launcher-upstream-'));
  t.after(() => removeTemporary(cwd));
  const received: { url?: string; authorization?: string; gatewayToken?: unknown }[] = [];
  const upstream = http.createServer((req, res) => {
    received.push({
      url: req.url,
      authorization: req.headers.authorization,
      gatewayToken: req.headers['x-switchboard-gateway-token'],
    });
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => upstream.close());
  const proxy = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/proxy/`;
  await mkdir(path.join(cwd, 'bin'));
  await mkdir(path.join(cwd, 'claude'));
  // Claude applies settings `env` over its inherited process env, flag settings last.
  await writeClaudeFixture(
    path.join(cwd, 'bin'),
    `#!/usr/bin/env node
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');const args=process.argv.slice(2);
if(args.includes('plugin')&&args.includes('list')){console.log('[]');process.exit(0)}
if(args[0]==='--version'){console.log('2.1.272');process.exit(0)}
if(args[0]==='auth'){console.log('{"loggedIn":true}');process.exit(0)}
const read=(file)=>{try{return JSON.parse(fs.readFileSync(file,'utf8')).env??{}}catch{return {}}};
const env={...process.env,...read(path.join(process.env.CLAUDE_CONFIG_DIR,'settings.json')),...read(args[args.indexOf('--settings')+1])};
const headers={'content-type':'application/json',authorization:'Bearer '+env.ANTHROPIC_AUTH_TOKEN};
for(const line of env.ANTHROPIC_CUSTOM_HEADERS.split('\\n')){const i=line.indexOf(':');headers[line.slice(0,i).trim()]=line.slice(i+1).trim()}
const post=(url,headers,body,done)=>{const req=http.request(url,{method:'POST',headers},(res)=>{res.resume();res.on('end',()=>done(res.statusCode))});req.on('error',()=>done(0));req.end(body)};
post(process.env.SWITCHBOARD_MOD_GATEWAY_URL+'/switchboard/mod/session',{'content-type':'application/json','x-switchboard-gateway-token':process.env.SWITCHBOARD_GATEWAY_TOKEN},JSON.stringify({sessionId:'fixture',event:'start'}),()=>
  post(env.ANTHROPIC_BASE_URL+'/v1/messages',headers,JSON.stringify({model:'claude-sonnet-4-6',messages:[]}),(status)=>console.log(status)));
`,
  );
  const launcher = fileURLToPath(new URL('../src/launcher.ts', import.meta.url));
  const proxyEnv = { ANTHROPIC_BASE_URL: proxy, ANTHROPIC_AUTH_TOKEN: 'user-proxy-token' };
  for (const source of ['user settings', 'process env']) {
    received.length = 0;
    await writeFile(
      path.join(cwd, 'claude', 'settings.json'),
      JSON.stringify(source === 'user settings' ? { env: proxyEnv } : {}),
    );
    const { stdout } = await promisify(execFile)(process.execPath, [launcher, '--', '-p'], {
      cwd,
      timeout: 20000,
      env: {
        PATH: path.join(cwd, 'bin') + path.delimiter + process.env.PATH,
        HOME: cwd,
        CLAUDE_CONFIG_DIR: path.join(cwd, 'claude'),
        CODEX_HOME: cwd,
        ...(source === 'process env' ? proxyEnv : {}),
      },
    });
    assert.equal(stdout.trim(), '200', source);
    assert.deepEqual(
      received,
      [{ url: '/proxy/v1/messages', authorization: 'Bearer user-proxy-token', gatewayToken: undefined }],
      `${source}: the gateway forwards with the user's proxy auth and keeps its own token`,
    );
  }
});

test('OpenAI models carry short picker labels', () => {
  assert.deepEqual(
    Object.keys(MODELS).map((model) => LABELS[model]),
    ['Sol', 'Astra', 'Terra', 'Luna'],
  );
});

test('claude.ai connectors load only under configured dirs', () => {
  const options = { claudeai_connectors_dirs: '~/Projects/Alaan, /work/client' };
  const home = os.homedir();
  assert.equal(connectorsAllowed(options, path.join(home, 'Projects', 'Alaan', 'api')), true);
  assert.equal(connectorsAllowed(options, '/work/client'), true);
  assert.equal(connectorsAllowed(options, path.join(home, 'Projects', 'AlaanOther')), false);
  assert.equal(connectorsAllowed(options, path.join(home, 'Projects', 'Home')), false);
  assert.equal(connectorsAllowed({}, home), false);
});
