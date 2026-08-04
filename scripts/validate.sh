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
for source in host/episodeIdentity.jsx host/markClips.jsx host/renderUnscripted.jsx host/episodeSetup.jsx host/multicamSetup.jsx host/collectEpisode.jsx; do
    target="$temp_dir/$(basename "$source" .jsx).js"
    cp "$source" "$target"
    node --check "$target"
done

echo "Testing multicam discovery and Zencastr proxy placement..."
node tests/multicamSetup.test.js

echo "Testing episode setup indicators and footage labels..."
node tests/episodeSetupStatus.test.js

echo "Testing episode graphic and LowRes identity..."
node tests/episodeIdentity.test.js

echo "Checking CEP manifest..."
xmllint --noout CSXS/manifest.xml

echo "Checking required entry points..."
test -f client/index.html
test -f client/scripts/applyAudioChannelPreset.applescript
test -f client/scripts/createEpisodeMulticam.applescript
test -f client/scripts/prepareTalkTracks.applescript
test -f host/index.jsx
grep -q 'id="clipCount"' client/index.html
grep -q 'id="btnDetect"' client/index.html
grep -q 'function up_detectClipCount' host/markClips.jsx
grep -q '<MainPath>./client/index.html</MainPath>' CSXS/manifest.xml
grep -q '<ScriptPath>./host/index.jsx</ScriptPath>' CSXS/manifest.xml
grep -q 'Choose a preset audio channel configuration' client/scripts/applyAudioChannelPreset.applescript
grep -q 'Unscripted-MXF1' client/js/main.js
grep -q 'Unscripted-WAV3' client/js/main.js
grep -q 'Create Multi-Camera Source Sequence' client/scripts/createEpisodeMulticam.applescript
grep -q 'Add Tracks' client/scripts/prepareTalkTracks.applescript

echo "Validation passed."
