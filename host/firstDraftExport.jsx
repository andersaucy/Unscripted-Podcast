/**
 * Unscripted-Podcast — First Draft Export (MP4 + OMF).
 *
 * Exports the active timeline to:
 * 1. MP4 using the bundled Low Res CBR preset.
 * 2. OMF audio (48kHz/16-bit AIFF) in a dedicated audio subfolder.
 *
 * OMF exports go in a subfolder for easier collection and sharing.
 * Both exports use the full timeline duration to avoid partial exports.
 */

var UP_FIRST_DRAFT = {
    mp4PresetFileName: "LowRes-CBR_1.epr",
    destinationConfigFileName: "export-destination.txt"
};

function up_firstDraftExport() {
    var __log = [];
    try {
        if (!app.project || !app.project.path) {
            return up_result(false,
                "No project is currently open or the project has not been saved.",
                __log);
        }

        var sequence = app.project.activeSequence;
        if (!sequence) {
            return up_result(false,
                "No active timeline. Open the timeline you want to export.",
                __log);
        }

        __log.push("Active timeline: " + sequence.name);
        __log.push("Duration: " + up_fd_formatTime(sequence.end) + " (full timeline will be exported)");

        // Get project file for export base name
        var projectFile = new File(app.project.path);

        // Keep production destinations outside source control. A local text
        // file can point at an internal drive or synchronized delivery folder.
        var exportFolder = new Folder(up_fd_getExportFolderPath(__log));
        if (!exportFolder.exists && !exportFolder.create()) {
            return up_result(false,
                "Could not create export folder: " + exportFolder.fsName,
                __log);
        }

        // Generate export filenames based on project name
        var exportBaseName = up_fd_getExportBaseName(projectFile.name);
        __log.push("Export base name: " + exportBaseName);
        __log.push("Export destination: " + exportFolder.fsName);

        // MP4 goes directly in the configured delivery folder.
        var mp4FileName = exportBaseName + ".mp4";
        var mp4Path = exportFolder.fsName + "/" + mp4FileName;
        __log.push("MP4 → " + mp4Path);

        // OMF goes in a subfolder named "{episode} {guest} audio"
        var audioFolderName = up_fd_getAudioFolderName(projectFile.name);
        var audioFolder = new Folder(exportFolder.fsName + "/" + audioFolderName);
        if (!audioFolder.exists && !audioFolder.create()) {
            return up_result(false,
                "Could not create audio subfolder: " + audioFolder.fsName,
                __log);
        }

        var omfFileName = exportBaseName + " audio.omf";
        var omfPath = audioFolder.fsName + "/" + omfFileName;
        __log.push("OMF → " + omfPath);

        // Find MP4 preset in extension's presets folder
        var mp4PresetPath = up_fd_findPreset(UP_FIRST_DRAFT.mp4PresetFileName);
        if (!mp4PresetPath) {
            return up_result(false,
                "Export preset '" + UP_FIRST_DRAFT.mp4PresetFileName +
                "' not found in extension presets folder. Please place the EPR file in the 'presets' folder.",
                __log);
        }
        __log.push("Using preset: " + mp4PresetPath);

        // Export MP4 to AME
        __log.push("Queueing MP4 export to Adobe Media Encoder...");
        app.encoder.launchEncoder();
        var mp4JobID = app.encoder.encodeSequence(
            sequence,
            mp4Path,
            mp4PresetPath,
            app.encoder.ENCODE_ENTIRE,  // Full timeline
            0  // Don't remove on completion
        );

        if (!mp4JobID || mp4JobID === "0") {
            return up_result(false, "Failed to queue MP4 export in AME.", __log);
        }
        __log.push("✓ MP4 queued (Job ID: " + mp4JobID + ")");

        // Export OMF
        __log.push("Exporting OMF audio...");
        var omfResult = up_fd_exportOMF(sequence, omfPath, __log);
        if (!omfResult.ok) {
            __log.push("WARNING: " + omfResult.message);
            __log.push("MANUAL STEP: Export OMF via File > Export > OMF");
            __log.push("  Settings: 48kHz, 16-bit, Separate Audio Files, AIFF, Copy Complete Audio Files");
            __log.push("  Handle Frames: 30, Include Pan: checked");
            __log.push("  Destination: " + omfPath);
            return up_result(true,
                "MP4 queued. OMF export requires manual completion (see log).",
                __log);
        }
        __log.push("✓ OMF exported successfully");

        return up_result(true,
            "First draft exports complete: MP4 queued to AME, OMF exported.",
            __log);
    } catch (e) {
        var where = e.line ? (" (line " + e.line + ")") : "";
        return up_result(false,
            "First Draft Export error: " + e.toString() + where,
            __log);
    }
}

/**
 * Export OMF audio file with settings:
 * - Sample Rate: 48000 Hz
 * - Bits per Sample: 16
 * - Files: Separate Audio
 * - Format: AIFF
 * - Render: Copy Complete Audio Files
 * - Handle Frames: 30
 * - Include Pan: true
 */
