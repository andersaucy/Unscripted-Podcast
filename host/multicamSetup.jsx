/**
 * Unscripted-Podcast — deterministic INTRO/TALK multicam preparation.
 *
 * Premiere's ExtendScript DOM cannot create a multicamera source sequence
 * directly. This module owns the supported project-side work: identify and
 * validate source groups, order CAM1 first, batch-select the Project items,
 * and verify the native sequence created by the panel's macOS UI helper.
 */

var UP_MULTICAM_SETUP = {
    footageBinName: "Footage",
    zencastrSyncMarkerName: "Unscripted Zencastr Sync",
    wavPartTwoMarkerName: "Unscripted WAV P2 Start",
    timeToleranceSeconds: 0.05,
    supportedExtensions: {
        mxf: true,
        mov: true,
        mp4: true,
        mp3: true,
        wav: true,
        wave: true
    },
    videoExtensions: {
        mxf: true,
        mov: true,
        mp4: true
    }
};

// Retains the original synchronized WAV project items and timing between the
// staged placement and verification calls made by Finish TALK Layout.
var UP_TALK_LAYOUT_SESSION = null;
var UP_TALK_WAV_MOVE_SESSION = null;

/** Select one intact WAV channel for Premiere's native vertical nudge. */
function up_prepareTalkWavMove(partNumber, channelIndex) {
    var __log = [];
    try {
        var podcastNumber = up_mc_podcastNumber(app.project.name);
        var sequence = up_mc_findSequence("TALK-" + podcastNumber);
        if (!sequence) {
            return up_result(false, "TALK-" + podcastNumber + " was not found.", __log);
        }
        try { app.project.openSequence(sequence.sequenceID); } catch (openError) {}
        var part = Number(partNumber);
        if (part !== 1 && part !== 2) {
            return up_result(false, "Unknown WAV part: " + partNumber, __log);
        }
        var channel = Number(channelIndex);
        if (channel < 0 || channel > 2 || Math.floor(channel) !== channel) {
            return up_result(false, "Unknown WAV channel index: " + channelIndex, __log);
        }

        var expectedTracks = part === 1 ? [1, 2, 3] : [4, 5, 6];
        var sourceTrackIndex = expectedTracks[channel];
        if (sourceTrackIndex >= sequence.audioTracks.numTracks) {
            return up_result(false, "Expected WAV P" + part + " on A" +
                (sourceTrackIndex + 1) + ".", __log);
        }
        var selectedClip = up_mc_findWavPartOnTrack(
            sequence.audioTracks[sourceTrackIndex], part
        );
        if (!selectedClip) {
            return up_result(false, "Expected WAV P" + part + " channel " +
                (channel + 1) + " on A" + (sourceTrackIndex + 1) +
                ". Recreate the TALK multicam before retrying.", __log);
        }

        var targetSeconds;
        if (part === 1) {
            if (channel === 0) {
                var syncClips = up_mc_findSyncMp3Clips(sequence);
                if (syncClips.length > 0) {
                    var syncSeconds = Number(syncClips[0].start.seconds);
                    up_mc_getOrCreateZencastrSyncMarker(sequence, syncSeconds, __log);
                    var syncPath = up_mc_trackItemMediaPath(syncClips[0]);
                    up_mc_removeAudioPathOutsideTrack(sequence, syncPath, -1);
                    __log.push("Captured the sync marker and removed the MP3 reference.");
                }
            }
            targetSeconds = Number(selectedClip.start.seconds);
        } else {
            var p1End = up_mc_originalPartEnd(sequence, 1, [0, 1, 2]);
            if (isNaN(p1End)) {
                return up_result(false, "Could not determine WAV P1 end time.", __log);
            }
            targetSeconds = p1End;
            if (channel === 0) {
                var partClips = [];
                for (var e = 0; e < expectedTracks.length; e++) {
                    var p2Clip = up_mc_findWavPartOnTrack(
                        sequence.audioTracks[expectedTracks[e]], part
                    );
                    if (!p2Clip) {
                        return up_result(false, "Expected all WAV P2 channels on " +
                            "A5-A7 before timing them.", __log);
                    }
                    partClips.push(p2Clip);
                }
                up_mc_getOrCreateNamedMarker(
                    sequence,
                    UP_MULTICAM_SETUP.wavPartTwoMarkerName,
                    p1End,
                    "P2 begins at the intact P1 timeline end",
                    __log
                );
                var shiftSeconds = targetSeconds - Number(partClips[0].start.seconds);
                if (!up_mc_timesMatch(shiftSeconds, 0)) {
                    var moveBy = new Time();
                    moveBy.seconds = shiftSeconds;
                    for (var m = 0; m < partClips.length; m++) {
                        var moveResult = partClips[m].move(moveBy);
                        if (moveResult !== 0) {
                            return up_result(false, "Premiere could not move WAV P2 " +
                                "to the P1 endpoint.", __log);
                        }
                    }
                    __log.push("Moved WAV P2 horizontally to the P1 endpoint at " +
                        targetSeconds.toFixed(3) + " seconds.");
                }
            } else if (!up_mc_timesMatch(
                    Number(selectedClip.start.seconds), targetSeconds)) {
                return up_result(false, "WAV P2 channels no longer share the same " +
                    "timeline start.", __log);
            }
        }

        up_mc_clearTimelineSelection(sequence);
        selectedClip.setSelected(1, 1);
        UP_TALK_WAV_MOVE_SESSION = {
            sequenceID: sequence.sequenceID,
            part: part,
            channel: channel,
            mediaPath: up_mc_trackItemMediaPath(selectedClip),
            targetSeconds: targetSeconds,
            duration: up_mc_trackItemDurationSeconds(selectedClip)
        };
        __log.push("Selected WAV P" + part + " channel " + (channel + 1) +
            " on A" + (expectedTracks[channel] + 1) + ".");
        return up_result(true, "Prepared WAV P" + part + " channel " +
            (channel + 1) + " track move.", __log);
    } catch (e) {
        return up_result(false, "Prepare WAV move error: " + e.toString(), __log);
    }
}

function up_verifyTalkWavMove(partNumber, channelIndex) {
    var __log = [];
    try {
        var session = UP_TALK_WAV_MOVE_SESSION;
        if (!session || session.part !== Number(partNumber) ||
                session.channel !== Number(channelIndex)) {
            return up_result(false, "No prepared WAV move session.", __log);
        }
        var sequence = up_mc_findSequenceByID(session.sequenceID);
        if (!sequence) { return up_result(false, "TALK sequence was not found.", __log); }
        var clip = up_mc_findTrackClipAtTime(
            sequence.audioTracks[session.channel],
            session.mediaPath,
            session.targetSeconds
        );
        if (!clip || !up_mc_timesMatch(
                up_mc_trackItemDurationSeconds(clip), session.duration)) {
            return up_result(false, "Premiere did not move WAV P" + session.part +
                " channel " + (session.channel + 1) + " onto A" +
                (session.channel + 1) + ".", __log);
        }
        return up_result(true, "WAV P" + session.part + " channel " +
            (session.channel + 1) + " reached A" + (session.channel + 1) + ".", __log);
    } catch (e) {
        return up_result(false, "Verify WAV move error: " + e.toString(), __log);
    }
}

function up_mc_originalPartEnd(sequence, part, trackIndexes) {
    var end = NaN;
    for (var i = 0; i < trackIndexes.length; i++) {
        var track = sequence.audioTracks[trackIndexes[i]];
        for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            if (up_mc_wavPartNumber(clip.projectItem) === part) {
                var clipEnd = Number(clip.end.seconds);
                if (isNaN(end) || clipEnd > end) { end = clipEnd; }
            }
        }
    }
    return end;
}

