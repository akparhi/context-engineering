/** A model of the plan's behavior that the statechart skill checks with TLC. Each run is one version of the model, and the first
 *  run is this plan. A run's folder holds statechart's `report.json`, and `report.md` when the run wrote one. */
import { posix } from "node:path";
import { z } from "zod";
import { defineType, type RuleFinding } from "../artifact.ts";
import { FileRef, type NamedFile, type Read } from "../fileref.ts";
import { canon } from "../rev.ts";
import { duplicateIds, id, ids } from "./shared.ts";

/** What makes a chart step happen. Exactly one key. */
const Trigger = z.union([
  z.strictObject({ endpoint: id }), z.strictObject({ event: z.string() }), z.strictObject({ job: z.string() }),
  z.strictObject({ ops: z.string() }), z.strictObject({ time: z.string() }),            // `time`: nothing writes; time passes
]);
const Run = z.strictObject({ id, label: z.string(), note: z.string(), dir: FileRef });
const Note = z.strictObject({
  verdict: z.enum(["open", "fixed"]), text: z.string(),
  decision: z.strictObject({ chosen: z.tuple([z.string(), z.string()]), other: z.tuple([z.string(), z.string()]) }).optional(),
});

export const Statechart = z.strictObject({
  mmd: FileRef.optional(),                                                          // a bare chart, every rule not checked
  says: z.record(z.string(), z.string()),                                           // rule -> its words
  terms: z.array(z.strictObject({ word: z.string(), means: z.string() })).optional(),
  runs: z.array(Run).optional(),                                                    // versions of the model; the first is this plan
  serves: z.record(z.string(), ids).optional(),                                     // rule -> requirements it guards
  hide: z.array(z.string()).optional(),                                             // rules too technical to list
  parked: z.record(z.string(), z.string()).optional(),                              // rule -> why it guards no requirement yet
  steps: z.record(z.string(), z.string()).optional(),                               // step words -> short arrow label
  notes: z.record(z.string(), Note).optional(),                                     // `<run>:<rule>` -> what a break means
  triggers: z.record(z.string(), Trigger).optional(),                               // step words, as the chart draws them -> what makes the step happen
  stored: z.record(z.string(), z.string()).optional(),                              // chart state -> the `table.column` it lives in; absent: transient or derived
});
export type Statechart = z.infer<typeof Statechart>;
type Run = z.infer<typeof Run>;

/** The fields of statechart's `report.json` this skill reads. Loose, so the rest of a report passes through as written. */
const Report = z.looseObject({
  v: z.unknown(),
  rules: z.array(z.looseObject({ outcome: z.string() })),
  chart: z.looseObject({
    states: z.array(z.looseObject({ path: z.array(z.string()) })),
    arrows: z.array(z.looseObject({ step: z.string() })),
  }).optional(),
});
type Report = z.infer<typeof Report>;

const inRun = (run: Run, name: string) => FileRef.parse(posix.join(run.dir, name));

const byCanon = (values: unknown[]) => values.map(canon).sort();

/** A report's states and arrows as sets. Their order in `report.json` only moves the drawing, which is layout. */
function reportWords(text: string): string {
  const raw: unknown = JSON.parse(text), parsed = Report.safeParse(raw);
  const chart = parsed.success ? parsed.data.chart : undefined;
  return canon(chart ? { ...parsed.data, chart: { ...chart, states: byCanon(chart.states), arrows: byCanon(chart.arrows) } } : raw);
}

/** `report.md` opens with "TLC reached 111 states and 423 steps. ...", the only sentence the page shows from it. */
const checkedLine = (text: string) => text.match(/^TLC reached .*$/m)?.[0] ?? "";

