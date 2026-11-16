/** The page's own words stay short: a string in `copy.ts` is a label of six words or fewer, unless SENTENCES names it with the
 *  reason it needs a sentence, and then it holds 16 words at most. No string tells the reader how to use the page, unless HOW_TO
 *  names it. Strings built by a function are not measured. */
import { expect, test } from "bun:test"
import * as copy from "../src/copy.ts"

const DIALOG = "the submit dialog says what sending does, once, before the reader sends"
const ERROR = "an error or empty state says what to do next"
const HELD = "the user asked to leave the API stop as it is"
const SENTENCES: Record<string, string> = {
  "COPY.steps.grantWhy": "why the grant is a gate, shown in the Gates table",
  "TOUCH_WHY.open-rule": "why an item is a gate, shown in the Gates table",
  "TOUCH_WHY.authority": "why an item is a gate, shown in the Gates table",
  "COPY.draft.none": "a warning: a reload loses the reader's verdicts",
  "COPY.item.backPlaceholder": "a field's placeholder",
  "COPY.item.backEmpty": ERROR,
  "COPY.item.notPorted": ERROR,
  "COPY.comment.placeholder": "a field's placeholder, and the one place that says a comment is not a verdict",
  "COPY.linked.nothing": ERROR,
  "COPY.submit.says.approved": DIALOG,
  "COPY.submit.says.partial": DIALOG,
  "COPY.submit.says.changes": DIALOG,
  "COPY.submit.nameLabel": "a field's label",
  "COPY.submit.nameEmpty": ERROR,
  "COPY.submit.howToSend": DIALOG,
  "COPY.submit.sent": DIALOG,
  "COPY.submit.staleWhy": ERROR,
  "COPY.submit.already": ERROR,
  "COPY.submit.noClipboard": ERROR,
  "COPY.trace.addedFor": "a lead-in to the rule's name in the drawer",
  "COPY.trace.notInPlan": ERROR,
  "COPY.prose.missing": ERROR,
  "COPY.erd.writtenOnce": "a fact about one column, in the inspector",
  "COPY.erd.otherServices": "a fact about one column, in the inspector",
  "COPY.statechart.listBack": "the switch back from Draw all, which names what changes",
  "COPY.statechart.noReport": ERROR,
  "COPY.statechart.chosen": "says which button takes the plan's side",
}
const HOW_TO: Record<string, string> = {
  "COPY.spec.readFrom": "a label for where the metric is read from, not an instruction",
  "COPY.endpoints.openShape": HELD,
}

const strings: [key: string, text: string][] = []
const collect = (value: unknown, key: string) => {
  if (typeof value === "string") strings.push([key, value])
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) collect(v, key ? `${key}.${k}` : k)
}
collect(copy, "")
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length

test("a string is six words or fewer, or a named sentence of 16 at most", () => {
  expect(strings.filter(([key, text]) => words(text) > (key in SENTENCES ? 16 : 6)).map(([key, text]) => `${key}: ${words(text)} words`)).toEqual([])
})

test("no string says how to use the page", () => {
  expect(strings.filter(([key, text]) => !(key in HOW_TO) && /\b(Press|Pick|Scroll|Read from|Open one)\b|to see\b/.test(text)).map(([key]) => key)).toEqual([])
})

test("each allowlist row names a string that still needs it", () => {
  const long = new Set(strings.filter(([, text]) => words(text) > 6).map(([key]) => key))
  expect(Object.keys(SENTENCES).filter((key) => !long.has(key))).toEqual([])
})
