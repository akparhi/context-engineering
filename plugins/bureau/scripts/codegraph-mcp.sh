#!/bin/sh
# Starts the codegraph MCP server. On first use it installs the pinned CLI into
# bureau's plugin data and indexes the repo in the background; the server picks
# the index up once it exists.
set -eu

# No index here and none on the way: serve zero tools, since the real server's schema and
# instructions cost every session and subagent context. Keep the lookup in sync with hooks/reminders.sh.
min_code_files=500
root=$(git rev-parse --show-toplevel 2>/dev/null || true)
code_files() {
  git -C "$root" ls-files | grep -cE '\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|go|rs|java|c|h|cc|cpp|cxx|hpp|cs|php|rb|swift|kt|kts|dart|svelte|vue|astro|scala|lua|m|mm|sol)$' || true
}
dir="${CLAUDE_PROJECT_DIR:-$PWD}"
while [ ! -f "$dir/.codegraph/codegraph.db" ] && [ "$dir" != / ]; do dir=$(dirname "$dir"); done
indexed=false
[ -f "$dir/.codegraph/codegraph.db" ] && indexed=true
# A linked worktree has a .git file; indexing each one would copy the repo's index per lane.
will_index=false
if [ -n "$root" ] && [ -d "$root/.git" ] && [ "$(code_files)" -ge "$min_code_files" ]; then
  will_index=true
fi
if [ "$indexed" = false ] && [ "$will_index" = false ]; then
  exec node -e '
    require("readline").createInterface({ input: process.stdin }).on("line", (line) => {
      let m;
      try { m = JSON.parse(line); } catch { return; }
      if (m.id === undefined) return;
      const result = m.method === "initialize"
        ? { protocolVersion: m.params?.protocolVersion ?? "2025-06-18", capabilities: {}, serverInfo: { name: "codegraph", version: "off" } }
        : m.method === "tools/list" ? { tools: [] } : m.method === "ping" ? {} : undefined;
      const reply = result ? { result } : { error: { code: -32601, message: "codegraph is off: no index here" } };
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, ...reply }) + "\n");
    });'
fi

version=1.6.2
data="${CLAUDE_PLUGIN_DATA:?}"
marker="$data/codegraph-$version.installed"
lock="$data/codegraph-install.lock"

if ! command -v codegraph >/dev/null 2>&1; then
  PATH="$data/node_modules/.bin:$PATH"
  if [ ! -f "$marker" ]; then
    mkdir -p "$data"
    if [ -n "$(find "$lock" -prune -mmin +10 2>/dev/null)" ] && ! kill -0 "$(cat "$lock/pid" 2>/dev/null)" 2>/dev/null; then
      rm -rf "$lock"
    fi
    if mkdir "$lock" 2>/dev/null; then
      # Detached so a session that times out on startup cannot kill a half-done install.
      # From $HOME so a repo .npmrc cannot redirect the registry.
      (cd ~ && nohup sh -c 'echo $$ > "$4/pid"; npm i --prefix "$1" --ignore-scripts --no-audit --no-fund --silent \
        --@colbymchenry:registry=https://registry.npmjs.org/ "@colbymchenry/codegraph@$2" && touch "$3"; rm -rf "$4"' \
        sh "$data" "$version" "$marker" "$lock" </dev/null >/dev/null 2>&1 &)
    fi
    # 25 s keeps the wait under Claude Code's default 30 s MCP startup timeout.
    waited=0
    while [ -d "$lock" ] && [ "$waited" -lt 25 ]; do sleep 1; waited=$((waited + 1)); done
    if [ ! -f "$marker" ]; then
      echo 'codegraph is still installing or failed to install; run /mcp to reconnect in a minute.' >&2
      exit 1
    fi
  fi
fi

# init is a no-op on a built index and repairs a partial one.
if [ -n "$root" ] && [ -d "$root/.git" ] && { [ -f "$root/.codegraph/codegraph.db" ] || [ "$will_index" = true ]; }; then
  nohup nice codegraph init "$root" </dev/null >/dev/null 2>&1 &
fi

exec codegraph serve --mcp
