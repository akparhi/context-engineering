/**
 * Ambient declarations for the 'claude-code' host API injected at runtime by the Claude binary.
 * All types here are compile-time contracts only — nothing exists at runtime from this file.
 * The host owns all concrete event and surface shapes; we use permissive types at those boundaries.
 */
declare module 'claude-code' {
  /** Surface API passed to ClientModule render functions. Host owns the real element types. */
  interface Surface<State = Record<string, unknown>> {
    // Host owns element constructor shapes; typed as any so JSX-style calls compile.
    elements: Record<string, any>;
    state: State | undefined;
    columns: number;
    rows: number;
    setState(state: State): void;
    post(action: Record<string, unknown>): void;
    onKey(handler: (event: { key: string }) => void): void;
  }

  /** A UI module rendered by the host for a custom pane. */
  type ClientModule<Props = unknown, State = Record<string, unknown>> = (
    props: Props,
    surface: Surface<State>,
  ) => unknown;

  /** Minimal fetch-response shape returned by $.http.fetch. */
  interface GatewayFetchResponse {
    ok: boolean;
    status: number;
    headers: Record<string, string>;
    text: string;
  }

  /** A transcript message a compaction hook may return. Host owns the real shape. */
  type SessionMessage = Record<string, unknown>;

  /** The engine interface injected as $ into every hook handler and test function. */
  interface EngineInterface {
    session: {
      id(): Promise<string>;
      cwd(): Promise<string>;
      model(): Promise<string>;
      // Host-owned event trigger methods used in tests.
      compact(opts: unknown): Promise<any>;
      start(opts: unknown): Promise<any>;
    };
    env: {
      get(name: string): Promise<string | undefined>;
    };
    http: {
      // Host owns the full fetch init shape.
      fetch(url: string, init?: unknown): Promise<GatewayFetchResponse>;
    };
    ui: {
      status(text: string | undefined): Promise<void>;
      open(options: unknown): Promise<unknown>;
      invalidate(event: string): void;
      resolve(event: unknown): { Client: (...args: any[]) => any };
      render(opts: unknown): Promise<any>;
    };
    prompt: {
      submit(opts: unknown): Promise<any>;
    };
    command: {
      register(options: { name: string; description: string; immediate?: boolean }): Promise<void>;
      run(opts: unknown): Promise<any>;
    };
    agent: {
      spawn(options: unknown): Promise<any>;
      offer(options: unknown): Promise<any>;
    };
    turn: {
      step(opts: unknown): AsyncIterable<any>;
      complete(opts: unknown): Promise<any>;
    };
    tool: {
      check(opts: unknown): Promise<any>;
      call(opts: unknown): Promise<any>;
    };
  }

  /**
   * The on() function passed as the first argument to Register.
   * Supports both the 2-arg form on(event, handler) and the 3-arg form
   * on(event, options, handler) used for commands and UI events.
   * Event objects are typed as any because the host owns all concrete shapes.
   */
  type On = {
    // 2-arg: on(eventName, handler)
    (
      event: string,
      handler: ($: EngineInterface, event: any, next: ($: any) => any) => any,
    ): void;
    // 3-arg: on(eventName, options, handler) — used for on('command.run', {command: '...'}, handler)
    (
      event: string,
      options: Record<string, unknown>,
      handler: ($: EngineInterface, event: any, next: ($: any) => any) => any,
    ): void;
  };

  /** Options passed as the second argument to Register. Host owns the real shape. */
  type RegisterOptions = unknown;

  /** The register function signature that hook entry points must export. */
  type Register = (on: On, options: RegisterOptions) => void;
}

/** Testing utilities injected by the Claude Code test runner. */
declare module 'claude-code/testing' {
  import type { EngineInterface } from 'claude-code';

  type TestOn = (event: string, handler: (...args: any[]) => any) => void;

  /** Test function signature used by the claude-code test runner. */
  function test(name: string, fn: ($: EngineInterface, on: TestOn) => Promise<void> | void): void;

  /** Assertion helper from the claude-code test runner. */
  const expect: (value: any) => {
    toBe(expected: any): void;
    toContain(expected: any): void;
    toEqual(expected: any): void;
    toThrow(expected?: any): void;
    toBeDefined(): void;
    toBeUndefined(): void;
    toHaveLength(n: any): void;
    toBeFalsy(): void;
    toBeTruthy(): void;
    toBeNull(): void;
    toBeGreaterThan(n: any): void;
    toMatchObject(obj: any): void;
    not: Record<string, (...args: any[]) => void>;
  };

  /** Mock factory from the claude-code test runner. */
  const mock: {
    fn<T extends (...args: any[]) => any>(impl?: T): T & { calls: any[][] };
    env(on: TestOn, vars: Record<string, any>): void;
  };
}
