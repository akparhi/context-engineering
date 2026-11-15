/** The review log: the `sign-off:v1:` payload codec, `ingest`, `status` and `record`. `reviews/events.jsonl` is append-only and
 *  stores no status. Every state below is derived from it and the plan's current revs. */
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { type ParseArgsOptionsConfig, parseArgs } from "node:util";
import { z } from "zod";
import { BuildError, snapshot } from "./build.ts";
import { check } from "./check.ts";
import { checksum, MARK, type ReviewPayload } from "./codec.ts";
import { answerText, Event, type Item, type Manifest, SubmitView } from "./manifest.ts";
import { ACT_OF, type Act } from "./model.ts";
import { canon, hash, readManifest, revsOf } from "./revs.ts";
import { deriveStatus, type Feedback, isFeedback, type ItemStatus, type PlanStatus } from "./status.ts";

export const Review = z.strictObject({
  v: z.literal(1), plan: z.string(), planRev: z.string(), by: z.string(), at: z.string(),
  items: z.array(z.strictObject({
    id: z.string(), itemRev: z.string(),
    verdict: z.enum(["approve", "changes"]).optional(),
    answer: answerText.optional(),                                                 // an option id, an option's label, or free text
    note: z.string().optional(),
    comments: z.array(z.strictObject({ anchor: z.string().optional(), text: z.string() })).optional(),
  })),
  view: SubmitView.optional(),
}) satisfies z.ZodType<ReviewPayload>;
export type Review = z.infer<typeof Review>;

const RESEND = "Ask for the downloaded review file, or for the whole message copied again with its fence.";
export class ReviewTextError extends Error {}

