/**
 * Unscripted-Podcast — episode import and source-audio setup.
 *
 * Locates 01_Assets/Footage beside 00_Projects, mirrors its directory
 * hierarchy beneath a project bin named "Footage", skips media paths already
 * present anywhere in the project, and applies the podcast's standard source
 * audio mappings.
 *
 * Premiere's ExtendScript API cannot create a new multicamera source sequence.
 * This module therefore prepares and organizes the source clips, but leaves the
 * final "Create Multi-Camera Source Sequence" command to the editor.
 */

var UP_EPISODE_SETUP = {
    footageBinName: "Footage",
    projectsFolderName: "00_Projects",
    assetsFolderName: "01_Assets",
    footageFolderName: "Footage",
    audioProfiles: {
        mxf: {
            label: "MXF",
            presetName: "Unscripted-MXF1",
            channelType: 0,       // AUDIOCHANNELTYPE_Mono
            audioClipCount: 1,
            sourceChannels: [0]   // Clip 1 <- embedded channel 1
        },
        wav: {
            label: "WAV",
            presetName: "Unscripted-WAV3",
            channelType: 0,       // AUDIOCHANNELTYPE_Mono
            audioClipCount: 3,
            sourceChannels: [4, 5, 6] // Clips 1-3 <- embedded channels 5-7
        }
    }
};

/**
 * Import 01_Assets/Footage and immediately configure imported MXF/WAV media.
 */
function up_importFootage() {
    var __log = [];
    try {
        var context = up_getFootageContext(__log);
        if (!context.ok) {
            return up_result(false, context.message, __log);
        }

        var existingPaths = {};
        up_collectProjectMediaPaths(app.project.rootItem, existingPaths);

        var rootBin = up_getOrCreateChildBin(
            app.project.rootItem,
            UP_EPISODE_SETUP.footageBinName
        );
        if (!rootBin) {
            return up_result(false, 'Could not create or find the "Footage" project bin.', __log);
        }

        var stats = {
            discovered: 0,
            imported: 0,
            skipped: 0,
            failed: 0
        };
        var importedPaths = {};

        up_importFolderTree(
            context.footageFolder,
            rootBin,
            existingPaths,
            importedPaths,
            stats,
            __log
        );

        if (stats.discovered === 0) {
            return up_result(false,
                "01_Assets/Footage contains no files to import.",
                __log);
        }

        var audio = up_configureAudioForPaths(importedPaths, __log);
        __log.push("Import summary: " + stats.imported + " imported, " +
            stats.skipped + " already present, " + stats.failed + " failed.");
        __log.push("Audio summary: " + audio.configured + " configured, " +
            audio.failed + " failed, " + audio.unavailable + " require manual setup.");

        var ok = (stats.failed === 0 && audio.failed === 0 &&
            audio.unavailable === 0);
        var message = "Footage setup complete: " + stats.imported + " imported, " +
            stats.skipped + " skipped; " + audio.configured + " audio mapping(s) applied.";
        if (!ok) {
            message += " Review the log for warnings.";
        }
        if (audio.unavailable > 0) {
            message = "Footage imported, but Premiere blocked scripted audio mapping for " +
                audio.unavailable + " clip(s). Use Modify > Audio Channels.";
        }
        return up_result(ok, message, __log);

    } catch (e) {
        var where = e.line ? (" (line " + e.line + ")") : "";
        return up_result(false, "Import Footage error: " + e.toString() + where, __log);
    }
}

/**
 * Reapply the standard audio mapping to every MXF/WAV already in the Footage
 * bin. Useful if import succeeded but Premiere rejected or delayed a mapping.
 */
function up_configureFootageAudio() {
    var __log = [];
    try {
        if (!app.project) {
            return up_result(false, "No open Premiere project.", __log);
        }
        var footageBin = up_findChildBin(
            app.project.rootItem,
            UP_EPISODE_SETUP.footageBinName
        );
        if (!footageBin) {
            return up_result(false,
                'No project bin named "' + UP_EPISODE_SETUP.footageBinName + '" found.',
                __log);
        }

        var paths = {};
        up_collectProjectMediaPaths(footageBin, paths);
        var audio = up_configureAudioForPaths(paths, __log);
        var ok = (audio.failed === 0 && audio.unavailable === 0);
        var message = "Audio setup: " + audio.configured + " configured, " +
            audio.failed + " failed, " + audio.unavailable + " require manual setup.";
        if (audio.unavailable > 0) {
            message = "Premiere blocked scripted audio mapping for " +
                audio.unavailable + " clip(s). Use Modify > Audio Channels.";
        }
        return up_result(ok, message, __log);
    } catch (e) {
        var where = e.line ? (" (line " + e.line + ")") : "";
        return up_result(false, "Configure Audio error: " + e.toString() + where, __log);
    }
}

