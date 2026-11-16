/** `artifacts check <plan-dir>` runs two tiers. The type tier checks each artifact alone: its schema, the files it names, and
 *  its type's own rules. The plan tier checks rules across artifacts, and runs only on artifacts that passed their schema. */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Finding } from "./artifact.ts";
import { shownText } from "./fileref.ts";
import { type Artifact, definitionOf, loadPlan, type Plan } from "./plan.ts";
import { planRules } from "./plan-rules.ts";

export const USAGE = "usage: artifacts check <plan-dir>   (checks each artifact alone, then the rules across them; exits 1 on any error)";

export type Report = { artifacts: number; errors: Finding[]; warnings: Finding[] };

async function typeTier(plan: Plan, artifact: Artifact): Promise<Finding[]> {
  const def = definitionOf(artifact.type);
  const findings: Finding[] = [];
  for (const file of def.files?.(artifact.data) ?? []) {
    if (shownText(plan.read, file) !== null) continue;
    const missing = plan.read(file.ref) === null;
    if (missing && file.optional) continue;
    const message = missing ? `${file.ref} does not exist inside the plan folder` : `${file.ref} has no heading "${file.heading}"`;
    findings.push({ tier: "type", level: "error", rule: "file", artifact: artifact.id, message });
  }
  for (const found of (await def.rules?.(artifact.data, { read: plan.read })) ?? []) {
    findings.push({ tier: "type", level: found.level ?? "error", rule: found.rule, artifact: artifact.id, message: found.message });
  }
  return findings;
}

export async function check(planDir: string): Promise<Report> {
  const { plan, findings } = loadPlan(planDir);
  for (const artifact of plan.artifacts) findings.push(...(await typeTier(plan, artifact)));
  findings.push(...(await planRules(plan)));
  return {
    artifacts: plan.artifacts.length,
    errors: findings.filter((f) => f.level === "error"),
    warnings: findings.filter((f) => f.level === "warning"),
  };
}

const line = (f: Finding) => `${f.level === "error" ? "error" : "warn "} ${f.tier}/${f.rule}${f.artifact ? ` ${f.artifact}` : ""}: ${f.message}`;

export async function runCheck(args: string[]): Promise<number> {
  const [dir, ...rest] = args;
  if (!dir || rest.length > 0) { console.error(USAGE); return 2; }
  const planDir = resolve(dir);
  if (!existsSync(planDir)) { console.error(`${planDir} does not exist`); return 2; }
  const report = await check(planDir);
  console.log(`check ${planDir}: ${report.artifacts} artifact${report.artifacts === 1 ? "" : "s"}`);
  for (const finding of [...report.errors, ...report.warnings]) console.log(line(finding));
  console.log(`${report.errors.length} errors, ${report.warnings.length} warnings`);
  return report.errors.length > 0 ? 1 : 0;
}