/** One `sign-off:v1:` mark's payload, decoded and validated. */
function decodeAt(text: string, start: number): Review {
  const rest = text.slice(start);
  const dot = rest.indexOf(".");
  const body = rest.slice(0, dot < 0 ? undefined : dot).replace(/[\s>]/g, "");
  const sum = (rest.slice(dot + 1).replace(/^[\s>]+/, "").match(/^[0-9a-f]{8}/) ?? [""])[0];
  const json = Buffer.from(body, "base64").toString("utf8");
  if (dot < 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body) || body.length % 4 !== 0 || sum.length !== 8 || checksum(json) !== sum) {
    throw new ReviewTextError(`The review payload was cut or changed in transit, so its checksum does not match. ${RESEND}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new ReviewTextError(`The payload passes its checksum but is not JSON. ${RESEND}`);
  }
  const parsed = Review.safeParse(value);
  if (!parsed.success) throw new ReviewTextError(`The payload passes its checksum but is not a v1 review: ${parsed.error.issues[0]?.message}. ${RESEND}`);
  return parsed.data;
}

/** Every payload in a pasted message. Whitespace, line wraps and `>` quote marks inside a payload are dropped before the checksum.
 *  A mark that prose mentions decodes to nothing, so it fails the text only when no mark decodes. */
export function decodeReviews(text: string): Review[] {
  const starts = [...text.matchAll(new RegExp(MARK, "g"))].map((match) => match.index + MARK.length);
  if (starts.length === 0) throw new ReviewTextError(`No ${MARK} payload in this text. Paste the whole review message, fence included.`);
  const reviews: Review[] = [], failures: unknown[] = [];
  for (const start of starts) {
    try {
      reviews.push(decodeAt(text, start));
    } catch (error) {
      failures.push(error);
    }
  }
  if (reviews.length === 0) throw failures[0];
  return reviews;
}

type Draft = Event extends infer E ? (E extends Event ? Omit<E, "id"> : never) : never;

/** The id hashes the content. `via` and `source` say how a review arrived, so the same review by two routes is one set of events. */
const withId = (draft: Draft): Event => Event.parse({ id: hash(canon({ ...draft, via: undefined, source: undefined })), ...draft });

const logPath = (planDir: string) => join(planDir, "reviews", "events.jsonl");

/** The log's events in order. A repeated id is one event, so a line two racing appends both wrote counts once. */
export async function readEvents(planDir: string): Promise<Event[]> {
  const file = logPath(planDir);
  if (!existsSync(file)) return [];
  const lines = (await Bun.file(file).text()).split("\n");
  const seen = new Set<string>();
  return lines.flatMap((line, i) => {
    if (!line.trim()) return [];
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      throw new Error(`${file}:${i + 1}: not JSON`);
    }
    const parsed = Event.safeParse(json);
    if (!parsed.success) throw new Error(`${file}:${i + 1}: ${parsed.error.issues[0]?.message}`);
    if (seen.has(parsed.data.id)) return [];
    seen.add(parsed.data.id);
    return [parsed.data];
  });
}

/** Appends the events the log does not hold yet, in one write. Returns the ones appended. */
async function appendNew(planDir: string, events: Event[]): Promise<Event[]> {
  const known = new Set((await readEvents(planDir)).map((e) => e.id));
  const fresh = [...new Map(events.filter((e) => !known.has(e.id)).map((e) => [e.id, e])).values()];
  if (fresh.length === 0) return fresh;
  mkdirSync(join(planDir, "reviews"), { recursive: true });
  appendFileSync(logPath(planDir), fresh.map((e) => `${JSON.stringify(e)}\n`).join(""));
  return fresh;
}

type Via = Event["via"];
const optionOf = (item: Item, answer: string) =>
  item.type === "question" ? item.options?.find((o) => o.id === answer || o.label === answer)?.id : undefined;

function eventsOf(review: Review, m: Manifest, via: Via) {
  const byId = new Map(m.items.map((item) => [item.id, item]));
  const base = { at: review.at, by: review.by, via, planRev: review.planRev };
  const unknown: string[] = [];
  const events = review.items.flatMap((entry): Event[] => {
    const item = byId.get(entry.id);
    if (!item) {
      unknown.push(entry.id);
      return [];
    }
    const on = { ...base, item: entry.id, itemRev: entry.itemRev };
    const option = entry.answer === undefined ? undefined : optionOf(item, entry.answer);
    return [
      entry.verdict && withId({ ...on, type: "verdict", verdict: entry.verdict, note: entry.note }),
      entry.answer !== undefined && withId({ ...on, type: "answer", ...(option ? { option } : { text: entry.answer }) }),
      ...(entry.comments ?? []).map((c) => withId({ ...on, type: "comment", anchor: c.anchor, text: c.text })),
    ].filter((e): e is Event => !!e);
  });
  const acts = [...new Set(review.items.flatMap((entry) => { const item = byId.get(entry.id); return item ? [ACT_OF[item.section]] : []; }))];
  return { events: [...events, withId({ ...base, type: "submit", acts, view: review.view })], unknown };
}

export type Ingested = { review: Review; appended: number; current: string[]; stale: string[]; unknown: string[] };

/** Ingests every review in `text`: a POST body, a pasted message or a file's contents. Running it twice appends nothing. When it
 *  appends, or the plan has no record copy at its current rev, it rebuilds the page and writes `reviews/<planRev>.html`. */
export async function ingestText(planDir: string, text: string, via: Via): Promise<Ingested[]> {
  const out = await appendReviews(planDir, text, via);
  const copy = join(planDir, "reviews", `${revsOf(await readManifest(planDir), planDir).planRev}.html`);
  if (out.some((r) => r.appended > 0) || !existsSync(copy)) {
    try {
      await snapshot(planDir, copy);
    } catch (error) {
      if (!(error instanceof BuildError)) throw error;
      throw new Error(`The review is in the log, but its record copy ${copy} was not written: ${error.message}`);
    }
  }
  return out;
}

async function appendReviews(planDir: string, text: string, via: Via): Promise<Ingested[]> {
  const m = await readManifest(planDir), revs = revsOf(m, planDir);
  const reviews = decodeReviews(text);
  for (const review of reviews) {
    if (review.plan !== m.id) throw new ReviewTextError(`This review is for plan ${review.plan}, and ${planDir} holds plan ${m.id}. Ingest it into ${review.plan}'s plan folder.`);
  }
  const out: Ingested[] = [];
  for (const review of reviews) {
    const { events, unknown } = eventsOf(review, m, via);
    const known = review.items.filter((entry) => revs.items[entry.id]);
    out.push({
      review, unknown, appended: (await appendNew(planDir, events)).length,
      current: known.filter((entry) => entry.itemRev === revs.items[entry.id]).map((entry) => entry.id),
      stale: known.filter((entry) => entry.itemRev !== revs.items[entry.id]).map((entry) => entry.id),
    });
  }
  return out;
}

