/** The page states a person sees, each as regions drawn by a sketch with a sample of what it shows. */
import { z } from "zod";
import { defineType, type RuleFinding } from "../artifact.ts";
import { codeSpans, duplicateIds, id, ids, Mark, marked } from "./shared.ts";

const pair = z.tuple([z.string(), z.string()]);
const regionBase = { mark: z.union([Mark, z.literal("copy")]), name: z.string(), serves: ids.optional(), component: id.optional() };
/** A region, and what its sketch draws there. */
const region = <S extends string, T extends z.ZodType>(sketch: S, sample: T) =>
  z.strictObject({ ...regionBase, sketch: z.literal(sketch), sample: sample.optional() });

const Region = z.discriminatedUnion("sketch", [
  region("nav", z.strictObject({ items: z.array(z.strictObject({ t: z.string(), open: z.boolean().optional(), sub: z.boolean().optional(),
    entry: z.boolean().optional() })), entryHidden: z.boolean().optional() })),
  region("figures", z.strictObject({ figures: z.array(pair), note: z.string().optional() })),
  region("tabs", z.strictObject({ tabs: z.array(z.tuple([z.string(), z.number()])) })),
  region("filters", z.strictObject({ search: z.string(), pills: z.array(z.string()) })),
  region("table", z.strictObject({ columns: z.array(z.string()).optional(), rows: z.array(z.union([z.array(z.string()), z.record(z.string(), z.string())])) })),
  region("pagination", z.strictObject({ text: z.string() })),
  region("message", z.strictObject({ tone: z.enum(["empty", "wait", "error", "lock"]), title: z.string(), text: z.string(), action: z.string().optional() })),
  region("sheet", z.strictObject({ title: z.string(), sub: z.string().optional(), badge: z.string().optional(), figures: z.array(pair).optional(),
    bars: z.array(z.number()).optional(), rows: z.array(z.array(z.string())).optional(), button: z.string().optional() })),
  region("form", z.strictObject({ title: z.string(), fields: z.array(pair), button: z.string(), note: z.string().optional() })),
]);

const Screen = z.strictObject({
  id, screen: z.string(), label: z.string(), when: z.string(), regions: z.array(Region), serves: ids,
  chart: z.string().optional(), subtitle: z.string().optional(),
  from: id.optional(), on: z.string().optional(),                                  // the flow strip: the state before, and the event
  states: z.array(z.strictObject({ id: z.string(), says: z.string() })).optional(), // the page states in code this picture draws
});

const schema = z.strictObject({ screens: z.array(Screen) });
export type Screens = z.infer<typeof schema>;
export type Screen = z.infer<typeof Screen>;

const shows = (s: Screen) => s.regions.some(marked);

function* rules(data: Screens): Generator<RuleFinding> {
  const known = new Set(data.screens.map((s) => s.id));
  yield* duplicateIds([["screen", data.screens.map((s) => s.id)]]);
  for (const s of data.screens) {
    if (s.from && !known.has(s.from)) yield { rule: "ref", message: `screen ${s.id}: screen ${s.from} does not exist` };
    if (!s.regions.some((r) => r.component)) yield { rule: "render", message: `screen ${s.id} (${s.label}): no region names the component that renders it` };
  }
  yield* codeSpans("screens", data.screens);
}

export default defineType({
  type: "screens", v: 1, schema,
  rules: (data) => [...rules(data)],
  // A screen of only reused regions shows the person nothing new, so only a new or changed region makes the plan user-visible.
  facts: ({ screens }) => {
    const shown = screens.filter(shows);
    return shown.length > 0 ? { "user-visible": shown } : {};
  },
});
