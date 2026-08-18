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

1. MERGE, do not append. If a candidate covers the same failure mode or corrective action as an existing lesson — even if the phrasing or context differs — fold it into that lesson: broaden the text to cover both, refresh "date" to today, increment "count". When in doubt, merge. Eight entries covering six ideas is worse than six sharp lessons. Appending a near-duplicate is the failure mode this system exists to prevent.
2. Every lesson is ONE line of neutral project guidance. No second person, no quoting anyone, no history ("previously", "we used to"). These files are committed and read by teammates.
3. Every lesson must name its trigger in the text — the earliest observable signal that should have prevented the mistake. Use the candidate's "trigger" field and "files_touched" to make it concrete. "Validate inputs" fails this rule. "When editing files under src/api/, validate request bodies with Zod before returning" passes. If you cannot name a concrete trigger, quarantine the candidate instead of writing a vague lesson.
4. A lesson belongs in "areas" when it applies to code under a recognizable directory or module boundary — derive the glob from "files_touched". It belongs in "crossCutting" ONLY when no file boundary makes sense, because it applies anywhere regardless of which files are touched. Doubt defaults to "areas", never "crossCutting": a lesson loaded sometimes beats a lesson loaded always. Every entry in "crossCutting" costs context in every future session, so that file is the scarcest space in the system.
5. Caps: at most ${CAPS.crossCutting} cross-cutting lessons, ${CAPS.perArea} lessons per area, ${CAPS.areaFiles} area files. Over a cap, first try to generalize two lessons into one broader rule. Drop only when no generalization preserves both lessons' guidance without becoming a platitude; prefer dropping a lesson with count 1 and a weak trigger over one with count above 1. Reuse an existing area name when one fits rather than inventing a near-duplicate.
6. A candidate goes in "quarantine" by id when either: (a) you cannot write a rule-3-compliant lesson from it without inventing context the candidate does not contain, or (b) the correction fixed something unlikely to recur — a true one-off. Do not quarantine merely because the subject is unfamiliar; quarantine is for candidates with no recoverable trigger.
7. Preserve existing lessons unless a candidate justifies changing them, or a cap forces eviction. Preserve their original "date" when unchanged. If a candidate directly contradicts an existing lesson — recommending the opposite action — update that lesson to the newer correction and increment its count. Never keep both sides of a contradiction. Note that hand-written and generated lessons are indistinguishable in this data, so treat every existing lesson as equally evictable.

Today's date: ${new Date().toISOString().slice(0, 10)}

EXISTING LESSON SET:
${JSON.stringify(current, null, 2)}

NEW CANDIDATES:
${JSON.stringify(candidates, null, 2)}
`
}
