"use strict";

var assert = require("assert");
var fs = require("fs");
var os = require("os");
var path = require("path");
var googleDocs = require("../client/js/googleDocs.js");

var validText = [
    "Production notes remain untouched above the clip block.",
    "",
    "TITLE= First clip",
    "FROM= 08:29",
    "TO= 10:14",
    "",
    "TITLE = Second clip",
    "FROM=1:01:47",
    "TO = 1:03:02"
].join("\r\n");

var validation = googleDocs.validateClipText(validText);
assert.strictEqual(validation.ok, true);
assert.strictEqual(validation.titleCount, 2);
assert.strictEqual(validation.rangeCount, 2);
assert.strictEqual(validation.warnings.length, 0);
assert.strictEqual(validation.text.indexOf("\r"), -1);

var invalid = googleDocs.validateClipText([
    "TITLE= Broken range",
    "FROM= 10:00",
    "TO= 09:59"
].join("\n"));
assert.strictEqual(invalid.ok, false);
assert.strictEqual(invalid.rangeCount, 0);
assert.ok(invalid.warnings.length > 0);

var temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "unscripted-google-docs-"));
try {
    var configDirectory = path.join(temporaryRoot, "config");
    fs.mkdirSync(configDirectory);
    fs.writeFileSync(path.join(configDirectory, "google-docs.json"), JSON.stringify({
        endpoint: "https://script.google.com/macros/s/example-deployment/exec",
        accessToken: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        recentLimit: 100,
        requestTimeoutMs: 100
    }));
    var config = googleDocs.loadConfig(temporaryRoot);
    assert.strictEqual(config.recentLimit, 20);
    assert.strictEqual(config.requestTimeoutMs, 3000);

    var projectDirectory = path.join(temporaryRoot, "00_Projects");
    fs.mkdirSync(projectDirectory);
    var destination = path.join(projectDirectory, "PodcastClips.txt");
    fs.writeFileSync(destination, "previous contents", "utf8");
    var saved = googleDocs.savePodcastClips(destination, validText);
    assert.strictEqual(saved.validation.ok, true);
    assert.strictEqual(fs.readFileSync(destination, "utf8"), validation.text);
    assert.strictEqual(
        fs.readFileSync(path.join(projectDirectory, "PodcastClips.backup.txt"), "utf8"),
        "previous contents"
    );

    fs.writeFileSync(path.join(configDirectory, "google-docs.json"), JSON.stringify({
        endpoint: "https://example.com/steal",
        accessToken: "0123456789abcdef0123456789abcdef"
    }));
    assert.throws(function () { googleDocs.loadConfig(temporaryRoot); }, /Google Apps Script URL/);
} finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log("Google Docs validation, config, and safe-save tests passed.");
