import { z } from "zod";
import { defineType, type RuleFinding } from "../artifact.ts";
import { FileRef } from "../fileref.ts";
import { duplicateIds, id, ids } from "./shared.ts";

const Option = z.strictObject({ id, label: z.string(), detail: z.string().optional(), facts: z.array(z.tuple([z.string(), z.string()])).optional() });
const Decision = z.strictObject({
  id, title: z.string(), why: z.string().optional(),
  source: FileRef.optional(), heading: z.string().optional(),
  serves: ids.optional(), dependsOn: ids.optional(),
  options: z.array(Option), chosen: id,
}).refine((d) => d.heading === undefined || d.source !== undefined, { message: "a heading needs a source file", path: ["heading"] });

const schema = z.strictObject({ decisions: z.array(Decision) });
export type Decisions = z.infer<typeof schema>;

function rules(data: Decisions): RuleFinding[] {
  const out = duplicateIds([
    ["decision", data.decisions.map((d) => d.id)],
    ["option", data.decisions.flatMap((d) => d.options.map((o) => o.id))],
  ]);
  for (const d of data.decisions) {
    if (!d.options.some((o) => o.id === d.chosen)) out.push({ rule: "id", message: `decision ${d.id}: option ${d.chosen} does not exist` });
  }
  return out;
}

export default defineType({
  type: "decisions",
  v: 1,
  schema,
  files: (data) => data.decisions.flatMap((d) => (d.source ? [{ ref: d.source, heading: d.heading }] : [])),
  rules,
});
