/** The units of work and the pull requests that ship them. */
import { z } from "zod";
import { defineType, type RuleFinding } from "../artifact.ts";
import { FileRef } from "../fileref.ts";
import { duplicateIds, id, ids } from "./shared.ts";

const Unit = z.strictObject({
  id, title: z.string(), why: z.string().optional(),
  source: FileRef.optional(), heading: z.string().optional(),                      // the plan text this unit draws from; it goes into the rev
  serves: ids.optional(),
  mergesAfter: ids.optional(),                                                     // units whose pull requests merge first; it never delays the start
  startsAfter: z.strictObject({ units: ids, reason: z.string().optional() }).optional(), // the plan tier fails it without a reason
  repo: z.string().optional(),
  files: z.array(z.string()).optional(),                                           // paths in the repo's checkout, not plan files
  delivers: ids.optional(),                                                        // endpoint ids, component ids, or `db:<table>`
  tasks: z.number().int().optional(), qa: z.string().optional(), done: z.string().optional(),
}).refine((u) => u.heading === undefined || u.source !== undefined, "a heading names a section of `source`, so it needs a source");

const PullRequest = z.strictObject({
  id, title: z.string(), repo: z.string(), branch: z.string(), from: z.string(), into: z.string(),
  promotes: z.array(z.string()).optional(), after: ids.optional(),
  steps: ids,                                                                      // the units it ships
  review: z.string(),
  merge: z.strictObject({ by: z.enum(["human", "agent", "bot"]), why: z.string() }),
  evidence: z.array(z.string()),
  reviewer: z.string().optional(),
  planInto: z.string().optional(),                                                 // the base the plan named, when it disagrees with `into`
  note: z.string().optional(), waits: z.string().optional(),
});

const schema = z.strictObject({
  units: z.array(Unit),
  prs: z.array(PullRequest),
  bot: z.string().optional(), label: z.string().optional(), notes: z.array(z.string()).optional(),
  note: z.string().optional(),
});
export type PrPlan = z.infer<typeof schema>;

function* rules({ units, prs }: PrPlan): Generator<RuleFinding> {
  yield* duplicateIds([["unit", units.map((u) => u.id)], ["pull request", prs.map((p) => p.id)]]);
  const unitIds = new Set(units.map((u) => u.id)), prIds = new Set(prs.map((p) => p.id));
  for (const p of prs) {
    for (const after of p.after ?? []) if (!prIds.has(after)) yield { rule: "ref", message: `PR ${p.id}: PR ${after} does not exist` };
    for (const step of p.steps) if (!unitIds.has(step)) yield { rule: "ref", message: `PR ${p.id}: unit ${step} does not exist` };
  }
  const shipped = new Set(prs.flatMap((p) => p.steps));
  for (const u of units) if (!shipped.has(u.id)) yield { rule: "ref", message: `unit ${u.id} ships in no pull request. Name it in a pull request's steps` };
}

export default defineType({
  type: "pr-plan", v: 1, schema,
  files: ({ units }) => units.flatMap((u) => (u.source ? [{ ref: u.source, heading: u.heading }] : [])),
  rules: (data) => [...rules(data)],
  facts: ({ prs }) => {
    const alone = prs.filter((pr) => pr.merge.by !== "human").map((pr) => [pr.id, pr.merge]);
    return alone.length > 0 ? { "merges-alone": alone } : {};
  },
});
