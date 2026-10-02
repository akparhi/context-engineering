// Live tool matrix for the deepseek subagent: one real launcher session per tool, luna as the main
// model delegating a single task to deepseek. Verdicts come from the subagent transcript and gateway
// trace, never from the model's own report. Needs a Zen key and a Codex login.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readZenKey } from '../../src/providers/opencode/auth.ts';
import { isolatedEnvironment } from './environment.ts';
import type { TranscriptBlock, TranscriptEntry } from './native-events.ts';

const { values } = parseArgs({
  options: {
    only: { type: 'string' },
    out: { type: 'string' },
    concurrency: { type: 'string', default: '4' },
    help: { type: 'boolean' },
  },
});
if (values.help) {
  console.log(
    'Usage: bun tests/live/native-deepseek.ts [--only Bash,Read] [--out matrix.md] [--concurrency 4]\nOne launcher session per tool; the deepseek subagent runs each tool once. Writes a markdown matrix.',
  );
  process.exit(0);
}
assert(await readZenKey(), 'Set OPENCODE_API_KEY or connect OpenCode Zen first.');

const nonce = randomBytes(4).toString('hex');
const token = (name: string) => `${name.toUpperCase()}_${nonce}`;
const launcher = fileURLToPath(new URL('../../src/launcher.ts', import.meta.url));
const root = await mkdtemp(path.join(os.tmpdir(), 'switchboard-deepseek-'));
console.log(`Artifacts: ${root}`);

