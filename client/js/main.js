(function () {
    "use strict";

    var cs = new CSInterface();

    var els = {
        app: document.getElementById("app"),
        markClips: document.getElementById("btnMarkClips"),
        importFootage: document.getElementById("btnImportFootage"),
        importFootageState: document.getElementById("importFootageState"),
        configureAudioState: document.getElementById("configureAudioState"),
        episodeIdentityState: document.getElementById("episodeIdentityState"),
        createMulticams: document.getElementById("btnCreateMulticams"),
        multicamState: document.getElementById("multicamState"),
        lumetriState: document.getElementById("lumetriState"),
        cameraColorState: document.getElementById("cameraColorState"),
        analyzeCameraGroups: document.getElementById("btnAnalyzeCameraGroups"),
        finishTalk: document.getElementById("btnFinishTalk"),
        collectEpisode: document.getElementById("btnCollectEpisode"),
        render: document.getElementById("btnRender"),
        detect: document.getElementById("btnDetect"),
        clipCount: document.getElementById("clipCount"),
        clearLog: document.getElementById("btnClearLog"),
        toggleLog: document.getElementById("btnToggleLog"),
        statusText: document.getElementById("statusText"),
        log: document.getElementById("log")
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
        els.importFootage.disabled = isBusy;
        els.createMulticams.disabled = isBusy;
        els.analyzeCameraGroups.disabled = isBusy;
        els.finishTalk.disabled = isBusy;
        els.collectEpisode.disabled = isBusy;
        els.markClips.disabled = isBusy;
        els.render.disabled = isBusy;
        els.detect.disabled = isBusy;
        els.clipCount.disabled = isBusy;
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

    function runTask(label, hostCall, onComplete) {
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
            if (typeof onComplete === "function") { onComplete(res); }
        });
    }

    function isMacOS() {
        return /Mac/i.test(navigator.platform || navigator.userAgent || "");
    }

    function evalHost(hostCall, callback) {
        cs.evalScript(hostCall, function (raw) {
            callback(parseResult(raw));
        });
    }

    function detectClipCount(silent) {
        evalHost("up_detectClipCount()", function (res) {
            if (res.ok && typeof res.count === "number") {
                els.clipCount.value = res.count;
                setStatus("Clip count from .txt: " + res.count, "ok");
                if (!silent) {
                    appendLog("\u2714 Detected " + res.count +
                        " clip(s) from PodcastClips.txt.");
                }
            } else if (!silent) {
                var message = res.message || "Could not detect clip count.";
                setStatus(message, "err");
                appendLog("\u2716 " + message);
            }
        });
    }

    function setSetupIndicator(element, text, state, title) {
        element.textContent = text;
        element.className = element.className.replace(/\s+is-(?:complete|pending)/g, "") +
            (state ? " is-" + state : "");
        element.title = title || text;
    }

    function refreshEpisodeSetupStatus() {
        evalHost("up_getEpisodeSetupStatus()", function (status) {
            if (!status.ok) {
                els.analyzeCameraGroups.classList.remove("is-complete");
                setSetupIndicator(
                    els.importFootageState,
                    "Not ready",
                    "pending",
                    status.message
                );
                setSetupIndicator(
                    els.configureAudioState,
                    "Not ready",
                    "pending",
                    status.message
                );
                setSetupIndicator(
                    els.episodeIdentityState,
                    "Episode pending",
                    "pending",
                    status.message
                );
                setSetupIndicator(
                    els.multicamState,
                    "Multicams pending",
                    "pending",
                    status.message
                );
                setSetupIndicator(
                    els.cameraColorState,
                    "Color pending",
                    "pending",
                    status.message
                );
                return;
            }

            if (status.imported) {
                setSetupIndicator(
                    els.importFootageState,
                    "Import \u2713 " + status.importedCount,
                    "complete",
                    status.videoCount + " video and " + status.audioCount +
                        " audio file(s) imported from 01_Assets/Footage."
                );
            } else {
                setSetupIndicator(
                    els.importFootageState,
                    "Import pending",
                    "pending",
                    status.message
                );
            }

            if (status.audioConfigured) {
                setSetupIndicator(
                    els.configureAudioState,
                    "Audio \u2713 " + status.audioConfiguredCount,
                    "complete",
                    "All MXF/WAV items have the expected mono format and clip count."
                );
            } else if (status.audioTargetCount > 0) {
                setSetupIndicator(
                    els.configureAudioState,
                    "Audio " + status.audioConfiguredCount + "/" +
                        status.audioTargetCount,
                    "pending",
                    "MXF/WAV items matching the expected mono format and clip count."
                );
            } else {
                setSetupIndicator(
                    els.configureAudioState,
                    "Audio pending",
                    "pending",
                    "No configurable MXF or WAV footage is present."
                );
            }

            if (status.identityConfigured) {
                setSetupIndicator(
                    els.episodeIdentityState,
                    "Episode \u2713 " + status.identityEpisodeNumber,
                    "complete",
                    "_CLIP INTRO Episode Number MOGRT and " +
                        status.identityEpisodeNumber + " LowRes_v1 are configured."
                );
            } else {
                var identityParts = [];
                if (!status.identityGraphicConfigured) {
                    identityParts.push("Episode Number MOGRT");
                }
                if (!status.identityLowResConfigured) { identityParts.push("LowRes name"); }
                setSetupIndicator(
                    els.episodeIdentityState,
                    "Episode pending",
                    "pending",
                    identityParts.length ?
                        "Still needed: " + identityParts.join(" and ") + "." :
                        "Episode number was not found in the project filename."
                );
            }

            if (status.multicamsCreated) {
                setSetupIndicator(
                    els.multicamState,
                    "Multicams \u2713 2/2",
                    "complete",
                    "INTRO-" + status.identityEpisodeNumber + " and TALK-" +
                        status.identityEpisodeNumber + " exist in this project."
                );
            } else {
                var missingMulticams = [];
                if (!status.introMulticamCreated) { missingMulticams.push("INTRO"); }
                if (!status.talkMulticamCreated) { missingMulticams.push("TALK"); }
                setSetupIndicator(
                    els.multicamState,
                    "Multicams " + Number(status.multicamCount || 0) + "/2",
                    "pending",
                    missingMulticams.length ?
                        "Still needed: " + missingMulticams.join(" and ") + "." :
                        "Episode number was not found in the project filename."
                );
            }

            if (status.lumetriConfigured) {
                setSetupIndicator(
                    els.lumetriState,
                    "Lumetri \u2713 " + status.lumetriConfiguredCount + "/" +
                        status.lumetriTargetCount,
                    "complete",
                    "Lumetri Color is present on every INTRO/TALK video clip."
                );
            } else {
                setSetupIndicator(
                    els.lumetriState,
                    "Lumetri " + Number(status.lumetriConfiguredCount || 0) + "/" +
                        Number(status.lumetriTargetCount || 0),
                    "pending",
                    status.multicamsCreated ?
                        "Create Episode Multicams will apply missing Lumetri effects." :
                        "Lumetri coverage is checked after both multicams exist."
                );
            }

            if (status.colorAnalysisConfigured) {
                els.analyzeCameraGroups.classList.add("is-complete");
                setSetupIndicator(
                    els.cameraColorState,
                    "Color \u2713 " + status.colorAnalyzedClipCount + "/" +
                        status.colorAnalysisTargetClipCount,
                    "complete",
                    "Smart Camera Color analysis is current for both multicams."
                );
            } else {
                els.analyzeCameraGroups.classList.remove("is-complete");
                setSetupIndicator(
                    els.cameraColorState,
                    "Color " + Number(status.colorAnalyzedSequenceCount || 0) + "/2",
                    "pending",
                    "Analyze and apply both multicams in the separate Smart Camera Color panel."
                );
            }
        });
    }

    function refreshSetupStatusSoon() {
        window.setTimeout(refreshEpisodeSetupStatus, 500);
    }

    function terminateProcess(pid) {
        try {
            if (window.cep && window.cep.process && pid) {
                window.cep.process.terminate(pid);
            }
        } catch (e) {}
    }

    function launchAudioPresetHelper(presetName) {
        if (!window.cep || !window.cep.process ||
                typeof window.cep.process.createProcess !== "function") {
            return { ok: false, message: "CEP process automation is unavailable." };
        }

        var extensionPath = cs.getSystemPath(SystemPath.EXTENSION);
        var scriptPath = extensionPath + "/client/scripts/applyAudioChannelPreset.applescript";
        var launched = window.cep.process.createProcess(
            "/usr/bin/osascript",
            scriptPath,
            presetName
        );
        if (!launched || launched.err !== 0 || !launched.data) {
            return {
                ok: false,
                message: "Could not start the macOS Audio Channels preset helper."
            };
        }
        var helper = { ok: true, pid: launched.data, stderr: "" };
        try {
            window.cep.process.stderr(helper.pid, function (chunk) {
                if (typeof chunk === "string") {
                    helper.stderr += chunk;
                } else if (chunk && chunk.data) {
                    helper.stderr += chunk.data;
                }
            });
        } catch (e) {}
        return helper;
    }

    function launchMulticamHelper(sequenceName) {
        if (!window.cep || !window.cep.process ||
                typeof window.cep.process.createProcess !== "function") {
            return { ok: false, message: "CEP process automation is unavailable." };
        }

        var extensionPath = cs.getSystemPath(SystemPath.EXTENSION);
        var scriptPath = extensionPath + "/client/scripts/createEpisodeMulticam.applescript";
        var launched = window.cep.process.createProcess(
            "/usr/bin/osascript",
            scriptPath,
            sequenceName
        );
        if (!launched || launched.err !== 0 || !launched.data) {
            return { ok: false, message: "Could not start the macOS multicam helper." };
        }
        var helper = { ok: true, pid: launched.data, stderr: "" };
        try {
            window.cep.process.stderr(helper.pid, function (chunk) {
                if (typeof chunk === "string") {
                    helper.stderr += chunk;
                } else if (chunk && chunk.data) {
                    helper.stderr += chunk.data;
                }
            });
        } catch (e) {}
        return helper;
    }

    function launchTalkTrackHelper(layout) {
        if (!window.cep || !window.cep.process ||
                typeof window.cep.process.createProcess !== "function") {
            return { ok: false, message: "CEP process automation is unavailable." };
        }
        var extensionPath = cs.getSystemPath(SystemPath.EXTENSION);
        var scriptPath = extensionPath + "/client/scripts/prepareTalkTracks.applescript";
        var launched = window.cep.process.createProcess(
            "/usr/bin/osascript",
            scriptPath,
            String(layout.videoTracksToAdd),
            String(layout.audioTracksToAdd),
            String(layout.audioAfterTrack)
        );
        if (!launched || launched.err !== 0 || !launched.data) {
            return { ok: false, message: "Could not start the TALK track helper." };
        }
        var helper = { ok: true, pid: launched.data, stderr: "" };
        try {
            window.cep.process.stderr(helper.pid, function (chunk) {
                if (typeof chunk === "string") {
                    helper.stderr += chunk;
                } else if (chunk && chunk.data) {
                    helper.stderr += chunk.data;
                }
            });
        } catch (e) {}
        return helper;
    }

    function helperIsRunning(pid) {
        try {
            var status = window.cep.process.isRunning(pid);
            return !!(status && status.err === 0 && status.data);
        } catch (e) {
            return false;
        }
    }

    function helperErrorDetail(stderr, fallback) {
        var detail = String(stderr || "").replace(/\s+/g, " ").trim();
        if (!detail || /\.applescript:\s*$/.test(detail)) {
            return fallback;
        }
        return detail;
    }

    function waitForAudioPresetHelper(helper, presetName, callback, attempt) {
        var currentAttempt = attempt || 0;
        if (!helperIsRunning(helper.pid)) {
            // CEP can deliver stderr in multiple chunks just after process
            // exit. Allow the final chunk to arrive before reporting status.
            window.setTimeout(function () {
                if (helper.stderr) {
                    callback({
                        ok: false,
                        message: "Audio preset helper failed: " + helper.stderr,
                        log: ""
                    });
                } else {
                    callback({
                        ok: true,
                        message: "Applied " + presetName + ".",
                        log: ""
                    });
                }
            }, 300);
            return;
        }
        if (currentAttempt >= 250) {
            terminateProcess(helper.pid);
            callback({
                ok: false,
                message: "Timed out while applying " + presetName + ".",
                log: ""
            });
            return;
        }
        window.setTimeout(function () {
            waitForAudioPresetHelper(helper, presetName, callback, currentAttempt + 1);
        }, 100);
    }

    function runMacAudioPresetStep(mediaType, presetName, callback) {
        evalHost("up_prepareFootageAudioPreset('" + mediaType + "')", function (res) {
            if (!res.ok) {
                callback(res);
                return;
            }
            if (res.message && res.message.indexOf("No " + mediaType.toUpperCase() +
                    " files found") === 0) {
                callback(res);
                return;
            }

            var helper = launchAudioPresetHelper(presetName);
            if (!helper.ok) {
                callback({ ok: false, message: helper.message, log: res.log || "" });
                return;
            }
            waitForAudioPresetHelper(helper, presetName, function (helperResult) {
                helperResult.log = res.log || "";
                callback(helperResult);
            });
        });
    }

    function waitForMulticamHelper(helper, sequenceName, callback, attempt) {
        var currentAttempt = attempt || 0;
        if (!helperIsRunning(helper.pid)) {
            window.setTimeout(function () {
                if (helper.stderr) {
                    var fallback = sequenceName === "TALK track layout" ?
                        "Premiere did not complete Sequence > Add Tracks. " +
                            "Confirm the Timeline is active and retry." :
                        "Premiere did not complete the native multicam dialog.";
                    callback({
                        ok: false,
                        message: (sequenceName === "TALK track layout" ?
                            "TALK track helper failed: " : "Multicam helper failed: ") +
                            helperErrorDetail(helper.stderr, fallback),
                        log: ""
                    });
                } else {
                    callback({
                        ok: true,
                        message: "Submitted " + sequenceName + " to Premiere.",
                        log: ""
                    });
                }
            }, 300);
            return;
        }
        if (currentAttempt >= 450) {
            terminateProcess(helper.pid);
            callback({
                ok: false,
                message: "Timed out while creating " + sequenceName + ".",
                log: ""
            });
            return;
        }
        window.setTimeout(function () {
            waitForMulticamHelper(helper, sequenceName, callback, currentAttempt + 1);
        }, 100);
    }

    function waitForMulticamVerification(groupKey, callback, attempt, maxAttempts) {
        var currentAttempt = attempt || 0;
        var attemptLimit = maxAttempts === undefined ? 600 : maxAttempts;
        evalHost("up_verifyEpisodeMulticam('" + groupKey + "')", function (res) {
            // Audio synchronization across full podcast media can take several
            // minutes before the new source sequence appears in the project.
            if (res.ok || currentAttempt >= attemptLimit) {
                callback(res);
                return;
            }
            window.setTimeout(function () {
                waitForMulticamVerification(
                    groupKey,
                    callback,
                    currentAttempt + 1,
                    attemptLimit
                );
            }, 500);
        });
    }

    function runMulticamGroup(groupKey, callback) {
        evalHost("up_prepareEpisodeMulticam('" + groupKey + "')", function (prepared) {
            appendLogMulti(prepared.log);
            if (!prepared.ok) {
                callback(prepared);
                return;
            }
            if (String(prepared.message || "").indexOf(
                    "Skipped existing multicam source sequence "
                ) === 0) {
                callback(prepared);
                return;
            }

            var nameMatch = String(prepared.message || "").match(/Prepared ([A-Z]+-\d+) with/);
            if (!nameMatch) {
                callback({
                    ok: false,
                    message: "Could not determine the prepared multicam sequence name.",
                    log: ""
                });
                return;
            }
            var sequenceName = nameMatch[1];
            var helper = launchMulticamHelper(sequenceName);
            if (!helper.ok) {
                callback({ ok: false, message: helper.message, log: "" });
                return;
            }

            waitForMulticamHelper(helper, sequenceName, function (helperResult) {
                if (helperResult.ok) {
                    appendLog("\u2714 " + helperResult.message);
                }
                // Premiere may successfully accept the dialog and begin audio
                // synchronization even if macOS reports an accessibility error
                // while the dialog is closing. The project sequence is the
                // authoritative result, so verify it before treating stderr as
                // a failed operation.
                waitForMulticamVerification(
                    groupKey,
                    function (verified) {
                        if (verified.ok) {
                            if (!helperResult.ok) {
                                appendLog("   WARNING: The macOS helper reported an " +
                                    "error after Premiere accepted the multicam job.");
                            }
                            callback(verified);
                            return;
                        }
                        callback(helperResult.ok ? verified : helperResult);
                    },
                    0,
                    helperResult.ok ? 600 : 20
                );
            });
        });
    }

    function runTalkPostProcessing(callback) {
        evalHost("up_prepareTalkTrackLayout()", function (layout) {
            appendLogMulti(layout.log);
            if (!layout.ok) {
                callback(layout);
                return;
            }

            function finalizeLayout() {
                function runPlacementPass(attempt) {
                    evalHost("up_finalizeTalkMulticam()", function (pass) {
                        var waiting = pass.ok && String(pass.message || "") ===
                            "Waiting for Premiere to refresh TALK placements.";
                        if (!waiting || attempt >= 5) {
                            if (waiting) {
                                pass.ok = false;
                                pass.message = "Premiere did not refresh the staged " +
                                    "TALK placements. Original WAV clips were preserved; " +
                                    "close and reopen the TALK timeline, then retry.";
                            }
                            callback(pass);
                            return;
                        }
                        appendLogMulti(pass.log);
                        appendLog("   Premiere refresh pass " + (attempt + 1) + "/5…");
                        window.setTimeout(function () {
                            runPlacementPass(attempt + 1);
                        }, 1200);
                    });
                }
                window.setTimeout(function () { runPlacementPass(0); }, 400);
            }

            if (!layout.trackSetupNeeded) {
                appendLog("\u2714 " + layout.message);
                finalizeLayout();
                return;
            }

            appendLog("   " + layout.message);
            var helper = launchTalkTrackHelper(layout);
            if (!helper.ok) {
                callback(helper);
                return;
            }
            waitForMulticamHelper(helper, "TALK track layout", function (helperResult) {
                waitForPreparedTalkLayout(function (rechecked) {
                    if (rechecked.ok && !rechecked.trackSetupNeeded) {
                        if (!helperResult.ok) {
                            appendLog("   WARNING: The macOS helper reported an " +
                                "error after Premiere created the TALK tracks.");
                        }
                        appendLog("\u2714 Prepared V1-V5; existing audio tracks retained.");
                        finalizeLayout();
                    } else {
                        callback(helperResult.ok ? rechecked : helperResult);
                    }
                });
            });
        });
    }

    function waitForPreparedTalkLayout(callback, attempt) {
        var currentAttempt = attempt || 0;
        evalHost("up_prepareTalkTrackLayout()", function (layout) {
            if ((layout.ok && !layout.trackSetupNeeded) || currentAttempt >= 20) {
                callback(layout);
                return;
            }
            window.setTimeout(function () {
                waitForPreparedTalkLayout(callback, currentAttempt + 1);
            }, 500);
        });
    }

    function runEpisodeMulticamWorkflow() {
        if (!isMacOS()) {
            setStatus("Automatic multicam setup currently requires macOS.", "err");
            appendLog("\u2716 Automatic multicam setup currently requires macOS.");
            return;
        }

        setBusy(true);
        setStatus("Discovering episode multicams\u2026", "busy");
        appendLog("\u25B6 Creating INTRO and TALK multicam sequences");

        evalHost("up_previewEpisodeMulticams()", function (preview) {
            appendLogMulti(preview.log);
            if (!preview.ok) {
                setStatus(preview.message, "err");
                appendLog("\u2716 " + preview.message);
                setBusy(false);
                return;
            }
            appendLog("\u2714 " + preview.message);
            setStatus("Creating INTRO multicam\u2026", "busy");

            runMulticamGroup("intro", function (introResult) {
                appendLogMulti(introResult.log);
                if (!introResult.ok) {
                    setStatus(introResult.message, "err");
                    appendLog("\u2716 " + introResult.message);
                    setBusy(false);
                    return;
                }
                appendLog("\u2714 " + introResult.message);
                setStatus("Creating TALK multicam\u2026", "busy");

                runMulticamGroup("talk", function (talkResult) {
                    appendLogMulti(talkResult.log);
                    if (!talkResult.ok) {
                        setStatus(talkResult.message, "err");
                        appendLog("\u2716 " + talkResult.message);
                        setBusy(false);
                        return;
                    }
                    appendLog("\u2714 " + talkResult.message);
                    setStatus("Opening multicam timelines\u2026", "busy");
                    evalHost("up_openEpisodeMulticams()", function (opened) {
                        appendLogMulti(opened.log);
                        if (!opened.ok) {
                            setStatus(opened.message, "err");
                            appendLog("\u2716 " + opened.message);
                            refreshSetupStatusSoon();
                            setBusy(false);
                            return;
                        }
                        appendLog("\u2714 " + opened.message);
                        setStatus("Applying Lumetri to multicam clips…", "busy");
                        evalHost("up_applyLumetriEpisodeMulticams()", function (colored) {
                            appendLogMulti(colored.log);
                            if (!colored.ok) {
                                setStatus(colored.message, "err");
                                appendLog("\u2716 " + colored.message);
                                refreshSetupStatusSoon();
                                setBusy(false);
                            } else {
                                appendLog("\u2714 " + colored.message);
                                setStatus("Analyzing both multicam camera groups…", "busy");
                                window.UnscriptedIntelligentColor
                                    .autoAnalyzeEpisodeMulticams()
                                    .then(function (colorResult) {
                                        var done = "INTRO and TALK multicams are ready with intelligent color.";
                                        appendLogMulti(colorResult.log);
                                        setStatus(done, "ok");
                                        appendLog("\u2714 " + done);
                                        refreshSetupStatusSoon();
                                        window.setTimeout(refreshEpisodeSetupStatus, 1800);
                                        setBusy(false);
                                    }).catch(function (colorError) {
                                        var message = "Multicams are ready, but automatic camera color failed: " +
                                            colorError.message;
                                        setStatus(message, "err");
                                        appendLog("\u2716 " + message);
                                        refreshSetupStatusSoon();
                                        setBusy(false);
                                    });
                            }
                        });
                    });
                });
            });
        });
    }

    function runFinishTalkWorkflow() {
        if (!isMacOS()) {
            setStatus("Automatic TALK finishing currently requires macOS.", "err");
            appendLog("\u2716 Automatic TALK finishing currently requires macOS.");
            return;
        }
        setBusy(true);
        setStatus("Finishing TALK layout\u2026", "busy");
        appendLog("\u25B6 Finishing TALK audio and Zencastr layout");
        runTalkPostProcessing(function (result) {
            appendLogMulti(result.log);
            if (!result.ok) {
                setStatus(result.message, "err");
                appendLog("\u2716 " + result.message);
            } else {
                setStatus(result.message, "ok");
                appendLog("\u2714 " + result.message);
            }
            setBusy(false);
        });
    }

    function runMacAudioPresetSequence(callback) {
        appendLog("\u25B6 Configuring footage audio with saved presets");

        runMacAudioPresetStep("mxf", "Unscripted-MXF1", function (mxfResult) {
            appendLogMulti(mxfResult.log);
            if (!mxfResult.ok) {
                callback(mxfResult);
                return;
            }
            appendLog("\u2714 " + mxfResult.message);

            runMacAudioPresetStep("wav", "Unscripted-WAV3", function (wavResult) {
                appendLogMulti(wavResult.log);
                if (!wavResult.ok) {
                    callback(wavResult);
                } else {
                    var done = "Footage audio configured with Unscripted-MXF1 and " +
                        "Unscripted-WAV3.";
                    appendLog("\u2714 " + wavResult.message);
                    callback({ ok: true, message: done, log: "" });
                }
            });
        });
    }

    function runEpisodeIdentityStep(callback) {
        evalHost("up_applyEpisodeIdentity()", callback);
    }

    function runImportAndConfigureWorkflow() {
        setBusy(true);
        setStatus("Applying episode number and sequence name\u2026", "busy");
        appendLog("\u25B6 Preparing episode identity, footage, and audio");

        runEpisodeIdentityStep(function (identity) {
            appendLogMulti(identity.log);
            if (!identity.ok) {
                setStatus(identity.message, "err");
                appendLog("\u2716 " + identity.message);
                setBusy(false);
                refreshSetupStatusSoon();
                return;
            }
            appendLog("\u2714 " + identity.message);
            setStatus("Importing footage\u2026", "busy");

            evalHost("up_importFootage()", function (imported) {
            appendLogMulti(imported.log);
            if (!imported.ok) {
                setStatus(imported.message, "err");
                appendLog("\u2716 " + imported.message);
                setBusy(false);
                refreshSetupStatusSoon();
                return;
            }
            appendLog("\u2714 " + imported.message);
            setStatus("Configuring MXF/WAV audio\u2026", "busy");

            function finishAudio(audioResult) {
                appendLogMulti(audioResult.log);
                if (!audioResult.ok) {
                    setStatus(audioResult.message, "err");
                    appendLog("\u2716 " + audioResult.message);
                    setBusy(false);
                    refreshSetupStatusSoon();
                    return;
                }
                appendLog("\u2714 " + audioResult.message);
                evalHost("up_applyFootageColorLabels()", function (labels) {
                    appendLogMulti(labels.log);
                    if (!labels.ok) {
                        appendLog("   WARNING: " + labels.message);
                    }
                    var done = "Episode identity, footage, and audio are ready.";
                    setStatus(done, "ok");
                    appendLog("\u2714 " + done);
                    setBusy(false);
                    refreshSetupStatusSoon();
                });
            }

            if (isMacOS()) {
                runMacAudioPresetSequence(finishAudio);
            } else {
                evalHost("up_configureFootageAudio()", finishAudio);
            }
            });
        });
    }

    els.markClips.addEventListener("click", function () {
        var count = parseInt(els.clipCount.value, 10);
        var call = (!isNaN(count) && count > 0) ?
            "up_markClips(" + count + ")" : "up_markClips()";
        runTask("Marking clips", call);
    });

    els.detect.addEventListener("click", function () {
        setStatus("Detecting clip count\u2026", "busy");
        detectClipCount(false);
    });

    els.importFootage.addEventListener("click", function () {
        runImportAndConfigureWorkflow();
    });

    els.createMulticams.addEventListener("click", function () {
        runEpisodeMulticamWorkflow();
    });

    els.finishTalk.addEventListener("click", function () {
        runFinishTalkWorkflow();
    });

    els.collectEpisode.addEventListener("click", function () {
        runTask("Collecting and saving episode", "up_collectAndSaveEpisode()");
    });

    els.render.addEventListener("click", function () {
        runTask("Queueing exports in AME", "up_renderUnscripted()");
    });

    els.clearLog.addEventListener("click", function () {
        els.log.textContent = "";
        setStatus("Ready.");
    });

    els.toggleLog.addEventListener("click", function () {
        var expanded = els.app.classList.toggle("is-log-expanded");
        els.toggleLog.textContent = expanded ? "Show Setup" : "Expand Log";
        els.toggleLog.title = expanded ? "Show episode setup actions" :
            "Expand activity log";
        if (expanded) { els.log.scrollTop = els.log.scrollHeight; }
    });

    setStatus("Ready.");
    appendLog("Unscripted-Podcast panel loaded.");
    try {
        cs.addEventListener("com.smart.camera.color.applied",
            refreshEpisodeSetupStatus);
    } catch (colorEventError) {}
    window.addEventListener("focus", refreshEpisodeSetupStatus);
    refreshEpisodeSetupStatus();
    detectClipCount(true);

})();