/**
 * Select every matching source clip in the Footage bin and open Premiere's
 * native Modify Clip > Audio Channels workflow. On macOS the panel calls this
 * function first, then starts an accessibility helper that focuses the active
 * Project panel, opens the dialog, chooses the named .acpreset, and confirms it.
 *
 * This path intentionally uses Premiere's own preset UI. It works around the
 * Premiere 26.x regression that made AudioChannelMapping format/count fields
 * read-only to ExtendScript.
 */
function up_prepareFootageAudioPreset(mediaType) {
    var __log = [];
    try {
        if (!app.project) {
            return up_result(false, "No open Premiere project.", __log);
        }

        var normalizedType = String(mediaType || "").toLowerCase();
        var profile = UP_EPISODE_SETUP.audioProfiles[normalizedType];
        if (!profile) {
            return up_result(false, "Unknown footage audio type: " + mediaType, __log);
        }

        var footageBin = up_findChildBin(
            app.project.rootItem,
            UP_EPISODE_SETUP.footageBinName
        );
        if (!footageBin) {
            return up_result(false,
                'No project bin named "' + UP_EPISODE_SETUP.footageBinName + '" found.',
                __log);
        }

        var items = [];
        up_visitProjectItems(footageBin, function (item) {
            var mediaPath = up_getProjectItemMediaPath(item);
            if (!mediaPath) { return; }
            var ext = up_fileExtension(mediaPath);
            if (normalizedType === "mxf" && ext === "mxf") {
                items.push(item);
            } else if (normalizedType === "wav" && (ext === "wav" || ext === "wave")) {
                items.push(item);
            }
        });

        if (items.length === 0) {
            return up_result(true,
                "No " + profile.label + " files found in the Footage bin; skipped " +
                    profile.presetName + ".",
                __log);
        }

        if (typeof app.getProjectViewIDs !== "function" ||
                typeof app.setProjectViewSelection !== "function") {
            return up_result(false,
                "This Premiere version cannot batch-select Project-panel items.",
                __log);
        }

        var viewID = up_getActiveProjectViewID();
        if (viewID === null || viewID === undefined) {
            return up_result(false,
                "Could not find the active project's Project-panel view.",
                __log);
        }

        app.setProjectViewSelection(items, viewID);
        __log.push("Selected " + items.length + " " + profile.label +
            " file(s) in the Footage bin.");
        __log.push("Applying Audio Channels preset: " + profile.presetName + ".");

        return up_result(true,
            "Prepared " + items.length + " " + profile.label +
                " file(s) for " + profile.presetName + ".",
            __log);
    } catch (e) {
        var where = e.line ? (" (line " + e.line + ")") : "";
        return up_result(false,
            "Audio preset dialog error: " + e.toString() + where,
            __log);
    }
}

function up_getActiveProjectViewID() {
    var viewIDs = app.getProjectViewIDs();
    if (!viewIDs || viewIDs.length === 0) { return null; }

    var activePath = "";
    try { activePath = up_normalizeMediaPath(app.project.path); } catch (e) {}

    for (var i = 0; i < viewIDs.length; i++) {
        try {
            var project = app.getProjectFromViewID(viewIDs[i]);
            if (project && up_normalizeMediaPath(project.path) === activePath) {
                return viewIDs[i];
            }
        } catch (viewError) {}
    }

    // A normal standalone Premiere session has one Project view. Keep that
    // common case working even if a host build does not expose project.path on
    // the object returned by getProjectFromViewID().
    return viewIDs.length === 1 ? viewIDs[0] : null;
}

function up_getEpisodeContext(log) {
    if (!app.project) {
        return { ok: false, message: "No open Premiere project." };
    }
    if (!app.project.path) {
        return {
            ok: false,
            message: "Project has not been saved yet, so the episode folder cannot be inferred."
        };
    }

    var projectFile = new File(app.project.path);
    var projectsFolder = projectFile.parent;
    if (!projectsFolder || String(projectsFolder.name).toLowerCase() !==
            UP_EPISODE_SETUP.projectsFolderName.toLowerCase()) {
        return {
            ok: false,
            message: 'The active project must be directly inside a folder named "' +
                UP_EPISODE_SETUP.projectsFolderName + '".'
        };
    }

    log.push("Project: " + projectFile.fsName);
    log.push("Projects folder: " + projectsFolder.fsName);

    return {
        ok: true,
        projectFile: projectFile,
        projectsFolder: projectsFolder,
        episodeFolder: projectsFolder.parent,
        assetsFolder: new Folder(projectsFolder.parent.fsName + "/" +
            UP_EPISODE_SETUP.assetsFolderName)
    };
}