// 1x1 red PNG and a one-page PDF whose text is the PDF token.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAb0lEQVR4nO3PAQkAAAyEwO9feoshgnABdNvJ8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ2oPcf88OIhvJ6vAAAAAElFTkSuQmCC',
  'base64',
);
function pdf(text: string): string {
  const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = body.length;
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  return `${body}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}
// Records the tool names Claude sends deepseek on each Zen request: the ground truth the model's self-report is not.
const TOOL_TAP = `const file=process.env.DEEPSEEK_TOOL_TAP;const real=globalThis.fetch;
globalThis.fetch=async(url,init)=>{if(String(url).includes('opencode.ai/zen')&&init?.body){
const body=JSON.parse(String(init.body));require('node:fs').appendFileSync(file,JSON.stringify((body.tools??[]).map((t)=>t.function?.name))+'\\n');}
return real(url,init);};`;
const MCP_SERVER = `const rl=require('node:readline').createInterface({input:process.stdin});
const send=(m)=>process.stdout.write(JSON.stringify(m)+'\\n');
rl.on('line',(line)=>{const m=JSON.parse(line);if(m.id===undefined)return;
if(m.method==='initialize')return send({jsonrpc:'2.0',id:m.id,result:{protocolVersion:m.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1.0.0'}}});
if(m.method==='tools/list')return send({jsonrpc:'2.0',id:m.id,result:{tools:[{name:'echo',description:'Echo text back',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text']}}]}});
if(m.method==='tools/call')return send({jsonrpc:'2.0',id:m.id,result:{content:[{type:'text',text:'ECHO:'+m.params.arguments.text}]}});
send({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'unsupported'}});});`;

interface Trial {
  name: string;
  dir: string;
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
  init?: { agents?: string[]; tools?: string[] };
  /** Deepseek's own assistant/tool blocks, from every subagent transcript of the session. */
  blocks: TranscriptBlock[];
  subagentModels: string[];
  routes: Array<Record<string, unknown>>;
  /** Union of tool names across deepseek's Zen requests. */
  offered: string[];
}

interface Case {
  /** Matrix row label. */
  tool: string;
  /** Tool-use names that count as exercising this tool. */
  uses: RegExp;
  task: (dir: string) => string;
  /** Extra proof beyond a non-error tool result: file on disk, token in output, route in trace. */
  proof?: (trial: Trial, results: TranscriptBlock[]) => Promise<string | undefined> | string | undefined;
}

const text = (block: TranscriptBlock) =>
  typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? '');
const contains = (needle: string) => (_trial: Trial, results: TranscriptBlock[]) =>
  results.some((result) => text(result).includes(needle)) ? undefined : `no result contains ${needle}`;
const answerContains = (needle: string) => (trial: Trial) =>
  trial.blocks.some((block) => block.type === 'text' && String((block as { text?: string }).text).includes(needle))
    ? undefined
    : `deepseek never said ${needle}`;
const fileContains = (file: string, needle: string) => async (trial: Trial) =>
  (await readFile(path.join(trial.dir, file), 'utf8').catch(() => '')).includes(needle)
    ? undefined
    : `${file} lacks ${needle}`;

const CASES: Case[] = [
  {
    tool: 'Bash',
    uses: /^Bash$/,
    task: () => `Run the shell command: echo ${token('bash')}`,
    proof: contains(token('bash')),
  },
  {
    tool: 'Bash (background) + output',
    uses: /^(Bash|TaskOutput|Monitor|BashOutput|Read)$/,
    task: () =>
      `Run the shell command "sleep 2; echo ${token('background')}" with Bash run_in_background set to true. Then retrieve its output with the tool meant for reading background task output, and report it.`,
    proof: contains(token('background')),
  },
  {
    tool: 'TaskStop',
    uses: /^TaskStop$/,
    task: () => 'Start the shell command "sleep 120" with Bash run_in_background true, then stop that background task with the TaskStop tool and report the result.',
  },
  {
    tool: 'SendMessage',
    uses: /^SendMessage$/,
    task: () => `Use the SendMessage tool to send the message "${token('message')}" to "main", then report what the tool returned.`,
  },
  {
    tool: 'ListAgents',
    uses: /^ListAgents$/,
    task: () => 'Call the ListAgents tool and report what it returned.',
  },
  {
    tool: 'CronCreate / CronList / CronDelete',
    uses: /^(CronCreate|CronList|CronDelete)$/,
    task: () =>
      `Use CronCreate to schedule the prompt "echo ${token('cron')}" every hour, then CronList to list jobs, then CronDelete to delete the job you created. Report each result.`,
    proof: (_trial, results) =>
      results.filter((result) => !result.is_error).length >= 3 ? undefined : 'fewer than three successful cron calls',
  },
  {
    tool: 'EnterWorktree / ExitWorktree',
    uses: /^(EnterWorktree|ExitWorktree)$/,
    task: () => 'Use the EnterWorktree tool to create a worktree named probe, then the ExitWorktree tool to leave and remove it. Report each result.',
  },
  {
    tool: 'Read',
    uses: /^Read$/,
    task: (dir) => `Read the file ${dir}/fixture.txt and report its last line.`,
    proof: contains(token('read')),
  },
  {
    tool: 'Write',
    uses: /^Write$/,
    task: (dir) => `Create the file ${dir}/written.txt containing exactly: ${token('write')}`,
    proof: fileContains('written.txt', token('write')),
  },
  {
    tool: 'Edit',
    uses: /^(Read|Edit)$/,
    task: (dir) => `In ${dir}/edit.txt replace the word PLACEHOLDER with ${token('edit')} using the Edit tool.`,
    proof: fileContains('edit.txt', token('edit')),
  },
  {
    tool: 'Glob',
    uses: /^Glob$/,
    task: (dir) => `Use the Glob tool with pattern "**/*.fixture" in ${dir} and list the matches.`,
    proof: contains(`${token('glob')}.fixture`),
  },
  {
    tool: 'Grep',
    uses: /^Grep$/,
    task: (dir) => `Use the Grep tool to find which file under ${dir} contains the text ${token('read')}.`,
    proof: contains('fixture.txt'),
  },
  {
    tool: 'NotebookEdit',
    uses: /^(ToolSearch|NotebookEdit|Read)$/,
    task: (dir) =>
      `Use the NotebookEdit tool (load it with ToolSearch first if needed) to replace the source of the first cell of ${dir}/book.ipynb with: print("${token('notebook')}")`,
    proof: fileContains('book.ipynb', token('notebook')),
  },
  {
    tool: 'ToolSearch',
    uses: /^ToolSearch$/,
    task: () => 'Use the ToolSearch tool with query "notebook" and report which tools it returned.',
    proof: (_trial, results) =>
      results.some((result) => /NotebookEdit/.test(text(result))) ? undefined : 'no NotebookEdit reference',
  },
  {
    tool: 'WebFetch',
    uses: /^(ToolSearch|WebFetch)$/,
    task: () => 'Use the WebFetch tool (load it with ToolSearch first if needed) on https://example.com and report the page heading.',
    proof: (_trial, results) =>
      results.some((result) => /Example Domain/i.test(text(result))) ? undefined : 'no Example Domain in result',
  },
  {
    tool: 'WebSearch',
    uses: /^(ToolSearch|WebSearch)$/,
    task: () => 'Use the WebSearch tool (load it with ToolSearch first if needed) to search for "Bun JavaScript runtime" and report one result URL.',
    proof: (trial, results) => {
      const sideRequest = trial.routes.some(
        (route) => route.route === 'openai-request' && route.model === 'gpt-6-luna' && route.agentId,
      );
      if (!sideRequest) {
        return 'no deepseek-scoped luna web_search request in the gateway trace';
      }
      return results.some((result) => /https?:\/\//.test(text(result))) ? undefined : 'no URL in result';
    },
  },
  {
    tool: 'TodoWrite / Task list',
    uses: /^(ToolSearch|TodoWrite|TaskCreate|TaskUpdate|TaskList)$/,
    task: () =>
      `Record a todo item titled "${token('todo')}" with your todo or task-tracking tool (TodoWrite or TaskCreate; load it with ToolSearch if needed).`,
    proof: (_trial, results) => (results.some((result) => !result.is_error) ? undefined : 'no successful todo call'),
  },
  {
    tool: 'Skill',
    uses: /^Skill$/,
    task: () => 'Invoke the skill named "fixture-echo" with the Skill tool and follow its instructions.',
    proof: answerContains(token('skill')),
  },
  {
    tool: 'MCP tool',
    uses: /^(ToolSearch|mcp__fixture__echo)$/,
    task: () =>
      `Call the MCP tool mcp__fixture__echo (load it with ToolSearch first if needed) with text "${token('mcp')}".`,
    proof: contains(`ECHO:${token('mcp')}`),
  },
  {
    tool: 'LSP',
    uses: /^(ToolSearch|LSP)$/,
    task: (dir) =>
      `Use the LSP tool (load it with ToolSearch first if needed) for documentSymbol on ${dir}/sample.ts line 1 character 1. If no LSP tool exists, say NO_LSP.`,
  },
  {
    tool: 'Read (image)',
    uses: /^Read$/,
    task: (dir) =>
      `Look at the image ${dir}/pixel.png with the Read tool only (no other tool) and name the one color that fills it, in uppercase.`,
    proof: (trial) =>
      trial.blocks.some((block) => block.type === 'tool_use' && block.name !== 'Read')
        ? 'used a tool other than Read'
        : answerContains('BLUE')(trial),
  },
  {
    tool: 'Read (PDF)',
    uses: /^Read$/,
    task: (dir) => `Read the PDF file ${dir}/doc.pdf and report the text it contains.`,
    // Claude may send the PDF as a document block; DeepSeek then gets an omission note, not the text.
  },
];

async function prepare(name: string): Promise<string> {
  const dir = path.join(root, name.replace(/[^A-Za-z0-9]+/g, '-'));
  await mkdir(path.join(dir, 'config'), { recursive: true });
  await mkdir(path.join(dir, '.claude', 'skills', 'fixture-echo'), { recursive: true });
  await writeFile(
    path.join(dir, 'config', '.claude.json'),
    JSON.stringify({ hasCompletedOnboarding: true, theme: 'dark' }),
  );
  await writeFile(
    path.join(dir, '.claude', 'skills', 'fixture-echo', 'SKILL.md'),
    `---\nname: fixture-echo\ndescription: Test fixture skill. Use when asked to invoke fixture-echo.\n---\nReply with exactly ${token('skill')} and nothing else.\n`,
  );
  await writeFile(
    path.join(dir, 'fixture.txt'),
    `${Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n')}\n${token('read')}\n`,
  );
  await writeFile(path.join(dir, 'edit.txt'), 'before PLACEHOLDER after\n');
  await writeFile(path.join(dir, `${token('glob')}.fixture`), 'glob\n');
  await writeFile(path.join(dir, 'sample.ts'), 'export function sample(): number {\n  return 1;\n}\n');
  await writeFile(path.join(dir, 'pixel.png'), PNG);
  await writeFile(path.join(dir, 'doc.pdf'), pdf(token('pdf')));
  await writeFile(
    path.join(dir, 'book.ipynb'),
    JSON.stringify({
      cells: [{ cell_type: 'code', metadata: {}, source: ['print("old")'], outputs: [], execution_count: null }],
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5,
    }),
  );
  await writeFile(path.join(dir, 'mcp-server.cjs'), MCP_SERVER);
  await writeFile(
    path.join(dir, 'mcp.json'),
    JSON.stringify({ mcpServers: { fixture: { command: process.execPath, args: [path.join(dir, 'mcp-server.cjs')] } } }),
  );
  await writeFile(path.join(dir, 'settings.json'), JSON.stringify({ sandbox: { enabled: false } }));
  // EnterWorktree needs a repository with a commit.
  await new Promise((resolve) =>
    spawn('sh', ['-c', 'git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm fixture'], { cwd: dir }).once('close', resolve),
  );
  return dir;
}

async function transcripts(directory: string): Promise<TranscriptEntry[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true }).catch(() => []);
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl') && entry.parentPath.endsWith('subagents'))
    .map((entry) => path.join(entry.parentPath, entry.name));
  const lines = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  return lines.flatMap((source) =>
    source
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as TranscriptEntry),
  );
}

async function run(name: string, task: string, dir: string): Promise<Trial> {
  const prompt = `Use the Agent tool exactly once with subagent_type "deepseek" and run_in_background false. Pass it this task verbatim, then reply with its final answer verbatim and nothing else. Do not do the task yourself.\n\nTask: ${task}`;
  const child = spawn(
    process.execPath,
    [
      '--preload',
      path.join(root, 'tool-tap.cjs'),
      launcher,
      '--',
      '-p',
      prompt,
      '--model',
      'luna',
      '--permission-mode',
      'bypassPermissions',
      '--settings',
      path.join(dir, 'settings.json'),
      '--mcp-config',
      path.join(dir, 'mcp.json'),
      '--setting-sources',
      'project',
      '--output-format',
      'stream-json',
      '--verbose',
      '--debug-file',
      path.join(dir, 'debug.log'),
    ],
    {
      cwd: dir,
      env: isolatedEnvironment({
        HOME: os.homedir(),
        CODEX_HOME: process.env.CODEX_HOME,
        OPENCODE_API_KEY: process.env.OPENCODE_API_KEY,
        CLAUDE_CONFIG_DIR: path.join(dir, 'config'),
        SWITCHBOARD_NATIVE_TRACE: '1',
        DEEPSEEK_TOOL_TAP: path.join(dir, 'tools.jsonl'),
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    },
  );
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  child.stdout.on('data', (data) => (stdout += data));
  child.stderr.on('data', (data) => (stderr += data));
  const timer = setTimeout(() => {
    timedOut = true;
    process.kill(-child.pid!, 'SIGTERM');
  }, 300000);
  const code = await new Promise<number | null>((resolve) => child.once('close', resolve));
  clearTimeout(timer);
  try {
    process.kill(-child.pid!, 'SIGTERM');
  } catch {}
  await writeFile(path.join(dir, 'stdout.jsonl'), stdout);
  await writeFile(path.join(dir, 'stderr.log'), stderr);
  const events = stdout
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line));
  const history = await transcripts(path.join(dir, 'config', 'projects'));
  return {
    name,
    dir,
    stdout,
    stderr,
    code,
    timedOut,
    init: events.find((event) => event.type === 'system' && event.subtype === 'init'),
    blocks: history.flatMap((entry) => (Array.isArray(entry.message?.content) ? entry.message.content : [])),
    subagentModels: [...new Set(history.map((entry) => entry.message?.model).filter((m): m is string => !!m))],
    offered: [
      ...new Set(
        (await readFile(path.join(dir, 'tools.jsonl'), 'utf8').catch(() => ''))
          .split('\n')
          .filter(Boolean)
          .flatMap((line) => JSON.parse(line) as string[]),
      ),
    ].sort(),
    routes: [...stderr.matchAll(/\[native\] (\{[^\r\n]+\})/g)].map((match) => JSON.parse(match[1])),
  };
}

interface Row {
  tool: string;
  verdict: 'works' | 'fails' | 'not offered';
  detail: string;
  dir: string;
}

const snippet = (value: string) => value.replace(/\s+/g, ' ').slice(0, 220);

function judge(item: Case, trial: Trial, proofFailure: string | undefined, results: TranscriptBlock[]): Row {
  const base = { tool: item.tool, dir: trial.dir };
  if (trial.timedOut) {
    return { ...base, verdict: 'fails', detail: 'session timed out' };
  }
  const used = trial.blocks.filter((block) => block.type === 'tool_use' && block.name && item.uses.test(block.name));
  const apiError = trial.blocks.find((block) => block.type === 'text' && /API Error|Native gateway:/.test(String((block as { text?: string }).text)));
  const errors = results.filter((result) => result.is_error);
  if (!used.length && !trial.offered.some((name) => item.uses.test(name))) {
    return { ...base, verdict: 'not offered', detail: 'absent from every deepseek Zen request' };
  }
  if (!used.length) {
    const finalText = snippet(String(trial.stdout.match(/"result":"((?:[^"\\]|\\.)*)"/)?.[1] ?? ''));
    return {
      ...base,
      verdict: apiError ? 'fails' : 'not offered',
      detail: apiError ? snippet(String((apiError as { text?: string }).text)) : `no matching tool call; answer: ${finalText}`,
    };
  }
  if (proofFailure === undefined && !apiError) {
    const calls = [...new Set(used.map((block) => block.name))].join(', ');
    return { ...base, verdict: 'works', detail: `calls: ${calls}${errors.length ? `; ${errors.length} error result(s) recovered` : ''}` };
  }
  const reason = apiError
    ? snippet(String((apiError as { text?: string }).text))
    : errors.length
      ? snippet(text(errors[0]))
      : proofFailure;
  return { ...base, verdict: 'fails', detail: reason ?? 'unknown' };
}

async function pool<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index]);
      }
    }),
  );
  return results;
}

