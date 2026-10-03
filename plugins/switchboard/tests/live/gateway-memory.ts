/**
 * Measures switchboard gateway memory per route and body size. Measurement only.
 * Run: bun tests/live/gateway-memory.ts [--sizes=0.5,2,5,7.5] [--n=20]
 * Each cell runs in a fresh child process (`--child`) so maxRSS is a true per-cell peak
 * and the request generator's memory never pollutes the gateway's numbers.
 */
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { heapStats } from 'bun:jsc';
import { createNativeGateway } from '../../src/gateway/server.ts';

type Route = 'idle' | 'anthropic-tools' | 'anthropic-notools' | 'openai' | 'raw-forward';
const ROUTES: Route[] = ['anthropic-tools', 'anthropic-notools', 'openai', 'raw-forward'];
const TOKEN = 'mem-test';
const MB = 1024 * 1024;

const sse = (events: Array<{ type: string; [k: string]: unknown }>) =>
  events.map((e) => `event: ${e.type}\r\ndata: ${JSON.stringify(e)}\r\n\r\n`).join('');

const anthropicSse = sse([
  { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], usage: { input_tokens: 100, output_tokens: 1 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Reading it now.' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'Read', input: {} } },
  { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"file_path":"/tmp/x"}' } },
  { type: 'content_block_stop', index: 1 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 20 } },
  { type: 'message_stop' },
]);
const openaiSse = sse([
  { type: 'response.created', response: { id: 'resp_1', usage: null } },
  { type: 'response.output_item.added', output_index: 0, item: { type: 'message', content: [] } },
  { type: 'response.output_text.delta', output_index: 0, delta: 'Done' },
  { type: 'response.output_item.done', output_index: 0, item: { type: 'message', content: [{ type: 'output_text', text: 'Done' }] } },
  { type: 'response.completed', response: { id: 'resp_1', usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 40 }, output_tokens: 15 } } },
]);

// ---------- child: runs one gateway and answers stats commands over stdout lines ----------
async function child(route: Route) {
  const fakeFetch = async (url: string) =>
    new Response(url.includes('anthropic.com') ? anthropicSse : openaiSse, {
      headers: { 'content-type': 'text/event-stream' },
    });
  let server: http.Server;
  if (route === 'raw-forward') {
    // Floor: buffer the bytes, hand them upstream, never JSON.parse.
    server = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const raw = Buffer.concat(chunks);
      const up = await fakeFetch('https://api.anthropic.com' + raw.length);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(await up.text());
    });
  } else if (route === 'idle') {
    server = http.createServer();
  } else {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'gwmem-'));
    const authFile = path.join(dir, 'auth.json');
    await writeFile(authFile, JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'x', account_id: 'a' } }));
    server = createNativeGateway({ token: TOKEN, authFile, fetchImpl: fakeFetch as never, guardAuto: true });
  }
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;

  let peakRss = 0;
  let peakHeap = 0;
  const sample = () => {
    const m = process.memoryUsage();
    peakRss = Math.max(peakRss, m.rss);
    peakHeap = Math.max(peakHeap, m.heapUsed);
  };
  const timer = setInterval(sample, 2);
  const snap = () => {
    const m = process.memoryUsage();
    const h = heapStats();
    return { rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal, external: m.external, arrayBuffers: m.arrayBuffers, jscHeap: h.heapSize, jscExtra: h.extraMemorySize };
  };
  sample();
  const idleTypes = heapStats().objectTypeCounts as Record<string, number>;
  const out = (o: unknown) => process.stdout.write(JSON.stringify(o) + '\n');
  out({ ready: port, idle: snap() });
  for await (const line of console) {
    const cmd = String(line).trim();
    if (cmd === 'peak') {
      sample();
      out({ peakRss, peakHeap, maxRSS: process.resourceUsage().maxRSS * 1024, now: snap() });
    } else if (cmd === 'gc') {
      Bun.gc(true);
      await Bun.sleep(100);
      Bun.gc(true);
      const types = heapStats().objectTypeCounts as Record<string, number>;
      const grew = Object.entries(types)
        .map(([k, v]) => [k, v - (idleTypes[k] ?? 0)] as const)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);
      out({ afterGc: snap(), grew });
    } else if (cmd === 'quit') {
      clearInterval(timer);
      process.exit(0);
    }
  }
}

// ---------- attribution children ----------
const snapNow = () => {
  Bun.gc(true);
  const m = process.memoryUsage();
  return { rss: m.rss, heap: m.heapUsed, ab: m.arrayBuffers };
};
const fmt = (a: { rss: number; heap: number; ab: number }) => `rss=${mb(a.rss)} heap=${mb(a.heap)} arrayBuf=${mb(a.ab)}`;

