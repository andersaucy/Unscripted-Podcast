/**
 * Unscripted-Podcast — "Mark Clips" task.
 *
 * Refactor of the original markClips.jsx into a callable function that
 * returns a JSON status string instead of using alert(). The editing logic
 * is preserved from the original script.
 *
 * Reads PodcastClips.txt (next to the .prproj), marks the "LowRes" sequence,
 * clones the full episode + "CLIP" template sequences into "ExportBin", and
 * inserts each clip with cross-dissolve / constant-power transitions.
 */

function up_markClips() {
    var __log = [];
    try {
        if (!app.project) {
            return up_result(false, "No open Premiere project.", __log);
        }

        var project = app.project;
        app.enableQE();

        // --- Locate the LowRes source sequence ---
        var fullEpisodeSeq = null;
        for (var i = 0; i < project.sequences.length; i++) {
            var sequence = project.sequences[i];
            if (sequence.name === "LowRes") {
                fullEpisodeSeq = sequence;
            }
        }
        if (!fullEpisodeSeq) {
            return up_result(false, 'No sequence named "LowRes" found in this project.', __log);
        }

        // --- Read the PodcastClips.txt timestamp file ---
        var _prompt = "Select podcast clips file (from Google Docs)";
        var projectPath = app.project.path;
        var parentPath = "";
        var filePath = "";
        var content = null;

        if (!projectPath) {
            return up_result(false, "Project has not been saved yet — cannot locate PodcastClips.txt.", __log);
        }

        var projectFile = new File(projectPath);
        parentPath = projectFile.parent.fsName;
        filePath = parentPath + "/PodcastClips.txt";
        __log.push("Looking for timestamp file: " + filePath);

        var timestampFile = new File(filePath);
        if (!timestampFile.open("r")) {
            __log.push("PodcastClips.txt not found next to project — prompting for a file.");
            timestampFile = File.openDialog(_prompt, "*.txt", false);
            if (!timestampFile || !timestampFile.open("r")) {
                return up_result(false, "No timestamp file selected.", __log);
            }
        }
        content = timestampFile.read();
        timestampFile.close();

        if (!content) {
            return up_result(false, "Timestamp file was empty.", __log);
        }

        // --- Parse titles + FROM/TO times, drop markers on LowRes ---
        var clipTitles = [];
        var clipList = [];
        var inMarker = null;
        var outMarker = null;
        var startTime = null;
        var clipTitle = null;

        var idx = 1;
        var lines = content.split("\n");
        for (var p = 0; p < lines.length; p++) {
            var line = lines[p];

            if (line.indexOf("TITLE= ") !== -1) {
                clipTitle = line.split("TITLE= ")[1];
                clipTitles.push(clipTitle);
            } else if (line.indexOf("FROM=") !== -1) {
                var fromTime = up_extractTime(line, "FROM");
                if (fromTime) {
                    startTime = up_convertToAETime(fromTime);
                    fullEpisodeSeq.setInPoint(startTime);
                    inMarker = fullEpisodeSeq.markers.createMarker(startTime, clipTitle);
                    inMarker.setTypeAsSegmentation();
                }
            } else if (line.indexOf("TO=") !== -1) {
                var toTime = up_extractTime(line, "TO");
                if (toTime && startTime !== null) {
                    var endTime = up_convertToAETime(toTime);

                    // Validate the range before building anything from it.
                    var rangeLabel = (clipTitle ? clipTitle : "CLIP " + idx);
                    if (endTime <= startTime) {
                        var kind = (endTime === startTime) ? "zero-length" : "inverted";
                        __log.push("WARNING: skipping " + kind + " range for \"" + rangeLabel +
                            "\" (FROM " + up_secondsToTimecode(startTime) +
                            " \u2192 TO " + up_secondsToTimecode(endTime) + ").");
                        startTime = null;
                        continue;
                    }

                    inMarker.end = endTime;
                    fullEpisodeSeq.setOutPoint(endTime);
                    outMarker = fullEpisodeSeq.markers.createMarker(endTime, clipTitle);
                    outMarker.setColorByIndex(1);

                    clipList.push(new UpClip(idx, clipTitle, startTime, endTime));
                    idx++;
                    startTime = null;
                }
            }
        }

        if (clipTitles.length === 0) {
            return up_result(false, "No TITLE= entries found in the timestamp file.", __log);
        }
        __log.push("Parsed " + clipTitles.length + " title(s), " + clipList.length + " clip range(s).");

        // --- Build one CLIP sequence per valid FROM/TO range ---
        var clipCount = clipList.length;
        __log.push("Building " + clipCount + " CLIP sequence(s).");

        // --- Clone the full episode + CLIP template sequences into ExportBin ---
        var clonedFullSequence = null;
        var expBin = project.rootItem.createBin("ExportBin");
        for (var s = 0; s < project.sequences.length; s++) {
            var seq = project.sequences[s];

            if (seq.name === "LowRes") {
                for (var a = 0; a < seq.audioTracks.numTracks; a++) {
                    seq.audioTracks[a].setMute(1);
                }
                if (seq.clone()) {
                    clonedFullSequence = app.project.activeSequence;
                    clonedFullSequence.name = clipTitles[0];
                    clonedFullSequence.projectItem.moveBin(expBin);
                    seq.name = "FULL Clone Successful";
                }
            }

            // Duplicate the "CLIP" template once per clip (count from .txt).
            if (seq.name === "CLIP") {
                for (var c = 1; c <= clipCount; c++) {
                    if (seq.clone()) {
                        var clonedClipSequence = app.project.activeSequence;
                        var cloneName = clipTitles[c];
                        if (cloneName === undefined || cloneName === null) {
                            cloneName = "CLIP " + c;
                        }
                        clonedClipSequence.name = cloneName;
                        clonedClipSequence.projectItem.moveBin(expBin);
                    }
                }
                seq.name = "CLIP Clone Successful";
            }
        }

        if (!clonedFullSequence) {
            return up_result(false, 'Could not clone the "LowRes" full episode sequence.', __log);
        }

        // --- Insert each clip into its own sequence + add transitions ---
        var dur = "00;00;00;06"; // transition duration
        var trackIndexes = [2, 3]; // V3, V4

        for (var clip = 0; clip < clipList.length; clip++) {
            var currClip = clipList[clip];
            var targetSeqName = currClip.title;
            var inPoint = currClip.startTime;
            var endPoint = currClip.endTime;

            var target = null;
            var source = null;
            for (var q = 0; q < project.sequences.length; q++) {
                var candidate = project.sequences[q];
                if (candidate.name === targetSeqName) { target = candidate; }
                if (candidate.name === clonedFullSequence.name) { source = candidate; }
            }
            if (!target || !source) { continue; }

            project.activeSequence = target;
            var active = project.activeSequence;
            var track = active.videoTracks[0];

            // Push the closing card back by the source clip's length.
            var pushBy = (endPoint - inPoint);
            var shift = new Time();
            shift.seconds = pushBy;
            for (var t = 0; t < trackIndexes.length; t++) {
                var tr = project.activeSequence.videoTracks[trackIndexes[t]];
                for (var m = tr.clips.numItems - 1; m >= 0; m--) {
                    tr.clips[m].move(shift);
                }
            }
            source.projectItem.setInPoint(inPoint, 4);
            source.projectItem.setOutPoint(endPoint, 4);
            track.insertClip(source.projectItem, 6.25625);

            // Transitions via the QE DOM.
            var qeSeq = qe.project.getActiveSequence();
            var qeVTrack = qeSeq.getVideoTrackAt(0);
            var qeVClip = qeVTrack.getItemAt(0);
            var qeATrack = qeSeq.getAudioTrackAt(0);
            var qeAClip = qeATrack.getItemAt(0);

            var videoTrans = qe.project.getVideoTransitionByName("Cross Dissolve");
            var audioTrans = qe.project.getAudioTransitionByName("Constant Power");

            qeVClip.addTransition(videoTrans, true, dur, "0", 0.5);
            qeVClip.addTransition(videoTrans, false, dur, "0", 0.5);
            qeAClip.addTransition(audioTrans, true, dur, "0", 0.5);
            qeAClip.addTransition(audioTrans, false, dur, "0", 0.5);

            var lastClip = qeATrack.getItemAt(qeATrack.numItems - 1);
            lastClip.addTransition(audioTrans, false, dur, "0", 0.5);

            __log.push("Built clip sequence: " + targetSeqName);
        }

        // --- Finalize the full podcast sequence for export ---
        for (var f = 0; f < project.sequences.length; f++) {
            var fseq = project.sequences[f];
            if (fseq.name === clonedFullSequence.name) {
                app.project.activeSequence = fseq;
                fseq.setInPoint(0, 4);
                fseq.setOutPoint(fseq.end, 4);
                var numAudioTracks = fseq.audioTracks.numTracks;
                if (numAudioTracks > 0) {
                    fseq.audioTracks[numAudioTracks - 1].setMute(0);
                }
                __log.push(fseq.name + " is ready for export.");
            }
        }

        return up_result(true,
            "Marked clips and built " + clipList.length + " clip sequence(s) in ExportBin.",
            __log);

    } catch (e) {
        var where = e.line ? (" (line " + e.line + ")") : "";
        return up_result(false, "Mark Clips error: " + e.toString() + where, __log);
    }
}

