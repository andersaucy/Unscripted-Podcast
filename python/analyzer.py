"""Analyzer orchestration. Premiere-specific concepts do not belong here."""

from __future__ import annotations

import cv2
import numpy as np

from exposure import recommend_tone
from histogram import luminance_metrics
from recommendations import clamp_recommendations
from whitebalance import recommend_white_balance, white_balance_metrics


def analyze_frame(frame_bgr: np.ndarray) -> dict:
    if frame_bgr is None or frame_bgr.ndim != 3 or frame_bgr.shape[2] != 3:
        raise ValueError("Expected a BGR image with three channels")
    # Bound CPU cost and make results stable across high-resolution camera files.
    height, width = frame_bgr.shape[:2]
    if width > 1280:
        scale = 1280.0 / width
        frame_bgr = cv2.resize(frame_bgr, (1280, max(1, int(height * scale))),
                               interpolation=cv2.INTER_AREA)

    luminance = luminance_metrics(frame_bgr)
    balance = white_balance_metrics(frame_bgr)
    tone = recommend_tone(luminance)
    temperature, tint = recommend_white_balance(balance)

    hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
    current_saturation = float(np.mean(hsv[:, :, 1])) / 255.0
    saturation = float(np.clip(100.0 + (0.34 - current_saturation) * 30.0, 92.0, 112.0))
    recommendations = clamp_recommendations({
        **tone,
        "temperature": temperature,
        "tint": tint,
        "saturation": round(saturation, 1),
    })

    warnings: list[str] = []
    if luminance["highlight_clip_ratio"] > 0.04:
        warnings.append("Frame contains significant clipped highlights.")
    if luminance["shadow_clip_ratio"] > 0.08:
        warnings.append("Frame contains significant clipped shadows.")
    confidence = 1.0 - min(0.55, luminance["highlight_clip_ratio"] * 2.5 +
                           luminance["shadow_clip_ratio"] * 1.5)
    return {
        "schema_version": "1.0",
        "analyzer": "opencv-deterministic-v1",
        "recommendations": recommendations,
        "confidence": round(float(confidence), 2),
        "warnings": warnings,
        "metrics": {**luminance, **balance, "mean_saturation": current_saturation},
    }
