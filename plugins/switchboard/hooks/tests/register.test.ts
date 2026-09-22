import { expect, mock, test } from 'claude-code/testing';

test('active sessions without Cursor register no display tool schemas', async ($, on) => {
  mock.env(on, {
    SWITCHBOARD_GATEWAY_TOKEN: 'test-token',
    SWITCHBOARD_MOD_GATEWAY_URL: 'http://127.0.0.1:4000',
    SWITCHBOARD_CURSOR_DISPLAY_TOOLS: '0',
  });
  on('session.start', () => ({ cwd: '/tmp' }));
  on('command.register', (_$, event) => ({ value: { command: event.name } }));
  on('session.id', () => ({ value: 'native-session' }));
  on('session.cwd', () => ({ value: '/tmp' }));
  on('session.model', () => ({ value: 'claude-sonnet' }));
  const tools: string[] = [];
  on('tool.register', (_$, event) => {
    tools.push(event.name);
    return { value: { tool: `mcp__switchboard__${event.name}` } };
  });
  on('http.fetch', () => ({
    value: { status: 200, ok: true, headers: {}, text: '{"accepted":true}' },
  }));
  await $.session.start({ cwd: '/tmp', model: 'claude-sonnet' });
  expect(tools).toEqual([]);
});

test('mod is dormant without launcher environment', async ($, on) => {
  mock.env(on, {});
  on('session.start', () => ({ cwd: '/tmp' }));
  on('command.register', (_$, event) => ({ value: { command: event.name } }));
  on('session.id', () => ({ value: 'inactive-session' }));
  on('session.cwd', () => ({ value: '/tmp' }));
  on('session.model', () => ({ value: 'claude-sonnet' }));
  let fetches = 0;
  on('http.fetch', () => {
    fetches += 1;
    return { value: { status: 200, ok: true, headers: {}, text: '{}' } };
  });
  await $.session.start({ cwd: '/tmp', model: 'claude-sonnet' });
  expect(fetches).toBe(0);
});
