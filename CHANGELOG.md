# Changelog

All notable repository changes are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- Simplified the Episode Setup panel by moving preset-permission and sync-MP3
  naming guidance into repository documentation.
- Moved **Collect & Save Episode** into **Editing & Export**, where episode
  packaging sits alongside Mark Clips and final delivery.
- Restored **Mark Clips** to its local `PodcastClips.txt` workflow and removed
  the Google Drive/Docs bridge, account authorization, and remote configuration.

### Planned

- Configurable folder and recorder profiles.
- Camera-label metadata derived from filename patterns.
- Native multicamera creation when Adobe exposes a supported API.

## [1.3.0] - 2026-08-03

### Added

- Added one-click creation of `INTRO-###` and `TALK-###` multicamera source
  sequences from matching media in the `Footage` bin.
- Added flexible TALK stem detection for guest/topic names of any hyphenated
  length, plus matching recorder WAV and unique Zencastr MOV inclusion.
- Added CAM1-first deterministic ordering and audio track channel 1 sync.
- Added preflight diagnostics and verification for missing CAM1, ambiguous
  stems, offline media, duplicate sequence names, and uncertain Zencastr media.
- Added a Zencastr sync-proxy workflow: TALK multicams prefer a matching MP3
  named with `audio for sync` or `Zencastr`, then place the Zencastr MOV on a
  new track at the proxy MP3's synchronized start time.
- Made multicam creation resumable and idempotent by skipping verified existing
  sequences and existing Zencastr sidecar placement.
- Reduced native dialog automation to the custom sequence name and audio sync
  channel only; all other multicam settings retain Premiere's defaults.
- Added persistent Episode Setup badges that count imported footage and verify
  MXF/WAV mono format and audio-clip counts from the active project.
- Combined import and saved-preset audio configuration into one sequential
  **Import & Configure Footage** action with both checks inside the same button.
- Added an idempotent first setup stage that derives `PODCAST###`, writes it to
  the numeric `Episode Number` control on the V2 AE MOGRT in `_CLIP INTRO`, and
  opens that sequence for visual verification.
- Added direct MOGRT-value verification and removed the unreliable
  Premiere-native Effect Controls accessibility fallback.
- Renamed the legacy `LowRes` sequence to `### LowRes_v1` and made Mark Clips
  resolve the episode-aware name with a migration fallback for older projects.
- Added a third project-derived Episode badge for the graphic and sequence name.
- Added Premiere Project-label organization: video sources use Teal and audio
  sources use Green, including media moved out of the Footage bin later.
- Added an expandable activity-log view and a fixed readable default log area;
  Episode Setup actions scroll independently in shorter panel layouts.
- Added deterministic TALK track finishing: CAM1, Zencastr, and CAM2-CAM4 occupy
  V1-V5; the three recorder WAV mono channels occupy A1-A3, sync MP3 A4,
  Zencastr audio A5, and existing camera audio is preserved from A6 downward.
- Added track-structure polling after Premiere's Add Tracks dialog so macOS
  accessibility teardown errors cannot falsely fail a successful operation.
- Split reliable INTRO/TALK multicam creation from optional TALK track finishing
  so Zencastr/Add Tracks automation cannot fail the core creation action.
- Opened both completed multicam source sequences as Timeline tabs after
  verification, with TALK left active for editing.

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
