import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  readZenKey,
  validateZenKey,
  ZenAuthError,
  zenAuthFile,
} from '../src/providers/opencode/auth.ts';
import { removeTemporary } from './temporary.ts';

function hostAuthOptions(dataHome: string) {
  const env: NodeJS.ProcessEnv = { OPENCODE_API_KEY: undefined };
  if (process.platform === 'win32') {
    env.LOCALAPPDATA = dataHome;
  } else {
    env.XDG_DATA_HOME = dataHome;
  }
  return { platform: process.platform, env };
}

async function withEnvironment(
  values: Record<string, string | undefined>,
  run: () => Promise<void>,
): Promise<void> {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('Zen auth resolves Unix and Windows OpenCode data roots with explicit overrides', () => {
  assert.equal(
    zenAuthFile({ platform: 'linux', homedir: '/home/test', env: {} }),
    '/home/test/.local/share/opencode/auth.json',
  );
  assert.equal(
    zenAuthFile({
      platform: 'darwin',
      homedir: '/Users/test',
      env: { XDG_DATA_HOME: '/custom/data' },
    }),
    '/custom/data/opencode/auth.json',
  );
  assert.equal(
    zenAuthFile({
      platform: 'win32',
      homedir: 'C:\\Users\\test',
      env: { LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local' },
    }),
    'C:\\Users\\test\\AppData\\Local\\opencode\\auth.json',
  );
  assert.equal(
    zenAuthFile({
      platform: 'win32',
      homedir: 'C:\\Users\\test',
      env: { OPENCODE_AUTH_FILE: 'D:\\auth.json' },
    }),
    'D:\\auth.json',
  );
});

test('Zen auth prefers an explicit API key without exposing its value', async () => {
  await withEnvironment(
    { OPENCODE_API_KEY: 'fixture-key', XDG_DATA_HOME: '/missing' },
    async () => {
      assert.equal(await readZenKey(), 'fixture-key');
    },
  );
});

test('Zen key validation rejects whitespace, controls, and non-ASCII without echoing input', async () => {
  for (const value of ['', 'fixture key', 'fixture\nkey', 'fixture\tkey', 'clé']) {
    assert.throws(
      () => validateZenKey(value),
      (error: unknown) => error instanceof ZenAuthError,
    );
  }
  assert.throws(
    () => validateZenKey('fixture\nSECRET_INVALID_KEY'),
    (error: unknown) =>
      error instanceof ZenAuthError && !error.message.includes('SECRET_INVALID_KEY'),
  );
  assert.equal(validateZenKey('visible-ASCII_fixture.key'), 'visible-ASCII_fixture.key');
});

test('an explicit Zen env key prevents reading saved auth', async (t) => {
  const dataHome = await mkdtemp(path.join(os.tmpdir(), 'zen-auth-test-'));
  t.after(() => removeTemporary(dataHome));
  const directory = path.join(dataHome, 'opencode');
  await mkdir(directory);
  await writeFile(path.join(directory, 'auth.json'), '{malformed');
  await withEnvironment(
    { OPENCODE_API_KEY: 'env-fixture-key', XDG_DATA_HOME: dataHome },
    async () => {
      assert.equal(await readZenKey(), 'env-fixture-key');
    },
  );
});

test('Zen auth reads only the official OpenCode API entry', async (t) => {
  const dataHome = await mkdtemp(path.join(os.tmpdir(), 'zen-auth-test-'));
  t.after(() => removeTemporary(dataHome));
  const directory = path.join(dataHome, 'opencode');
  await mkdir(directory);
  await writeFile(
    path.join(directory, 'auth.json'),
    JSON.stringify({ opencode: { type: 'api', key: 'saved-fixture-key' } }),
  );
  const options = hostAuthOptions(dataHome);
  await withEnvironment(options.env, async () => {
    assert.equal(await readZenKey(options), 'saved-fixture-key');
  });
});

test('Zen auth treats missing credentials as optional and rejects malformed explicit config', async (t) => {
  const dataHome = await mkdtemp(path.join(os.tmpdir(), 'zen-auth-test-'));
  t.after(() => removeTemporary(dataHome));
  const options = hostAuthOptions(dataHome);
  await withEnvironment(options.env, async () => {
    const environmentOptions = { platform: options.platform, env: process.env };
    assert.equal(await readZenKey(environmentOptions), undefined);
    for (const value of [' ', 'fixture key', 'fixture\nkey']) {
      process.env.OPENCODE_API_KEY = value;
      await assert.rejects(readZenKey(environmentOptions), (error: unknown) => {
        assert(error instanceof ZenAuthError);
        return true;
      });
    }
  });
});

test('Zen auth rejects malformed saved credentials without including secrets', async (t) => {
  const dataHome = await mkdtemp(path.join(os.tmpdir(), 'zen-auth-test-'));
  t.after(() => removeTemporary(dataHome));
  const directory = path.join(dataHome, 'opencode');
  await mkdir(directory);
  await writeFile(path.join(directory, 'auth.json'), '{"opencode":{"type":"api"}}');
  const options = hostAuthOptions(dataHome);
  await withEnvironment(options.env, async () => {
    await assert.rejects(
      readZenKey(options),
      (error: unknown) => error instanceof ZenAuthError && !error.message.includes('SECRET'),
    );
  });
});
