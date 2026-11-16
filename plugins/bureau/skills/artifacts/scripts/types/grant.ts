/** What the agent may do without asking, what it asks first, and when a pull request may merge with no person. */
import { z } from "zod";
import { defineType } from "../artifact.ts";

const Line = z.strictObject({ says: z.string(), key: z.string() });               // each sentence keeps the grant key it comes from

const schema = z.strictObject({
  allow: z.array(Line),
  ask: z.array(Line),
  clearance: z.string().optional(),                                                // when a pull request may merge with no person
});
export type Grant = z.infer<typeof schema>;

export default defineType({ type: "grant", v: 1, schema, facts: (grant) => ({ grant }) });
