/** Proves each `check` rule's table test can fail: for every rule, a copy of the skill gets that rule switched off, and its
 *  `BREAKS` cases must then fail. Run with `bun test/prove-rules.ts` from `scripts/`. Exits 1 when a rule's test survives. */
import { cpSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { RULES, type Rule } from "../check.ts";

const SKILL = resolve(import.meta.dir, "../..");

/** The edit that switches one rule off. `schema` runs before the rule table, so it takes the parse result as valid. */
const disable = (rule: Rule, source: string) => {
  const off = rule === "schema"
    ? source.replace("const parsed = Manifest.safeParse(json);", "const parsed = { success: true, data: json as Manifest } as const;")
    : source.replace(new RegExp(`^  ("?${rule}"?)(: \\w+)?,$`, "m"), "  $1: () => [],");
  if (off === source) throw new Error(`no line in check.ts switches ${rule} off`);
  return off;
};

let survived = 0;
for (const rule of RULES) {
  const copy = mkdtempSync(join(tmpdir(), `sign-off-prove-${rule}-`));
  try {
    cpSync(SKILL, copy, { recursive: true, filter: (path) => !path.includes("node_modules") });
    symlinkSync(join(SKILL, "scripts/node_modules"), join(copy, "scripts/node_modules"));
    const file = join(copy, "scripts/check.ts");
    await Bun.write(file, disable(rule, await Bun.file(file).text()));
    const run = Bun.spawnSync(["bun", "test", "test/check.test.ts", "-t", `check ${rule} fails on`], { cwd: join(copy, "scripts") });
    const output = run.stderr.toString();
    const failed = Number(output.match(/(\d+) fail/)?.[1] ?? 0);
    const ran = failed + Number(output.match(/(\d+) pass/)?.[1] ?? 0);
    if (ran === 0) throw new Error(`no BREAKS case ran for ${rule}`);
    console.log(`${rule.padEnd(10)} off: ${failed} of ${ran} cases fail${failed ? "" : ", so its test survives"}`);
    if (!failed) survived++;
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}
process.exit(survived ? 1 : 0);