function up_mc_findWavPartOnTrack(track, part) {
    if (!track || !track.clips) { return null; }
    for (var c = 0; c < track.clips.numItems; c++) {
        var candidate = track.clips[c];
        var ext = up_fileExtension(up_mc_trackItemMediaPath(candidate));
        if ((ext === "wav" || ext === "wave") &&
                up_mc_wavPartNumber(candidate.projectItem) === part) {
            return candidate;
        }
    }
    return null;
}

function up_mc_clearTimelineSelection(sequence) {
    var groups = [sequence.audioTracks, sequence.videoTracks];
    for (var g = 0; g < groups.length; g++) {
        for (var t = 0; t < groups[g].numTracks; t++) {
            var clips = groups[g][t].clips;
            for (var c = 0; c < clips.numItems; c++) {
                try { clips[c].setSelected(0, 0); } catch (selectionError) {}
            }
        }
    }
}

function up_previewEpisodeMulticams() {
    var __log = [];
    try {
        var context = up_mc_getContext();
        if (!context.ok) {
            return up_result(false, context.message, __log);
        }

        var introName = "INTRO-" + context.podcastNumber;
        var talkName = "TALK-" + context.podcastNumber;
        var introExists = up_mc_sequenceExists(introName);
        var talkExists = up_mc_sequenceExists(talkName);
        var pending = [];

        if (introExists) {
            __log.push(introName + " already exists; it will be skipped.");
        } else {
            var intro = up_mc_buildGroup("intro", context);
            if (!intro.ok) {
                return up_result(false, intro.message, __log);
            }
            up_mc_logGroup(intro, __log);
            pending.push(introName);
        }

        if (talkExists) {
            __log.push(talkName + " already exists; it will be skipped.");
        } else {
            var talk = up_mc_buildGroup("talk", context);
            if (!talk.ok) {
                return up_result(false, talk.message, __log);
            }
            up_mc_logGroup(talk, __log);
            pending.push(talkName);
        }

        return up_result(true, pending.length > 0 ?
            "Ready to create " + pending.join(" and ") + "." :
            "INTRO and TALK multicams already exist; nothing to create.",
            __log);
    } catch (e) {
        var where = e.line ? (" (line " + e.line + ")") : "";
        return up_result(false,
            "Multicam preview error: " + e.toString() + where,
            __log);
    }
}

