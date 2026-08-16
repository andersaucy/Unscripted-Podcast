(function (global) {
    "use strict";
    var BASE_URL = "http://127.0.0.1:8765";
    var cs = new CSInterface();
    var transport = "http";

    function request(path, options) {
        return fetch(BASE_URL + path, options || {}).then(function (response) {
            return response.json().then(function (body) {
                if (!response.ok || body.ok === false) {
                    throw new Error(body.error || ("Color engine returned HTTP " + response.status));
                }
                return body;
            });
        });
    }

    function health() { return request("/health"); }

    function ensureAvailable() {
        return health().catch(function () {
            // CEP builds can block loopback HTTP even when the analyzer process
            // launches correctly. Use the same JSON contract over stdout; each
            // camera remains an asynchronous child process and Premiere stays responsive.
            transport = "cli";
            return { ok: true, schema_version: "1.0", transport: transport };
        });
    }

    function analyze(group) {
        if (transport === "cli") { return analyzeWithCli(group); }
        return request("/v1/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                schema_version: "1.0",
                media_path: group.media_path,
                timestamp_seconds: group.timestamp_seconds
            })
        });
    }

    function analyzeWithCli(group) {
        return new Promise(function (resolve, reject) {
            if (!window.cep || !window.cep.process ||
                    typeof window.cep.process.createProcess !== "function") {
                reject(new Error("CEP process automation is unavailable."));
                return;
            }
            var extension = cs.getSystemPath(SystemPath.EXTENSION);
            var adapter = extension + "/scripts/analyze_color_frame.sh";
            var launched = window.cep.process.createProcess("/bin/bash", adapter,
                String(group.media_path), String(group.timestamp_seconds));
            if (!launched || launched.err !== 0 || !launched.data) {
                reject(new Error("Could not launch the color analyzer. Run scripts/setup_color_engine.sh."));
                return;
            }
            var pid = launched.data;
            var stdout = "";
            var stderr = "";
            try {
                window.cep.process.stdout(pid, function (chunk) {
                    if (typeof chunk === "string") { stdout += chunk; }
                    else if (chunk && chunk.data) { stdout += chunk.data; }
                });
                window.cep.process.stderr(pid, function (chunk) {
                    if (typeof chunk === "string") { stderr += chunk; }
                    else if (chunk && chunk.data) { stderr += chunk.data; }
                });
            } catch (streamError) {}

            function isRunning() {
                try {
                    var status = window.cep.process.isRunning(pid);
                    return !!(status && status.err === 0 && status.data);
                } catch (error) { return false; }
            }
            function poll(attempt) {
                if (isRunning() && attempt < 600) {
                    window.setTimeout(function () { poll(attempt + 1); }, 100);
                    return;
                }
                if (attempt >= 600) {
                    try { window.cep.process.terminate(pid); } catch (terminateError) {}
                    reject(new Error("Color analysis timed out after 60 seconds."));
                    return;
                }
                // stdout can arrive just after process exit.
                window.setTimeout(function () {
                    var body;
                    try { body = JSON.parse(String(stdout || "").trim()); }
                    catch (parseError) {
                        reject(new Error(String(stderr || "Analyzer returned invalid JSON.").trim()));
                        return;
                    }
                    if (!body.ok) { reject(new Error(body.error || "Color analysis failed.")); }
                    else { resolve(body); }
                }, 250);
            }
            poll(0);
        });
    }

    global.UnscriptedColorApi = {
        ensureAvailable: ensureAvailable,
        analyze: analyze,
        baseUrl: BASE_URL
    };
}(window));
