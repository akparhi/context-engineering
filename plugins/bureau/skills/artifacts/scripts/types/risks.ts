import { z } from "zod";
import { defineType } from "../artifact.ts";
import { duplicateIds, id, ids } from "./shared.ts";

const Risk = z.strictObject({ id, title: z.string(), bound: z.string(), serves: ids });
const Default = z.strictObject({ id, says: z.string(), note: z.string().optional(), serves: ids });

const schema = z.strictObject({ risks: z.array(Risk).optional(), defaults: z.array(Default).optional() });
export type Risks = z.infer<typeof schema>;

const rules = (data: Risks) =>
  duplicateIds([["risk", (data.risks ?? []).map((r) => r.id)], ["default", (data.defaults ?? []).map((d) => d.id)]]);

export default defineType({ type: "risks", v: 1, schema, rules });