function up_prepareEpisodeMulticam(groupKey) {
    var __log = [];
    try {
        var context = up_mc_getContext();
        if (!context.ok) {
            return up_result(false, context.message, __log);
        }
        var normalizedKey = String(groupKey || "").toLowerCase();
        if (normalizedKey !== "intro" && normalizedKey !== "talk") {
            return up_result(false, "Unknown multicam group: " + groupKey, __log);
        }
        var expectedName = normalizedKey.toUpperCase() + "-" +
            context.podcastNumber;
        if (up_mc_sequenceExists(expectedName)) {
            return up_result(true,
                "Skipped existing multicam source sequence " + expectedName + ".",
                __log);
        }
        var group = up_mc_buildGroup(groupKey, context);
        if (!group.ok) {
            return up_result(false, group.message, __log);
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

        app.setProjectViewSelection(up_mc_projectItems(group.items), viewID);
        if (typeof app.getCurrentProjectViewSelection === "function") {
            var selected = app.getCurrentProjectViewSelection();
            if (!selected || selected.length !== group.items.length) {
                return up_result(false,
                    "Premiere did not preserve the complete multicam selection.",
                    __log);
            }
            var firstSelectedPath = up_getProjectItemMediaPath(selected[0]);
            if (up_normalizeMediaPath(firstSelectedPath) !==
                    up_normalizeMediaPath(group.items[0].mediaPath)) {
                return up_result(false,
                    "Premiere did not preserve CAM1 as the first selected source.",
                    __log);
            }
        }
        up_mc_logGroup(group, __log);
        __log.push("Selected " + group.items.length +
            " Project item(s); CAM1 is first.");
        return up_result(true,
            "Prepared " + group.sequenceName + " with " +
                group.items.length + " source(s).",
            __log);
    } catch (e) {
        var where = e.line ? (" (line " + e.line + ")") : "";
        return up_result(false,
            "Multicam selection error: " + e.toString() + where,
            __log);
    }
}

function up_verifyEpisodeMulticam(groupKey) {
    var __log = [];
    try {
        if (!app.project) {
            return up_result(false, "No open Premiere project.", __log);
        }
        var podcastNumber = up_mc_podcastNumber(app.project.name);
        if (!podcastNumber) {
            return up_result(false,
                "Could not extract PODCAST### from the project filename.",
                __log);
        }
        var normalizedKey = String(groupKey || "").toLowerCase();
        if (normalizedKey !== "intro" && normalizedKey !== "talk") {
            return up_result(false, "Unknown multicam group: " + groupKey, __log);
        }
        var sequenceName = normalizedKey.toUpperCase() + "-" + podcastNumber;
        if (!up_mc_sequenceExists(sequenceName)) {
            return up_result(false,
                'Waiting for Premiere to create sequence "' + sequenceName + '".',
                __log);
        }
        return up_result(true,
            "Verified multicam source sequence " + sequenceName + ".",
            __log);
    } catch (e) {
        return up_result(false,
            "Multicam verification error: " + e.toString(),
            __log);
    }
}

/** Open both completed multicam source sequences as Timeline tabs. */
function up_openEpisodeMulticams() {
    var __log = [];
    try {
        if (!app.project) {
            return up_result(false, "No open Premiere project.", __log);
        }
        var podcastNumber = up_mc_podcastNumber(app.project.name);
        if (!podcastNumber) {
            return up_result(false,
                "Could not extract PODCAST### from the project filename.",
                __log);
        }
        var introName = "INTRO-" + podcastNumber;
        var talkName = "TALK-" + podcastNumber;
        var intro = up_mc_findSequence(introName);
        var talk = up_mc_findSequence(talkName);
        if (!intro || !talk) {
            return up_result(false,
                "Could not open multicam timelines because " +
                    (!intro ? introName : talkName) + " was not found.",
                __log);
        }

        // Opening INTRO first and TALK second keeps both tabs available while
        // leaving the main TALK multicam active for the editor.
        app.project.openSequence(intro.sequenceID);
        app.project.openSequence(talk.sequenceID);
        __log.push("Opened " + introName + " and " + talkName + " as Timeline tabs.");
        return up_result(true,
            "Opened both episode multicam timelines; " + talkName + " is active.",
            __log);
    } catch (e) {
        var where = e.line ? (" (line " + e.line + ")") : "";
        return up_result(false,
            "Open multicam timelines error: " + e.toString() + where,
            __log);
    }
}

/** Determine the native tracks required before TALK sidecar placement. */
function up_prepareTalkTrackLayout() {
    var response = {
        ok: false,
        message: "",
        log: "",
        sequenceName: "",
        videoTracksToAdd: 0,
        audioTracksToAdd: 0,
        audioAfterTrack: 0,
        trackSetupNeeded: false
    };
    try {
        if (!app.project) {
            response.message = "No open Premiere project.";
            return up_mc_trackLayoutJSON(response);
        }
        var podcastNumber = up_mc_podcastNumber(app.project.name);
        response.sequenceName = "TALK-" + podcastNumber;
        var sequence = up_mc_findSequence(response.sequenceName);
        if (!sequence) {
            response.message = 'Sequence "' + response.sequenceName + '" was not found.';
            return up_mc_trackLayoutJSON(response);
        }

        var cameraTracks = up_mc_cameraTrackPositions(sequence);
        var compact = cameraTracks[1] === 0 && cameraTracks[2] === 1 &&
            cameraTracks[3] === 2 && cameraTracks[4] === 3;
        var arranged = cameraTracks[1] === 0 && cameraTracks[2] === 2 &&
            cameraTracks[3] === 3 && cameraTracks[4] === 4;
        var zencastrTrack = up_mc_zencastrVideoTrack(sequence);

        if (arranged && zencastrTrack === 1) {
            response.videoTracksToAdd = 0;
        } else if (compact && zencastrTrack === -1) {
            response.videoTracksToAdd = 1;
        } else if (arranged && zencastrTrack === -1) {
            response.videoTracksToAdd = 0;
        } else {
            response.message = "TALK video tracks are not in a safe CAM1-CAM4 layout; " +
                "no tracks were changed.";
            return up_mc_trackLayoutJSON(response);
        }

        // The sync MP3 already occupies A1. Finish TALK captures its start as
        // a marker, removes it, then reuses existing A1-A4 for WAV/Zencastr.
        response.audioAfterTrack = 0;
        response.audioTracksToAdd = 0;
        response.trackSetupNeeded = response.videoTracksToAdd > 0 ||
            response.audioTracksToAdd > 0;
        response.ok = true;
        response.message = response.trackSetupNeeded ?
            "Preparing TALK tracks: add " + response.videoTracksToAdd +
                " video track after V1." :
            "TALK already has the required V1-V5 video structure.";

        try { app.project.openSequence(sequence.sequenceID); } catch (openError) {}
        return up_mc_trackLayoutJSON(response);
    } catch (e) {
        response.message = "TALK track-layout error: " + e.toString();
        return up_mc_trackLayoutJSON(response);
    }
}

function up_mc_trackLayoutJSON(response) {
    return '{"ok":' + (response.ok ? "true" : "false") +
        ',"message":"' + up_escapeJSON(response.message) + '"' +
        ',"log":"' + up_escapeJSON(response.log || "") + '"' +
        ',"sequenceName":"' + up_escapeJSON(response.sequenceName || "") + '"' +
        ',"videoTracksToAdd":' + Number(response.videoTracksToAdd || 0) +
        ',"audioTracksToAdd":' + Number(response.audioTracksToAdd || 0) +
        ',"audioAfterTrack":' + Number(response.audioAfterTrack || 0) +
        ',"trackSetupNeeded":' + (response.trackSetupNeeded ? "true" : "false") +
        '}';
}

function up_mc_getContext() {
    if (!app.project) {
        return { ok: false, message: "No open Premiere project." };
    }
    if (!app.project.path) {
        return { ok: false, message: "Save the Premiere project before building multicams." };
    }

    var podcastNumber = up_mc_podcastNumber(app.project.name);
    if (!podcastNumber) {
        return {
            ok: false,
            message: "Could not extract PODCAST### from the project filename."
        };
    }
    var footageBin = up_findChildBin(
        app.project.rootItem,
        UP_MULTICAM_SETUP.footageBinName
    );
    if (!footageBin) {
        return { ok: false, message: 'No project bin named "Footage" found.' };
    }

    var media = [];
    var seenPaths = {};
    up_visitProjectItems(footageBin, function (item) {
        var mediaPath = up_getProjectItemMediaPath(item);
        if (!mediaPath) { return; }
        var ext = up_fileExtension(mediaPath);
        if (!UP_MULTICAM_SETUP.supportedExtensions[ext]) { return; }
        var pathKey = up_normalizeMediaPath(mediaPath);
        if (seenPaths[pathKey]) { return; }
        seenPaths[pathKey] = true;
        media.push({
            item: item,
            name: String(item.name || new File(mediaPath).name),
            mediaPath: mediaPath,
            ext: ext,
            normalizedName: up_mc_normalizedBase(item.name || new File(mediaPath).name)
        });
    });

    return {
        ok: true,
        podcastNumber: podcastNumber,
        podcastToken: "PODCAST" + podcastNumber,
        footageBin: footageBin,
        media: media
    };
}

function up_mc_buildGroup(groupKey, context) {
    var key = String(groupKey || "").toLowerCase();
    if (key !== "intro" && key !== "talk") {
        return { ok: false, message: "Unknown multicam group: " + groupKey };
    }

    var items = key === "intro" ?
        up_mc_introItems(context) : up_mc_talkItems(context);
    if (!items.ok) { return items; }

    var sequenceName = key.toUpperCase() + "-" + context.podcastNumber;
    var offline = [];
    var cam1Count = 0;
    var videoCount = 0;
    for (var i = 0; i < items.items.length; i++) {
        var source = items.items[i];
        if (up_mc_cameraNumber(source.normalizedName) === 1) { cam1Count++; }
        if (UP_MULTICAM_SETUP.videoExtensions[source.ext]) { videoCount++; }
        try {
            if (typeof source.item.isOffline === "function" && source.item.isOffline()) {
                offline.push(source.name);
            }
        } catch (e) {}
    }

    if (items.items.length < 2) {
        return {
            ok: false,
            message: sequenceName + " needs at least two matching source files."
        };
    }
    if (cam1Count !== 1) {
        return {
            ok: false,
            message: sequenceName + " requires exactly one CAM1 source; found " + cam1Count + "."
        };
    }
    if (videoCount < 2) {
        return {
            ok: false,
            message: sequenceName + " requires at least two video sources; found " +
                videoCount + "."
        };
    }
    if (offline.length > 0) {
        return {
            ok: false,
            message: sequenceName + " contains offline media: " + offline.join(", ") + "."
        };
    }

    items.items.sort(up_mc_compareSources);
    return {
        ok: true,
        key: key,
        label: key.toUpperCase(),
        sequenceName: sequenceName,
        stem: items.stem || "INTRO",
        items: items.items,
        zencastrSidecar: items.zencastrSidecar || null
    };
}

function up_mc_introItems(context) {
    var items = [];
    for (var i = 0; i < context.media.length; i++) {
        if (context.media[i].normalizedName.indexOf("INTRO") !== -1) {
            items.push(context.media[i]);
        }
    }
    return { ok: true, stem: "INTRO", items: items };
}

function up_mc_talkItems(context) {
    var cameras = [];
    var i;
    for (i = 0; i < context.media.length; i++) {
        var candidate = context.media[i];
        if (candidate.normalizedName.indexOf("INTRO") !== -1) { continue; }
        if (candidate.normalizedName.indexOf(context.podcastToken) === -1) { continue; }
        if (!UP_MULTICAM_SETUP.videoExtensions[candidate.ext]) { continue; }
        if (up_mc_cameraNumber(candidate.normalizedName) !== null) {
            cameras.push(candidate);
        }
    }
    if (cameras.length === 0) {
        return {
            ok: false,
            message: "No non-INTRO PODCAST" + context.podcastNumber +
                " CAM# video files were found."
        };
    }

    var stems = {};
    var stemList = [];
    for (i = 0; i < cameras.length; i++) {
        var stem = up_mc_cameraStem(cameras[i].normalizedName);
        if (!stems[stem]) {
            stems[stem] = true;
            stemList.push(stem);
        }
    }
    if (stemList.length !== 1) {
        return {
            ok: false,
            message: "Ambiguous TALK camera stems: " + stemList.join(", ") + "."
        };
    }

    var canonicalStem = stemList[0];
    var items = cameras.slice(0);
    var matchingZencastr = [];
    var fallbackZencastr = [];
    var matchingSyncAudio = [];
    var fallbackSyncAudio = [];
    var matchingEpisodeMp3 = [];
    for (i = 0; i < context.media.length; i++) {
        var media = context.media[i];
        if (media.normalizedName.indexOf("INTRO") !== -1) { continue; }
        if (up_mc_containsSource(items, media)) { continue; }

        if ((media.ext === "wav" || media.ext === "wave") &&
                media.normalizedName.indexOf(canonicalStem) === 0) {
            items.push(media);
            continue;
        }

        if (media.ext === "mp3") {
            var episodeMp3 = media.normalizedName.indexOf(canonicalStem) === 0 ||
                media.normalizedName.indexOf(context.podcastToken) !== -1;
            if (episodeMp3) { matchingEpisodeMp3.push(media); }
            if (up_mc_isSyncAudioName(media.normalizedName)) {
                fallbackSyncAudio.push(media);
                if (episodeMp3) { matchingSyncAudio.push(media); }
            }
            continue;
        }

        if (media.ext === "mov" && media.normalizedName.indexOf("ZENCASTR") !== -1) {
            fallbackZencastr.push(media);
            if (media.normalizedName.indexOf(canonicalStem) === 0 ||
                    media.normalizedName.indexOf(context.podcastToken) !== -1) {
                matchingZencastr.push(media);
            }
        }
    }

    var syncAudio = null;
    if (matchingSyncAudio.length > 1) {
        return {
            ok: false,
            message: "Multiple matching Zencastr sync MP3 files were found."
        };
    }
    if (matchingSyncAudio.length === 1) {
        syncAudio = matchingSyncAudio[0];
    } else if (fallbackSyncAudio.length === 1) {
        syncAudio = fallbackSyncAudio[0];
    } else if (fallbackSyncAudio.length > 1) {
        return {
            ok: false,
            message: "Multiple unmatched sync MP3 files were found; include the " +
                "PODCAST### or TALK camera stem in the intended filename."
        };
    } else if (matchingEpisodeMp3.length === 1) {
        // Some recorders/users name the proxy only with the episode stem. A
        // unique episode-matching MP3 is still safer than synchronizing the
        // intermittently unreliable Zencastr MOV directly.
        syncAudio = matchingEpisodeMp3[0];
    } else if (matchingEpisodeMp3.length > 1) {
        return {
            ok: false,
            message: "Multiple episode-matching MP3 files were found; include " +
                "AUDIO FOR SYNC or FORSYNC in the intended proxy filename."
        };
    }

    if (syncAudio) {
        items.push(syncAudio);
    }

    if (matchingZencastr.length > 1) {
        return { ok: false, message: "Multiple matching Zencastr MOV files were found." };
    }
    var zencastr = null;
    if (matchingZencastr.length === 1) {
        zencastr = matchingZencastr[0];
    } else if (fallbackZencastr.length === 1) {
        zencastr = fallbackZencastr[0];
    } else if (fallbackZencastr.length > 1) {
        return {
            ok: false,
            message: "Multiple unmatched Zencastr MOV files were found; rename the intended one " +
                "with the TALK camera stem."
        };
    }

    // When a dedicated sync MP3 exists, it is the reliable audio-analysis
    // proxy. Add the Zencastr MOV only after Premiere has synchronized the MP3;
    // this prevents the MOV's intermittent audio-analysis failure from
    // poisoning the native multicam operation.
    if (zencastr && !syncAudio) {
        items.push(zencastr);
    }

    return {
        ok: true,
        stem: canonicalStem,
        items: items,
        zencastrSidecar: syncAudio ? zencastr : null
    };
}

function up_mc_logGroup(group, log) {
    log.push(group.label + " group -> " + group.sequenceName +
        " (stem: " + group.stem + ")");
    for (var i = 0; i < group.items.length; i++) {
        var suffix = up_mc_cameraNumber(group.items[i].normalizedName) === 1 ?
            " [CAM1 reference]" : "";
        log.push("  " + (i + 1) + ". " + group.items[i].name + suffix);
    }
    if (group.zencastrSidecar) {
        log.push("  After sync: place " + group.zencastrSidecar.name +
            " at the sync MP3 start time.");
    }
}

function up_mc_projectItems(sources) {
    var items = [];
    for (var i = 0; i < sources.length; i++) { items.push(sources[i].item); }
    return items;
}

function up_mc_containsSource(sources, candidate) {
    var path = up_normalizeMediaPath(candidate.mediaPath);
    for (var i = 0; i < sources.length; i++) {
        if (up_normalizeMediaPath(sources[i].mediaPath) === path) { return true; }
    }
    return false;
}

function up_mc_compareSources(a, b) {
    var rankA = up_mc_sourceRank(a);
    var rankB = up_mc_sourceRank(b);
    if (rankA !== rankB) { return rankA - rankB; }
    var upperA = String(a.name).toUpperCase();
    var upperB = String(b.name).toUpperCase();
    if (upperA < upperB) { return -1; }
    if (upperA > upperB) { return 1; }
    return 0;
}

function up_mc_sourceRank(source) {
    var cameraNumber = up_mc_cameraNumber(source.normalizedName);
    if (cameraNumber !== null) { return cameraNumber; }
    if (source.normalizedName.indexOf("ZENCASTR") !== -1) { return 100; }
    if (UP_MULTICAM_SETUP.videoExtensions[source.ext]) { return 120; }
    var partMatch = source.normalizedName.match(/(?:^|-)P(?:ART)?-?(\d+)(?:-|$)/);
    return 200 + (partMatch ? Number(partMatch[1]) : 0);
}

function up_mc_isSyncAudioName(normalizedName) {
    var name = String(normalizedName || "");
    return name.indexOf("AUDIO-FOR-SYNC") !== -1 ||
        name.indexOf("AUDIOFORSYNC") !== -1 ||
        name.indexOf("FOR-SYNC") !== -1 ||
        name.indexOf("FORSYNC") !== -1 ||
        name.indexOf("4-SYNC") !== -1 ||
        name.indexOf("4SYNC") !== -1 ||
        name.indexOf("SYNC-AUDIO") !== -1 ||
        name.indexOf("SYNC-REFERENCE") !== -1 ||
        name.indexOf("SYNC-REF") !== -1 ||
        name.indexOf("SYNC-PROXY") !== -1 ||
        name.indexOf("ZENCASTR") !== -1;
}

function up_mc_cameraNumber(normalizedName) {
    var match = String(normalizedName || "").match(/(?:^|-)CAM(?:ERA)?-?(\d+)(?:-|$)/);
    return match ? Number(match[1]) : null;
}

function up_mc_cameraStem(normalizedName) {
    return String(normalizedName || "").replace(
        /-CAM(?:ERA)?-?\d+(?:-.*)?$/,
        ""
    );
}

function up_mc_normalizedBase(name) {
    var base = String(name || "").replace(/\.[^.]+$/, "").toUpperCase();
    base = base.replace(/[^A-Z0-9]+/g, "-");
    return base.replace(/^-+|-+$/g, "");
}

function up_mc_podcastNumber(projectName) {
    if (typeof up_episodeNumberFromProjectName === "function") {
        return up_episodeNumberFromProjectName(projectName);
    }
    var match = String(projectName || "").match(/(?:PODCAST|POD)[-_ ]*(\d+)/i);
    return match ? match[1] : "";
}

/**
 * Place a Zencastr MOV at the synchronized start of its dedicated MP3 proxy.
 * This runs after TALK-### exists and is safe to call repeatedly.
 */
function up_finalizeTalkMulticam() {
    var __log = [];
    var layoutPending = false;
    try {
        if (!app.project) {
            return up_result(false, "No open Premiere project.", __log);
        }
        var podcastNumber = up_mc_podcastNumber(app.project.name);
        if (!podcastNumber) {
            return up_result(false,
                "Could not extract PODCAST### from the project filename.",
                __log);
        }

        var sequenceName = "TALK-" + podcastNumber;
        var sequence = up_mc_findSequence(sequenceName);
        if (!sequence) {
            return up_result(false,
                'Sequence "' + sequenceName + '" was not found.',
                __log);
        }

        var movResult = up_mc_findTalkZencastrMov(podcastNumber);
        if (!movResult.ok) {
            return up_result(false, movResult.message, __log);
        }
        if (!movResult.source) {
            return up_result(true,
                "No Zencastr MOV found; MP3 sidecar placement was skipped.",
                __log);
        }

        var existingMov = up_mc_findSequenceClipByPath(
            sequence.videoTracks,
            movResult.source.mediaPath
        );

        var syncClips = up_mc_findSyncMp3Clips(sequence);
        if (syncClips.length === 0) {
            var savedSyncSeconds = up_mc_existingZencastrSyncMarkerSeconds(sequence);
            if (isNaN(savedSyncSeconds)) {
                return up_result(false,
                    sequenceName + " contains neither a sync MP3 nor an " +
                        UP_MULTICAM_SETUP.zencastrSyncMarkerName + " marker.",
                    __log);
            }
            __log.push("Using saved " + UP_MULTICAM_SETUP.zencastrSyncMarkerName +
                " marker at " + savedSyncSeconds.toFixed(3) + " seconds.");
        }
        var syncClip = syncClips.length > 0 ? syncClips[0] : null;
        if (syncClips.length > 1) {
            var canonicalPath = up_normalizeMediaPath(
                up_mc_trackItemMediaPath(syncClip)
            );
            var canonicalSeconds = Number(syncClip.start.seconds);
            var bottomTrackIndex = sequence.audioTracks.numTracks - 1;
            for (var duplicateIndex = 1;
                    duplicateIndex < syncClips.length;
                    duplicateIndex++) {
                var duplicate = syncClips[duplicateIndex];
                var duplicatePath = up_normalizeMediaPath(
                    up_mc_trackItemMediaPath(duplicate)
                );
                var duplicateSeconds = Number(duplicate.start.seconds);
                if (duplicatePath !== canonicalPath ||
                        isNaN(canonicalSeconds) || isNaN(duplicateSeconds) ||
                        !up_mc_timesMatch(duplicateSeconds, canonicalSeconds)) {
                    return up_result(false,
                        sequenceName + " contains multiple distinct sync MP3 clips; " +
                            "the Zencastr MOV start time is ambiguous.",
                        __log);
                }
                if (up_mc_trackIndexForClip(sequence.audioTracks, duplicate) ===
                        bottomTrackIndex) {
                    syncClip = duplicate;
                }
            }
            __log.push("Found duplicate copies of the same synchronized MP3; " +
                "the bottom copy will be retained.");
        }
        var syncMediaPath = syncClip ? up_mc_trackItemMediaPath(syncClip) : "";
        var syncSeconds = syncClip ? Number(syncClip.start.seconds) : savedSyncSeconds;
        if (syncClip) {
            if (isNaN(syncSeconds)) {
                return up_result(false,
                    "Could not read the synchronized MP3 start time.",
                    __log);
            }
            syncSeconds = up_mc_getOrCreateZencastrSyncMarker(
                sequence,
                syncSeconds,
                __log
            );
        }

        if (sequence.videoTracks.numTracks < 5 ||
                sequence.audioTracks.numTracks < 4) {
            return up_result(false,
                sequenceName + " does not yet have the required V1-V5/A1-A4 tracks.",
                __log);
        }

        var videoTrackIndex = 1; // V2, between CAM1 and CAM2
        var audioTrackIndex = 3; // A4
        try {
            app.project.openSequence(sequence.sequenceID);
        } catch (openError) {}

        // The MP3 is only an alignment reference. Once its start is persisted
        // as a sequence marker, remove every MP3 copy and free A1 for P1/P2.
        if (syncMediaPath) {
            up_mc_removeAudioPathOutsideTrack(sequence, syncMediaPath, -1);
            __log.push("Captured sync MP3 start and removed the reference clip.");
        }

        // Complete and verify the recorder layout before Zencastr is inserted.
        // P1/P2 share A1-A3, with each numbered part starting at the prior
        // part's end. Original WAV instances remain until this verifies.
        var wavs = up_mc_findAudioClipsByExtension(sequence, ["wav", "wave"]);
        if (!UP_TALK_LAYOUT_SESSION) {
            var recorderLayout = up_mc_recorderSourceLayout(sequence, wavs);
            __log.push("Recorder source layout: P1 on " +
                recorderLayout.p1.join("/") + "; P2 on " +
                recorderLayout.p2.join("/") + ".");
        }
        var audioResult = up_mc_placeThreeChannelWavs(sequence, wavs);
        if (!audioResult.ok) {
            return up_result(false, audioResult.message, __log);
        }
        if (audioResult.message) { __log.push(audioResult.message); }
        if (audioResult.pending) {
            return up_result(true,
                "Waiting for Premiere to refresh TALK placements.",
                __log);
        }
        var manualP1End = up_mc_originalPartEnd(sequence, 1, [0, 1, 2]);
        if (!isNaN(manualP1End)) {
            up_mc_getOrCreateNamedMarker(
                sequence,
                UP_MULTICAM_SETUP.wavPartTwoMarkerName,
                manualP1End,
                "P2 begins at the intact P1 timeline end",
                __log
            );
        }
        __log.push("Verified recorder WAV P1/P2 sequentially on A1-A3.");
        up_mc_clearAudioTrackExcept(
            sequence.audioTracks[3],
            movResult.source.mediaPath,
            syncSeconds
        );
        __log.push("Cleared A4 for Zencastr audio.");

        if (existingMov) {
            var existingMovSeconds = Number(existingMov.start.seconds);
            if (!up_mc_timesMatch(existingMovSeconds, syncSeconds)) {
                try {
                    existingMov.remove(0, 0);
                    existingMov = null;
                    __log.push("Removed an earlier Zencastr video copy at the " +
                        "wrong timeline position.");
                } catch (existingMovRemoveError) {
                    __log.push("WARNING: Could not remove the earlier Zencastr " +
                        "video copy before reinserting it.");
                }
            }
        }

        if (!existingMov) {
            // Tracks already exist; overwrite avoids rippling synchronized media.
            sequence.overwriteClip(
                movResult.source.item,
                String(syncSeconds),
                videoTrackIndex,
                audioTrackIndex
            );
        }
        var placed = up_mc_findSequenceClipByPath(
            sequence.videoTracks,
            movResult.source.mediaPath
        );
        if (!placed) {
            return up_result(false,
                "Premiere did not place the Zencastr MOV on V2. " +
                    "Open " + sequenceName + " and place " + movResult.source.name +
                    " at " + syncSeconds.toFixed(3) + " seconds.",
                __log);
        }

        var placedSeconds = Number(placed.start.seconds);
        if (!up_mc_timesMatch(placedSeconds, syncSeconds)) {
            __log.push("WARNING: Premiere has not refreshed the Zencastr video " +
                "start in the scripting DOM yet; expected " +
                syncSeconds.toFixed(3) + " seconds. Continuing.");
            layoutPending = true;
        }

        var cameraTracks = up_mc_cameraTrackPositions(sequence);
        if (cameraTracks[1] !== 0 || cameraTracks[2] !== 2 ||
                cameraTracks[3] !== 3 || cameraTracks[4] !== 4 ||
                up_mc_zencastrVideoTrack(sequence) !== 1) {
            return up_result(false,
                "TALK video layout verification failed; expected CAM1/Zencastr/" +
                    "CAM2/CAM3/CAM4 on V1-V5.",
                __log);
        }

        if (!up_mc_trackHasPathAtTime(
                sequence.audioTracks[3], movResult.source.mediaPath, syncSeconds)) {
            up_mc_removeAudioPathAtWrongTimes(
                sequence.audioTracks[3],
                movResult.source.mediaPath,
                syncSeconds
            );
            sequence.audioTracks[3].overwriteClip(
                movResult.source.item,
                up_mc_secondsToTicks(syncSeconds)
            );
        }
        if (!up_mc_trackHasPathAtTime(
                sequence.audioTracks[3],
                movResult.source.mediaPath,
                syncSeconds
            )) {
            __log.push("WARNING: Premiere has not refreshed Zencastr audio on " +
                "A4 in the scripting DOM yet; continuing.");
            layoutPending = true;
        }
        up_mc_removeAudioPathOutsideTrack(sequence, movResult.source.mediaPath, 3);

        var movAudio = up_mc_findSequenceClipByPath(
            sequence.audioTracks,
            movResult.source.mediaPath
        );
        if (!movAudio || up_mc_trackIndexForClip(sequence.audioTracks, movAudio) !== 3) {
            __log.push("WARNING: Zencastr audio placement on A4 is awaiting " +
                "Premiere's timeline refresh.");
            layoutPending = true;
        }

        __log.push("Sync MP3 starts at " + syncSeconds.toFixed(3) + " seconds.");
        __log.push("Video: CAM1 / Zencastr / CAM2 / CAM3 / CAM4 on V1-V5.");
        __log.push("Audio: WAV P1/P2 share A1-A3; Zencastr MOV audio is on A4.");
        return up_result(true, layoutPending ?
            "Waiting for Premiere to refresh TALK placements." :
            "Aligned and organized Zencastr media in " + sequenceName + ".",
            __log);
    } catch (e) {
        var where = e.line ? (" (line " + e.line + ")") : "";
        return up_result(false,
            "Zencastr sidecar placement error: " + e.toString() + where,
            __log);
    }
}

/**
 * Persist the audio-synchronized Zencastr alignment independently of track
 * moves. Subsequent layout passes use this sequence marker as their authority.
 */
function up_mc_getOrCreateZencastrSyncMarker(sequence, fallbackSeconds, log) {
    try {
        var markers = sequence.markers;
        if (!markers) { return fallbackSeconds; }
        var existingSeconds = up_mc_existingZencastrSyncMarkerSeconds(sequence);
        if (!isNaN(existingSeconds)) {
            log.push("Using " + UP_MULTICAM_SETUP.zencastrSyncMarkerName +
                " marker at " + existingSeconds.toFixed(3) + " seconds.");
            return existingSeconds;
        }
        var created = markers.createMarker(fallbackSeconds);
        if (created) {
            created.name = UP_MULTICAM_SETUP.zencastrSyncMarkerName;
            try {
                created.comments = "Source: synchronized Zencastr MP3";
            } catch (commentError) {}
            log.push("Created " + UP_MULTICAM_SETUP.zencastrSyncMarkerName +
                " marker at " + Number(fallbackSeconds).toFixed(3) + " seconds.");
        }
    } catch (markerError) {
        log.push("WARNING: Could not create the Zencastr sync marker; " +
            "the captured MP3 time will be used for this pass.");
    }
    return fallbackSeconds;
}

function up_mc_getOrCreateNamedMarker(sequence, markerName, seconds, comments, log) {
    try {
        var markers = sequence.markers;
        if (!markers) { return seconds; }
        var marker = markers.getFirstMarker();
        var guard = 0;
        while (marker && guard < 10000) {
            if (String(marker.name || "") === markerName) {
                var existingSeconds = up_mc_markerSeconds(marker);
                if (!isNaN(existingSeconds) && up_mc_timesMatch(existingSeconds, seconds)) {
                    if (log) {
                        log.push("Using " + markerName + " marker at " +
                            Number(seconds).toFixed(3) + " seconds.");
                    }
                    return existingSeconds;
                }
            }
            marker = markers.getNextMarker(marker);
            guard++;
        }
        var created = markers.createMarker(seconds);
        if (created) {
            created.name = markerName;
            try { created.comments = comments || ""; } catch (commentError) {}
            if (log) {
                log.push("Created " + markerName + " marker at " +
                    Number(seconds).toFixed(3) + " seconds.");
            }
        }
    } catch (markerError) {
        if (log) { log.push("WARNING: Could not create " + markerName + " marker."); }
    }
    return seconds;
}

function up_mc_existingZencastrSyncMarkerSeconds(sequence) {
    try {
        var markers = sequence.markers;
        if (!markers) { return NaN; }
        var marker = markers.getFirstMarker();
        var guard = 0;
        while (marker && guard < 10000) {
            if (String(marker.name || "") ===
                    UP_MULTICAM_SETUP.zencastrSyncMarkerName) {
                var seconds = up_mc_markerSeconds(marker);
                if (!isNaN(seconds)) { return seconds; }
            }
            marker = markers.getNextMarker(marker);
            guard++;
        }
    } catch (markerError) {}
    return NaN;
}

function up_mc_markerSeconds(marker) {
    try {
        var seconds = Number(marker.start.seconds);
        if (!isNaN(seconds)) { return seconds; }
    } catch (timeError) {}
    var direct = Number(marker.start);
    return isNaN(direct) ? NaN : direct;
}

/** Track.overwriteClip expects a tick string, unlike Sequence.overwriteClip. */
function up_mc_secondsToTicks(seconds) {
    return String(Math.round(Number(seconds) * 254016000000));
}

function up_mc_removeAudioPathAtWrongTimes(track, mediaPath, keepSeconds) {
    var expected = up_normalizeMediaPath(mediaPath);
    for (var c = track.clips.numItems - 1; c >= 0; c--) {
        var clip = track.clips[c];
        var clipSeconds = Number(clip.start.seconds);
        if (up_normalizeMediaPath(up_mc_trackItemMediaPath(clip)) === expected &&
                !up_mc_timesMatch(clipSeconds, keepSeconds)) {
            try { clip.remove(0, 0); } catch (removeError) {}
        }
    }
}

function up_mc_clearAudioTrackExcept(track, keepMediaPath, keepSeconds) {
    var expected = up_normalizeMediaPath(keepMediaPath);
    for (var c = track.clips.numItems - 1; c >= 0; c--) {
        var clip = track.clips[c];
        var clipPath = up_normalizeMediaPath(up_mc_trackItemMediaPath(clip));
        if (clipPath !== expected ||
                !up_mc_timesMatch(Number(clip.start.seconds), keepSeconds)) {
            try { clip.remove(0, 0); } catch (removeError) {}
        }
    }
}

function up_mc_timesMatch(leftSeconds, rightSeconds) {
    var left = Number(leftSeconds);
    var right = Number(rightSeconds);
    return !isNaN(left) && !isNaN(right) &&
        Math.abs(left - right) <= UP_MULTICAM_SETUP.timeToleranceSeconds;
}

function up_mc_removeAudioPathOutsideTrack(sequence, mediaPath, keepTrackIndex) {
    var expected = up_normalizeMediaPath(mediaPath);
    for (var t = sequence.audioTracks.numTracks - 1; t >= 0; t--) {
        if (t === keepTrackIndex) { continue; }
        var track = sequence.audioTracks[t];
        for (var c = track.clips.numItems - 1; c >= 0; c--) {
            if (up_normalizeMediaPath(up_mc_trackItemMediaPath(track.clips[c])) ===
                    expected) {
                try { track.clips[c].remove(0, 0); } catch (removeError) {}
            }
        }
    }
}

function up_mc_cameraTrackPositions(sequence) {
    var positions = {};
    for (var t = 0; t < sequence.videoTracks.numTracks; t++) {
        var track = sequence.videoTracks[t];
        for (var c = 0; c < track.clips.numItems; c++) {
            var item = track.clips[c].projectItem;
            var normalized = up_mc_normalizedBase(item ? item.name : "");
            var camera = up_mc_cameraNumber(normalized);
            if (camera !== null && positions[camera] === undefined) {
                positions[camera] = t;
            }
        }
    }
    return positions;
}

function up_mc_zencastrVideoTrack(sequence) {
    for (var t = 0; t < sequence.videoTracks.numTracks; t++) {
        var track = sequence.videoTracks[t];
        for (var c = 0; c < track.clips.numItems; c++) {
            var item = track.clips[c].projectItem;
            var normalized = up_mc_normalizedBase(item ? item.name : "");
            if (normalized.indexOf("ZENCASTR") !== -1 &&
                    up_fileExtension(up_mc_trackItemMediaPath(track.clips[c])) === "mov") {
                return t;
            }
        }
    }
    return -1;
}

function up_mc_findAudioClipsByExtension(sequence, extensions) {
    var found = [];
    for (var t = 0; t < sequence.audioTracks.numTracks; t++) {
        var track = sequence.audioTracks[t];
        for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            var ext = up_fileExtension(up_mc_trackItemMediaPath(clip));
            for (var e = 0; e < extensions.length; e++) {
                if (ext === extensions[e]) {
                    found.push(clip);
                    break;
                }
            }
        }
    }
    return found;
}

