#!/bin/sh
# Refresh the cached copy of this marketplace's plugins after editing them.
#
#   bun run reinstall            # arcane and switchboard
#   bun run reinstall arcane
#
# Claude Code runs plugins from ~/.claude/plugins/cache, not this repo, and
# `claude plugin update` skips a plugin whose version did not change.
# Restart open sessions afterward.
set -eu

[ $# -gt 0 ] || set -- arcane switchboard

node "$(dirname "$0")/sync-arcane-config.mjs"
node "$(dirname "$0")/sync-switchboard-config.mjs"
claude plugin marketplace update akparhi
for name in "$@"; do
  ref="$name@akparhi"
  claude plugin uninstall "$ref" --scope user
  claude plugin install "$ref" --scope user
done
