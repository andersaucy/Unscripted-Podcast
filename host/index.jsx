/**
 * Unscripted-Podcast — ExtendScript host entry point.
 *
 * This file is loaded once when the panel opens (see ScriptPath in
 * CSXS/manifest.xml). It pulls in each task module and exposes shared
 * helpers. The panel calls the up_* functions via CSInterface.evalScript.
 */

// ---- Shared helpers -------------------------------------------------------

function up_escapeJSON(str) {
    if (str === undefined || str === null) { return ""; }
    str = String(str);
    var out = "";
    for (var i = 0; i < str.length; i++) {
        var c = str.charAt(i);
        if (c === '"') { out += '\\"'; }
        else if (c === '\\') { out += '\\\\'; }
        else if (c === '\n') { out += '\\n'; }
        else if (c === '\r') { out += '\\r'; }
        else if (c === '\t') { out += '\\t'; }
        else { out += c; }
    }
    return out;
}

/**
 * Build the JSON string the panel expects: {ok, message, log}.
 * logArr is an array of strings (joined with newlines).
 */
function up_result(ok, message, logArr) {
    var logStr = "";
    if (logArr && logArr.length) { logStr = logArr.join("\n"); }
    return '{"ok":' + (ok ? "true" : "false") +
        ',"message":"' + up_escapeJSON(message) + '"' +
        ',"log":"' + up_escapeJSON(logStr) + '"}';
}

// ---- Task modules ---------------------------------------------------------

#include "episodeIdentity.jsx"
#include "markClips.jsx"
#include "renderUnscripted.jsx"
#include "episodeSetup.jsx"
#include "multicamSetup.jsx"
#include "collectEpisode.jsx"