const ACT_NAMES: Record<Act, string> = { product: "Product plan", tech: "Tech plan", verify: "Verification plan", pr: "PR plan" };

function viewSaid({ mode, unopened, count }: SubmitView): string {
  const n = count ?? unopened.length;
  if (n > 0) return `in ${mode}, ${n} fold${n === 1 ? "" : "s"} never opened`;
  return mode === "slim" ? "in slim, every fold opened" : "in full";
}

/** The plan's state, after `check` passes. Refuses a plan that `check` fails, as `build` does. */
export async function planStatus(planDir: string): Promise<PlanStatus> {
  const r = await check(planDir);
  if (r.errors.length) {
    const first = r.errors[0];
    throw new Error(`${planDir} fails check with ${r.errors.length} errors, the first ${first.rule}: ${first.message}. Run sign-off check ${planDir}, fix the plan, then ask again.`);
  }
  const m = await readManifest(planDir);
  return deriveStatus(m, revsOf(m, planDir), await readEvents(planDir));
}

const said = (e: Feedback) =>
  e.type === "verdict" ? `${e.verdict === "approve" ? "approved" : "sent back"} by ${e.by}${e.note ? `: ${e.note}` : ""}`
  : e.type === "answer" ? `answered by ${e.by}: ${"option" in e ? e.option : e.text}`
  : `comment from ${e.by}${e.anchor ? ` on ${e.anchor}` : ""}: ${e.text}`;

export function formatStatus(s: PlanStatus): string {
  const waiting = s.acts.flatMap((a) => a.waiting).length;
  const lines = [
    `${s.plan} ${s.title}${s.revision ? `, revision ${s.revision}` : ""}, planRev ${s.planRev}`,
    s.settled ? "Settled. Every act is approved and every blocking question is answered." : `Not settled. ${waiting} item${waiting === 1 ? "" : "s"} wait on the reviewer.`,
    ...s.reviews.map((r) => `Last review from ${r.by}: ${r.at}, by ${r.via}${r.acts.length ? `, on ${r.acts.map((a) => ACT_NAMES[a]).join(", ")}` : ""}${r.view ? `, ${viewSaid(r.view)}` : ""}${r.planRev === s.planRev ? "" : ", before the last revise"}.`),
  ];
  for (const act of s.acts) {
    lines.push("", `${ACT_NAMES[act.act]}: ${act.settled ? "settled" : `waiting on ${act.waiting.join(", ")}`}.${act.blockingOpen.length ? ` Blocking questions open: ${act.blockingOpen.join(", ")}.` : ""}`);
    for (const item of s.items.filter((i) => i.act === act.act)) {
      lines.push(`  ${item.state.padEnd(9)} ${item.id.padEnd(11)} ${item.title}`);
      const detail = [
        ...item.current.map(said),
        ...(item.state === "reopened" ? item.earlier.filter((e) => e.type !== "comment").map((e) => `before this revision, ${said(e)}`) : []),
        item.revise && `revised: ${item.revise}`,
        item.blocks.length > 0 && !item.settled && `blocks ${item.blocks.join(", ")}`,
        item.state === "default" && `runs on its default: ${item.default}`,
      ];
      for (const line of detail) if (line) lines.push(`      ${line}`);
    }
  }
  if (s.steps.length) {
    lines.push("", "Steps:");
    for (const step of s.steps) lines.push(`  ${step.id} ${step.mayRun ? "may run" : `waits on ${step.waitsOn.join(", ")}`}.`);
  }
  return lines.join("\n");
}

