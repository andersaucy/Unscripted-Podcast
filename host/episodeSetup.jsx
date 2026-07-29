/**
 * Unscripted-Podcast — episode import and source-audio setup.
 *
 * Locates Assets/Footage relative to the saved project, mirrors its directory
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
    projectsFolderToken: "projects",
    mxfSourceChannels: [0],       // embedded channel 1
    wavSourceChannels: [4, 5, 6]  // embedded channels 5, 6, 7
};

/**
 * Import Assets/Footage and immediately configure imported MXF/WAV media.
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
                "Assets/Footage contains no files to import.",
                __log);
        }

        var audio = up_configureAudioForPaths(importedPaths, __log);
        __log.push("Import summary: " + stats.imported + " imported, " +
            stats.skipped + " already present, " + stats.failed + " failed.");
        __log.push("Audio summary: " + audio.configured + " configured, " +
            audio.failed + " failed, " + audio.unavailable + " unsupported.");

        var ok = (stats.failed === 0 && audio.failed === 0 &&
            audio.unavailable === 0);
        var message = "Footage setup complete: " + stats.imported + " imported, " +
            stats.skipped + " skipped; " + audio.configured + " audio mapping(s) applied.";
        if (!ok) {
            message += " Review the log for warnings.";
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
        return up_result(ok,
            "Audio setup: " + audio.configured + " configured, " +
                audio.failed + " failed, " + audio.unavailable + " unsupported.",
            __log);
    } catch (e) {
        var where = e.line ? (" (line " + e.line + ")") : "";
        return up_result(false, "Configure Audio error: " + e.toString() + where, __log);
    }
}

function up_getFootageContext(log) {
    if (!app.project) {
        return { ok: false, message: "No open Premiere project." };
    }
    if (!app.project.path) {
        return {
            ok: false,
            message: "Project has not been saved yet, so Assets/Footage cannot be inferred."
        };
    }

    var projectFile = new File(app.project.path);
    var cursor = projectFile.parent;
    var projectsFolder = null;
    while (cursor && cursor.parent && cursor.fsName !== cursor.parent.fsName) {
        if (String(cursor.name).toLowerCase().indexOf(
            UP_EPISODE_SETUP.projectsFolderToken
        ) !== -1) {
            projectsFolder = cursor;
            break;
        }
        cursor = cursor.parent;
    }

    if (!projectsFolder) {
        return {
            ok: false,
            message: 'Could not find an ancestor folder whose name contains "Projects".'
        };
    }

    var footageFolder = new Folder(
        projectsFolder.parent.fsName + "/Assets/Footage"
    );
    log.push("Project: " + projectFile.fsName);
    log.push("Projects folder: " + projectsFolder.fsName);
    log.push("Footage folder: " + footageFolder.fsName);

    if (!footageFolder.exists) {
        return {
            ok: false,
            message: "Assets/Footage was not found beside the Projects folder."
        };
    }
    return {
        ok: true,
        projectsFolder: projectsFolder,
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
    up_visitProjectItems(app.project.rootItem, function (item) {
        var mediaPath = up_getProjectItemMediaPath(item);
        if (!mediaPath || !paths[up_normalizeMediaPath(mediaPath)]) { return; }

        var ext = up_fileExtension(mediaPath);
        var channels = null;
        if (ext === "mxf") {
            channels = UP_EPISODE_SETUP.mxfSourceChannels;
        } else if (ext === "wav" || ext === "wave") {
            channels = UP_EPISODE_SETUP.wavSourceChannels;
        } else {
            return;
        }

        var outcome = up_applyAudioChannelMapping(item, channels);
        if (outcome.ok) {
            stats.configured++;
            log.push("Audio mapped " + item.name + " -> mono source channel(s) " +
                up_oneBasedChannels(channels) + ".");
        } else if (outcome.unavailable) {
            stats.unavailable++;
            log.push("WARNING: " + item.name + ": " + outcome.message);
        } else {
            stats.failed++;
            log.push("WARNING: " + item.name + ": " + outcome.message);
        }
    });
    return stats;
}

function up_applyAudioChannelMapping(item, sourceChannels) {
    try {
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

        mapping.audioChannelsType = 0; // AUDIOCHANNELTYPE_Mono
        mapping.audioClipsNumber = sourceChannels.length;
        for (var i = 0; i < sourceChannels.length; i++) {
            var mapped = mapping.setMappingForChannel(i, sourceChannels[i]);
            if (mapped === false) {
                return {
                    ok: false,
                    unavailable: false,
                    message: "source channel " + (sourceChannels[i] + 1) +
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
        return { ok: true, unavailable: false, message: "" };
    } catch (e) {
        return {
            ok: false,
            unavailable: false,
            message: "audio mapping failed: " + e.toString()
        };
    }
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
