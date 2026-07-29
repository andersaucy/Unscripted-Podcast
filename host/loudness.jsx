/**
 * Unscripted-Podcast — "Normalize Dialogue" task (loudness).
 *
 * IMPORTANT — API limitation:
 *   Premiere's ExtendScript / QE DOM (and the current UXP `premierepro` API)
 *   do NOT expose any way to *measure* loudness (LUFS/LKFS) of a clip or track.
 *   There is no scriptable hook into the Loudness Radar, the Essential Sound
 *   panel's "Auto-Match", or the Audio Gain dialog's loudness readout.
 *
 *   So the measurement half of this feature is done OUTSIDE ExtendScript, in the
 *   panel's JavaScript (client/js/main.js) using ffmpeg's EBU R128 `loudnorm`
 *   analysis on each clip's underlying media file. ffmpeg ships nothing with
 *   Premiere; the panel resolves it from common install paths (Homebrew, etc.)
 *   and degrades gracefully with an explanation if it isn't found.
 *
 *   This module (ExtendScript) therefore only does the two things ExtendScript
 *   CAN do reliably:
 *     1. up_collectDialogueClips() — enumerate audio clips + their media paths
 *        and source in/out points, so the panel can analyze them with ffmpeg.
 *     2. up_applyTrackGain()       — apply a positive gain (dB) to every clip on
 *        a track via each clip's "Volume" component. (Premiere's Audio Track
 *        Mixer fader is not scriptable, so uniform per-clip gain stands in for
 *        "track gain" and is audibly equivalent.)
 *
 *   Because the API is measurement-blind, no gain is ever *reduced*: tracks that
 *   already sit at/above the threshold are left untouched.
 */

// =========================================================================
// CONFIG — tweak dialogue-track selection here. Loudness thresholds/targets
// live panel-side (client/js/main.js LOUDNESS) so they can be exposed in the
// GUI, but anything ExtendScript-specific is centralized here.
// =========================================================================
var UP_LOUDNESS = {
    // Which audio tracks count as "dialogue". Empty array = every audio track.
    // Example: [0, 1] limits analysis/gain to A1 and A2.
    dialogueTracks: [],
    // Hard ceiling on how much gain we will ever add to a track, in dB. Keeps a
    // pathologically quiet track from being boosted into distortion.
    maxGainDb: 12,
    // Volume "Level" is a linear amplitude multiplier internally; Premiere caps
    // a single Volume filter around +15 dB (≈5.62x). We clamp to stay in range.
    maxLevelMultiplier: 5.623
};

/**
 * Enumerate audio clips on the dialogue tracks of the active sequence so the
 * panel can measure each one with ffmpeg. Does not modify the project.
 *
 * @param {boolean} selectedOnly  when true, only include selected clips.
 * Returns JSON: {ok, message, log, clips:[{trackIndex, trackName, name,
 *   mediaPath, inSec, outSec, durationSec, analyzable, reason}]}.
 */
