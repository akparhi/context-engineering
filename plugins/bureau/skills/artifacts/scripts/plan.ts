/** A plan folder, read from disk: `plan.json` is the plan's identity, and `artifacts/<id>.json` is one artifact each. Reading
 *  reports what it could not parse and keeps going, so one bad file does not hide the findings in the others. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { z } from "zod";
import type { ArtifactType, Finding } from "./artifact.ts";
import { planReader, type Read } from "./fileref.ts";
import { type DataOf, isTypeName, TYPES, type TypeName } from "./registry.ts";

/** A link a page may print, so only web schemes: a `javascript:` or `data:` URL never gets in. */
const webUrl = z.url({ protocol: /^https?$/, error: "must be an http or https URL" });

export const PlanJson = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(["change", "design", "questions"]),
  title: z.string(),
  ask: z.string(),
  ticket: webUrl.optional(),
  sources: z.array(z.strictObject({ label: z.string().min(1), url: webUrl })).optional(),
  /** Repo name -> its checkout, relative to the plan folder or absolute. A checkout is not part of the plan, so it may sit outside. */
  repos: z.record(z.string(), z.string()).optional(),
});
export type PlanJson = z.infer<typeof PlanJson>;

export type Artifact<T extends TypeName = TypeName> = { [K in T]: { id: string; type: K; data: DataOf<K> } }[T];

export type Plan = { dir: string; plan: PlanJson | null; artifacts: Artifact[]; read: Read };

/** The artifacts of one type, in file-name order. A plan may hold several of a type, such as two `prose` files. */
export const ofType = <T extends TypeName>(plan: Plan, type: T): Artifact<T>[] =>
  plan.artifacts.filter((a) => a.type === type) as Artifact<T>[];

export const definitionOf = (type: TypeName): ArtifactType => TYPES[type] as ArtifactType;

const ARTIFACT_ID = /^[a-z0-9][a-z0-9-]*$/;
const issues = (error: z.ZodError) => error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);

function parseJson(file: string): { value: unknown } | { error: string } {
  try {
    return { value: JSON.parse(readFileSync(file, "utf8")) };
  } catch (error) {
    return { error: `not JSON: ${(error as Error).message}` };
  }
}

/** Reads the folder. An artifact that fails its schema is reported and left out of `artifacts`. */
export function loadPlan(dir: string): { plan: Plan; findings: Finding[] } {
  const findings: Finding[] = [];
  const fail = (message: string, artifact?: string) => findings.push({ tier: "type", level: "error", rule: "schema", artifact, message });

  let planJson: PlanJson | null = null;
  const planFile = join(dir, "plan.json");
  if (!existsSync(planFile)) fail("plan.json does not exist");
  else {
    const json = parseJson(planFile);
    if ("error" in json) fail(`plan.json is ${json.error}`);
    else {
      const parsed = PlanJson.safeParse(json.value);
      if (parsed.success) planJson = parsed.data;
      else for (const issue of issues(parsed.error)) fail(`plan.json ${issue}`);
    }
  }

  const artifacts: Artifact[] = [];
  const folder = join(dir, "artifacts");
  const files = existsSync(folder) ? readdirSync(folder).filter((f) => f.endsWith(".json")).sort() : [];
  for (const file of files) {
    const artifactId = basename(file, ".json");
    if (!ARTIFACT_ID.test(artifactId)) { fail("an artifact id is lowercase letters, digits and hyphens", artifactId); continue; }
    const json = parseJson(join(folder, file));
    if ("error" in json) { fail(json.error, artifactId); continue; }
    if (!json.value || typeof json.value !== "object" || Array.isArray(json.value)) { fail("an artifact is a JSON object", artifactId); continue; }
    const { type, v, ...data } = json.value as Record<string, unknown>;
    if (typeof type !== "string" || !isTypeName(type)) {
      fail(`type ${JSON.stringify(type)} is not one of ${Object.keys(TYPES).join(", ")}`, artifactId);
      continue;
    }
    const def = definitionOf(type);
    if (v !== def.v) { fail(`v is ${JSON.stringify(v)}, and ${type} is at v ${def.v}`, artifactId); continue; }
    const parsed = def.schema.safeParse(data);
    if (!parsed.success) { for (const issue of issues(parsed.error)) fail(issue, artifactId); continue; }
    artifacts.push({ id: artifactId, type, data: parsed.data } as Artifact);
  }

  return { plan: { dir, plan: planJson, artifacts, read: planReader(dir) }, findings };
}
