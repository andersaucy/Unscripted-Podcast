/** Apply Lumetri Color to every video TrackItem in the episode multicams. */
function up_applyLumetriEpisodeMulticams() {
    var __log = [];
    try {
        if (!app.project) {
            return up_result(false, "No open Premiere project.", __log);
        }
        var number = up_mc_podcastNumber(app.project.name);
        if (!number) {
            return up_result(false,
                "Could not extract PODCAST### from the project filename.", __log);
        }

        app.enableQE();
        var lumetriEffect = qe.project.getVideoEffectByName("Lumetri Color");
        if (!lumetriEffect) {
            return up_result(false,
                'Premiere did not expose the "Lumetri Color" video effect.', __log);
        }

        var names = ["INTRO-" + number, "TALK-" + number];
        var totalClips = 0;
        var effectsAdded = 0;
        var existingEffects = 0;
        var unavailable = [];

        for (var n = 0; n < names.length; n++) {
            var sequence = up_colorFindSequence(names[n]);
            if (!sequence) {
                return up_result(false, names[n] + " was not found.", __log);
            }
            try { app.project.openSequence(sequence.sequenceID); } catch (openError) {}
            try { app.project.activeSequence = sequence; } catch (activeError) {}
            // Opening a sequence can invalidate previously-returned TrackItem
            // component wrappers. Resolve it again before checking Lumetri so
            // reruns do not add duplicates from a stale components collection.
            sequence = up_colorFindSequence(names[n]);

            var qeSequence = up_colorFindQeSequence(names[n]);
            if (!qeSequence) {
                return up_result(false,
                    "QE could not access " + names[n] + ".", __log);
            }
            var sequenceClips = 0;
            for (var t = 0; t < sequence.videoTracks.numTracks; t++) {
                var domTrack = sequence.videoTracks[t];
                var qeTrack = qeSequence.getVideoTrackAt(t);
                var qeClips = up_colorQeClips(qeTrack);
                for (var c = 0; c < domTrack.clips.numItems; c++) {
                    var trackItem = domTrack.clips[c];
                    sequenceClips++;
                    totalClips++;

                    var lumetri = up_colorFindLumetri(trackItem);
                    if (!lumetri) {
                        if (c >= qeClips.length || !qeClips[c] ||
                                typeof qeClips[c].addVideoEffect !== "function") {
                            unavailable.push(names[n] + " V" + (t + 1) +
                                " clip " + (c + 1) + ": QE clip mapping unavailable");
                            continue;
                        }
                        qeClips[c].addVideoEffect(lumetriEffect);
                        effectsAdded++;
                    } else {
                        existingEffects++;
                    }
                }
            }
            __log.push(names[n] + ": processed " + sequenceClips + " video clip(s).");
        }

        __log.push("Lumetri added to " + effectsAdded + " clip(s); already present " +
            "on " + existingEffects + ".");
        if (unavailable.length > 0) {
            for (var a = 0; a < unavailable.length; a++) {
                __log.push("WARNING: " + unavailable[a]);
            }
            return up_result(false,
                "Lumetri could not be applied to " + unavailable.length + " clip(s).",
                __log);
        }
        return up_result(true,
            "Lumetri is present on all " + totalClips + " multicam video clip(s).", __log);
    } catch (e) {
        return up_result(false, "Apply Lumetri error: " + e.toString(), __log);
    }
}

function up_colorEpisodeMulticamCoverage(podcastNumber) {
    var coverage = { targetCount: 0, configuredCount: 0, configured: false };
    var names = ["INTRO-" + podcastNumber, "TALK-" + podcastNumber];
    for (var n = 0; n < names.length; n++) {
        var sequence = up_colorFindSequence(names[n]);
        if (!sequence) { continue; }
        for (var t = 0; t < sequence.videoTracks.numTracks; t++) {
            var clips = sequence.videoTracks[t].clips;
            for (var c = 0; c < clips.numItems; c++) {
                coverage.targetCount++;
                if (up_colorFindLumetri(clips[c])) { coverage.configuredCount++; }
            }
        }
    }
    coverage.configured = coverage.targetCount > 0 &&
        coverage.configuredCount === coverage.targetCount;
    return coverage;
}

