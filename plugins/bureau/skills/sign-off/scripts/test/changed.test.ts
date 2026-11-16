import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { changedFor, revisedFor } from "../../viewer/src/changed.ts";
import { emptyReview, parseDraft, reduceReview, type Review, type ReviewAction, serializeDraft, toPayload } from "../../viewer/src/review.ts";
import type { PageData } from "../build.ts";
import type { Event } from "../manifest.ts";
import { readManifest, revsOf } from "../revs.ts";

const FIXTURE = resolve(import.meta.dir, "../../fixtures/plan");
const m = await readManifest(FIXTURE), revs = revsOf(m, FIXTURE);
const review = (...actions: ReviewAction[]): Review => actions.reduce(reduceReview, emptyReview);
const ids = (s: ReadonlySet<string>) => [...s].sort();

describe("changed for this reader", () => {
  const OLD = "rev-before", NOW = revs.items.screens!;
  const base = { id: "E1", via: "page" as const, planRev: revs.planRev };
  const approve = (by: string, itemRev: string, at: string): Event => ({ ...base, type: "verdict", item: "screens", itemRev, verdict: "approve", by, at });
  const revise = (at: string): Event => ({ ...base, type: "revise", item: "screens", from: OLD, to: NOW, note: "Moved the button.", by: "planner", at });
  const changed = (events: Event[], reader: string, r: Review = emptyReview) => changedFor(m, revs, events, reader, r).has("screens");

  test("Alice decided the old revision and Bob approved the new one, with no revise event", () => {
    const log = [approve("Alice", OLD, "2026-11-01T10:00:00Z"), approve("Bob", NOW, "2026-11-02T10:00:00Z")];
    expect(changed(log, "Alice")).toBe(true);
    expect(changed(log, "Bob")).toBe(false);
  });
  test("a revise event, then Alice approves the new revision and reloads", () => {
    expect(changed([revise("2026-11-01T10:00:00Z")], "Alice")).toBe(true);
    expect(changed([revise("2026-11-01T10:00:00Z"), approve("Alice", NOW, "2026-11-02T10:00:00Z")], "Alice")).toBe(false);
  });
  test("a revision change with no revise event marks the item for the reader who decided the old one", () => {
    expect(changed([approve("Alice", OLD, "2026-11-01T10:00:00Z")], "Alice")).toBe(true);
  });
  test("the reader's latest decision is the one compared", () => {
    expect(changed([approve("Alice", NOW, "2026-11-02T10:00:00Z"), approve("Alice", OLD, "2026-11-01T10:00:00Z")], "Alice")).toBe(false);
  });
  test("with no saved name, a decision by anyone on an earlier revision marks it", () => {
    expect(changed([approve("Bob", OLD, "2026-11-01T10:00:00Z")], "")).toBe(true);
    expect(changed([approve("Bob", NOW, "2026-11-01T10:00:00Z")], "")).toBe(false);
  });
  test("a decision in the draft is on the current revision, so it supersedes the log and the revise marker", () => {
    const log = [approve("Alice", OLD, "2026-11-01T10:00:00Z"), revise("2026-11-01T11:00:00Z")];
    expect(changed(log, "Alice", review({ type: "approve", ids: ["screens"] }))).toBe(false);
    expect(changed(log, "", review({ type: "approve", ids: ["screens"] }))).toBe(false);
  });

  const shownAt = (id: string, rev: string) => ({ ...revs.items, [id]: rev });
  test.each([
    ["an FYI card", "evidence", ["evidence"]],
    ["a question on a default, and the card that draws it", "Q2", ["Q2", "scope"]],
    ["a decision drawn in its section's part, and that part", "D1", ["D1", "decisions"]],
    ["a step drawn in the Units part, and that part", "U2", ["U2", "units"]],
  ] as const)("%s is marked when it changed since the reader's last Submit, with no revise event", (_, id, want) => {
    expect(ids(changedFor(m, revs, [], "Alice", emptyReview, shownAt(id, OLD)))).toEqual([...want].sort());
    expect(ids(changedFor(m, revs, [], "Alice", emptyReview, revs.items))).toEqual([]);
  });
  test("the rev shown at the last Submit supersedes a revise marker the reader has seen since", () => {
    const seen = [{ ...base, type: "revise" as const, item: "D1", from: OLD, to: revs.items.D1!, note: "Picked the other option.", by: "planner", at: "2026-11-01T10:00:00Z" }];
    expect(ids(changedFor(m, revs, seen, "Alice", emptyReview))).toEqual(["D1", "decisions"]);
    expect(ids(changedFor(m, revs, seen, "Alice", emptyReview, revs.items))).toEqual([]);
  });

  test("a changed item carries the agent's note and the reader's own note on the revision before", () => {
    const back: Event = { ...base, type: "verdict", item: "screens", itemRev: OLD, verdict: "changes", note: "Show the count.", by: "Alice", at: "2026-11-01T09:00:00Z" };
    const log = [back, revise("2026-11-01T10:00:00Z")];
    expect(revisedFor("screens", revs, log, "Alice")).toEqual({ agent: "Moved the button.", yours: "Show the count." });
    expect(revisedFor("screens", revs, log, "Bob")).toEqual({ agent: "Moved the button." });
    expect(revisedFor("screens", revs, log, "")).toEqual({ agent: "Moved the button.", yours: "Show the count." });
  });
});

describe("the draft and the payload", () => {
  test("a draft saved with the old `seen` list still loads, without it", () => {
    const old = JSON.stringify({ v: 1, review: { verdicts: { screens: { verdict: "approve" } }, answers: {}, comments: [], typing: {}, seen: ["decisions"] } });
    expect(parseDraft(old)).toEqual(review({ type: "approve", ids: ["screens"] }));
  });
  test("a draft round-trips through serializeDraft", () => {
    const r = review({ type: "approve", ids: ["screens"] }, { type: "open", key: "comment:screens", text: "half typed" });
    expect(parseDraft(serializeDraft(r))).toEqual(r);
  });
  test("the payload carries the view record only when one is given", () => {
    const data = { manifest: m, revs } as PageData;
    const r = review({ type: "approve", ids: ["screens"] });
    const at = "2026-11-14T10:00:00.000Z";
    expect(toPayload(r, data, "Ana", at)).not.toHaveProperty("view");
    expect(toPayload(r, data, "Ana", at, { mode: "full", unopened: [], count: 0 }).view).toEqual({ mode: "full", unopened: [], count: 0 });
  });
});
