<!-- Adapted from oxc-project/oxc (MIT). See NOTICE.md -->

# Tooling reference

Scope: oxlint config, oxfmt, tsconfig flags, package.json scripts. All values are exact.

## `.oxlintrc.json`

```json
{
  "$schema": "https://raw.githubusercontent.com/oxc-project/oxc/main/npm/oxlint/configuration_schema.json",
  "plugins": ["typescript", "import", "promise", "unicorn"],
  "rules": {
    "no-console": "error",
    "unicorn/no-array-for-each": "error",
    "typescript/no-explicit-any": "warn",
    "typescript/consistent-type-imports": "error",
    "import/no-duplicates": "error",
    "promise/always-return": "error"
  },
  "overrides": [
    {
      "files": ["src/client/**"],
      "rules": {
        "no-restricted-imports": [
          "error",
          {
            "patterns": [
              {
                "group": ["**/env/server*", "**/server/env*"],
                "message": "Server env must not be imported in client code."
              }
            ]
          }
        ]
      }
    }
  ]
}
```

`no-console` is `error` everywhere: use `logger` (pino) in server code, and the browser console sparingly only in explicit debug utilities.

## oxfmt

This skill uses oxfmt defaults and adds no config file. Run it as:

```
bun oxfmt --write src/
```

Default settings match Prettier with 2-space indent and trailing commas. oxfmt does support project config (`.oxfmtrc.json`, `.oxfmtrc.jsonc`, `oxfmt.config.ts`, `oxfmt.config.mts`, found by walking up from the formatted file); leave it absent, and add no `prettier.config` either.

## `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["ESNext"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "skipLibCheck": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

`verbatimModuleSyntax` requires `import type` for type-only imports. `moduleResolution: "bundler"` matches Bun and Vite resolution without `node16` overhead.

### tsconfig flag reference

| Flag | Effect |
|---|---|
| `strict` | Enables `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, etc. |
| `noUncheckedIndexedAccess` | Array/object index access returns `T \| undefined`. Prevents silent out-of-bounds. |
| `exactOptionalPropertyTypes` | `{ a?: string }` means `a` is `string` or absent — not `string \| undefined` explicitly. |
| `verbatimModuleSyntax` | Type-only imports must use `import type`. Removes all type erasure ambiguity. |
| `moduleResolution: "bundler"` | Matches Bun and Vite. Allows extensionless imports and `exports` field in `package.json`. |

## `no-restricted-imports` pattern reference

The `no-restricted-imports` rule in the `src/client/**` override blocks any path matching `**/env/server*` or `**/server/env*`. It matches the import specifier as written, so it catches direct and aliased paths, not a re-export reached through a barrel whose own specifier does not match.

```ts
// blocked in src/client/**
import { env } from "../../server/env/server";    // direct
import { env } from "@/server/env/server";         // via path alias
```

Add additional patterns under `overrides[0].rules.no-restricted-imports.patterns` if other server-only modules must be blocked (e.g., a module that imports `postgres`).

## Single Zod version rule

One version of Zod across the entire project. Import from `"zod"` only — never from `"zod/v4"` sub-paths or from any re-export.

```ts
// correct
import { z } from "zod";

// wrong — same package, but a second spelling for one concept
import { z } from "zod/v4";
```

Lock Zod to a single version in `package.json`. If a dependency pulls in a different version, add a `resolutions` (bun) or `overrides` (npm) field.

## `package.json` scripts

```json
{
  "scripts": {
    "dev": "concurrently \"bun --watch src/server/index.ts\" \"vite\"",
    "build": "vite build",
    "start": "NODE_ENV=production bun src/server/index.ts",
    "test": "bun test",
    "lint": "oxlint src/",
    "fmt": "oxfmt --write src/",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "bun src/server/db/migrate.ts"
  }
}
```

`dev` runs the Bun server under `--watch` and the Vite dev server in parallel via `concurrently`. The Vite proxy (see `server-runtime.md`) routes API calls to the Bun process during development.

## Running lint and format in CI

```yaml
# .github/workflows/ci.yml (excerpt)
- name: Lint
  run: bun run lint

- name: Format check
  run: bun oxfmt --check src/
```

`--check` exits non-zero if any file would be reformatted; use it in CI and `--write` locally.

## Before you finish

| Check | Pass condition |
|---|---|
| `.oxlintrc.json` has all four plugins | `typescript`, `import`, `promise`, `unicorn` |
| `no-restricted-imports` scoped to `src/client/**` | Not applied globally |
| `no-console` is `error` | `logger` used everywhere else |
| `tsconfig.json` has all five strict flags | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `moduleResolution: "bundler"` |
| Single `"zod"` import across the codebase | No `zod/v4` sub-path imports |
| `db:migrate` runs the migration module, not `drizzle-kit migrate` | Boot-time migration with advisory lock |
