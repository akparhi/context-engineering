import { expect, test } from "bun:test";
import { check } from "../../check.ts";
import { planReader } from "../../fileref.ts";
import { artifactRev } from "../../rev.ts";
import prose from "../../types/prose.ts";
import { artifact, PLAN, planDir as folder } from "../helpers.ts";


function planDir(data: object, files: Record<string, string>) {
  return folder({ "plan.json": PLAN, "artifacts/prose.json": artifact("prose", data), ...files });
}

async function findings(data: object, files: Record<string, string> = {}) {
  const report = await check(planDir(data, files));
  return [...report.errors, ...report.warnings].filter((f) => f.tier === "type").map((f) => `${f.rule}: ${f.message}`);
}

const TEST_PLAN = "# Test plan\n\n## Desk\n\nScan a returned copy.\nSee the slip print.\n";

test("prose names a file, or a section of it, that must exist", async () => {
  expect(await findings({ src: "test-plan.md" }, { "test-plan.md": TEST_PLAN })).toEqual([]);
  expect(await findings({ src: "test-plan.md", heading: "Desk" }, { "test-plan.md": TEST_PLAN })).toEqual([]);
  expect(await findings({ src: "test-plan.md", heading: "Gone" }, { "test-plan.md": TEST_PLAN })).toEqual(['file: test-plan.md has no heading "Gone"']);
  expect(await findings({ src: "test-plan.md" })).toEqual(["file: test-plan.md does not exist inside the plan folder"]);
});

test("a reflowed line in the section moves the rev, and an edit outside it does not", () => {
  const data = prose.schema.parse({ src: "test-plan.md", heading: "Desk" });
  const rev = (text: string) => artifactRev(data, prose.files!(data), planReader(planDir(data, { "test-plan.md": text })));
  const before = rev(TEST_PLAN);
  expect(rev(TEST_PLAN.replace("copy.\nSee", "copy. See"))).not.toBe(before);
  expect(rev(`${TEST_PLAN}\n## Other\n\nAnything.\n`)).toBe(before);
});
