#!/usr/bin/env bun
/**
 * Generate or edit an image with OpenAI's hosted image tool, through the Codex ChatGPT login.
 *
 *   bun generate.ts "<prompt>" --out <file.png> [--image <input>]... [--size 1024x1024|1536x1024|1024x1536|auto]
 *                   [--quality low|medium|high|auto] [--model gpt-6-luna]
 *
 * Prints the saved path and the model's revised prompt. Exits 1 with a one-line reason on failure.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';

const ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses';
const AUTH_FILE = path.join(process.env.CODEX_HOME || path.join(homedir(), '.codex'), 'auth.json');
const MEDIA_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

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

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      image: { type: 'string', short: 'i', multiple: true },
      size: { type: 'string', default: 'auto' },
      quality: { type: 'string', default: 'auto' },
      model: { type: 'string', default: 'gpt-6-luna' },
    },
  });
  const prompt = positionals.join(' ').trim();
  if (!prompt || !values.out) throw new Failure('Usage: generate.ts "<prompt>" --out <file.png> [--image <input>]...');
  const out = path.resolve(values.out);
  const images = (values.image ?? []).map(inputImage);

  const response = await codexRequest({
    model: values.model,
    instructions: 'Always call the image_generation tool exactly once to fulfil the request. Edit the supplied images when there are any.',
    input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }, ...images] }],
    tools: [{ type: 'image_generation', size: values.size, quality: values.quality, background: 'opaque', output_format: 'png' }],
    tool_choice: { type: 'image_generation' },
    store: false,
    stream: true,
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 300);
    throw new Failure(`OpenAI rejected the request (${response.status}): ${detail}`);
  }

  let result: string | undefined;
  let revised = '';
  let failure = '';
  for (const line of (await response.text()).split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const event = JSON.parse(line.slice(6));
    if (event.type === 'response.output_item.done' && event.item?.type === 'image_generation_call') {
      result = event.item.result ?? result;
      revised = event.item.revised_prompt ?? revised;
    } else if (event.type === 'response.failed' || event.type === 'error') {
      failure = event.response?.error?.message ?? event.message ?? 'unknown error';
    }
  }
  if (!result) throw new Failure(`No image returned${failure ? `: ${failure}` : ''}`);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(result, 'base64'));
  console.log(out);
  if (revised) console.log(`revised prompt: ${revised}`);
}

main().catch((error) => {
  console.error(error instanceof Failure ? error.message : `Image generation failed: ${error?.message ?? error}`);
  process.exit(1);
});
