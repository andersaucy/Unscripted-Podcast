(function () {
    "use strict";

    var cs = new CSInterface();

    var els = {
        markClips: document.getElementById("btnMarkClips"),
        importFootage: document.getElementById("btnImportFootage"),
        configureAudio: document.getElementById("btnConfigureAudio"),
        collectEpisode: document.getElementById("btnCollectEpisode"),
        render: document.getElementById("btnRender"),
        clearLog: document.getElementById("btnClearLog"),
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
        els.configureAudio.disabled = isBusy;
        els.collectEpisode.disabled = isBusy;
        els.markClips.disabled = isBusy;
        els.render.disabled = isBusy;
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

    function isMacOS() {
        return /Mac/i.test(navigator.platform || navigator.userAgent || "");
    }

    function evalHost(hostCall, callback) {
        cs.evalScript(hostCall, function (raw) {
            callback(parseResult(raw));
        });
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

    function helperIsRunning(pid) {
        try {
            var status = window.cep.process.isRunning(pid);
            return !!(status && status.err === 0 && status.data);
        } catch (e) {
            return false;
        }
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

    function runMacAudioPresetWorkflow() {
        setBusy(true);
        setStatus("Applying Audio Channels presets\u2026", "busy");
        appendLog("\u25B6 Configuring footage audio with saved presets");

        runMacAudioPresetStep("mxf", "Unscripted-MXF1", function (mxfResult) {
            appendLogMulti(mxfResult.log);
            if (!mxfResult.ok) {
                setStatus(mxfResult.message, "err");
                appendLog("\u2716 " + mxfResult.message);
                setBusy(false);
                return;
            }
            appendLog("\u2714 " + mxfResult.message);

            runMacAudioPresetStep("wav", "Unscripted-WAV3", function (wavResult) {
                appendLogMulti(wavResult.log);
                if (!wavResult.ok) {
                    setStatus(wavResult.message, "err");
                    appendLog("\u2716 " + wavResult.message);
                } else {
                    var done = "Footage audio configured with Unscripted-MXF1 and " +
                        "Unscripted-WAV3.";
                    setStatus(done, "ok");
                    appendLog("\u2714 " + wavResult.message);
                    appendLog("\u2714 " + done);
                }
                setBusy(false);
            });
        });
    }

    els.markClips.addEventListener("click", function () {
        runTask("Marking clips", "up_markClips()");
    });

    els.importFootage.addEventListener("click", function () {
        runTask("Importing and configuring footage", "up_importFootage()");
    });

    els.configureAudio.addEventListener("click", function () {
        if (isMacOS()) {
            runMacAudioPresetWorkflow();
        } else {
            runTask("Configuring footage audio", "up_configureFootageAudio()");
        }
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

    setStatus("Ready.");
    appendLog("Unscripted-Podcast panel loaded.");

})();
