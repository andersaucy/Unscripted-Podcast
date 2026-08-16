"""Read camera and color metadata without depending on Premiere Pro."""

from __future__ import annotations

import json
import shutil
import subprocess


def probe_media(media_path: str) -> dict:
    ffprobe = shutil.which("ffprobe")
    result = {
        "camera_make": "",
        "camera_model": "",
        "color_transfer": "",
        "color_primaries": "",
        "color_space": "",
        "detected_profile": "unknown",
        "confidence": 0.0,
        "normalization_required": False,
        "warnings": [],
    }
    if not ffprobe:
        result["warnings"].append("FFprobe is unavailable; camera metadata was not inspected.")
        return result
    command = [ffprobe, "-v", "error", "-select_streams", "v:0",
               "-show_entries", "stream=color_space,color_transfer,color_primaries:format_tags",
               "-of", "json", media_path]
    completed = subprocess.run(command, capture_output=True, text=True,
                               check=False, timeout=20)
    if completed.returncode != 0:
        result["warnings"].append("FFprobe could not read camera metadata.")
        return result
    payload = json.loads(completed.stdout or "{}")
    stream = (payload.get("streams") or [{}])[0]
    tags = payload.get("format", {}).get("tags", {}) or {}
    normalized_tags = {str(key).lower(): str(value) for key, value in tags.items()}
    result["camera_make"] = _first(normalized_tags, "make", "manufacturer", "com.apple.quicktime.make")
    result["camera_model"] = _first(normalized_tags, "model", "camera_model_name",
                                     "com.apple.quicktime.model")
    result["color_transfer"] = str(stream.get("color_transfer") or "")
    result["color_primaries"] = str(stream.get("color_primaries") or "")
    result["color_space"] = str(stream.get("color_space") or "")
    searchable = " ".join([json.dumps(normalized_tags), result["color_transfer"],
                           result["color_primaries"], result["color_space"]]).lower()

    profiles = [
        (("s-log3", "slog3"), "sony-slog3", 0.95),
        (("s-log2", "slog2"), "sony-slog2", 0.95),
        (("s-log", "slog"), "sony-slog", 0.80),
        (("canon log 3", "clog3"), "canon-log3", 0.95),
        (("canon log", "clog"), "canon-log", 0.85),
        (("v-log", "vlog"), "panasonic-vlog", 0.90),
        (("logc4", "log c4"), "arri-logc4", 0.95),
        (("logc3", "log c3"), "arri-logc3", 0.95),
        (("f-log", "flog"), "fuji-flog", 0.90),
    ]
    for needles, profile, confidence in profiles:
        if any(needle in searchable for needle in needles):
            result["detected_profile"] = profile
            result["confidence"] = confidence
            result["normalization_required"] = True
            break
    if result["detected_profile"] == "unknown":
        transfer = result["color_transfer"].lower()
        if transfer in {"bt709", "iec61966-2-1"}:
            result["detected_profile"] = "rec709"
            result["confidence"] = 0.75
        elif transfer in {"arib-std-b67", "smpte2084"}:
            result["detected_profile"] = "hlg" if transfer == "arib-std-b67" else "pq"
            result["confidence"] = 0.90
            result["normalization_required"] = True
    if result["detected_profile"] == "unknown":
        result["warnings"].append(
            "The recording gamma/gamut was not identified. Confirm the camera profile before log work."
        )
    elif result["normalization_required"]:
        result["warnings"].append(
            "Log/HDR media detected. Technical normalization must be confirmed before applying balance values."
        )
    return result


def _first(tags: dict[str, str], *names: str) -> str:
    for name in names:
        if tags.get(name):
            return tags[name]
    return ""
