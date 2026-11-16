/** Vocabulary more than one artifact type uses. */
import { z } from "zod";
import type { RuleFinding } from "../artifact.ts";

export const id = z.string().min(1);
export const ids = z.array(id);
export const MARKS = ["new", "changed", "reused"] as const;
export const Mark = z.enum(MARKS);
export type Mark = z.infer<typeof Mark>;

export const marked = (x: { mark: string }) => x.mark === "new" || x.mark === "changed";

const article = (noun: string) => (/^[aeio]/i.test(noun) ? "an" : "a");             // no kind starts with a vowel-sound u

/** The `id` rule over pools of ids, each named by a singular noun: an id appears once across all of them. */
export function duplicateIds(pools: [kind: string, ids: string[]][]): RuleFinding[] {
  const owner = new Map<string, string>();
  const out: RuleFinding[] = [];
  for (const [kind, list] of pools) for (const id of list) {
    const first = owner.get(id);
    if (first === undefined) owner.set(id, kind);
    else out.push({ rule: "id", message: `duplicate id ${id}: ${first === kind ? `two ${kind}s` : `${article(first)} ${first} and ${article(kind)} ${kind}`}` });
  }
  return out;
}

/** Fields that hold ids, sketch names and other machine words, which act one may carry. */
const MACHINE_FIELDS = new Set(["id", "serves", "component", "sketch", "mark", "states", "from", "chart"]);

/** Each string act one shows a person, with the path to it. Act one is read by people outside engineering. */
export function* actOneTexts(where: string, value: unknown): Generator<[where: string, text: string]> {
  if (typeof value === "string") yield [where, value];
  else if (Array.isArray(value)) {
    for (const [i, x] of value.entries()) yield* actOneTexts(`${where}[${i}]`, x);
  } else if (value && typeof value === "object") {
    for (const [k, x] of Object.entries(value)) if (!MACHINE_FIELDS.has(k)) yield* actOneTexts(where ? `${where}.${k}` : k, x);
  }
}

/** The `jargon` rule's code-span half: no string in act one holds a code span. */
export function* codeSpans(where: string, value: unknown): Generator<RuleFinding> {
  for (const [at, text] of actOneTexts(where, value)) {
    for (const code of text.match(/`[^`]+`/g) ?? []) yield { rule: "jargon", message: `act one, ${at}: has the code span ${code}` };
  }
}
