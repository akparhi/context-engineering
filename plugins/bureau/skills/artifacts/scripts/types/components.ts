/** The parts of the code the plan builds or reuses, and how they nest. */
import { z } from "zod";
import { defineType, type RuleFinding } from "../artifact.ts";
import { duplicateIds, id, ids, Mark } from "./shared.ts";

const Component = z.strictObject({
  id, name: z.string(), role: z.enum(["route", "layout", "component", "data", "wiring"]), does: z.string(), mark: Mark,
  parent: id.optional(), reads: ids.optional(), file: z.string().optional(), serves: ids.optional(),
  shows: id.optional(),                                                            // the component it appears through
  repo: z.string().optional(),                                                     // a key of the plan's `repos`; `file` is relative to it
});

const schema = z.strictObject({ components: z.array(Component), note: z.string().optional() });
export type Components = z.infer<typeof schema>;

function* rules({ components }: Components): Generator<RuleFinding> {
  const known = new Set(components.map((c) => c.id));
  yield* duplicateIds([["component", components.map((c) => c.id)]]);
  for (const c of components) {
    for (const other of [c.parent, c.shows]) {
      if (other && !known.has(other)) yield { rule: "ref", message: `component ${c.id}: component ${other} does not exist` };
    }
    if (c.mark === "reused" && (!c.repo || !c.file)) {
      yield { rule: "reuse", message: `component ${c.id} (${c.name}) is reused, so it needs a repo and a file to show it exists` };
    }
    if (!c.serves?.length) yield { rule: "trace", level: "warning", message: `trace hole: component ${c.name} serves no requirement` };
  }
}

export default defineType({ type: "components", v: 1, schema, rules: (data) => [...rules(data)] });
