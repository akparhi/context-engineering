/** The tests that prove the acceptance rows, each with the unit that holds it. */
import { z } from "zod";
import { defineType, type RuleFinding } from "../artifact.ts";
import { duplicateIds, id, ids } from "./shared.ts";

const Test = z.strictObject({
  id, type: z.enum(["unit", "behavior", "e2e", "live"]), name: z.string(), proves: ids, unit: id,
  file: z.string().optional(),                                                     // a path in the unit's repo, not a plan file
  says: z.string(),
  proposed: z.boolean().optional(),                                                // the plan does not name it yet
  run: z.string().optional(),
});

const schema = z.strictObject({ tests: z.array(Test) });
export type TestPlan = z.infer<typeof schema>;

const isOneFile = (path: string) => !/[\s,]/.test(path) && /\.[^./]+$/.test(path);

/** Each test proves a row. Each but a `live` test names the one file that holds it and the command that runs it, so the build runs
 *  the list as written. A `live` test is a check run by hand: its `says` is the instruction, and its evidence goes in the PR. */
function* rules({ tests }: TestPlan): Generator<RuleFinding> {
  yield* duplicateIds([["test", tests.map((t) => t.id)]]);
  for (const t of tests) {
    if (!t.proves.length) yield { rule: "test", message: `test ${t.id} proves no acceptance row` };
    if (t.type === "live") continue;
    if (!t.run?.trim()) yield { rule: "test", message: `test ${t.id} has no run command. Give the command that runs this one test` };
    if (!t.file?.trim()) yield { rule: "test", message: `test ${t.id} has no file. Name the one file that holds it` };
    else if (!isOneFile(t.file)) yield { rule: "test", message: `test ${t.id}: "${t.file}" is not one file. Name the one file that holds it` };
  }
}

export default defineType({ type: "test-plan", v: 1, schema, rules: (data) => [...rules(data)] });
