/** The numbers the plan rests on, each with where it was read. */
import { z } from "zod";
import { defineType } from "../artifact.ts";
import { ids } from "./shared.ts";

const Figure = z.strictObject({
  value: z.string(), label: z.string(),
  source: z.string().optional(),                                                   // where the number was read, in words; not a plan file
  inferred: z.boolean().optional(), serves: ids.optional(),
});

const schema = z.strictObject({ figures: z.array(Figure) });
export type Evidence = z.infer<typeof schema>;

export default defineType({ type: "evidence", v: 1, schema });
