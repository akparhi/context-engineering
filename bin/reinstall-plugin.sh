#!/bin/sh
# Refresh the cached copy of this marketplace's plugins after editing them.
#
#   bun run reinstall            # arcane and switchboard
#   bun run reinstall arcane
#
# Claude Code runs plugins from ~/.claude/plugins/cache, not this repo, and
# `claude plugin update` skips a plugin whose version did not change.
# Uninstall drops the plugin's /config values, so they are saved and put back.
# Restart open sessions afterward.
set -eu

[ $# -gt 0 ] || set -- arcane switchboard

node "$(dirname "$0")/sync-arcane-config.mjs"
node "$(dirname "$0")/sync-switchboard-config.mjs"
claude plugin marketplace update akparhi
settings="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"
saved=$(node -e 'try { console.log(JSON.stringify(JSON.parse(require("fs").readFileSync(process.argv[1])).pluginConfigs ?? {})) } catch { console.log("{}") }' "$settings")
for name in "$@"; do
  ref="$name@akparhi"
  claude plugin uninstall "$ref" --scope user
  claude plugin install "$ref" --scope user
  # Setup copies the startup wrapper outside the plugin cache; refresh it to match.
  if [ "$name" = switchboard ]; then
    bun "$(claude plugin list --json | node -e 'const p=JSON.parse(require("fs").readFileSync(0)).find((p)=>p.id==="switchboard@akparhi"&&p.scope==="user"); console.log(p.installPath)')/src/setup.ts"
  fi
done
node -e '
const fs = require("fs");
const [file, saved] = process.argv.slice(1);
const settings = JSON.parse(fs.readFileSync(file));
settings.pluginConfigs = { ...JSON.parse(saved), ...settings.pluginConfigs };
fs.writeFileSync(file, JSON.stringify(settings, null, 2) + "\n");
' "$settings" "$saved"
