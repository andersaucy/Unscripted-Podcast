/**
 * Unscripted-Podcast — episode collection.
 *
 * Uses Premiere's Project Manager instead of manually copying and relinking
 * individual media paths. This preserves Premiere-aware dependencies and
 * creates a self-contained project copy without changing the active project.
 */

var UP_COLLECT_EPISODE = {
    folderPrefix: "Collected - ",
    maxNameLength: 80
};

function up_collectAndSaveEpisode() {
    var __log = [];
    try {
        var context = up_getEpisodeContext(__log);
        if (!context.ok) {
            return up_result(false, context.message, __log);
        }

        if (!app.projectManager || !app.projectManager.options) {
            return up_result(false,
                "Premiere Project Manager is unavailable in this host version.",
                __log);
        }
        if (!app.project.sequences || app.project.sequences.numSequences < 1) {
            return up_result(false,
                "The project needs at least one sequence before it can be collected.",
                __log);
        }

        var options = app.projectManager.options;
        if (options.CLIP_TRANSFER_COPY === undefined) {
            return up_result(false,
                "This Premiere version does not expose Project Manager copy mode.",
                __log);
        }

        var saveResult = app.project.save();
        if (saveResult !== 0) {
            return up_result(false,
                "Premiere could not save the active project before collection.",
                __log);
        }
        __log.push("Saved active project before collection.");

        var episodeName = up_collectProjectName(context.projectFile.name);
        var destination = up_collectUniqueFolder(
            context.episodeFolder,
            UP_COLLECT_EPISODE.folderPrefix + episodeName
        );
        if (!destination.create() && !destination.exists) {
            return up_result(false,
                "Could not create collection folder: " + destination.fsName,
                __log);
        }
        __log.push("Collection destination: " + destination.fsName);

        options.clipTransferOption = options.CLIP_TRANSFER_COPY;
        options.destinationPath = destination.fsName;
        options.excludeUnused = false;
        options.includeAllSequences = true;
        options.includeConformedAudio = false;
        options.includePreviews = false;
        options.renameMedia = false;
        options.convertImageSequencesToClips = false;
        options.convertSyntheticsToClips = false;
        options.convertAECompsToClips = false;
        options.copyToPreventAlphaLoss = false;

        __log.push("Collecting all project media and sequences with Premiere Project Manager...");
        var processResult = app.projectManager.process(app.project);
        var errors = up_collectProjectManagerErrors(app.projectManager.errors);
        if (errors.length) {
            for (var i = 0; i < errors.length; i++) {
                __log.push("WARNING: " + errors[i]);
            }
            return up_result(false,
                "Episode collection finished with Project Manager errors. Review the log.",
                __log);
        }

        __log.push("Project Manager result: " + String(processResult));
        __log.push("The active project remains open; the collected project copy is in the destination above.");
        return up_result(true,
            "Collected episode copy created in " + destination.name + ".",
            __log);
    } catch (e) {
        var where = e.line ? (" (line " + e.line + ")") : "";
        return up_result(false,
            "Collect & Save Episode error: " + e.toString() + where,
            __log);
    }
}

function up_collectProjectName(fileName) {
    var name = String(fileName || "Episode").replace(/\.[^.]+$/, "");
    name = name.replace(/[\\\/:*?\"<>|]/g, "-");
    name = name.replace(/^\s+|\s+$/g, "");
    if (!name) { name = "Episode"; }
    if (name.length > UP_COLLECT_EPISODE.maxNameLength) {
        name = name.substring(0, UP_COLLECT_EPISODE.maxNameLength);
    }
    return name;
}

function up_collectUniqueFolder(parent, preferredName) {
    var candidate = new Folder(parent.fsName + "/" + preferredName);
    if (!candidate.exists) { return candidate; }

    var suffix = 2;
    while (suffix < 1000) {
        candidate = new Folder(parent.fsName + "/" + preferredName + " " + suffix);
        if (!candidate.exists) { return candidate; }
        suffix++;
    }
    throw new Error("Could not find an unused collection folder name.");
}

function up_collectProjectManagerErrors(errorCollection) {
    var out = [];
    if (!errorCollection) { return out; }

    var length = Number(errorCollection.length) || 0;
    for (var i = 0; i < length; i++) {
        var item = errorCollection[i];
        if (item !== undefined && item !== null) {
            var message = (item.length && item[0] !== undefined) ? item[0] : item;
            if (String(message) !== "") { out.push(String(message)); }
        }
    }
    return out;
}
