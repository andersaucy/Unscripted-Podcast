/**
 * Unscripted-Podcast — episode-number MOGRT and sequence identity.
 *
 * Derives PODCAST### from the saved project name, writes that integer to the
 * single AE MOGRT control named "Episode Number" on V2 of _CLIP INTRO, and
 * migrates the legacy LowRes sequence to "### LowRes_v1". Idempotent.
 */

var UP_EPISODE_IDENTITY = {
    clipIntroSequenceName: "_CLIP INTRO",
    mogrtParameterName: "Episode Number",
    legacyLowResName: "LowRes",
    lowResSuffix: " LowRes_v1"
};

function up_episodeNumberFromProjectName(projectName) {
    var match = String(projectName || "").match(/PODCAST[-_ ]*(\d{3})(?!\d)/i);
    return match ? match[1] : "";
}

function up_currentEpisodeNumber() {
    if (!app || !app.project) { return ""; }
    var name = "";
    try { name = app.project.name || ""; } catch (e) {}
    if (!name) {
        try { name = new File(app.project.path).name || ""; } catch (pathError) {}
    }
    return up_episodeNumberFromProjectName(name);
}

function up_episodeLowResName(episodeNumber) {
    return String(episodeNumber || "") + UP_EPISODE_IDENTITY.lowResSuffix;
}

function up_sequenceCollectionLength(sequences) {
    if (!sequences) { return 0; }
    if (typeof sequences.numItems === "number") { return sequences.numItems; }
    if (typeof sequences.length === "number") { return sequences.length; }
    return 0;
}

function up_findSequenceByExactName(name) {
    if (!app || !app.project || !app.project.sequences) { return null; }
    var sequences = app.project.sequences;
    var count = up_sequenceCollectionLength(sequences);
    for (var i = 0; i < count; i++) {
        if (sequences[i] && sequences[i].name === name) { return sequences[i]; }
    }
    return null;
}

/** Prefer the episode-aware name, but accept LowRes while a project migrates. */
function up_findEpisodeLowResSequence(episodeNumber) {
    return up_findSequenceByExactName(up_episodeLowResName(episodeNumber)) ||
        up_findSequenceByExactName(UP_EPISODE_IDENTITY.legacyLowResName);
}

function up_identityCollectionLength(collection) {
    if (!collection) { return 0; }
    if (typeof collection.numItems === "number") { return collection.numItems; }
    if (typeof collection.numProperties === "number") { return collection.numProperties; }
    if (typeof collection.numTracks === "number") { return collection.numTracks; }
    if (typeof collection.length === "number") { return collection.length; }
    return 0;
}

function up_identityParameterName(parameter) {
    try { return String(parameter.displayName || parameter.name || ""); }
    catch (e) { return ""; }
}

function up_identityPushUniqueParameter(found, parameter, trackItem) {
    if (!parameter) { return; }
    for (var i = 0; i < found.length; i++) {
        if (found[i].parameter === parameter) { return; }
    }
    var value = null;
    var readable = false;
    try {
        value = parameter.getValue();
        readable = true;
    } catch (valueError) {}
    found.push({
        parameter: parameter,
        trackItem: trackItem,
        value: value,
        readable: readable
    });
}

function up_findEpisodeNumberParameter(properties, trackItem, found) {
    if (!properties) { return; }
    var foundByDisplayName = false;
    try {
        if (typeof properties.getParamForDisplayName === "function") {
            var directParameter = properties.getParamForDisplayName(
                UP_EPISODE_IDENTITY.mogrtParameterName
            );
            up_identityPushUniqueParameter(
                found,
                directParameter,
                trackItem
            );
            foundByDisplayName = !!directParameter;
        }
    } catch (lookupError) {}

    // Premiere can expose the same MOGRT parameter through the direct lookup
    // and the indexed collection as two different JavaScript wrapper objects.
    // Once the exact-name lookup succeeds, do not count its collection alias.
    if (foundByDisplayName) { return; }

    var count = up_identityCollectionLength(properties);
    for (var i = 0; i < count; i++) {
        var parameter = properties[i];
        if (parameter && up_identityParameterName(parameter) ===
                UP_EPISODE_IDENTITY.mogrtParameterName) {
            up_identityPushUniqueParameter(found, parameter, trackItem);
        }
    }
}

function up_scanClipIntroMogrt(sequence) {
    var result = { parameters: [], diagnostics: [] };
    if (!sequence || !sequence.videoTracks ||
            up_identityCollectionLength(sequence.videoTracks) < 2) {
        result.diagnostics.push("_CLIP INTRO does not contain V2.");
        return result;
    }

    var clips = sequence.videoTracks[1].clips;
    var clipCount = up_identityCollectionLength(clips);
    for (var c = 0; c < clipCount; c++) {
        var trackItem = clips[c];
        var clipName = "V2 clip " + (c + 1);
        try { if (trackItem.name) { clipName += ' "' + trackItem.name + '"'; } }
        catch (clipNameError) {}

        var component = null;
        try {
            if (typeof trackItem.getMGTComponent === "function") {
                component = trackItem.getMGTComponent();
            }
        } catch (mgtError) {}
        if (!component) {
            result.diagnostics.push(clipName + ": not an editable AE MOGRT.");
            continue;
        }

        var before = result.parameters.length;
        try {
            up_findEpisodeNumberParameter(
                component.properties,
                trackItem,
                result.parameters
            );
        } catch (propertyError) {}
        result.diagnostics.push(clipName +
            (result.parameters.length > before ?
                ': found "Episode Number".' :
                ': AE MOGRT has no "Episode Number" control.'));
    }
    return result;
}