await writeFile(path.join(root, 'tool-tap.cjs'), TOOL_TAP);
const only = values.only?.split(',').map((name) => name.trim());
const selected = CASES.filter((item) => !only || only.includes(item.tool));

const inventoryDir = await prepare('inventory');
const inventory = await run(
  'inventory',
  'List the exact names of every tool you can call right now, and separately every deferred tool name you were told is available through ToolSearch. Plain comma-separated lists, nothing else.',
  inventoryDir,
);
const agents = inventory.init?.agents ?? [];
const zenRoutes = inventory.routes.filter((route) => route.route === 'zen' && route.agentId);
const answer = inventory.blocks.filter((block) => block.type === 'text').map((block) => String((block as { text?: string }).text)).join('\n');

const rows = await pool(selected, Number(values.concurrency), async (item) => {
  const dir = await prepare(item.tool);
  const trial = await run(item.tool, item.task(dir), dir);
  const used = new Set(
    trial.blocks.filter((block) => block.type === 'tool_use' && block.name && item.uses.test(block.name)).map((block) => block.id),
  );
  const results = trial.blocks.filter((block) => block.type === 'tool_result' && used.has(block.tool_use_id));
  const proofFailure = item.proof ? await item.proof(trial, results) : results.every((r) => r.is_error) ? 'every result was an error' : undefined;
  const row = judge(item, trial, proofFailure, results);
  console.log(`${row.verdict.padEnd(11)} ${row.tool}: ${row.detail}`);
  return row;
});