/** Cumulative import cost, in the order launcher -> server pulls them in. */
async function importsChild() {
  const steps: Array<[string, () => Promise<unknown>]> = [
    ['bare bun (nothing imported)', async () => {}],
    ['node:http, node:crypto, node:stream', async () => { await import('node:http'); await import('node:crypto'); await import('node:stream/promises'); }],
    ['yaml', () => import('yaml')],
    ['gateway/tokens.ts', () => import('../../src/gateway/tokens.ts')],
    ['providers/codex/*', async () => { await import('../../src/providers/codex/auth.ts'); await import('../../src/providers/codex/responses.ts'); await import('../../src/providers/codex/models.ts'); await import('../../src/providers/codex/usage.ts'); }],
    ['providers/opencode/*', async () => { await import('../../src/providers/opencode/auth.ts'); await import('../../src/providers/opencode/chat.ts'); await import('../../src/providers/opencode/request.ts'); }],
    ['gateway approval/permission/mode-hook', async () => { await import('../../src/gateway/approval.ts'); await import('../../src/gateway/permission-hook.ts'); await import('../../src/gateway/mode-hook.ts'); }],
    ['gateway mod-* ', async () => { await import('../../src/gateway/mod-bridge.ts'); await import('../../src/gateway/mod-compaction.ts'); await import('../../src/gateway/mod-routes.ts'); }],
    ['gateway/server.ts (rest)', () => import('../../src/gateway/server.ts')],
    ['launcher.ts', () => import('../../src/launcher.ts')],
  ];
  for (const [name, load] of steps) {
    await load();
    console.log(`${name.padEnd(42)} ${fmt(snapNow())}`);
  }
}

/** Step-by-step cost of the request path on one body, replicating readRequest / handlers verbatim. */
async function stagesChild(sizeMb: number, route: string) {
  const { forAnthropic, toResponses } = await import('../../src/providers/codex/responses.ts');
  const { estimateInputTokens } = await import('../../src/gateway/tokens.ts');
  // Parent wrote the body to a file so generator garbage never inflates this process's RSS.
  const file = `${os.tmpdir()}/gwmem-body-${sizeMb}-${route}.json`;
  let payload: Buffer | undefined = Buffer.from(await Bun.file(file).arrayBuffer());
  const chunks: Buffer[] = [];
  for (let o = 0; o < payload.length; o += 65536) chunks.push(Buffer.from(payload.subarray(o, o + 65536)));
  const size = payload.length;
  payload = undefined;
  const rows: Array<[string, ReturnType<typeof snapNow>]> = [];
  const base = snapNow();
  rows.push(['baseline (body chunks held, as network chunks)', base]);
  let peakRss = 0;
  const t = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 1);
  const raw = Buffer.concat(chunks);
  rows.push(['after Buffer.concat (raw)', snapNow()]);
  const text = raw.toString('utf8');
  rows.push(['after raw.toString(utf8)', snapNow()]);
  const parsed = JSON.parse(text) as never;
  rows.push(['after JSON.parse', snapNow()]);
  let cleaned: unknown = parsed;
  if (route !== 'openai') {
    cleaned = forAnthropic(parsed);
    rows.push([`after forAnthropic (same object: ${cleaned === parsed})`, snapNow()]);
    const resent = Buffer.from(JSON.stringify(cleaned));
    rows.push(['hypothetical re-serialize (only if body changed)', snapNow()]);
    void resent;
  } else {
    const request = toResponses(parsed, 'gpt-6-astra');
    rows.push(['after toResponses', snapNow()]);
    const tokens = estimateInputTokens(request);
    rows.push([`after estimateInputTokens (${tokens})`, snapNow()]);
    const out = JSON.stringify(request);
    rows.push([`after JSON.stringify(request) (${mb(out.length)} MB)`, snapNow()]);
  }
  clearInterval(t);
  void cleaned;
  console.log(`# stages route=${route} body=${mb(size)}MB  (heap/rss after gc at each step, MB, cumulative; objects kept alive)`);
  let prev = base;
  for (const [name, a] of rows) {
    console.log(`${name.padEnd(54)} ${fmt(a)}  d_heap=${mb(a.heap - prev.heap)} d_ab=${mb(a.ab - prev.ab)} d_rss=${mb(a.rss - prev.rss)}`);
    prev = a;
  }
}

// ---------- parent: body generation and orchestration ----------
function lorem(n: number, seed: number) {
  const words = ['function', 'return', 'const', 'import', 'export', 'await', 'error', 'result', 'value', 'path', 'string', 'number', 'config', 'server', 'client', 'request'];
  let s = '';
  let x = seed;
  while (s.length < n) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    s += words[x % words.length] + (x % 7 === 0 ? '\n' : ' ');
  }
  return s.slice(0, n);
}

