#!/bin/sh
# Prints the markdown file $1 with each "@<name>.md" line replaced by that file from the same
# directory, so a section shared by the main-agent and subagent contexts lives in one file.
set -eu
awk -v dir="$(dirname "$1")" '
  /^@[A-Za-z0-9._-]+\.md$/ {
    path = dir "/" substr($0, 2)
    if ((getline line < path) <= 0) { print "expand-imports: cannot read " path > "/dev/stderr"; exit 1 }
    do print line; while ((getline line < path) > 0)
    close(path)
    next
  }
  { print }
' "$1"
