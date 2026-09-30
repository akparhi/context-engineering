#!/bin/sh
set -eu
sheet="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/arcane-models.md"
if grep -qs '^session hook: off$' "$sheet"; then
  exit 0
fi
# A literal plugin path, so a static reader of hooks.json can follow it.
cat "${CLAUDE_PLUGIN_ROOT}/hooks/session-start-context.md"
