(function (global) {
    "use strict";
    global.UnscriptedLumetri = {
        apply: function (sessionId, analyzedGroups) {
            var groups = analyzedGroups.map(function (group) {
                return { id: group.id, recommendations: group.analysis.recommendations };
            });
            return global.UnscriptedPremiere.ensureLumetri(sessionId).then(function (prepared) {
                if (!prepared.ok) { throw new Error(prepared.message); }
                // QE effect insertion can take a moment to appear in the DOM.
                return new Promise(function (resolve) {
                    window.setTimeout(resolve, 1400);
                });
            }).then(function () {
                return global.UnscriptedPremiere.applyRecommendations({
                    schema_version: "1.0",
                    session_id: sessionId,
                    groups: groups
                });
            });
        }
    };
}(window));
