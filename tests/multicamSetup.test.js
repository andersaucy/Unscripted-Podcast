"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var context = {
    console: console,
    File: function (filePath) {
        this.name = String(filePath).split("/").pop();
    },
    up_result: function (ok, message, log) {
        return JSON.stringify({ ok: ok, message: message, log: (log || []).join("\n") });
    },
    up_getProjectItemMediaPath: function (item) { return item.path || ""; },
    up_fileExtension: function (filePath) {
        var match = String(filePath).toLowerCase().match(/\.([^.]+)$/);
        return match ? match[1] : "";
    },
    up_normalizeMediaPath: function (filePath) {
        return String(filePath || "").toLowerCase();
    },
    up_escapeJSON: function (value) {
        return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }
};
vm.createContext(context);
vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../host/multicamSetup.jsx"), "utf8"),
    context
);

function source(name) {
    var mediaPath = "/media/" + name;
    return {
        item: { name: name, path: mediaPath, isOffline: function () { return false; } },
        name: name,
        mediaPath: mediaPath,
        ext: context.up_fileExtension(mediaPath),
        normalizedName: context.up_mc_normalizedBase(name)
    };
}

function talkContext(includeSyncMp3) {
    var media = [
        source("PODCAST347-DAVID-DAY-CHINA-CAM1.MXF"),
        source("PODCAST347-DAVID-DAY-CHINA-CAM2.MXF"),
        source("PODCAST347-DAVID-DAY-CHINA-AUDIO-P1.WAV"),
        source("PODCAST347-DAVID-DAY-CHINA-ZENCASTR.mov")
    ];
    if (includeSyncMp3) {
        media.push(source("PODCAST347-DAVID-DAY-CHINA-AUDIO-FOR-SYNC.mp3"));
    }
    return {
        podcastNumber: "347",
        podcastToken: "PODCAST347",
        media: media
    };
}

var proxyGroup = context.up_mc_buildGroup("talk", talkContext(true));
assert.strictEqual(proxyGroup.ok, true);
assert(proxyGroup.items.some(function (item) { return item.ext === "mp3"; }));
assert(!proxyGroup.items.some(function (item) { return item.ext === "mov"; }));
assert.strictEqual(proxyGroup.zencastrSidecar.ext, "mov");

var directGroup = context.up_mc_buildGroup("talk", talkContext(false));
assert.strictEqual(directGroup.ok, true);
assert(directGroup.items.some(function (item) { return item.ext === "mov"; }));
assert.strictEqual(directGroup.zencastrSidecar, null);

var movItem = {
    name: "PODCAST347-DAVID-DAY-CHINA-ZENCASTR.mov",
    path: "/media/PODCAST347-DAVID-DAY-CHINA-ZENCASTR.mov"
};
var mp3Item = {
    name: "PODCAST347-DAVID-DAY-CHINA-AUDIO-FOR-SYNC.mp3",
    path: "/media/PODCAST347-DAVID-DAY-CHINA-AUDIO-FOR-SYNC.mp3"
};
var wav1Item = {
    name: "PODCAST347-DAVID-DAY-CHINA-AUDIO-P1.WAV",
    path: "/media/PODCAST347-DAVID-DAY-CHINA-AUDIO-P1.WAV"
};
var wav2Item = {
    name: "PODCAST347-DAVID-DAY-CHINA-AUDIO-P2.WAV",
    path: "/media/PODCAST347-DAVID-DAY-CHINA-AUDIO-P2.WAV"
};
function clipCollection(clips) {
    clips.numItems = clips.length;
    return clips;
}
function emptyTrack() { return { clips: clipCollection([]) }; }
function makeClip(projectItem, seconds, clips) {
    var clip = {
        projectItem: projectItem,
        start: { seconds: Number(seconds) },
        remove: function () {
            var index = clips.indexOf(clip);
            if (index !== -1) { clips.splice(index, 1); }
            clips.numItems = clips.length;
        }
    };
    return clip;
}
function audioTrack(initial) {
    var clips = clipCollection([]);
    var track = {
        clips: clips,
        overwriteClip: function (projectItem, seconds) {
            clips.push(makeClip(projectItem, Number(seconds), clips));
            clips.numItems = clips.length;
            return true;
        }
    };
    for (var i = 0; i < (initial || []).length; i++) {
        clips.push(makeClip(initial[i].item, initial[i].seconds, clips));
    }
    clips.numItems = clips.length;
    return track;
}

var cameraItems = [];
for (var camera = 1; camera <= 4; camera++) {
    cameraItems.push({
        name: "PODCAST347-DAVID-DAY-CHINA-CAM" + camera + ".MXF",
        path: "/media/PODCAST347-DAVID-DAY-CHINA-CAM" + camera + ".MXF"
    });
}

