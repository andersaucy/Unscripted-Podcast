/*
 * Privacy-safe Google Docs bridge for the CEP panel.
 *
 * This module deliberately keeps credentials out of source control. It loads
 * config/google-docs.json at runtime, talks only to Google Apps Script over
 * HTTPS, validates downloaded text, and writes PodcastClips.txt locally.
 */
(function (root, factory) {
    // CEP may expose CommonJS globals inside the browser page. Prefer the
    // browser export there so main.js can always use window.UPGoogleDocs.
    if (typeof window !== "undefined" && window.document) {
        var nodeRequire = null;
        if (typeof cep_node !== "undefined" && cep_node.require) {
            nodeRequire = cep_node.require;
        } else if (typeof require === "function") {
            nodeRequire = require;
        }
        window.UPGoogleDocs = factory(nodeRequire);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory(require);
    } else {
        root.UPGoogleDocs = factory(null);
    }
}(this, function (nodeRequire) {
    "use strict";

    var MAX_DOCUMENT_BYTES = 1024 * 1024;
    var MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
    var DEFAULT_TIMEOUT_MS = 15000;
    var ALLOWED_HOSTS = {
        "script.google.com": true,
        "script.googleusercontent.com": true
    };

    function requireNode(name) {
        if (!nodeRequire) {
            throw new Error("CEP Node.js support is unavailable.");
        }
        return nodeRequire(name);
    }

    function normalizeText(text) {
        return String(text || "")
            .replace(/^\uFEFF/, "")
            .replace(/\r\n?/g, "\n")
            .replace(/\u0000/g, "");
    }

    function parseTime(value) {
        var parts = String(value || "").split(":");
        if (parts.length < 2 || parts.length > 3) { return null; }
        var values = [];
        for (var i = 0; i < parts.length; i++) {
            if (!/^\d{1,3}$/.test(parts[i])) { return null; }
            values.push(parseInt(parts[i], 10));
        }
        if (values[values.length - 1] > 59 ||
                values[values.length - 2] > 59) {
            return null;
        }
        return parts.length === 3 ?
            values[0] * 3600 + values[1] * 60 + values[2] :
            values[0] * 60 + values[1];
    }

    function validateClipText(input) {
        var text = normalizeText(input);
        var lines = text.split("\n");
        var titles = 0;
        var ranges = 0;
        var warnings = [];
        var currentTitle = "";
        var currentFrom = null;

        for (var i = 0; i < lines.length; i++) {
            var titleMatch = lines[i].match(/^\s*TITLE\s*=\s*(.+?)\s*$/i);
            var fromMatch = lines[i].match(/^\s*FROM\s*=\s*(\d{1,3}(?::\d{1,2}){1,2})\s*$/i);
            var toMatch = lines[i].match(/^\s*TO\s*=\s*(\d{1,3}(?::\d{1,2}){1,2})\s*$/i);
            if (titleMatch) {
                if (currentFrom !== null) {
                    warnings.push("Missing TO time before title on line " + (i + 1) + ".");
                    currentFrom = null;
                }
                currentTitle = titleMatch[1];
                titles++;
            } else if (fromMatch) {
                currentFrom = parseTime(fromMatch[1]);
                if (currentFrom === null) {
                    warnings.push("Invalid FROM time on line " + (i + 1) + ".");
                }
                if (!currentTitle) {
                    warnings.push("FROM time has no preceding TITLE on line " + (i + 1) + ".");
                }
            } else if (toMatch) {
                var toSeconds = parseTime(toMatch[1]);
                if (currentFrom === null) {
                    warnings.push("TO time has no valid FROM on line " + (i + 1) + ".");
                } else if (toSeconds === null || toSeconds <= currentFrom) {
                    warnings.push("TO time must be later than FROM on line " + (i + 1) + ".");
                } else {
                    ranges++;
                }
                currentFrom = null;
            }
        }
        if (currentFrom !== null) { warnings.push("The final FROM time has no TO time."); }

        return {
            ok: titles > 0 && ranges > 0,
            text: text,
            titleCount: titles,
            rangeCount: ranges,
            warnings: warnings,
            message: titles > 0 && ranges > 0 ?
                titles + " title(s) and " + ranges + " valid range(s) detected." :
                "No usable TITLE/FROM/TO ranges were detected."
        };
    }

    function loadConfig(extensionPath) {
        var fs = requireNode("fs");
        var path = requireNode("path");
        var configPath = path.join(extensionPath, "config", "google-docs.json");
        if (!fs.existsSync(configPath)) {
            throw new Error(
                "Google Docs is not configured. Copy config/google-docs.example.json " +
                "to config/google-docs.json and add the private endpoint and token."
            );
        }
        var config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        if (!config.endpoint || !config.accessToken ||
                /REPLACE_|YOUR_/i.test(config.endpoint + config.accessToken)) {
            throw new Error("Google Docs configuration still contains placeholder values.");
        }
        assertAllowedURL(config.endpoint);
        config.recentLimit = Math.max(1, Math.min(Number(config.recentLimit || 20), 20));
        config.requestTimeoutMs = Math.max(
            3000,
            Math.min(Number(config.requestTimeoutMs || DEFAULT_TIMEOUT_MS), 60000)
        );
        return config;
    }

    function assertAllowedURL(value) {
        var URLConstructor = requireNode("url").URL;
        var url;
        try { url = new URLConstructor(String(value || "")); }
        catch (error) { throw new Error("Google Docs endpoint URL is invalid."); }
        if (url.protocol !== "https:" || !ALLOWED_HOSTS[String(url.hostname || "").toLowerCase()]) {
            throw new Error("Google Docs endpoint must be an HTTPS Google Apps Script URL.");
        }
        return url;
    }

    function requestJSON(config, payload, callback) {
        var body = JSON.stringify(payload);
        makeRequest(config.endpoint, "POST", body, config.requestTimeoutMs, 0, function (error, responseText) {
            if (error) { callback(error); return; }
            var parsed;
            try { parsed = JSON.parse(responseText); }
            catch (parseError) {
                callback(new Error("Google Docs bridge returned an invalid response."));
                return;
            }
            if (!parsed.ok) {
                callback(new Error(parsed.error || "Google Docs bridge rejected the request."));
                return;
            }
            callback(null, parsed);
        });
    }

    function makeRequest(urlValue, method, body, timeoutMs, redirects, callback) {
        var url = assertAllowedURL(urlValue);
        var https = requireNode("https");
        var NodeBuffer = requireNode("buffer").Buffer;
        var options = {
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname + url.search,
            method: method,
            headers: {
                "Accept": "application/json"
            }
        };
        if (method === "POST") {
            options.headers["Content-Type"] = "application/json; charset=utf-8";
            options.headers["Content-Length"] = NodeBuffer.byteLength(body, "utf8");
        }

        var finished = false;
        function finish(error, value) {
            if (finished) { return; }
            finished = true;
            callback(error, value);
        }
        var request = https.request(options, function (response) {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                response.resume();
                if (redirects >= 5) {
                    finish(new Error("Too many redirects from Google Apps Script."));
                    return;
                }
                try {
                    assertAllowedURL(response.headers.location);
                } catch (redirectError) {
                    finish(redirectError);
                    return;
                }
                makeRequest(
                    response.headers.location,
                    response.statusCode === 307 || response.statusCode === 308 ? method : "GET",
                    response.statusCode === 307 || response.statusCode === 308 ? body : "",
                    timeoutMs,
                    redirects + 1,
                    finish
                );
                return;
            }
            var chunks = [];
            var size = 0;
            response.on("data", function (chunk) {
                size += chunk.length;
                if (size > MAX_RESPONSE_BYTES) {
                    request.destroy();
                    finish(new Error("Google Docs bridge response exceeded the safety limit."));
                    return;
                }
                chunks.push(chunk);
            });
            response.on("end", function () {
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    finish(new Error("Google Docs bridge returned HTTP " + response.statusCode + "."));
                    return;
                }
                finish(null, NodeBuffer.concat(chunks).toString("utf8"));
            });
        });
        request.setTimeout(timeoutMs, function () {
            request.destroy();
            finish(new Error("Google Docs request timed out."));
        });
        request.on("error", function (error) { finish(error); });
        if (method === "POST") { request.write(body); }
        request.end();
    }

    function listDocuments(extensionPath, episodeNumber, callback) {
        var config;
        try { config = loadConfig(extensionPath); }
        catch (error) { callback(error); return; }
        var episode = String(episodeNumber || "");
        if (episode && !/^\d{3}$/.test(episode)) {
            callback(new Error("The active project does not contain a valid three-digit episode number."));
            return;
        }
        requestJSON(config, {
            action: "list",
            token: config.accessToken,
            limit: config.recentLimit,
            recentDays: 7,
            episodeNumber: episode
        }, function (error, response) {
            if (error) { callback(error); return; }
            callback(null, response.documents || []);
        });
    }

    function getDocument(extensionPath, documentId, callback) {
        var config;
        try { config = loadConfig(extensionPath); }
        catch (error) { callback(error); return; }
        if (!/^[A-Za-z0-9_-]{10,}$/.test(String(documentId || ""))) {
            callback(new Error("The selected Google Doc has an invalid file ID."));
            return;
        }
        requestJSON(config, {
            action: "get",
            token: config.accessToken,
            documentId: documentId
        }, function (error, response) {
            if (error) { callback(error); return; }
            var text = normalizeText(response.text || "");
            if (requireNode("buffer").Buffer.byteLength(text, "utf8") > MAX_DOCUMENT_BYTES) {
                callback(new Error("The selected Google Doc exceeds the 1 MB safety limit."));
                return;
            }
            callback(null, {
                id: response.document && response.document.id || documentId,
                name: response.document && response.document.name || "Selected Google Doc",
                modifiedAt: response.document && response.document.modifiedAt || "",
                viewedAt: response.document && response.document.viewedAt || "",
                text: text,
                validation: validateClipText(text)
            });
        });
    }

    function savePodcastClips(destinationPath, text) {
        var fs = requireNode("fs");
        var path = requireNode("path");
        if (path.basename(destinationPath) !== "PodcastClips.txt") {
            throw new Error("Refusing to write outside the expected PodcastClips.txt target.");
        }
        var normalized = normalizeText(text);
        if (requireNode("buffer").Buffer.byteLength(normalized, "utf8") > MAX_DOCUMENT_BYTES) {
            throw new Error("PodcastClips.txt exceeds the 1 MB safety limit.");
        }
        var validation = validateClipText(normalized);
        if (!validation.ok) { throw new Error(validation.message); }

        var backupPath = path.join(path.dirname(destinationPath), "PodcastClips.backup.txt");
        if (fs.existsSync(destinationPath)) {
            fs.copyFileSync(destinationPath, backupPath);
        }
        fs.writeFileSync(destinationPath, normalized, { encoding: "utf8", mode: 384 });
        return {
            path: destinationPath,
            backupPath: fs.existsSync(backupPath) ? backupPath : "",
            validation: validation
        };
    }

    return {
        normalizeText: normalizeText,
        validateClipText: validateClipText,
        loadConfig: loadConfig,
        listDocuments: listDocuments,
        getDocument: getDocument,
        savePodcastClips: savePodcastClips
    };
}));
