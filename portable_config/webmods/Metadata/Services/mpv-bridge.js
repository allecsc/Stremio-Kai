/**
 * @name MPV Bridge
 * @description Bridges Stremio metadata to mpv for anime profile detection
 * @version 2.1.0
 * @author allecsc
 * @changelog
 *   v1.0.0 - Initial implementation of Stremio → mpv anime detection bridge
 *   v2.0.0 - Use shared AnimeDetection utility with T1-T3 detection tiers
 *   v2.1.0 - Added Smart Track Selector configuration bridging
 *   v2.1.1 - Added retry limits to initialization and dependency checks
 *
 * @requires {window.RouteDetector} - For player page detection and IMDb ID extraction
 * @requires {window.metadataHelper} - For IndexedDB metadata queries
 * @requires {window.AnimeDetection} - For shared anime detection logic
 * @requires {window.chrome.webview} - For WebView2 → C++ → mpv communication
 *
 * Communication Flow:
 *   1. Detects player route via RouteDetector
 *   2. Extracts IMDb ID from URL
 *   3. Queries metadataHelper.getTitle() for database entry
 *   4. Uses AnimeDetection.detect() to determine if anime
 *   5. Sends script-message to profile-manager.lua via WebView bridge
 */

(function () {
  "use strict";

  // Idempotency Guard
  if (window.MpvBridge?.initialized) return;
  window.MpvBridge = { initialized: true };

  /**
   * Send command to mpv via WebView bridge
   */
  function sendToMpv(command, args) {
    const payload = {
      type: 6,
      object: "transport",
      method: "handleInboundJSON",
      args: ["mpv-command", [command, ...args]],
    };
    window.chrome?.webview?.postMessage(JSON.stringify(payload));
  }

  /**
   * Send anime metadata to profile-manager.lua
   * Reads cached isAnime from DB entry (computed during enrichment)
   */
  function sendAnimeMetadata(imdbId, entry) {
    // Read cached detection result from DB entry
    const isAnime = entry?.isAnime || false;
    const reason = entry?.animeReason || null;

    // Read preferences from mpv-settings.js
    const hdrPassthrough =
      window.MpvSettings?.getHdrPassthrough?.() ||
      localStorage.getItem("kai-hdr-passthrough") === "true";

    const shaderPreset =
      window.MpvSettings?.getAnime4kPreset?.() ||
      localStorage.getItem("kai-anime4k-preset") ||
      "optimized";

    const svpEnabled =
      window.MpvSettings?.getSvpEnabled?.() ??
      localStorage.getItem("kai-svp-enabled") !== "false"; // Default true

    const colorProfile =
      window.MpvSettings?.getColorProfile?.() ||
      localStorage.getItem("kai-color-profile") ||
      "kai"; // Default "kai"

    const iccProfile =
      window.MpvSettings?.getIccProfile?.() ??
      localStorage.getItem("kai-icc-profile") === "true"; // Default false

    const metadata = JSON.stringify({
      is_anime: isAnime,
      detection_reason: reason,
      imdb_id: imdbId,
      hdr_passthrough: hdrPassthrough,
      shader_preset: shaderPreset,
      svp_enabled: svpEnabled,
      color_profile: colorProfile,
      icc_profile: iccProfile,
    });

    sendToMpv("script-message-to", [
      "profile_manager",
      "anime-metadata",
      metadata,
    ]);
    console.log(
      `[MPV Bridge] Sent: ${imdbId} → anime:${isAnime}, HDR:${hdrPassthrough}, shaders:${shaderPreset}, SVP:${svpEnabled}, Color:${colorProfile}, ICC:${iccProfile}`,
    );
  }

  /**
   * Send content metadata to notify_skip.lua
   */
  function sendContentMetadata(state) {
    const metadata = JSON.stringify({
      content_type: state.type || "unknown", // "movie" or "series"
      imdb_id: state.id,
    });

    sendToMpv("script-message-to", [
      "notify_skip",
      "content-metadata",
      metadata,
    ]);
    console.log(
      `[MPV Bridge] Sent content: type=${state.type}, id=${state.id}`,
    );
  }

  /**
   * Send Smart Track Selector config to mpv
   */
  function sendTrackSelectorConfig() {
    // 1. Get Stremio Native Settings (localProfile)
    let localProfile = {};
    try {
      const raw = localStorage.getItem("localProfile");
      if (raw) localProfile = JSON.parse(raw);
    } catch (e) {
      console.warn("[MPV Bridge] Failed to parse localProfile:", e);
    }

    // 2. Get Custom Settings (from mpv-settings.js)
    const customConfig = window.MpvSettings?.getSmartTrackConfig?.() || {};

    // 3. Map Data
    // Stremio saves langs as arrays ["jpn", "eng"], Lua wants comma-separated string "jpn,eng"
    // We strictly expand these using our ISO list to ensure Lua gets "eng,en,english" etc.
    const expand = window.MpvSettings?.expandLanguage || ((c) => c);

    const subLangs = (localProfile.defaultSubtitleLanguages || [])
      .map(expand)
      .join(",");

    const audioLangs = (localProfile.defaultAudioLanguages || [])
      .map(expand)
      .join(",");
    const subKeywords = localProfile.subtitlePriorityKeywords?.join(",") || "";

    const payload = JSON.stringify({
      sub_preferred_langs: subLangs,
      audio_preferred_langs: audioLangs,
      sub_priority_keywords: subKeywords, // From Stremio Native
      // Pass rejection lists & extended keywords (customConfig stores arrays, convert to CSV)
      sub_reject_langs: customConfig.sub_reject_langs?.join(",") || "",
      audio_reject_langs: customConfig.audio_reject_langs?.join(",") || "",

      audio_reject_keywords:
        customConfig.audio_reject_keywords?.join(",") || "",
      sub_reject_keywords: customConfig.sub_reject_keywords?.join(",") || "",

      match_audio_to_video: customConfig.match_audio_to_video,
      use_forced_for_native: customConfig.use_forced_for_native,
    });

    sendToMpv("script-message", ["track-selector-config", payload]);
    console.log("[MPV Bridge] Sent track selector config");
  }

  function sendNotifySkipConfig() {
    const config = {
      auto_skip: localStorage.getItem("kai-notify-auto-skip") === "true",
      show_notification:
        localStorage.getItem("kai-notify-show-notifications") !== "false", // Default true
    };

    const payload = JSON.stringify(config);
    sendToMpv("script-message", ["notify-skip-config", payload]);
    console.log("[MPV Bridge] Sent notify skip config", config);
  }

  /**
   * Handle route change - check if entering player
   */
  function onRouteChange() {
    // Wait for RouteDetector
    if (!window.RouteDetector) return;

    window.RouteDetector.invalidateCache();
    const state = window.RouteDetector.getRouteState();

    if (state.view !== "PLAYER" || !state.id) return;

    // Send content type to notify_skip immediately (no async dependency)
    sendContentMetadata(state);

    // Send Track Selector Config (Sync settings on every playback start)
    sendTrackSelectorConfig();
    sendNotifySkipConfig();

    // Wait for metadataHelper for anime detection
    waitForMetadata(state.id);
  }

  function waitForMetadata(imdbId, retryCount = 0) {
    if (window.metadataHelper?.getTitle) {
      window.metadataHelper
        .getTitle(imdbId)
        .then((entry) => sendAnimeMetadata(imdbId, entry))
        .catch(() => sendAnimeMetadata(imdbId, null));
      return;
    }

    if (retryCount > 20) {
      // 4 seconds timeout
      console.warn("[MPV Bridge] Metadata helper timeout, sending default");
      sendAnimeMetadata(imdbId, null);
      return;
    }

    setTimeout(() => waitForMetadata(imdbId, retryCount + 1), 200);
  }

  let initRetryCount = 0;
  const MAX_RETRIES = 50; // 5 seconds max

  /**
   * Initialize when dependencies are ready
   */
  function init() {
    if (!window.RouteDetector) {
      if (initRetryCount++ > MAX_RETRIES) {
        console.warn(
          "[MPV Bridge] Failed to initialize: RouteDetector not found",
        );
        return;
      }
      setTimeout(init, 100);
      return;
    }

    window.addEventListener("hashchange", onRouteChange);

    // Listen for storage changes to update config dynamically (e.g. user toggles setting while playing)
    window.addEventListener("storage", (e) => {
      // Check for kai-smart-track-* keys OR localProfile
      if (e.key?.startsWith("kai-") || e.key === "localProfile") {
        // If we are currently watching something, send update
        const state = window.RouteDetector.getRouteState();
        if (state.view === "PLAYER") {
          console.log(
            "[MPV Bridge] Settings changed, updating track config...",
          );
          sendTrackSelectorConfig();
          sendNotifySkipConfig();
        }
      }
    });

    // Check on initial load (in case we start on player page)
    onRouteChange();

    console.log(
      "%c[MPV Bridge] Initialized",
      "color: #7b5bf5; font-weight: bold",
    );
  }

  init();
})();
