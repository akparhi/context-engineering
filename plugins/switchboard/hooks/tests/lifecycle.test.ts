import { expect, mock, test } from 'claude-code/testing';

test('turn.step telemetry preserves core model, effort and streamed chunks', async ($, on) => {
  mock.env(on, {});
  on('session.id', () => ({ value: 's' }));
  on('turn.step', async function* (_$, event) {
    expect(event.model).toBe('switchboard/openai/gpt-6-astra');
    expect(event.effort).toBe('high');
    yield { kind: 'text', index: 0, text: 'core response' };
    return {
      turnId: event.turnId,
      index: event.index,
      answer: 'core response',
      toolUses: [],
      stopReason: 'end_turn',
      usage: null,
    };
  });
  const chunks: string[] = [];
  for await (const chunk of $.turn.step({
    turnId: 't',
    index: 0,
    model: 'switchboard/openai/gpt-6-astra',
    effort: 'high',
    messageCount: 1,
  })) {
    if (chunk.kind === 'text') {
      chunks.push(chunk.text);
    }
  }
  expect(chunks).toEqual(['core response']);
});

test('Claude completion does not wait on Switchboard accounting or clear another provider status', async ($, on) => {
  mock.env(on, {
    SWITCHBOARD_GATEWAY_TOKEN: 'secret',
    SWITCHBOARD_MOD_GATEWAY_URL: 'http://127.0.0.1:4000',
  });
  on('session.id', () => ({ value: 's' }));
  const routes: string[] = [];
  on('http.fetch', (_$, event) => {
    routes.push(event.url);
    return { value: { ok: false, status: 503, headers: {}, text: '{}' } };
  });
  let statusChanges = 0;
  on('ui.status', () => {
    statusChanges += 1;
    return { value: undefined };
  });
  on('turn.step', async function* (_$, event) {
    yield { kind: 'text', index: 0, text: 'native answer' };
    return {
      turnId: event.turnId,
      index: 0,
      answer: 'native answer',
      toolUses: [],
      stopReason: 'end_turn',
      usage: null,
    };
  });
  on('turn.complete', (_$, event) => ({ text: event.answer }));
  for await (const _chunk of $.turn.step({
    turnId: 'native-turn',
    index: 0,
    model: 'claude-sonnet-5',
    messageCount: 1,
  })) {
    // Observe the same completed inference step as the engine.
  }
  const result = await $.turn.complete({
    turnId: 'native-turn',
    answer: 'native answer',
    durationMs: 1,
    isAborted: true,
    reason: 'aborted',
  });
  expect(result.text).toBe('native answer');
  expect(
    routes.some((route) => route.endsWith('/usage/complete') || route.endsWith('/compact/cancel')),
  ).toBe(false);
  expect(statusChanges).toBe(0);
});
