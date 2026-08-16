/** Camera grouping and Lumetri application for the external color analyzer. */

var up_intelligentColorSession = null;

function up_prepareIntelligentColorAnalysis() {
    var __log = [];
    try {
        if (!app.project || !app.project.activeSequence) {
            return up_result(false, "Open a sequence before analyzing camera groups.", __log);
        }
        var sequence = app.project.activeSequence;
        var selected = [];
        try { selected = sequence.getSelection() || []; } catch (selectionError) {}
        var candidates = up_intelligentColorVideoCandidates(sequence, selected);
        var scope = "selected clips";
        if (candidates.length === 0) {
            candidates = up_intelligentColorVideoCandidates(sequence, null);
            scope = "active sequence";
        }
        return up_prepareIntelligentColorSequence(sequence, candidates, scope, __log);
    } catch (e) {
        return up_result(false, "Camera grouping error: " + e.toString(), __log);
    }
}

/** Prepare all video clips in one standard episode multicam, ignoring selection. */
function up_prepareEpisodeIntelligentColorAnalysis(groupKey) {
    var __log = [];
    try {
        if (!app.project) { return up_result(false, "No open Premiere project.", __log); }
        var key = String(groupKey || "").toLowerCase();
        if (key !== "intro" && key !== "talk") {
            return up_result(false, "Unknown episode camera group: " + groupKey, __log);
        }
        var number = up_mc_podcastNumber(app.project.name);
        if (!number) {
            return up_result(false, "Could not extract PODCAST### from the project filename.", __log);
        }
        var sequenceName = key.toUpperCase() + "-" + number;
        var sequence = up_colorFindSequence(sequenceName);
        if (!sequence) { return up_result(false, sequenceName + " was not found.", __log); }
        try { app.project.openSequence(sequence.sequenceID); } catch (openError) {}
        try { app.project.activeSequence = sequence; } catch (activeError) {}
        return up_prepareIntelligentColorSequence(
            sequence,
            up_intelligentColorVideoCandidates(sequence, null),
            "all clips in " + sequenceName,
            __log
        );
    } catch (e) {
        return up_result(false, "Episode camera grouping error: " + e.toString(), __log);
    }
}

function up_prepareIntelligentColorSequence(sequence, candidates, scope, __log) {
    try {
        if (candidates.length === 0) {
            return up_result(false, "No online video clips were found in " +
                String(sequence.name || "the sequence") + ".", __log);
        }

        var grouped = {};
        var ordered = [];
        for (var i = 0; i < candidates.length; i++) {
            var candidate = candidates[i];
            var identity = up_intelligentColorGroupIdentity(candidate.mediaPath);
            var storageKey = "group_" + identity.key;
            if (!grouped[storageKey]) {
                grouped[storageKey] = {
                    id: "camera-" + (ordered.length + 1),
                    key: identity.key,
                    label: identity.label,
                    strategy: identity.strategy,
                    members: [],
                    representative: null
                };
                ordered.push(grouped[storageKey]);
            }
            var group = grouped[storageKey];
            group.members.push(candidate);
            if (!group.representative ||
                    candidate.durationSeconds > group.representative.durationSeconds) {
                group.representative = candidate;
            }
        }

        var sessionId = "color-" + String(new Date().getTime());
        up_intelligentColorSession = {
            id: sessionId,
            sequenceName: String(sequence.name),
            sequenceId: String(sequence.sequenceID),
            groups: ordered,
            signature: up_sccMemberSignature(ordered)
        };
        __log.push("Discovered " + ordered.length + " camera group(s) from " + scope + ".");
        for (var g = 0; g < ordered.length; g++) {
            __log.push(ordered[g].label + ": " + ordered[g].members.length +
                " clip(s), grouped by " + ordered[g].strategy + ".");
        }
        return up_intelligentColorPrepareResult(true, sessionId, scope, ordered,
            "Ready to analyze " + ordered.length + " camera group(s).", __log);
    } catch (e) {
        return up_result(false, "Camera grouping error: " + e.toString(), __log);
    }
}

