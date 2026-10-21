#!/usr/bin/env bun
/**
 * Generate or edit an image with OpenAI's hosted image tool, through the Codex ChatGPT login.
 *
 *   bun generate.ts "<prompt>" --out <file.png|.jpg|.webp> [--image <input>]... [--size 1024x1024|1536x1024|1024x1536|auto]
 *                   [--quality low|medium|high|auto] [--background opaque|transparent|auto] [--force] [--model gpt-6-luna]
 *
 * Prints the saved path, the delivered size and quality, and the model's revised prompt. Exits 1 with a one-line reason on failure.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';

const ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses';
const AUTH_FILE = path.join(process.env.CODEX_HOME || path.join(homedir(), '.codex'), 'auth.json');
const MEDIA_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const OUTPUT_FORMATS: Record<string, string> = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp' };
const CHOICES = {
  size: ['1024x1024', '1536x1024', '1024x1536', 'auto'],
  quality: ['low', 'medium', 'high', 'auto'],
  background: ['opaque', 'transparent', 'auto'],
};
const USAGE = 'Usage: generate.ts "<prompt>" --out <file.png|.jpg|.webp> [--image <input>]... (prompts starting with - go after --)';
const TIMEOUT_MS = 240000;

class Failure extends Error {}
const renewalFailure = () => new Failure('Codex could not renew the ChatGPT login. Run codex login and retry.');

interface Auth {
  authorization: string;
  'chatgpt-account-id': string;
}

function savedAuth(): { headers: Auth; canRefresh: boolean; expires: number } {
  let auth: any;
  try {
    auth = JSON.parse(readFileSync(AUTH_FILE, 'utf8'));
  } catch {
    throw new Failure('Cannot read Codex auth.json. Sign in with codex login first.');
  }
  const tokens = auth?.tokens;
  if (auth?.auth_mode !== 'chatgpt' || typeof tokens?.access_token !== 'string' || typeof tokens?.account_id !== 'string') {
    throw new Failure('Image generation requires a Codex ChatGPT login in auth.json. Run codex login.');
  }
  let expires = Infinity;
  try {
    expires = JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64url').toString()).exp * 1000;
  } catch {}
  return {
    headers: { authorization: `Bearer ${tokens.access_token}`, 'chatgpt-account-id': tokens.account_id },
    canRefresh: typeof tokens.refresh_token === 'string' && tokens.refresh_token.length > 0,
    expires,
  };
}

/** Codex owns the refresh token; ask its app-server to rotate it rather than refreshing it ourselves. */
async function renew(rejected: Auth): Promise<Auth> {
  if (savedAuth().headers.authorization === rejected.authorization) {
    const child = spawn('codex', ['app-server', '-c', 'cli_auth_credentials_store="file"'], {
      env: { ...process.env, CODEX_HOME: path.dirname(AUTH_FILE) },
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 30000,
    });
    const lines = createInterface({ input: child.stdout });
    const send = (value: unknown) => child.stdin.write(`${JSON.stringify(value)}\n`);
    child.on('error', () => lines.close());
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'image_gen_skill', version: '0.1.0' } } });
    let renewed = false;
    try {
      for await (const line of lines) {
        const message = JSON.parse(line);
        if (message.error) break;
        if (message.id === 1) {
          send({ method: 'initialized' });
          send({ id: 2, method: 'account/read', params: { refreshToken: true } });
        } else if (message.id === 2) {
          renewed = message.result?.account?.type === 'chatgpt';
          break;
        }
      }
    } catch {
      // RPC output may contain account details; never surface it.
    } finally {
      lines.close();
      child.kill('SIGKILL');
    }
    if (!renewed) throw renewalFailure();
  }
  const fresh = savedAuth().headers;
  if (fresh['chatgpt-account-id'] !== rejected['chatgpt-account-id']) {
    throw new Failure('Codex account changed during renewal. Retry in the intended account.');
  }
  if (fresh.authorization === rejected.authorization) throw renewalFailure();
  return fresh;
}