function up_collectDialogueClips(selectedOnly) {
    var __log = [];
    try {
        if (!app.project) {
            return up_result(false, "No open Premiere project.", __log);
        }
        var seq = app.project.activeSequence;
        if (!seq) {
            return up_result(false, "No active sequence \u2014 open a sequence first.", __log);
        }

        var wantSelectedOnly = (selectedOnly === true || selectedOnly === "true" || selectedOnly === 1 || selectedOnly === "1");
        var tracks = seq.audioTracks;
        var nTracks = tracks.numTracks;
        var restrict = (UP_LOUDNESS.dialogueTracks && UP_LOUDNESS.dialogueTracks.length > 0);
        var items = [];

        for (var ti = 0; ti < nTracks; ti++) {
            if (restrict && !up_arrayContains(UP_LOUDNESS.dialogueTracks, ti)) {
                continue;
            }
            var track = tracks[ti];
            var trackName = "A" + (ti + 1);

            for (var ci = 0; ci < track.clips.numItems; ci++) {
                var clip = track.clips[ci];
                if (wantSelectedOnly) {
                    var sel = false;
                    try { sel = clip.isSelected(); } catch (se) { sel = false; }
                    if (!sel) { continue; }
                }

                var mediaPath = "";
                var analyzable = true;
                var reason = "";
                try {
                    if (clip.projectItem && clip.projectItem.getMediaPath) {
                        mediaPath = clip.projectItem.getMediaPath();
                    }
                } catch (mp) { mediaPath = ""; }
                if (!mediaPath) {
                    analyzable = false;
                    reason = "no media path (synthetic tone, offline, or nested clip)";
                }

                var inSec = 0, outSec = 0;
                try { inSec = clip.inPoint.seconds; } catch (e1) {}
                try { outSec = clip.outPoint.seconds; } catch (e2) {}
                var durSec = outSec - inSec;
                if (analyzable && !(durSec > 0)) {
                    analyzable = false;
                    reason = "zero or invalid clip duration";
                }

                items.push({
                    trackIndex: ti,
                    trackName: trackName,
                    name: clip.name,
                    mediaPath: mediaPath,
                    inSec: inSec,
                    outSec: outSec,
                    durationSec: durSec,
                    analyzable: analyzable,
                    reason: reason
                });
            }
        }

        if (items.length === 0) {
            return up_result(false,
                wantSelectedOnly ? "No selected audio clips found on dialogue track(s)."
                                 : "No audio clips found on dialogue track(s).", __log);
        }

        __log.push("Collected " + items.length + " audio clip(s) across dialogue track(s).");
        return up_clipsResult(true, "Collected " + items.length + " clip(s).", __log, items);

    } catch (e) {
        var where = e.line ? (" (line " + e.line + ")") : "";
        return up_result(false, "Collect error: " + e.toString() + where, __log);
    }
}

/**
 * Apply a *positive* gain (in dB) to every clip on one audio track, via each
 * clip's "Volume" component "Level" property. Never reduces gain.
 *
 * @param {number} trackIndex  0-based audio track index.
 * @param {number} gainDb      dB to add (values <= 0 are a no-op).
 * Returns JSON: {ok, message, log}.
 */
function up_applyTrackGain(trackIndex, gainDb) {
    var __log = [];
    try {
        if (!app.project) {
            return up_result(false, "No open Premiere project.", __log);
        }
        var seq = app.project.activeSequence;
        if (!seq) {
            return up_result(false, "No active sequence.", __log);
        }

        var ti = parseInt(trackIndex, 10);
        var db = parseFloat(gainDb);
        if (isNaN(ti) || isNaN(db)) {
            return up_result(false, "Invalid track index or gain value.", __log);
        }
        if (ti < 0 || ti >= seq.audioTracks.numTracks) {
            return up_result(false, "Track index out of range: " + ti, __log);
        }
        if (db <= 0) {
            return up_result(true, "A" + (ti + 1) + ": no gain applied (requested " + db + " dB).", __log);
        }

        var mult = up_gainToLevelMultiplier(db);
        var track = seq.audioTracks[ti];
        var adjusted = 0;
        var skipped = 0;

        for (var ci = 0; ci < track.clips.numItems; ci++) {
            var clip = track.clips[ci];
            var volComp = up_findComponent(clip, ["Volume", "ADBE Volume"]);
            if (!volComp) {
                skipped++;
                __log.push("  - " + clip.name + ": no Volume component, skipped.");
                continue;
            }
            var levelProp = up_findProperty(volComp, ["Level", "ADBE Volume-0"]);
            if (!levelProp) {
                skipped++;
                __log.push("  - " + clip.name + ": no Level property, skipped.");
                continue;
            }

            try {
                var cur = 1.0;
                try {
                    var got = levelProp.getValue();
                    if (typeof got === "number" && !isNaN(got) && got > 0) { cur = got; }
                } catch (gv) { cur = 1.0; }

                var next = cur * mult;
                if (next > UP_LOUDNESS.maxLevelMultiplier) {
                    next = UP_LOUDNESS.maxLevelMultiplier;
                }
                // setValue(value, updateUI)
                levelProp.setValue(next, true);
                adjusted++;
            } catch (sv) {
                skipped++;
                __log.push("  - " + clip.name + ": could not set Level (" + sv.toString() + ").");
            }
        }

        var msg = "A" + (ti + 1) + ": +" + up_round1(db) + " dB applied to " +
            adjusted + " clip(s)" + (skipped ? (", " + skipped + " skipped") : "") + ".";
        __log.push(msg);
        return up_result(true, msg, __log);

    } catch (e) {
        var where = e.line ? (" (line " + e.line + ")") : "";
        return up_result(false, "Apply gain error: " + e.toString() + where, __log);
    }
}

