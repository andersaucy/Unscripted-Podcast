# Technical Notes

This document summarizes the implementation decisions demonstrated by the
portfolio project. It is not an installation or contributor guide.

## Technology boundaries

Unscripted-Podcast coordinates four runtime surfaces:

| Surface | Role |
| --- | --- |
| CEP client | Panel interface, orchestration, progress, and diagnostic output |
| ExtendScript host | Premiere project inspection and mutation |
| macOS Accessibility helpers | Narrow native-dialog operations unavailable through ExtendScript |
| Local Python engine | Independent frame analysis and versioned color recommendations |

Keeping these boundaries explicit prevents UI concerns, Premiere mutations, and
image-analysis heuristics from becoming one tightly coupled script.

## Repository structure

```text
.
├── CSXS/manifest.xml
├── client/
│   ├── index.html
│   ├── css/style.css
│   ├── js/
│   │   ├── main.js
│   │   ├── auto-color/
│   │   └── CSInterface.js
│   └── scripts/
│       ├── applyAudioChannelPreset.applescript
│       ├── createEpisodeMulticam.applescript
│       └── prepareTalkTracks.applescript
├── host/
│   ├── index.jsx
│   ├── episodeIdentity.jsx
│   ├── episodeSetup.jsx
│   ├── multicamSetup.jsx
│   ├── colorSetup.jsx
│   ├── intelligentColor.jsx
│   ├── collectEpisode.jsx
│   ├── markClips.jsx
│   └── renderUnscripted.jsx
├── python/
├── tests/
├── docs/
└── scripts/validate.sh
```

Detailed module responsibilities and runtime data flows are documented in
[Architecture](ARCHITECTURE.md).

## Engineering decisions

- **Modular host tasks:** Premiere actions live in focused `host/*.jsx` modules.
- **Structured responses:** host entry points return serialized status, message,
  and diagnostic log data instead of blocking alerts.
- **Project-derived state:** completion badges inspect current clips, media,
  mappings, sequences, and markers rather than remembering button clicks.
- **Idempotent operations:** imports, effects, sequences, labels, and collection
  destinations are checked before changes are applied.
- **Isolated unsupported surfaces:** undocumented QE and macOS Accessibility are
  constrained to small helpers with verification and manual fallbacks.
- **Independent analysis contract:** camera-color analysis returns versioned JSON
  and does not contain Premiere-specific logic.
- **Privacy-first publication:** production media, credentials, generated frames,
  virtual environments, and user-specific filesystem paths are excluded.

## Platform constraints

- Premiere does not expose multicam-source creation through its supported
  ExtendScript DOM.
- Premiere 26.x can expose source-audio mapping properties as read-only.
- Lumetri's native Auto button is not script-exposed.
- QE is undocumented and can return stale wrappers after sequence changes.
- Accessibility operations are macOS-specific and depend on native dialog state.
- Full integration behavior requires a running Adobe host and representative media.

The implementation treats those constraints as explicit boundaries rather than
hiding them behind false success states.

## Validation strategy

Repository automation checks:

- panel JavaScript syntax;
- compatible ExtendScript syntax;
- Python compilation and deterministic analysis behavior;
- episode identity and status reporting;
- multicam grouping, source ordering, and sync-proxy selection;
- Lumetri coverage and intelligent-color application;
- CEP manifest XML and required entry points.

Premiere DOM, native dialogs, media decoding, QE, and Adobe Media Encoder require
manual integration validation in the production environment.

## Publication scope

This codebase is presented to demonstrate product thinking, automation design,
technical problem solving, and testing discipline. The publication does not
grant permission to install, copy, adapt, redistribute, or build derivative
work from the source.

[Back to README](../README.md) · [Architecture](ARCHITECTURE.md)
