#!/bin/sh
# Starts the codegraph MCP server. On first use it installs the pinned CLI into
# arcane's plugin data and indexes the repo in the background; the server picks
# the index up once it exists.
set -eu
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

# init is a no-op on a built index and repairs a partial one. A linked worktree has a
# .git file; indexing each one would copy the repo's index per lane. Repos under
# min_code_files stay unindexed, since grep covers them; `codegraph init` opts one in.
min_code_files=500
root=$(git rev-parse --show-toplevel 2>/dev/null || true)
code_files() {
  git -C "$root" ls-files | grep -cE '\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|go|rs|java|c|h|cc|cpp|cxx|hpp|cs|php|rb|swift|kt|kts|dart|svelte|vue|astro|scala|lua|m|mm|sol)$' || true
}
if [ -n "$root" ] && [ -d "$root/.git" ] &&
  { [ -f "$root/.codegraph/codegraph.db" ] || [ "$(code_files)" -ge "$min_code_files" ]; }; then
  nohup nice codegraph init "$root" </dev/null >/dev/null 2>&1 &
fi

exec codegraph serve --mcp
