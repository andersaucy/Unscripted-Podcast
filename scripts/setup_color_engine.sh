#!/usr/bin/env bash
set -eu

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
python_bin="${PYTHON_BIN:-python3}"

"$python_bin" -m venv "$repo_root/python/.venv"
"$repo_root/python/.venv/bin/python" -m pip install --upgrade pip
"$repo_root/python/.venv/bin/python" -m pip install -r "$repo_root/python/requirements.txt"
echo "Color engine ready: $repo_root/python/.venv/bin/python"
