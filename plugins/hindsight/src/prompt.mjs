import { CAPS } from './validate.mjs'

export function buildDistillPrompt({ candidates, current }) {
  return `You maintain a project's lesson set: a small, contextual list of guidance derived from corrections made during coding sessions.

Return ONE JSON object and nothing else. Shape:

{
  "crossCutting": [{ "text": "...", "date": "YYYY-MM-DD", "trigger": "...", "count": 1 }],
  "areas": { "<area>": { "paths": ["glob/**/*.ts"], "lessons": [ ...same shape... ] } },
  "quarantine": ["<candidate id>", ...]
}

Pass this object to the hindsight__apply tool. It validates the caps and writes the files atomically; if it rejects your proposal, fix what it reports and call it again.

Rules:

1. MERGE, do not append. If a candidate restates or refines an existing lesson, rewrite that lesson to cover both and refresh its "date" to today, incrementing "count". Appending a near-duplicate is the failure mode this system exists to prevent.
2. Every lesson is ONE line of neutral project guidance. No second person, no quoting anyone, no history ("previously", "we used to"). These files are committed and read by teammates.
3. Every lesson names its trigger condition — the earliest observable signal that should have prevented the mistake. Prefer putting the condition in the text itself, e.g. "When editing files under src/api/, validate request bodies with Zod before returning".
4. A lesson that applies to a specific code area goes in "areas" with a "paths" glob matching that area, so it loads only when relevant. A lesson with no file signature goes in "crossCutting".
5. Caps: at most ${CAPS.crossCutting} cross-cutting lessons, ${CAPS.perArea} lessons per area, ${CAPS.areaFiles} area files. Over a cap, generalize two lessons into one or drop the least useful. Reuse an existing area name when one fits rather than inventing a near-duplicate.
6. A candidate whose trigger is vague, unverifiable, or a one-off goes in "quarantine" by id instead of becoming a lesson. Quarantined candidates only graduate on a second occurrence.
7. Preserve existing lessons unless a candidate justifies changing them, or a cap forces eviction. Preserve their original "date" when unchanged.

Today's date: ${new Date().toISOString().slice(0, 10)}

EXISTING LESSON SET:
${JSON.stringify(current, null, 2)}

NEW CANDIDATES:
${JSON.stringify(candidates, null, 2)}
`
}
