import { runCheck, USAGE as CHECK_USAGE } from "./check.ts";

const COMMANDS: Record<string, { run: (args: string[]) => Promise<number>; usage: string }> = {
  check: { run: runCheck, usage: CHECK_USAGE },
};
const ALL_USAGE = Object.values(COMMANDS).map((c) => c.usage).join("\n");
const isHelp = (arg: string) => arg === "--help" || arg === "-h";

export async function main([command, ...args]: string[]): Promise<number> {
  if (command === undefined || isHelp(command)) {
    (command === undefined ? console.error : console.log)(ALL_USAGE);
    return command === undefined ? 2 : 0;
  }
  const found = Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;
  if (!found) { console.error(ALL_USAGE); return 2; }
  if (args.some(isHelp)) { console.log(found.usage); return 0; }
  return found.run(args);
}
