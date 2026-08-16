# Episode Setup

Episode Setup prepares a recurring podcast project without requiring manual
Finder/Explorer imports, repetitive source-audio changes, or hand-built multicam
sequences.

## Project conventions

The active project must:

- be saved directly inside `00_Projects`;
- contain `PODCAST###` or `POD###` in its filename;
- have a sibling folder at `01_Assets/Footage`;
- contain `_CLIP INTRO` with one AE MOGRT on V2 exposing a numeric control named
  `Episode Number`;
- contain a legacy `LowRes` sequence on first setup, or the previously renamed
  `### LowRes_v1` sequence on subsequent runs.

Example:

```text
Episode 123/
├── 00_Projects/
│   ├── PODCAST123-GUEST-TOPIC.prproj
│   └── PodcastClips.txt
└── 01_Assets/
    └── Footage/
        ├── PODCAST123-GUEST-TOPIC-CAM1.mxf
        ├── PODCAST123-GUEST-TOPIC-CAM2.mxf
        ├── PODCAST123-GUEST-TOPIC-AUDIO-P1.wav
        ├── PODCAST123-GUEST-TOPIC-AUDIO-P2.wav
        ├── PODCAST123-GUEST-TOPIC-AUDIO-FOR-SYNC.mp3
        └── PODCAST123-GUEST-TOPIC-ZENCASTR.mov
```

## Import and configure footage

The first Episode Setup action runs three stages in order.

### 1. Episode identity

- Extracts the numeric episode identifier from the project filename.
- Writes that number to the `Episode Number` control on the single V2 MOGRT in
  `_CLIP INTRO`.
- Renames `LowRes` to `### LowRes_v1`.
- Rejects missing or ambiguous MOGRT controls instead of relying on Effect
  Controls UI automation.

### 2. Footage import

- Resolves `01_Assets/Footage` from the saved project path.
- Recursively imports files and mirrors disk folders beneath the Premiere
  `Footage` bin.
- Compares normalized media paths and skips already imported files.
- Imports each file separately so an unsupported sidecar cannot block the rest
  of the folder.
- Applies Teal labels to video and Green labels to audio.

### 3. Source-audio configuration

Premiere 26.x exposes parts of its legacy audio-mapping API as read-only. On
macOS, the panel therefore batch-selects matching Project items and chooses two
saved presets through Premiere's native **Modify Clip → Audio Channels** dialog.

| Preset | Expected mapping |
| --- | --- |
| `Unscripted-MXF1` | Mono, one audio clip, source channel 1 |
| `Unscripted-WAV3` | Mono, three audio clips, source channels 5, 6, and 7 |

The helper uses semantic Accessibility controls rather than fixed screen
coordinates. The first run may request permission for Premiere Pro to control
System Events.

Project-derived badges report identity, imported footage, and configured audio.
They are not simple button-click history.

## Create Episode Multicams

The combined action:

1. Discovers INTRO and TALK media beneath the `Footage` bin.
2. Builds the flexible TALK stem from `PODCAST###-...-CAM#` filenames.
3. Orders CAM1 first as the native synchronization reference.
4. Creates `INTRO-###` and `TALK-###` with audio track channel 1 synchronization.
5. Verifies exact sequence creation and opens both Timeline tabs.
6. Ensures Lumetri Color exists on every video TrackItem.
7. Runs Intelligent Color on every camera group in INTRO, then TALK.
8. Applies the recommendations and records persistent completion markers.

Premiere does not expose multicam-source creation through its supported
ExtendScript DOM. The panel handles deterministic discovery and selection, then
an isolated macOS helper configures Premiere's native multicam dialog. It changes
only the sequence name and audio channel; the remaining dialog defaults are
preserved.

## TALK sync proxy and Zencastr

Zencastr MOV audio can intermittently fail Premiere's synchronization analysis.
The workflow therefore prefers a dedicated MP3 proxy.

Recognized sync names include:

- `AUDIO FOR SYNC`
- `FORSYNC` or `FOR-SYNC`
- `4SYNC` or `4-SYNC`
- `SYNC AUDIO`, `SYNC REFERENCE`, or `SYNC PROXY`
- `ZENCASTR`

When those keywords are absent, one unique MP3 matching the episode number or
TALK stem is accepted. Multiple possible MP3s are treated as ambiguous and stop
the operation.

The proxy participates in native multicam synchronization while the Zencastr MOV
stays out of that analysis pass. Finish TALK Layout can preserve the MP3's exact
synchronized start in an `Unscripted Zencastr Sync` marker and use that time for
the MOV.

## Finish TALK Layout

The intended final arrangement is:

| Track | Content |
| --- | --- |
| V1 | CAM1 |
| V2 | Zencastr MOV |
| V3–V5 | CAM2–CAM4 |
| A1–A3 | Recorder WAV mono channels; P2 follows P1 |
| A4 | Zencastr MOV audio |

Recorder WAV TrackItems are preserved intact. The workflow recognizes the
editor-arranged P1/P2 layout, records the P2 start at P1's exact endpoint, and
then places Zencastr on V2/A4.

Core multicam creation remains valid even when optional TALK finishing needs
manual intervention.

## Collect and save

**Collect & Save Episode**:

- saves the active project;
- derives the episode root from `00_Projects`;
- invokes Premiere Project Manager;
- creates a self-contained `Collected - Project Name` copy;
- avoids overwriting earlier collections;
- leaves the original active project open.

## Failure handling

Setup stops with actionable diagnostics for missing folders, unsaved projects,
offline media, ambiguous stems, multiple sync proxies, missing CAM1, or duplicate
sequence names. The activity log can expand to the full panel for long runs.

[Back to README](../README.md) · [Architecture](ARCHITECTURE.md)
