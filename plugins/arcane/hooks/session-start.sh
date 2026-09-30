#!/bin/sh
set -eu
# Literal plugin paths, so a static reader of hooks.json can follow them.
cat "${CLAUDE_PLUGIN_ROOT}/hooks/session-start-context.md"

# Prints models.json with /config values merged in. Edits line by line, so
# models.json must keep each tier, setting, and role on its own line.

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
    *'"defaultEffort": "'*) chosen "${CLAUDE_PLUGIN_OPTION_DEFAULT_EFFORT:-}" && line=$(printf '%s' "$line" | sed "s|: \".*\"|: \"$value\"|") ;;
    *'"panel": ['*) [ -z "$panel_changed" ] || line=$(printf '%s' "$line" | sed "s|\[.*\]|$(json_list "$panel")|") ;;
    *'"role": "'*)
      # Role keys match bin/sync-arcane-config.mjs: lowercase, non-letters as `_`.
      key=$(printf '%s' "$line" | sed 's/.*"role": "\([^"]*\)".*/\1/' | tr -cs 'a-z' '_' | sed 's/^_//; s/_$//' | tr 'a-z' 'A-Z')
      eval "role_value=\${CLAUDE_PLUGIN_OPTION_ROLE_$key:-}"
      if chosen "$role_value"; then
        case "$line" in
          *'"models": "panel"'*) value=$(json_list "$value") ;;
          *) value="\"$value\"" ;;
        esac
        line=$(printf '%s' "$line" | sed "s|\"models\": \"[^\"]*\"|\"models\": $value|")
      fi
      ;;
  esac
  printf '%s\n' "$line"
done <"${CLAUDE_PLUGIN_ROOT}/models.json"
printf '```\n'