// ---- Loudness helpers -----------------------------------------------------

/**
 * Convert a positive dB gain into the linear amplitude multiplier used by the
 * Volume "Level" property (Level 1.0 == 0 dB / unity). Isolated here so the
 * one conversion that needs real-run verification is easy to find and adjust.
 */
function up_gainToLevelMultiplier(db) {
    return Math.pow(10, db / 20);
}

function up_arrayContains(arr, val) {
    for (var i = 0; i < arr.length; i++) {
        if (arr[i] === val) { return true; }
    }
    return false;
}

/**
 * Find a clip component by display name or matchName (case-insensitive,
 * substring match). Names is an array of candidate strings.
 */
function up_findComponent(clip, names) {
    if (!clip || !clip.components) { return null; }
    for (var i = 0; i < clip.components.numItems; i++) {
        var comp = clip.components[i];
        if (up_nameMatches(comp, names)) { return comp; }
    }
    return null;
}

/**
 * Find a property within a component by display name or matchName.
 */
function up_findProperty(comp, names) {
    if (!comp || !comp.properties) { return null; }
    for (var i = 0; i < comp.properties.numItems; i++) {
        var prop = comp.properties[i];
        if (up_nameMatches(prop, names)) { return prop; }
    }
    return null;
}

function up_nameMatches(obj, names) {
    var dn = "", mn = "";
    try { dn = ("" + obj.displayName).toLowerCase(); } catch (e1) {}
    try { mn = ("" + obj.matchName).toLowerCase(); } catch (e2) {}
    for (var i = 0; i < names.length; i++) {
        var n = ("" + names[i]).toLowerCase();
        if (dn && dn.indexOf(n) !== -1) { return true; }
        if (mn && mn.indexOf(n) !== -1) { return true; }
    }
    return false;
}

function up_round1(n) {
    return Math.round(n * 10) / 10;
}

/**
 * Emit a JSON number that is always valid (no NaN / Infinity, which would break
 * JSON.parse on the panel side).
 */
function up_num(n) {
    var v = Number(n);
    if (isNaN(v) || !isFinite(v)) { return 0; }
    return v;
}

/**
 * Like up_result, but carries a "clips" array for the panel to analyze. Built
 * by hand because ExtendScript has no JSON serializer.
 */
function up_clipsResult(ok, message, logArr, clips) {
    var logStr = (logArr && logArr.length) ? logArr.join("\n") : "";
    var parts = [];
    for (var i = 0; i < clips.length; i++) {
        var c = clips[i];
        parts.push('{' +
            '"trackIndex":' + up_num(c.trackIndex) +
            ',"trackName":"' + up_escapeJSON(c.trackName) + '"' +
            ',"name":"' + up_escapeJSON(c.name) + '"' +
            ',"mediaPath":"' + up_escapeJSON(c.mediaPath) + '"' +
            ',"inSec":' + up_num(c.inSec) +
            ',"outSec":' + up_num(c.outSec) +
            ',"durationSec":' + up_num(c.durationSec) +
            ',"analyzable":' + (c.analyzable ? "true" : "false") +
            ',"reason":"' + up_escapeJSON(c.reason) + '"' +
        '}');
    }
    return '{"ok":' + (ok ? "true" : "false") +
        ',"message":"' + up_escapeJSON(message) + '"' +
        ',"log":"' + up_escapeJSON(logStr) + '"' +
        ',"clips":[' + parts.join(",") + ']}';
}
