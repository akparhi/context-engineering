#!/usr/bin/env node
// Locate the transcript whose opening user prompt carries a fragment.
//
//   node find-transcript.mjs <projects-dir> <opening-prompt-fragment>
//
// Prints the newest matching path, or exits 1 with "no transcript". Covers the
// three layouts under one per-project directory: flat <id>.jsonl, nested
// <id>/<id>.jsonl, and subagent <id>/subagents/<child>.jsonl. Each candidate is
// streamed line by line and abandoned at its first typed `user` record; the
// first line is session metadata and files run to megabytes.
import { createReadStream, readdirSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// readline also breaks on U+2028 and U+2029, which JSON leaves unescaped.
async function* jsonlLines(stream) {
  let rest = "";
  for await (const chunk of stream) {
    const parts = (rest + chunk).split("\n");
    rest = parts.pop();
    yield* parts;
  }
  if (rest) yield rest;
}

// Session cleanup can delete a transcript or its session directory while a
// search runs. Anything under the root that vanishes after it was listed is
// skipped; a missing root still throws.
export function rethrowUnlessRemoved(error) {
  if (error.code !== "ENOENT") throw error;
}

export function candidates(projectsDir, maxDepth = 2) {
  const files = [];
  const walk = (dir, depth) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(full);
      else if (entry.isDirectory() && depth < maxDepth) {
        try {
          walk(full, depth + 1);
        } catch (error) {
          rethrowUnlessRemoved(error);
        }
      }
    }
  };
  walk(projectsDir, 0);
  return files
    .flatMap((path) => {
      const stat = statSync(path, { throwIfNoEntry: false });
      return stat ? [{ path, mtime: stat.mtimeMs }] : [];
    })
    .sort((a, b) => b.mtime - a.mtime);
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

// `user` records Claude Code writes for a local command (/clear, !cmd) and its
// output, not a prompt the user typed. A skill invocation leads with
// <command-message> and is kept: its <command-args> carry what the user typed.
const LOCAL_COMMAND = /^\s*<(?:command-name|local-command-stdout|bash-input)>/u;

async function* parsed(lines) {
  for await (const line of lines) {
    try {
      yield JSON.parse(line);
    } catch {}
  }
}

async function claudeOpening(records) {
  for await (const record of records) {
    if (record?.type !== "user" || record.isMeta) continue;
    const prompt = text(record.message?.content);
    if (prompt && !LOCAL_COMMAND.test(prompt)) return prompt;
  }
  return null;
}

export async function openingPrompt(path) {
  const stream = createReadStream(path, { encoding: "utf8" });
  try {
    return await claudeOpening(parsed(jsonlLines(stream)));
  } finally {
    stream.destroy();
  }
}

export async function findTranscript(projectsDir, fragment) {
  for (const { path } of candidates(projectsDir)) {
    try {
      const prompt = await openingPrompt(path);
      if (prompt?.includes(fragment)) return path;
    } catch (error) {
      rethrowUnlessRemoved(error);
    }
  }
  return null;
}

async function main(argv) {
  const [projectsDir, fragment] = argv;
  if (!projectsDir || !fragment || argv.length > 2) {
    console.error("usage: find-transcript.mjs <projects-dir> <opening-prompt-fragment>");
    return 2;
  }
  const path = await findTranscript(projectsDir, fragment);
  if (!path) {
    console.error(`no transcript under ${projectsDir} opens with ${JSON.stringify(fragment)}`);
    return 1;
  }
  console.log(path);
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
