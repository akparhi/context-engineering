#!/usr/bin/env node
// Select Claude Code transcripts for a retro and print their paths, newest first.
//
//   node select-transcripts.mjs [--projects-dir <dir>] [--project <fragment>]
//     [--session <id>] [--opening <fragment>] [--since <YYYY-MM-DD>]
//     [--until <YYYY-MM-DD>] [--skill <name>] [--main | --subagents]
//
// Layouts under each project directory: flat <id>.jsonl, nested <id>/<id>.jsonl,
// and subagent <id>/subagents/<child>.jsonl. Dates compare against a session's
// first record timestamp, since a transcript's mtime moves on every resume.
// --opening returns only the newest match, which is how a session finds itself.
import { createReadStream, readdirSync, realpathSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, sep } from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export function candidates(projectsDir, project) {
  const files = [];
  const walk = (dir, depth) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith(".jsonl") && depth > 0) files.push(full);
      else if (entry.isDirectory() && depth < 3) walk(full, depth + 1);
    }
  };
  for (const entry of readdirSync(projectsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && (!project || entry.name.includes(project))) {
      walk(join(projectsDir, entry.name), 1);
    }
  }
  return files
    .map((path) => ({ path, mtime: statSync(path).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map(({ path }) => path);
}

export const isSubagent = (path) => path.includes(`${sep}subagents${sep}`);

export function sessionId(path) {
  return isSubagent(path) ? basename(dirname(dirname(path))) : basename(path, ".jsonl");
}

function text(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((block) => typeof block?.text === "string")
      .map((block) => block.text)
      .join("\n");
  }
  return null;
}

/** First timestamp and opening user prompt, streamed so multi-megabyte files stop early. */
export async function head(path) {
  const stream = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let started = null;
  try {
    for await (const line of lines) {
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      started ??= typeof record?.timestamp === "string" ? record.timestamp : null;
      if (record?.type === "user") return { started, opening: text(record.message?.content) };
    }
  } finally {
    lines.close();
    stream.destroy();
  }
  return { started, opening: null };
}

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A loaded skill leaves this marker. JSON escapes its line end as `\n`, so the path stops at a backslash. */
export const skillMarker = (name) =>
  new RegExp(`Base directory for this skill: [^"\\\\\\n]*/${escape(name)}(?=\\\\[nr]|"|$)`);

export async function selectTranscripts(options) {
  const projectsDir = options.projectsDir ?? join(homedir(), ".claude", "projects");
  const marker = options.skill ? skillMarker(options.skill) : null;
  const selected = [];
  for (const path of candidates(projectsDir, options.project)) {
    if (options.main && isSubagent(path)) continue;
    if (options.subagents && !isSubagent(path)) continue;
    if (options.session && sessionId(path) !== options.session) continue;
    if (options.since || options.until || options.opening) {
      const { started, opening } = await head(path);
      const day = started?.slice(0, 10);
      if (options.since && !(day && day >= options.since)) continue;
      if (options.until && !(day && day <= options.until)) continue;
      if (options.opening && !opening?.includes(options.opening)) continue;
    }
    if (marker && !marker.test(await readFile(path, "utf8"))) continue;
    selected.push(path);
    if (options.opening) break;
  }
  return selected;
}

async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      "projects-dir": { type: "string" },
      project: { type: "string" },
      session: { type: "string" },
      opening: { type: "string" },
      since: { type: "string" },
      until: { type: "string" },
      skill: { type: "string" },
      main: { type: "boolean" },
      subagents: { type: "boolean" },
    },
  });
  if (values.main && values.subagents) {
    console.error("--main and --subagents are exclusive");
    return 2;
  }
  const paths = await selectTranscripts({ ...values, projectsDir: values["projects-dir"] });
  if (paths.length === 0) {
    console.error("no transcripts match");
    return 1;
  }
  console.log(paths.join("\n"));
  return 0;
}

// node leaves argv[1] unresolved and may set it to a non-file (`node -e ... arg`).
function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  process.exitCode = await main(process.argv.slice(2));
}