/** Bad arguments: exit 2, like a usage error. */
class UsageError extends Error {}

/** Runs a command and turns what it throws into its message and an exit code: 2 for a usage error, 1 for anything else. */
export async function guarded(run: () => Promise<number>): Promise<number> {
  try {
    return await run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return error instanceof UsageError ? 2 : 1;
  }
}

type Held = { id: string; by: string[] };
type Recorded = { recorded: string[]; skipped: string[]; held: Held[]; grant?: Extract<Item, { type: "grant" }> };
type Pick =
  | { all: true; grant: boolean }
  | { all: false; item: string; verdict?: "approve" | "changes"; answer?: string; note?: string };

/** Who holds an item in `changes` now: the reviewers whose latest verdict on this revision sends it back. */
const holders = (s: PlanStatus, id: string) =>
  (s.items.find((i) => i.id === id)?.current ?? []).flatMap((e) => (e.type === "verdict" && e.verdict === "changes" ? [e.by] : []));

/** Now, or 1 ms after the event this one must outrank when that is stamped later. A page review carries the browser's clock and
 *  `status` ranks a reader's verdicts, and the answers, by `at`, so a send-back in chat must never land before an earlier approve. */
function stampFor(item: ItemStatus, by: string, type: "verdict" | "answer"): string {
  const rivals = item.current.filter((e) => e.type === type && (type === "answer" || e.by === by));
  return new Date(Math.max(Date.now(), ...rivals.map((e) => Date.parse(e.at) + 1))).toISOString();
}

async function record(planDir: string, by: string, pick: Pick): Promise<Recorded> {
  const status = await planStatus(planDir);
  const m = await readManifest(planDir);
  const base = { by, via: "chat" as const, planRev: status.planRev };
  const heldNow = (after: PlanStatus) => after.items.filter((i) => i.state === "changes").map((i) => ({ id: i.id, by: holders(after, i.id) }));
  if (pick.all) {
    const grants = new Set(m.items.filter((i) => i.type === "grant").map((i) => i.id));
    const targets = status.items.filter((i) => i.bucket === "approve" && (i.state === "open" || i.state === "reopened") && (pick.grant || !grants.has(i.id)));
    await appendNew(planDir, targets.map((i) => withId({ ...base, at: stampFor(i, by, "verdict"), type: "verdict", item: i.id, itemRev: i.itemRev, verdict: "approve" })));
    const grant = pick.grant ? undefined : m.items.find((i): i is Extract<Item, { type: "grant" }> => i.type === "grant");
    return { recorded: targets.map((i) => i.id), skipped: [], held: heldNow(status), grant };
  }
  const item = m.items.find((i) => i.id === pick.item);
  const now = status.items.find((i) => i.id === pick.item);
  if (!item || !now) throw new ReviewTextError(`${pick.item} is not an item of plan ${m.id}.`);
  const on = { ...base, at: stampFor(now, by, item.type === "question" ? "answer" : "verdict"), item: item.id, itemRev: now.itemRev };
  let event: Event;
  if (item.type === "question") {
    if (pick.verdict) throw new UsageError(`${item.id} is a question, so it takes an answer, not ${pick.verdict}: sign-off record ${planDir} ${item.id} --answer <option id or text>`);
    const answer = answerText.safeParse(pick.answer ?? "");
    if (!answer.success) throw new UsageError(`${item.id} is a question. Give its answer: sign-off record ${planDir} ${item.id} --answer <option id or text>`);
    const option = optionOf(item, answer.data);
    event = withId({ ...on, type: "answer", ...(option ? { option } : { text: answer.data }) });
  } else {
    if (pick.answer !== undefined) throw new UsageError(`${item.id} is not a question, so it takes approve or changes, not an answer.`);
    if (!pick.verdict) throw new UsageError(`${item.id} takes a verdict: sign-off record ${planDir} ${item.id} approve|changes`);
    if (now.bucket === "fyi" && pick.verdict === "approve") throw new ReviewTextError(`${item.id} is for reading and has nothing to approve. Record changes to object to it.`);
    event = withId({ ...on, type: "verdict", verdict: pick.verdict, note: pick.note });
  }
  const latest = now.current.findLast((e) => e.by === by && e.type === event.type);
  const same = latest && canon({ ...latest, id: 0, at: 0, via: 0 }) === canon({ ...event, id: 0, at: 0, via: 0 });
  if (!same) await appendNew(planDir, [event]);
  const others = holders(status, item.id).filter((who) => who !== by);
  const stillHeld = event.type === "verdict" && event.verdict === "approve" && others.length > 0;
  return { recorded: same ? [] : [item.id], skipped: same ? [item.id] : [], held: stillHeld ? [{ id: item.id, by: others }] : [] };
}

