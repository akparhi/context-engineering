#!/bin/bash
# Tells the agent to free memory or disk and hold off heavy work while the Mac runs low.
# Runs on PostToolUse, SubagentStart and UserPromptSubmit; $1 names the event. Prints nothing while all is fine.
#
#   tripped    free memory < breathe_memory_floor_pct (15) or free disk < breathe_disk_floor_gib (15)
#   recovered  free memory >= breathe_recover_pct (30) and free disk >= the disk floor
#
# While tripped, a run adds a note to the agent's context, at most once a minute per agent: what is
# low, what to stop, the calling session's five largest commands, and every other session's total,
# so each session knows whether it is the cause. An agent is the main agent of a session or one of
# its subagents (`agent_id` in the hook input), because SubagentStart and tool hooks inside a
# subagent talk to that subagent. The first run for a warned agent after recovery adds one line
# saying normal work can resume. The tripped flag lives in the state dir, so every parallel session
# shares it and the gap between floor and recover holds across runs. Turn it off with /config breathe.
#
# `breathe.sh watch` is the plugin monitor (monitors/monitors.json) that wakes an idle session: every
# 10 s it reads the same numbers and prints one line each time the Mac goes from fine to tripped, so
# Claude Code starts a turn whose UserPromptSubmit run adds the full note. It keeps its own tripped
# flag in memory and exits once the session's `claude` (CLAUDE_PID) is gone.
#
# Test seams: BREATHE_READINGS="<memPct> <diskGiB>", BREATHE_READINGS_FILE (the same, read on each
# watch pass), BREATHE_INTERVAL (watch seconds), BREATHE_PS_FILE (a fake `ps` listing; skips lsof),
# BREATHE_SESSION_PID (the calling `claude`), BREATHE_MEMSIZE (bytes), BREATHE_STATE_DIR.
set -eu
event=${1:-UserPromptSubmit}
if [ "$event" = watch ]; then
  # Monitors get no CLAUDE_PLUGIN_OPTION_* variables, so read the options from the user's settings.
  # yagni: user settings only; project and managed pluginConfigs are not read.
  settings=${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json
  configs=$(plutil -extract pluginConfigs json -o - "$settings" 2>/dev/null) || configs=
  key_re='"(breathe@[^"]*)"'
  if [[ $configs =~ $key_re ]]; then
    key=pluginConfigs.${BASH_REMATCH[1]}.options
    opt() { plutil -extract "$key.$1" raw -o - "$settings" 2>/dev/null || true; }
    : "${CLAUDE_PLUGIN_OPTION_BREATHE:=$(opt breathe)}"
    : "${CLAUDE_PLUGIN_OPTION_BREATHE_MEMORY_FLOOR_PCT:=$(opt breathe_memory_floor_pct)}"
    : "${CLAUDE_PLUGIN_OPTION_BREATHE_RECOVER_PCT:=$(opt breathe_recover_pct)}"
    : "${CLAUDE_PLUGIN_OPTION_BREATHE_DISK_FLOOR_GIB:=$(opt breathe_disk_floor_gib)}"
  fi
fi
[ "${CLAUDE_PLUGIN_OPTION_BREATHE:-true}" != false ] || exit 0

whole() { [[ $1 =~ ^[0-9]+$ ]] && (($1 > 0)); }
floor=${CLAUDE_PLUGIN_OPTION_BREATHE_MEMORY_FLOOR_PCT:-15}
recover=${CLAUDE_PLUGIN_OPTION_BREATHE_RECOVER_PCT:-30}
disk_floor=${CLAUDE_PLUGIN_OPTION_BREATHE_DISK_FLOOR_GIB:-15}
if ! whole "$floor" || ! whole "$recover" || ((floor >= recover || recover > 100)); then floor=15 recover=30; fi
whole "$disk_floor" || disk_floor=15

# Sets mem (free memory %) and disk (free GiB on the data volume).
levels() {
  if [ -n "${BREATHE_READINGS_FILE:-}" ]; then
    read -r mem disk <"$BREATHE_READINGS_FILE"
  elif [ -n "${BREATHE_READINGS:-}" ]; then
    read -r mem disk <<<"$BREATHE_READINGS"
  else
    mem=$(sysctl -n kern.memorystatus_level 2>/dev/null) || exit 0 # not macOS
    local data=/System/Volumes/Data avail
    [ -d "$data" ] || data=/
    { read -r _; read -r _ _ _ avail _; } < <(df -k "$data")
    disk=$((avail / 1048576))
  fi
}

if [ "$event" = watch ]; then
  session=${CLAUDE_PID:-$PPID}
  tripped=
  while kill -0 "$session" 2>/dev/null; do
    levels
    if ((mem < floor || disk < disk_floor)); then
      if [ -z "$tripped" ]; then
        # Turning breathe off in /config must silence a watcher already running.
        if declare -F opt >/dev/null && [ "$(opt breathe)" = false ]; then exit 0; fi
        low=
        ((mem >= floor)) || low="free memory is ${mem}% (floor ${floor}%)"
        ((disk >= disk_floor)) || low+="${low:+ and }free disk is ${disk} GiB (floor ${disk_floor} GiB)"
        echo "breathe: the Mac is low, ${low}. The breathe note on this turn names what to stop."
      fi
      tripped=1
    elif ((mem >= recover)); then
      tripped=
    fi
    sleep "${BREATHE_INTERVAL:-10}"
  done
  exit 0
fi
levels
state=${BREATHE_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/breathe}
input= agent=main
[ -t 0 ] || read -r -d '' input || true
agent_re='"agent_id": ?"([^"]+)"'
[[ $input =~ $agent_re ]] && agent=${BASH_REMATCH[1]}
# One marker per agent that was told to slow down, so each one hears about recovery.
# yagni: markers of agents that end while tripped stay behind as empty files.
warned=$state/warned-${CLAUDE_CODE_SESSION_ID:-${CLAUDE_PID:-$PPID}}-$agent

if ((mem >= floor && disk >= disk_floor)) && { [ ! -f "$state/tripped" ] || ((mem >= recover)); }; then
  rm -f "$state/tripped"
  # Claim by rename, not rm: on APFS several concurrent unlinks of one file can all succeed.
  mv "$warned" "$warned.$$" 2>/dev/null || exit 0
  rm -f "$warned.$$"
  context="breathe: the Mac is back to ${mem}% free memory and ${disk} GiB free disk. Normal work can resume."
else
  [ -d "$state" ] || mkdir -p "$state"
  touch "$state/tripped"
  # Parallel tool calls fire hooks together; the one that makes the lock decides, the rest stay quiet.
  lock=$warned.lock
  [ -z "$(find "$lock" -maxdepth 0 -mmin +1 2>/dev/null)" ] || rmdir "$lock" 2>/dev/null || true
  mkdir "$lock" 2>/dev/null || exit 0
  trap 'rmdir "$lock" 2>/dev/null' EXIT
  [ -z "$(find "$warned" -mmin -1 2>/dev/null)" ] || exit 0
  touch "$warned"
  rmdir "$lock"
  trap - EXIT
  context="breathe: the Mac is low on resources. Stop servers, containers, watchers and test runs you no longer need. Do not start new heavy work (installs, builds, test suites, app stacks) or new parallel subagents until a breathe line says normal work can resume. Finish what is running, or wait."

  if ((mem < recover)); then
    memsize=${BREATHE_MEMSIZE:-$(sysctl -n hw.memsize)}
    used_kib=$((memsize / 1024 * (100 - mem) / 100))
    # An agent command is a process group under a `claude` process at depth 2 or more, in a group
    # without `claude` (MCP servers share its group), this hook or the breathe watcher in it. Each
    # belongs to the session (`claude` pid) it descends from; this hook's own session is the nearest
    # `claude` above it.
    # First line: KiB all agent commands hold. Then the note's session section.
    groups=$({ if [ -n "${BREATHE_PS_FILE:-}" ]; then cat "$BREATHE_PS_FILE"; else ps -axo pid=,ppid=,pgid=,rss=,command=; fi; } |
      awk -v self=$$ -v used="$used_kib" -v mine="${BREATHE_SESSION_PID:-}" -v lsof="${BREATHE_PS_FILE:+off}" '
      function gib(k) { return sprintf("%.1f GiB", k / 1048576) }
      { pid = $1; pp[pid] = $2; pg[pid] = $3; rss[pid] = $4
        c = $0; sub(/^ *[0-9]+ +[0-9]+ +[0-9]+ +[0-9]+ +/, "", c); gsub(/[[:cntrl:]"\\]/, " ", c); cmd[pid] = c
        n = c; sub(/ .*/, "", n); sub(/.*\//, "", n)
        if (n == "claude") root[pid] = 1
        ids[++total] = pid }
      END {
        if (mine == "") for (q = self; (q in pp) && q > 1 && !(q in root); ) q = pp[q]
        if (mine == "" && (q in root)) mine = q
        for (i = 1; i <= total; i++) {
          p = ids[i]; q = p; d = 0
          while (!(q in root) && (q in pp) && q > 1 && d < 100) { q = pp[q]; d++ }
          g = pg[p]
          if (!(q in root)) continue
          if (d == 0 || p == self || cmd[p] ~ /breathe\.sh watch/) bad[g] = 1
          else if (d >= 2) { sum[g] += rss[p]; owner[g] = q; if (rss[p] > rss[top[g]]) top[g] = p }
        }
        for (g in sum) if (!(g in bad)) { agents += sum[g]; s = owner[g]; held[s] += sum[g]; if (sum[g] > sum[lead[s]]) lead[s] = g }
        for (s in held) if (biggest == "" || held[s] > held[biggest]) biggest = s
        print agents + 0
        if (held[mine] == 0) print "You run no agent commands now, so you are not the cause. Only hold off new heavy work."
        else if (mine == biggest && agents * 4 >= used) print "Your commands hold " gib(held[mine]) ", the most of any session. Stop or shrink them now (for example fewer test workers). Your commands (process group, memory, command):"
        else if (held[mine] * 2 < held[biggest]) print "Your commands hold only " gib(held[mine]) ", so you are not the cause. Only hold off new heavy work. Your commands (process group, memory, command):"
        else print "Your commands hold " gib(held[mine]) ". Stop the ones you no longer need. Your commands (process group, memory, command):"
        for (k = 1; k <= 5; k++) {
          best = ""
          for (g in sum) if (!(g in bad) && owner[g] == mine && !(g in shown) && (best == "" || sum[g] > sum[best])) best = g
          if (best == "") break
          shown[best] = 1
          print best "  " gib(sum[best]) "  " substr(cmd[top[best]], 1, 80)
        }
        for (s in held) if (s != mine) {
          if (!others++) print "Other sessions, whose processes you must not touch:"
          cwd = ""
          if (lsof != "off") {
            probe = "lsof -a -p " s " -d cwd -Fn 2>/dev/null"
            while ((probe | getline l) > 0) if (l ~ /^n/) cwd = " in " substr(l, 2)
            close(probe)
          }
          print "claude pid " s cwd ": " gib(held[s]) ", largest command: " substr(cmd[top[lead[s]]], 1, 80)
        }
      }')
    agents_kib=${groups%%$'\n'*}
    context+=$'\n'"Free memory is ${mem}% (floor ${floor}%, clear at ${recover}%)."$'\n'"${groups#*$'\n'}"
    ((agents_kib * 4 >= used_kib)) || context+=$'\n'"Agent commands hold under a quarter of the memory in use; most of the pressure comes from outside the agents (the user's apps or Docker's VM). Free what you own and touch nothing else."
  fi
  ((disk >= disk_floor)) || context+=$'\n'"Free disk is ${disk} GiB (floor ${disk_floor} GiB). Agents usually fill it with worktrees, node_modules, build output, Docker images and scratch dirs; delete the ones you made and no longer need."
fi

context=${context//\\/\\\\}
context=${context//\"/\\\"}
context=${context//$'\n'/\\n}
printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"%s"}}\n' "$event" "$context"
