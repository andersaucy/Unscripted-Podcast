"""Stable recommendation contract shared by all analyzer implementations."""

from __future__ import annotations

from typing import Mapping

PARAMETER_LIMITS = {
    "exposure": (-5.0, 5.0),
    "contrast": (-100.0, 100.0),
    "highlights": (-100.0, 100.0),
    "shadows": (-100.0, 100.0),
    "whites": (-100.0, 100.0),
    "blacks": (-100.0, 100.0),
    "temperature": (-100.0, 100.0),
    "tint": (-100.0, 100.0),
    "saturation": (0.0, 200.0),
}


def clamp_recommendations(values: Mapping[str, float]) -> dict[str, float]:
    """Validate and clamp values to Lumetri's public Basic Correction ranges."""
    result: dict[str, float] = {}
    for name, (minimum, maximum) in PARAMETER_LIMITS.items():
        if name not in values:
            raise ValueError(f"Missing recommendation: {name}")
        value = float(values[name])
        result[name] = round(max(minimum, min(maximum, value)), 2)
    return result
