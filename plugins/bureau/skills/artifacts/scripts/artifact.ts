/** What every artifact type exports. An artifact is one file, `<plan-dir>/artifacts/<id>.json`, holding `{ type, v, ...data }`.
 *  The file name is the artifact's id and `type` picks the definition here. */
import type { z } from "zod";
import type { NamedFile, Read } from "./fileref.ts";

/** What a type can report about its own data. A reader that gates on a fact, such as sign-off's approval policy, decides what the
 *  fact means. A type only says whether the fact holds and what a reader of it would see. */
export const FACTS = ["scope", "user-visible", "open-rule", "schema", "api", "permission", "acceptance", "merges-alone", "grant"] as const;
export type FactName = (typeof FACTS)[number];
/** A key is present when the artifact reports that fact. Its value is the data behind it, and it is what a rev that reads the fact
 *  hashes. */
export type Facts = Partial<Record<FactName, unknown>>;

export type Tier = "type" | "plan";
export type Level = "error" | "warning";
/** `rule` names the check that failed. `artifact` is the id of the file it failed in, absent for a finding about the whole plan. */
export type Finding = { tier: Tier; level: Level; rule: string; artifact?: string; message: string };
/** What a type's own rule returns. The check runner adds the tier and the artifact id. */
export type RuleFinding = { rule: string; message: string; level?: Level };

export type RuleContext = { read: Read };

export type ArtifactType<S extends z.ZodType = z.ZodType> = {
  type: string
  v: number
  /** The data fields, without `type` and `v`. */
  schema: S
  /** Every file the data names. The type tier checks each resolves inside the plan folder, and `artifactRev` hashes its words. */
  files?: (data: z.infer<S>) => NamedFile[]
  /** Type-tier rules: what must hold inside this one file and the files it names. */
  rules?: (data: z.infer<S>, ctx: RuleContext) => RuleFinding[] | Promise<RuleFinding[]>
  /** A fact may read the files the data names, as `open-rule` reads the chart's report. */
  facts?: (data: z.infer<S>, ctx: RuleContext) => Facts
};

export const defineType = <S extends z.ZodType>(def: ArtifactType<S>): ArtifactType<S> => def;
