"""Exposure and tone recommendations from luminance statistics."""

from __future__ import annotations

import math
import numpy as np


def recommend_tone(metrics: dict[str, float]) -> dict[str, float]:
    """Produce conservative Lumetri Basic Correction tone values.

    The goal is a balanced starting point, not a creative grade. Values are
    deliberately bounded so a difficult frame cannot generate a destructive
    correction across an entire camera group.
    """
    median = max(metrics["median_luma"], 0.02)
    requested_exposure = math.log(0.42 / median, 2)

    # A median-only correction can overexpose a dark room that still contains
    # bright faces, practical lights, or windows. Treat p95 as highlight
    # headroom and constrain only positive exposure. Dark frames with genuinely
    # empty highlights can still receive a useful lift, but never more than
    # 0.85 stop from this deterministic first pass.
    p95 = max(metrics["p95"], 0.05)
    highlight_headroom = math.log(0.94 / p95, 2)
    positive_limit = float(np.clip(highlight_headroom + 0.25, 0.15, 0.85))
    if metrics["highlight_clip_ratio"] > 0.01:
        clipped_limit = max(0.0, 0.20 - metrics["highlight_clip_ratio"] * 5.0)
        positive_limit = min(positive_limit, clipped_limit)
    exposure = np.clip(requested_exposure, -1.25, positive_limit)
    dynamic_range = metrics["dynamic_range"]
    contrast = np.clip((0.58 - dynamic_range) * 45.0, -15.0, 18.0)

    highlight_pressure = max(0.0, (metrics["p95"] - 0.82) / 0.18)
    shadow_pressure = max(0.0, (0.16 - metrics["p05"]) / 0.16)
    highlights = np.clip(-highlight_pressure * 42.0 -
                         metrics["highlight_clip_ratio"] * 220.0, -65.0, 8.0)
    shadows = np.clip(shadow_pressure * 38.0 +
                      metrics["shadow_clip_ratio"] * 180.0, -8.0, 55.0)
    whites = np.clip((0.94 - metrics["p99"]) * 35.0, -18.0, 18.0)
    blacks = np.clip((0.025 - metrics["p01"]) * 120.0, -15.0, 12.0)

    return {
        "exposure": round(float(exposure), 2),
        "contrast": round(float(contrast), 1),
        "highlights": round(float(highlights), 1),
        "shadows": round(float(shadows), 1),
        "whites": round(float(whites), 1),
        "blacks": round(float(blacks), 1),
    }
