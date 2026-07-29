#!/usr/bin/env bash

set -eu

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT

cd "$repo_root"

command -v node >/dev/null 2>&1 || {
    echo "error: Node.js is required for JavaScript validation." >&2
    exit 1
}

command -v xmllint >/dev/null 2>&1 || {
    echo "error: xmllint is required for manifest validation." >&2
    exit 1
}

echo "Checking panel JavaScript..."
node --check client/js/main.js

echo "Checking ExtendScript task modules..."
for source in host/markClips.jsx host/loudness.jsx host/renderUnscripted.jsx host/episodeSetup.jsx; do
    target="$temp_dir/$(basename "$source" .jsx).js"
    cp "$source" "$target"
    node --check "$target"
done

echo "Checking CEP manifest..."
xmllint --noout CSXS/manifest.xml

echo "Checking required entry points..."
test -f client/index.html
test -f host/index.jsx
grep -q '<MainPath>./client/index.html</MainPath>' CSXS/manifest.xml
grep -q '<ScriptPath>./host/index.jsx</ScriptPath>' CSXS/manifest.xml

echo "Validation passed."
