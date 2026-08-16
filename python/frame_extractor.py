"""Representative-frame extraction with OpenCV and FFmpeg fallback."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import cv2
import numpy as np


def extract_frame(media_path: str, timestamp_seconds: float) -> np.ndarray:
    path = Path(media_path).expanduser()
    if not path.is_file():
        raise FileNotFoundError(f"Media file does not exist: {path}")

    if path.suffix.lower() in {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp"}:
        frame = cv2.imread(str(path), cv2.IMREAD_COLOR)
    else:
        frame = _extract_with_opencv(path, timestamp_seconds)
        if frame is None:
            frame = _extract_with_ffmpeg(path, timestamp_seconds)
    if frame is None or frame.size == 0:
        raise RuntimeError(f"Could not decode a representative frame from {path.name}")
    return frame


def _extract_with_opencv(path: Path, timestamp_seconds: float) -> np.ndarray | None:
    capture = cv2.VideoCapture(str(path))
    try:
        capture.set(cv2.CAP_PROP_POS_MSEC, max(0.0, timestamp_seconds) * 1000.0)
        ok, frame = capture.read()
        return frame if ok else None
    finally:
        capture.release()


def _extract_with_ffmpeg(path: Path, timestamp_seconds: float) -> np.ndarray | None:
    executable = shutil.which("ffmpeg")
    if not executable:
        return None
    command = [
        executable, "-v", "error", "-ss", str(max(0.0, timestamp_seconds)),
        "-i", str(path), "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"
    ]
    completed = subprocess.run(command, check=False, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, timeout=30)
    if completed.returncode != 0 or not completed.stdout:
        return None
    encoded = np.frombuffer(completed.stdout, dtype=np.uint8)
    return cv2.imdecode(encoded, cv2.IMREAD_COLOR)