function up_getFootageContext(log) {
    var context = up_getEpisodeContext(log);
    if (!context.ok) {
        return context;
    }

    var footageFolder = new Folder(context.assetsFolder.fsName + "/" +
        UP_EPISODE_SETUP.footageFolderName);
    log.push("Footage folder: " + footageFolder.fsName);

    if (!footageFolder.exists) {
        return {
            ok: false,
            message: "01_Assets/Footage was not found beside 00_Projects."
        };
    }
    return {
        ok: true,
        projectFile: context.projectFile,
        projectsFolder: context.projectsFolder,
        episodeFolder: context.episodeFolder,
        assetsFolder: context.assetsFolder,
        footageFolder: footageFolder
    };
}

function up_importFolderTree(folder, targetBin, existingPaths, importedPaths, stats, log) {
    var entries = folder.getFiles();
    var files = [];
    var folders = [];
    var i;

    for (i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (entry instanceof Folder) {
            if (entry.name.charAt(0) !== ".") { folders.push(entry); }
        } else if (entry instanceof File && entry.name.charAt(0) !== ".") {
            files.push(entry);
        }
    }

    var toImport = [];
    for (i = 0; i < files.length; i++) {
        stats.discovered++;
        var key = up_normalizeMediaPath(files[i].fsName);
        if (existingPaths[key]) {
            stats.skipped++;
            log.push("Skipping existing media: " + files[i].fsName);
        } else {
            toImport.push(files[i].fsName);
        }
    }

    for (i = 0; i < toImport.length; i++) {
        var imported = false;
        try {
            imported = app.project.importFiles([toImport[i]], true, targetBin, false);
        } catch (importError) {
            log.push("WARNING: import failed for " + toImport[i] + ": " +
                importError.toString());
        }
        if (imported) {
            var importedKey = up_normalizeMediaPath(toImport[i]);
            existingPaths[importedKey] = true;
            importedPaths[importedKey] = true;
            stats.imported++;
            log.push("Imported: " + toImport[i]);
        } else {
            stats.failed++;
            log.push("WARNING: Premiere did not import: " + toImport[i]);
        }
    }

    for (i = 0; i < folders.length; i++) {
        var childBin = up_getOrCreateChildBin(targetBin, folders[i].name);
        if (!childBin) {
            stats.failed++;
            log.push("WARNING: could not create bin for folder: " + folders[i].fsName);
            continue;
        }
        up_importFolderTree(
            folders[i],
            childBin,
            existingPaths,
            importedPaths,
            stats,
            log
        );
    }
}

function up_configureAudioForPaths(paths, log) {
    var stats = { configured: 0, failed: 0, unavailable: 0 };
    var unavailableMessage = "";
    up_visitProjectItems(app.project.rootItem, function (item) {
        var mediaPath = up_getProjectItemMediaPath(item);
        if (!mediaPath || !paths[up_normalizeMediaPath(mediaPath)]) { return; }

        var ext = up_fileExtension(mediaPath);
        var profile = null;
        if (ext === "mxf") {
            profile = UP_EPISODE_SETUP.audioProfiles.mxf;
        } else if (ext === "wav" || ext === "wave") {
            profile = UP_EPISODE_SETUP.audioProfiles.wav;
        } else {
            return;
        }

        var outcome = up_applyAudioChannelMapping(item, profile);
        if (outcome.ok) {
            stats.configured++;
            log.push("Audio mapped " + item.name + " -> " +
                profile.audioClipCount + " mono clip(s), source channel(s) " +
                up_oneBasedChannels(profile.sourceChannels) + ".");
        } else if (outcome.unavailable) {
            stats.unavailable++;
            if (!unavailableMessage) { unavailableMessage = outcome.message; }
        } else {
            stats.failed++;
            log.push("WARNING: " + item.name + ": " + outcome.message);
        }
    });
    if (unavailableMessage) {
        log.push("WARNING: " + unavailableMessage);
        log.push("Manual MXF setup: Mono, 1 audio clip, Clip 1 -> source channel 1.");
        log.push("Manual WAV setup: Mono, 3 audio clips, Clips 1-3 -> source channels 5-7.");
    }
    return stats;
}

