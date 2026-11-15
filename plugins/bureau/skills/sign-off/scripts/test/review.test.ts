import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checksum, encodeReview, MARK } from "../codec.ts";
import { FULL_VIEW_META } from "../build.ts";
import { decodeReviews, ingestText, planStatus, type Review, readEvents, ReviewTextError, runIngest, runRecord, runRevise, runStatus } from "../review.ts";
import { computeRevs, type Revs } from "../revs.ts";

const FIXTURE = join(import.meta.dir, "../../fixtures/plan");
const ENTRY = join(import.meta.dir, "../sign-off");
const scratch = mkdtempSync(join(tmpdir(), "sign-off-review-"));
let copies = 0;
const planCopy = () => {
  const dir = join(scratch, String(copies++));
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
};
const edit = (dir: string, file: string, change: (text: string) => string) => {
  const path = join(dir, file), before = readFileSync(path, "utf8"), after = change(before);
  if (after === before) throw new Error(`the edit to ${file} changed nothing`);
  writeFileSync(path, after);
};
const changed = (a: Revs, b: Revs) => Object.keys(a.items).filter((id) => a.items[id] !== b.items[id]);
const reviewOf = (revs: Revs, items: Omit<Review["items"][number], "itemRev">[]): Review => ({
  v: 1, plan: "LIB-7", planRev: revs.planRev, by: "Ana Ruiz", at: "2026-11-14T10:00:00.000Z",
  items: items.map((entry) => ({ ...entry, itemRev: revs.items[entry.id] ?? "unknown" })),
});
const message = (payload: string) => `sign-off review of LIB-7, plan r2\nResult: changes requested\n\n\`\`\`\n${payload}\n\`\`\`\n`;
const editJson = (dir: string, change: (m: Record<string, any>) => void) => edit(dir, "sign-off.json", (t) => {
  const m = JSON.parse(t);
  change(m);
  return JSON.stringify(m);
});
/** An edit that passes check and changes only the item's own rev. */
const reword = (dir: string, id: string) => editJson(dir, (m) => { const item = m.items.find((i: Record<string, unknown>) => i.id === id); item.why = `${item.why ?? ""} Reworded.`; });
const stateOf = async (dir: string) => Object.fromEntries((await planStatus(dir)).items.map((i) => [i.id, i.state]));

const quiet = spyOn(console, "log"), quietErrors = spyOn(console, "error");
/** What the commands printed since the last call. */
const printed = () => {
  const text = [...quiet.mock.calls, ...quietErrors.mock.calls].flat().join("\n");
  quiet.mockClear();
  quietErrors.mockClear();
  return text;
};
beforeAll(() => {
  quiet.mockImplementation(() => {});
  quietErrors.mockImplementation(() => {});
});
afterAll(() => {
  quiet.mockRestore();
  quietErrors.mockRestore();
  rmSync(scratch, { recursive: true, force: true });
});