function up_mc_recorderSourceLayout(sequence, clips) {
    var result = { p1: [], p2: [] };
    for (var i = 0; i < clips.length; i++) {
        var part = up_mc_wavPartNumber(clips[i].projectItem);
        var trackIndex = up_mc_trackIndexForClip(sequence.audioTracks, clips[i]);
        var label = "A" + (trackIndex + 1);
        var destination = part === 1 ? result.p1 : (part === 2 ? result.p2 : null);
        if (destination && destination.indexOf(label) === -1) {
            destination.push(label);
        }
    }
    return result;
}

function up_mc_placeThreeChannelWavs(sequence, clips) {
    var sources = [];
    var sourceByPath = {};
    var i;
    if (clips && clips.length > 0) {
        for (i = 0; i < clips.length; i++) {
            var mediaPath = up_mc_trackItemMediaPath(clips[i]);
            var seconds = Number(clips[i].start.seconds);
            var key = up_normalizeMediaPath(mediaPath);
            var duration = up_mc_trackItemDurationSeconds(clips[i]);
            if (sourceByPath[key]) {
                if (duration > sourceByPath[key].duration) {
                    sourceByPath[key].duration = duration;
                }
                continue;
            }
            var source = {
                projectItem: clips[i].projectItem,
                mediaPath: mediaPath,
                seconds: seconds,
                duration: duration,
                sourceIn: up_mc_trackItemSourceSeconds(clips[i], "inPoint"),
                sourceOut: up_mc_trackItemSourceSeconds(clips[i], "outPoint"),
                part: up_mc_wavPartNumber(clips[i].projectItem)
            };
            sourceByPath[key] = source;
            sources.push(source);
        }
    } else if (UP_TALK_LAYOUT_SESSION &&
            UP_TALK_LAYOUT_SESSION.sequenceID === sequence.sequenceID &&
            UP_TALK_LAYOUT_SESSION.wavSources.length > 0) {
        sources = UP_TALK_LAYOUT_SESSION.wavSources;
        for (i = 0; i < sources.length; i++) {
            sourceByPath[up_normalizeMediaPath(sources[i].mediaPath)] = sources[i];
        }
    } else {
        return { ok: false, pending: false,
            message: "No recorder WAV clips were found. Restore or recreate the " +
                "TALK multicam before running Finish TALK Layout again." };
    }

    sources.sort(function (left, right) {
        if (left.part !== null && right.part !== null && left.part !== right.part) {
            return left.part - right.part;
        }
        if (left.part !== null && right.part === null) { return -1; }
        if (left.part === null && right.part !== null) { return 1; }
        return left.seconds - right.seconds;
    });

    var previousPart = null;
    var previousEnd = null;
    for (i = 0; i < sources.length; i++) {
        source = sources[i];
        source.targetSeconds = source.seconds;
        if (source.part !== null && previousPart !== null &&
                source.part === previousPart + 1 && previousEnd !== null) {
            source.targetSeconds = previousEnd;
        }
        previousPart = source.part;
        previousEnd = source.duration > 0 ?
            source.targetSeconds + source.duration : null;
    }

    UP_TALK_LAYOUT_SESSION = {
        sequenceID: sequence.sequenceID,
        wavSources: sources
    };

    // WAV placement is intentionally manual. Re-inserting ProjectItems with
    // overwriteClip can lose the synchronized TrackItems' original in/out
    // state, and CEP UI shortcuts cannot reliably act on ExtendScript's
    // internal selection. This function only recognizes the completed layout.
    var missingPlacements = [];
    for (i = 0; i < sources.length; i++) {
        source = sources[i];
        for (var target = 0; target < 3; target++) {
            var placedWav = up_mc_findTrackClipAtTime(
                    sequence.audioTracks[target],
                    source.mediaPath,
                    source.targetSeconds
                );
            if (!placedWav) {
                missingPlacements.push(source.projectItem.name + " on A" +
                    (target + 1));
                break;
            }
            var placedDuration = up_mc_trackItemDurationSeconds(placedWav);
            if (source.duration > 0 &&
                    !up_mc_timesMatch(placedDuration, source.duration)) {
                missingPlacements.push(source.projectItem.name + " on A" +
                    (target + 1) + " has the wrong duration");
                break;
            }
        }
    }

    if (missingPlacements.length > 0) {
        return {
            ok: false,
            pending: false,
            message: "Manual WAV layout needed: place P1 then P2 sequentially " +
                "on A1-A3 and click Finish TALK Layout again. Missing: " +
                missingPlacements.join(", ") + "."
        };
    }

    // Remove stale front-track copies at the old synchronized P2/P3 positions.
    // Each recorder part should exist only once per mono destination track.
    for (var frontTrack = 0; frontTrack < 3; frontTrack++) {
        var destination = sequence.audioTracks[frontTrack];
        for (var frontClip = destination.clips.numItems - 1; frontClip >= 0; frontClip--) {
            var destinationClip = destination.clips[frontClip];
            var destinationPath = up_normalizeMediaPath(
                up_mc_trackItemMediaPath(destinationClip)
            );
            var expectedSource = sourceByPath[destinationPath];
            if (expectedSource && !up_mc_timesMatch(
                    Number(destinationClip.start.seconds),
                    expectedSource.targetSeconds
                )) {
                try { destinationClip.remove(0, 0); } catch (frontRemoveError) {}
            }
        }
    }

    // Remove only the original WAV instances below the reserved A1-A3 area.
    var removedOriginals = 0;
    for (var t = sequence.audioTracks.numTracks - 1; t >= 3; t--) {
        var track = sequence.audioTracks[t];
        for (var c = track.clips.numItems - 1; c >= 0; c--) {
            var ext = up_fileExtension(up_mc_trackItemMediaPath(track.clips[c]));
            if (ext === "wav" || ext === "wave") {
                try {
                    track.clips[c].remove(0, 0);
                    removedOriginals++;
                } catch (removeError) {}
            }
        }
    }
    return {
        ok: true,
        pending: false,
        message: removedOriginals > 0 ?
            "Removed " + removedOriginals +
                " superseded WAV clip(s) from A4 and below." : ""
    };
}