/** Appends the `revise` event for an item the agent just edited. `from` is the itemRev in the item's latest review event or
 *  revise, and `to` is its itemRev now, so neither is typed by hand. */
async function revise(planDir: string, id: string, note: string): Promise<{ from: string; to: string }> {
  const status = await planStatus(planDir);
  const now = status.items.find((i) => i.id === id);
  if (!now) throw new ReviewTextError(`${id} is not an item of plan ${status.plan}.`);
  const seen = (await readEvents(planDir)).findLast((e): e is Feedback | Extract<Event, { type: "revise" }> => (isFeedback(e) || e.type === "revise") && e.item === id);
  const from = seen?.type === "revise" ? seen.to : seen?.itemRev;
  if (from === undefined) throw new ReviewTextError(`No review in the log covers ${id}, so there is no earlier revision to tell the reader about. Run sign-off open ${planDir}.`);
  if (from === now.itemRev) throw new ReviewTextError(`${id} is still at itemRev ${from}, the rev of its latest event in the log. Edit it in sign-off.json or in the file it draws from, run check, then revise.`);
  await appendNew(planDir, [withId({ at: new Date().toISOString(), by: "agent", via: "chat", planRev: status.planRev, type: "revise", item: id, from, to: now.itemRev, note })]);
  return { from, to: now.itemRev };
}

export const USAGE = {
  ingest: "usage: sign-off ingest <plan-dir> [<review-file> | --text <message>] [--via page|paste]   (reads stdin with neither)",
  status: "usage: sign-off status <plan-dir> [--json]",
  record: "usage: sign-off record <plan-dir> (--all [--grant] | <item> approve|changes [--note <text>] | <question> --answer <text>) [--by <name>]",
  revise: "usage: sign-off revise <plan-dir> <item> --note <what changed, to the reader>   (run after the edit; records the item's old and new itemRev)",
};

function args<const O extends ParseArgsOptionsConfig>(argv: string[], options: O) {
  try {
    return parseArgs({ args: argv, options, allowPositionals: true, strict: true });
  } catch {
    return undefined;
  }
}