type Case = { name: string; run: (dir: string) => Promise<void> };
const cases: Case[] = [
  {
    name: "the same review ingested twice, by two routes, appends nothing the second time, and its one submit holds the view",
    run: async (dir) => {
      const view = { mode: "slim" as const, unopened: ["api/envelope", "scope/params:R2"] };
      const review = { ...reviewOf(await computeRevs(dir), [{ id: "scope", verdict: "approve" }, { id: "api", verdict: "changes", note: "Answer 404." }]), view };
      const text = message(encodeReview(review));
      const [first] = await ingestText(dir, text, "page");
      const log = readFileSync(join(dir, "reviews/events.jsonl"), "utf8");
      const [second] = await ingestText(dir, text, "paste");
      expect(first?.appended).toBe(3);
      expect(second?.appended).toBe(0);
      expect(readFileSync(join(dir, "reviews/events.jsonl"), "utf8")).toBe(log);
      expect((await readEvents(dir)).filter((e) => e.type === "submit").map((e) => e.view)).toEqual([view]);
    },
  },
  {
    name: "a log written before the submit view parses, and the same review with no view ingests into it as nothing new",
    run: async (dir) => {
      // Written by ingest before `view` existed. A changed event id here means every old review ingests a second time.
      const old = [
        '{"id":"5abf8158a1a8","at":"2026-11-01T09:00:00.000Z","by":"Ana Ruiz","via":"page","planRev":"p0","type":"verdict","item":"scope","itemRev":"r0","verdict":"approve"}',
        '{"id":"0e12ed37fe8c","at":"2026-11-01T09:00:00.000Z","by":"Ana Ruiz","via":"page","planRev":"p0","type":"submit","acts":["product"]}',
      ].join("\n") + "\n";
      mkdirSync(join(dir, "reviews"));
      writeFileSync(join(dir, "reviews/events.jsonl"), old);
      expect((await readEvents(dir)).map((e) => e.type)).toEqual(["verdict", "submit"]);
      const review: Review = { v: 1, plan: "LIB-7", planRev: "p0", by: "Ana Ruiz", at: "2026-11-01T09:00:00.000Z", items: [{ id: "scope", itemRev: "r0", verdict: "approve" }] };
      const [again] = await ingestText(dir, message(encodeReview(review)), "paste");
      expect(again?.appended).toBe(0);
      expect(readFileSync(join(dir, "reviews/events.jsonl"), "utf8")).toBe(old);
    },
  },
  {
    name: "a verdict for a stale itemRev is recorded and settles nothing",
    run: async (dir) => {
      const shown = await computeRevs(dir);
      edit(dir, "design/db.sql", (t) => t.replace("pickup_by timestamptz,", "pickup_by timestamptz,\n  shelf_note text,"));
      const [result] = await ingestText(dir, message(encodeReview(reviewOf(shown, [{ id: "data", verdict: "approve" }, { id: "scope", verdict: "approve" }]))), "paste");
      expect(result?.stale).toEqual(["data"]);
      expect((await readEvents(dir)).some((e) => e.type === "verdict" && e.item === "data")).toBe(true);
      const state = await stateOf(dir);
      expect(state.data).toBe("reopened");
      expect(state.scope).toBe("approved");
    },
  },
  {
    name: "cut payload text is rejected with what to do, and the log stays empty",
    run: async (dir) => {
      const payload = encodeReview(reviewOf(await computeRevs(dir), [{ id: "scope", verdict: "approve" }]));
      const dot = payload.lastIndexOf(".");
      const cuts = [payload.slice(0, 40), payload.slice(0, dot - 8) + payload.slice(dot), payload.slice(0, -3), payload.replace("eyJ", "eyK")];
      for (const cut of cuts) {
        const error = await ingestText(dir, message(cut), "paste").catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ReviewTextError);
        expect(String(error)).toContain("downloaded review file");
      }
      expect(existsSync(join(dir, "reviews/events.jsonl"))).toBe(false);
    },
  },
  {
    name: "reflowed payload text, wrapped, indented and quoted inside chatter, ingests the same events",
    run: async (dir) => {
      const payload = encodeReview(reviewOf(await computeRevs(dir), [{ id: "scope", verdict: "approve", comments: [{ anchor: "R1", text: "Say hold shelf." }] }]));
      const wrapped = payload.match(/.{1,30}/g)?.map((line) => `>   ${line}`).join("\n") ?? "";
      const [reflowed] = await ingestText(dir, `Forwarding Ana's review:\n${wrapped}\nThanks!`, "paste");
      const [clean] = await ingestText(dir, payload, "paste");
      expect(reflowed?.appended).toBe(3);
      expect(clean?.appended).toBe(0);
    },
  },
  {
    name: "a plan.md edit reopens exactly the one item that cites that section",
    run: async (dir) => {
      await runRecord([dir, "--all", "--grant"]);
      const before = await computeRevs(dir);
      edit(dir, "plan.md", (t) => t.replace("Three new endpoints in shelf-api", "Four new endpoints in shelf-api"));
      const afterApi = await computeRevs(dir);
      expect(changed(before, afterApi)).toEqual(["api"]);
      edit(dir, "plan.md", (t) => t.replace("Three tasks.", "Four tasks."));
      expect(changed(afterApi, await computeRevs(dir))).toEqual(["U1"]);
      const reopened = Object.entries(await stateOf(dir)).filter(([, s]) => s === "reopened").map(([id]) => id);
      expect(reopened).toEqual(["api"]);
    },
  },
  {
    name: "an added blank line reopens nothing",
    run: async (dir) => {
      const before = await computeRevs(dir);
      edit(dir, "plan.md", (t) => t.replaceAll("\n\n", "\n\n\n").replace("## API\n", "## API\n\n"));
      expect(await computeRevs(dir)).toEqual(before);
    },
  },
  {
    name: "a reflowed paragraph reopens nothing",
    run: async (dir) => {
      const before = await computeRevs(dir);
      const rewrap = (block: string) => block.startsWith("#") ? block : (block.split(/\s+/).join(" ").match(/.{1,38}(\s|$)/g) ?? []).map((l) => l.trim()).join("\n");
      edit(dir, "plan.md", (t) => t.split("\n\n").map(rewrap).join("\n\n"));
      edit(dir, "design/db.sql", (t) => t.replace("ON book_holds (book_id, member_id) WHERE", "ON book_holds\n    (book_id, member_id)\n    WHERE"));
      expect(await computeRevs(dir)).toEqual(before);
    },
  },
  {
    name: "deleting a partial-index predicate from db.sql changes the Data itemRev and nothing else",
    run: async (dir) => {
      const before = await computeRevs(dir);
      edit(dir, "design/db.sql", (t) => t.replace(" WHERE status = 'on_shelf';", ";"));
      expect(changed(before, await computeRevs(dir))).toEqual(["data"]);
    },
  },
  {
    name: "record --all approves every gate except the grant, which stays open",
    run: async (dir) => {
      expect(await runRecord([dir, "--all"])).toBe(0);
      const status = await planStatus(dir);
      const gates = status.items.filter((i) => i.bucket === "approve");
      expect(gates.filter((i) => i.state !== "approved").map((i) => i.id)).toEqual(["grant"]);
      expect(status.acts.find((a) => a.act === "pr")?.settled).toBe(false);
      expect(status.settled).toBe(false);
    },
  },
  {
    name: "answers and comments keep their itemRev and their item",
    run: async (dir) => {
      const revs = await computeRevs(dir);
      await ingestText(dir, message(encodeReview(reviewOf(revs, [
        { id: "Q1", answer: "No, only when every copy is out" },
        { id: "Q2", answer: "Three books." },
        { id: "data", comments: [{ anchor: "db:book_holds.copy_id", text: "Name it shelved_copy_id." }] },
      ]))), "paste");
      const feedback = (await readEvents(dir)).filter((e) => e.type === "answer" || e.type === "comment");
      expect(feedback.map(({ id, at, by, via, planRev, ...said }) => said)).toEqual([
        { type: "answer", item: "Q1", itemRev: revs.items.Q1, option: "Q1a" },
        { type: "answer", item: "Q2", itemRev: revs.items.Q2, text: "Three books." },
        { type: "comment", item: "data", itemRev: revs.items.data, anchor: "db:book_holds.copy_id", text: "Name it shelved_copy_id." },
      ]);
      const state = await stateOf(dir);
      expect([state.Q1, state.Q2, state.data]).toEqual(["answered", "answered", "open"]);
    },
  },
  {
    name: "each reviewer's latest verdict goes by when they gave it, not by when it was ingested",
    run: async (dir) => {
      const revs = await computeRevs(dir);
      const at = (time: string, verdict: "approve" | "changes") =>
        message(encodeReview({ ...reviewOf(revs, [{ id: "api", verdict }]), at: `2026-11-14T${time}:00.000Z` }));
      await ingestText(dir, at("11:00", "changes"), "paste");
      await ingestText(dir, at("10:00", "approve"), "page");
      expect((await stateOf(dir)).api).toBe("changes");
    },
  },
  {
    name: "a send-back in chat beats the same reader's approve from a page whose clock runs ahead",
    run: async (dir) => {
      const ahead = new Date(Date.now() + 86_400_000).toISOString();
      await ingestText(dir, message(encodeReview({ ...reviewOf(await computeRevs(dir), [{ id: "api", verdict: "approve" }, { id: "Q2", answer: "Two books." }]), at: ahead })), "page");
      expect(await runRecord([dir, "api", "changes", "--note", "404, not 403", "--by", "Ana Ruiz"])).toBe(0);
      expect(await runRecord([dir, "Q2", "--answer", "Three books.", "--by", "Lee Park"])).toBe(0);
      const items = (await planStatus(dir)).items;
      expect(items.find((i) => i.id === "api")?.state).toBe("changes");
      expect(items.find((i) => i.id === "Q2")?.current.map((e) => e.type === "answer" && "text" in e && e.text)).toEqual(["Three books."]);
    },
  },
  {
    name: "an empty or blank answer is rejected at the payload, and the log stays empty",
    run: async (dir) => {
      const revs = await computeRevs(dir);
      for (const answer of ["", "   "]) {
        const error = await ingestText(dir, message(encodeReview(reviewOf(revs, [{ id: "Q1", answer }]))), "paste").catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ReviewTextError);
        expect(String(error)).toContain("an answer is blank");
      }
      expect(existsSync(join(dir, "reviews/events.jsonl"))).toBe(false);
    },
  },
  {
    name: "a chat approve leaves another reviewer's changes in place, names the two ways out, and that reviewer's approve clears it",
    run: async (dir) => {
      await ingestText(dir, message(encodeReview(reviewOf(await computeRevs(dir), [{ id: "api", verdict: "changes", note: "400, not 403" }]))), "paste");
      printed();
      expect(await runRecord([dir, "api", "approve"])).toBe(0);
      expect((await stateOf(dir)).api).toBe("changes");
      const said = printed();
      expect(said).toContain("Still sent back, so not approved: api, by Ana Ruiz. It clears when the agent revises it, or when that reviewer approves it");
      expect(said).toContain(`sign-off record ${dir} api approve --by "Ana Ruiz"`);
      expect(await runRecord([dir, "api", "approve", "--by", "Ana Ruiz"])).toBe(0);
      expect((await stateOf(dir)).api).toBe("approved");
    },
  },
  {
    name: "a verdict on a question exits 2 and records nothing, and --answer records the answer",
    run: async (dir) => {
      expect(await runRecord([dir, "Q1", "approve"])).toBe(2);
      expect(printed()).toContain("--answer");
      expect(await runRecord([dir, "api", "--answer", "yes"])).toBe(2);
      expect(await runRecord([dir, "Q1", "--answer", "   "])).toBe(2);
      expect(existsSync(join(dir, "reviews/events.jsonl"))).toBe(false);
      expect(await runRecord([dir, "Q1", "--answer", "Q1a"])).toBe(0);
      const answer = (await planStatus(dir)).items.find((i) => i.id === "Q1");
      expect(answer?.state).toBe("answered");
      expect(answer?.current.map((e) => e.type === "answer" && "option" in e && e.option)).toEqual(["Q1a"]);
    },
  },
  {
    name: "an edit below a fenced line that starts with # changes the rev of the section the fence sits in",
    run: async (dir) => {
      edit(dir, "plan.md", (t) => t.replace("Everything sits behind the `holds` switch.",
        "Everything sits behind the `holds` switch.\n\n```sh\n# call it\ncurl -X DELETE /holds/1\n```\n\nCancel answers 403 for a stranger."));
      const before = await computeRevs(dir);
      edit(dir, "plan.md", (t) => t.replace("Cancel answers 403 for a stranger.", "Cancel answers 200 for anyone."));
      expect(changed(before, await computeRevs(dir))).toEqual(["api"]);
    },
  },
  {
    name: "status refuses a plan that check fails",
    run: async (dir) => {
      editJson(dir, (m) => { m.items = m.items.filter((i: Record<string, unknown>) => i.type === "step"); });
      await expect(planStatus(dir)).rejects.toThrow(/fails check with \d+ errors/);
    },
  },
  {
    name: "a second grant makes record refuse and record nothing",
    run: async (dir) => {
      editJson(dir, (m) => { m.items.push({ ...m.items.at(-1), id: "grant2", title: "Second grant" }); });
      expect(await runRecord([dir, "--all"])).toBe(1);
      expect(printed()).toContain("a plan has one grant");
      expect(existsSync(join(dir, "reviews/events.jsonl"))).toBe(false);
    },
  },
  {
    name: "the plan's title, ask and note are in the revs, through the spec view or, with none, through planRev",
    run: async (dir) => {
      for (const field of ["title", "ask", "note"]) {
        const before = await computeRevs(dir);
        editJson(dir, (m) => { m[field] = `${m[field] ?? ""} Changed.`; });
        const after = await computeRevs(dir);
        expect(changed(before, after)).toEqual(["scope"]);
        expect(after.planRev).not.toBe(before.planRev);
      }
      editJson(dir, (m) => { delete m.items.find((i: Record<string, unknown>) => i.id === "scope").body; });
      const before = await computeRevs(dir);
      editJson(dir, (m) => { m.ask = "Approve everything."; });
      const after = await computeRevs(dir);
      expect(changed(before, after)).toEqual([]);
      expect(after.planRev).not.toBe(before.planRev);
    },
  },
  {
    name: "a mention of the mark in prose beside a valid payload decodes the payload",
    run: async (dir) => {
      const payload = encodeReview(reviewOf(await computeRevs(dir), [{ id: "api", verdict: "approve" }]));
      const reviews = decodeReviews(`here is the ${MARK} line you asked for\n${message(payload)}`);
      expect(reviews.map((r) => r.items.map((i) => i.id))).toEqual([["api"]]);
    },
  },
  {
    name: "a payload whose checksum holds over text that is not JSON gets the resend message",
    run: async () => {
      const json = "{not json";
      const error = (() => { try { return decodeReviews(`${MARK}${btoa(json)}.${checksum(json)}`); } catch (e) { return e; } })();
      expect(error).toBeInstanceOf(ReviewTextError);
      expect(String(error)).toContain("is not JSON");
    },
  },
  {
    name: "a re-indented YAML source changes its item's rev",
    run: async (dir) => {
      editJson(dir, (m) => { m.items.find((i: Record<string, unknown>) => i.id === "acceptance").body.push({ view: "prose", src: "x.yaml" }); });
      writeFileSync(join(dir, "x.yaml"), "a:\n  b: 1\nc: 2\n");
      const before = await computeRevs(dir);
      edit(dir, "x.yaml", (t) => t.replace("  b: 1", "b: 1"));
      expect(changed(before, await computeRevs(dir))).toEqual(["acceptance"]);
    },
  },
  {
    name: "a line the log holds twice counts once",
    run: async (dir) => {
      await runRecord([dir, "api", "approve"]);
      edit(dir, "reviews/events.jsonl", (t) => t + t);
      expect((await readEvents(dir)).length).toBe(1);
    },
  },
  {
    name: "status names each reviewer's last submit and the view it was made in",
    run: async (dir) => {
      const revs = await computeRevs(dir);
      const by = (who: string, time: string, id: string, view?: Review["view"], planRev = revs.planRev) =>
        message(encodeReview({ ...reviewOf(revs, [{ id, verdict: "approve" }]), by: who, at: `2026-11-14T${time}:00.000Z`, view, planRev }));
      const slim = { mode: "slim" as const, unopened: ["api/envelope", "data/columns", "U1/detail"], count: 5 };
      await ingestText(dir, by("Ana Ruiz", "11:00", "api", slim), "page");
      await ingestText(dir, by("Ana Ruiz", "10:00", "scope", { mode: "full", unopened: [] }), "paste");
      await ingestText(dir, by("Lee Park", "09:00", "data", { mode: "full", unopened: [] }), "paste");
      await ingestText(dir, by("Kim Cho", "08:00", "scope", undefined, "p-before"), "paste");
      await ingestText(dir, by("Sam Diaz", "07:00", "scope", { mode: "slim", unopened: [] }), "paste");
      expect((await planStatus(dir)).reviews).toEqual([
        { by: "Ana Ruiz", at: "2026-11-14T11:00:00.000Z", via: "page", planRev: revs.planRev, acts: ["tech"], view: slim },
        { by: "Lee Park", at: "2026-11-14T09:00:00.000Z", via: "paste", planRev: revs.planRev, acts: ["tech"], view: { mode: "full", unopened: [] } },
        { by: "Kim Cho", at: "2026-11-14T08:00:00.000Z", via: "paste", planRev: "p-before", acts: ["product"] },
        { by: "Sam Diaz", at: "2026-11-14T07:00:00.000Z", via: "paste", planRev: revs.planRev, acts: ["product"], view: { mode: "slim", unopened: [] } },
      ]);
      printed();
      expect(await runStatus([dir])).toBe(0);
      expect(printed().split("\n").filter((line) => line.startsWith("Last review from"))).toEqual([
        "Last review from Ana Ruiz: 2026-11-14T11:00:00.000Z, by page, on Tech plan, in slim, 5 folds never opened.",
        "Last review from Lee Park: 2026-11-14T09:00:00.000Z, by paste, on Tech plan, in full.",
        "Last review from Kim Cho: 2026-11-14T08:00:00.000Z, by paste, on Product plan, before the last revise.",
        "Last review from Sam Diaz: 2026-11-14T07:00:00.000Z, by paste, on Product plan, in slim, every fold opened.",
      ]);
    },
  },
  {
    name: "a step may run once it, its act, what it needs, the grant and its blocking questions are settled",
    run: async (dir) => {
      const waits = async () => Object.fromEntries((await planStatus(dir)).steps.map((s) => [s.id, s.waitsOn]));
      expect((await waits()).U1).toContain("grant");
      await runRecord([dir, "--all", "--grant"]);
      expect(await waits()).toEqual({ U1: [], U2: ["Q1"], U3: [] });
      await runRecord([dir, "Q1", "--answer", "Q1a"]);
      expect((await planStatus(dir)).steps.every((s) => s.mayRun)).toBe(true);
      await runRecord([dir, "api", "changes", "--note", "400, not 403"]);
      expect((await waits()).U2).toEqual(["api"]);
    },
  },
  {
    name: "a pasted approve on the grant approves it, and a verdict on a question answers nothing",
    run: async (dir) => {
      await ingestText(dir, message(encodeReview(reviewOf(await computeRevs(dir), [{ id: "grant", verdict: "approve" }, { id: "Q1", verdict: "approve" }]))), "paste");
      const state = await stateOf(dir);
      expect([state.grant, state.Q1]).toEqual(["approved", "open"]);
    },
  },
  {
    name: "each ingest that appends writes reviews/<planRev>.html: the page with the log so far, pinned to open full",
    run: async (dir) => {
      const revs = await computeRevs(dir);
      const copy = join(dir, "reviews", `${revs.planRev}.html`);
      const eventsIn = (html: string) => JSON.parse(html.match(/<script type="application\/json" id="sign-off-data">([^<]*)<\/script>/)?.[1] ?? "{}").events.length;
      const file = join(dir, "review.txt");
      writeFileSync(file, message(encodeReview(reviewOf(revs, [{ id: "api", verdict: "approve" }]))));
      expect(await runIngest([dir, file])).toBe(0);
      const first = readFileSync(copy, "utf8");
      expect(first.split(FULL_VIEW_META)).toHaveLength(2);
      expect(first.indexOf(FULL_VIEW_META)).toBeLessThan(first.indexOf("</head>"));
      expect(eventsIn(first)).toBe(2);
      const stdin = Bun.spawn([process.execPath, ENTRY, "ingest", dir], { stdin: new Blob([message(encodeReview({ ...reviewOf(revs, [{ id: "data", verdict: "approve" }]), by: "Lee Park" }))]), stdout: "ignore", stderr: "ignore" });
      expect(await stdin.exited).toBe(0);
      expect(eventsIn(readFileSync(copy, "utf8"))).toBe(4);
    },
  },
  {
    name: "revise records the itemRev of the item's latest event and its itemRev now, and status shows the note on the reopened item",
    run: async (dir) => {
      const judged = (await computeRevs(dir)).items.data;
      await ingestText(dir, message(encodeReview(reviewOf(await computeRevs(dir), [{ id: "data", verdict: "changes", note: "Drop the predicate." }]))), "paste");
      reword(dir, "data");
      expect(await runRevise([dir, "data", "--note", "The index covers every copy now."])).toBe(0);
      const now = (await computeRevs(dir)).items.data;
      expect((await readEvents(dir)).filter((e) => e.type === "revise").map((e) => e.type === "revise" && [e.from, e.to])).toEqual([[judged, now]]);
      const data = (await planStatus(dir)).items.find((i) => i.id === "data");
      expect([data?.state, data?.revise]).toEqual(["reopened", "The index covers every copy now."]);
    },
  },
  {
    name: "revise refuses an item no review covered, an item not edited since, and a second revise of the same edit, and appends nothing",
    run: async (dir) => {
      expect(await runRevise([dir, "data", "--note", "x"])).toBe(1);
      expect(printed()).toContain("No review in the log covers data");
      await ingestText(dir, message(encodeReview(reviewOf(await computeRevs(dir), [{ id: "data", verdict: "changes", note: "Drop it." }]))), "paste");
      const log = readFileSync(join(dir, "reviews/events.jsonl"), "utf8");
      expect(await runRevise([dir, "data", "--note", "x"])).toBe(1);
      expect(printed()).toContain("data is still at itemRev");
      expect(readFileSync(join(dir, "reviews/events.jsonl"), "utf8")).toBe(log);
      reword(dir, "data");
      expect(await runRevise([dir, "data", "--note", "Dropped."])).toBe(0);
      expect(await runRevise([dir, "data", "--note", "Dropped, again."])).toBe(1);
      expect((await readEvents(dir)).filter((e) => e.type === "revise")).toHaveLength(1);
      expect(await runRevise([dir, "data"])).toBe(2);
    },
  },
];

describe("review log", () => {
  test.each(cases)("$name", async ({ run }) => run(planCopy()), 60_000);
});
