/** The plan's review state, derived from its current revs and the review log. No zod and no Node APIs here: `status` runs it over
 *  `reviews/events.jsonl`, and the page runs it over the embedded log plus its draft's events. */
import type { Event, Item, Manifest, SubmitView } from "./manifest.ts";
import { ACT_OF, ACTS, type Act } from "./model.ts";
import type { Revs } from "./revs.ts";

export type Feedback = Extract<Event, { type: "verdict" | "answer" | "comment" }>;
export const isFeedback = (e: Event): e is Feedback => e.type === "verdict" || e.type === "answer" || e.type === "comment";

/** What the reviewer owes an item: a verdict, an answer, or nothing. */
export type Bucket = "approve" | "answer" | "fyi";
export const bucketOf = (item: Item): Bucket =>
  item.type === "question" ? "answer" : item.type === "grant" || item.touches.length > 0 ? "approve" : "fyi";

/** `reopened`: the reviewer decided an earlier revision of this item, and it changed since. `default`: an unanswered question that
 *  runs on its default. */
export type ItemState = "approved" | "answered" | "default" | "fyi" | "open" | "changes" | "reopened";
export type ItemStatus = {
  id: string; title: string; act: Act; bucket: Bucket; state: ItemState; settled: boolean; itemRev: string
  blocks: string[]; revise?: string; default?: string
  current: Feedback[]                                                              // what counts now: each reviewer's latest verdict, the latest answer, every comment
  earlier: Feedback[]
};
export type ActStatus = { act: Act; settled: boolean; waiting: string[]; blockingOpen: string[] };
/** `waitsOn` names the unsettled items that keep the step from running, and is empty exactly when `mayRun`. */
export type StepStatus = { id: string; mayRun: boolean; waitsOn: string[] };
export type Submitted = { by: string; at: string; via: Event["via"]; planRev: string; acts: Act[]; view?: SubmitView };
export type PlanStatus = {
  plan: string; title: string; revision?: string; planRev: string; settled: boolean
  acts: ActStatus[]; items: ItemStatus[]; steps: StepStatus[]
  reviews: Submitted[]                                                             // each reviewer's last submit
};

/** The later of two events by `at`. On a tie the one later in the log wins, so pass events in log order. */
const later = <E extends Event>(a: E | undefined, b: E): E => (a && Date.parse(a.at) > Date.parse(b.at) ? a : b);

function itemStatus(item: Item, itemRev: string, events: Event[]): ItemStatus {
  const mine = events.filter(isFeedback).filter((e) => e.item === item.id);
  const shown = mine.filter((e) => e.itemRev === itemRev), earlier = mine.filter((e) => e.itemRev !== itemRev);
  const latestVerdictBy = new Map<string, Extract<Feedback, { type: "verdict" }>>();
  for (const e of shown) if (e.type === "verdict") latestVerdictBy.set(e.by, later(latestVerdictBy.get(e.by), e));
  const answer = shown.reduce<Extract<Feedback, { type: "answer" }> | undefined>((a, e) => (e.type === "answer" ? later(a, e) : a), undefined);
  const current = [...latestVerdictBy.values(), ...(answer ? [answer] : []), ...shown.filter((e) => e.type === "comment")];
  const verdicts = [...latestVerdictBy.values()].map((e) => e.verdict);
  const decidedBefore = earlier.some((e) => e.type !== "comment");
  const bucket = bucketOf(item);
  const isDefault = item.type === "question" && item.default !== null;
  const state: ItemState = verdicts.includes("changes") ? "changes"
    : bucket === "approve" ? (verdicts.includes("approve") ? "approved" : decidedBefore ? "reopened" : "open")
    : bucket === "answer" ? (answer ? "answered" : decidedBefore ? "reopened" : isDefault ? "default" : "open")
    : "fyi";
  const settled = state === "approved" || state === "answered" || state === "fyi" || (isDefault && state !== "changes");
  const revise = events.findLast((e) => e.type === "revise" && e.item === item.id && e.to === itemRev);
  return {
    id: item.id, title: item.title, act: ACT_OF[item.section], bucket, state, settled, itemRev, current, earlier,
    blocks: item.type === "question" ? item.blocks : [], revise: revise?.type === "revise" ? revise.note : undefined,
    default: item.type === "question" && item.default !== null ? (item.options?.find((o) => o.id === item.default)?.label ?? item.default) : undefined,
  };
}

/** The item whose card draws each deliverable a step names: a table, an endpoint or a component. */
function drawnBy(m: Manifest): Map<string, string> {
  const out = new Map<string, string>();
  for (const item of m.items) for (const block of item.body ?? []) {
    if (block.view === "erd") for (const t of block.tables ?? []) out.set(`db:${t.name}`, item.id);
    if (block.view === "endpoints") for (const e of m.facts.endpoints ?? []) if (!block.ids || block.ids.includes(e.id)) out.set(e.id, item.id);
    if (block.view === "components") for (const c of m.facts.components ?? []) out.set(c.id, item.id);
  }
  return out;
}

/** design.md's may-run rule: the step is approved or FYI in a settled act, the grant is approved, everything in `dependsOn` and
 *  `delivers` is approved, and each blocking question that lists the step is answered. With no grant, no step may run. */
function stepStatus(m: Manifest, items: ItemStatus[], acts: ActStatus[]): StepStatus[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const owner = drawnBy(m);
  const grant = m.items.find((i) => i.type === "grant");
  return m.items.flatMap((step) => {
    if (step.type !== "step") return [];
    const need = [
      step.id, grant?.id ?? "grant", ...(step.dependsOn ?? []),
      ...(step.delivers ?? []).flatMap((d) => owner.get(d) ?? []),
      ...(acts.find((a) => a.act === ACT_OF[step.section])?.waiting ?? []),
    ];
    const asks = m.items.filter((q) => q.type === "question" && q.default === null && q.blocks.includes(step.id)).map((q) => q.id);
    const waitsOn = [...new Set([
      ...need.filter((id) => !byId.get(id)?.settled),
      ...asks.filter((id) => byId.get(id)?.state !== "answered"),
    ])];
    return [{ id: step.id, mayRun: waitsOn.length === 0, waitsOn }];
  });
}

/** The plan's state from its current revs and the log, in log order. Any current `changes` holds its item, whoever else approved it. */
export function deriveStatus(m: Manifest, revs: Revs, events: Event[]): PlanStatus {
  const items = m.items.map((item) => itemStatus(item, revs.items[item.id] ?? "", events));
  const acts = ACTS.filter((act) => items.some((i) => i.act === act)).map((act) => {
    const mine = items.filter((i) => i.act === act);
    return {
      act, settled: mine.every((i) => i.settled), waiting: mine.filter((i) => !i.settled).map((i) => i.id),
      blockingOpen: mine.filter((i) => i.bucket === "answer" && !i.settled).map((i) => i.id),
    };
  });
  const lastSubmit = new Map<string, Extract<Event, { type: "submit" }>>();
  for (const e of events) if (e.type === "submit") lastSubmit.set(e.by, later(lastSubmit.get(e.by), e));
  return {
    plan: m.id, title: m.title, revision: m.revision, planRev: revs.planRev, settled: acts.every((a) => a.settled),
    acts, items, steps: stepStatus(m, items, acts),
    reviews: [...lastSubmit.values()].map(({ by, at, via, planRev, acts, view }) => ({ by, at, via, planRev, acts, view })),
  };
}
