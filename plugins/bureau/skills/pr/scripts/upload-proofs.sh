#!/usr/bin/env bash
# Publishes proof files (png/webm/…) to a per-PR `proofs/<slug>` branch and prints markdown for a PR body.
# Videos (max 2 min) also get an 800px 16fps GIF preview at 1.25x speed, since GitHub plays video only from its attachment host.
set -euo pipefail

max_video_seconds=120

slug=${1:?usage: upload-proofs.sh <branch-or-ticket> <file>...}
shift
[ $# -gt 0 ] || { echo "no files given" >&2; exit 1; }

repo_url=$(gh repo view --json url -q .url)
branch_slug=$(tr '[:upper:]' '[:lower:]' <<<"${slug//\//-}")
ref=refs/heads/proofs/$branch_slug
# Throwaway index: never touches the working tree, checkout, or hooks.
export GIT_INDEX_FILE
GIT_INDEX_FILE=$(mktemp -u)

is_video() { case "$1" in *.webm | *.mp4 | *.mov | *.mkv) return 0 ;; *) return 1 ;; esac; }

preview_dir=$(mktemp -d)
trap 'rm -f "$GIT_INDEX_FILE"; rm -rf "$preview_dir"' EXIT
uploads=("$@")
for f in "$@"; do
  is_video "$f" || continue
  command -v ffmpeg >/dev/null || { echo "ffmpeg required to preview video $f" >&2; exit 1; }
  seconds=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  seconds=${seconds%.*}
  [[ $seconds =~ ^[0-9]+$ ]] || { echo "cannot read duration of $f" >&2; exit 1; }
  if [ "$seconds" -gt "$max_video_seconds" ]; then
    echo "$f is ${seconds}s; recordings must be at most ${max_video_seconds}s, trim or split it" >&2
    exit 1
  fi
  preview="$preview_dir/$(basename "${f%.*}").gif"
  ffmpeg -y -loglevel error -i "$f" -vf "setpts=PTS/1.25,fps=16,scale=800:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=diff_mode=rectangle" "$preview" </dev/null
  uploads+=("$preview")
done

blobs=()
for f in "${uploads[@]}"; do blobs+=("$(git hash-object -w "$f")"); done

# A rejected push means another upload for this PR landed first, so rebuild on its tip.
for attempt in 1 2 3 4 5; do
  parent=$(git ls-remote origin "$ref" | cut -f1)
  [ -z "$parent" ] || git fetch -q origin "$ref"
  if [ -n "$parent" ]; then git read-tree "$parent"; else git read-tree --empty; fi
  i=0
  for f in "${uploads[@]}"; do
    git update-index --add --cacheinfo "100644,${blobs[i]},$(basename "$f")"
    i=$((i + 1))
  done
  commit=$(git commit-tree "$(git write-tree)" ${parent:+-p "$parent"} -m "proofs: $slug")
  if err=$(git push -q origin "$commit:$ref" 2>&1); then break; fi
  grep -qE 'rejected|fetch first|non-fast-forward|cannot lock ref' <<<"$err" || { echo "$err" >&2; exit 1; }
  [ "$attempt" -lt 5 ] || { echo "$err" >&2; echo "push to $ref still rejected after 5 rebuilds" >&2; exit 1; }
  sleep $((RANDOM % 3 + attempt))
done

url_for() { echo "$repo_url/blob/$commit/$1?raw=true"; }

for f in "$@"; do
  name=$(basename "$f")
  if is_video "$name"; then
    preview="${name%.*}.gif"
    echo "![$preview]($(url_for "$preview")) [Full video]($(url_for "$name"))"
    continue
  fi
  case "$name" in
    *.png | *.jpg | *.jpeg | *.gif | *.webp) echo "![$name]($(url_for "$name"))" ;;
    *) echo "[$name]($(url_for "$name"))" ;;
  esac
done
