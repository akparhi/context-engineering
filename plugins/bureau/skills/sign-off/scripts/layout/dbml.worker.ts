/** Parses one DBML text and posts back `{ dbml }`, or `{ dbml: null, error }`. It runs in a worker because `@dbml/parse` adds a
 *  global message listener when it loads, and that listener keeps a Bun process alive; the caller terminates the worker. */
import { Parser } from "@dbml/core";

self.onmessage = (event: MessageEvent<string>) => {
  try {
    const dbml = Parser.parseDBMLToJSONv2(event.data);
    postMessage({ dbml: JSON.parse(JSON.stringify(dbml, (key, value) => (key === "token" ? undefined : value))) });
  } catch (error) {
    const diag = (error as { diags?: { message: string }[] }).diags?.[0]?.message;
    postMessage({ dbml: null, error: diag ?? String(error) });
  }
};
