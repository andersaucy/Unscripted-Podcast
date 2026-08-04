"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function collection(items) {
    items.numItems = items.length;
    return items;
}

var episodeNumber = {
    displayName: "Episode Number",
    value: 123,
    getValue: function () { return this.value; },
    setValue: function (value) {
        this.value = value;
        return true;
    }
};
var mogrtProperties = collection([episodeNumber]);
mogrtProperties.getParamForDisplayName = function (name) {
    if (name !== "Episode Number") { return null; }
    // Premiere may return a separate wrapper for the same underlying MOGRT
    // parameter through getParamForDisplayName and indexed enumeration.
    return {
        displayName: episodeNumber.displayName,
        getValue: function () { return episodeNumber.getValue(); },
        setValue: function (value) { return episodeNumber.setValue(value); }
    };
};
var graphicClip = {
    name: "Unscripted-EpisodeNumber",
    getMGTComponent: function () {
        return { properties: mogrtProperties };
    }
};
var clipIntro = {
    name: "_CLIP INTRO",
    sequenceID: "clip-intro-id",
    videoTracks: collection([
        { clips: collection([]) },
        { clips: collection([graphicClip]) }
    ])
};
var lowRes = { name: "LowRes", sequenceID: "lowres-id" };
var openedSequenceID = "";

var context = {
    console: console,
    File: function (filePath) {
        this.name = String(filePath).split("/").pop();
    },
    app: {
        project: {
            name: "PODCAST347-DAVID-DAY-CHINA.prproj",
            path: "/episode/00_Projects/PODCAST347-DAVID-DAY-CHINA.prproj",
            sequences: [clipIntro, lowRes],
            openSequence: function (sequenceID) { openedSequenceID = sequenceID; }
        }
    },
    up_result: function (ok, message, log) {
        return JSON.stringify({ ok: ok, message: message, log: (log || []).join("\n") });
    }
};
vm.createContext(context);
vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../host/episodeIdentity.jsx"), "utf8"),
    context
);

assert.strictEqual(
    context.up_episodeNumberFromProjectName("EDIT_PODCAST347_GUEST.prproj"),
    "347"
);
assert.strictEqual(context.up_episodeLowResName("347"), "347 LowRes_v1");

var result = JSON.parse(context.up_applyEpisodeIdentity());
assert.strictEqual(result.ok, true);
assert.strictEqual(episodeNumber.value, 347);
assert.strictEqual(lowRes.name, "347 LowRes_v1");
assert.strictEqual(openedSequenceID, "clip-intro-id");

var state = context.up_getEpisodeIdentityState();
assert.strictEqual(state.graphicConfigured, true);
assert.strictEqual(state.lowResConfigured, true);

// A second run recognizes completed work and leaves the numeric value intact.
result = JSON.parse(context.up_applyEpisodeIdentity());
assert.strictEqual(result.ok, true);
assert.strictEqual(episodeNumber.value, 347);
assert.strictEqual(lowRes.name, "347 LowRes_v1");

// A Premiere-native graphic is rejected without invoking a UI fallback or
// renaming LowRes, because only the AE MOGRT control is authoritative.
var nativeIntro = {
    name: "_CLIP INTRO",
    sequenceID: "native-intro-id",
    videoTracks: collection([
        { clips: collection([]) },
        { clips: collection([{ name: "Graphic" }]) }
    ])
};
var nativeLowRes = { name: "LowRes", sequenceID: "native-lowres-id" };
var nativeContext = {
    console: console,
    File: context.File,
    app: {
        project: {
            name: "PODCAST348-NATIVE-GRAPHIC.prproj",
            path: "/episode/00_Projects/PODCAST348-NATIVE-GRAPHIC.prproj",
            sequences: [nativeIntro, nativeLowRes],
            openSequence: function () {}
        }
    },
    up_result: context.up_result
};
vm.createContext(nativeContext);
vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../host/episodeIdentity.jsx"), "utf8"),
    nativeContext
);

var nativeResult = JSON.parse(nativeContext.up_applyEpisodeIdentity());
assert.strictEqual(nativeResult.ok, false);
assert.ok(nativeResult.message.indexOf('AE MOGRT control named "Episode Number"') !== -1);
assert.strictEqual(nativeLowRes.name, "LowRes");

console.log("Episode Number MOGRT and LowRes identity tests passed.");
