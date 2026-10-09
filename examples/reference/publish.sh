#!/usr/bin/env bash
# Publish (or update) one reference artifact with the shared kit bundled in.
#
#   ./publish.sh <artifact-dir> ["update message"]
#
# <artifact-dir>/artifact.json holds slug, title and description.
# The directory is staged to a temp folder, ./kit is copied in (the server
# rejects symlinks), then `artifact publish` runs for a new slug or
# `artifact update` for an existing one. This folder is the source of truth:
# an update replaces whatever is live with this content.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
src="$(cd "${1:?usage: publish.sh <artifact-dir> [message]}" && pwd)"
msg="${2:-Update from examples/reference}"
meta="$src/artifact.json"
[ -f "$meta" ] || { echo "missing $meta" >&2; exit 1; }
read_meta() { python3 -c "import json,sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])" "$meta" "$1"; }
slug="$(read_meta slug)"; title="$(read_meta title)"; desc="$(read_meta description)"

stage="$(mktemp -d)"; trap 'rm -rf "$stage"' EXIT
cp -R "$src/." "$stage/"
rm -f "$stage/artifact.json"
rm -rf "$stage/kit" && cp -R "$here/kit" "$stage/kit"

if info="$(artifact info "$slug" --json 2>/dev/null)"; then
  rev="$(python3 -c "import json,sys; print(json.load(sys.stdin)['revision'])" <<<"$info")"
  artifact update "$slug" "$stage" --title "$title" --description "$desc" \
    --message "$msg" --expected-revision "$rev" --json
else
  artifact publish "$stage" --slug "$slug" --title "$title" --description "$desc" --json
fi