const report = [
  `# deepseek subagent tool matrix`,
  '',
  `Run ${new Date().toISOString()}, nonce ${nonce}, artifacts ${root}. Generated by plugins/switchboard/tests/live/native-deepseek.ts.`,
  '',
  `Agent list in session init: ${agents.join(', ') || '(none)'}. deepseek present: ${agents.includes('deepseek')}.`,
  `Subagent transcript models: ${inventory.subagentModels.join(', ') || '(none)'}. Gateway zen routes with agentId: ${zenRoutes.length}.`,
  '',
  `Tools in deepseek's Zen requests (gateway tap, inventory run): ${inventory.offered.join(', ')}.`,
  '',
  'Deferred tools deepseek reports it was told about (self-report, inventory run):',
  '',
  '```',
  answer.trim() || '(no answer)',
  '```',
  '',
  '| Tool | Verdict | Evidence |',
  '| --- | --- | --- |',
  ...rows.map((row) => `| ${row.tool} | ${row.verdict} | ${row.detail.replaceAll('|', '\\|')} |`),
  '',
].join('\n');
const out = values.out ?? path.join(root, 'matrix.md');
await writeFile(out, report);
console.log(`Matrix: ${out}`);
assert(agents.includes('deepseek'), 'deepseek missing from the session agent list');
assert(zenRoutes.length > 0, 'no deepseek inference reached the zen route');
