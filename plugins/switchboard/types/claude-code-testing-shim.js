/**
 * Runtime shim for claude-code/testing — wraps Bun's native test runner with a
 * minimal EngineInterface so hook tests can run offline without the Claude host.
 * Full fidelity requires the live host; this covers the structural surface only.
 */
import { test as bunTest, expect } from 'bun:test';

function makeEngine(_on) {
  const handlers = new Map();
  const addHandler = (event, handler) => {
    if (!handlers.has(event)) handlers.set(event, []);
    handlers.get(event).push(handler);
  };

  const dispatch = async (event, payload) => {
    const list = handlers.get(event) ?? [];
    let result = payload;
    for (const fn of list) {
      const next = (v) => { result = v; return result; };
      const r = await fn(engine, result ?? payload, next);
      if (r !== undefined) result = r;
    }
    return result;
  };

  const $ = {
    session: {
      id: () => Promise.resolve('stub-session'),
      cwd: () => Promise.resolve('/tmp'),
      model: () => Promise.resolve('claude-sonnet-5'),
      compact: (opts) => dispatch('session.compact', opts),
      start: (opts) => dispatch('session.start', opts),
    },
    env: { get: (name) => Promise.resolve(process.env[name]) },
    http: { fetch: (url, init) => fetch(url, init) },
    ui: {
      status: () => Promise.resolve(),
      open: () => Promise.resolve({}),
      invalidate: () => {},
      resolve: () => ({ Client: () => {} }),
      render: () => Promise.resolve({}),
    },
    command: {
      register: () => Promise.resolve(),
      run: (opts) => dispatch('command.run', opts),
    },
    agent: {
      spawn: (opts) => dispatch('agent.spawn', opts),
      offer: (opts) => dispatch('agent.offer', opts),
    },
    turn: {
      step: async function* (opts) {
        const result = await dispatch('turn.step', opts);
        if (result && typeof result[Symbol.asyncIterator] === 'function') {
          yield* result;
        }
      },
      complete: (opts) => dispatch('turn.complete', opts),
    },
    tool: {
      check: (opts) => dispatch('tool.check', opts),
      call: (opts) => dispatch('tool.call', opts),
    },
    prompt: { submit: (opts) => dispatch('prompt.submit', opts) },
  };

  const engine = $;

  const onFn = (event, optionsOrHandler, handler) => {
    if (typeof optionsOrHandler === 'function') {
      addHandler(event, optionsOrHandler);
    } else if (typeof handler === 'function') {
      addHandler(event, handler);
    }
  };

  return { engine, on: onFn, dispatch };
}

function test(name, fn) {
  bunTest(name, async () => {
    const { engine, on } = makeEngine();
    await fn(engine, on);
  });
}

const mock = {
  fn: (impl) => {
    const calls = [];
    const wrapped = (...args) => {
      calls.push(args);
      return impl ? impl(...args) : undefined;
    };
    wrapped.calls = calls;
    return wrapped;
  },
  env: (on, vars) => {
    on('env.get', ($, event, next) => {
      if (Object.hasOwn(vars, event.name)) return { value: vars[event.name] };
      return next(event);
    });
  },
};

export { test, expect, mock };
