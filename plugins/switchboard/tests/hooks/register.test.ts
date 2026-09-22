import { expect, mock, test } from 'claude-code/testing';

test('registers display tools and posts a session snapshot', async ($, on) => {
  mock.env(on, {
    SWITCHBOARD_CURSOR_DISPLAY_TOOLS: '1',
    SWITCHBOARD_GATEWAY_TOKEN: 'test-token',
    SWITCHBOARD_MOD_GATEWAY_URL: 'http://127.0.0.1:4000',
  });
  on('session.start', () => ({ cwd: '/tmp' }));
  const commands: string[] = [];
  on('command.register', (_$, event) => {
    commands.push(event.name);
    return { value: { command: event.name } };
  });
  const requests: string[] = [];
  on('session.id', () => ({ value: 'test-session' }));
  on('session.cwd', () => ({ value: '/tmp' }));
  on('session.model', () => ({ value: 'switchboard/cursor/auto' }));
  const tools: string[] = [];
  on('tool.register', (_$, event) => {
    tools.push(event.name);
    return { value: { tool: `mcp__switchboard__${event.name}` } };
  });
  on('tool.call', () => ({ value: { result: { type: 'text', text: 'stub' } } }));
  on('ui.status', () => ({ value: undefined }));
  on('ui.invalidate', () => ({ value: undefined }));
  on('http.fetch', (_$, event) => {
    requests.push(event.url);
    return {
      value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ accepted: true }) },
    };
  });
  await $.session.start({ cwd: '/tmp', model: 'switchboard/cursor/auto' });
  expect(requests).toContain('http://127.0.0.1:4000/switchboard/mod/session');
  expect(commands).toEqual(['switchboard-usage']);
  expect(tools).toHaveLength(6);
});

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

test('display tool checks allow and calls answer from the streamed block input', async ($, on) => {
  mock.env(on, {
    SWITCHBOARD_CURSOR_DISPLAY_TOOLS: '1',
    SWITCHBOARD_GATEWAY_TOKEN: 'test-token',
    SWITCHBOARD_MOD_GATEWAY_URL: 'http://127.0.0.1:4000',
  });
  on('session.start', () => ({ cwd: '/tmp' }));
  on('command.register', (_$, event) => ({ value: { command: event.name } }));
  on('session.id', () => ({ value: 'call-session' }));
  on('session.cwd', () => ({ value: '/tmp' }));
  on('session.model', () => ({ value: 'switchboard/cursor/auto' }));
  on('tool.register', (_$, event) => ({ value: { tool: `mcp__switchboard__${event.name}` } }));
  let fetches = 0;
  on('http.fetch', () => {
    fetches += 1;
    return {
      value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ accepted: true }) },
    };
  });
  await $.session.start({ cwd: '/tmp', model: 'switchboard/cursor/auto' });
  const before = fetches;
  const check = await $.tool.check({ tool: 'mcp__switchboard__cursor_read' });
  expect(check.decision).toBe('allow');
  const result = await $.tool.call({
    tool: 'mcp__switchboard__cursor_read',
    description: 'README.md',
    toolUseId: 'action',
    output: 'streamed output',
    isError: false,
  } as never);
  expect(result.result.text).toBe('streamed output');
  expect(result.result.is_error).toBe(false);
  expect(fetches).toBe(before);
});
