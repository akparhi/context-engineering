import { z } from "zod";
import { defineType, type RuleFinding } from "../artifact.ts";
import { FileRef } from "../fileref.ts";
import { duplicateIds, id, ids, Mark, marked } from "./shared.ts";

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

const schema = z.strictObject({
  endpoints: z.array(Endpoint).optional(),
  src: FileRef.optional(),                                                         // the OpenAPI 3.1 fragment
  access: z.strictObject({
    who: z.string(), permission: z.string(), switch: z.string().optional(), serves: ids,
    ask: id.optional(),                                                            // a sign-off question's id, which only sign-off resolves
  }).optional(),
  envelope: z.string().optional(),
  shapes: z.record(z.string(), z.string()).optional(),
});
export type Api = z.infer<typeof schema>;

function rules(data: Api): RuleFinding[] {
  const out = duplicateIds([["endpoint", (data.endpoints ?? []).map((e) => e.id)]]);
  for (const e of data.endpoints ?? []) {
    if (e.outcomes.length === 0) out.push({ rule: "outcome", message: `endpoint ${e.id} (${e.method} ${e.path}) has no outcome. Name what it answers and when` });
  }
  return out;
}

export default defineType({
  type: "api",
  v: 1,
  schema,
  files: (data) => (data.src ? [{ ref: data.src }] : []),
  rules,
  facts: ({ endpoints = [], access }) => {
    const changed = endpoints.filter(marked), callers = endpoints.filter((e) => marked(e.who));
    return {
      ...(changed.length > 0 && { api: changed }),
      ...(callers.length > 0 && { permission: { endpoints: callers.map(({ id, method, path, who }) => ({ id, method, path, who })), access } }),
    };
  },
});
