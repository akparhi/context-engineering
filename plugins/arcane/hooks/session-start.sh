#!/bin/sh
set -eu
# Literal plugin paths, so a static reader of hooks.json can follow them.
cat "${CLAUDE_PLUGIN_ROOT}/hooks/session-start-context.md"
cat "${CLAUDE_PLUGIN_ROOT}/models.json"