function up_mc_wavPartNumber(projectItem) {
    var normalized = up_mc_normalizedBase(projectItem ? projectItem.name : "");
    var match = normalized.match(/(?:^|-)P(?:ART)?-?(\d+)(?:-|$)/);
    return match ? Number(match[1]) : null;
}

function up_mc_trackItemDurationSeconds(trackItem) {
    try {
        var start = Number(trackItem.start.seconds);
        var end = Number(trackItem.end.seconds);
        if (!isNaN(start) && !isNaN(end) && end > start) { return end - start; }
    } catch (e) {}
    return 0;
}

function up_mc_trackItemSourceSeconds(trackItem, propertyName) {
    try {
        var value = trackItem[propertyName];
        var seconds = Number(value.seconds);
        return isNaN(seconds) ? NaN : seconds;
    } catch (e) {}
    return NaN;
}

function up_mc_consolidateAudioClips(sequence, clips, targetTrackIndex) {
    if (!clips || clips.length === 0) {
        return { ok: false, message: "No source audio clips were found for A" +
            (targetTrackIndex + 1) + "." };
    }
    var snapshots = [];
    for (var i = 0; i < clips.length; i++) {
        snapshots.push({
            clip: clips[i],
            projectItem: clips[i].projectItem,
            seconds: Number(clips[i].start.seconds),
            sourceTrack: up_mc_trackIndexForClip(sequence.audioTracks, clips[i])
        });
    }

    for (i = 0; i < snapshots.length; i++) {
        var source = snapshots[i];
        if (source.sourceTrack === targetTrackIndex) { continue; }
        sequence.audioTracks[targetTrackIndex].overwriteClip(
            source.projectItem,
            up_mc_secondsToTicks(source.seconds)
        );
    }

    // Verify the destination copies before removing only the old WAV/MP3 copies.
    for (i = 0; i < snapshots.length; i++) {
        source = snapshots[i];
        if (!up_mc_trackHasPathAtTime(
                sequence.audioTracks[targetTrackIndex],
                up_getProjectItemMediaPath(source.projectItem),
                source.seconds
            )) {
            return { ok: false, message: "Premiere did not place " +
                source.projectItem.name + " on A" + (targetTrackIndex + 1) + "." };
        }
    }
    for (i = snapshots.length - 1; i >= 0; i--) {
        source = snapshots[i];
        if (source.sourceTrack !== targetTrackIndex) {
            try { source.clip.remove(0, 0); } catch (removeError) {}
        }
    }
    return { ok: true, message: "" };
}