function up_applyAudioChannelMapping(item, profile) {
    try {
        if (!profile || !profile.sourceChannels ||
                profile.audioClipCount !== profile.sourceChannels.length) {
            return {
                ok: false,
                unavailable: false,
                message: "invalid audio profile configuration."
            };
        }
        if (!item || item.getAudioChannelMapping === undefined ||
                typeof item.setAudioChannelMapping !== "function") {
            return {
                ok: false,
                unavailable: true,
                message: "audio-channel mapping API is unavailable in this Premiere version."
            };
        }

        var mapping = item.getAudioChannelMapping;
        if (!mapping || typeof mapping.setMappingForChannel !== "function") {
            return {
                ok: false,
                unavailable: true,
                message: "Premiere did not expose a writable audio-channel mapping."
            };
        }

        mapping.audioChannelsType = profile.channelType;
        mapping.audioClipsNumber = profile.audioClipCount;
        for (var i = 0; i < profile.sourceChannels.length; i++) {
            var mapped = mapping.setMappingForChannel(i, profile.sourceChannels[i]);
            if (mapped === false) {
                return {
                    ok: false,
                    unavailable: false,
                    message: "source channel " + (profile.sourceChannels[i] + 1) +
                        " is not supported by this media."
                };
            }
        }

        var applied = item.setAudioChannelMapping(mapping);
        if (applied === false) {
            return {
                ok: false,
                unavailable: false,
                message: "Premiere rejected the audio-channel mapping."
            };
        }

        var verified = item.getAudioChannelMapping;
        if (!verified || Number(verified.audioChannelsType) !== profile.channelType ||
                Number(verified.audioClipsNumber) !== profile.audioClipCount) {
            return {
                ok: false,
                unavailable: true,
                message: up_audioMappingUnavailableMessage()
            };
        }
        return { ok: true, unavailable: false, message: "" };
    } catch (e) {
        var detail = e.toString();
        if (detail.indexOf("Cannot set property audioChannelsType") !== -1 ||
                detail.indexOf("Cannot set property audioClipsNumber") !== -1) {
            return {
                ok: false,
                unavailable: true,
                message: up_audioMappingUnavailableMessage()
            };
        }
        return {
            ok: false,
            unavailable: false,
            message: "audio mapping failed: " + detail
        };
    }
}

function up_audioMappingUnavailableMessage() {
    var version = "this Premiere build";
    try {
        if (app && app.version) { version = "Premiere " + app.version; }
    } catch (e) {}
    return version + " exposes audio clip format/count as read-only; " +
        "automatic Modify > Audio Channels is unavailable.";
}

function up_visitProjectItems(item, visitor) {
    if (!item) { return; }
    visitor(item);
    if (!item.children) { return; }
    for (var i = 0; i < item.children.numItems; i++) {
        up_visitProjectItems(item.children[i], visitor);
    }
}

function up_collectProjectMediaPaths(root, paths) {
    up_visitProjectItems(root, function (item) {
        var mediaPath = up_getProjectItemMediaPath(item);
        if (mediaPath) {
            paths[up_normalizeMediaPath(mediaPath)] = true;
        }
    });
}

function up_getProjectItemMediaPath(item) {
    try {
        if (item && typeof item.getMediaPath === "function") {
            return item.getMediaPath() || "";
        }
    } catch (e) {}
    return "";
}

function up_findChildBin(parent, name) {
    if (!parent || !parent.children) { return null; }
    for (var i = 0; i < parent.children.numItems; i++) {
        var child = parent.children[i];
        if (child.type === ProjectItemType.BIN && child.name === name) {
            return child;
        }
    }
    return null;
}

function up_getOrCreateChildBin(parent, name) {
    var found = up_findChildBin(parent, name);
    return found || parent.createBin(name);
}

function up_normalizeMediaPath(path) {
    if (!path) { return ""; }
    var normalized = "";
    try { normalized = new File(path).fsName; }
    catch (e) { normalized = String(path); }
    normalized = normalized.replace(/\\/g, "/");
    if ($.os && String($.os).toLowerCase().indexOf("windows") !== -1) {
        normalized = normalized.toLowerCase();
    }
    return normalized;
}

function up_fileExtension(path) {
    var name = String(path).replace(/^.*[\/\\]/, "");
    var dot = name.lastIndexOf(".");
    return dot === -1 ? "" : name.substring(dot + 1).toLowerCase();
}

function up_oneBasedChannels(channels) {
    var display = [];
    for (var i = 0; i < channels.length; i++) {
        display.push(channels[i] + 1);
    }
    return display.join(", ");
}
