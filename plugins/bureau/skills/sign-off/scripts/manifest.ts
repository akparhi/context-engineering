/** The `sign-off.json` contract and the review log's event shape, as zod schemas. The types are inferred from
 *  them, so `check`, `build` and the viewer cannot drift from the validator. */
import { z } from "zod";
import { ACTS, MARKS, SECTIONS, SKETCHES, TOUCHES } from "./model.ts";

const id = z.string().min(1);
const ids = z.array(id);
const Section = z.enum(SECTIONS);
const Mark = z.enum(MARKS);
const Touch = z.enum(TOUCHES);

const Product = z.strictObject({
  problem: z.string(),
  users: z.array(z.strictObject({ who: z.string(), need: z.string() })),
  notFor: z.string().optional(),
  goals: z.array(z.string()),
  nonGoals: z.array(z.strictObject({ what: z.string(), why: z.string().optional() })),
  requirements: z.array(z.strictObject({ id, title: z.string(), text: z.string(), who: z.string().optional() })),
  rollout: z.array(z.strictObject({ stage: z.string(), says: z.string() })),       // audience words, never branch names
  metric: z.strictObject({ name: z.string(), target: z.string(), readFrom: z.string().optional() }).optional(),
});

const pair = z.tuple([z.string(), z.string()]);
/** What each sketch draws in its region. */
const SAMPLES = {
  nav: z.strictObject({ items: z.array(z.strictObject({ t: z.string(), open: z.boolean().optional(), sub: z.boolean().optional(),
    entry: z.boolean().optional() })), entryHidden: z.boolean().optional() }),
  figures: z.strictObject({ figures: z.array(pair), note: z.string().optional() }),
  tabs: z.strictObject({ tabs: z.array(z.tuple([z.string(), z.number()])) }),
  filters: z.strictObject({ search: z.string(), pills: z.array(z.string()) }),
  table: z.strictObject({ columns: z.array(z.string()).optional(), rows: z.array(z.union([z.array(z.string()), z.record(z.string(), z.string())])) }),
  pagination: z.strictObject({ text: z.string() }),
  message: z.strictObject({ tone: z.enum(["empty", "wait", "error", "lock"]), title: z.string(), text: z.string(), action: z.string().optional() }),
  sheet: z.strictObject({ title: z.string(), sub: z.string().optional(), badge: z.string().optional(), figures: z.array(pair).optional(),
    bars: z.array(z.number()).optional(), rows: z.array(z.array(z.string())).optional(), button: z.string().optional() }),
  form: z.strictObject({ title: z.string(), fields: z.array(pair), button: z.string(), note: z.string().optional() }),
} satisfies Record<(typeof SKETCHES)[number], z.ZodType>;
const regionBase = { mark: z.union([Mark, z.literal("copy")]), name: z.string(), serves: ids.optional(), component: id.optional() };
const Region = z.discriminatedUnion("sketch", SKETCHES.map((sketch) =>
  z.strictObject({ ...regionBase, sketch: z.literal(sketch), sample: SAMPLES[sketch].optional() })) as unknown as
  [RegionOf<"nav">, ...RegionOf<(typeof SKETCHES)[number]>[]]);