function up_ensureIntelligentColorLumetri(sessionId) {
    var __log = [];
    try {
        var session = up_intelligentColorRequireSession(sessionId);
        if (!session.ok) { return up_result(false, session.message, __log); }
        var sequence = up_colorFindSequence(up_intelligentColorSession.sequenceName);
        if (!sequence) { return up_result(false, "The analyzed sequence is no longer open.", __log); }
        try { app.project.openSequence(sequence.sequenceID); } catch (openError) {}
        try { app.project.activeSequence = sequence; } catch (activeError) {}
        app.enableQE();
        var qeSequence = up_colorFindQeSequence(String(sequence.name));
        var effect = qe.project.getVideoEffectByName("Lumetri Color");
        if (!qeSequence || !effect) {
            return up_result(false, "Premiere did not expose Lumetri through QE.", __log);
        }
        var added = 0;
        var existing = 0;
        for (var g = 0; g < up_intelligentColorSession.groups.length; g++) {
            var members = up_intelligentColorSession.groups[g].members;
            for (var m = 0; m < members.length; m++) {
                var member = members[m];
                var clip = up_intelligentColorResolveClip(sequence, member);
                if (clip && up_colorFindLumetri(clip)) {
                    existing++;
                    continue;
                }
                var qeTrack = qeSequence.getVideoTrackAt(member.trackIndex);
                var qeClips = up_colorQeClips(qeTrack);
                if (!qeClips[member.clipIndex]) {
                    return up_result(false, "Could not map " + member.clipName +
                        " to its QE timeline clip.", __log);
                }
                qeClips[member.clipIndex].addVideoEffect(effect);
                added++;
            }
        }
        __log.push("Lumetri added to " + added + " clip(s); already present on " +
            existing + ".");
        return up_result(true, "Lumetri is ready on all analyzed clips.", __log);
    } catch (e) {
        return up_result(false, "Prepare Lumetri error: " + e.toString(), __log);
    }
}

function up_applyIntelligentColorRecommendations(payloadJson) {
    var __log = [];
    try {
        var payload = up_intelligentColorParsePayload(payloadJson);
        var session = up_intelligentColorRequireSession(payload.session_id);
        if (!session.ok) { return up_result(false, session.message, __log); }
        var sequence = up_colorFindSequence(up_intelligentColorSession.sequenceName);
        if (!sequence) { return up_result(false, "The analyzed sequence is no longer open.", __log); }
        var recommendationMap = {};
        for (var r = 0; r < payload.groups.length; r++) {
            recommendationMap[payload.groups[r].id] = payload.groups[r].recommendations;
        }

        var appliedClips = 0;
        var failures = [];
        for (var g = 0; g < up_intelligentColorSession.groups.length; g++) {
            var group = up_intelligentColorSession.groups[g];
            var values = recommendationMap[group.id];
            if (!values) {
                failures.push(group.label + ": analyzer returned no recommendations");
                continue;
            }
            for (var m = 0; m < group.members.length; m++) {
                var clip = up_intelligentColorResolveClip(sequence, group.members[m]);
                var lumetri = up_colorFindLumetri(clip);
                if (!lumetri) {
                    failures.push(group.members[m].clipName + ": Lumetri did not refresh");
                    continue;
                }
                var applyResult = up_intelligentColorSetBasicCorrection(lumetri, values);
                if (!applyResult.ok) {
                    failures.push(group.members[m].clipName + ": " + applyResult.message);
                } else {
                    appliedClips++;
                }
            }
        }
        __log.push("Applied analyzed Basic Correction values to " + appliedClips + " clip(s).");
        if (failures.length > 0) {
            for (var f = 0; f < failures.length; f++) { __log.push("WARNING: " + failures[f]); }
            return up_result(false, "Color values could not be applied to " +
                failures.length + " clip(s).", __log);
        }
        up_sccWriteCompletionMarker(sequence, up_intelligentColorSession,
            appliedClips);
        return up_result(true, "Applied intelligent color to " + appliedClips + " clip(s).", __log);
    } catch (e) {
        return up_result(false, "Apply intelligent color error: " + e.toString(), __log);
    }
}

/** ExtendScript does not provide the browser's global JSON object. */
function up_intelligentColorParsePayload(payloadJson) {
    var source = String(payloadJson || "");
    if (!source || source.length > 100000 || source.charAt(0) !== "{" ||
            source.charAt(source.length - 1) !== "}") {
        throw new Error("Invalid color recommendation payload.");
    }
    // The string is generated internally by the signed CEP panel from numeric
    // analyzer results. eval is used only as an ES3-compatible JSON parser.
    return eval("(" + source + ")");
}