function up_fd_exportOMF(sequence, outputPath, logArr) {
    try {
        // Check if OMF export API is available
        if (!app.project.exportOMF) {
            return {
                ok: false,
                message: "OMF export API not available. Please export manually via File > Export > OMF."
            };
        }

        // Configure OMF export settings
        // Settings based on screenshot: 48kHz, 16-bit, Separate Audio, AIFF, Copy Complete Audio Files, Handle Frames: 30, Include Pan
        var omfOptions = {
            sampleRate: 48000,
            bitsPerSample: 16,
            audioFileFormat: 1,  // 0 = WAV, 1 = AIFF
            handleFrames: 30,
            includePan: true,
            separateAudioFiles: true,  // Separate Audio
            copyCompleteAudioFiles: true  // Copy Complete Audio Files
        };

        // Export OMF
        logArr.push("OMF settings: 48kHz, 16-bit, AIFF, Separate Audio, Copy Complete Files, Handle Frames: 30, Include Pan");
        var success = app.project.exportOMF(
            sequence,
            outputPath,
            omfOptions.sampleRate,
            omfOptions.bitsPerSample,
            omfOptions.audioFileFormat,
            omfOptions.handleFrames,
            omfOptions.includePan,
            omfOptions.separateAudioFiles,
            omfOptions.copyCompleteAudioFiles
        );

        if (!success) {
            return {
                ok: false,
                message: "OMF export failed. The export API returned false."
            };
        }

        return { ok: true, message: "OMF exported successfully." };
    } catch (e) {
        return {
            ok: false,
            message: "OMF export error: " + e.toString() +
                     ". You may need to export manually via File > Export > OMF."
        };
    }
}

/**
 * Find an export preset file in the extension's presets folder.
 * Returns the full path to the EPR file for use with app.encoder.encodeSequence.
 */
function up_fd_findPreset(presetFileName) {
    try {
        // Get the extension's installation directory
        // ExtendScript scripts run from the host folder within the extension
        var scriptFile = new File($.fileName);
        var hostFolder = scriptFile.parent;  // host folder
        var extensionFolder = hostFolder.parent;  // extension root
        var presetsFolder = new Folder(extensionFolder.fsName + "/presets");

        if (!presetsFolder.exists) {
            return null;
        }

        var presetFile = new File(presetsFolder.fsName + "/" + presetFileName);
        if (!presetFile.exists) {
            return null;
        }

        return presetFile.fsName;
    } catch (e) {
        return null;
    }
}

/** Resolve a private local destination, with a portable Desktop fallback. */
function up_fd_getExportFolderPath(logArr) {
    var extensionFolder = up_fd_extensionFolder();
    if (extensionFolder) {
        var configFile = new File(
            extensionFolder.fsName + "/config/" +
            UP_FIRST_DRAFT.destinationConfigFileName
        );
        if (configFile.exists && configFile.open("r")) {
            var configuredPath = String(configFile.read() || "")
                .replace(/^\s+|\s+$/g, "");
            configFile.close();
            if (configuredPath) {
                logArr.push("Using private export destination configuration.");
                return configuredPath;
            }
        }
    }
    logArr.push("No private export destination is configured; using Desktop/Podcast Exports.");
    return Folder.desktop.fsName + "/Podcast Exports";
}

function up_fd_extensionFolder() {
    try {
        var scriptFile = new File($.fileName);
        return scriptFile.parent.parent;
    } catch (e) {
        return null;
    }
}

/**
 * Generate export base name from project filename.
 * Format: "{episode} {guest} LowRes V1"
 *
 * Example:
 *   Project: "351 Guest Name.prproj"
 *   Returns: "351 Guest Name LowRes V1"
 */
function up_fd_getExportBaseName(projectFileName) {
    try {
        // Remove .prproj extension
        var baseName = projectFileName.replace(/\.prproj$/i, "");

        // Sanitize and format as: "{episode} {guest} LowRes V1"
        var sanitized = up_fd_sanitizeName(baseName);
        return sanitized + " LowRes V1";
    } catch (e) {
        // Fallback to simple sanitized name if parsing fails
        return up_fd_sanitizeName(projectFileName.replace(/\.prproj$/i, "")) + " LowRes V1";
    }
}

/**
 * Generate audio folder name from project filename.
 * Format: "{episode} {guest} audio"
 *
 * Example:
 *   Project: "351 Guest Name.prproj"
 *   Returns: "351 Guest Name audio"
 */
function up_fd_getAudioFolderName(projectFileName) {
    try {
        // Remove .prproj extension
        var baseName = projectFileName.replace(/\.prproj$/i, "");

        // Sanitize and format as: "{episode} {guest} audio"
        var sanitized = up_fd_sanitizeName(baseName);
        return sanitized + " audio";
    } catch (e) {
        // Fallback to simple sanitized name if parsing fails
        return up_fd_sanitizeName(projectFileName.replace(/\.prproj$/i, "")) + " audio";
    }
}

/**
 * Sanitize filename for safe export.
 */
function up_fd_sanitizeName(name) {
    return String(name).replace(/[\/\\:\*\?"<>\|]/g, "_");
}

/**
 * Format time in seconds to HH:MM:SS.
 */
function up_fd_formatTime(seconds) {
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = Math.floor(seconds % 60);
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
}
