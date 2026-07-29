(function () {
    "use strict";

    var cs = new CSInterface();

    var els = {
        markClips: document.getElementById("btnMarkClips"),
        render: document.getElementById("btnRender"),
        normalize: document.getElementById("btnNormalize"),
        detect: document.getElementById("btnDetect"),
        clipCount: document.getElementById("clipCount"),
        threshold: document.getElementById("threshold"),
        target: document.getElementById("target"),
        selectedOnly: document.getElementById("selectedOnly"),
        clearLog: document.getElementById("btnClearLog"),
        statusText: document.getElementById("statusText"),
        log: document.getElementById("log")
    };

    // ---- Loudness config ---------------------------------------------------
    // Kept in one place so thresholds/target and the ffmpeg lookup are easy to
    // change later. Threshold/target are also editable live in the GUI.
    var LOUDNESS = {
        thresholdLufs: -23,   // track average below this gets boosted
        targetLufs: -20,      // raise quiet tracks toward this
        maxGainDb: 12,        // never add more than this (mirrors host clamp)
        // ffmpeg is not bundled with Premiere; look in the usual places, then
        // fall back to whatever is on PATH.
        ffmpegCandidates: [
            "/opt/homebrew/bin/ffmpeg",
            "/usr/local/bin/ffmpeg",
            "/usr/bin/ffmpeg",
            "ffmpeg"
        ]
    };

    function timestamp() {
        var d = new Date();
        function pad(n) { return (n < 10 ? "0" : "") + n; }
        return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    }

    function appendLog(line) {
        els.log.textContent += "[" + timestamp() + "] " + line + "\n";
        els.log.scrollTop = els.log.scrollHeight;
    }

    // Append a multi-line log string (as returned by the host) indented under
    // the current action.
    function appendLogMulti(logStr) {
        if (!logStr) { return; }
        var lines = String(logStr).split("\n");
        for (var i = 0; i < lines.length; i++) {
            if (lines[i] !== "") { appendLog("   " + lines[i]); }
        }
    }

    function setStatus(text, state) {
        els.statusText.textContent = text;
        els.statusText.className = "status__text" + (state ? " is-" + state : "");
    }

    function setBusy(isBusy) {
        els.markClips.disabled = isBusy;
        els.render.disabled = isBusy;
        els.normalize.disabled = isBusy;
        els.detect.disabled = isBusy;
        els.clipCount.disabled = isBusy;
        els.threshold.disabled = isBusy;
        els.target.disabled = isBusy;
        els.selectedOnly.disabled = isBusy;
    }

    // Ask the host how many clips PodcastClips.txt describes and pre-fill the
    // Clip Count field. Pass silent=true for the automatic load-time check so a
    // missing file (or no open project) doesn't spam the log.
    function detectClipCount(silent) {
        cs.evalScript("up_detectClipCount()", function (raw) {
            var res = parseResult(raw);
            if (res && res.ok && typeof res.count === "number") {
                els.clipCount.value = res.count;
                setStatus("Clip count from .txt: " + res.count, "ok");
                if (!silent) {
                    appendLog("\u2714 Detected " + res.count + " clip(s) from PodcastClips.txt.");
                }
            } else if (!silent) {
                var msg = (res && res.message) ? res.message : "Could not detect clip count.";
                setStatus(msg, "err");
                appendLog("\u2716 " + msg);
            }
        });
    }

    // Parse whatever evalScript hands back. The host functions return a JSON
    // string, but a hard ExtendScript crash can return "EvalScript error." etc.
    function parseResult(raw) {
        if (raw === undefined || raw === null || raw === "" || raw === "undefined") {
            return { ok: false, message: "No response from Premiere (script did not return).", log: "" };
        }
        try {
            return JSON.parse(raw);
        } catch (e) {
            return { ok: false, message: "Host error: " + raw, log: "" };
        }
    }

    function runTask(label, hostCall) {
        setBusy(true);
        setStatus(label + "\u2026", "busy");
        appendLog("\u25B6 " + label);

        cs.evalScript(hostCall, function (raw) {
            var res = parseResult(raw);

            appendLogMulti(res.log);

            if (res.ok) {
                setStatus(res.message || (label + " complete."), "ok");
                appendLog("\u2714 " + (res.message || "Done."));
            } else {
                setStatus(res.message || (label + " failed."), "err");
                appendLog("\u2716 " + (res.message || "Failed."));
            }
            setBusy(false);
        });
    }

    // =====================================================================
    // LOUDNESS ENGINE — measure LUFS with ffmpeg, then boost quiet tracks.
    //
    // Why here (and not in ExtendScript): Premiere's scripting APIs cannot
    // *measure* loudness. So measurement runs in this panel via Node.js +
    // ffmpeg's EBU R128 `loudnorm` analysis; the host (loudness.jsx) only
    // enumerates clips and applies per-clip gain. See host/loudness.jsx.
    //
    // Everything tunable lives in the LOUDNESS object at the top of this file
    // (plus the Threshold/Target/Selected-only controls in the GUI), so the
    // policy is easy to change later without touching the engine below.
    // =====================================================================

    // Node.js is exposed by CEP when --enable-nodejs is set (see manifest).
    function nodeRequire(mod) {
        try {
            if (typeof window !== "undefined" && window.cep_node && window.cep_node.require) {
                return window.cep_node.require(mod);
            }
            if (typeof require === "function") { return require(mod); }
        } catch (e) {}
        return null;
    }

    var CHILD = nodeRequire("child_process");
    var FS = nodeRequire("fs");

    // Resolve a usable ffmpeg binary from the configured candidates.
    function resolveFfmpeg() {
        if (!CHILD) { return null; }
        var cands = LOUDNESS.ffmpegCandidates;
        for (var i = 0; i < cands.length; i++) {
            var p = cands[i];
            if (p.charAt(0) === "/") {
                if (FS && FS.existsSync(p)) { return p; }
            } else {
                try {
                    CHILD.execFileSync(p, ["-version"], { stdio: "ignore" });
                    return p;
                } catch (e) {}
            }
        }
        return null;
    }

    // Pull the integrated loudness (input_i) out of loudnorm's JSON report,
    // which ffmpeg prints to stderr. Returns a number or null.
    function parseLoudnormLufs(text) {
        var start = text.lastIndexOf("{");
        var end = text.lastIndexOf("}");
        if (start === -1 || end === -1 || end < start) { return null; }
        try {
            var obj = JSON.parse(text.substring(start, end + 1));
            var v = parseFloat(obj.input_i);
            if (isNaN(v) || !isFinite(v)) { return null; }
            return v;
        } catch (e) { return null; }
    }

    // Measure one clip's integrated LUFS over its in/out source range.
    function analyzeClipLufs(ffmpeg, clip, cb) {
        var args = ["-hide_banner", "-nostats"];
        if (clip.inSec > 0) { args.push("-ss", String(clip.inSec)); }
        if (clip.durationSec > 0) { args.push("-t", String(clip.durationSec)); }
        args.push("-i", clip.mediaPath,
            "-map", "a:0?",
            "-af", "loudnorm=print_format=json",
            "-f", "null", "-");
        CHILD.execFile(ffmpeg, args, { maxBuffer: 16 * 1024 * 1024 }, function (err, stdout, stderr) {
            var lufs = parseLoudnormLufs(String(stderr || ""));
            if (lufs === null) {
                cb(err ? ("ffmpeg: " + err.message) : "no loudness reading (silent or no audio)", null);
            } else {
                cb(null, lufs);
            }
        });
    }

    // Measure every clip sequentially (keeps CPU sane and log readable).
    function analyzeAllClips(ffmpeg, clips, done) {
        var out = [];
        var idx = 0;
        function next() {
            if (idx >= clips.length) { done(out); return; }
            var c = clips[idx++];
            setStatus("Analyzing " + idx + "/" + clips.length + "\u2026", "busy");
            if (!c.analyzable) {
                out.push({ clip: c, lufs: null, reason: c.reason || "unanalyzable" });
                appendLog("   \u2013 " + c.trackName + " \u00b7 " + c.name + ": skipped (" + (c.reason || "unanalyzable") + ")");
                next();
                return;
            }
            analyzeClipLufs(ffmpeg, c, function (err, lufs) {
                if (err || lufs === null) {
                    out.push({ clip: c, lufs: null, reason: err || "no reading" });
                    appendLog("   \u2013 " + c.trackName + " \u00b7 " + c.name + ": not analyzable (" + (err || "no reading") + ")");
                } else {
                    out.push({ clip: c, lufs: lufs, reason: "" });
                    appendLog("   \u00b7 " + c.trackName + " \u00b7 " + c.name + ": " + lufs.toFixed(1) + " LUFS");
                }
                next();
            });
        }
        next();
    }

    // Duration-weighted energy average of per-clip LUFS -> one track LUFS.
    // (Averaging in the energy domain, not raw dB, so long/loud clips carry
    // proportionally more weight — closer to a true integrated measurement.)
    function tracksFromMeasurements(measured, unanalyzed) {
        var tracks = {};
        for (var i = 0; i < measured.length; i++) {
            var m = measured[i];
            var c = m.clip;
            if (!tracks[c.trackIndex]) {
                tracks[c.trackIndex] = { index: c.trackIndex, name: c.trackName, energy: 0, dur: 0, count: 0 };
            }
            if (m.lufs === null) {
                unanalyzed.push({ name: c.name, track: c.trackName, reason: m.reason });
            } else {
                var t = tracks[c.trackIndex];
                var w = c.durationSec > 0 ? c.durationSec : 1;
                t.energy += Math.pow(10, m.lufs / 10) * w;
                t.dur += w;
                t.count++;
            }
        }
        var list = [];
        for (var k in tracks) { if (tracks.hasOwnProperty(k)) { list.push(tracks[k]); } }
        list.sort(function (a, b) { return a.index - b.index; });
        return list;
    }

    // For each track below threshold, boost toward target (never cut). Applies
    // gain via the host, sequentially, then prints the final report.
    function applyGainsAndReport(threshold, target, trackList, unanalyzed) {
        var report = [];
        var boosted = 0;
        var idx = 0;

        function finish() {
            appendLog("\u2500\u2500 Loudness report \u2500\u2500");
            appendLog("   Threshold " + threshold + " LUFS \u2192 target " + target + " LUFS (boost-only, max +" + LOUDNESS.maxGainDb + " dB).");
            if (!report.length) {
                appendLog("   No tracks measured.");
            } else {
                for (var i = 0; i < report.length; i++) { appendLog("   " + report[i]); }
            }
            if (unanalyzed.length) {
                appendLog("   Clips not analyzed (" + unanalyzed.length + "):");
                for (var j = 0; j < unanalyzed.length; j++) {
                    var u = unanalyzed[j];
                    appendLog("     \u2022 " + u.track + " \u00b7 " + u.name + " \u2014 " + u.reason);
                }
            } else {
                appendLog("   All clips analyzed successfully.");
            }
            var summary = boosted > 0
                ? ("Boosted " + boosted + " track(s).")
                : "No boost needed \u2014 all tracks at/above threshold.";
            setStatus(summary, "ok");
            appendLog("\u2714 Normalize Dialogue complete. " + summary);
            setBusy(false);
        }

        function nextTrack() {
            if (idx >= trackList.length) { finish(); return; }
            var t = trackList[idx++];
            if (t.count === 0 || t.dur <= 0) {
                report.push(t.name + ": no analyzable clips \u2014 skipped.");
                nextTrack();
                return;
            }
            var avg = 10 * (Math.log(t.energy / t.dur) / Math.LN10);
            var avgStr = avg.toFixed(1);
            if (avg >= threshold) {
                report.push(t.name + ": avg " + avgStr + " LUFS \u2265 threshold \u2014 left unchanged.");
                nextTrack();
                return;
            }
            var gain = target - avg;
            if (gain <= 0) {
                report.push(t.name + ": avg " + avgStr + " LUFS \u2014 already above target, unchanged.");
                nextTrack();
                return;
            }
            var clamped = false;
            if (gain > LOUDNESS.maxGainDb) { gain = LOUDNESS.maxGainDb; clamped = true; }
            var gainR = Math.round(gain * 10) / 10;
            cs.evalScript("up_applyTrackGain(" + t.index + ", " + gainR + ")", function (raw) {
                var r = parseResult(raw);
                appendLogMulti(r.log);
                if (r.ok) {
                    boosted++;
                    report.push(t.name + ": avg " + avgStr + " LUFS \u2192 +" + gainR + " dB" +
                        (clamped ? " (clamped to max)" : "") + " toward " + target + " LUFS.");
                } else {
                    report.push(t.name + ": avg " + avgStr + " LUFS \u2014 gain FAILED: " + (r.message || "error"));
                }
                nextTrack();
            });
        }
        nextTrack();
    }

    function normalizeDialogue() {
        var threshold = parseFloat(els.threshold.value);
        var target = parseFloat(els.target.value);
        if (isNaN(threshold)) { threshold = LOUDNESS.thresholdLufs; }
        if (isNaN(target)) { target = LOUDNESS.targetLufs; }
        var selectedOnly = !!els.selectedOnly.checked;

        setBusy(true);
        setStatus("Normalizing dialogue\u2026", "busy");
        appendLog("\u25B6 Normalize Dialogue (threshold " + threshold + " LUFS, target " + target +
            " LUFS" + (selectedOnly ? ", selected only" : "") + ")");

        if (!CHILD) {
            setStatus("Node.js unavailable.", "err");
            appendLog("\u2716 Node.js is not enabled for this panel, so ffmpeg can't be launched. " +
                "Add --enable-nodejs to CEFCommandLine in CSXS/manifest.xml and fully restart Premiere.");
            setBusy(false);
            return;
        }

        var ffmpeg = resolveFfmpeg();
        if (!ffmpeg) {
            setStatus("ffmpeg not found.", "err");
            appendLog("\u2716 ffmpeg not found. Install it (e.g. `brew install ffmpeg`) or add its path " +
                "to LOUDNESS.ffmpegCandidates at the top of main.js.");
            setBusy(false);
            return;
        }
        appendLog("   Using ffmpeg: " + ffmpeg);

        cs.evalScript("up_collectDialogueClips(" + (selectedOnly ? "true" : "false") + ")", function (raw) {
            var res = parseResult(raw);
            if (!res.ok || !res.clips || !res.clips.length) {
                setStatus(res.message || "No clips to analyze.", "err");
                appendLog("\u2716 " + (res.message || "No clips found."));
                setBusy(false);
                return;
            }
            appendLogMulti(res.log);
            appendLog("   Analyzing " + res.clips.length + " clip(s) with ffmpeg loudnorm\u2026");

            var unanalyzed = [];
            analyzeAllClips(ffmpeg, res.clips, function (measured) {
                var trackList = tracksFromMeasurements(measured, unanalyzed);
                applyGainsAndReport(threshold, target, trackList, unanalyzed);
            });
        });
    }

    els.markClips.addEventListener("click", function () {
        var n = parseInt(els.clipCount.value, 10);
        var call = (!isNaN(n) && n > 0) ? "up_markClips(" + n + ")" : "up_markClips()";
        runTask("Marking clips", call);
    });

    els.normalize.addEventListener("click", normalizeDialogue);

    els.detect.addEventListener("click", function () {
        setStatus("Detecting clip count\u2026", "busy");
        detectClipCount(false);
    });

    els.render.addEventListener("click", function () {
        runTask("Queueing exports in AME", "up_renderUnscripted()");
    });

    els.clearLog.addEventListener("click", function () {
        els.log.textContent = "";
        setStatus("Ready.");
    });

    setStatus("Ready.");
    appendLog("Unscripted-Podcast panel loaded.");

    // Try to pre-fill the clip count from PodcastClips.txt on open.
    detectClipCount(true);
})();