export function runIngest(argv: string[]): Promise<number> {
  return guarded(async () => {
    const parsed = args(argv, { text: { type: "string" }, via: { type: "string" } });
    const [planDir, file, ...rest] = parsed?.positionals ?? [];
    const via = z.enum(["page", "paste"]).safeParse(parsed?.values.via ?? "paste");
    const text = parsed?.values.text;
    if (!parsed || !planDir || rest.length > 0 || (file && typeof text === "string") || !via.success || (!file && text === undefined && process.stdin.isTTY)) {
      console.error(USAGE.ingest);
      return 2;
    }
    const message = typeof text === "string" ? text : file ? await Bun.file(resolve(file)).text() : await Bun.stdin.text();
    for (const r of await ingestText(resolve(planDir), message, via.data)) {
      const lines = [
        `Review of ${r.review.plan} by ${r.review.by}, submitted ${r.review.at}. ${r.appended ? `${r.appended} events appended.` : "Already in the log, nothing appended."}`,
        r.stale.length > 0 && `Stale, recorded but settling nothing, because the item changed since the reviewer saw it: ${r.stale.join(", ")}.`,
        r.unknown.length > 0 && `Not items of this plan, skipped: ${r.unknown.join(", ")}.`,
      ];
      for (const line of lines) if (line) console.log(line);
    }
    console.log(`Next: sign-off status ${planDir}`);
    return 0;
  });
}

export function runStatus(argv: string[]): Promise<number> {
  return guarded(async () => {
    const parsed = args(argv, { json: { type: "boolean" } });
    const [planDir, ...rest] = parsed?.positionals ?? [];
    if (!parsed || !planDir || rest.length > 0) {
      console.error(USAGE.status);
      return 2;
    }
    const status = await planStatus(resolve(planDir));
    console.log(parsed.values.json ? JSON.stringify(status, null, 2) : formatStatus(status));
    return 0;
  });
}

export function runRecord(argv: string[]): Promise<number> {
  return guarded(async () => {
    const parsed = args(argv, { all: { type: "boolean" }, grant: { type: "boolean" }, by: { type: "string" }, note: { type: "string" }, answer: { type: "string" } });
    const [planDir, item, verdict, ...rest] = parsed?.positionals ?? [];
    const v = parsed?.values;
    const word = verdict === undefined || verdict === "approve" || verdict === "changes";
    const one = !v?.all && item && !v?.grant && word && (verdict === undefined) !== (v?.answer === undefined);
    const all = v?.all && !item && v?.answer === undefined;
    if (!parsed || !v || !planDir || rest.length > 0 || !(one || all)) {
      console.error(USAGE.record);
      return 2;
    }
    const by = typeof v.by === "string" ? v.by : "chat";
    const pick: Pick = all
      ? { all: true, grant: v.grant === true }
      : { all: false, item: item ?? "", verdict: verdict as "approve" | "changes" | undefined, answer: typeof v.answer === "string" ? v.answer : undefined, note: typeof v.note === "string" ? v.note : undefined };
    const r = await record(resolve(planDir), by, pick);
    const lines = [
      r.grant && `The grant stays open. It lets the agent: ${r.grant.allow.map((l) => l.says).join(" ")}`,
      r.grant && `It asks first: ${r.grant.ask.map((l) => l.says).join(" ")}`,
      r.grant && `To approve it too, run record --all --grant, or record ${r.grant.id} approve.`,
      `Recorded: ${r.recorded.join(", ") || "nothing new"}.`,
      r.skipped.length > 0 && `Already recorded: ${r.skipped.join(", ")}.`,
      ...r.held.map((h) => `Still sent back, so not approved: ${h.id}, by ${h.by.join(" and ")}. It clears when the agent revises it, or when that reviewer approves it: ${h.by.map((who) => `sign-off record ${planDir} ${h.id} approve --by ${JSON.stringify(who)}`).join(" ; ")}`),
    ];
    for (const line of lines) if (line) console.log(line);
    return 0;
  });
}

export function runRevise(argv: string[]): Promise<number> {
  return guarded(async () => {
    const parsed = args(argv, { note: { type: "string" } });
    const [planDir, item, ...rest] = parsed?.positionals ?? [];
    const note = parsed?.values.note;
    if (!planDir || !item || rest.length > 0 || typeof note !== "string" || !note.trim()) {
      console.error(USAGE.revise);
      return 2;
    }
    const { from, to } = await revise(resolve(planDir), item, note.trim());
    console.log(`Revised: ${item}, itemRev ${from} to ${to}. Next: sign-off open ${planDir}`);
    return 0;
  });
}
