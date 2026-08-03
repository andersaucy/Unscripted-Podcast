# Changelog

All notable repository changes are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Planned

- Configurable folder and recorder profiles.
- Camera-label metadata derived from filename patterns.
- Native multicamera creation when Adobe exposes a supported API.

## [1.2.0] - 2026-08-03

### Added

- Added macOS batch application of the saved Audio Channels presets
  `Unscripted-MXF1` and `Unscripted-WAV3` to matching media in the `Footage`
  bin.
- Added semantic Accessibility automation for Premiere's native Modify Clip
  preset control, with no screen-coordinate dependency.
- Added an episode-scoped `Collect & Save Episode` panel action.
- Saves the active project, then uses Premiere Project Manager to copy every
  sequence and referenced media file into a self-contained episode package.
- Names the package from the active project and creates a numbered destination
  when an earlier collection already exists.
- Keeps the active project open and unchanged after collection.

### Changed

- Updated episode discovery to require the active project directly inside
  `00_Projects` and import media from the sibling `01_Assets/Footage` folder.
- Made audio interpretation explicit and verifiable: MXF becomes one mono clip
  from source channel 1; WAV becomes three mono clips from channels 5, 6, and 7.
- Added graceful detection and concise manual guidance for Premiere builds that
  expose the legacy audio-channel format/count properties as read-only.
- Configure Footage Audio now uses Premiere's saved presets on macOS to bypass
  that 26.x regression while retaining the legacy API path elsewhere.

### Removed

- Removed the FFmpeg-based `Normalize Dialogue` feature because its serial,
  clip-by-clip source analysis was too slow for full podcast episodes and did
  not measure the processed Premiere timeline mix.
- Removed the related Node.js CEP permissions and external FFmpeg dependency.

## [1.1.1] - 2026-08-01

### Changed

- Removed the manual Clip Count input and Detect button from the panel.
- `Mark Clips` now always derives its sequence count directly from valid
  `FROM`/`TO` ranges in `PodcastClips.txt`.
- Removed the unused clip-count override and detection host APIs.

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