function up_getEpisodeIdentityState() {
    var number = up_currentEpisodeNumber();
    var targetNumber = parseInt(number, 10);
    var desiredLowResName = number ? up_episodeLowResName(number) : "";
    var clipIntro = up_findSequenceByExactName(UP_EPISODE_IDENTITY.clipIntroSequenceName);
    var graphic = clipIntro ? up_scanClipIntroMogrt(clipIntro) : {
        parameters: [], diagnostics: []
    };
    var desiredLowRes = desiredLowResName ? up_findSequenceByExactName(desiredLowResName) : null;
    var legacyLowRes = up_findSequenceByExactName(UP_EPISODE_IDENTITY.legacyLowResName);
    var numericValue = graphic.parameters.length === 1 &&
        graphic.parameters[0].readable ? Number(graphic.parameters[0].value) : NaN;
    return {
        episodeNumber: number,
        targetNumber: targetNumber,
        desiredLowResName: desiredLowResName,
        clipIntro: clipIntro,
        graphic: graphic,
        graphicConfigured: graphic.parameters.length === 1 &&
            isFinite(numericValue) && Math.abs(numericValue - targetNumber) < 0.001,
        desiredLowRes: desiredLowRes,
        legacyLowRes: legacyLowRes,
        lowResConfigured: !!desiredLowRes && !legacyLowRes
    };
}

function up_finishEpisodeIdentity(state, log) {
    if (!state.lowResConfigured) {
        if (!state.legacyLowRes && !state.desiredLowRes) {
            return 'No sequence named "LowRes" or "' + state.desiredLowResName + '" found.';
        }
        if (state.legacyLowRes) {
            state.legacyLowRes.name = state.desiredLowResName;
            if (state.legacyLowRes.name !== state.desiredLowResName) {
                return "Premiere did not retain the LowRes sequence rename.";
            }
            log.push('Renamed LowRes to "' + state.desiredLowResName + '".');
        }
    } else {
        log.push('Sequence already named "' + state.desiredLowResName + '".');
    }
    try { app.project.openSequence(state.clipIntro.sequenceID); } catch (openError) {
        log.push("WARNING: Premiere did not reopen _CLIP INTRO.");
    }
    return "";
}

function up_applyEpisodeIdentity() {
    var __log = [];
    try {
        if (!app || !app.project) {
            return up_result(false, "No open Premiere project.", __log);
        }
        var state = up_getEpisodeIdentityState();
        if (!state.episodeNumber) {
            return up_result(false,
                "Could not find PODCAST followed by a three-digit episode number in the project filename.",
                __log);
        }
        __log.push("Episode number from project: " + state.episodeNumber + ".");
        if (!state.clipIntro) {
            return up_result(false,
                'No sequence named "' + UP_EPISODE_IDENTITY.clipIntroSequenceName + '" found.',
                __log);
        }
        if (state.desiredLowRes && state.legacyLowRes) {
            return up_result(false,
                'Both "' + state.desiredLowResName + '" and legacy "LowRes" exist; rename or remove the duplicate first.',
                __log);
        }
        if (state.graphic.parameters.length !== 1) {
            for (var d = 0; d < state.graphic.diagnostics.length; d++) {
                __log.push(state.graphic.diagnostics[d]);
            }
            return up_result(false,
                'Expected exactly one AE MOGRT control named "Episode Number" on V2 of _CLIP INTRO; found ' +
                    state.graphic.parameters.length + ".",
                __log);
        }

        var candidate = state.graphic.parameters[0];
        if (!state.graphicConfigured) {
            var setResult = candidate.parameter.setValue(state.targetNumber, 1);
            if (setResult === false) {
                return up_result(false,
                    'Premiere rejected the MOGRT "Episode Number" update.',
                    __log);
            }
            var verifiedValue = Number(candidate.parameter.getValue());
            if (!isFinite(verifiedValue) ||
                    Math.abs(verifiedValue - state.targetNumber) >= 0.001) {
                return up_result(false,
                    'Premiere did not retain the MOGRT "Episode Number" value.',
                    __log);
            }
            __log.push('Set MOGRT "Episode Number" to ' + state.targetNumber + ".");
        } else {
            __log.push('MOGRT "Episode Number" is already ' + state.targetNumber + ".");
        }

        var finishError = up_finishEpisodeIdentity(state, __log);
        if (finishError) { return up_result(false, finishError, __log); }
        return up_result(true,
            "Episode " + state.episodeNumber + " MOGRT and LowRes name are ready.",
            __log);
    } catch (e) {
        var where = e.line ? (" (line " + e.line + ")") : "";
        return up_result(false, "Episode identity error: " + e.toString() + where, __log);
    }
}
