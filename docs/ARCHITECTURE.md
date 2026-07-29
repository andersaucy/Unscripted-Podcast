# Architecture

## Overview

Unscripted-Podcast is an Adobe CEP panel with three cooperating layers:

1. A browser-based panel UI.
2. ExtendScript modules running inside Premiere Pro.
3. A Node.js process layer used only for capabilities missing from Premiere's
   scripting API.

This division keeps project mutations in the host application while allowing
the panel to use FFmpeg for standards-based loudness measurement.

## Runtime boundaries

### CEP client

`client/index.html`, `client/css/style.css`, and `client/js/main.js` render the
panel and coordinate tasks.

Responsibilities:

- Collect user configuration.
- Maintain busy, success, and failure states.
- Call host functions through `CSInterface.evalScript`.
- Parse structured host results.
- Launch FFmpeg and interpret `loudnorm` output.
- Present a timestamped diagnostic log.

### ExtendScript host

`host/index.jsx` is the manifest entry point. It supplies shared JSON helpers
and includes the task modules loaded into Premiere's ExtendScript runtime.

| Module | Responsibility |
| --- | --- |
| `episodeSetup.jsx` | Infer the episode media folder, mirror disk hierarchy as bins, skip duplicates, import footage, and apply recorder-specific source audio mappings. |
| `markClips.jsx` | Parse timestamps, create markers, clone templates, assemble clip sequences, and add transitions. |
| `loudness.jsx` | Enumerate audio clips and apply calculated gain through clip Volume components. |
| `renderUnscripted.jsx` | Discover export sequences and queue configured Adobe Media Encoder jobs. |

Host entry points use the `up_` prefix and return a consistent payload:

```json
{
  "ok": true,
  "message": "Human-readable summary",
  "log": "Detailed diagnostic output"
}
```

ExtendScript lacks a native JSON serializer in the targeted runtime, so
`host/index.jsx` constructs and escapes these responses explicitly.

### External analysis

Premiere's scripting APIs can modify clip gain but cannot measure integrated
loudness. The CEP client therefore invokes FFmpeg with the EBU R128 `loudnorm`
filter.

```mermaid
sequenceDiagram
    participant Editor
    participant Panel
    participant Premiere
    participant FFmpeg

    Editor->>Panel: Normalize Dialogue
    Panel->>Premiere: up_collectDialogueClips()
    Premiere-->>Panel: Media paths and source ranges
    loop Each analyzable clip
        Panel->>FFmpeg: Analyze selected source range
        FFmpeg-->>Panel: Integrated LUFS
    end
    Panel->>Panel: Duration-weighted track average
    Panel->>Premiere: up_applyTrackGain(track, dB)
    Premiere-->>Panel: Applied/skipped summary
    Panel-->>Editor: Final report
```

## Timestamp workflow

```mermaid
flowchart TD
    File["PodcastClips.txt"] --> Parse["Parse TITLE / FROM / TO"]
    Parse --> Validate{"Valid positive ranges?"}
    Validate -- No --> Warn["Log and skip invalid range"]
    Validate -- Yes --> Mark["Mark LowRes sequence"]
    Mark --> Clone["Clone full episode and CLIP templates"]
    Clone --> Assemble["Insert source ranges"]
    Assemble --> Transitions["Apply video/audio transitions"]
    Transitions --> ExportBin["Move results to ExportBin"]
```

## Episode setup workflow

```mermaid
flowchart TD
    Project["Saved .prproj"] --> Projects["Find ancestor containing Projects"]
    Projects --> Footage["Resolve sibling Assets/Footage"]
    Footage --> Scan["Recursively scan files and folders"]
    Scan --> Existing["Collect normalized project media paths"]
    Existing --> Import{"Already imported?"}
    Import -- Yes --> Skip["Skip duplicate"]
    Import -- No --> Mirror["Create matching Footage sub-bin"]
    Mirror --> Add["Import file"]
    Add --> Type{"Media type"}
    Type -- MXF --> MXF["Mono · embedded channel 1"]
    Type -- WAV --> WAV["3 mono clips · embedded 5, 6, 7"]
    Type -- Other --> Done["Keep importer defaults"]
```

Premiere's ExtendScript API does not support creating a new multicamera source
sequence. The panel therefore prepares a deterministic `Footage` hierarchy and
leaves the supported **Clip → Create Multi-Camera Source Sequence** operation
to the editor.

## Design constraints

- CEP and ExtendScript are legacy Adobe technologies, but they expose host
  capabilities that were required when this tool was built.
- QE DOM is used only for transitions. QE is undocumented, so calls are isolated
  in the clip-building task.
- FFmpeg is an external dependency and is detected at runtime.
- Adobe Media Encoder preset paths and output destinations are configuration,
  not secrets, and use portable defaults in source control.
- Source audio-channel interpretation relies on Premiere's legacy
  `ProjectItem` mapping API and is isolated behind capability checks.

## Failure handling

Tasks validate their prerequisites before modifying the project:

- Open and saved Premiere project.
- Expected source/template sequences.
- Parseable timestamp file.
- Valid timestamp ranges.
- Existing export bin and Media Encoder presets.
- Available FFmpeg binary and analyzable audio media.

The panel disables conflicting actions while a task runs and surfaces detailed
diagnostics without relying on modal alerts.

## Testing strategy

Repository automation performs fast static validation:

- JavaScript syntax.
- ExtendScript module syntax where compatible with Node's parser.
- Manifest XML well-formedness.
- Required entry-point presence.

Integration validation remains manual because Premiere's DOM, QE calls, media
decoding, and Media Encoder queueing require an installed Adobe host and sample
project.
