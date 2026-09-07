/**
 * Unscripted-Podcast — Project Manager collection entry point.
 *
 * Keeps the consolidated UI action as a small adapter around the existing,
 * tested collect-and-save implementation.
 */

function up_openProjectManager() {
    return up_collectAndSaveEpisode();
}
