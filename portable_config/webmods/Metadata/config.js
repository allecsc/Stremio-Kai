/**
 * @name Metadata Helper - Config Module
 * @description Configuration constants and Dexie loading for the metadata system
 */

// Configuration constants
const METADATA_CONFIG = {
  cinemetaApiBase: "https://cinemeta-live.strem.io/meta",
  //    cinemetaApiV3: 'https://v3-cinemeta.strem.io/meta',
  imdbApiBase: "https://api.imdbapi.dev",

  // Private API endpoints
  tmdbApiBase: "https://api.themoviedb.org/3",
  mdblistApiBase: "https://api.mdblist.com",
  tvdbApiBase: "https://api4.thetvdb.com/v4",

  // TMDB image base URL
  tmdbImageBase: "https://image.tmdb.org/t/p/",

  timeout: 5000,

  normalRate: 5,
  backgroundRate: 0.1,

  staleThreshold: 24 * 60 * 60 * 1000, // 24 hours - lazy refresh threshold

  retryDelay: 2000, // 2 second between enrichment retries
  backgroundRequestDelay: 10000, // 10 seconds between background requests
  enrichmentTriggerDelay: 100, // 100ms delay for enrichment triggers
  observerRetryDelay: 1000, // 1 second delay for observer setup retries
  initialScanDelay: 5000, // 5 seconds delay for initial re-scan

  // Cache TTLs (milliseconds)
  cacheTTL: {
    idConversion: 30 * 24 * 60 * 60 * 1000, // 30 days for ID mappings
    metadata: 7 * 24 * 60 * 60 * 1000, // 7 days for metadata
    authToken: 28 * 24 * 60 * 60 * 1000, // 28 days for TVDB tokens
  },

  // Rate limit fallback cooldown (1 hour)
  rateLimitCooldown: 60 * 60 * 1000,

  // DOM Selectors
  domSelectors: {
    containers:
      ".meta-items-container-n8vNz, .meta-items-container-qcuUA, .meta-items-container-IKrND",
    items: "a, div[tabindex]",
    posterImage: "img.poster-image-NiV7O",
    posterImageGeneric: 'img[src*="poster"]',
  },
};

// Export to global scope
window.MetadataModules = window.MetadataModules || {};
window.MetadataModules.config = {
  METADATA_CONFIG,

  // Initialize dependencies (Dexie.js)
  init: function () {
    if (typeof Dexie !== "undefined") {
      console.log("[Metadata Helper] Dexie.js already loaded");
      return;
    }

    const loadScript = () => {
      if (!document.head) {
        console.warn(
          "[Metadata Helper] document.head not available, retrying in 1s",
        );
        setTimeout(loadScript, 1000);
        return;
      }

      const script = document.createElement("script");
      script.src = "https://unpkg.com/dexie@3.2.4/dist/dexie.min.js";
      script.onload = () =>
        console.log("[Metadata Helper] Dexie.js loaded from CDN");
      script.onerror = () =>
        console.warn("[Metadata Helper] Failed to load Dexie.js");
      document.head.appendChild(script);
    };

    loadScript();
  },
};
