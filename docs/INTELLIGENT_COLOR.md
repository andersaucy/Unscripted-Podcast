# Intelligent Camera Color

Intelligent Color provides a consistent technical starting point for interview
and podcast footage. It is designed for repeatability, not a final creative
grade or an Adobe Sensei replacement.

## Workflow

```mermaid
flowchart LR
    Clips["Timeline clips"] --> Group["Group by camera"]
    Group --> Frame["Representative frame"]
    Frame --> Analyze["Local OpenCV analysis"]
    Analyze --> JSON["Basic Correction JSON"]
    JSON --> Apply["Apply to every group member"]
```

The analyzer is available:

- inside Unscripted-Podcast through **Analyze Camera Groups**;
- automatically for both `INTRO-###` and `TALK-###` during **Create Episode
  Multicams**;
- as a standalone Smart Camera Color CEP panel for unrelated projects.

## Camera grouping

The Premiere host groups online video TrackItems using this priority:

1. Camera tokens such as `CAM1`, `CAM2`, `CAMERA-A`, or `C1`.
2. The source media folder when no camera token exists.
3. The normalized filename stem as a final fallback.

The longest clip in each group becomes the representative. One frame is sampled
approximately 5–10 seconds into that source, avoiding the first slate/fade area
when duration allows.

One recommendation object is applied to every clip in the group. INTRO and TALK
are analyzed independently because lighting can change between recording
segments.

## Local analysis

The Python engine uses OpenCV and NumPy to measure:

- luminance percentiles and median brightness;
- shadow and highlight clipping ratios;
- dynamic range and contrast;
- RGB balance and estimated white balance;
- average saturation.

It returns Lumetri Basic Correction values for Exposure, Contrast, Highlights,
Shadows, Whites, Blacks, Temperature, Tint, and Saturation.

The extension contains no image-analysis heuristics. It only sends a local media
path and timestamp to the analyzer, receives versioned JSON, and applies those
values through Premiere.

## Exposure protection

Exposure uses both median luminance and the 95th-percentile highlight level. A
dark frame with bright faces, practical lights, or windows therefore cannot be
lifted solely because its median is low.

- Positive recommendations are capped at `+0.85` stops.
- Existing highlight clipping reduces that cap toward zero.
- Highlights and Whites remain separate tone controls.
- Significant clipping lowers confidence and produces a warning.

This intentionally favors a conservative, recoverable starting point.

## Camera and profile metadata

When `ffprobe` is available, the engine reads camera make/model and color-space
metadata. It recognizes common log/HDR indicators such as S-Log, Canon Log,
V-Log, LogC, F-Log, HLG, and PQ.

Automatic Basic Correction pauses when log or HDR media still requires a
technical normalization transform. The current engine does not guess a camera
LUT from incomplete metadata.

## Runtime boundary

The local analyzer runs in an isolated Python environment with OpenCV and NumPy.
FFmpeg/FFprobe provide frame extraction and metadata inspection. Generated
environments, bytecode, and analyzed frames are excluded from the repository.

The CEP client first checks the local analyzer transport. If loopback HTTP is
unavailable in that CEP runtime, it launches the same analyzer contract through
an asynchronous local CLI adapter. Frames and recommendations are not uploaded.

## Review and completion state

The separate Analyze button shows:

- discovered groups and representative clip;
- camera/profile metadata when available;
- confidence and warnings;
- every proposed Basic Correction value.

After application, the host writes a `Smart Camera Color Analyzed` sequence
marker containing a signature of the analyzed clips. Unscripted-Podcast compares
that signature with the current INTRO/TALK contents. Adding, removing, or moving
camera clips invalidates stale completion status.

## Limitations

- Results are deterministic heuristics, not shot-aware creative grading.
- One frame cannot detect lighting changes within a long source clip.
- Face/skin-tone detection is not part of the current MVP.
- Log/HDR normalization requires a confirmed technical profile.
- Lumetri parameter lookup uses English display names because Premiere does not
  expose stable public match names for every Basic Correction control.

The versioned JSON boundary keeps the analysis engine replaceable without
coupling image-analysis code to Premiere's grouping/application modules.

[Back to README](../README.md) · [Architecture](ARCHITECTURE.md)