function up_sccMemberSignature(groups) {
    var keys = [];
    for (var g = 0; g < groups.length; g++) {
        for (var m = 0; m < groups[g].members.length; m++) {
            var member = groups[g].members[m];
            keys.push(String(member.mediaPath).toLowerCase() + "@" +
                member.trackIndex + ":" + member.clipIndex);
        }
    }
    keys.sort();
    return up_sccHash(keys.join("|"));
}

function up_sccHash(value) {
    var hash = 7;
    var text = String(value || "");
    for (var i = 0; i < text.length; i++) {
        hash = (hash * 31 + text.charCodeAt(i)) % 2147483647;
    }
    return String(hash);
}

function up_sccWriteCompletionMarker(sequence, session, clipCount) {
    if (!sequence || !sequence.markers) { return; }
    var marker = null;
    try {
        marker = sequence.markers.getFirstMarker();
        while (marker) {
            var next = sequence.markers.getNextMarker(marker);
            if (String(marker.name || "") === "Smart Camera Color Analyzed") {
                sequence.markers.deleteMarker(marker);
            }
            marker = next;
        }
    } catch (cleanupError) {}
    try {
        marker = sequence.markers.createMarker(0);
        marker.name = "Smart Camera Color Analyzed";
        marker.comments = "version=1;groups=" + session.groups.length +
            ";clips=" + clipCount + ";signature=" + session.signature;
    } catch (markerError) {}
}

function up_intelligentColorVideoCandidates(sequence, selected) {
    var candidates = [];
    var selectedIds = {};
    var useSelection = selected && selected.length > 0;
    if (useSelection) {
        for (var s = 0; s < selected.length; s++) {
            try {
                if (selected[s].nodeId !== undefined && selected[s].nodeId !== null) {
                    selectedIds[String(selected[s].nodeId)] = true;
                }
            } catch (selectionIdError) {}
        }
    }
    for (var t = 0; t < sequence.videoTracks.numTracks; t++) {
        var clips = sequence.videoTracks[t].clips;
        for (var c = 0; c < clips.numItems; c++) {
            var clip = clips[c];
            if (useSelection) {
                var selectedMatch = false;
                try {
                    if (clip.nodeId !== undefined && clip.nodeId !== null) {
                        selectedMatch = !!selectedIds[String(clip.nodeId)];
                    }
                } catch (nodeError) {}
                if (!selectedMatch) {
                    for (var si = 0; si < selected.length; si++) {
                        if (selected[si] === clip) { selectedMatch = true; break; }
                    }
                }
                if (!selectedMatch) { continue; }
            }
            var projectItem = clip.projectItem;
            var mediaPath = "";
            try { mediaPath = projectItem.getMediaPath() || ""; } catch (pathError) {}
            if (!mediaPath || !up_intelligentColorIsVideoPath(mediaPath)) { continue; }
            var duration = 0;
            var sourceIn = 0;
            try { duration = Number(clip.duration.seconds || 0); } catch (durationError) {}
            try { sourceIn = Number(clip.inPoint.seconds || 0); } catch (inError) {}
            var offset = Math.min(7, Math.max(0.5, duration * 0.25));
            candidates.push({
                trackIndex: t,
                clipIndex: c,
                clipName: String(clip.name || up_intelligentColorBasename(mediaPath)),
                mediaPath: String(mediaPath),
                durationSeconds: duration,
                timestampSeconds: sourceIn + offset
            });
        }
    }
    return candidates;
}

function up_intelligentColorGroupIdentity(mediaPath) {
    var filename = up_intelligentColorBasename(mediaPath);
    var stem = filename.replace(/\.[^.]+$/, "");
    var upper = stem.toUpperCase();
    var match = upper.match(/(?:^|[-_\s])(CAM(?:ERA)?[-_\s]*[A-Z0-9]+)(?:$|[-_\s])/);
    if (match) {
        var token = match[1].replace(/[-_\s]+/g, " ");
        return { key: token.replace(/\s/g, "-"), label: token, strategy: "filename" };
    }
    match = upper.match(/(?:^|[-_\s])(C[1-9])(?:$|[-_\s])/);
    if (match) { return { key: match[1], label: match[1], strategy: "filename" }; }
    var folder = up_intelligentColorParentFolder(mediaPath);
    if (folder) {
        return { key: folder.toUpperCase().replace(/[^A-Z0-9]+/g, "-"),
            label: folder, strategy: "media folder" };
    }
    return { key: upper.replace(/[^A-Z0-9]+/g, "-"), label: stem,
        strategy: "filename stem" };
}

