"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var token = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
var now = Date.now();
var oneDay = 24 * 60 * 60 * 1000;

function googleDoc(id, name, viewedAtOffset) {
    return {
        id: id,
        name: name,
        mimeType: "application/vnd.google-apps.document",
        modifiedTime: new Date(now + viewedAtOffset).toISOString(),
        viewedByMeTime: new Date(now + viewedAtOffset).toISOString(),
        trashed: false
    };
}

var older = googleDoc(
    "document-old-12345",
    "Older Notes",
    -2 * oneDay
);
var newer = googleDoc(
    "document-new-12345",
    "PODCAST347 Newest Notes",
    -oneDay
);
var outside = googleDoc(
    "document-outside-12345",
    "Old Private Notes",
    -8 * oneDay
);
var files = {};
files[older.id] = older;
files[newer.id] = newer;
files[outside.id] = outside;
var openedDocumentIds = [];

var context = {
    console: console,
    JSON: JSON,
    Math: Math,
    Number: Number,
    String: String,
    Error: Error,
    PropertiesService: {
        getScriptProperties: function () {
            return {
                getProperty: function (name) {
                    return name === "ACCESS_TOKEN" ? token : "";
                }
            };
        }
    },
    Drive: {
        Files: {
            list: function (options) {
                assert.ok(/viewedByMeTime/.test(options.q));
                assert.strictEqual(options.orderBy, "viewedByMeTime desc");
                return { files: [older, newer] };
            },
            get: function (id) { return files[id]; }
        }
    },
    DocumentApp: {
        openById: function (id) {
            openedDocumentIds.push(id);
            return {
                getBody: function () {
                    return {
                        getText: function () {
                            return "TITLE= Test\nFROM= 1:00\nTO= 2:00";
                        }
                    };
                }
            };
        }
    },
    ContentService: {
        MimeType: { JSON: "application/json" },
        createTextOutput: function (text) {
            return {
                text: text,
                setMimeType: function () { return this; }
            };
        }
    }
};
vm.createContext(context);
vm.runInContext(
    fs.readFileSync(
        path.join(__dirname, "../integrations/google-apps-script/Code.gs"),
        "utf8"
    ),
    context
);

function post(payload) {
    var output = context.doPost({
        postData: { contents: JSON.stringify(payload) }
    });
    return JSON.parse(output.text);
}

var unauthorized = post({ action: "list", token: "wrong-token" });
assert.strictEqual(unauthorized.ok, false);
assert.strictEqual(openedDocumentIds.length, 0);

var listed = post({ action: "list", token: token, limit: 2, episodeNumber: "347" });
assert.strictEqual(listed.ok, true);
assert.strictEqual(listed.documents.length, 2);
assert.strictEqual(listed.documents[0].name, "PODCAST347 Newest Notes");

var fetched = post({ action: "get", token: token, documentId: newer.id });
assert.strictEqual(fetched.ok, true);
assert.strictEqual(fetched.document.name, "PODCAST347 Newest Notes");
assert.ok(fetched.text.indexOf("TITLE= Test") !== -1);

var rejected = post({ action: "get", token: token, documentId: outside.id });
assert.strictEqual(rejected.ok, false);
assert.ok(/last seven days/.test(rejected.error));
assert.strictEqual(openedDocumentIds.indexOf(outside.id), -1);

console.log("Google Apps Script authorization, recency, and episode-ranking tests passed.");
