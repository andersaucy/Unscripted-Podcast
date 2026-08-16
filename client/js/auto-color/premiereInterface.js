(function (global) {
    "use strict";
    var cs = new CSInterface();

    function parse(raw) {
        if (!raw || raw === "undefined") {
            return { ok: false, message: "Premiere returned no response.", log: "" };
        }
        try { return JSON.parse(raw); }
        catch (error) { return { ok: false, message: "Premiere host error: " + raw, log: "" }; }
    }

    function evaluate(call) {
        return new Promise(function (resolve) {
            cs.evalScript(call, function (raw) { resolve(parse(raw)); });
        });
    }

    global.UnscriptedPremiere = {
        prepareCameraGroups: function () {
            return evaluate("up_prepareIntelligentColorAnalysis()");
        },
        prepareEpisodeCameraGroups: function (groupKey) {
            return evaluate("up_prepareEpisodeIntelligentColorAnalysis(" +
                JSON.stringify(String(groupKey)) + ")");
        },
        ensureLumetri: function (sessionId) {
            return evaluate("up_ensureIntelligentColorLumetri(" +
                JSON.stringify(String(sessionId)) + ")");
        },
        applyRecommendations: function (payload) {
            var encoded = JSON.stringify(JSON.stringify(payload));
            return evaluate("up_applyIntelligentColorRecommendations(" + encoded + ")");
        }
    };
}(window));