function up_mc_trackHasPathAtTime(track, mediaPath, seconds) {
    return !!up_mc_findTrackClipAtTime(track, mediaPath, seconds);
}

function up_mc_findTrackClipAtTime(track, mediaPath, seconds) {
    var expected = up_normalizeMediaPath(mediaPath);
    for (var c = 0; c < track.clips.numItems; c++) {
        var clip = track.clips[c];
        if (up_normalizeMediaPath(up_mc_trackItemMediaPath(clip)) === expected &&
                up_mc_timesMatch(Number(clip.start.seconds), seconds)) {
            return clip;
        }
    }
    return null;
}

function up_mc_trackIndexForClip(tracks, targetClip) {
    for (var t = 0; t < tracks.numTracks; t++) {
        var track = tracks[t];
        for (var c = 0; c < track.clips.numItems; c++) {
            if (track.clips[c] === targetClip) { return t; }
        }
    }
    return -1;
}

function up_mc_findSequence(sequenceName) {
    if (!app.project || !app.project.sequences) { return null; }
    for (var i = 0; i < app.project.sequences.numSequences; i++) {
        if (String(app.project.sequences[i].name) === sequenceName) {
            return app.project.sequences[i];
        }
    }
    return null;
}

function up_mc_findSequenceByID(sequenceID) {
    if (!app.project || !app.project.sequences) { return null; }
    for (var i = 0; i < app.project.sequences.numSequences; i++) {
        if (String(app.project.sequences[i].sequenceID) === String(sequenceID)) {
            return app.project.sequences[i];
        }
    }
    return null;
}

