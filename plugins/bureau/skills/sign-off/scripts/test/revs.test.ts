import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { computeRevs, type Revs } from "../revs.ts";

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

test("a re-exported mockup or a changed design link reopens only the item that shows that screen", async () => {
  const at = mkdtempSync(join(tmpdir(), "sign-off-revs-"));
  cpSync(FIXTURE, at, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(at, "sign-off.json"), "utf8"));
  const showing = manifest.items.filter((i: { body?: { view: string }[] }) => i.body?.some((b) => b.view === "screens")).map((i: { id: string }) => i.id);
  const reopened = (a: Revs, b: Revs) => Object.keys(a.items).filter((id) => a.items[id] !== b.items[id]);

  const first = await computeRevs(at);
  writeFileSync(join(at, "design/book-out.png"), Buffer.concat([readFileSync(join(at, "design/book-out.png")), Buffer.from([0])]));
  const reexported = await computeRevs(at);
  manifest.facts.screens.find((s: { id: string }) => s.id === "book-out").links[0].url = "https://design.example.com/file/other";
  writeFileSync(join(at, "sign-off.json"), JSON.stringify(manifest));
  const relinked = await computeRevs(at);
  rmSync(at, { recursive: true, force: true });

  expect(showing.length).toBeGreaterThan(0);
  expect(reopened(first, reexported)).toEqual(showing);
  expect(reopened(reexported, relinked)).toEqual(showing);
});