type RegionOf<S extends (typeof SKETCHES)[number]> = S extends unknown ? z.ZodObject<typeof regionBase & { sketch: z.ZodLiteral<S>; sample: z.ZodOptional<(typeof SAMPLES)[S]> }, z.core.$strict> : never;
const ScreenState = z.strictObject({
  id, screen: z.string(), label: z.string(), when: z.string(), regions: z.array(Region), serves: ids,
  chart: z.string().optional(), subtitle: z.string().optional(),
  from: id.optional(), on: z.string().optional(),                                  // the flow strip: the state before, and the event
  states: z.array(z.strictObject({ id: z.string(), says: z.string() })).optional(), // the page states in code this picture draws
});
const Component = z.strictObject({
  id, name: z.string(), role: z.enum(["route", "layout", "component", "data", "wiring"]), does: z.string(), mark: Mark,
  parent: id.optional(), reads: ids.optional(), file: z.string().optional(), serves: ids.optional(),
  shows: id.optional(),                                                            // the component it appears through
  repo: z.string().optional(),                                                     // a key of `repos`; `file` is relative to it
});
const Field = z.strictObject({ name: z.string(), type: z.string(), means: z.string().optional(), column: z.string().optional() });
const Endpoint = z.strictObject({
  id, method: z.string(), path: z.string(), mark: Mark, answers: z.string(),
  who: z.strictObject({ text: z.string(), mark: Mark }),
  narrows: z.array(z.strictObject({ name: z.string(), means: z.string().optional(),
    type: z.string(), default: z.string().optional(), serves: ids.optional() })).optional(),
  outcomes: z.array(z.strictObject({ status: z.number().int(), when: z.string(), body: z.array(Field).optional(),
    title: z.string(), shape: z.string().optional(), serves: ids.optional() })),
  serves: ids,
  noTransition: z.string().optional(),                                             // why this write moves no chart state, like a comment
});
const Acceptance = z.strictObject({
  id, requirement: id.nullable(),                                                  // null: a row that checks no requirement
  given: z.string().optional(), when: z.string().optional(), then: z.string().optional(),
  says: z.string().optional(),                                                     // one sentence in place of given, when, then
  screens: ids.optional(),
  guards: z.string().optional(), addedFor: z.string().optional(),                  // `rule:<name>` it proves, or the broken one it was added for
}).refine((a) => a.says || (a.when && a.then), "an acceptance row needs `says`, or `when` and `then`");
const Test = z.strictObject({
  id, type: z.enum(["unit", "behavior", "e2e", "live"]), name: z.string(), proves: ids, unit: id, file: z.string().optional(),
  says: z.string(),
  proposed: z.boolean().optional(),                                                // the plan does not name it yet
  run: z.string().optional(),
});
const PullRequest = z.strictObject({
  id, title: z.string(), repo: z.string(), branch: z.string(), from: z.string(), into: z.string(),
  promotes: z.array(z.string()).optional(), after: ids.optional(), steps: ids, review: z.string(),
  merge: z.strictObject({ by: z.enum(["human", "agent", "bot"]), why: z.string() }),
  evidence: z.array(z.string()),
  reviewer: z.string().optional(),
  planInto: z.string().optional(),                                                 // the base the plan named, when it disagrees with `into`
  note: z.string().optional(), waits: z.string().optional(),
});
const Risk = z.strictObject({ id, title: z.string(), bound: z.string(), serves: ids });
const Default = z.strictObject({ id, says: z.string(), note: z.string().optional(), serves: ids });
const Facts = z.strictObject({
  screens: z.array(ScreenState).optional(), components: z.array(Component).optional(), endpoints: z.array(Endpoint).optional(),
  acceptance: z.array(Acceptance).optional(), tests: z.array(Test).optional(), prs: z.array(PullRequest).optional(),
  risks: z.array(Risk).optional(), defaults: z.array(Default).optional(),
});

