"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function collection(items) {
    items.numItems = items.length;
    return items;
}

function mediaItem(name, mapping) {
    return {
        name: name,
        path: "/episode/01_Assets/Footage/" + name,
        getMediaPath: function () { return this.path; },
        getAudioChannelMapping: mapping,
        setColorLabel: function (index) {
            this.labelIndex = index;
            return 0;
        }
    };
}

var mxf = mediaItem("CAM1.MXF", {
    audioChannelsType: 0,
    audioClipsNumber: 1
});
var mov = mediaItem("ZENCASTR.mov", null);
var wav = mediaItem("AUDIO.WAV", {
    audioChannelsType: 0,
    audioClipsNumber: 3
});
var mp3 = mediaItem("AUDIO-FOR-SYNC.mp3", null);
var footageBin = {
    name: "Footage",
    children: collection([mxf, mov, wav, mp3])
};
var rootItem = { children: collection([footageBin]) };

var context = {
    console: console,
    $: { os: "Macintosh" },
    ProjectItemType: { BIN: 2 },
    File: function (filePath) {
        this.fsName = String(filePath);
        this.name = String(filePath).split("/").pop();
    },
    Folder: function (folderPath) { this.fsName = String(folderPath); },
    app: { project: { rootItem: rootItem } },
    up_escapeJSON: function (value) {
        return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    },
    up_result: function (ok, message, log) {
        return JSON.stringify({ ok: ok, message: message, log: (log || []).join("\n") });
    }
};
vm.createContext(context);
vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../host/episodeSetup.jsx"), "utf8"),
    context
);

var labelLog = [];
var labels = context.up_colorFootageItems(footageBin, labelLog);
assert.deepStrictEqual(
    { video: labels.video, audio: labels.audio, failed: labels.failed },
    { video: 2, audio: 2, failed: 0 }
);
assert.strictEqual(mxf.labelIndex, 10);
assert.strictEqual(mov.labelIndex, 10);
assert.strictEqual(wav.labelIndex, 13);
assert.strictEqual(mp3.labelIndex, 13);

context.up_getFootageContext = function () {
    return {
        ok: true,
        footageFolder: { fsName: "/episode/01_Assets/Footage" }
    };
};
var status = JSON.parse(context.up_getEpisodeSetupStatus());
assert.strictEqual(status.ok, true);
assert.strictEqual(status.imported, true);
assert.strictEqual(status.importedCount, 4);
assert.strictEqual(status.videoCount, 2);
assert.strictEqual(status.audioCount, 2);
assert.strictEqual(status.audioTargetCount, 2);
assert.strictEqual(status.audioConfiguredCount, 2);
assert.strictEqual(status.audioConfigured, true);

wav.getAudioChannelMapping.audioClipsNumber = 8;
status = JSON.parse(context.up_getEpisodeSetupStatus());
assert.strictEqual(status.audioConfiguredCount, 1);
assert.strictEqual(status.audioConfigured, false);

console.log("Episode setup status and label tests passed.");
