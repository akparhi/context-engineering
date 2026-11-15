import { runBuild, USAGE as BUILD_USAGE } from "./build.ts";
import { runCheck, USAGE as CHECK_USAGE } from "./check.ts";
import { runIngest, runRecord, runRevise, runStatus, USAGE as REVIEW_USAGE } from "./review.ts";
import { runSelftest } from "./selftest.ts";
import { runOpen, runStop, STOP_USAGE, USAGE as OPEN_USAGE } from "./serve.ts";

/** Each command takes the arguments after its name, prints its own usage line on bad arguments, and returns the exit code. */
const COMMANDS: Record<string, (args: string[]) => Promise<number>> = {
  check: (args) => (args[0] === "--selftest" ? runSelftest(args.slice(1)) : runCheck(args)),
  ingest: runIngest,
  status: runStatus,
  record: runRecord,
  revise: runRevise,
  open: runOpen,
  stop: runStop,
  build: runBuild,
};
const USAGE = [CHECK_USAGE, REVIEW_USAGE.ingest, REVIEW_USAGE.status, REVIEW_USAGE.record, REVIEW_USAGE.revise, OPEN_USAGE, STOP_USAGE, BUILD_USAGE].join("\n");

export async function main([command, ...args]: string[]): Promise<number> {
  const run = command === undefined ? undefined : COMMANDS[command];
  if (run) return run(args);
  console.error(USAGE);
  return 2;
}