function up_intelligentColorSetBasicCorrection(lumetri, values) {
    var names = {
        exposure: "Exposure", contrast: "Contrast", highlights: "Highlights",
        shadows: "Shadows", whites: "Whites", blacks: "Blacks",
        temperature: "Temperature", tint: "Tint", saturation: "Saturation"
    };
    var missing = [];
    for (var key in names) {
        if (!names.hasOwnProperty || names.hasOwnProperty(key)) {
            var parameter = up_intelligentColorFindParameter(lumetri.properties, names[key]);
            if (!parameter || typeof parameter.setValue !== "function") {
                missing.push(names[key]);
                continue;
            }
            parameter.setValue(Number(values[key]), true);
        }
    }
    if (missing.length > 0) {
        return { ok: false, message: "Basic Correction parameter(s) unavailable: " +
            missing.join(", ") };
    }
    return { ok: true, message: "" };
}

function up_intelligentColorFindParameter(properties, displayName) {
    if (!properties) { return null; }
    try {
        if (typeof properties.getParamForDisplayName === "function") {
            var direct = properties.getParamForDisplayName(displayName);
            if (direct) { return direct; }
        }
    } catch (directError) {}
    var count = up_colorCollectionLength(properties);
    for (var i = 0; i < count; i++) {
        var name = "";
        try { name = String(properties[i].displayName || properties[i].name || ""); }
        catch (nameError) {}
        if (name.toUpperCase() === displayName.toUpperCase()) { return properties[i]; }
    }
    return null;
}

function up_intelligentColorResolveClip(sequence, member) {
    try { return sequence.videoTracks[member.trackIndex].clips[member.clipIndex]; }
    catch (e) { return null; }
}

function up_intelligentColorRequireSession(sessionId) {
    if (!up_intelligentColorSession || String(up_intelligentColorSession.id) !==
            String(sessionId || "")) {
        return { ok: false, message: "The color-analysis session expired. Analyze again." };
    }
    return { ok: true, message: "" };
}

function up_intelligentColorIsVideoPath(path) {
    return /\.(mxf|mov|mp4|m4v|avi|mkv|r3d|braw|mts|m2ts|webm)$/i.test(String(path));
}

function up_intelligentColorBasename(path) {
    var parts = String(path || "").replace(/\\/g, "/").split("/");
    return parts.length ? parts[parts.length - 1] : "";
}

function up_intelligentColorParentFolder(path) {
    var parts = String(path || "").replace(/\\/g, "/").split("/");
    return parts.length > 1 ? parts[parts.length - 2] : "";
}

function up_intelligentColorPrepareResult(ok, sessionId, scope, groups, message, log) {
    var groupJson = [];
    for (var i = 0; i < groups.length; i++) {
        var representative = groups[i].representative;
        groupJson.push('{"id":"' + up_escapeJSON(groups[i].id) + '"' +
            ',"label":"' + up_escapeJSON(groups[i].label) + '"' +
            ',"strategy":"' + up_escapeJSON(groups[i].strategy) + '"' +
            ',"clip_count":' + groups[i].members.length +
            ',"representative_name":"' + up_escapeJSON(representative.clipName) + '"' +
            ',"media_path":"' + up_escapeJSON(representative.mediaPath) + '"' +
            ',"timestamp_seconds":' + Number(representative.timestampSeconds || 0) + '}');
    }
    return '{"ok":' + (ok ? "true" : "false") +
        ',"session_id":"' + up_escapeJSON(sessionId) + '"' +
        ',"scope":"' + up_escapeJSON(scope) + '"' +
        ',"groups":[' + groupJson.join(",") + ']' +
        ',"message":"' + up_escapeJSON(message) + '"' +
        ',"log":"' + up_escapeJSON((log || []).join("\n")) + '"}';
}
