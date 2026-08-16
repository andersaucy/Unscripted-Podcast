"""Asynchronous CEP adapter returning the standalone analyzer JSON contract."""

from __future__ import annotations

import json
import sys


def main() -> int:
    if len(sys.argv) != 3:
        print(json.dumps({"ok": False, "error": "Usage: analyze_cli.py MEDIA TIMESTAMP"}))
        return 2
    media_path = sys.argv[1]
    timestamp = float(sys.argv[2])
    try:
        from analyzer import analyze_frame
        from frame_extractor import extract_frame
        from metadata import probe_media

        result = analyze_frame(extract_frame(media_path, timestamp))
        result["media_metadata"] = probe_media(media_path)
        result.update({"ok": True, "media_path": media_path,
                       "timestamp_seconds": timestamp})
        print(json.dumps(result, separators=(",", ":")))
        return 0
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error),
                          "python_executable": sys.executable,
                          "python_prefix": sys.prefix}, separators=(",", ":")))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