function up_mc_findTalkZencastrMov(podcastNumber) {
    var podcastToken = "PODCAST" + podcastNumber;
    var matching = [];
    var fallback = [];
    var seenPaths = {};
    up_visitProjectItems(app.project.rootItem, function (item) {
        var mediaPath = up_getProjectItemMediaPath(item);
        if (!mediaPath || up_fileExtension(mediaPath) !== "mov") { return; }
        var normalizedName = up_mc_normalizedBase(item.name || new File(mediaPath).name);
        if (normalizedName.indexOf("ZENCASTR") === -1 ||
                normalizedName.indexOf("INTRO") !== -1) {
            return;
        }
        var pathKey = up_normalizeMediaPath(mediaPath);
        if (seenPaths[pathKey]) { return; }
        seenPaths[pathKey] = true;
        var source = {
            item: item,
            name: String(item.name || new File(mediaPath).name),
            mediaPath: mediaPath,
            normalizedName: normalizedName
        };
        fallback.push(source);
        if (normalizedName.indexOf(podcastToken) !== -1) {
            matching.push(source);
        }
    });

    if (matching.length > 1) {
        return { ok: false, message: "Multiple PODCAST" + podcastNumber +
            " Zencastr MOV files were found." };
    }
    if (matching.length === 1) { return { ok: true, source: matching[0] }; }
    if (fallback.length > 1) {
        return {
            ok: false,
            message: "Multiple unmatched Zencastr MOV files were found; include " +
                "PODCAST" + podcastNumber + " in the intended filename."
        };
    }
    return { ok: true, source: fallback.length === 1 ? fallback[0] : null };
}