// ---- Supporting types / helpers (unchanged logic) -------------------------

function UpClip(number, title, startTime, endTime) {
    this.number = number;
    this.title = title;
    this.startTime = startTime;
    this.endTime = endTime;
}

/**
 * Pull a timecode from a "LABEL= <time>" line (LABEL is "FROM" or "TO").
 *
 * Accepts MM:SS or HH:MM:SS where each part may be single- OR double-digit
 * (e.g. 8:29, 08:29, 0:42, 1:01:47) and tolerates any spacing around the "="
 * (FROM=8:29, FROM= 8:29, FROM = 8:29). Returns the matched time string, or
 * null if the line has no valid timecode.
 */
function up_extractTime(line, label) {
    var re = new RegExp(label + "\\s*=\\s*(\\d{1,3}(?::\\d{1,2}){1,2})");
    var m = line.match(re);
    return m ? m[1] : null;
}

/**
 * Convert a MM:SS or HH:MM:SS string to seconds. Each component is parsed with
 * an explicit radix so leading zeros (e.g. "08") are never treated as octal.
 */
function up_convertToAETime(timeString) {
    if (!timeString) { return 0; }

    var parts = ("" + timeString).replace(/^\s+|\s+$/g, "").split(":");
    for (var i = 0; i < parts.length; i++) {
        var n = parseInt(parts[i], 10);
        parts[i] = isNaN(n) ? 0 : n;
    }

    var hours = 0, minutes = 0, seconds = 0;
    if (parts.length >= 3) {
        hours = parts[0]; minutes = parts[1]; seconds = parts[2];
    } else if (parts.length === 2) {
        minutes = parts[0]; seconds = parts[1];
    } else if (parts.length === 1) {
        seconds = parts[0];
    }

    return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Format a seconds value back into H:MM:SS (or M:SS) for readable log warnings.
 */
function up_secondsToTimecode(totalSeconds) {
    var s = Math.floor(totalSeconds % 60);
    var m = Math.floor((totalSeconds / 60) % 60);
    var h = Math.floor(totalSeconds / 3600);
    var pad = function (n) { return (n < 10 ? "0" + n : "" + n); };
    if (h > 0) {
        return h + ":" + pad(m) + ":" + pad(s);
    }
    return m + ":" + pad(s);
}
