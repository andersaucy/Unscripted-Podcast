# Changelog

All notable repository changes are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Planned

- Configurable folder and recorder profiles.
- Camera-label metadata derived from filename patterns.
- Native multicamera creation when Adobe exposes a supported API.

## [1.1.0] - 2026-07-29

### Added

- Automatic discovery of `Assets/Footage` relative to the saved Premiere
  project.
- Recursive import with project-bin hierarchy preservation.
- Duplicate detection based on normalized source media paths.
- MXF mono mapping to embedded channel 1.
- WAV three-mono mapping to embedded channels 5, 6, and 7.
- Separate audio-remapping action for existing Footage-bin media.
- Guided multicamera handoff using timecode or audio synchronization.
- Capability checks and detailed import/audio diagnostics.

## [1.0.0] - 2026-07-29

### Added

- CEP panel for Premiere Pro 24.0 and newer.
- Timestamp-driven marker and social-clip sequence generation.
- FFmpeg-based integrated LUFS analysis.
- Boost-only dialogue normalization with configurable threshold and target.
- Adobe Media Encoder queueing for video and audio deliverables.
- Sanitized, portable export paths for source control.
