# Editing and Export

The Editing & Export section converts timestamp notes into Premiere sequences,
queues deliverables, and packages finished projects.

## PodcastClips.txt

Mark Clips reads a local text file named `PodcastClips.txt` beside the saved
Premiere project.

Example:

```text
TITLE= Episode 123

TITLE= The opening story
FROM= 1:24
TO= 3:08

TITLE= A useful takeaway
FROM= 12:40
TO= 14:02
```

Each segment requires a title, positive `FROM` time, and later `TO` time. Invalid,
inverted, and zero-length ranges are reported before project mutation.

## Mark Clips

The action:

1. Finds `PodcastClips.txt` beside the project or prompts for another local TXT.
2. Parses valid `TITLE` / `FROM` / `TO` ranges.
3. Detects the clip count automatically.
4. Adds segment markers to `### LowRes_v1`.
5. Clones the full-episode and `CLIP` template sequences beneath `ExportBin`.
6. Inserts each source range.
7. Applies Cross Dissolve and Constant Power transitions.

The expected project templates are:

- `### LowRes_v1` (or `LowRes` before Episode Setup renames it);
- `CLIP`;
- an `ExportBin` destination.

## Adobe Media Encoder delivery

The render task recursively discovers sequences beneath `ExportBin`, sanitizes
their names for output files, and queues H.264 video plus MP3 audio deliverables.

Default preset discovery expects:

```text
Documents/
└── Adobe/Adobe Media Encoder/26.0/Presets/
    ├── YouTube-1080.epr
    └── Mp3-Export.epr
```

The default destination is `Podcast Exports` on the current user's Desktop.
Preset names, versions, destinations, and optional batch start are configured
near the top of `host/renderUnscripted.jsx`.

## Collect & Save Episode

The collection action sits beside editing and delivery because it packages a
finished or transferable episode. It saves the project and asks Premiere Project
Manager to create a self-contained copy without changing the original project.

## Operational boundaries

- Premiere and Adobe Media Encoder must be installed and available.
- Preset files are configuration, not bundled assets.
- AME queueing can be automated; the panel does not silently overwrite exports.
- Final editorial review remains manual.

[Back to README](../README.md) · [Episode Setup](EPISODE_SETUP.md)
