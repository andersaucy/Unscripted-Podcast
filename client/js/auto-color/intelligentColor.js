(function (global) {
    "use strict";
    var cs = new CSInterface();
    var state = { sessionId: null, groups: [], normalizationBlocked: false };

    function el(id) { return document.getElementById(id); }
    function log(message) {
        var target = el("log");
        var date = new Date();
        function pad(value) { return value < 10 ? "0" + value : String(value); }
        target.textContent += "[" + pad(date.getHours()) + ":" + pad(date.getMinutes()) +
            ":" + pad(date.getSeconds()) + "] " + message + "\n";
        target.scrollTop = target.scrollHeight;
    }
    function status(message, kind) {
        var target = el("statusText");
        target.textContent = message;
        target.className = "status__text" + (kind ? " is-" + kind : "");
    }
    function busy(value) {
        el("btnAnalyzeCameraGroups").disabled = value;
        el("colorProgress").hidden = !value;
    }
    function progress(done, total, label) {
        el("colorProgressBar").style.width = (total ? Math.round(done / total * 100) : 0) + "%";
        el("colorProgressText").textContent = label;
    }

    function usePreparedGroups(prepared) {
        if (!prepared.ok) { throw new Error(prepared.message); }
        state.sessionId = prepared.session_id;
        state.groups = prepared.groups;
        log("   " + prepared.message + " Scope: " + prepared.scope + ".");
        return prepared;
    }

    function analyzePreparedGroups(labelPrefix) {
        var completed = 0;
        var prefix = labelPrefix ? labelPrefix + " · " : "";
        return Promise.all(state.groups.map(function (group) {
            return global.UnscriptedColorApi.analyze(group).then(function (analysis) {
                group.analysis = analysis;
                completed++;
                progress(completed, state.groups.length,
                    prefix + "analyzed " + completed + " of " + state.groups.length + " groups");
                log("   " + prefix + group.label + ": analyzed " +
                    group.representative_name + " at " +
                    group.timestamp_seconds.toFixed(1) + "s.");
                return group;
            });
        }));
    }

    function requiresNormalization(groups) {
        for (var i = 0; i < groups.length; i++) {
            var metadata = groups[i].analysis.media_metadata || {};
            if (metadata.normalization_required) { return true; }
        }
        return false;
    }

    function dispatchCompletion() {
        try {
            var completionEvent = new CSEvent(
                "com.smart.camera.color.applied", "APPLICATION"
            );
            completionEvent.data = state.sessionId;
            cs.dispatchEvent(completionEvent);
        } catch (eventError) {}
    }

    function analyze() {
        busy(true);
        progress(0, 1, "Discovering camera groups…");
        status("Discovering camera groups…", "busy");
        log("▶ Analyzing camera groups");
        global.UnscriptedPremiere.prepareCameraGroups().then(function (prepared) {
            usePreparedGroups(prepared);
            progress(0, state.groups.length, "Checking local color analyzer…");
            return global.UnscriptedColorApi.ensureAvailable();
        }).then(function () {
            return analyzePreparedGroups("");
        }).then(function () {
            showPreview();
            busy(false);
            status("Review proposed camera-group corrections.", "ok");
            log("✔ Analysis complete. Review values before applying.");
        }).catch(function (error) {
            busy(false);
            status(error.message, "err");
            log("✖ " + error.message);
        });
    }

    function showPreview() {
        var container = el("colorPreviewGroups");
        state.normalizationBlocked = false;
        container.textContent = "";
        state.groups.forEach(function (group) {
            var metadata = group.analysis.media_metadata || {};
            var card = document.createElement("section");
            card.className = "color-preview__group";
            var title = document.createElement("h3");
            title.textContent = group.label + " · " + group.clip_count + " clip(s)";
            card.appendChild(title);
            var meta = document.createElement("p");
            var camera = [metadata.camera_make, metadata.camera_model]
                .filter(Boolean).join(" ") || "Camera unknown";
            meta.textContent = camera + " · " + group.representative_name + " · confidence " +
                Math.round(group.analysis.confidence * 100) + "%";
            card.appendChild(meta);
            var profile = document.createElement("span");
            profile.className = "color-preview__profile" +
                (metadata.normalization_required ? " is-warning" : "");
            profile.textContent = metadata.detected_profile || "unknown profile";
            card.appendChild(profile);
            if (metadata.normalization_required) { state.normalizationBlocked = true; }
            var values = document.createElement("dl");
            values.className = "color-preview__values";
            Object.keys(group.analysis.recommendations).forEach(function (name) {
                var term = document.createElement("dt");
                term.textContent = name;
                var definition = document.createElement("dd");
                definition.textContent = group.analysis.recommendations[name];
                values.appendChild(term);
                values.appendChild(definition);
            });
            card.appendChild(values);
            if (group.analysis.warnings && group.analysis.warnings.length) {
                var warning = document.createElement("p");
                warning.className = "color-preview__warning";
                warning.textContent = group.analysis.warnings.join(" ");
                card.appendChild(warning);
            }
            container.appendChild(card);
        });
        el("colorNormalizationWarning").hidden = !state.normalizationBlocked;
        el("colorNormalizationWarning").textContent = state.normalizationBlocked ?
            "Log or HDR media was detected. Application is paused until a technical normalization profile is available." : "";
        el("btnApplyColor").disabled = state.normalizationBlocked;
        el("colorPreview").hidden = false;
    }

    function closePreview() { el("colorPreview").hidden = true; }

    function apply() {
        if (state.normalizationBlocked) { return; }
        el("btnApplyColor").disabled = true;
        el("btnCancelColor").disabled = true;
        status("Applying camera-group Lumetri values…", "busy");
        log("▶ Applying analyzed Lumetri values");
        global.UnscriptedLumetri.apply(state.sessionId, state.groups).then(function (result) {
            if (!result.ok) { throw new Error(result.message); }
            closePreview();
            status(result.message, "ok");
            log("✔ " + result.message);
            dispatchCompletion();
        }).catch(function (error) {
            status(error.message, "err");
            log("✖ " + error.message);
        }).then(function () {
            el("btnApplyColor").disabled = false;
            el("btnCancelColor").disabled = false;
        });
    }

    /** Analyze and apply both episode multicams without the review dialog. */
    function autoAnalyzeEpisodeMulticams() {
        var sequenceKeys = ["intro", "talk"];
        var summaries = [];
        busy(true);
        progress(0, 2, "Starting automatic camera color…");
        log("▶ Automatically analyzing INTRO and TALK camera groups");
        return global.UnscriptedColorApi.ensureAvailable().then(function () {
            var chain = Promise.resolve();
            sequenceKeys.forEach(function (key, sequenceIndex) {
                chain = chain.then(function () {
                    var label = key.toUpperCase();
                    progress(sequenceIndex, 2, label + " · discovering camera groups…");
                    return global.UnscriptedPremiere.prepareEpisodeCameraGroups(key);
                }).then(function (prepared) {
                    usePreparedGroups(prepared);
                    return analyzePreparedGroups(key.toUpperCase());
                }).then(function (groups) {
                    if (requiresNormalization(groups)) {
                        throw new Error(key.toUpperCase() +
                            " contains log or HDR media that needs technical normalization.");
                    }
                    progress(sequenceIndex + 0.8, 2,
                        key.toUpperCase() + " · applying suggested color…");
                    return global.UnscriptedLumetri.apply(state.sessionId, groups);
                }).then(function (result) {
                    if (!result.ok) { throw new Error(result.message); }
                    summaries.push(result.message);
                    dispatchCompletion();
                    progress(sequenceIndex + 1, 2,
                        key.toUpperCase() + " camera color complete.");
                    log("✔ " + key.toUpperCase() + ": " + result.message);
                });
            });
            return chain;
        }).then(function () {
            busy(false);
            return {
                ok: true,
                message: "Applied consistent camera-group color to INTRO and TALK.",
                log: summaries.join("\n")
            };
        }, function (error) {
            busy(false);
            throw error;
        });
    }

    global.UnscriptedIntelligentColor = {
        autoAnalyzeEpisodeMulticams: autoAnalyzeEpisodeMulticams
    };

    el("btnAnalyzeCameraGroups").addEventListener("click", analyze);
    el("btnApplyColor").addEventListener("click", apply);
    el("btnCancelColor").addEventListener("click", closePreview);
}(window));