/** A run's `report.json`, or why it cannot be read. Null when the file is missing, which the runner's `file` rule reports. */
function readReport(read: Read, run: Run): { report: Report } | { error: string } | null {
  const ref = inRun(run, "report.json"), text = read(ref);
  if (text === null) return null;
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (error) {
    return { error: `Behavior: ${ref} is not JSON: ${(error as Error).message}` };
  }
  const parsed = Report.safeParse(raw);
  if (parsed.success) return { report: parsed.data };
  return { error: `Behavior: ${ref} is not a statechart report: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(top)"}: ${i.message}`).join("; ")}` };
}

/** The first run's `report.json` when it reads as version 1: the verdict on this plan's own model. */
export function planReport(chart: Statechart, read: Read): Report | null {
  const run = chart.runs?.[0];
  const found = run ? readReport(read, run) : null;
  return found && "report" in found && found.report.v === 1 ? found.report : null;
}

/** Splits an arrow label that statechart joined with " or " into known step words, longest match first. */
export function stepsOf(label: string, known: Set<string>) {
  const words = label.split(" or "), steps: string[] = [], unknown: string[] = [];
  for (let i = 0; i < words.length;) {
    let j = words.length;
    while (j > i && !known.has(words.slice(i, j).join(" or "))) j--;
    if (j > i) { steps.push(words.slice(i, j).join(" or ")); i = j; } else unknown.push(words[i++]);
  }
  return { steps, unknown };
}

function rulesOf(chart: Statechart, read: Read): RuleFinding[] {
  const runs = chart.runs ?? [];
  const out = duplicateIds([["run", runs.map((r) => r.id)]]);
  const add = (rule: string, message: string, level?: "warning") => out.push({ rule, message, ...(level && { level }) });
  const ruleNames = new Set(Object.keys(chart.says));
  const runIds = new Set(runs.map((r) => r.id));

  const wantRule = (where: string, rule: string) => { if (!ruleNames.has(rule)) add("ref", `Behavior: ${where} names the rule ${rule}, which says does not define`); };
  for (const rule of Object.keys(chart.serves ?? {})) wantRule("serves", rule);
  for (const rule of chart.hide ?? []) wantRule("hide", rule);
  for (const rule of Object.keys(chart.parked ?? {})) wantRule("parked", rule);
  for (const key of Object.keys(chart.notes ?? {})) {
    const [run, rule, ...rest] = key.split(":");
    if (!run || !rule || rest.length > 0) { add("ref", `Behavior: the note "${key}" is not <run>:<rule>`); continue; }
    if (!runIds.has(run)) add("ref", `Behavior: the note "${key}" names the run ${run}, which runs does not have`);
    wantRule(`the note "${key}"`, rule);
  }

  const reports = runs.map((run) => readReport(read, run));
  for (const r of reports) if (r && "error" in r) add("ref", r.error);
  const first = reports[0];
  if (first && "report" in first && first.report.v !== 1) {
    add("ref", `Behavior: ${inRun(runs[0], "report.json")} has version ${String(first.report.v)}, and check reads version 1. Run statechart again`);
  }

  const drawn = first && "report" in first && first.report.v === 1 ? first.report.chart : undefined;
  if (drawn) {
    const known = new Set(Object.keys(chart.triggers ?? {}));
    const split = drawn.arrows.map((a) => stepsOf(a.step, known));
    const seen = new Set(split.flatMap((s) => s.steps));
    for (const step of known) if (!seen.has(step)) add("ref", `Behavior: triggers names the step "${step}", which the chart does not draw`);
    const states = new Set(drawn.states.map((s) => s.path.at(-1) ?? ""));
    for (const state of Object.keys(chart.stored ?? {})) if (!states.has(state)) add("ref", `Behavior: stored names the state "${state}", which the chart does not draw`);
    for (const step of new Set(split.flatMap((s) => s.unknown))) {
      add("trigger", `Behavior: the chart step "${step}" has no trigger. Name the endpoint, event, job, ops tool or time that makes it happen`);
    }
  }

  for (const [rule, reqs] of Object.entries(chart.serves ?? {})) {
    if (!reqs.length && !chart.hide?.includes(rule)) add("trace", `trace hole: rule ${rule} guards no requirement`, "warning");
  }
  return out;
}

export default defineType({
  type: "statechart",
  v: 1,
  schema: Statechart,
  files: (chart): NamedFile[] => [
    ...(chart.mmd ? [{ ref: chart.mmd }] : []),
    ...(chart.runs ?? []).flatMap((run): NamedFile[] => [
      { ref: inRun(run, "report.json"), words: reportWords },
      { ref: inRun(run, "report.md"), optional: true, words: checkedLine },
    ]),
  ],
  rules: (chart, { read }) => rulesOf(chart, read),
  facts: (chart, { read }) => {
    const report = planReport(chart, read);
    if (report && report.rules.every((r) => r.outcome === "holds")) return {};
    // With no report the plan's model has checked nothing, so every rule is open.
    const rules = report ? report.rules.filter((r) => r.outcome !== "holds") : null;
    const run = chart.runs?.[0]?.id;
    const notes = Object.fromEntries(Object.entries(chart.notes ?? {}).filter(([key]) => key.startsWith(`${run}:`)));
    return { "open-rule": { rules, notes } };
  },
});
