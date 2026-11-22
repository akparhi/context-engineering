#!/bin/sh
# Prints free disk and memory, and a LOW line for each resource under its floor.
#
#   check             any agent or loop  the figures; when low, the five largest processes and exit 1
#   SessionStart      hook, main agent   the figures
#   UserPromptSubmit  hook, main agent   LOW lines only
#   SubagentStart     hook, subagent     LOW lines only, as JSON
#
# The SKILL.md next to this directory tells agents what to do with the output.
set -eu

snapshot() {
  df -Pk "${CLAUDE_PROJECT_DIR:-$PWD}" | awk 'NR == 2 {
    printf "Disk: %d GB free of %d GB.\n", $4 / 1048576, $2 / 1048576
    if ($4 < 20 * 1048576 || $4 < $2 / 10) print "LOW DISK: delete build output, caches, and worktrees you made before writing more."
  }'
  if [ -r /proc/meminfo ]; then
    awk '/^MemTotal:/ { t = $2 * 1024 } /^MemAvailable:/ { a = $2 * 1024 } END { print a, t }' /proc/meminfo
  else
    # macOS has no "available" figure; free, inactive, and speculative pages come closest.
    vm_stat | awk -v t="$(sysctl -n hw.memsize)" '/page size of/ { p = $8 } /^Pages (free|inactive|speculative):/ { n += $NF } END { print n * p, t }'
  fi | awk '{
    printf "Memory: %d GB available of %d GB.\n", $1 / 2^30, $2 / 2^30
    if ($1 < $2 * 0.15) print "LOW MEMORY: kill processes you started that you no longer need, and cut parallel workers."
  }'
}
low() { snapshot 2>/dev/null | grep '^LOW' || true; }

case "$1" in
  check)
    snapshot
    [ -n "$(low)" ] || exit 0
    echo "Largest processes:"
    ps -Ao rss=,pid=,comm= | sort -rn | head -5 | awk '{ gb = $1 / 1048576; pid = $2; $1 = $2 = ""; sub(/^ +/, ""); printf "  %.1f GB  pid %s  %s\n", gb, pid, $0 }'
    exit 1
    ;;
  SessionStart)
    printf '## Machine resources at session start\n\n%s\n' "$(snapshot 2>/dev/null || true)"
    ;;
  UserPromptSubmit)
    low
    ;;
  # JSON, because SubagentStart ignores plain stdout.
  SubagentStart)
    warning=$(low)
    [ -z "$warning" ] || node -e 'process.stdout.write(JSON.stringify({hookSpecificOutput: {
      hookEventName: "SubagentStart", additionalContext: process.argv[1]}}))' "$warning"
    ;;
esac
