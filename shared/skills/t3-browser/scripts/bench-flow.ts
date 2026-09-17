#!/usr/bin/env bun
/**
 * Accuracy/latency benchmark for Jev element selection over captured pages.
 *
 * Cases and their captured pages live with the project under test, not with the
 * skill: <cwd>/.t3-browser/bench-cases.json holds
 * { name, snapshot, goal, steps:[{subgoal, expect}] }, where `expect` is a
 * substring the chosen element's label must contain ("none" asserts a
 * deliberate decline) and `snapshot` is relative to the cases file. Each case
 * runs --repeat times.
 *
 *   bun --env-file=<skill>/scripts/.env <skill>/scripts/bench-flow.ts [--repeat 3] [--cases path.json]
 */
import { createJev } from "./jev.ts";
import { createSelector } from "./selector.ts";
import { fromT3, type T3Page } from "./snapshot.ts";

type Case = {
  name: string;
  snapshot: string;
  goal: string;
  steps: { subgoal: string; expect: string }[];
};

const argv = process.argv.slice(2);
const arg = (flag: string, fallback: string) => {
  const i = argv.indexOf(flag);
  return i === -1 ? fallback : (argv[i + 1] ?? fallback);
};
const repeat = Number(arg("--repeat", "3"));
const casesPath = arg("--cases", `${process.cwd()}/.t3-browser/bench-cases.json`);
const casesDir = casesPath.slice(0, casesPath.lastIndexOf("/")) || ".";
const cases = (await Bun.file(casesPath).json()) as Case[];

const select = createSelector(createJev({ maxRetries: 3 }));
const rows: string[] = [];
let hits = 0;
let total = 0;
const latencies: number[] = [];

for (const testCase of cases) {
  const snapshotPath = testCase.snapshot.startsWith("/")
    ? testCase.snapshot
    : `${casesDir}/${testCase.snapshot}`;
  const page = (await Bun.file(snapshotPath).json()) as T3Page;
  const snapshot = fromT3(page);
  for (let run = 0; run < repeat; run++) {
    const { selections, ms, inputTokens } = await select({
      goal: testCase.goal,
      subgoals: testCase.steps.map((s) => s.subgoal),
      snapshot,
    });
    latencies.push(ms);
    const marks = selections.map((selection, i) => {
      const expected = testCase.steps[i]!.expect;
      const label = selection.element?.label ?? "none";
      const hit = label.toLowerCase().includes(expected.toLowerCase());
      total++;
      if (hit) hits++;
      return `${hit ? "✓" : "✗"}${label.slice(0, 24)}@${selection.confidence.toFixed(2)}`;
    });
    rows.push(
      `${testCase.name} run${run + 1} ${Math.round(ms)}ms ${inputTokens}tok ${marks.join(" | ")}`,
    );
  }
}

latencies.sort((a, b) => a - b);
rows.push(
  `TOTAL hits ${hits}/${total} p50 ${Math.round(latencies[Math.floor(latencies.length / 2)] ?? 0)}ms p95 ${Math.round(latencies[Math.floor(latencies.length * 0.95)] ?? 0)}ms`,
);
console.log(rows.join("\n"));
