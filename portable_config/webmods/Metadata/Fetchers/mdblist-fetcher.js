/**
 * MDBList Fetcher Module
 *
 * Handles all interactions with the MDBList API.
 * Provides multi-source ratings (Trakt, Letterboxd, Rotten Tomatoes, etc.)
 *
 * @module mdblist-fetcher
 * @version 1.0.0
 */

(function () {
  "use strict";

  // ─────────────────────────────────────────────────────────────────────────────
  // INITIALIZATION GUARD
  // ─────────────────────────────────────────────────────────────────────────────
  if (window.MetadataModules?.mdblistFetcher?.initialized) {
    console.log("[MDBList Fetcher] Already initialized, skipping.");
    return;
  }

  window.MetadataModules = window.MetadataModules || {};

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────────
  const API_BASE = "https://api.mdblist.com";
  const TIMEOUT_MS = 5000;

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function getApiKeys() {
    return window.MetadataModules?.apiKeys;
  }

  function getFetchUtils() {
    return window.MetadataModules?.fetchUtils;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MDBLIST FETCHER CLASS
  // ─────────────────────────────────────────────────────────────────────────────

  class MDBListFetcher {
    constructor() {
      this.apiBase = API_BASE;
    }

    /**
     * Get the API key from storage
     */
    getApiKey() {
      const apiKeys = getApiKeys();
      return apiKeys?.getKey("MDBLIST");
    }

    /**
     * Check if MDBList is available (has key and not rate-limited)
     */
    isAvailable() {
      const apiKeys = getApiKeys();
      return apiKeys?.isAvailable("MDBLIST") ?? false;
    }

    /**
     * Fetch media info by IMDb ID
     * @param {string} imdbId - IMDb ID (tt1234567)
     * @param {string} type - 'movie' or 'series'
     * @param {boolean} priority - Whether this is a priority request
     * @returns {Promise<Object|null>}
     */
    async fetchByImdbId(imdbId, type = "movie", priority = false) {
      if (!this.isAvailable()) {
        console.debug(`[MDBList Fetcher] Not available for ${imdbId}`);
        return null;
      }

      const apiKey = this.getApiKey();
      if (!apiKey) return null;

      const fetchUtils = getFetchUtils();

      // MDBList endpoint: /imdb/movie/{id} or /imdb/show/{id}
      // Docs: https://mdblist.docs.apiary.io
      const mediaType = type === "series" ? "show" : "movie";
      const url = `${this.apiBase}/imdb/${mediaType}/${imdbId}?apikey=${apiKey}`;

      try {
        const result = await fetchUtils.makeRequest(url, {
          timeout: TIMEOUT_MS,
          headers: {
            Accept: "application/json",
          },
        });

        if (!result.ok) {
          if (result.status === 429) {
            getApiKeys()?.markRateLimited("MDBLIST");
            console.warn(
              "[MDBList Fetcher] Rate limited, marking for cooldown.",
            );
          } else if (result.status === 404) {
            console.debug(`[MDBList Fetcher] No data found for ${imdbId}`);
          } else {
            console.warn(
              `[MDBList Fetcher] Request failed: ${result.status} ${result.error}`,
            );
          }
          return null;
        }

        // Check if we got valid data
        if (!result.data || !result.data.title) {
          console.debug(
            `[MDBList Fetcher] No media data returned for ${imdbId}`,
          );
          return null;
        }

        const normalized = this.normalizeResponse(result.data);
        console.debug(
          `[MDBList Fetcher] Fetched ${imdbId}: ${
            Object.keys(normalized.ratings).length
          } rating sources`,
        );
        return normalized;
      } catch (error) {
        console.error(`[MDBList Fetcher] Error for ${imdbId}:`, error);
        return null;
      }
    }

    /**
     * Normalize the API response to internal format
     * Per plan, MDBList provides:
     * - plot (from description)
     * - ratings (multi-source object)
     * - trailer, poster, background
     * - contentRating (from certification)
     * - IDs (tmdb, tvdb)
     */
    normalizeResponse(data) {
      const ratings = this.normalizeRatings(data.ratings || []);

      // Add MDBList's score to ratings (if available)
      if (data.score != null) {
        ratings.mdblist = {
          score: data.score,
          votes: null, // MDBList score doesn't have vote count
        };
      }

      return {
        // Content
        plot: data.description || null,

        // Images
        poster: data.poster || null,
        background: data.backdrop || null,
        trailer: data.trailer || null,

        // Metadata
        contentRating: data.certification || null,

        // Ratings (multi-source)
        ratings,

        // External IDs (for cross-reference)
        tmdbId: data.tmdb_id || null,
        tvdbId: data.tvdb_id || null,

        // Source tracking
        source: "mdblist",
      };
    }

    /**
     * Normalize ratings array to object format
     * @param {Array} ratingsArray - Array of rating objects from API
     * @returns {Object} Normalized ratings object
     */
    normalizeRatings(ratingsArray) {
      const ratings = {};

      for (const rating of ratingsArray) {
        const source = rating.source?.toLowerCase();
        if (!source) continue;

        switch (source) {
          case "imdb":
            ratings.imdb = {
              score: rating.value,
              votes: rating.votes || 0,
            };
            break;

          case "trakt":
            ratings.trakt = {
              score: rating.value,
              votes: rating.votes || 0,
            };
            break;

          case "letterboxd":
            // Letterboxd uses a 5-star scale
            ratings.letterboxd = {
              score: rating.value,
              votes: rating.votes || 0,
            };
            break;

          case "tomatoes":
          case "rottentomatoes":
            // Check if it's critic or audience score
            if (
              rating.type === "audience" ||
              rating.name?.toLowerCase().includes("audience")
            ) {
              ratings.rottenTomatoesAudience = {
                score: rating.value,
                votes: rating.votes || 0,
              };
            } else {
              ratings.rottenTomatoes = {
                score: rating.value,
                votes: rating.votes || 0,
              };
            }
            break;

          case "metacritic":
            ratings.metacritic = {
              score: rating.value,
              votes: rating.votes || 0,
            };
            break;

          case "tmdb":
            ratings.tmdb = {
              score: rating.value,
              votes: rating.votes || 0,
            };
            break;

          case "rogerebert":
            // Roger Ebert uses a 4-star scale
            ratings.rogerebert = {
              score: rating.value,
              votes: rating.votes || 0,
            };
            break;

          case "mal":
          case "myanimelist":
            ratings.mal = {
              score: rating.value,
              votes: rating.votes || 0,
            };
            break;

          default:
            // Store other sources generically
            ratings[source] = {
              score: rating.value,
              votes: rating.votes || 0,
            };
        }
      }

      return ratings;
    }

    /**
     * Normalize streaming availability
     */
    normalizeStreaming(streamingArray) {
      if (!streamingArray || streamingArray.length === 0) return [];

      return streamingArray.map((s) => ({
        service: s.service || s.name,
        type: s.type, // 'subscription', 'rent', 'buy'
        link: s.link,
        price: s.price,
      }));
    }

    /**
     * Fetch user limits (useful for checking remaining quota)
     * @returns {Promise<Object|null>}
     */
    async fetchUserLimits() {
      const apiKey = this.getApiKey();
      if (!apiKey) return null;

      const fetchUtils = getFetchUtils();
      const url = `${this.apiBase}/user/limits?apikey=${apiKey}`;

      try {
        const result = await fetchUtils.makeRequest(url, {
          timeout: 5000,
          headers: {
            Accept: "application/json",
          },
        });

        if (result.ok) {
          return result.data;
        }
        return null;
      } catch (error) {
        return null;
      }
    }

    /**
     * Validate API key by making a test request
     */
    async validateAuthorization() {
      const apiKey = this.getApiKey();
      if (!apiKey) return { valid: false, error: "No API key" };

      const fetchUtils = getFetchUtils();
      // Use /lists/user/ endpoint as requested for validation
      const url = `${this.apiBase}/lists/user/?apikey=${apiKey}`;

      try {
        const result = await fetchUtils.makeRequest(url, {
          timeout: 5000,
          headers: {
            Accept: "application/json",
          },
        });

        return {
          valid: result.ok,
          error: result.ok ? null : result.error, // Now contains detailed error from fetch-utils
          // /lists/user returns a list, not limits, but validity is what matters here
          limits: null,
        };
      } catch (error) {
        return { valid: false, error: error.message };
      }
    }

    /**
     * Batch fetch media info for multiple IMDb IDs (up to 200)
     * More efficient than individual calls for Hero Banner enrichment
     * @param {string[]} imdbIds - Array of IMDb IDs
     * @param {string} type - 'movie' or 'series'
     * @returns {Promise<Map<string, Object>>} Map of imdbId → normalized data
     */
    async fetchBatchByImdbIds(imdbIds, type = "movie") {
      if (!this.isAvailable()) {
        console.debug("[MDBList Fetcher] Batch: Not available");
        return new Map();
      }
      if (!imdbIds?.length) return new Map();

      const apiKey = this.getApiKey();
      if (!apiKey) return new Map();

      const fetchUtils = getFetchUtils();
      const mediaType = type === "series" ? "show" : "movie";

      // MDBList batch endpoint: POST /imdb/{type}?apikey=xxx
      const url = `${this.apiBase}/imdb/${mediaType}?apikey=${apiKey}`;

      try {
        const result = await fetchUtils.makeRequest(url, {
          method: "POST",
          timeout: 15000, // Longer timeout for batch
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ ids: imdbIds }),
        });

        if (!result.ok) {
          if (result.status === 429) {
            getApiKeys()?.markRateLimited("MDBLIST");
            console.warn("[MDBList Fetcher] Batch rate limited.");
          } else {
            console.warn(`[MDBList Fetcher] Batch failed: ${result.status}`);
          }
          return new Map();
        }

        // Parse array response into Map
        const resultMap = new Map();
        const dataArray = result.data || [];

        for (const item of dataArray) {
          const imdbId = item.ids?.imdb;
          if (imdbId) {
            resultMap.set(imdbId, this.normalizeResponse(item));
          }
        }

        console.log(
          `[MDBList Fetcher] Batch: ${resultMap.size}/${imdbIds.length} ${mediaType}s`,
        );
        return resultMap;
      } catch (error) {
        console.error(`[MDBList Fetcher] Batch error:`, error);
        return new Map();
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────────
  const instance = new MDBListFetcher();

  window.MetadataModules.mdblistFetcher = {
    initialized: true,
    instance,

    // Convenience methods
    fetchByImdbId: (...args) => instance.fetchByImdbId(...args),
    fetchBatchByImdbIds: (...args) => instance.fetchBatchByImdbIds(...args),
    isAvailable: () => instance.isAvailable(),
    validateAuthorization: () => instance.validateAuthorization(),
    fetchUserLimits: () => instance.fetchUserLimits(),
  };

  console.log("[MDBList Fetcher] Module initialized.");
})();
