/**
 * @name MPV Bridge
 * @description Bridges Stremio metadata to mpv for anime profile detection
 * @version 2.2.0
 * @author allecsc
 * @changelog
 *   v1.0.0 - Initial implementation of Stremio → mpv anime detection bridge
 *   v2.0.0 - Use shared AnimeDetection utility with T1-T3 detection tiers
 *   v2.1.0 - Added Smart Track Selector configuration bridging
 *   v2.1.1 - Added retry limits to initialization and dependency checks
 *   v2.2.0 - Added title-scoped original-language delivery for audio matching
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

  let trackConfigSequence = 0;
  let trackDiagnosticSequence = 0;

  const SMART_TRACK_STORAGE_KEYS = {
    match_audio_to_video: "kai-smart-track-match-audio",
    use_forced_for_native: "kai-smart-track-use-forced",
    audio_reject_langs: "kai-smart-track-reject-audio",
    sub_reject_langs: "kai-smart-track-reject-subs",
    audio_reject_keywords: "kai-smart-track-reject-audio-keywords",
    sub_reject_keywords: "kai-smart-track-reject-sub-keywords",
  };

  function getRouteDiagnostic(state = window.RouteDetector?.getRouteState?.()) {
    return {
      view: state?.view ?? null,
      id: state?.id ?? null,
      type: state?.type ?? null,
      season: state?.season ?? null,
      episode: state?.episode ?? null,
    };
  }

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

  function sendTrackSelectorDiagnostic(event, details) {
    try {
      trackDiagnosticSequence += 1;
      sendToMpv("script-message-to", [
        "smart_track_selector",
        "track-selector-diagnostic",
        JSON.stringify({
          diagnostic_sequence: trackDiagnosticSequence,
          event,
          generated_at_ms: Date.now(),
          ...details,
        }),
      ]);
    } catch (error) {
      console.warn("[MPV Bridge] Failed to send selector diagnostic:", error);
    }
  }

  function sendTrackSelectorLanguage(titleId, rawLanguage, status) {
    const firstLanguage =
      typeof rawLanguage === "string"
        ? rawLanguage.split(",")[0].trim() || null
        : null;
    const expandedLanguage = firstLanguage
      ? window.MpvSettings?.expandLanguage?.(firstLanguage) || firstLanguage
      : null;

    try {
      sendToMpv("script-message-to", [
        "smart_track_selector",
        "track-selector-language",
        JSON.stringify({
          title_id: titleId,
          status,
          original_language_raw: rawLanguage || null,
          original_language_primary: firstLanguage,
          original_language_expanded: expandedLanguage,
        }),
      ]);
    } catch (error) {
      console.warn("[MPV Bridge] Failed to send selector language:", error);
    }

    return { firstLanguage, expandedLanguage };
  }

  /**
   * Send anime metadata to profile-manager.lua
   * Reads cached isAnime from DB entry (computed during enrichment)
   */
  function sendAnimeMetadata(imdbId, entry, contentType) {
    // Read cached detection result from DB entry
    const isAnime = entry?.isAnime || false;
    const reason = entry?.animeReason || null;
    const language = entry?.language || null;

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

    const svpGlobal =
      window.MpvSettings?.getSvpGlobal?.() ??
      localStorage.getItem("kai-svp-global") === "true"; // Default false

    const colorProfile =
      window.MpvSettings?.getColorProfile?.() ||
      localStorage.getItem("kai-color-profile") ||
      "kai"; // Default "kai"

    const iccProfile =
      window.MpvSettings?.getIccProfile?.() ??
      localStorage.getItem("kai-icc-profile") === "true"; // Default false

    // New settings (v2.2)
    const targetPeak = localStorage.getItem("kai-hdr-target-peak") || "auto";
    const osdProfileMessages =
      localStorage.getItem("kai-osd-profile-messages") !== "false"; // Default true
    const vulkanMode = localStorage.getItem("kai-vulkan-api") === "true"; // Default false
    const ultrawideZoom =
      window.MpvSettings?.getUltrawideZoom?.() ||
      localStorage.getItem("kai-ultrawide-zoom") === "true"; // Default false

    // v2.3 - Audio Preset (new)
    const audioPreset = localStorage.getItem("kai-audio-preset") || "off";

    const metadata = JSON.stringify({
      is_anime: isAnime,
      detection_reason: reason,
      language: language,
      imdb_id: imdbId,
      content_type: contentType || "unknown", // "movie" or "series"
      hdr_passthrough: hdrPassthrough,
      shader_preset: shaderPreset,
      svp_enabled: svpEnabled,
      svp_global: svpGlobal,
      color_profile: colorProfile,
      icc_profile: iccProfile,
      // New fields
      target_peak: targetPeak,
      osd_profile_messages: osdProfileMessages,
      vulkan_mode: vulkanMode,
      ultrawide_zoom: ultrawideZoom,
      audio_preset: audioPreset,
    });

    sendToMpv("script-message-to", [
      "profile_manager",
      "anime-metadata",
      metadata,
    ]);
    console.log(
      `[MPV Bridge] Sent: ${imdbId} → anime:${isAnime}, Type:${contentType}, Audio:${audioPreset}, HDR:${hdrPassthrough} (Peak:${targetPeak}), Shaders:${shaderPreset}, SVP:${svpEnabled} (Global:${svpGlobal}), Color:${colorProfile}, ICC:${iccProfile}, Ultrawide:${ultrawideZoom}`,
    );
  }

  /**
   * Send content metadata to notify_skip.lua
   */
  function sendContentMetadata(state) {
    const metadata = JSON.stringify({
      content_type: state.type || "unknown", // "movie" or "series"
      imdb_id: state.id,
      season: state.season ?? null,
      episode: state.episode ?? null,
    });

    sendToMpv("script-message-to", [
      "notify_skip",
      "content-metadata",
      metadata,
    ]);
    console.log(
      `[MPV Bridge] Sent content: type=${state.type}, id=${state.id}, season=${state.season}, episode=${state.episode}`,
    );
  }

  /**
   * Send Smart Track Selector config to mpv
   */
  function sendTrackSelectorConfig(retryCount = 0, context = null) {
    const sendContext = context || {
      configSequence: ++trackConfigSequence,
      reason: "unspecified",
      route: getRouteDiagnostic(),
      startedAtMs: Date.now(),
    };

    // 1. Get Stremio Native Settings (localProfile)
    let localProfile = {};
    let localProfileStatus = "absent";
    try {
      const raw = localStorage.getItem("localProfile");
      if (raw) {
        localProfile = JSON.parse(raw);
        localProfileStatus = "loaded";
      }
    } catch (e) {
      localProfileStatus = "invalid-json";
      console.warn("[MPV Bridge] Failed to parse localProfile:", e);
    }

    // 2. Get Custom Settings (from mpv-settings.js)
    const settingsModuleAvailable =
      typeof window.MpvSettings?.getSmartTrackConfig === "function";
    const customConfig = settingsModuleAvailable
      ? window.MpvSettings.getSmartTrackConfig() || {}
      : {};

    // 3. Retry logic: If critical custom fields are empty, retry
    const hasCustomConfig =
      customConfig.audio_reject_keywords?.length > 0 ||
      customConfig.sub_reject_keywords?.length > 0 ||
      customConfig.audio_reject_langs?.length > 0;

    if (!hasCustomConfig && retryCount < 2) {
      console.log(
        `[MPV Bridge] Custom config empty, retrying... (${retryCount + 1}/2)`,
      );
      setTimeout(
        () => sendTrackSelectorConfig(retryCount + 1, sendContext),
        50,
      );
      return;
    }

    // 4. Map Data
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
    const languageAliasGroups =
      window.MpvSettings?.getLanguageAliasGroups?.();

    // Rejection list helper: only include the key in the JSON payload when it
    // actually exists on customConfig. When MpvSettings isn't loaded yet,
    // customConfig is {}, so the key is absent → this returns undefined →
    // JSON.stringify omits it entirely → Lua's `~= nil` guard skips the update,
    // preserving whatever rules are already in Lua's memory.
    //
    // When the user genuinely clears a rejection list, the key IS present but
    // holds an empty array → join produces "" → Lua receives "" and clears the
    // list correctly. This distinguishes "not loaded yet" from "user cleared it".
    const fromCustom = (key) =>
      key in customConfig ? (customConfig[key]?.join(",") ?? "") : undefined;

    const customFieldDiagnostics = Object.fromEntries(
      Object.entries(SMART_TRACK_STORAGE_KEYS).map(([field, storageKey]) => [
        field,
        {
          field_present: field in customConfig,
          storage_present: localStorage.getItem(storageKey) !== null,
          value_count: Array.isArray(customConfig[field])
            ? customConfig[field].length
            : null,
          value: Array.isArray(customConfig[field])
            ? undefined
            : customConfig[field],
        },
      ]),
    );

    const payload = JSON.stringify({
      sub_preferred_langs: subLangs,
      audio_preferred_langs: audioLangs,
      sub_priority_keywords: subKeywords, // From Stremio Native
      // Rejection lists: omitted from payload (→ undefined) when MpvSettings is
      // not yet loaded. Lua's ~= nil guard will then skip updating those fields,
      // keeping the previously-valid rules intact for this episode.
      sub_reject_langs: fromCustom("sub_reject_langs"),
      audio_reject_langs: fromCustom("audio_reject_langs"),
      audio_reject_keywords: fromCustom("audio_reject_keywords"),
      sub_reject_keywords: fromCustom("sub_reject_keywords"),

      match_audio_to_video: customConfig.match_audio_to_video,
      use_forced_for_native: customConfig.use_forced_for_native,

      // Context for Smart Memory (Persistence)
      title_id: window.RouteDetector
        ? window.RouteDetector.getRouteState().id
        : null,
      remember_track_selection: localProfile.rememberTrackSelection ?? false,
      subtitle_selection_mode: localProfile.subtitleSelectionMode || "default",

      // The selector snapshots the matching aliases into persisted preferences,
      // so restoring a later episode does not depend on the bridge arriving
      // before mpv's file-loaded event.
      language_alias_groups: languageAliasGroups,

      // Correlation-only data. Lua logs this but does not use it for selection.
      _diagnostics: {
        config_sequence: sendContext.configSequence,
        send_reason: sendContext.reason,
        retry_count: retryCount,
        generated_at_ms: Date.now(),
        request_started_at_ms: sendContext.startedAtMs,
        route: sendContext.route,
        settings: {
          module_available: settingsModuleAvailable,
          local_profile_status: localProfileStatus,
          fields: customFieldDiagnostics,
        },
      },
    });

    sendToMpv("script-message", ["track-selector-config", payload]);
    console.log(
      `[MPV Bridge] Sent track selector config (sequence=${sendContext.configSequence}, reason=${sendContext.reason}, retry=${retryCount}, aliasGroups=${languageAliasGroups?.length ?? 0}, title=${sendContext.route.id ?? "none"})`,
    );
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

  // ─────────────────────────────────────────────────────────────────────────
  // IntroDB submissions
  //
  // mpv writes every command it receives to LOG.txt, so the API key is never
  // sent in the clear. introdb_helper.py publishes a Diffie-Hellman public
  // value in INTRODB_PUBKEY_PROP; we seal the key against it and send only
  // our public value plus the sealed bytes. See introdb_helper.py.
  // ─────────────────────────────────────────────────────────────────────────
  const INTRODB_PUBKEY_PROP = "user-data/kai/introdb-pubkey";
  const INTRODB_ENABLED_KEY = "kai-introdb-submit-enabled";
  const INTRODB_KDF_LABEL = new TextEncoder().encode("kai-introdb-key-v1");
  // RFC 7919 ffdhe2048 group (safe prime, generator 2)
  const INTRODB_P = BigInt(
    "0xFFFFFFFFFFFFFFFFADF85458A2BB4A9AAFDC5620273D3CF1D8B9C583CE2D3695" +
      "A9E13641146433FBCC939DCE249B3EF97D2FE363630C75D8F681B202AEC4617A" +
      "D3DF1ED5D5FD65612433F51F5F066ED0856365553DED1AF3B557135E7F57C935" +
      "984F0C70E0E68B77E2A689DAF3EFE8721DF158A136ADE73530ACCA4F483A797A" +
      "BC0AB182B324FB61D108A94BB2C8E3FBB96ADAB760D7F4681D4F42A3DE394DF4" +
      "AE56EDE76372BB190B07A7C8EE0A6D709E02FCE1CDF7E2ECC03404CD28342F61" +
      "9172FE9CE98583FF8E4F1232EEF28183C3FE3B1B4C6FAD733BB5FCBC2EC22005" +
      "C58EF1837D1683B2C6F34A26C1B2EFFA886B423861285C97FFFFFFFFFFFFFFFF",
  );
  // Keys forwarded to mpv while the WebView has focus (mirror input.conf)
  const INTRODB_KEYS = {
    i: "cycle-type",
    "[": "mark-start",
    "]": "mark-end",
    Enter: "submit",
  };

  let introdbServerPub = null;
  let introdbSealCache = null;

  function getIntrodbApiKey() {
    return window.MetadataModules?.apiKeys?.getKey("INTRODB") || null;
  }

  function modPow(base, exp, mod) {
    let result = 1n;
    base %= mod;
    while (exp > 0n) {
      if (exp & 1n) result = (result * base) % mod;
      base = (base * base) % mod;
      exp >>= 1n;
    }
    return result;
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return out;
  }

  async function sealIntrodbKey(serverPubHex, apiKey) {
    const serverPub = BigInt("0x" + serverPubHex);
    if (serverPub <= 1n || serverPub >= INTRODB_P - 1n) {
      throw new Error("invalid key-exchange value");
    }
    const rand = crypto.getRandomValues(new Uint8Array(32));
    rand[0] |= 0x80;
    const exponent = BigInt("0x" + bytesToHex(rand));
    const pagePub = modPow(2n, exponent, INTRODB_P);
    const shared = modPow(serverPub, exponent, INTRODB_P);
    const sharedBytes = hexToBytes(shared.toString(16).padStart(512, "0"));

    const keyBytes = new TextEncoder().encode(apiKey);
    const stream = [];
    for (let counter = 0; stream.length < keyBytes.length; counter++) {
      const input = new Uint8Array(sharedBytes.length + INTRODB_KDF_LABEL.length + 4);
      input.set(sharedBytes, 0);
      input.set(INTRODB_KDF_LABEL, sharedBytes.length);
      new DataView(input.buffer).setUint32(input.length - 4, counter);
      stream.push(...new Uint8Array(await crypto.subtle.digest("SHA-256", input)));
    }
    const sealed = keyBytes.map((b, i) => b ^ stream[i]);
    return { page_pub: pagePub.toString(16), sealed: bytesToHex(sealed) };
  }

  async function sendIntrodbSubmitConfig() {
    const enabled = localStorage.getItem(INTRODB_ENABLED_KEY) === "true";
    const apiKey = enabled ? getIntrodbApiKey() : null;
    const config = { enabled };

    if (apiKey && introdbServerPub) {
      try {
        const cache = introdbSealCache;
        if (!cache || cache.serverPub !== introdbServerPub || cache.apiKey !== apiKey) {
          introdbSealCache = {
            serverPub: introdbServerPub,
            apiKey,
            ...(await sealIntrodbKey(introdbServerPub, apiKey)),
          };
        }
        config.page_pub = introdbSealCache.page_pub;
        config.sealed = introdbSealCache.sealed;
      } catch (error) {
        console.warn("[MPV Bridge] IntroDB key sealing failed:", error);
      }
    }

    sendToMpv("script-message-to", [
      "notify_skip",
      "introdb-submit-config",
      JSON.stringify(config),
    ]);
    // Never log the key, sealed or not
    console.log("[MPV Bridge] Sent IntroDB submit config", {
      enabled,
      has_key: !!apiKey,
      key_exchange_ready: !!introdbServerPub,
    });
  }

  // mpv -> page channel: the shell forwards changes of any property the page
  // asks it to observe as "mpv-prop-change" transport messages
  const propObservers = new Map();
  let propListenerInstalled = false;

  function observeMpvProp(name, callback) {
    if (!propListenerInstalled) {
      propListenerInstalled = true;
      window.chrome?.webview?.addEventListener("message", (event) => {
        let msg;
        try {
          msg = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        } catch {
          return;
        }
        const [eventName, data] = msg?.args || [];
        if (eventName !== "mpv-prop-change") return;
        (propObservers.get(data?.name) || []).forEach((cb) => cb(data.data));
      });
    }
    if (!propObservers.has(name)) {
      propObservers.set(name, []);
      window.chrome?.webview?.postMessage(
        JSON.stringify({
          type: 6,
          object: "transport",
          method: "handleInboundJSON",
          args: ["mpv-observe-prop", name],
        }),
      );
    }
    propObservers.get(name).push(callback);
  }

  // Settings key check. CORS blocks the page from calling IntroDB, so the
  // typed key is sealed like the saved one and checked by introdb_helper.py.
  const INTRODB_VALIDATE_PROP = "user-data/kai/introdb-validate";
  const INTRODB_VALIDATE_TIMEOUT_MS = 20000;
  const pendingKeyChecks = new Map();
  let keyCheckSeq = 0;

  /**
   * @param {string} key - key typed in Settings (not yet saved)
   * @returns {Promise<{result: "valid"|"invalid"|"unknown", error?: string}>}
   */
  async function validateIntrodbKey(key) {
    if (!introdbServerPub) {
      return { result: "unknown", error: "Player is still starting, try again in a moment" };
    }
    let sealed;
    try {
      sealed = await sealIntrodbKey(introdbServerPub, key);
    } catch (error) {
      return { result: "unknown", error: error.message };
    }
    const id = `k${Date.now()}_${++keyCheckSeq}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingKeyChecks.delete(id);
        resolve({ result: "unknown", error: "Key check timed out" });
      }, INTRODB_VALIDATE_TIMEOUT_MS);
      pendingKeyChecks.set(id, { resolve, timer });
      sendToMpv("script-message-to", [
        "notify_skip",
        "introdb-validate",
        JSON.stringify({ id, ...sealed }),
      ]);
    });
  }

  window.MpvBridge.sendToMpv = sendToMpv;
  window.MpvBridge.observeMpvProp = observeMpvProp;
  window.MpvBridge.validateIntrodbKey = validateIntrodbKey;

  function initIntrodbSubmit() {
    observeMpvProp(INTRODB_VALIDATE_PROP, (value) => {
      const pending = value && pendingKeyChecks.get(value.id);
      if (!pending) return;
      pendingKeyChecks.delete(value.id);
      clearTimeout(pending.timer);
      pending.resolve({ result: value.result, error: value.error || "" });
    });

    observeMpvProp(INTRODB_PUBKEY_PROP, (value) => {
      if (typeof value !== "string" || !/^[0-9a-f]+$/i.test(value)) return;
      if (value === introdbServerPub) return;
      introdbServerPub = value;
      sendIntrodbSubmitConfig();
    });

    document.addEventListener(
      "keydown",
      (e) => {
        if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        const action = INTRODB_KEYS[e.key];
        if (!action || window.RouteDetector?.getRouteState?.().view !== "PLAYER") return;
        if (localStorage.getItem(INTRODB_ENABLED_KEY) !== "true") return;
        e.preventDefault();
        e.stopPropagation();
        sendToMpv("script-message-to", ["notify_skip", "introdb-key", action]);
      },
      { capture: true },
    );
  }

  /**
   * Handle route change - check if entering player
   */
  function onRouteChange(event) {
    // Wait for RouteDetector
    if (!window.RouteDetector) return;

    window.RouteDetector.invalidateCache();
    const state = window.RouteDetector.getRouteState();

    if (state.view !== "PLAYER" || !state.id) return;

    // Send content type to notify_skip immediately (no async dependency)
    sendContentMetadata(state);

    // Send Track Selector Config (Sync settings on every playback start)
    sendTrackSelectorConfig(0, {
      configSequence: ++trackConfigSequence,
      reason: event?.type === "hashchange" ? "hashchange" : "initial-route",
      route: getRouteDiagnostic(state),
      startedAtMs: Date.now(),
    });
    sendNotifySkipConfig();
    sendIntrodbSubmitConfig();

    // Wait for metadataHelper for anime detection
    waitForMetadata(state.id, state.type, 0, {
      reason: event?.type === "hashchange" ? "hashchange" : "initial-route",
      route: getRouteDiagnostic(state),
      startedAtMs: Date.now(),
    });
  }

  function waitForMetadata(imdbId, contentType, retryCount = 0, context = null) {
    const lookupContext = context || {
      reason: "unspecified",
      route: getRouteDiagnostic(),
      startedAtMs: Date.now(),
    };

    if (window.metadataHelper?.getTitle) {
      window.metadataHelper
        .getTitle(imdbId)
        .then((entry) => {
          sendAnimeMetadata(imdbId, entry, contentType);
          const rawLanguage = entry?.language || null;
          const { firstLanguage, expandedLanguage } =
            sendTrackSelectorLanguage(
              imdbId,
              rawLanguage,
              entry ? "found" : "not-found",
            );
          sendTrackSelectorDiagnostic("metadata-lookup-result", {
            reason: lookupContext.reason,
            route: lookupContext.route,
            imdb_id: imdbId,
            content_type: contentType,
            status: entry ? "found" : "not-found",
            retry_count: retryCount,
            elapsed_ms: Date.now() - lookupContext.startedAtMs,
            original_language_raw: rawLanguage,
            original_language_primary: firstLanguage,
            original_language_expanded: expandedLanguage,
          });
        })
        .catch((error) => {
          sendAnimeMetadata(imdbId, null, contentType);
          sendTrackSelectorLanguage(imdbId, null, "error");
          sendTrackSelectorDiagnostic("metadata-lookup-result", {
            reason: lookupContext.reason,
            route: lookupContext.route,
            imdb_id: imdbId,
            content_type: contentType,
            status: "error",
            retry_count: retryCount,
            elapsed_ms: Date.now() - lookupContext.startedAtMs,
            error: error?.message || String(error),
          });
        });
      return;
    }

    if (retryCount > 20) {
      // 4 seconds timeout
      console.warn("[MPV Bridge] Metadata helper timeout, sending default");
      sendAnimeMetadata(imdbId, null, contentType);
      sendTrackSelectorLanguage(imdbId, null, "helper-timeout");
      sendTrackSelectorDiagnostic("metadata-lookup-result", {
        reason: lookupContext.reason,
        route: lookupContext.route,
        imdb_id: imdbId,
        content_type: contentType,
        status: "helper-timeout",
        retry_count: retryCount,
        elapsed_ms: Date.now() - lookupContext.startedAtMs,
      });
      return;
    }

    setTimeout(
      () =>
        waitForMetadata(
          imdbId,
          contentType,
          retryCount + 1,
          lookupContext,
        ),
      200,
    );
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
    initIntrodbSubmit();

    const handleSettingsChange = (reason) => {
      const state = window.RouteDetector.getRouteState();
      if (state.view === "PLAYER") {
        console.log("[MPV Bridge] Settings changed, updating all configs...");
        sendTrackSelectorConfig(0, {
          configSequence: ++trackConfigSequence,
          reason,
          route: getRouteDiagnostic(state),
          startedAtMs: Date.now(),
        });
        sendNotifySkipConfig();
        sendIntrodbSubmitConfig();
        // Re-send anime/profile metadata (HDR, Ultrawide, etc.)
        waitForMetadata(state.id, state.type, 0, {
          reason,
          route: getRouteDiagnostic(state),
          startedAtMs: Date.now(),
        });
      }
    };

    // Listen for storage changes (cross-window)
    window.addEventListener("storage", (e) => {
      // Check for kai-smart-track-* keys OR localProfile
      if (e.key?.startsWith("kai-") || e.key === "localProfile") {
        handleSettingsChange(`storage:${e.key}`);
      }
    });

    // Listen for custom event (same-window)
    window.addEventListener("kai-settings-changed", () =>
      handleSettingsChange("kai-settings-changed"),
    );

    // Check on initial load (in case we start on player page)
    onRouteChange();

    console.log(
      "%c[MPV Bridge] Initialized",
      "color: #7b5bf5; font-weight: bold",
    );
  }

  init();
})();
