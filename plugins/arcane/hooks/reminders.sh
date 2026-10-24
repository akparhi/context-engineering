#!/bin/sh
# Prints arcane's context for the hook event in $1. Stdout goes into the agent's context.
#
#   SessionStart      main agent   CodeGraph usage block (codegraph-instructions.md)
#   UserPromptSubmit  main agent   terse-reminder.md, codegraph-reminder.md
#   SubagentStart     subagent     CodeGraph usage block, as JSON
#
# Terse rules repeat each prompt so the style survives long sessions and compaction; turn them
# off with /config terse_reminder. The usage block stands in for the CLAUDE.md section that
# `codegraph install` writes, since a plugin cannot write CLAUDE.md and MCP instructions skip
# subagents. CodeGraph parts print only when the CLI exists and a .codegraph/codegraph.db sits
# at or above the project directory.
set -eu
event=$1

# Terse rules: every prompt, any repo, unless turned off.
if [ "$event" = UserPromptSubmit ] && [ "${CLAUDE_PLUGIN_OPTION_TERSE_REMINDER:-}" != false ]; then
  cat "${CLAUDE_PLUGIN_ROOT}/hooks/terse-reminder.md"
fi

# Codegraph parts: exit quietly unless the CLI exists and the repo is indexed.
PATH="$PATH:${CLAUDE_PLUGIN_DATA:-}/node_modules/.bin"
command -v codegraph >/dev/null 2>&1 || exit 0
dir="${CLAUDE_PROJECT_DIR:-$PWD}"
# Look for the index file, since ~/.codegraph/ is CodeGraph's global state, not an index.
while [ ! -f "$dir/.codegraph/codegraph.db" ] && [ "$dir" != / ]; do dir=$(dirname "$dir"); done
[ -f "$dir/.codegraph/codegraph.db" ] || exit 0

block="${CLAUDE_PLUGIN_ROOT}/hooks/codegraph-instructions.md"
case "$event" in
  # Main agent: the full usage block.
  SessionStart)
    cat "$block" ;;
  # Main agent: one line naming the question types that belong to the graph.
  UserPromptSubmit)
    cat "${CLAUDE_PLUGIN_ROOT}/hooks/codegraph-reminder.md" ;;
  # Subagent: the full usage block, as JSON because SubagentStart ignores plain stdout.
  SubagentStart)
    node -e 'process.stdout.write(JSON.stringify({hookSpecificOutput: {hookEventName: "SubagentStart",
      additionalContext: require("fs").readFileSync(process.argv[1], "utf8")}}))' "$block" ;;
esac
