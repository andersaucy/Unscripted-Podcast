"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var context = {
    console: console,
    Time: function () { this.seconds = 0; },
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
        source("PODCAST347-GUEST-TOPIC-CAM1.MXF"),
        source("PODCAST347-GUEST-TOPIC-CAM2.MXF"),
        source("PODCAST347-GUEST-TOPIC-AUDIO-P1.WAV"),
        source("PODCAST347-GUEST-TOPIC-ZENCASTR.mov")
    ];
    if (includeSyncMp3) {
        media.push(source("PODCAST347-GUEST-TOPIC-AUDIO-FOR-SYNC.mp3"));
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

var forSyncContext = talkContext(false);
forSyncContext.media.push(
    source("PODCAST347-GUEST-TOPIC-FORSYNC.mp3")
);
var forSyncGroup = context.up_mc_buildGroup("talk", forSyncContext);
assert.strictEqual(forSyncGroup.ok, true);
assert(forSyncGroup.items.some(function (item) {
    return item.name.indexOf("FORSYNC.mp3") !== -1;
}));
assert.strictEqual(forSyncGroup.zencastrSidecar.ext, "mov");

var uniqueEpisodeMp3Context = talkContext(false);
uniqueEpisodeMp3Context.media.push(
    source("PODCAST347-GUEST-TOPIC-REFERENCE.mp3")
);
var uniqueEpisodeMp3Group = context.up_mc_buildGroup("talk", uniqueEpisodeMp3Context);
assert.strictEqual(uniqueEpisodeMp3Group.ok, true);
assert(uniqueEpisodeMp3Group.items.some(function (item) {
    return item.name.indexOf("REFERENCE.mp3") !== -1;
}));
assert.strictEqual(uniqueEpisodeMp3Group.zencastrSidecar.ext, "mov");

var directGroup = context.up_mc_buildGroup("talk", talkContext(false));
assert.strictEqual(directGroup.ok, true);
assert(directGroup.items.some(function (item) { return item.ext === "mov"; }));
assert.strictEqual(directGroup.zencastrSidecar, null);

var movItem = {
    name: "PODCAST347-GUEST-TOPIC-ZENCASTR.mov",
    path: "/media/PODCAST347-GUEST-TOPIC-ZENCASTR.mov"
};
var mp3Item = {
    name: "PODCAST347-GUEST-TOPIC-AUDIO-FOR-SYNC.mp3",
    path: "/media/PODCAST347-GUEST-TOPIC-AUDIO-FOR-SYNC.mp3"
};
var wav1Item = {
    name: "PODCAST347-GUEST-TOPIC-AUDIO-P1.WAV",
    path: "/media/PODCAST347-GUEST-TOPIC-AUDIO-P1.WAV",
    duration: 30
};
var wav2Item = {
    name: "PODCAST347-GUEST-TOPIC-AUDIO-P2.WAV",
    path: "/media/PODCAST347-GUEST-TOPIC-AUDIO-P2.WAV",
    duration: 22
};
function clipCollection(clips) {
    clips.numItems = clips.length;
    return clips;
}
function emptyTrack() { return { clips: clipCollection([]) }; }
function makeClip(projectItem, seconds, clips, duration) {
    var clipDuration = Number(duration || projectItem.duration || 0);
    var clip = {
        projectItem: projectItem,
        start: { seconds: Number(seconds) },
        end: { seconds: Number(seconds) + clipDuration },
        selected: false,
        setSelected: function (selected) { clip.selected = !!selected; },
        move: function (moveBy) {
            var delta = Number(moveBy.seconds);
            clip.start.seconds += delta;
            clip.end.seconds += delta;
            return 0;
        },
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
        overwriteClip: function (projectItem, time) {
            var seconds = Number(time);
            if (seconds > 1000000000) { seconds /= 254016000000; }
            clips.push(makeClip(
                projectItem,
                seconds,
                clips,
                projectItem.duration
            ));
            clips.numItems = clips.length;
            return true;
        }
    };
    for (var i = 0; i < (initial || []).length; i++) {
        clips.push(makeClip(
            initial[i].item,
            initial[i].seconds,
            clips,
            initial[i].duration
        ));
    }
    clips.numItems = clips.length;
    return track;
}

var cameraItems = [];
for (var camera = 1; camera <= 4; camera++) {
    cameraItems.push({
        name: "PODCAST347-GUEST-TOPIC-CAM" + camera + ".MXF",
        path: "/media/PODCAST347-GUEST-TOPIC-CAM" + camera + ".MXF"
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
    audioTrack([{ item: wav1Item, seconds: 10 }]),
    audioTrack([{ item: wav1Item, seconds: 10 }]),
    audioTrack([{ item: wav1Item, seconds: 10 }]),
    audioTrack([{ item: wav2Item, seconds: 52 }]),
    audioTrack([{ item: wav2Item, seconds: 52 }]),
    audioTrack([{ item: wav2Item, seconds: 52 }])
];
audioTracks.numTracks = audioTracks.length;
var sequenceMarkers = [];
var markers = {
    getFirstMarker: function () {
        return sequenceMarkers.length ? sequenceMarkers[0] : null;
    },
    getNextMarker: function (marker) {
        var index = sequenceMarkers.indexOf(marker);
        return index >= 0 && index + 1 < sequenceMarkers.length ?
            sequenceMarkers[index + 1] : null;
    },
    createMarker: function (seconds) {
        var marker = { name: "", start: { seconds: Number(seconds) } };
        sequenceMarkers.push(marker);
        return marker;
    }
};
var insertion = null;
var sequence = {
    name: "TALK-347",
    sequenceID: "talk-347-id",
    videoTracks: videoTracks,
    audioTracks: audioTracks,
    markers: markers,
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
assert.strictEqual(preparation.audioTracksToAdd, 0);
assert.strictEqual(preparation.audioAfterTrack, 0);

// Simulate Premiere's Add Tracks result: only V2 is inserted after CAM1.
videoTracks.splice(1, 0, emptyTrack());
videoTracks.numTracks = videoTracks.length;

// Simulate the editor's manual WAV layout. The automation recognizes these
// original TrackItems and proceeds with Zencastr placement without rebuilding
// or moving recorder media.
function moveTrackItem(sourceTrack, destinationTrack, seconds) {
    var moved = sourceTrack.clips[0];
    var duration = Number(moved.end.seconds) - Number(moved.start.seconds);
    sourceTrack.clips.splice(0, 1);
    sourceTrack.clips.numItems = sourceTrack.clips.length;
    moved.start.seconds = Number(seconds);
    moved.end.seconds = Number(seconds) + duration;
    destinationTrack.clips.push(moved);
    destinationTrack.clips.numItems = destinationTrack.clips.length;
}
for (var wavTarget = 0; wavTarget < 3; wavTarget++) {
    moveTrackItem(audioTracks[wavTarget + 1], audioTracks[wavTarget], 10);
}
for (wavTarget = 0; wavTarget < 3; wavTarget++) {
    moveTrackItem(audioTracks[wavTarget + 4], audioTracks[wavTarget], 40);
}

var finalized = JSON.parse(context.up_finalizeTalkMulticam());
assert.strictEqual(finalized.ok, true, finalized.message);
assert.strictEqual(sequenceMarkers.length, 2);
assert.strictEqual(sequenceMarkers[0].name, "Unscripted Zencastr Sync");
assert.strictEqual(sequenceMarkers[0].start.seconds, 12.5);
assert.strictEqual(sequenceMarkers[1].name, "Unscripted WAV P2 Start");
assert.strictEqual(sequenceMarkers[1].start.seconds, 40);
assert.strictEqual(context.up_mc_secondsToTicks(12.5), "3175200000000");
assert.strictEqual(context.up_mc_timesMatch(12.5, 12.54), true);
assert.strictEqual(context.up_mc_timesMatch(12.5, 12.56), false);
assert.strictEqual(insertion.seconds, 12.5);
assert.strictEqual(insertion.videoIndex, 1);
assert.strictEqual(insertion.audioIndex, 3);
assert(context.up_mc_trackHasPathAtTime(audioTracks[0], wav1Item.path, 10));
assert(context.up_mc_trackHasPathAtTime(audioTracks[0], wav2Item.path, 40));
assert(context.up_mc_trackHasPathAtTime(audioTracks[1], wav1Item.path, 10));
assert(context.up_mc_trackHasPathAtTime(audioTracks[1], wav2Item.path, 40));
assert(context.up_mc_trackHasPathAtTime(audioTracks[2], wav1Item.path, 10));
assert(context.up_mc_trackHasPathAtTime(audioTracks[2], wav2Item.path, 40));
assert(context.up_mc_trackHasPathAtTime(audioTracks[3], movItem.path, 12.5));
assert(!context.up_mc_trackHasPathAtTime(audioTracks[0], mp3Item.path, 12.5));
for (var lowerTrack = 3; lowerTrack < audioTracks.numTracks; lowerTrack++) {
    assert(!context.up_mc_findSequenceClipByPath(
        [audioTracks[lowerTrack]],
        wav1Item.path
    ));
    assert(!context.up_mc_findSequenceClipByPath(
        [audioTracks[lowerTrack]],
        wav2Item.path
    ));
}

var rerun = JSON.parse(context.up_finalizeTalkMulticam());
assert.strictEqual(rerun.ok, true, rerun.message);
assert(rerun.message.indexOf("organized") !== -1);

console.log("Multicam setup tests passed.");