var videoTracks = [];
for (camera = 0; camera < cameraItems.length; camera++) {
    var cameraTrack = emptyTrack();
    cameraTrack.clips.push({ projectItem: cameraItems[camera], start: { seconds: 0 } });
    cameraTrack.clips.numItems = cameraTrack.clips.length;
    videoTracks.push(cameraTrack);
}
videoTracks.numTracks = videoTracks.length;
var audioTracks = [
    audioTrack([{ item: mp3Item, seconds: 12.5 }]),
    audioTrack([
        { item: wav1Item, seconds: 10 },
        { item: wav2Item, seconds: 40 }
    ])
];
audioTracks.numTracks = audioTracks.length;
var insertion = null;
var sequence = {
    name: "TALK-347",
    sequenceID: "talk-347-id",
    videoTracks: videoTracks,
    audioTracks: audioTracks,
    overwriteClip: function (projectItem, seconds, videoIndex, audioIndex) {
        var ext = context.up_fileExtension(projectItem.path);
        if (ext === "mov") {
            insertion = {
                projectItem: projectItem,
                seconds: Number(seconds),
                videoIndex: videoIndex,
                audioIndex: audioIndex
            };
            var videoClips = this.videoTracks[videoIndex].clips;
            videoClips.push(makeClip(projectItem, Number(seconds), videoClips));
            videoClips.numItems = videoClips.length;
        }
        var channelCount = ext === "wav" ? 3 : 1;
        for (var channel = 0; channel < channelCount; channel++) {
            this.audioTracks[audioIndex + channel].overwriteClip(projectItem, seconds);
        }
        return true;
    }
};
var introSequence = {
    name: "INTRO-347",
    sequenceID: "intro-347-id"
};
var sequences = [introSequence, sequence];
sequences.numSequences = sequences.length;
var openedSequenceIds = [];
context.app = {
    project: {
        name: "PODCAST347.prproj",
        rootItem: {},
        sequences: sequences,
        openSequence: function (sequenceID) { openedSequenceIds.push(sequenceID); }
    }
};
context.up_visitProjectItems = function (root, callback) { callback(movItem); };

var opened = JSON.parse(context.up_openEpisodeMulticams());
assert.strictEqual(opened.ok, true, opened.message);
assert.deepStrictEqual(openedSequenceIds.slice(-2), ["intro-347-id", "talk-347-id"]);

var preparation = JSON.parse(context.up_prepareTalkTrackLayout());
assert.strictEqual(preparation.ok, true, preparation.message);
assert.strictEqual(preparation.videoTracksToAdd, 1);
assert.strictEqual(preparation.audioTracksToAdd, 5);

// Simulate Premiere's Add Tracks result: V2 inserted after CAM1 and five
// reserved audio tracks inserted before all existing camera/source audio.
videoTracks.splice(1, 0, emptyTrack());
videoTracks.numTracks = videoTracks.length;
for (var reserved = 0; reserved < 5; reserved++) {
    audioTracks.splice(0, 0, audioTrack([]));
}
audioTracks.numTracks = audioTracks.length;

var finalized = JSON.parse(context.up_finalizeTalkMulticam());
assert.strictEqual(finalized.ok, true, finalized.message);
assert.strictEqual(insertion.seconds, 12.5);
assert.strictEqual(insertion.videoIndex, 1);
assert.strictEqual(insertion.audioIndex, 4);
assert(context.up_mc_trackHasPathAtTime(audioTracks[0], wav1Item.path, 10));
assert(context.up_mc_trackHasPathAtTime(audioTracks[0], wav2Item.path, 40));
assert(context.up_mc_trackHasPathAtTime(audioTracks[1], wav1Item.path, 10));
assert(context.up_mc_trackHasPathAtTime(audioTracks[1], wav2Item.path, 40));
assert(context.up_mc_trackHasPathAtTime(audioTracks[2], wav1Item.path, 10));
assert(context.up_mc_trackHasPathAtTime(audioTracks[2], wav2Item.path, 40));
assert(context.up_mc_trackHasPathAtTime(audioTracks[3], mp3Item.path, 12.5));
assert(context.up_mc_trackHasPathAtTime(audioTracks[4], movItem.path, 12.5));

var rerun = JSON.parse(context.up_finalizeTalkMulticam());
assert.strictEqual(rerun.ok, true, rerun.message);
assert(rerun.message.indexOf("organized") !== -1);

console.log("Multicam setup tests passed.");
