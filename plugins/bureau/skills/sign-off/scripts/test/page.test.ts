import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { build } from "../build.ts";
import { findChromium, inChromium, NoBrowser } from "../chromium.ts";
import { encodeReview } from "../codec.ts";
import { ingestText } from "../review.ts";
import { computeRevs } from "../revs.ts";

const FIXTURE = join(import.meta.dir, "../../fixtures/plan");
const scratch = mkdtempSync(join(tmpdir(), "sign-off-page-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const chromium = (() => {
  try {
    return findChromium();
  } catch (error) {
    if (error instanceof NoBrowser) return null;
    throw error;
  }
})();

/** Clicks every act footer's "Approve the N open items", then reads the draft the page saved. */
const APPROVE_EVERY_ACT = `(async () => {
  const tick = () => new Promise((ok) => setTimeout(ok, 100));
  const buttons = [...document.querySelectorAll('[id^="foot-"] button')].filter((b) => b.textContent.startsWith("Approve the"));
  for (const b of buttons) { b.click(); await tick(); }
  await tick();
  const key = Object.keys(localStorage).find((k) => k.startsWith("sign-off:LIB-7:"));
  return { clicked: buttons.length, approved: Object.keys(JSON.parse(localStorage.getItem(key) ?? "{}").review?.verdicts ?? {}) };
})()`;

describe.skipIf(chromium === null)("the built page", () => {
  test("each act's bulk approve leaves the grant open, which takes its own click", async () => {
    const dir = join(scratch, "plan");
    cpSync(FIXTURE, dir, { recursive: true });
    const { errors, value } = await inChromium(chromium ?? "", pathToFileURL(await build(dir)).href, APPROVE_EVERY_ACT,
      z.object({ clicked: z.number(), approved: z.array(z.string()) }));
    expect(errors).toEqual([]);
    expect(value.clicked).toBeGreaterThan(0);
    expect(value.approved).toContain("scope");
    expect(value.approved).not.toContain("grant");
  }, 60_000);

  test("the record copy an ingest writes opens full, where the page opens slim", async () => {
    const dir = join(scratch, "copy");
    cpSync(FIXTURE, dir, { recursive: true });
    const revs = await computeRevs(dir);
    await ingestText(dir, encodeReview({ v: 1, plan: "LIB-7", planRev: revs.planRev, by: "Ana Ruiz", at: "2026-11-14T10:00:00.000Z",
      items: [{ id: "api", itemRev: revs.items.api ?? "", verdict: "approve" }] }), "paste");
    const view = async (file: string) => (await inChromium(chromium ?? "", pathToFileURL(join(dir, file)).href,
      `document.querySelector('[data-focus="view"]')?.dataset.view ?? null`, z.string().nullable())).value;
    expect(await view("sign-off.html")).toBe("slim");
    expect(await view(`reviews/${revs.planRev}.html`)).toBe("full");
  }, 60_000);
});
