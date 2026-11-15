/** The plan's fixed vocabularies, as plain values. No zod here: the viewer imports this module into the browser bundle. */
export const SECTIONS = ["Scope", "Screens", "Evidence", "Decisions", "Behavior", "Data", "API", "Components", "Units", "Risks", "Acceptance", "Pull requests", "Grant"] as const;
export const ACTS = ["product", "tech", "verify", "pr"] as const;
export const ACT_OF: Record<Section, Act> = {
  Scope: "product", Screens: "product",
  Evidence: "tech", Decisions: "tech", Behavior: "tech", Data: "tech", API: "tech", Components: "tech", Units: "tech", Risks: "tech",
  Acceptance: "verify", "Pull requests": "pr", Grant: "pr",
};
export const MARKS = ["new", "changed", "reused"] as const;
export const IRREVERSIBLE = ["data-migration", "delete", "deploy", "external-message", "force-push"] as const;
export const TOUCHES = ["scope", "user-visible", "schema", "api", "permission", "money", "dependency", "open-rule", "acceptance", "authority", ...IRREVERSIBLE] as const;
export const SKETCHES = ["nav", "figures", "tabs", "filters", "table", "pagination", "message", "sheet", "form"] as const;

export type Section = (typeof SECTIONS)[number];
export type Act = (typeof ACTS)[number];
export type Mark = (typeof MARKS)[number];
export type Touch = (typeof TOUCHES)[number];
