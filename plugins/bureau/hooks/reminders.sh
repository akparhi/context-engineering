#!/bin/sh
# Prints bureau's context for the hook event in $1. Stdout goes into the agent's context.
#
#   SessionStart      main agent   CodeGraph usage block (codegraph-instructions.md)
#   UserPromptSubmit  main agent   terse-reminder.md, codegraph-reminder.md
#   SubagentStart     subagent     subagent-start.md (with the principle index), bureau models, CodeGraph usage block, as JSON
#
# Terse rules repeat each prompt so the style survives long sessions and compaction; turn them
# off with /config terse_reminder. The usage block stands in for the CLAUDE.md section that
# `codegraph install` writes, since a plugin cannot write CLAUDE.md and MCP instructions skip
# subagents. CodeGraph parts print only when the CLI exists and a .codegraph/codegraph.db sits
# at or above the project directory.
set -eu
event=$1
hooks="${CLAUDE_PLUGIN_ROOT}/hooks"
context_dir="${CLAUDE_PLUGIN_ROOT}/context"

indexed() {
  PATH="$PATH:${CLAUDE_PLUGIN_DATA:-}/node_modules/.bin"
  command -v codegraph >/dev/null 2>&1 || return 1
  dir="${CLAUDE_PROJECT_DIR:-$PWD}"
  # Look for the index file, since ~/.codegraph/ is CodeGraph's global state, not an index.
  while [ ! -f "$dir/.codegraph/codegraph.db" ] && [ "$dir" != / ]; do dir=$(dirname "$dir"); done
  [ -f "$dir/.codegraph/codegraph.db" ]
}

case "$event" in
  # Main agent: the full usage block.
  SessionStart)
    if indexed; then cat "$context_dir/codegraph-instructions.md"; fi
    ;;

  # Main agent: terse rules in any repo, plus one line naming the question types that belong to the graph.
  UserPromptSubmit)
    if [ "${CLAUDE_PLUGIN_OPTION_TERSE_REMINDER:-}" != false ]; then cat "$context_dir/terse-reminder.md"; fi
    if indexed; then cat "$context_dir/codegraph-reminder.md"; fi
    ;;

  # Subagent: skill rules with the principle index, model routing, and the usage block. JSON, because SubagentStart ignores plain stdout.
  SubagentStart)
    skills=$("$hooks/expand-imports.sh" "$context_dir/subagent-start.md")
    # Subagents spawn subagents too, so they get the same model routing as the main agent.
    models=$("$hooks/session-start.sh" models)
    codegraph=$(if indexed; then cat "$context_dir/codegraph-instructions.md"; fi)
    context=$(printf '%s\n\n%s\n\n%s' "$skills" "$models" "$codegraph")
    node -e 'process.stdout.write(JSON.stringify({hookSpecificOutput: {
      hookEventName: "SubagentStart", additionalContext: process.argv[1]}}))' "$context"
    ;;
esac
