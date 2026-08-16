"""Conservative gray-world white-balance estimates for Lumetri controls."""

from __future__ import annotations

import numpy as np


def white_balance_metrics(frame_bgr: np.ndarray) -> dict[str, float]:
    """Estimate channel imbalance while ignoring extreme shadows/highlights."""
    pixels = frame_bgr.reshape(-1, 3).astype(np.float32) / 255.0
    luminance = pixels.mean(axis=1)
    usable = pixels[(luminance > 0.08) & (luminance < 0.92)]
    if usable.size == 0:
        usable = pixels
    # BGR channel order. Medians resist saturated graphics and practical slates.
    blue, green, red = np.median(usable, axis=0)
    neutral = max(float((red + green + blue) / 3.0), 1e-4)
    red_blue_bias = float((red - blue) / neutral)
    green_bias = float((green - ((red + blue) / 2.0)) / neutral)
    return {
        "red_median": float(red),
        "green_median": float(green),
        "blue_median": float(blue),
        "red_blue_bias": red_blue_bias,
        "green_bias": green_bias,
    }


def recommend_white_balance(metrics: dict[str, float]) -> tuple[float, float]:
    """Map measured cast to restrained Lumetri Temperature and Tint offsets."""
    temperature = np.clip(-metrics["red_blue_bias"] * 32.0, -25.0, 25.0)
    tint = np.clip(-metrics["green_bias"] * 28.0, -20.0, 20.0)
    return round(float(temperature), 1), round(float(tint), 1)
