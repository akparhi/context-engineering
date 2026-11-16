/** Act one, in product words: the problem, who has it, and the requirements every other artifact serves. A plan with no product
 *  act holds `{ none: "<why>" }`. */
import { z } from "zod";
import { defineType, type RuleFinding } from "../artifact.ts";
import { codeSpans, duplicateIds, id } from "./shared.ts";

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

const schema = z.union([Product, z.strictObject({ none: z.string() })]);
export type Requirements = z.infer<typeof schema>;

function* rules(data: Requirements): Generator<RuleFinding> {
  yield* codeSpans("", data);
  if (!("none" in data)) yield* duplicateIds([["requirement", data.requirements.map((r) => r.id)]]);
}

export default defineType({
  type: "requirements", v: 1, schema,
  rules: (data) => [...rules(data)],
  // With no product act, the reason it has none is the scope a reader approves.
  facts: (data) => ({ scope: "none" in data ? data : data.requirements }),
});
