#!/usr/bin/env bash
# Publishes proof files (png/webm/…) to a per-PR `proofs/<slug>` branch and prints markdown for a PR body.
set -euo pipefail

slug=${1:?usage: upload-proofs.sh <branch-or-ticket> <file>...}
shift
[ $# -gt 0 ] || { echo "no files given" >&2; exit 1; }

repo_url=$(gh repo view --json url -q .url)
branch_slug=$(tr '[:upper:]' '[:lower:]' <<<"${slug//\//-}")
ref=refs/heads/proofs/$branch_slug
# Throwaway index: never touches the working tree, checkout, or hooks.
export GIT_INDEX_FILE
GIT_INDEX_FILE=$(mktemp -u)
trap 'rm -f "$GIT_INDEX_FILE"' EXIT

blobs=()
for f in "$@"; do blobs+=("$(git hash-object -w "$f")"); done

# A rejected push means another upload for this PR landed first, so rebuild on its tip.
for attempt in 1 2 3 4 5; do
  parent=$(git ls-remote origin "$ref" | cut -f1)
  [ -z "$parent" ] || git fetch -q origin "$ref"
  if [ -n "$parent" ]; then git read-tree "$parent"; else git read-tree --empty; fi
  i=0
  for f in "$@"; do
    git update-index --add --cacheinfo "100644,${blobs[i]},$(basename "$f")"
    i=$((i + 1))
  done
  commit=$(git commit-tree "$(git write-tree)" ${parent:+-p "$parent"} -m "proofs: $slug")
  if err=$(git push -q origin "$commit:$ref" 2>&1); then break; fi
  grep -qE 'rejected|fetch first|non-fast-forward|cannot lock ref' <<<"$err" || { echo "$err" >&2; exit 1; }
  [ "$attempt" -lt 5 ] || { echo "$err" >&2; echo "push to $ref still rejected after 5 rebuilds" >&2; exit 1; }
  sleep $((RANDOM % 3 + attempt))
done

for f in "$@"; do
  name=$(basename "$f")
  url="$repo_url/blob/$commit/$name?raw=true"
  case "$name" in
    *.png | *.jpg | *.jpeg | *.gif | *.webp) echo "![$name]($url)" ;;
    *) echo "[$name]($url)" ;;
  esac
done
