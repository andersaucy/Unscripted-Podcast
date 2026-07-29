/**
 * Unscripted-Podcast — "Render / Queue in AME" task.
 *
 * Refactor of the original RenderUnscripted.jsx into a callable function that
 * returns a JSON status string instead of using alert(). The export logic is
 * preserved from the original script.
 *
 * Batch-exports every sequence inside the "ExportBin" bin to Adobe Media
 * Encoder. Edit the CONFIG block below to change presets / output folder.
 */

function up_renderUnscripted() {
    var __log = [];

    // =========================
    // CONFIG
    // =========================
    var BIN_NAME = "ExportBin";
    var OUTPUT_FOLDER = Folder.desktop.fsName + "/Podcast Exports";

    // Main/default preset
    var PRESET_FOLDER = Folder.myDocuments.fsName +
        "/Adobe/Adobe Media Encoder/26.0/Presets";
    var PRESET_1 = PRESET_FOLDER + "/YouTube-1080.epr";
    var EXT_1 = ".mp4";
    var SUFFIX_1 = "";
    // Optional second preset (audio)
    var PRESET_2 = PRESET_FOLDER + "/Mp3-Export.epr";
    var EXT_2 = ".mp3";
    var SUFFIX_2 = "_AUDIO";

    var RANGE_TO_ENCODE = app.encoder.ENCODE_ENTIRE;
    var REMOVE_ON_SUCCESS = 0;
    var AUTO_START_BATCH = false;

    // =========================
    // HELPERS
    // =========================
    function normalizePath(pathStr) {
        return new Folder(pathStr).fsName;
    }

    function ensureFolder(pathStr) {
        var f = new Folder(pathStr);
        return f.exists ? true : f.create();
    }

    function sanitizeName(name) {
        return name.replace(/[\/\\:\*\?"<>\|]/g, "_");
    }

    function buildOutputPath(seqName, suffix, ext) {
        return normalizePath(OUTPUT_FOLDER) + "/" + sanitizeName(seqName) + suffix + ext;
    }

    function findBinByName(projectItem, targetName) {
        if (!projectItem) { return null; }
        if (projectItem.type === ProjectItemType.BIN && projectItem.name === targetName) {
            return projectItem;
        }
        if (projectItem.children && projectItem.children.numItems > 0) {
            for (var i = 0; i < projectItem.children.numItems; i++) {
                var found = findBinByName(projectItem.children[i], targetName);
                if (found) { return found; }
            }
        }
        return null;
    }

    function findSequenceByProjectItem(projectItem) {
        if (!projectItem) { return null; }
        for (var i = 0; i < app.project.sequences.numSequences; i++) {
            var seq = app.project.sequences[i];
            if (seq.projectItem && seq.projectItem.nodeId === projectItem.nodeId) {
                return seq;
            }
        }
        return null;
    }

    function collectSequencesInBin(binItem, results) {
        if (!binItem || !binItem.children) { return; }
        for (var i = 0; i < binItem.children.numItems; i++) {
            var child = binItem.children[i];
            if (child.type === ProjectItemType.BIN) {
                collectSequencesInBin(child, results);
            } else {
                var seq = findSequenceByProjectItem(child);
                if (seq) { results.push(seq); }
            }
        }
    }

    function queueSequenceExport(seq, presetPath, suffix, ext) {
        var outPath = buildOutputPath(seq.name, suffix, ext);
        __log.push("Queueing: " + seq.name + " -> " + outPath);
        app.encoder.encodeSequence(seq, outPath, presetPath, RANGE_TO_ENCODE, REMOVE_ON_SUCCESS);
    }

    function sequenceNeedsMp3(seqName) {
        return seqName.indexOf("#") === -1;
    }

    // =========================
    // MAIN
    // =========================
    try {
        if (!app.project) {
            return up_result(false, "No open Premiere project.", __log);
        }
        if (!ensureFolder(OUTPUT_FOLDER)) {
            return up_result(false, "Could not create or access output folder:\n" + OUTPUT_FOLDER, __log);
        }
        if (!new File(PRESET_1).exists) {
            return up_result(false, "Preset 1 not found:\n" + PRESET_1, __log);
        }

        var exportBin = findBinByName(app.project.rootItem, BIN_NAME);
        if (!exportBin) {
            return up_result(false, 'Could not find bin named: "' + BIN_NAME + '".', __log);
        }

        var sequencesToExport = [];
        collectSequencesInBin(exportBin, sequencesToExport);
        if (sequencesToExport.length === 0) {
            return up_result(false, 'No sequences found inside bin "' + BIN_NAME + '".', __log);
        }

        app.encoder.launchEncoder();

        var queuedCount = 0;
        for (var s = 0; s < sequencesToExport.length; s++) {
            var seq = sequencesToExport[s];
            if (!seq) { continue; }

            queueSequenceExport(seq, PRESET_1, SUFFIX_1, EXT_1);
            queuedCount++;

            if (sequenceNeedsMp3(seq.name)) {
                queueSequenceExport(seq, PRESET_2, SUFFIX_2, EXT_2);
                queuedCount++;
            }
        }

        if (AUTO_START_BATCH) {
            app.encoder.startBatch();
        }

        return up_result(true,
            "Queued " + queuedCount + " export job(s) from bin '" + BIN_NAME + "'.",
            __log);

    } catch (e) {
        var where = e.line ? (" (line " + e.line + ")") : "";
        return up_result(false, "Render error: " + e.toString() + where, __log);
    }
}