function makeBody(targetBytes: number, model: string, withTools: boolean) {
  const tools = withTools
    ? Array.from({ length: 40 }, (_, i) => ({
        name: i === 0 ? 'Read' : `Tool${i}`,
        description: lorem(2000, i),
        input_schema: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'number' } }, required: ['a'] },
      }))
    : undefined;
  const base: Record<string, unknown> = {
    model,
    max_tokens: 8192,
    stream: true,
    system: [{ type: 'text', text: lorem(20000, 99), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: 'start' }] as unknown[],
    ...(tools ? { tools } : {}),
  };
  const messages = base.messages as unknown[];
  let i = 0;
  // Fixed-size ~8 KB tool results model file reads; real histories are mostly these.
  while (Buffer.byteLength(JSON.stringify(base)) < targetBytes) {
    messages.push({ role: 'assistant', content: [{ type: 'text', text: lorem(600, i) }, { type: 'tool_use', id: `toolu_${i}`, name: 'Read', input: { file_path: `/src/file${i}.ts` } }] });
    messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: `toolu_${i}`, content: lorem(8000, i + 1000) }] });
    i++;
  }
  messages.push({ role: 'user', content: 'continue' });
  return Buffer.from(JSON.stringify(base));
}

const mb = (n: number) => +(n / MB).toFixed(1);

async function runCell(route: Route, sizeMb: number | null, n: number) {
  const proc = Bun.spawn(['bun', import.meta.path, '--child', route], { stdout: 'pipe', stdin: 'pipe', stderr: 'inherit' });
  const reader = proc.stdout.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const read = async () => {
    while (!buf.includes('\n')) {
      const { value, done } = await reader.read();
      if (done) throw new Error('child exited');
      buf += dec.decode(value);
    }
    const i = buf.indexOf('\n');
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    return JSON.parse(line);
  };
  const send = (c: string) => {
    proc.stdin.write(c + '\n');
    proc.stdin.flush();
  };
  const ready = await read();
  let result: Record<string, unknown> = { route, sizeMb, idleRss: mb(ready.idle.rss) };
  if (sizeMb !== null) {
    const payload = makeBody(sizeMb * MB, route === 'openai' ? 'astra' : 'claude-opus-5-5', route !== 'anthropic-notools');
    for (let k = 0; k < n; k++) {
      const r = await fetch(`http://127.0.0.1:${ready.ready}/v1/messages?beta=true`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-switchboard-gateway-token': TOKEN, 'x-api-key': 'k', 'anthropic-version': '2023-06-01' },
        body: payload,
      });
      await r.text();
      if (!r.ok && k === 0) throw new Error(`${route} ${sizeMb}MB -> HTTP ${r.status}: ${await r.text()}`);
    }
    send('peak');
    const p = await read();
    send('gc');
    const gcOut = await read();
    const g = gcOut.afterGc;
    result = {
      ...result,
      bodyMb: mb(payload.length),
      rssPeak: mb(p.peakRss),
      maxRSS: mb(p.maxRSS),
      heapUsedPeak: mb(p.peakHeap),
      rssAfterGc: mb(g.rss),
      heapUsedAfterGc: mb(g.heapUsed),
      jscHeapAfterGc: mb(g.jscHeap),
      extraAfterGc: mb(g.jscExtra),
      objectsGrewVsIdle: gcOut.grew.map(([k, v]: [string, number]) => `${k}:${v}`).join(' '),
    };
  }
  send('quit');
  await proc.exited;
  return result;
}

async function main() {
  const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
  const sizes = arg('sizes', '0.5,2,5,7.5').split(',').map(Number);
  const n = Number(arg('n', '20'));
  console.log(`sizes(MB)=${sizes} n=${n} bun=${Bun.version}`);
  console.log(JSON.stringify(await runCell('idle', null, n)));
  for (const size of sizes) {
    for (const route of ROUTES) {
      console.log(JSON.stringify(await runCell(route, size, n)));
    }
  }
}

const ci = process.argv.indexOf('--child');
const ai = process.argv.indexOf('--attr');
if (ai >= 0) {
  // Parent: spawn one fresh child per attribution run so allocator state never carries over.
  const run = async (...a: string[]) => { const p = Bun.spawn(['bun', import.meta.path, ...a], { stdout: 'inherit', stderr: 'inherit' }); await p.exited; };
  console.log('# import cost (cumulative, after gc)');
  await run('--attr-imports');
  const sizes = (process.argv.find((a) => a.startsWith('--sizes='))?.split('=')[1] ?? '0.5,2,5,7.5').split(',');
  const stages: Array<[string, string]> = [...sizes.map((s) => [s, 'anthropic'] as [string, string]), [sizes[0], 'openai'], [sizes[sizes.length - 1], 'openai']];
  for (const [size, route] of stages) {
    await Bun.write(`${os.tmpdir()}/gwmem-body-${size}-${route}.json`, makeBody(Number(size) * MB, route === 'openai' ? 'astra' : 'claude-opus-5-5', true));
    await run('--attr-stages', size, route);
  }
} else if (process.argv.includes('--attr-imports')) await importsChild();
else if (process.argv.includes('--attr-stages')) {
  const i = process.argv.indexOf('--attr-stages');
  await stagesChild(Number(process.argv[i + 1]), process.argv[i + 2]);
} else if (ci >= 0) await child(process.argv[ci + 1] as Route);
else await main();
