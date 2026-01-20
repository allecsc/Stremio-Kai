/**
 * Metadata Service Module
 *
 * Central orchestrator for fetching metadata from all available sources.
 * Executes API calls in parallel using Promise.allSettled for graceful degradation.
 * Merges results with priority ordering: Private APIs > Public APIs.
 *
 * @module metadata-service
 * @version 1.0.0
 */

(function () {
  "use strict";

  // ─────────────────────────────────────────────────────────────────────────────
  // INITIALIZATION GUARD
  // ─────────────────────────────────────────────────────────────────────────────
  if (window.MetadataModules?.metadataService?.initialized) {
    console.log("[Metadata Service] Already initialized, skipping.");
    return;
  }

  window.MetadataModules = window.MetadataModules || {};

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────────
  const CONFIG = {
    TMDB_TIMEOUT: 8000,
    MDBLIST_TIMEOUT: 5000,
    PUBLIC_TIMEOUT: 5000,
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function getModule(name) {
    return window.MetadataModules?.[name];
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // METADATA SERVICE CLASS
  // ─────────────────────────────────────────────────────────────────────────────

  class MetadataService {
    constructor() {
      this.debug = localStorage.getItem("kai-metadata-debug") === "true";
    }

    /**
     * Enable/disable debug logging
     */
    setDebug(enabled) {
      this.debug = enabled;
      localStorage.setItem("kai-metadata-debug", enabled.toString());
    }

    /**
     * Log debug message
     */
    log(message, ...args) {
      if (this.debug) {
        console.log(`[Metadata Service] ${message}`, ...args);
      }
    }

    /**
     * Fetch enriched metadata from all available sources in parallel
     * Uses Promise.allSettled for graceful degradation
     *
     * @param {string} imdbId - IMDb ID (tt1234567)
     * @param {string} type - 'movie' or 'series'
     * @param {boolean} priority - Whether this is a priority request (hover vs background)
     * @returns {Promise<Object>} Merged metadata from all sources
     */
    async getEnrichedMetadata(imdbId, type, priority = false) {
      const fetchUtils = getModule("fetchUtils");
      const apiKeys = getModule("apiKeys");
      const tmdbFetcher = getModule("tmdbFetcher");
      const mdblistFetcher = getModule("mdblistFetcher");

      if (!fetchUtils) {
        console.warn("[Metadata Service] fetchUtils not available");
        return this.getEmptyResult(imdbId);
      }

      const startTime = performance.now();
      const availableSources = [];

      // Build parallel promise array based on available keys
      const promises = {};

      // TMDB (if key available and not rate-limited)
      if (tmdbFetcher?.isAvailable()) {
        availableSources.push("tmdb");
        promises.tmdb = fetchUtils.withTimeout(
          () => tmdbFetcher.fetchByImdbId(imdbId, type, priority),
          null,
          { timeout: CONFIG.TMDB_TIMEOUT, getContext: () => `TMDB:${imdbId}` },
        );
      } else {
        promises.tmdb = Promise.resolve(null);
      }

      // MDBList (if key available and not rate-limited)
      if (mdblistFetcher?.isAvailable()) {
        availableSources.push("mdblist");
        promises.mdblist = fetchUtils.withTimeout(
          () => mdblistFetcher.fetchByImdbId(imdbId, type, priority),
          null,
          {
            timeout: CONFIG.MDBLIST_TIMEOUT,
            getContext: () => `MDBList:${imdbId}`,
          },
        );
      } else {
        promises.mdblist = Promise.resolve(null);
      }

      // Execute all private API calls in parallel
      const [tmdbResult, mdblistResult] = await Promise.all([
        promises.tmdb,
        promises.mdblist,
      ]);

      // Track which sources succeeded
      const successSources = [];
      if (tmdbResult) successSources.push("tmdb");
      if (mdblistResult) successSources.push("mdblist");

      const elapsed = Math.round(performance.now() - startTime);
      this.log(
        `Completed ${imdbId} in ${elapsed}ms, sources: ${
          successSources.join(", ") || "none"
        }`,
      );

      // Merge results with priority ordering
      return this.mergeResults({
        tmdb: tmdbResult,
        mdblist: mdblistResult,
        imdbId,
        type,
      });
    }

    /**
     * Merge results from multiple sources with priority ordering
     * Private APIs take precedence over each other based on data quality
     *
     * Priority order:
     * - Cast/Crew: TMDB (best photos)
     * - Ratings: MDBList (multi-source) > TMDB
     * - Seasons: TMDB
     *
     * @param {Object} sources - Results from each source
     * @returns {Object} Merged metadata
     */
    mergeResults({ tmdb, mdblist, imdbId, type }) {
      // CRITICAL: Only include fields that have actual non-null values
      // This prevents overwriting existing data with nulls
      // NOTE: We don't include imdbId here - callers add the correct 'imdb' field
      const result = {
        type,
      };

      // Track which private sources contributed
      if (tmdb) result.metaSourcePrivate = "tmdb";
      else if (mdblist) result.metaSourcePrivate = "mdblist";

      // ─────────────────────────────────────────────────────────────────
      // CONTENT - Only add if we have actual values
      // ─────────────────────────────────────────────────────────────────
      const title = tmdb?.title || mdblist?.title;
      if (title) result.title = title;

      const originalTitle = tmdb?.originalTitle || mdblist?.originalTitle;
      if (originalTitle) result.originalTitle = originalTitle;

      const plot = tmdb?.plot || mdblist?.plot;
      if (plot) result.plot = plot;

      const tagline = tmdb?.tagline;
      if (tagline) result.tagline = tagline;

      // ─────────────────────────────────────────────────────────────────
      // METADATA (MDBList)
      // ─────────────────────────────────────────────────────────────────
      const contentRating = mdblist?.contentRating;
      if (contentRating) result.contentRating = contentRating;

      // ─────────────────────────────────────────────────────────────────
      // IMAGES - Only add if we have actual URLs
      // ─────────────────────────────────────────────────────────────────
      const poster = tmdb?.poster || mdblist?.poster;
      if (poster) result.poster = poster;

      const background = tmdb?.background || mdblist?.background;
      if (background) result.background = background;

      const logo = tmdb?.logo || mdblist?.logo;
      if (logo) result.logo = logo;

      const trailer = mdblist?.trailer;
      if (trailer) result.trailer = trailer;

      // ─────────────────────────────────────────────────────────────────
      // EXTERNAL IDs - Use correct schema field names (tmdb not tmdbId)
      // Only add if we have actual values
      // ─────────────────────────────────────────────────────────────────
      if (mdblist?.tmdbId) result.tmdb = mdblist.tmdbId;
      if (mdblist?.tvdbId) result.tvdb = mdblist.tvdbId;

      // ─────────────────────────────────────────────────────────────────
      // RATINGS - Pass through for storage._mergeRatings to handle
      // Don't merge here, let storage do the merge with existing
      // ─────────────────────────────────────────────────────────────────
      if (mdblist?.ratings && Object.keys(mdblist.ratings).length > 0) {
        result.ratings = mdblist.ratings;
      }

      // ─────────────────────────────────────────────────────────────────
      // NETWORK & STUDIO - Enabled with strict single-entry filtering
      // ─────────────────────────────────────────────────────────────────
      if (type === "series" && tmdb?.network) result.network = tmdb.network;

      // New: Studio for anime
      if (tmdb?.studio) result.studio = tmdb.studio;

      // NOTE: We explicitly do NOT include:
      // - stars/directors (public APIs handle this)
      // - status (public APIs handle this)
      // - cast (public APIs handle this)
      // This prevents overwriting good data with incomplete/null data

      return result;
    }

    /**
     * Merge ratings from MDBList (multi-source) with any TMDB rating
     */
    mergeRatings(mdblistRatings, tmdbData) {
      const ratings = {};

      // MDBList provides the most comprehensive ratings
      if (mdblistRatings) {
        if (mdblistRatings.imdb) ratings.imdb = mdblistRatings.imdb;
        if (mdblistRatings.trakt) ratings.trakt = mdblistRatings.trakt;
        if (mdblistRatings.letterboxd)
          ratings.letterboxd = mdblistRatings.letterboxd;
        if (mdblistRatings.rottenTomatoes)
          ratings.rottenTomatoes = mdblistRatings.rottenTomatoes;
        if (mdblistRatings.rottenTomatoesAudience)
          ratings.rottenTomatoesAudience =
            mdblistRatings.rottenTomatoesAudience;
        if (mdblistRatings.metacritic)
          ratings.metacritic = mdblistRatings.metacritic;
        if (mdblistRatings.tmdb) ratings.tmdb = mdblistRatings.tmdb;
        if (mdblistRatings.rogerebert)
          ratings.rogerebert = mdblistRatings.rogerebert;
        if (mdblistRatings.mal) ratings.mal = mdblistRatings.mal;
      }

      return ratings;
    }

    /**
     * Merge alternative titles from multiple sources
     */
    mergeAltTitles(...titleArrays) {
      const allTitles = new Set();

      for (const titles of titleArrays) {
        if (Array.isArray(titles)) {
          for (const title of titles) {
            if (title && typeof title === "string") {
              allTitles.add(title);
            }
          }
        }
      }

      return [...allTitles];
    }

    /**
     * Return an empty result structure
     */
    getEmptyResult(imdbId) {
      return {
        imdbId,
        metaSourcePrivate: null,
        lastEnrichedPrivate: null,
        ratings: {},
        cast: [],
        directors: [],
        altTitles: [],
        keywords: [],
        videos: [],
      };
    }

    /**
     * Check if any private API is available
     */
    hasPrivateApiAvailable() {
      const tmdb = getModule("tmdbFetcher");
      const mdblist = getModule("mdblistFetcher");

      return tmdb?.isAvailable() || mdblist?.isAvailable();
    }

    /**
     * Get status of all private APIs
     */
    getApiStatus() {
      const apiKeys = getModule("apiKeys");
      const tmdb = getModule("tmdbFetcher");
      const mdblist = getModule("mdblistFetcher");

      return {
        tmdb: {
          hasKey: apiKeys?.hasKey("TMDB") ?? false,
          isAvailable: tmdb?.isAvailable() ?? false,
          isRateLimited: apiKeys?.isRateLimited("TMDB") ?? false,
        },
        mdblist: {
          hasKey: apiKeys?.hasKey("MDBLIST") ?? false,
          isAvailable: mdblist?.isAvailable() ?? false,
          isRateLimited: apiKeys?.isRateLimited("MDBLIST") ?? false,
        },
      };
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // LAZY ENRICHMENT ORCHESTRATION
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Trigger lazy Jikan enrichment if needed
     * @param {Object} entry - Database entry
     * @param {boolean} priority - Whether this is a priority request
     * @returns {Promise<Object|null>} Updated entry or null
     */
    async triggerLazyJikan(entry, priority = false) {
      // Initialize pending map if not exists
      if (!this.jikanPending) this.jikanPending = new Map();

      // Instances are exposed via main.js at window.metadataStorage and window.metadataServices
      const storage = window.metadataStorage;
      const fetcher = window.metadataServices?.metadataFetcher;
      const idConverter = window.metadataServices?.idConverter;

      if (!storage || !fetcher) {
        console.warn(
          "[Metadata Service] Storage or fetcher not available for Jikan enrichment",
        );
        return null;
      }

      // Skip if already has MAL rating in unified format
      if (entry?.ratings?.mal?.score != null) return null;

      let malId = null;
      const malIds = Array.isArray(entry?.mal)
        ? entry.mal
        : entry?.mal
          ? [entry.mal]
          : [];
      malId = malIds[0] || null;

      // If no MAL ID, check if likely anime and attempt reverse lookup
      if (!malId && entry?.imdb && idConverter) {
        const { isAnime } = window.AnimeDetection?.detect(entry) || {};

        if (isAnime) {
          this.log(
            `🔍 Anime detected without MAL ID, attempting reverse lookup for ${entry.title}`,
          );

          try {
            const conversion = await idConverter.convertFromImdb(
              entry.imdb,
              priority,
            );
            if (conversion?.mal?.length) {
              malId = conversion.mal[0];
              await storage.enrichTitleIds(entry.imdb, {
                mal: conversion.mal,
                anilist: conversion.anilist,
                kitsu: conversion.kitsu,
                tmdb: conversion.tmdb,
                tvdb: conversion.tvdb,
              });
              this.log(
                `✅ Reverse lookup succeeded: ${conversion.mal.length} MAL IDs found`,
              );
            } else {
              this.log(
                `⚠️ Reverse lookup returned no MAL IDs for ${entry.imdb}`,
              );
              return null;
            }
          } catch (e) {
            console.warn(`[Metadata Service] Reverse lookup failed:`, e);
            return null;
          }
        } else {
          return null; // Not anime
        }
      }

      if (!malId) return null;

      // Deduplication
      if (this.jikanPending.has(malId)) {
        this.log(`⏳ Joining active fetch for ${entry.title} (MAL: ${malId})`);
        return this.jikanPending.get(malId);
      }

      this.log(`🟡 Starting Jikan fetch for ${entry.title} (MAL: ${malId})`);

      const fetchPromise = (async () => {
        try {
          const jikanData = await fetcher.fetchJikanData(malId, priority);
          if (jikanData) {
            const updatePayload = {
              ...jikanData,
              id: entry.id,
              imdb: entry.imdb,
              type: entry.type,
            };
            this.log(`🟢 Jikan success: ${entry.title}`);
            return await storage.saveTitle(updatePayload);
          }
          return null;
        } catch (e) {
          console.warn(
            `[Metadata Service] Jikan failed for ${entry.title}:`,
            e,
          );
          return null;
        } finally {
          this.jikanPending.delete(malId);
        }
      })();

      this.jikanPending.set(malId, fetchPromise);
      return fetchPromise;
    }

    /**
     * Trigger lazy private API enrichment for an entry
     * @param {Object} entry - Database entry
     * @param {boolean} priority - Whether this is a priority request
     * @returns {Promise<Object|null>} Updated entry or null
     */
    async triggerLazyPrivateEnrichment(entry, priority = false) {
      if (!entry?.imdb) return null;

      const storage = window.metadataStorage;
      if (!storage) return null;

      const metadataConfig = getModule("config")?.METADATA_CONFIG;
      const ttl = metadataConfig?.cacheTTL?.metadata || 7 * 24 * 60 * 60 * 1000;

      if (
        entry.lastEnrichedPrivate &&
        Date.now() - entry.lastEnrichedPrivate < ttl
      ) {
        return null; // Already enriched recently
      }

      if (!this.hasPrivateApiAvailable()) {
        return null;
      }

      this.log(
        `🟡 Starting private enrichment for ${entry.title} (${entry.imdb})`,
      );

      try {
        const privateData = await this.getEnrichedMetadata(
          entry.imdb,
          entry.type,
          priority,
        );

        if (privateData && privateData.metaSourcePrivate) {
          const updatePayload = {
            ...privateData,
            id: entry.id,
            imdb: entry.imdb,
            type: entry.type,
          };

          const updated = await storage.saveTitle(updatePayload);
          this.log(`🟢 Private enrichment success: ${entry.title}`);
          return updated;
        }

        return null;
      } catch (error) {
        console.warn(
          `[Metadata Service] Private enrichment failed for ${entry.title}:`,
          error,
        );
        return null;
      }
    }

    /**
     * Check if an entry needs private API enrichment
     * @param {Object} entry - Database entry
     * @returns {boolean} True if needs enrichment
     */
    needsPrivateEnrichment(entry) {
      if (!entry?.imdb) return false;

      const metadataConfig = getModule("config")?.METADATA_CONFIG;
      const ttl = metadataConfig?.cacheTTL?.metadata || 7 * 24 * 60 * 60 * 1000;

      if (!entry.lastEnrichedPrivate) return true;
      if (Date.now() - entry.lastEnrichedPrivate > ttl) return true;

      return false;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // INITIAL BATCH ENRICHMENT (for Hero Banner on API key save)
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Trigger initial batch enrichment for Hero Banner items
     * Called when API key is saved via api-keys-settings.js
     */
    async triggerInitialEnrichment() {
      if (!this.hasPrivateApiAvailable()) {
        this.debugLog("Initial enrichment: No private APIs available.");
        return;
      }

      console.log(
        "[Metadata Service] 🚀 Starting initial enrichment for Hero Banner...",
      );

      const heroCacheItems = this.getHeroBannerCacheItems();
      if (!heroCacheItems.length) {
        console.log("[Metadata Service] No Hero Banner cache to enrich.");
        return;
      }

      console.log(
        `[Metadata Service] Found ${heroCacheItems.length} Hero Banner items.`,
      );

      // Separate by type for MDBList batch calls
      const movies = heroCacheItems.filter((i) => i.type === "movie");
      const series = heroCacheItems.filter((i) => i.type === "series");

      const mdblistFetcher = getModule("mdblistFetcher");
      const tmdbFetcher = getModule("tmdbFetcher");
      const storage = window.metadataStorage;

      // MDBList batch calls (2 max: movies + series)
      let mdblistData = new Map();
      if (mdblistFetcher?.isAvailable()) {
        const [movieData, seriesData] = await Promise.all([
          movies.length
            ? mdblistFetcher.fetchBatchByImdbIds(
                movies.map((m) => m.imdb),
                "movie",
              )
            : Promise.resolve(new Map()),
          series.length
            ? mdblistFetcher.fetchBatchByImdbIds(
                series.map((s) => s.imdb),
                "series",
              )
            : Promise.resolve(new Map()),
        ]);
        // Merge maps
        mdblistData = new Map([...movieData, ...seriesData]);
        console.log(
          `[Metadata Service] MDBList batch: ${mdblistData.size} items.`,
        );
      }

      // TMDB calls in parallel (no batch API available)
      let successCount = 0;
      if (tmdbFetcher?.isAvailable()) {
        const tmdbPromises = heroCacheItems.map(async (item) => {
          try {
            const tmdbData = await tmdbFetcher.fetchByImdbId(
              item.imdb,
              item.type,
            );
            const mdbData = mdblistData.get(item.imdb);

            if (tmdbData || mdbData) {
              const merged = this.mergeResults({
                tmdb: tmdbData,
                mdblist: mdbData,
                imdbId: item.imdb,
                type: item.type,
              });

              // Save to DB
              if (storage && merged && Object.keys(merged).length > 0) {
                await storage.saveTitle({
                  ...merged,
                  id: item.id || item.imdb,
                  imdb: item.imdb,
                  type: item.type,
                  lastEnrichedPrivate: Date.now(),
                });
                successCount++;
              }
            }
          } catch (error) {
            this.debugLog(`Initial enrichment error for ${item.imdb}:`, error);
          }
        });

        await Promise.all(tmdbPromises);
      }

      console.log(
        `[Metadata Service] ✅ Initial enrichment complete: ${successCount}/${heroCacheItems.length} items.`,
      );

      // Notify Hero Banner to refresh if visible
      window.dispatchEvent(new CustomEvent("kai-enrichment-complete"));
    }

    /**
     * Get Hero Banner cached items from localStorage
     * @returns {Array<{imdb: string, type: string}>}
     */
    getHeroBannerCacheItems() {
      const items = [];
      const heroConfig = window.HeroPlugin?.Config;

      // Movie cache
      try {
        const movieCacheKey =
          heroConfig?.MOVIE_CACHE_KEY || "hero-movies-cache";
        const movieCache = localStorage.getItem(movieCacheKey);
        if (movieCache) {
          const parsed = JSON.parse(movieCache);
          if (Array.isArray(parsed)) {
            items.push(...parsed.filter((i) => i?.imdb));
          }
        }
      } catch (e) {
        /* ignore */
      }

      // Anime cache
      try {
        const animeCacheKey = heroConfig?.ANIME_CACHE_KEY || "hero-anime-cache";
        const animeCache = localStorage.getItem(animeCacheKey);
        if (animeCache) {
          const parsed = JSON.parse(animeCache);
          if (parsed?.titles && Array.isArray(parsed.titles)) {
            items.push(...parsed.titles.filter((i) => i?.imdb));
          }
        }
      } catch (e) {
        /* ignore */
      }

      return items;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EVENT LISTENER FOR API KEY SAVE
  // ─────────────────────────────────────────────────────────────────────────────
  let enrichmentDebounce = null;

  window.addEventListener("kai-api-key-saved", (e) => {
    // Debounce: wait 500ms after last key save
    clearTimeout(enrichmentDebounce);
    enrichmentDebounce = setTimeout(() => {
      const service = window.MetadataModules?.metadataService;
      if (service?.instance) {
        service.instance.triggerInitialEnrichment();
      }
    }, 500);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────────
  const instance = new MetadataService();

  window.MetadataModules.metadataService = {
    initialized: true,
    instance,

    // Core method
    getEnrichedMetadata: (...args) => instance.getEnrichedMetadata(...args),

    // Lazy enrichment orchestration
    triggerLazyJikan: (...args) => instance.triggerLazyJikan(...args),
    triggerLazyPrivateEnrichment: (...args) =>
      instance.triggerLazyPrivateEnrichment(...args),
    needsPrivateEnrichment: (...args) =>
      instance.needsPrivateEnrichment(...args),

    // Initial batch enrichment (for Hero Banner)
    triggerInitialEnrichment: () => instance.triggerInitialEnrichment(),

    // Status methods
    hasPrivateApiAvailable: () => instance.hasPrivateApiAvailable(),
    getApiStatus: () => instance.getApiStatus(),

    // Debug
    setDebug: (enabled) => instance.setDebug(enabled),
  };

  console.log("[Metadata Service] Module initialized.");
})();
