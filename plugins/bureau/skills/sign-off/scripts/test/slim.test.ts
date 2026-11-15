import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { emptyReview, parseDraft, reduceReview, type Review, type ReviewAction, serializeDraft, toPayload } from "../../viewer/src/review.ts";
import { canFold, changedFor, type FoldEntry, type FoldFacts, foldingAtBoot, isOpen, revisedFor, survey, unopened, viewAtBoot, waitsOn } from "../../viewer/src/slim.ts";
import type { PageData } from "../build.ts";
import type { Event } from "../manifest.ts";
import { readManifest, revsOf } from "../revs.ts";

const FIXTURE = resolve(import.meta.dir, "../../fixtures/plan");
const m = await readManifest(FIXTURE), revs = revsOf(m, FIXTURE);
const item = (id: string) => m.items.find((it) => it.id === id)!;
const review = (...actions: ReviewAction[]): Review => actions.reduce(reduceReview, emptyReview);
const ids = (s: ReadonlySet<string>) => [...s].sort();

describe("viewAtBoot", () => {
  test.each([
    [null, null, { view: "slim", pinned: false }],
    ["full", null, { view: "full", pinned: false }],
    ["slim", null, { view: "slim", pinned: false }],
    ["garbage", null, { view: "slim", pinned: false }],
    ["slim", "full", { view: "full", pinned: true }],
    [null, "slim", { view: "slim", pinned: false }],
  ] as const)("stored %p, pinned %p", (stored, pinned, want) => {
    expect(viewAtBoot(stored, pinned)).toEqual(want);
  });
});

describe("the open rule", () => {
  const closed: FoldFacts = { full: false, forced: false, keep: false, opened: false, folds: true };
  test.each([
    ["nothing", {}, false, false],
    ["full view", { full: true }, true, false],
    ["changed for this reader", { forced: true }, true, false],
    ["asks for attention", { keep: true }, true, false],
    ["the reader opened it", { opened: true }, true, true],
    ["slim draws it open", { folds: false }, true, false],
    ["opened, and asks for attention", { opened: true, keep: true }, true, false],
    ["opened, in full view", { opened: true, full: true }, true, false],
    ["opened, but changed", { opened: true, forced: true }, true, false],
  ] as const)("%s", (_, facts, open, foldable) => {
    const f = { ...closed, ...facts };
    expect([isOpen(f), canFold(f)]).toEqual([open, foldable]);
  });
});

describe("what folds when the page loads", () => {
  test("a fresh draft folds the FYI cards and the questions on a default, never an undecided gate", () => {
    expect(ids(foldingAtBoot(m, emptyReview))).toEqual(["Q2", "Q3", "components", "decisions", "evidence", "prs", "risks", "units"]);
  });
  test("a gate the draft decided and a question it answered fold too", () => {
    const r = review({ type: "approve", ids: ["scope"] }, { type: "answer", id: "Q1", answer: { option: "Q1a" } });
    expect(ids(foldingAtBoot(m, r))).toEqual(["Q1", "Q2", "Q3", "components", "decisions", "evidence", "prs", "risks", "scope", "units"]);
  });
});

describe("waitsOn", () => {
  test.each([
    ["a blocking question with no answer", "Q1", review(), true],
    ["a blocking question answered", "Q1", review({ type: "answer", id: "Q1", answer: { option: "Q1a" } }), false],
    ["a question on a default", "Q2", review(), false],
    ["a question on a default with an answer being typed", "Q2", review({ type: "open", key: "answer:Q2" }), true],
    ["a gate with no verdict", "screens", review(), true],
    ["a gate approved", "screens", review({ type: "approve", ids: ["screens"] }), false],
    ["a gate approved that hosts an open blocking question", "scope", review({ type: "approve", ids: ["scope"] }), true],
    ["the same gate once the question is answered", "scope",
      review({ type: "approve", ids: ["scope"] }, { type: "answer", id: "Q1", answer: { option: "Q1a" } }), false],
    ["an FYI card", "evidence", review(), false],
    ["an FYI card with a comment being typed", "evidence", review({ type: "open", key: "comment:evidence" }), true],
    ["a gate approved with a send-back being typed", "screens", review({ type: "approve", ids: ["screens"] }, { type: "open", key: "back:screens" }), true],
  ] as const)("%s", (_, id, r, want) => {
    expect(waitsOn(m, r, item(id))).toBe(want);
  });
});

