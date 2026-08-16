"""Luminance and clipping measurements used by the deterministic analyzer."""

from __future__ import annotations

import cv2
import numpy as np


def luminance_metrics(frame_bgr: np.ndarray) -> dict[str, float]:
    """Return normalized luminance distribution metrics for an 8-bit BGR frame."""
    lab = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2LAB)
    luminance = lab[:, :, 0].astype(np.float32) / 255.0
    percentiles = np.percentile(luminance, [1, 5, 25, 50, 75, 95, 99])
    return {
        "mean_luma": float(np.mean(luminance)),
        "p01": float(percentiles[0]),
        "p05": float(percentiles[1]),
        "p25": float(percentiles[2]),
        "median_luma": float(percentiles[3]),
        "p75": float(percentiles[4]),
        "p95": float(percentiles[5]),
        "p99": float(percentiles[6]),
        "shadow_clip_ratio": float(np.mean(luminance <= 0.015)),
        "highlight_clip_ratio": float(np.mean(luminance >= 0.985)),
        "dynamic_range": float(percentiles[5] - percentiles[1]),
    }