/** Read completion markers written by the separate Smart Camera Color panel. */
function up_colorEpisodeAnalysisCoverage(podcastNumber) {
    var coverage = { sequenceCount: 0, analyzedSequenceCount: 0,
        clipCount: 0, analyzedClipCount: 0, configured: false };
    var names = ["INTRO-" + podcastNumber, "TALK-" + podcastNumber];
    for (var n = 0; n < names.length; n++) {
        var sequence = up_colorFindSequence(names[n]);
        if (!sequence) { continue; }
        coverage.sequenceCount++;
        var current = up_colorSequenceAnalysisIdentity(sequence);
        coverage.clipCount += current.clipCount;
        var marker = up_colorFindAnalysisMarker(sequence);
        if (marker && marker.signature === current.signature &&
                marker.clipCount === current.clipCount) {
            coverage.analyzedSequenceCount++;
            coverage.analyzedClipCount += current.clipCount;
        }
    }
    coverage.configured = coverage.sequenceCount === 2 &&
        coverage.analyzedSequenceCount === 2 && coverage.clipCount > 0;
    return coverage;
}

function up_colorSequenceAnalysisIdentity(sequence) {
    var keys = [];
    for (var t = 0; t < sequence.videoTracks.numTracks; t++) {
        var clips = sequence.videoTracks[t].clips;
        for (var c = 0; c < clips.numItems; c++) {
            var mediaPath = "";
            try { mediaPath = clips[c].projectItem.getMediaPath() || ""; }
            catch (pathError) {}
            if (!mediaPath) { continue; }
            keys.push(String(mediaPath).toLowerCase() + "@" + t + ":" + c);
        }
    }
    keys.sort();
    return { clipCount: keys.length, signature: up_colorAnalysisHash(keys.join("|")) };
}

function up_colorAnalysisHash(value) {
    var hash = 7;
    var text = String(value || "");
    for (var i = 0; i < text.length; i++) {
        hash = (hash * 31 + text.charCodeAt(i)) % 2147483647;
    }
    return String(hash);
}

function up_colorFindAnalysisMarker(sequence) {
    if (!sequence || !sequence.markers) { return null; }
    try {
        var marker = sequence.markers.getFirstMarker();
        while (marker) {
            if (String(marker.name || "") === "Smart Camera Color Analyzed") {
                var comments = String(marker.comments || "");
                var clips = comments.match(/(?:^|;)clips=(\d+)/);
                var signature = comments.match(/(?:^|;)signature=([^;]+)/);
                return { clipCount: clips ? Number(clips[1]) : 0,
                    signature: signature ? signature[1] : "" };
            }
            marker = sequence.markers.getNextMarker(marker);
        }
    } catch (markerError) {}
    return null;
}


function up_colorFindQeSequence(sequenceName) {
    var count = 0;
    try { count = Number(qe.project.numSequences || 0); } catch (countError) {}
    for (var i = 0; i < count; i++) {
        var candidate = null;
        try { candidate = qe.project.getSequenceAt(i); } catch (sequenceError) {}
        if (candidate && String(candidate.name || "") === sequenceName) {
            return candidate;
        }
    }
    try {
        var active = qe.project.getActiveSequence();
        if (active && String(active.name || "") === sequenceName) { return active; }
    } catch (activeError) {}
    return null;
}

function up_colorFindSequence(sequenceName) {
    if (!app.project || !app.project.sequences) { return null; }
    for (var i = 0; i < app.project.sequences.numSequences; i++) {
        if (String(app.project.sequences[i].name) === sequenceName) {
            return app.project.sequences[i];
        }
    }
    return null;
}

function up_colorCollectionLength(collection) {
    if (!collection) { return 0; }
    if (typeof collection.numItems === "number") { return collection.numItems; }
    if (typeof collection.length === "number") { return collection.length; }
    return 0;
}

function up_colorQeClips(qeTrack) {
    var clips = [];
    if (!qeTrack) { return clips; }
    var count = Number(qeTrack.numItems || 0);
    for (var i = 0; i < count; i++) {
        var item = null;
        try { item = qeTrack.getItemAt(i); } catch (itemError) {}
        var itemType = "";
        try { itemType = String(item.type || "").toUpperCase(); } catch (typeError) {}
        if (item && itemType === "CLIP" &&
                typeof item.addVideoEffect === "function") {
            clips.push(item);
        }
    }
    return clips;
}

function up_colorFindLumetri(trackItem) {
    var components = trackItem ? trackItem.components : null;
    var count = up_colorCollectionLength(components);
    for (var i = 0; i < count; i++) {
        var component = components[i];
        var identity = "";
        try { identity += " " + String(component.displayName || ""); } catch (e1) {}
        try { identity += " " + String(component.matchName || ""); } catch (e2) {}
        if (identity.toUpperCase().indexOf("LUMETRI") !== -1) { return component; }
    }
    return null;
}
