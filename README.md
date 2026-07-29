# Unscripted-Podcast

Adobe Premiere Pro CEP panel for recurring podcast editing and export tasks.

## Baseline features

- Read `PodcastClips.txt` and detect clip ranges.
- Mark a `LowRes` sequence and build clip/export sequences.
- Analyze dialogue loudness with FFmpeg and boost quiet tracks.
- Queue video and audio deliverables in Adobe Media Encoder.

## Local configuration

The export task expects these Adobe Media Encoder presets beneath the current
user's Documents directory:

```text
Adobe/Adobe Media Encoder/26.0/Presets/YouTube-1080.epr
Adobe/Adobe Media Encoder/26.0/Presets/Mp3-Export.epr
```

Exports are written to `Podcast Exports` on the current user's Desktop.
Adjust the configuration block near the top of
`host/renderUnscripted.jsx` if your preset version, names, or output directory
differ.

The loudness workflow requires FFmpeg. The panel checks common Homebrew and
system locations, then falls back to `ffmpeg` on `PATH`.

## Development

This repository contains an unsigned CEP development extension. Load the
repository folder through a CEP-compatible Premiere development setup or link it
into the appropriate Adobe CEP `extensions` directory.

The `.debug` file exposes the local CEP debugging port only; it contains no
credentials.
