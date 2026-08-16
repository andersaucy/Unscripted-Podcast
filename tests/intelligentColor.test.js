"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var parameterNames = ["Exposure", "Contrast", "Highlights", "Shadows", "Whites",
    "Blacks", "Temperature", "Tint", "Saturation"];

function lumetriComponent() {
    var properties = parameterNames.map(function (name) {
        return { displayName: name, value: null, setValue: function (value) { this.value = value; } };
    });
    properties.getParamForDisplayName = function (name) {
        for (var i = 0; i < properties.length; i++) {
            if (properties[i].displayName === name) { return properties[i]; }
        }
        return null;
    };
    return { displayName: "Lumetri Color", matchName: "AE.ADBE Lumetri", properties: properties };
}

function clip(id, name, mediaPath, duration) {
    return {
        nodeId: id,
        name: name,
        projectItem: { getMediaPath: function () { return mediaPath; } },
        duration: { seconds: duration },
        inPoint: { seconds: 2 },
        components: []
    };
}

var cam1a = clip("1", "SHOW-CAM1-A.MXF", "/episode/CAM1/SHOW-CAM1-A.MXF", 40);
var cam1b = clip("2", "SHOW-CAM1-B.MXF", "/episode/CAM1/SHOW-CAM1-B.MXF", 60);
var cam2 = clip("3", "SHOW-CAM2.MXF", "/episode/CAM2/SHOW-CAM2.MXF", 50);
var videoClips = [cam1a, cam1b, cam2];
videoClips.numItems = videoClips.length;
var tracks = [{ clips: videoClips }];
tracks.numTracks = tracks.length;
var sequence = {
    name: "Interview",
    sequenceID: "sequence-1",
    videoTracks: tracks,
    getSelection: function () { return [cam1a, cam1b, cam2]; }
};
var sequences = [sequence];
sequences.numSequences = 1;

var qeItems = videoClips.map(function (item) {
    return {
        type: "Clip",
        addVideoEffect: function () { item.components.push(lumetriComponent()); }
    };
});
var qeTrack = {
    numItems: qeItems.length,
    getItemAt: function (index) { return qeItems[index]; }
};
var qeSequence = {
    name: "Interview",
    getVideoTrackAt: function () { return qeTrack; }
};

var context = {
    console: console,
    Date: Date,
    JSON: JSON,
    up_escapeJSON: function (value) {
        return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')
            .replace(/\n/g, "\\n");
    },
    up_result: function (ok, message, log) {
        return JSON.stringify({ ok: ok, message: message, log: (log || []).join("\n") });
    }
};
context.app = {
    enableQE: function () {},
    project: {
        activeSequence: sequence,
        sequences: sequences,
        openSequence: function () {}
    }
};
context.qe = {
    project: {
        numSequences: 1,
        getSequenceAt: function () { return qeSequence; },
        getActiveSequence: function () { return qeSequence; },
        getVideoEffectByName: function () { return { name: "Lumetri Color" }; }
    }
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../host/colorSetup.jsx"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../host/intelligentColor.jsx"), "utf8"), context);

context.up_mc_podcastNumber = function () { return "347"; };
sequence.name = "TALK-347";
var episodePrepared = JSON.parse(
    context.up_prepareEpisodeIntelligentColorAnalysis("talk")
);
assert.strictEqual(episodePrepared.ok, true, episodePrepared.message);
assert.strictEqual(episodePrepared.scope, "all clips in TALK-347");
assert.strictEqual(episodePrepared.groups.length, 2);
sequence.name = "Interview";

var prepared = JSON.parse(context.up_prepareIntelligentColorAnalysis());
assert.strictEqual(prepared.ok, true, prepared.message);
assert.strictEqual(prepared.groups.length, 2);
assert.strictEqual(prepared.groups[0].label, "CAM1");
assert.strictEqual(prepared.groups[0].clip_count, 2);
assert.strictEqual(prepared.groups[0].representative_name, "SHOW-CAM1-B.MXF");

var ensured = JSON.parse(context.up_ensureIntelligentColorLumetri(prepared.session_id));
assert.strictEqual(ensured.ok, true, ensured.message);
assert.strictEqual(cam1a.components.length, 1);
assert.strictEqual(cam1b.components.length, 1);
assert.strictEqual(cam2.components.length, 1);

function recommendations(exposure) {
    return { exposure: exposure, contrast: 8, highlights: -20, shadows: 16,
        whites: -4, blacks: -3, temperature: 2, tint: -1, saturation: 104 };
}
var payload = {
    session_id: prepared.session_id,
    groups: [
        { id: prepared.groups[0].id, recommendations: recommendations(0.35) },
        { id: prepared.groups[1].id, recommendations: recommendations(-0.15) }
    ]
};
// Premiere's ExtendScript runtime does not expose the browser JSON global.
context.JSON = undefined;
var applied = JSON.parse(context.up_applyIntelligentColorRecommendations(JSON.stringify(payload)));
assert.strictEqual(applied.ok, true, applied.message);
assert.strictEqual(cam1a.components[0].properties[0].value, 0.35);
assert.strictEqual(cam1b.components[0].properties[0].value, 0.35);
assert.strictEqual(cam2.components[0].properties[0].value, -0.15);

console.log("Intelligent camera-group color tests passed.");
