import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Fail with a clear message instead of an opaque `import.meta.dir is undefined` crash under node.
if (typeof Bun === "undefined") {
  console.error("bureau artifacts requires bun (https://bun.sh). Install bun, then re-run.");
  process.exit(1);
}

const scriptsDirectory = import.meta.dir;
const nodeModulesDirectory = join(scriptsDirectory, "node_modules");
const installKeyPath = join(nodeModulesDirectory, ".artifacts-install-key");
const dependencies = Object.keys(
  JSON.parse(readFileSync(join(scriptsDirectory, "package.json"), "utf8")).dependencies,
);

function currentInstallKey(): string {
  return createHash("sha256")
    .update(readFileSync(join(scriptsDirectory, "package.json")))
    .update("\0")
    .update(readFileSync(join(scriptsDirectory, "bun.lock")))
    .digest("hex");
}

const installed = () =>
  dependencies.every((name) => existsSync(join(nodeModulesDirectory, name, "package.json")));

/** Installs the production dependencies when they are missing or the lockfile changed, then reruns this process. */
export function ensureDependenciesInstalled(): void {
  const installKey = currentInstallKey();
  if (installed() && existsSync(installKeyPath) && readFileSync(installKeyPath, "utf8").trim() === installKey) {
    return;
  }

  const result = Bun.spawnSync(
    [process.execPath, "install", "--frozen-lockfile", "--production"],
    { cwd: scriptsDirectory },
  );
  if (result.exitCode !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`bun install --frozen-lockfile exited with status ${result.exitCode}`);
  }
  if (!installed()) {
    throw new Error(`bun install --frozen-lockfile completed without installing ${dependencies.join(", ")}`);
  }

  writeFileSync(installKeyPath, `${installKey}\n`);

  const restarted = Bun.spawnSync([process.execPath, ...process.argv.slice(1)], {
    cwd: process.cwd(),
    env: process.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exit(restarted.exitCode ?? 1);
}
