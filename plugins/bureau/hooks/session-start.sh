#!/bin/sh
set -eu
# Prints the routing rules, then the models section: models.json with /config values merged in.
# With "models", prints only the models section, for subagents.
# Literal plugin paths, so a static reader of hooks.json can follow them.
[ "${1:-}" = models ] || cat "${CLAUDE_PLUGIN_ROOT}/hooks/session-start-context.md"
cat "${CLAUDE_PLUGIN_ROOT}/hooks/models-context.md"

# Lays models.json out one tier, setting, and role per line, for the line edits below and a compact
# context. Each role has a normal "models" value and a "fast" one; the mode picks which stays as "models".
models=$(node -e '
const m = JSON.parse(require("fs").readFileSync(process.argv[1]));
const fast = process.argv[2] === "true";
const value = (x) => Array.isArray(x) ? `[${x.map((e) => JSON.stringify(e)).join(", ")}]` : JSON.stringify(x);
const entries = (o) => Object.entries(o).map(([k, x]) => `"${k}": ${value(x)}`);
const role = ({ fast: fastValue, ...r }) => `    { ${entries({ ...r, models: fast ? fastValue : r.models }).join(", ")} }`;
const line = ([k, x]) =>
  k === "roles" ? `  "roles": [\n${x.map(role).join(",\n")}\n  ]`
  : x.constructor === Object ? `  "${k}": {\n${entries(x).map((e) => "    " + e).join(",\n")}\n  }`
  : `  "${k}": ${value(x)}`;
console.log(`{\n${Object.entries(m).map(line).join(",\n")}\n}`);
' "${CLAUDE_PLUGIN_ROOT}/models.json" "${CLAUDE_PLUGIN_OPTION_FAST_MODE:-}")

# Succeeds when a /config value replaces the file's; "models.json: .." or blank keeps it.
chosen() {
  case "${1:-models.json}" in
    models.json*) return 1 ;;
  esac
  value=$(printf '%s' "$1" | tr -cd 'A-Za-z0-9 ,@._-')
}
json_list() { printf '%s' "$1" | tr -cd 'A-Za-z0-9 ,@._-' | sed 's/ *, */", "/g; s/^/["/; s/$/"]/'; }

# Panel slots: rebuild the whole list when any slot moves off its file value.
panel='' panel_changed=''
while IFS= read -r slot; do
  case "$slot" in
    '') continue ;;
    models.json:*) slot="${slot#models.json: }" ;;
    *) panel_changed=1 ;;
  esac
  [ "$slot" = none ] || panel="${panel:+$panel, }$slot"
done <<EOF
$(env | sed -n 's/^CLAUDE_PLUGIN_OPTION_PANEL_MODEL_\([0-9]*\)=/\1 /p' | sort -n | cut -d' ' -f2-)
EOF

printf '```json\n'
while IFS= read -r line; do
  case "$line" in
    *'"default": "'*) chosen "${CLAUDE_PLUGIN_OPTION_DEFAULT_MODEL:-}" && line=$(printf '%s' "$line" | sed "s|: \".*\"|: \"$value\"|") ;;
    *'"strongest": "'*) chosen "${CLAUDE_PLUGIN_OPTION_STRONGEST_MODEL:-}" && line=$(printf '%s' "$line" | sed "s|: \".*\"|: \"$value\"|") ;;
    *'"fast": "'*) chosen "${CLAUDE_PLUGIN_OPTION_FAST_MODEL:-}" && line=$(printf '%s' "$line" | sed "s|: \".*\"|: \"$value\"|") ;;
    *'"worker": "'*) chosen "${CLAUDE_PLUGIN_OPTION_WORKER_MODEL:-}" && line=$(printf '%s' "$line" | sed "s|: \".*\"|: \"$value\"|") ;;
    *'"defaultEffort": "'*) chosen "${CLAUDE_PLUGIN_OPTION_DEFAULT_EFFORT:-}" && line=$(printf '%s' "$line" | sed "s|: \".*\"|: \"$value\"|") ;;
    *'"panel": ['*) [ -z "$panel_changed" ] || line=$(printf '%s' "$line" | sed "s|\[.*\]|$(json_list "$panel")|") ;;
    *'"role": "'*)
      # Role keys match bin/sync-bureau-config.mjs: lowercase, non-letters as `_`.
      key=$(printf '%s' "$line" | sed 's/.*"role": "\([^"]*\)".*/\1/' | tr -cs 'a-z' '_' | sed 's/^_//; s/_$//' | tr 'a-z' 'A-Z')
      eval "role_value=\${CLAUDE_PLUGIN_OPTION_ROLE_$key:-}"
      if chosen "$role_value"; then
        # A /config model keeps the file's " @<effort>" unless it names its own.
        effort=$(printf '%s' "$line" | sed -n 's/.*"models": "[^"@]*\( @[a-z]*\)".*/\1/p')
        case "$value" in *@*) ;; *) value=$(printf '%s' "$value" | sed "s/ *, */$effort, /g")$effort ;; esac
        case "$line" in
          *'"models": "panel'*) value=$(json_list "$value") ;;
          *) value="\"$value\"" ;;
        esac
        line=$(printf '%s' "$line" | sed "s|\"models\": \"[^\"]*\"|\"models\": $value|")
      fi
      ;;
  esac
  printf '%s\n' "$line"
done <<EOF
$models
EOF
printf '```\n'
