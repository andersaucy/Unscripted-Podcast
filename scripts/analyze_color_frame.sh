#!/usr/bin/env bash
set -eu

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
venv_dir="$repo_root/python/.venv"

if [ ! -f "$venv_dir/bin/activate" ]; then
    echo "Color engine environment is missing. Run scripts/setup_color_engine.sh." >&2
    exit 2
fi

# CEP can resolve a venv Python symlink to its Homebrew base interpreter.
# Explicit activation makes the environment and its site-packages unambiguous.
source "$venv_dir/bin/activate"
exec python "$repo_root/python/analyze_cli.py" "$1" "$2"