function up_mc_findSyncMp3Clips(sequence) {
    var clips = [];
    for (var t = 0; t < sequence.audioTracks.numTracks; t++) {
        var track = sequence.audioTracks[t];
        for (var c = 0; c < track.clips.numItems; c++) {
            var trackItem = track.clips[c];
            var mediaPath = up_mc_trackItemMediaPath(trackItem);
            if (!mediaPath || up_fileExtension(mediaPath) !== "mp3") { continue; }
            var normalizedName = up_mc_normalizedBase(
                trackItem.projectItem ? trackItem.projectItem.name : new File(mediaPath).name
            );
            if (up_mc_isSyncAudioName(normalizedName)) { clips.push(trackItem); }
        }
    }
    return clips;
}

function up_mc_findSequenceClipByPath(tracks, mediaPath) {
    var expected = up_normalizeMediaPath(mediaPath);
    for (var t = 0; t < tracks.numTracks; t++) {
        var track = tracks[t];
        for (var c = 0; c < track.clips.numItems; c++) {
            var trackItem = track.clips[c];
            if (up_normalizeMediaPath(up_mc_trackItemMediaPath(trackItem)) === expected) {
                return trackItem;
            }
        }
    }
    return null;
}

function up_mc_trackItemMediaPath(trackItem) {
    try {
        return trackItem && trackItem.projectItem ?
            up_getProjectItemMediaPath(trackItem.projectItem) : "";
    } catch (e) {
        return "";
    }
}

function up_mc_sequenceExists(sequenceName) {
    return up_mc_findSequence(sequenceName) !== null;
}
