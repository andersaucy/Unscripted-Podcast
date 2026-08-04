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

        response.audioAfterTrack = 0;
        response.audioTracksToAdd = up_mc_audioFrontIsReserved(sequence) ? 0 : 5;
        response.trackSetupNeeded = response.videoTracksToAdd > 0 ||
            response.audioTracksToAdd > 0;
        response.ok = true;
        response.message = response.trackSetupNeeded ?
            "Preparing TALK tracks: add " + response.videoTracksToAdd +
                " video and " + response.audioTracksToAdd + " audio." :
            "TALK already has the required V1-V5/A1-A5 reserved structure.";

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
    for (i = 0; i < context.media.length; i++) {
        var media = context.media[i];
        if (media.normalizedName.indexOf("INTRO") !== -1) { continue; }
        if (up_mc_containsSource(items, media)) { continue; }

        if ((media.ext === "wav" || media.ext === "wave") &&
                media.normalizedName.indexOf(canonicalStem) === 0) {
            items.push(media);
            continue;
        }

        if (media.ext === "mp3" && up_mc_isSyncAudioName(media.normalizedName)) {
            fallbackSyncAudio.push(media);
            if (media.normalizedName.indexOf(canonicalStem) === 0 ||
                    media.normalizedName.indexOf(context.podcastToken) !== -1) {
                matchingSyncAudio.push(media);
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
            return up_result(false,
                sequenceName + " contains no AUDIO FOR SYNC or ZENCASTR MP3. " +
                    "The Zencastr MOV was not inserted.",
                __log);
        }
        if (syncClips.length > 1) {
            return up_result(false,
                sequenceName + " contains multiple sync MP3 clips; the Zencastr " +
                    "MOV start time is ambiguous.",
                __log);
        }

        var syncClip = syncClips[0];
        var syncProjectItem = syncClip.projectItem;
        var syncMediaPath = up_mc_trackItemMediaPath(syncClip);
        var syncSeconds = Number(syncClip.start.seconds);
        if (isNaN(syncSeconds)) {
            return up_result(false,
                "Could not read the synchronized MP3 start time.",
                __log);
        }

        if (sequence.videoTracks.numTracks < 5 ||
                sequence.audioTracks.numTracks < 5) {
            return up_result(false,
                sequenceName + " does not yet have the required V1-V5/A1-A5 tracks.",
                __log);
        }

        var videoTrackIndex = 1; // V2, between CAM1 and CAM2
        var audioTrackIndex = 4; // A5; A4 is the sync MP3 reference
        try {
            app.project.openSequence(sequence.sequenceID);
        } catch (openError) {}

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
        if (isNaN(placedSeconds) || Math.abs(placedSeconds - syncSeconds) > 0.001) {
            return up_result(false,
                "The Zencastr MOV was inserted but its start does not match the sync MP3. " +
                    "Expected " + syncSeconds.toFixed(3) + " seconds.",
                __log);
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

        var wavs = up_mc_findAudioClipsByExtension(sequence, ["wav", "wave"]);
        var audioResult = up_mc_placeThreeChannelWavs(sequence, wavs);
        if (!audioResult.ok) {
            return up_result(false, audioResult.message, __log);
        }
        // Rebuild A4/A5 from captured project items. This also migrates a
        // sequence produced by the earlier reversed A4-MOV/A5-MP3 layout.
        if (!up_mc_trackHasPathAtTime(
                sequence.audioTracks[3], syncMediaPath, syncSeconds)) {
            sequence.audioTracks[3].overwriteClip(
                syncProjectItem,
                String(syncSeconds)
            );
        }
        if (!up_mc_trackHasPathAtTime(
                sequence.audioTracks[4], movResult.source.mediaPath, syncSeconds)) {
            sequence.audioTracks[4].overwriteClip(
                movResult.source.item,
                String(syncSeconds)
            );
        }
        if (!up_mc_trackHasPathAtTime(
                sequence.audioTracks[3],
                syncMediaPath,
                syncSeconds
            )) {
            return up_result(false, "Premiere did not place the sync MP3 on A4.", __log);
        }
        if (!up_mc_trackHasPathAtTime(
                sequence.audioTracks[4],
                movResult.source.mediaPath,
                syncSeconds
            )) {
            return up_result(false, "Premiere did not place Zencastr MOV audio on A5.", __log);
        }
        up_mc_removeAudioPathOutsideTrack(sequence, syncMediaPath, 3);
        up_mc_removeAudioPathOutsideTrack(sequence, movResult.source.mediaPath, 4);

        var movAudio = up_mc_findSequenceClipByPath(
            sequence.audioTracks,
            movResult.source.mediaPath
        );
        if (!movAudio || up_mc_trackIndexForClip(sequence.audioTracks, movAudio) !== 4) {
            return up_result(false,
                "Zencastr MOV video was placed, but its audio was not found on A5.",
                __log);
        }

        __log.push("Sync MP3 starts at " + syncSeconds.toFixed(3) + " seconds.");
        __log.push("Video: CAM1 / Zencastr / CAM2 / CAM3 / CAM4 on V1-V5.");
        __log.push("Audio: WAV mono channels on A1-A3, sync MP3 on A4, " +
            "Zencastr MOV on A5; camera audio preserved on A6 and below.");
        return up_result(true,
            "Aligned and organized Zencastr media in " + sequenceName + ".",
            __log);
    } catch (e) {
        var where = e.line ? (" (line " + e.line + ")") : "";
        return up_result(false,
            "Zencastr sidecar placement error: " + e.toString() + where,
            __log);
    }
}

function up_mc_audioFrontIsReserved(sequence) {
    if (sequence.audioTracks.numTracks < 5) { return false; }
    for (var t = 0; t < 5; t++) {
        var track = sequence.audioTracks[t];
        for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            var path = up_mc_trackItemMediaPath(clip);
            var ext = up_fileExtension(path);
            var normalized = up_mc_normalizedBase(
                clip.projectItem ? clip.projectItem.name : ""
            );
            var isSyncMp3 = ext === "mp3" && up_mc_isSyncAudioName(normalized);
            var isZencastrMov = ext === "mov" &&
                normalized.indexOf("ZENCASTR") !== -1;
            var allowed = (t <= 2 && (ext === "wav" || ext === "wave")) ||
                ((t === 3 || t === 4) && (isSyncMp3 || isZencastrMov));
            if (!allowed) { return false; }
        }
    }
    return true;
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

function up_mc_placeThreeChannelWavs(sequence, clips) {
    if (!clips || clips.length === 0) {
        return { ok: false, message: "No recorder WAV clips were found for A1-A3." };
    }
    var sources = [];
    var seen = {};
    for (var i = 0; i < clips.length; i++) {
        var mediaPath = up_mc_trackItemMediaPath(clips[i]);
        var seconds = Number(clips[i].start.seconds);
        var key = up_normalizeMediaPath(mediaPath) + "@" + seconds.toFixed(6);
        if (seen[key]) { continue; }
        seen[key] = true;
        sources.push({
            projectItem: clips[i].projectItem,
            mediaPath: mediaPath,
            seconds: seconds
        });
    }

    for (i = 0; i < sources.length; i++) {
        var source = sources[i];
        var alreadyPlaced = true;
        for (var existingTarget = 0; existingTarget < 3; existingTarget++) {
            if (!up_mc_trackHasPathAtTime(
                    sequence.audioTracks[existingTarget],
                    source.mediaPath,
                    source.seconds
                )) {
                alreadyPlaced = false;
                break;
            }
        }
        if (alreadyPlaced) { continue; }
        // The saved WAV interpretation exposes three mono source clips. An
        // overwrite beginning at A1 fans those clips across A1, A2, and A3.
        sequence.overwriteClip(
            source.projectItem,
            String(source.seconds),
            0,
            0
        );
    }

    for (i = 0; i < sources.length; i++) {
        source = sources[i];
        for (var target = 0; target < 3; target++) {
            if (!up_mc_trackHasPathAtTime(
                    sequence.audioTracks[target],
                    source.mediaPath,
                    source.seconds
                )) {
                return { ok: false, message: "Premiere did not fan " +
                    source.projectItem.name + " across WAV tracks A1-A3." };
            }
        }
    }

    // Remove only the original WAV instances below the reserved A1-A3 area.
    for (var t = sequence.audioTracks.numTracks - 1; t >= 3; t--) {
        var track = sequence.audioTracks[t];
        for (var c = track.clips.numItems - 1; c >= 0; c--) {
            var ext = up_fileExtension(up_mc_trackItemMediaPath(track.clips[c]));
            if (ext === "wav" || ext === "wave") {
                try { track.clips[c].remove(0, 0); } catch (removeError) {}
            }
        }
    }
    return { ok: true, message: "" };
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
            String(source.seconds)
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
    var expected = up_normalizeMediaPath(mediaPath);
    for (var c = 0; c < track.clips.numItems; c++) {
        var clip = track.clips[c];
        if (up_normalizeMediaPath(up_mc_trackItemMediaPath(clip)) === expected &&
                Math.abs(Number(clip.start.seconds) - seconds) <= 0.001) {
            return true;
        }
    }
    return false;
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
