# Export Presets

This folder contains Adobe Media Encoder export presets (`.epr` files) used by the Unscripted-Podcast extension.

## Required Presets

Place the following preset files in this folder:

- **LowRes-CBR_1.epr** - Low resolution CBR preset for first draft MP4 exports
  - Used by the "First Draft Export" button
  - Exports to `Desktop/Podcast Exports`

## How to Use

The extension automatically looks for these preset files in this folder. Make sure the EPR files are named exactly as shown above.

If a preset is missing, the export feature will display an error message asking you to place the file here.