/** What makes a chart step happen. Exactly one key. */
const Trigger = z.union([
  z.strictObject({ endpoint: id }), z.strictObject({ event: z.string() }), z.strictObject({ job: z.string() }),
  z.strictObject({ ops: z.string() }), z.strictObject({ time: z.string() }),            // `time`: nothing writes; time passes
]);
const Run = z.strictObject({ id, label: z.string(), note: z.string(), dir: z.string() });          // `dir` holds statechart's report.json
const Block = z.discriminatedUnion("view", [
  z.strictObject({ view: z.literal("spec") }),
  z.strictObject({ view: z.literal("screens"), ids: ids.optional() }),
  z.strictObject({ view: z.literal("figures"), facts: z.array(z.strictObject({ value: z.string(), label: z.string(), source: z.string().optional(),
    inferred: z.boolean().optional(), serves: ids.optional() })) }),
  z.strictObject({ view: z.literal("statechart"), mmd: z.string().optional(), says: z.record(z.string(), z.string()), // `mmd`: a bare chart, every rule not checked
    terms: z.array(z.strictObject({ word: z.string(), means: z.string() })).optional(),
    runs: z.array(Run).optional(),                                                 // versions of the model; the first is this plan
    serves: z.record(z.string(), ids).optional(),                                  // rule -> requirements it guards
    hide: z.array(z.string()).optional(),                                          // rules too technical to list
    parked: z.record(z.string(), z.string()).optional(),                           // rule -> why it guards no requirement yet
    steps: z.record(z.string(), z.string()).optional(),                            // step words -> short arrow label
    notes: z.record(z.string(), z.strictObject({ verdict: z.enum(["open", "fixed"]), text: z.string(), // `<run>:<rule>` -> what a break means; no rule reads `verdict`
      decision: z.strictObject({ chosen: z.tuple([z.string(), z.string()]), other: z.tuple([z.string(), z.string()]) }).optional() })).optional(),
    triggers: z.record(z.string(), Trigger).optional(),                            // step words, as the chart draws them -> what makes the step happen
    stored: z.record(z.string(), z.string()).optional() }),                         // chart state -> the `table.column` it lives in; absent: transient or derived
  z.strictObject({ view: z.literal("erd"), src: z.string(),                        // DBML, derived from `sql` for the drawing only
    sql: z.string().optional(),                                                    // Postgres DDL, and the source; `itemRev` hashes it in place of `src`. `ddl`, `table-mark` and `index` run only with it
    base: z.string().optional(),                                                   // the baseline DDL that `sql` applies to
    tables: z.array(z.strictObject({ name: z.string(), mark: Mark, role: z.string().optional(), serves: ids.optional() })).optional(),
    indexes: z.array(z.strictObject({ name: z.string(), unique: z.boolean().optional(), // as the applied schema must have them
      where: z.string().optional(), serves: ids.optional() })).optional(),
    says: z.string().optional(), writers: z.array(z.strictObject({ column: z.string(), states: z.array(z.string()) })).optional(),
    columns: z.array(z.strictObject({ column: z.string(), serves: ids })).optional(),
    unused: z.array(z.strictObject({ value: z.string(), why: z.string() })).optional(), // enum values that serve nothing
    loose: z.array(z.strictObject({ from: z.string(), to: z.string() })).optional() }), // joins by id with no foreign key
  z.strictObject({ view: z.literal("endpoints"), ids: ids.optional(),
    src: z.string().optional(),                                                    // the OpenAPI 3.1 fragment; `itemRev` hashes it
    access: z.strictObject({ who: z.string(), permission: z.string(), switch: z.string().optional(), serves: ids, ask: id.optional() }).optional(),
    envelope: z.string().optional(), shapes: z.record(z.string(), z.string()).optional() }),
  z.strictObject({ view: z.literal("components"), note: z.string().optional() }),
  z.strictObject({ view: z.literal("trace"), requirements: ids.optional() }),
  z.strictObject({ view: z.literal("prs"), bot: z.string().optional(), label: z.string().optional(), notes: z.array(z.string()).optional() }),
  z.strictObject({ view: z.literal("prose"), src: z.string() }),
  z.strictObject({ view: z.literal("decisions") }),
  z.strictObject({ view: z.literal("units"), note: z.string().optional() }),
  z.strictObject({ view: z.literal("risks") }),
]);

