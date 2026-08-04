/**
 * Unscripted-Podcast Google Docs bridge.
 *
 * Required Script Properties:
 *   ACCESS_TOKEN - a random secret of at least 32 characters
 *
 * Deploy as a web app that executes as the deploying user. The CEP sends the
 * token in a POST body. The bridge lists only Google Docs viewed within the
 * last seven days and revalidates that window before returning selected text.
 * Neither credentials nor document contents are logged.
 */

var MAX_RECENT_DOCUMENTS = 20;
var MAX_RECENT_CANDIDATES = 100;
var RECENT_DAYS = 7;
var MAX_DOCUMENT_CHARACTERS = 1000000;
var GOOGLE_DOC_MIME_TYPE = "application/vnd.google-apps.document";

function doGet() {
  return jsonResponse_({
    ok: true,
    service: "Unscripted-Podcast Google Docs bridge"
  });
}

function doPost(event) {
  try {
    var request = parseRequest_(event);
    var settings = getSettings_();
    if (!secureEquals_(request.token, settings.accessToken)) {
      return jsonResponse_({ ok: false, error: "Unauthorized request." });
    }

    if (request.action === "list") {
      return jsonResponse_({
        ok: true,
        documents: listRecentDocuments_(request.limit, request.episodeNumber)
      });
    }
    if (request.action === "get") {
      return jsonResponse_(getDocument_(request.documentId));
    }
    return jsonResponse_({ ok: false, error: "Unsupported action." });
  } catch (error) {
    // Do not echo request bodies, file IDs, access tokens, or document text.
    return jsonResponse_({
      ok: false,
      error: error && error.message ? error.message : "Bridge request failed."
    });
  }
}

function parseRequest_(event) {
  if (!event || !event.postData || !event.postData.contents) {
    throw new Error("A JSON POST body is required.");
  }
  var request;
  try {
    request = JSON.parse(event.postData.contents);
  } catch (error) {
    throw new Error("The request body is not valid JSON.");
  }
  return request || {};
}

function getSettings_() {
  var properties = PropertiesService.getScriptProperties();
  var accessToken = properties.getProperty("ACCESS_TOKEN") || "";
  if (accessToken.length < 32) {
    throw new Error("ACCESS_TOKEN is missing or too short.");
  }
  return { accessToken: accessToken };
}

function secureEquals_(left, right) {
  left = String(left || "");
  right = String(right || "");
  var mismatch = left.length ^ right.length;
  var length = Math.max(left.length, right.length);
  for (var i = 0; i < length; i++) {
    mismatch |= (left.charCodeAt(i % Math.max(left.length, 1)) || 0) ^
      (right.charCodeAt(i % Math.max(right.length, 1)) || 0);
  }
  return mismatch === 0;
}

function listRecentDocuments_(requestedLimit, requestedEpisodeNumber) {
  var limit = Math.max(1, Math.min(Number(requestedLimit) || 20, MAX_RECENT_DOCUMENTS));
  var episodeNumber = /^\d{3}$/.test(String(requestedEpisodeNumber || "")) ?
    String(requestedEpisodeNumber) : "";
  var cutoff = recentCutoff_();
  var response = Drive.Files.list({
    q: "mimeType = '" + GOOGLE_DOC_MIME_TYPE + "' and trashed = false " +
      "and viewedByMeTime > '" + cutoff + "'",
    orderBy: "viewedByMeTime desc",
    pageSize: MAX_RECENT_CANDIDATES,
    fields: "files(id,name,modifiedTime,viewedByMeTime)"
  });
  var documents = (response.files || []).map(function (file) {
    return {
      id: file.id,
      name: file.name,
      modifiedAt: file.modifiedTime || "",
      viewedAt: file.viewedByMeTime || "",
      episodeMatch: episodeNumber ? nameContainsEpisode_(file.name, episodeNumber) : false
    };
  });
  documents.sort(function (left, right) {
    if (left.episodeMatch !== right.episodeMatch) {
      return left.episodeMatch ? -1 : 1;
    }
    return left.viewedAt < right.viewedAt ? 1 :
      (left.viewedAt > right.viewedAt ? -1 : 0);
  });
  return documents.slice(0, limit).map(function (document) {
    delete document.episodeMatch;
    return document;
  });
}

function getDocument_(documentId) {
  if (!/^[A-Za-z0-9_-]{10,}$/.test(String(documentId || ""))) {
    throw new Error("Invalid document selection.");
  }
  var file = Drive.Files.get(documentId, {
    fields: "id,name,mimeType,modifiedTime,viewedByMeTime,trashed"
  });
  if (file.mimeType !== GOOGLE_DOC_MIME_TYPE || file.trashed ||
      !file.viewedByMeTime || file.viewedByMeTime <= recentCutoff_()) {
    throw new Error("The selected file is not a Google Doc viewed within the last seven days.");
  }

  var text = DocumentApp.openById(documentId).getBody().getText();
  if (text.length > MAX_DOCUMENT_CHARACTERS) {
    throw new Error("The selected document exceeds the safety limit.");
  }
  return {
    ok: true,
    document: {
      id: file.id,
      name: file.name,
      modifiedAt: file.modifiedTime || "",
      viewedAt: file.viewedByMeTime || ""
    },
    text: text
  };
}

function recentCutoff_() {
  return new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function nameContainsEpisode_(name, episodeNumber) {
  return new RegExp("(^|[^0-9])" + episodeNumber + "([^0-9]|$)").test(String(name || ""));
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
