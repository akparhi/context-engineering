import type { z } from "zod";
import acceptance from "./types/acceptance.ts";
import api from "./types/api.ts";
import components from "./types/components.ts";
import dbSchema from "./types/db-schema.ts";
import decisions from "./types/decisions.ts";
import evidence from "./types/evidence.ts";
import grant from "./types/grant.ts";
import prPlan from "./types/pr-plan.ts";
import prose from "./types/prose.ts";
import requirements from "./types/requirements.ts";
import risks from "./types/risks.ts";
import screens from "./types/screens.ts";
import statechart from "./types/statechart.ts";
import testPlan from "./types/test-plan.ts";

export const TYPES = {
  requirements, screens, evidence, statechart, "db-schema": dbSchema, api, components, risks, acceptance,
  "test-plan": testPlan, "pr-plan": prPlan, grant, prose, decisions,
} as const;

export type TypeName = keyof typeof TYPES;
export type DataOf<T extends TypeName> = z.infer<(typeof TYPES)[T]["schema"]>;
export const isTypeName = (type: string): type is TypeName => Object.hasOwn(TYPES, type);
