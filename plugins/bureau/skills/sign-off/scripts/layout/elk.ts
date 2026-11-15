import ELK from "elkjs/lib/elk-api.js";

export type Point = { x: number; y: number };
export type Box = Point & { width: number; height: number };

// elkjs sees Bun's `self` and expects to run in a web worker, so it gets a real one. Unref'd, it never holds the process open.
export const elk = new ELK({
  workerUrl: Bun.resolveSync("elkjs/lib/elk-worker.min.js", import.meta.dir),
  workerFactory: (url) => {
    const worker = new Worker(url!) as unknown as Bun.Worker; // the DOM lib types the global, and it lacks `unref`
    worker.unref();
    return worker as never;
  },
});