describe("changed for this reader", () => {
  const OLD = "rev-before", NOW = revs.items.screens!;
  const base = { id: "E1", via: "page" as const, planRev: revs.planRev };
  const approve = (by: string, itemRev: string, at: string): Event => ({ ...base, type: "verdict", item: "screens", itemRev, verdict: "approve", by, at });
  const revise = (at: string): Event => ({ ...base, type: "revise", item: "screens", from: OLD, to: NOW, note: "Moved the button.", by: "planner", at });
  const changed = (events: Event[], reader: string, r: Review = emptyReview) => changedFor(m, revs, events, reader, r).has("screens");

  test("sequence A: Alice decided the old revision and Bob approved the new one, with no revise event", () => {
    const log = [approve("Alice", OLD, "2026-11-01T10:00:00Z"), approve("Bob", NOW, "2026-11-02T10:00:00Z")];
    expect(changed(log, "Alice")).toBe(true);
    expect(changed(log, "Bob")).toBe(false);
  });
  test("sequence B: a revise event, then Alice approves the new revision and reloads", () => {
    expect(changed([revise("2026-11-01T10:00:00Z")], "Alice")).toBe(true);
    expect(changed([revise("2026-11-01T10:00:00Z"), approve("Alice", NOW, "2026-11-02T10:00:00Z")], "Alice")).toBe(false);
  });
  test("a revision change with no revise event opens the item for the reader who decided the old one", () => {
    expect(changed([approve("Alice", OLD, "2026-11-01T10:00:00Z")], "Alice")).toBe(true);
  });
  test("the reader's latest decision is the one compared", () => {
    expect(changed([approve("Alice", NOW, "2026-11-02T10:00:00Z"), approve("Alice", OLD, "2026-11-01T10:00:00Z")], "Alice")).toBe(false);
  });
  test("with no saved name, a decision by anyone on an earlier revision opens it", () => {
    expect(changed([approve("Bob", OLD, "2026-11-01T10:00:00Z")], "")).toBe(true);
    expect(changed([approve("Bob", NOW, "2026-11-01T10:00:00Z")], "")).toBe(false);
  });
  test("a decision in the draft is on the current revision, so it supersedes the log and the revise marker", () => {
    const log = [approve("Alice", OLD, "2026-11-01T10:00:00Z"), revise("2026-11-01T11:00:00Z")];
    expect(changed(log, "Alice", review({ type: "approve", ids: ["screens"] }))).toBe(false);
    expect(changed(log, "", review({ type: "approve", ids: ["screens"] }))).toBe(false);
  });

  // What the reader never decides: FYI cards, and the questions, decisions and steps drawn inside another card.
  const shownAt = (id: string, rev: string) => ({ ...revs.items, [id]: rev });
  test.each([
    ["an FYI card", "evidence", ["evidence"]],
    ["a question on a default, and the card that draws it", "Q2", ["Q2", "scope"]],
    ["a decision drawn in its section's part, and that part", "D1", ["D1", "decisions"]],
    ["a step drawn in the Units part, and that part", "U2", ["U2", "units"]],
  ] as const)("%s opens when it changed since the reader's last Submit, with no revise event", (_, id, want) => {
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

describe("folds on the page", () => {
  // The decisions card holds one detail fold per decision, a part that repeats.
  const folds = (open: Record<string, boolean>): FoldEntry[] => [
    { key: "evidence", open: !!open.evidence, parent: null },
    { key: "decisions", open: !!open.decisions, parent: null },
    { key: "decisions/detail:D1", open: !!open.D1, parent: "decisions", part: "decisions/detail" },
    { key: "decisions/detail:D2", open: !!open.D2, parent: "decisions", part: "decisions/detail" },
    { key: "screens", open: true, parent: null },
  ];

  test.each([
    ["everything closed", {}, ["screens"], 2],
    ["the card open, its details closed", { decisions: true }, ["decisions", "screens"], 3],
    ["a detail open inside a closed card", { D1: true }, ["screens"], 2],
    ["a card and one detail open", { decisions: true, D1: true }, ["decisions", "decisions/detail:D1", "screens"], 2],
  ] as const)("survey: %s", (_, open, drawn, folded) => {
    expect(survey(folds(open))).toEqual({ drawn: [...drawn], folded });
  });
  test("survey counts a key drawn twice once", () => {
    const twice = [...folds({}), { key: "evidence", open: false, parent: null }];
    expect(survey(twice).folded).toBe(2);
  });

  test.each([
    ["nothing seen: each card stands for what it holds", [], ["evidence", "decisions", "screens"]],
    ["the card seen, no detail: the part is listed once", ["decisions", "screens"], ["evidence", "decisions/detail"]],
    ["one detail seen: the rows left are listed", ["decisions", "decisions/detail:D1", "screens"], ["evidence", "decisions/detail:D2"]],
    ["everything seen", ["evidence", "decisions", "decisions/detail:D1", "decisions/detail:D2", "screens"], []],
  ] as const)("unopened: %s", (_, seen, want) => {
    expect(unopened(folds({}), new Set(seen)).keys).toEqual([...want]);
  });
  test("the record counts each fold its keys stand for, as the switch does on first open", () => {
    const first = survey(folds({ decisions: true }));
    expect(unopened(folds({ decisions: true }), new Set(first.drawn))).toEqual({ keys: ["evidence", "decisions/detail"], count: first.folded });
    expect(first.folded).toBe(3);
  });
  test("a fold with no control of its own is neither on the switch nor in the record, unless the same key has a control", () => {
    const about = (dependent: boolean): FoldEntry => ({ key: "decisions/about", open: false, parent: "decisions", dependent });
    const page = (...extra: FoldEntry[]) => [...folds({ decisions: true }), ...extra];
    const counted = (f: FoldEntry[]) => [survey(f).folded, unopened(f, new Set(survey(f).drawn)).count];
    expect(counted(page(about(true)))).toEqual([3, 3]);
    expect(counted(page(about(true), about(false)))).toEqual([4, 4]);
  });

  /** One page load: survey what is drawn and add it to `seen`, as the effect after every render does. */
  const draw = (r: Review, open: Record<string, boolean>) => reduceReview(r, { type: "seen", keys: survey(folds(open)).drawn });
  const reload = (r: Review) => parseDraft(serializeDraft(r))!;

  test("open the parent, leave the child folded, reload, then submit", () => {
    let r = draw(emptyReview, {});
    r = draw(r, { decisions: true });
    r = reload(r);
    r = draw(r, {});
    expect(r.seen).toEqual(["screens", "decisions"]);
    expect(unopened(folds({}), new Set(r.seen))).toEqual({ keys: ["evidence", "decisions/detail"], count: 3 });
  });
  test("the same, with one detail opened before the reload", () => {
    let r = draw(emptyReview, { decisions: true, D1: true });
    r = reload(r);
    r = draw(r, {});
    expect(unopened(folds({}), new Set(r.seen))).toEqual({ keys: ["evidence", "decisions/detail:D2"], count: 2 });
  });
});

describe("the draft and the payload", () => {
  test("a draft saved before `seen` existed loads with nothing seen", () => {
    const old = JSON.stringify({ v: 1, review: { verdicts: { screens: { verdict: "approve" } }, answers: {}, comments: [], typing: {} } });
    expect(parseDraft(old)).toEqual({ ...review({ type: "approve", ids: ["screens"] }), seen: [] });
  });
  test("a draft whose `seen` is not a list of keys is dropped", () => {
    expect(parseDraft(JSON.stringify({ v: 1, review: { ...emptyReview, seen: [1] } }))).toBeNull();
    expect(parseDraft(JSON.stringify({ v: 1, review: { ...emptyReview, seen: "decisions" } }))).toBeNull();
  });
  test("adding keys already seen leaves the draft as it was", () => {
    const r = review({ type: "seen", keys: ["decisions"] });
    expect(reduceReview(r, { type: "seen", keys: ["decisions"] })).toBe(r);
  });
  test("the payload carries the view record only when one is given", () => {
    const data = { manifest: m, revs } as PageData;
    const r = review({ type: "approve", ids: ["screens"] });
    const at = "2026-11-14T10:00:00.000Z";
    expect(toPayload(r, data, "Ana", at)).not.toHaveProperty("view");
    expect(toPayload(r, data, "Ana", at, { mode: "slim", unopened: ["decisions/detail"] }).view).toEqual({ mode: "slim", unopened: ["decisions/detail"] });
  });
});