/** Retry once on an authentication rejection, never on an accepted stream. */
async function codexRequest(body: unknown): Promise<Response> {
  const saved = savedAuth();
  let headers = saved.canRefresh && saved.expires <= Date.now() + 60000 ? await renew(saved.headers) : saved.headers;
  const send = () =>
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { ...headers, originator: 'codex_cli_rs', 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  const response = await send();
  if (response.status !== 401 || !savedAuth().canRefresh) return response;
  await response.body?.cancel();
  headers = await renew(headers);
  return send();
}

function inputImage(file: string) {
  const type = MEDIA_TYPES[path.extname(file).toLowerCase()];
  if (!type) throw new Failure(`Unsupported input image type: ${file} (png, jpg, webp)`);
  let data: Buffer;
  try {
    data = readFileSync(file);
  } catch {
    throw new Failure(`Cannot read input image: ${file}`);
  }
  return { type: 'input_image', image_url: `data:${type};base64,${data.toString('base64')}` };
}

function options() {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        out: { type: 'string', short: 'o' },
        image: { type: 'string', short: 'i', multiple: true },
        size: { type: 'string', default: 'auto' },
        quality: { type: 'string', default: 'auto' },
        background: { type: 'string', default: 'opaque' },
        force: { type: 'boolean', default: false },
        model: { type: 'string', default: 'gpt-6-luna' },
      },
    });
  } catch (error) {
    throw new Failure(`${(error as Error).message.split('.')[0]}. ${USAGE}`);
  }
  const { values, positionals } = parsed;
  const prompt = positionals.join(' ').trim();
  if (!prompt) throw new Failure(`Missing prompt. ${USAGE}`);
  if (!values.out) throw new Failure(`Missing --out. ${USAGE}`);
  for (const [name, allowed] of Object.entries(CHOICES)) {
    const value = values[name as keyof typeof CHOICES];
    if (!allowed.includes(value)) throw new Failure(`--${name} must be one of ${allowed.join(', ')} (got ${value})`);
  }
  const out = path.resolve(values.out);
  const format = OUTPUT_FORMATS[path.extname(out).toLowerCase()];
  if (!format) throw new Failure(`--out must end in .png, .jpg or .webp: ${values.out}`);
  if (format === 'jpeg' && values.background === 'transparent') throw new Failure('JPEG cannot be transparent; use a .png or .webp --out');
  const inputs = (values.image ?? []).map((file) => path.resolve(file));
  const existing = existsSync(out) ? statSync(out) : undefined;
  const isSameFileAsOut = (file: string) =>
    file === out || (existing !== undefined && existsSync(file) && statSync(file).ino === existing.ino && statSync(file).dev === existing.dev);
  if (inputs.some(isSameFileAsOut)) throw new Failure(`--out would overwrite input image ${values.out}; pick a new file name`);
  if (existing?.isDirectory()) throw new Failure(`--out is a directory: ${values.out}`);
  if (existing && !values.force) throw new Failure(`${values.out} exists; pick a new name or pass --force`);
  return { ...values, prompt, out, format, inputs };
}

async function main() {
  const opts = options();
  const images = opts.inputs.map(inputImage);
  // The backend lets the model pick size per call and ignores the tool's size field, so ask for it in words too.
  const sizeHint = opts.size === 'auto' ? '' : ` Generate the image at exactly ${opts.size} pixels.`;

  const response = await codexRequest({
    model: opts.model,
    instructions: `Always call the image_generation tool exactly once to fulfil the request. Edit the supplied images when there are any.${sizeHint}`,
    input: [{ role: 'user', content: [{ type: 'input_text', text: opts.prompt }, ...images] }],
    tools: [{ type: 'image_generation', size: opts.size, quality: opts.quality, background: opts.background, output_format: opts.format }],
    tool_choice: { type: 'image_generation' },
    store: false,
    stream: true,
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 300);
    throw new Failure(`OpenAI rejected the request (${response.status}): ${detail}`);
  }

  let item: { result: string; size?: string; quality?: string; background?: string; revised_prompt?: string } | undefined;
  let failure = '';
  let text = '';
  for (const line of (await response.text()).split('\n')) {
    if (!line.startsWith('data: ')) continue;
    let event;
    try {
      event = JSON.parse(line.slice(6));
    } catch {
      continue; // `[DONE]` sentinels and truncated lines carry nothing we need.
    }
    if (event.type === 'response.output_item.done' && event.item?.type === 'image_generation_call' && event.item.result) {
      item = event.item;
    } else if (event.type === 'response.output_text.delta') {
      text += event.delta ?? '';
    } else if (event.type === 'response.failed' || event.type === 'error') {
      failure = event.response?.error?.message ?? event.message ?? 'unknown error';
    }
  }
  if (!item) {
    const reason = failure || text.replace(/\s+/g, ' ').trim().slice(0, 300) || 'no reason given; usually transient, retry once';
    throw new Failure(`No image returned: ${reason}`);
  }
  mkdirSync(path.dirname(opts.out), { recursive: true });
  try {
    writeFileSync(opts.out, Buffer.from(item.result, 'base64'), { flag: opts.force ? 'w' : 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Failure(`${opts.out} was created while generating; pick a new name or pass --force`);
    throw error;
  }
  console.log(opts.out);
  console.log(`size: ${item.size ?? 'unknown'} quality: ${item.quality ?? 'unknown'} background: ${item.background ?? 'unknown'}`);
  if (opts.size !== 'auto' && item.size && item.size !== opts.size) console.error(`warning: asked for ${opts.size}, got ${item.size}`);
  if (item.revised_prompt) console.log(`revised prompt: ${item.revised_prompt.replace(/\s+/g, ' ')}`);
}

main().catch((error) => {
  const message =
    error instanceof Failure
      ? error.message
      : error?.name === 'TimeoutError'
        ? `Timed out after ${TIMEOUT_MS / 1000}s waiting for the image; retry once`
        : `Image generation failed: ${error?.message ?? error}`;
  console.error(message);
  process.exit(1);
});
