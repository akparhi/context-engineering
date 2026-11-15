import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { computeRevs } from "../revs.ts";

const FIXTURE = resolve(import.meta.dir, "../../fixtures/plan");
const dir = mkdtempSync(join(tmpdir(), "sign-off-revs-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("the header links are presentation: changing them leaves every rev the same", async () => {
  cpSync(FIXTURE, dir, { recursive: true });
  const before = await computeRevs(dir);
  const manifest = JSON.parse(readFileSync(join(dir, "sign-off.json"), "utf8"));
  manifest.ticket = "https://tracker.example.com/browse/LIB-8";
  manifest.sources = [{ label: "Other", url: "https://docs.example.com/other" }];
  writeFileSync(join(dir, "sign-off.json"), JSON.stringify(manifest));
  expect(await computeRevs(dir)).toEqual(before);
});
