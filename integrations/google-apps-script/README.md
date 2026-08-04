# Google Docs bridge setup

This optional bridge lets the CEP panel list and read clip-note Google Docs
without committing credentials or production document identifiers.

## Security model

- The script lists only Google Docs viewed during the previous seven days.
- The selected file is revalidated against that same recency window before its
  text is returned.
- Every CEP request must contain a random private token.
- The token is stored in Apps Script **Script Properties**, never in `Code.gs`.
- The CEP token and deployment URL are stored in the gitignored
  `config/google-docs.json` file.
- Document names and text are returned only after authorization and are never
  logged by the bridge.
- The downloaded text is held in panel memory, then written only to the active
  project's `PodcastClips.txt` after the editor confirms **Save & Mark Clips**.

The bearer token protects a web-app deployment that runs as its owner. Treat
the token like a password. Rotate it immediately if it is exposed.

## One-time Google setup

1. Open [Google Apps Script](https://script.google.com) and create a project.
2. Copy `Code.gs` and `appsscript.json` from this directory into that project.
   Enable **Show appsscript.json manifest file in editor** under Project
   Settings if the manifest is hidden.
3. Confirm the **Drive API** appears under **Services**. The supplied manifest
   enables its v3 Advanced Service, which provides `viewedByMeTime` metadata.
4. In **Project Settings → Script Properties**, add:
   - `ACCESS_TOKEN`: a cryptographically random token of at least 32
     characters. On macOS/Linux, `openssl rand -hex 32` produces a suitable
     64-character value.
5. Choose **Deploy → New deployment → Web app**.
6. Set **Execute as** to yourself. Select the access level supported by the
   account that lets the CEP reach the endpoint. The bearer token remains
   required for every document operation.
7. Authorize the requested read-only Drive and Docs permissions.
8. Copy the deployed `/exec` URL.

## One-time CEP setup

1. Copy `config/google-docs.example.json` to `config/google-docs.json`.
2. Replace the placeholder endpoint with the Apps Script `/exec` URL.
3. Paste the same random `ACCESS_TOKEN` value into `accessToken`.
4. Never force-add `config/google-docs.json` to Git. Validation fails if Git
   tracks that private file.
5. Restart Premiere so CEP reloads its Node-enabled runtime.

The public repository should contain only the example configuration and this
generic bridge source.