const Option = z.strictObject({ id, label: z.string(), detail: z.string().optional(), facts: z.array(z.tuple([z.string(), z.string()])).optional() });
const base = {
  id, section: Section, title: z.string(), why: z.string().optional(),
  body: z.array(Block).optional(),
  source: z.string().optional(),                                                   // `plan.md#<heading>`; its text goes into `itemRev`
  serves: ids.optional(),
};
const Item = z.discriminatedUnion("type", [
  z.strictObject({ ...base, type: z.literal("part"), touches: z.array(Touch) }),
  z.strictObject({ ...base, type: z.literal("step"), touches: z.array(Touch), repo: z.string().optional(), files: z.array(z.string()).optional(),
    mergesAfter: ids.optional(),                                                   // units whose pull requests merge first; it never delays the start
    startsAfter: z.strictObject({ units: ids.min(1), reason: z.string().trim().min(1, "a unit that starts late needs a reason") }).optional(), // only when a contract is not fixed yet
    delivers: ids.optional(), tasks: z.number().int().optional(), qa: z.string().optional(), done: z.string().optional() }),
  z.strictObject({ ...base, type: z.literal("decision"), touches: z.array(Touch), options: z.array(Option), chosen: id }),
  z.strictObject({ ...base, type: z.literal("question"), options: z.array(Option).optional(), recommended: id.optional(),
    default: id.nullable(), blocks: ids, placeholder: z.string().optional() }), // a null default blocks
  z.strictObject({ ...base, type: z.literal("grant"),
    allow: z.array(z.strictObject({ says: z.string(), key: z.string() })),        // each sentence keeps the grant key it comes from
    ask: z.array(z.strictObject({ says: z.string(), key: z.string() })),
    clearance: z.string().optional() }),                                           // when a pull request may merge with no person
]);

/** A link the page prints in its header, so only web schemes: a `javascript:` or `data:` URL never gets in. */
const webUrl = z.url({ protocol: /^https?$/, error: "must be an http or https URL" });

export const Manifest = z.strictObject({
  format: z.literal(1),
  id, kind: z.enum(["change", "design", "questions"]), title: z.string(), ask: z.string(),
  revision: z.string().optional(),                                                 // the label people use for this revision, like r8
  ticket: webUrl.optional(),                                                       // the ticket `id` names; the header links the id to it. Presentation: no rev hashes it
  sources: z.array(z.strictObject({ label: z.string().min(1), url: webUrl })).optional(), // designs and documents the plan came from, linked after the revision. Presentation only
  note: z.string().optional(),
  repos: z.record(z.string(), z.string()).optional(),                              // repo name -> its checkout, relative to the plan folder
  product: z.union([Product, z.strictObject({ none: z.string() })]),
  facts: Facts,
  items: z.array(Item),
});

const eventBase = { id, at: z.iso.datetime(), by: z.string(), via: z.enum(["page", "paste", "chat"]), planRev: z.string() };
const answerBase = { ...eventBase, type: z.literal("answer"), item: id, itemRev: z.string() };
/** A free-text answer. A blank one would settle a blocking question with nothing said. */
export const answerText = z.string().trim().min(1, "an answer is blank");
/** The view at Submit, and the fold keys that were closed then and never drawn open for this reader on this planRev. Drawn is not read.
 *  `count` is how many folds the keys stand for, since one part key stands for each of its rows. An older page sent no count. */
export const SubmitView = z.strictObject({ mode: z.enum(["slim", "full"]), unopened: z.array(z.string()), count: z.number().int().nonnegative().optional() });
export const Event = z.union([
  z.strictObject({ ...eventBase, type: z.literal("verdict"), item: id, itemRev: z.string(), verdict: z.enum(["approve", "changes"]), note: z.string().optional() }),
  z.union([z.strictObject({ ...answerBase, option: id }), z.strictObject({ ...answerBase, text: answerText })]),
  z.strictObject({ ...eventBase, type: z.literal("comment"), item: id, itemRev: z.string(), anchor: z.string().optional(), text: z.string() }),
  z.strictObject({ ...eventBase, type: z.literal("submit"), acts: z.array(z.enum(ACTS)), source: z.string().optional(),
    view: SubmitView.optional() }),
  z.strictObject({ ...eventBase, type: z.literal("revise"), item: id, from: z.string(), to: z.string(), note: z.string(), lines: z.array(z.string()).optional(),
    before: z.record(z.string(), z.unknown()).optional() }),                       // `<id>.<field>` -> its value before the revision
]);

export type Manifest = z.infer<typeof Manifest>;
export type Item = z.infer<typeof Item>;
export type Block = z.infer<typeof Block>;
export type Event = z.infer<typeof Event>;
export type SubmitView = z.infer<typeof SubmitView>;
export type { Act, Section } from "./model.ts";
export type Product = z.infer<typeof Product>;
