import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const PLAN = { id: "T-1", kind: "change", title: "Hold queue", ask: "Readers can place a hold." };

/** The skill's whole-plan fixture: one artifact of every type and the files they name. */
export const FIXTURE = join(import.meta.dir, "../../fixtures/plan");

/** The data of one of the fixture's artifacts, without `type` and `v`. */
export function fixtureData(id: string) {
  const { type: _, v: __, ...data } = JSON.parse(readFileSync(join(FIXTURE, "artifacts", `${id}.json`), "utf8"));
  return data;
}

export const artifact = (type: string, data: object) => ({ type, v: 1, ...data });

/** A new plan folder in the temp dir. A string is written as is, any other value as JSON. */
export function planDir(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "artifacts-"));
  for (const [path, value] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), typeof value === "string" ? value : JSON.stringify(value));
  }
  return dir;
}

/** The rule context of a plan folder with no files, for a type whose rules or facts read none. */
export const noFiles = { read: () => null };
