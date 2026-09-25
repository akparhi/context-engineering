import { expect, test } from 'claude-code/testing';
import { register } from '../workers.ts';

test('registers the worker admission hook', () => {
  expect(typeof register).toBe('function');
});

test('agent.offer hides an unsupported worker before dispatch', async ($, on) => {
  on('env.get', (_$, event) => ({
    value: event.name === 'SWITCHBOARD_GATEWAY_TOKEN' ? 'token' : 'http://127.0.0.1:4000',
  }));
  on('session.id', () => ({ value: 's' }));
  on('session.cwd', () => ({ value: '/workspace' }));
  on('session.model', () => ({ value: 'claude-sonnet-5' }));
  on('http.fetch', () => ({
    value: {
      ok: true,
      status: 200,
      headers: {},
      text: '{"execution":"harness","isOffered":false}',
    },
  }));
  on('agent.offer', () => ({ isOffered: true }));
  const result = await $.agent.offer({
    agent: 'unknown',
    description: 'unknown',
    source: 'plugin',
    provider: { plugin: 'engine', tier: 'core' },
  });
  expect(result.isOffered).toBe(false);
});

test('agent.offer preserves a known catalog worker', async ($, on) => {
  on('env.get', (_$, event) => ({
    value: event.name === 'SWITCHBOARD_GATEWAY_TOKEN' ? 'token' : 'http://127.0.0.1:4000',
  }));
  on('session.id', () => ({ value: 's' }));
  on('session.cwd', () => ({ value: '/workspace' }));
  on('session.model', () => ({ value: 'claude-sonnet-5' }));
  on('http.fetch', () => ({
    value: { ok: true, status: 200, headers: {}, text: '{"execution":"claude","isOffered":false}' },
  }));
  on('agent.offer', () => ({ isOffered: true }));
  const result = await $.agent.offer({
    agent: 'cursor',
    description: 'known',
    source: 'plugin',
    provider: { plugin: 'engine', tier: 'core' },
  });
  expect(result.isOffered).toBe(true);
});

test('harness spawn remains dormant when gateway is not configured', async ($, on) => {
  on('env.get', () => ({ value: undefined }));
  let started = false;
  on('agent.spawn', () => {
    started = true;
    return { model: 'switchboard/cursor/auto', agentId: 'worker' };
  });
  const result = await $.agent.spawn({
    prompt: 'task',
    subagentType: 'cursor-auto',
    model: 'switchboard/cursor/auto',
  });
  expect(result.agentId).toBe('worker');
  expect(started).toBe(true);
});

test('Claude-loop spawn proceeds when gateway is not configured', async ($, on) => {
  on('env.get', () => ({ value: undefined }));
  on('agent.spawn', () => ({ model: 'switchboard/openai/gpt-6-luna', agentId: 'worker' }));
  const result = await $.agent.spawn({
    prompt: 'task',
    subagentType: 'luna',
    model: 'switchboard/openai/gpt-6-luna',
  });
  expect(result.agentId).toBe('worker');
});

for (const model of ['switchboard/openai/gpt-6-luna']) {
  test(`${model} spawn survives an active gateway outage`, async ($, on) => {
    on('env.get', () => ({ value: 'configured' }));
    on('session.id', () => ({ value: 's' }));
    on('session.cwd', () => ({ value: '/workspace' }));
    on('http.fetch', () => ({ value: { ok: false, status: 503, headers: {}, text: '' } }));
    on('agent.spawn', () => ({ model, agentId: 'worker' }));
    const result = await $.agent.spawn({ prompt: 'task', subagentType: 'direct', model });
    expect(result.agentId).toBe('worker');
  });
}

test('known catalog harness with omitted event model is admitted through worker-model', async ($, on) => {
  on('env.get', () => ({ value: 'configured' }));
  on('session.id', () => ({ value: 's' }));
  on('session.cwd', () => ({ value: '/workspace' }));
  on('http.fetch', (_$, event) => {
    if (event.url.endsWith('/switchboard/mod/worker-model')) {
      return {
        value: {
          ok: true,
          status: 200,
          headers: {},
          text: '{"known":true,"execution":"harness","model":"switchboard/cursor/auto"}',
        },
      };
    }
    if (event.url.endsWith('/switchboard/mod/mode?sessionId=s')) {
      return { value: { ok: true, status: 200, headers: {}, text: '{"generation":4}' } };
    }
    return { value: { ok: true, status: 200, headers: {}, text: '{"accepted":true}' } };
  });
  on('agent.spawn', () => ({ model: 'switchboard/cursor/auto', agentId: 'worker' }));
  const result = await $.agent.spawn({ prompt: 'task', subagentType: 'cursor-auto' });
  expect(result.agentId).toBe('worker');
});

test('an unclassified refused offer remains available for the engine to decide', async ($, on) => {
  on('env.get', () => ({ value: 'configured' }));
  on('session.id', () => ({ value: 's' }));
  on('session.cwd', () => ({ value: '/workspace' }));
  on('session.model', () => ({ value: 'claude-sonnet-5' }));
  on('http.fetch', () => ({
    value: { ok: false, status: 400, headers: {}, text: '{"isOffered":true}' },
  }));
  on('agent.offer', () => ({ isOffered: true }));
  const result = await $.agent.offer({
    agent: 'unknown',
    description: 'unknown',
    source: 'plugin',
    provider: { plugin: 'engine', tier: 'core' },
  });
  expect(result.isOffered).toBe(true);
});
