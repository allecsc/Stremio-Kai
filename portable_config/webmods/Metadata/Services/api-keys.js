/**
 * API Keys Management Module
 *
 * Centralized management for user-provided private API keys (TMDB, MDBList).
 * Handles storage (obfuscated), validation, and rate limit tracking.
 *
 * @module api-keys
 */

(function () {
  "use strict";

  // ─────────────────────────────────────────────────────────────────────────────
  // INITIALIZATION GUARD
  // ─────────────────────────────────────────────────────────────────────────────
  if (window.MetadataModules?.apiKeys?.initialized) {
    console.log("[API Keys] Already initialized, skipping.");
    return;
  }

  window.MetadataModules = window.MetadataModules || {};

  // ─────────────────────────────────────────────────────────────────────────────
  // CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────
  const PROVIDERS = Object.freeze({
    TMDB: "tmdb",
    MDBLIST: "mdblist",
  });

  const STORAGE_KEYS = Object.freeze({
    TMDB: "kai-api-key-tmdb",
    MDBLIST: "kai-api-key-mdblist",
    RATE_LIMIT_PREFIX: "kai-api-ratelimit-",
  });

  const VALIDATION_ENDPOINTS = Object.freeze({
    TMDB: "https://api.themoviedb.org/3/configuration", // Uses api_key query param
    MDBLIST: "https://api.mdblist.com/user",
  });

  // CORS proxy for APIs that don't support browser CORS (MDBList)
  const CORS_PROXY = "https://api.allorigins.win/raw?url=";

  function proxyUrl(url) {
    return CORS_PROXY + encodeURIComponent(url);
  }

  // Rate limit cooldown: 1 hour
  const RATE_LIMIT_COOLDOWN_MS = 60 * 60 * 1000;

  // Validation timeout
  const VALIDATION_TIMEOUT_MS = 10000;

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL STATE
  // ─────────────────────────────────────────────────────────────────────────────
  // Memory cache for rate limit state (faster than localStorage)
  const _rateLimitCache = new Map();

  // ─────────────────────────────────────────────────────────────────────────────
  // OBFUSCATION HELPERS (base64 - simple obfuscation, not encryption)
  // ─────────────────────────────────────────────────────────────────────────────
  function obfuscate(value) {
    if (!value) return "";
    try {
      return btoa(encodeURIComponent(value));
    } catch (e) {
      console.error("[API Keys] Obfuscation failed:", e);
      return "";
    }
  }

  function deobfuscate(value) {
    if (!value) return "";
    try {
      return decodeURIComponent(atob(value));
    } catch (e) {
      console.error("[API Keys] De-obfuscation failed:", e);
      return "";
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // KEY MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Store an API key (obfuscated)
   * @param {string} provider - Provider name (TMDB, MDBLIST, TVDB)
   * @param {string} key - The API key to store
   */
  function setKey(provider, key) {
    const storageKey = STORAGE_KEYS[provider.toUpperCase()];
    if (!storageKey) {
      console.warn(`[API Keys] Unknown provider: ${provider}`);
      return;
    }

    if (!key || key.trim() === "") {
      clearKey(provider);
      return;
    }

    const obfuscated = obfuscate(key.trim());
    localStorage.setItem(storageKey, obfuscated);
    console.log(`[API Keys] ${provider} key stored.`);
  }

  /**
   * Retrieve an API key (de-obfuscated)
   * @param {string} provider - Provider name (TMDB, MDBLIST, TVDB)
   * @returns {string|null} The API key or null if not set
   */
  function getKey(provider) {
    const storageKey = STORAGE_KEYS[provider.toUpperCase()];
    if (!storageKey) {
      console.warn(`[API Keys] Unknown provider: ${provider}`);
      return null;
    }

    const obfuscated = localStorage.getItem(storageKey);
    if (!obfuscated) return null;

    const key = deobfuscate(obfuscated);
    return key || null;
  }

  /**
   * Check if a key exists for a provider
   * @param {string} provider - Provider name
   * @returns {boolean}
   */
  function hasKey(provider) {
    return !!getKey(provider);
  }

  /**
   * Clear an API key
   * @param {string} provider - Provider name
   */
  function clearKey(provider) {
    const storageKey = STORAGE_KEYS[provider.toUpperCase()];
    if (!storageKey) return;

    localStorage.removeItem(storageKey);

    // Clear rate limit status
    clearRateLimited(provider);

    console.log(`[API Keys] ${provider} key cleared.`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RATE LIMIT TRACKING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Check if a provider is currently rate-limited
   * @param {string} provider - Provider name
   * @returns {boolean}
   */
  function isRateLimited(provider) {
    const key = provider.toUpperCase();

    // Check memory cache first
    if (_rateLimitCache.has(key)) {
      const until = _rateLimitCache.get(key);
      if (Date.now() < until) {
        return true;
      }
      // Expired, remove from cache
      _rateLimitCache.delete(key);
    }

    // Check localStorage (for persistence across page reloads)
    const storageKey = STORAGE_KEYS.RATE_LIMIT_PREFIX + key;
    const until = localStorage.getItem(storageKey);
    if (until) {
      const untilTimestamp = parseInt(until, 10);
      if (!isNaN(untilTimestamp) && Date.now() < untilTimestamp) {
        // Still rate limited, update memory cache
        _rateLimitCache.set(key, untilTimestamp);
        return true;
      }
      // Expired, remove from storage
      localStorage.removeItem(storageKey);
    }

    return false;
  }

  /**
   * Mark a provider as rate-limited
   * @param {string} provider - Provider name
   * @param {number} [cooldownMs=RATE_LIMIT_COOLDOWN_MS] - Cooldown duration
   */
  function markRateLimited(provider, cooldownMs = RATE_LIMIT_COOLDOWN_MS) {
    const key = provider.toUpperCase();
    const until = Date.now() + cooldownMs;

    _rateLimitCache.set(key, until);
    localStorage.setItem(
      STORAGE_KEYS.RATE_LIMIT_PREFIX + key,
      until.toString()
    );

    console.warn(
      `[API Keys] ${provider} marked rate-limited for ${Math.round(
        cooldownMs / 60000
      )} minutes.`
    );
  }

  /**
   * Clear rate limit for a provider
   * @param {string} provider - Provider name
   */
  function clearRateLimited(provider) {
    const key = provider.toUpperCase();
    _rateLimitCache.delete(key);
    localStorage.removeItem(STORAGE_KEYS.RATE_LIMIT_PREFIX + key);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AVAILABILITY CHECK
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Check if a provider is available (has key AND not rate-limited)
   * @param {string} provider - Provider name
   * @returns {boolean}
   */
  function isAvailable(provider) {
    return hasKey(provider) && !isRateLimited(provider);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // KEY VALIDATION
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Validate an API key by making a test request
   * @param {string} provider - Provider name
   * @param {string} key - The API key to validate
   * @returns {Promise<{valid: boolean, error?: string, token?: string}>}
   */
  async function validateKey(provider, key) {
    const providerUpper = provider.toUpperCase();

    if (!key || key.trim() === "") {
      return { valid: false, error: "API key is empty" };
    }

    const trimmedKey = key.trim();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        VALIDATION_TIMEOUT_MS
      );

      let response;
      let result = { valid: false };

      switch (providerUpper) {
        case "TMDB":
          response = await fetch(
            `${VALIDATION_ENDPOINTS.TMDB}?api_key=${encodeURIComponent(
              trimmedKey
            )}`,
            {
              signal: controller.signal,
            }
          );
          clearTimeout(timeoutId);

          if (response.ok) {
            result = { valid: true };
          } else if (response.status === 401) {
            result = { valid: false, error: "Invalid API key" };
          } else {
            result = { valid: false, error: `HTTP ${response.status}` };
          }
          break;

        case "MDBLIST":
          // MDBList doesn't support browser CORS and proxies are unreliable
          // Validate format only - actual validation happens on first use
          clearTimeout(timeoutId);

          // MDBList keys are typically 24+ alphanumeric characters
          if (trimmedKey.length >= 20 && /^[a-zA-Z0-9]+$/.test(trimmedKey)) {
            result = { valid: true };
            console.log(
              "[API Keys] MDBList key format valid, will verify on first use."
            );
          } else {
            result = {
              valid: false,
              error: "Invalid key format (expected 20+ alphanumeric)",
            };
          }
          break;

        default:
          clearTimeout(timeoutId);
          result = { valid: false, error: `Unknown provider: ${provider}` };
      }

      return result;
    } catch (error) {
      if (error.name === "AbortError") {
        return { valid: false, error: "Validation timed out" };
      }
      return { valid: false, error: error.message || "Network error" };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────────
  window.MetadataModules.apiKeys = {
    initialized: true,

    // Constants
    PROVIDERS,
    STORAGE_KEYS,
    RATE_LIMIT_COOLDOWN_MS,

    // Key management
    setKey,
    getKey,
    hasKey,
    clearKey,

    // Rate limit tracking
    isRateLimited,
    markRateLimited,
    clearRateLimited,

    // Availability check
    isAvailable,

    // Validation
    validateKey,
  };

  console.log("[API Keys] Module initialized.");
})();
