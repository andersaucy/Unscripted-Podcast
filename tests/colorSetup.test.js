"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var effectAdds = 0;
var clipNumber = 0;

function lumetriComponent() {
    return {
        displayName: "Lumetri Color",
        matchName: "AE.ADBE Lumetri",
        properties: []
    };
}

function makeClip(hasLumetri) {
    clipNumber++;
    return {
        components: hasLumetri ? [lumetriComponent()] : [],
        projectItem: { getMediaPath: function () { return "/media/CAM" + clipNumber + ".MXF"; } },
        start: { seconds: 0 },
        selected: false,
        setSelected: function (selected) { this.selected = !!selected; }
    };
}

function markerCollection() {
    var items = [];
    return {
        items: items,
        getFirstMarker: function () { return items.length ? items[0] : null; },
        getNextMarker: function (marker) {
            var index = items.indexOf(marker);
            return index >= 0 && index + 1 < items.length ? items[index + 1] : null;
        }
    };
}

function makeSequence(name, trackClips) {
    var tracks = [];
    var qeTracks = [];
    for (var t = 0; t < trackClips.length; t++) {
        var clips = trackClips[t];
        clips.numItems = clips.length;
        tracks.push({ clips: clips });
        var qeItems = [];
        for (var c = 0; c < clips.length; c++) {
            (function (clip) {
                qeItems.push({
                    type: "Clip",
                    addVideoEffect: function () {
                        effectAdds++;
                        clip.components.push(lumetriComponent());
                    }
                });
            }(clips[c]));
        }
        qeTracks.push({
            numItems: qeItems.length,
            getItemAt: function (index) { return this.items[index]; },
            items: qeItems
        });
    }
    tracks.numTracks = tracks.length;
    return {
        name: name,
        sequenceID: name + "-id",
        videoTracks: tracks,
        qeTracks: qeTracks,
        markers: markerCollection(),
        setPlayerPosition: function () {}
    };
}

var intro = makeSequence("INTRO-347", [[makeClip(false)]]);
var talk = makeSequence("TALK-347", [[makeClip(true)], [makeClip(false)]]);
var sequences = [intro, talk];
sequences.numSequences = sequences.length;
var activeSequence = null;

var context = {
    console: console,
    up_mc_podcastNumber: function () { return "347"; },
    up_mc_secondsToTicks: function (seconds) { return String(seconds); },
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
        name: "PODCAST347.prproj",
        sequences: sequences,
        openSequence: function (id) {
            for (var i = 0; i < sequences.length; i++) {
                if (sequences[i].sequenceID === id) { activeSequence = sequences[i]; }
            }
        }
    }
};
Object.defineProperty(context.app.project, "activeSequence", {
    get: function () { return activeSequence; },
    set: function (sequence) { activeSequence = sequence; }
});
context.qe = {
    project: {
        numSequences: sequences.length,
        getSequenceAt: function (index) {
            var sequence = sequences[index];
            return {
                name: sequence.name,
                getVideoTrackAt: function (trackIndex) {
                    return sequence.qeTracks[trackIndex];
                }
            };
        },
        getVideoEffectByName: function (name) {
            return name === "Lumetri Color" ? { name: name } : null;
        },
        getActiveSequence: function () {
            return activeSequence ? {
                name: activeSequence.name,
                getVideoTrackAt: function (index) {
                    return activeSequence.qeTracks[index];
                }
            } : null;
        }
    }
};

vm.createContext(context);
vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../host/colorSetup.jsx"), "utf8"),
    context
);

var applied = JSON.parse(context.up_applyLumetriEpisodeMulticams());
assert.strictEqual(applied.ok, true, applied.message);
assert.strictEqual(effectAdds, 2);
var coverage = context.up_colorEpisodeMulticamCoverage("347");
assert.strictEqual(coverage.targetCount, 3);
assert.strictEqual(coverage.configuredCount, 3);
assert.strictEqual(coverage.configured, true);

var analysisCoverage = context.up_colorEpisodeAnalysisCoverage("347");
assert.strictEqual(analysisCoverage.configured, false);
function addCompletionMarker(sequence) {
    var identity = context.up_colorSequenceAnalysisIdentity(sequence);
    sequence.markers.items.push({
        name: "Smart Camera Color Analyzed",
        comments: "version=1;groups=1;clips=" + identity.clipCount +
            ";signature=" + identity.signature
    });
}
addCompletionMarker(intro);
addCompletionMarker(talk);
analysisCoverage = context.up_colorEpisodeAnalysisCoverage("347");
assert.strictEqual(analysisCoverage.analyzedSequenceCount, 2);
assert.strictEqual(analysisCoverage.analyzedClipCount, 3);
assert.strictEqual(analysisCoverage.configured, true);

console.log("Multicam Lumetri tests passed.");
