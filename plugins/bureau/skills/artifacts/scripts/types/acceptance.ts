/** The acceptance rows: what a reader can check to know a requirement is met. */
import { z } from "zod";
import { defineType, type RuleFinding } from "../artifact.ts";
import { duplicateIds, id, ids } from "./shared.ts";

const Row = z.strictObject({
  id, requirement: id.nullable(),                                                  // null: a row that checks no requirement
  given: z.string().optional(), when: z.string().optional(), then: z.string().optional(),
  says: z.string().optional(),                                                     // one sentence in place of given, when, then
  screens: ids.optional(),
  guards: z.string().optional(), addedFor: z.string().optional(),                  // `rule:<name>` it proves, or the broken one it was added for
}).refine((a) => a.says || (a.when && a.then), "an acceptance row needs `says`, or `when` and `then`");

const schema = z.strictObject({ rows: z.array(Row) });
export type Acceptance = z.infer<typeof schema>;

function* rules({ rows }: Acceptance): Generator<RuleFinding> {
  yield* duplicateIds([["acceptance row", rows.map((r) => r.id)]]);
  for (const row of rows) {
    if (row.requirement === null) yield { rule: "trace", level: "warning", message: `trace hole: acceptance ${row.id} checks no requirement` };
  }
}

export default defineType({
  type: "acceptance", v: 1, schema,
  rules: (data) => [...rules(data)],
  facts: ({ rows }) => ({ acceptance: rows }),
});
