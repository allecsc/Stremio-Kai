// =========================================================================
// CATALOG ENRICHMENT SERVICE
// Automates the fetching, normalizing, and enriching of API-based catalogs.
// Connects external APIs to the Metadata Storage "Engine".
// =========================================================================

// OPTIMIZATION: Pre-compiled Regex
const YEAR_REGEX = /(\d{4})/;
const DURATION_REGEX = /(\d+)\s*min/;

/**
 * Catalog Enrichment Service.
 * Automates the fetching, normalizing, and enriching of API-based catalogs.
 * Acts as the bridge between external APIs (Cinemeta/Jikan) and the internal Metadata Storage.
 */
class CatalogEnrichmentService {
  constructor() {
    // Cache for lazy getters
    this._storage = null;
    this._config = null;
    this._cache = null;
    this._rateLimiter = null;
  }

  get storage() {
    if (!this._storage) {
      this._storage =
        window.metadataStorage ||
        window.metadataServices?.storage ||
        window.MetadataModules?.metadataStorage?.instance ||
        null;
    }
    return this._storage;
  }

  get config() {
    if (!this._config) {
      this._config = window.HeroPlugin?.Config || {};
    }
    return this._config;
  }

  get cache() {
    if (!this._cache) {
      this._cache = window.HeroPlugin?.Cache || {};
    }
    return this._cache;
  }

  get rateLimiter() {
    if (!this._rateLimiter) {
      // Access existing singleton or create new if needed (though Metadata system should have one)
      this._rateLimiter =
        window.MetadataModules?.rateLimiter?.instance ||
        new (
          window.MetadataModules?.rateLimiter?.GlobalRateLimiter ||
          class {
            makeJikanRequest(url) {
              return fetch(url).then((r) => r.json());
            }
          }
        )();
    }
    return this._rateLimiter;
  }

  // ==========================================
  // EXTENDED API FOR HERO BANNER
  // ==========================================

  /**
   * Wait for Metadata System to be ready
   */
  /**
   * Waits for the central Metadata System to be fully initialized.
   * @param {number} [timeoutMs=10000] - Max wait time in milliseconds
   * @returns {Promise<boolean>} True if ready, false if timed out
   */
  waitForMetadata(timeoutMs = 10000) {
    return new Promise((resolve) => {
      if (window.MetadataModules && window.MetadataModules.ready) {
        return resolve(true);
      }

      console.log("[CatalogService] Waiting for Metadata system...");
      let resolved = false;

      const onReady = () => {
        if (resolved) return;
        resolved = true;
        console.log("[CatalogService] Metadata system ready signal received");
        resolve(true);
      };

      window.addEventListener("metadata-modules-ready", onReady, {
        once: true,
      });

      const interval = setInterval(() => {
        if (window.MetadataModules && window.MetadataModules.ready) {
          clearInterval(interval);
          window.removeEventListener("metadata-modules-ready", onReady);
          onReady();
        }
      }, 500);

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          clearInterval(interval);
          window.removeEventListener("metadata-modules-ready", onReady);
          console.warn(
            "[CatalogService] Timeout waiting for Metadata - proceeding anyway",
          );
          resolve(false);
        }
      }, timeoutMs);
    });
  }

  /**
   * Main entry point: Fetches catalog and processes it with priority.
   * OPTIMIZATION: Runs in parallel (Promise.all)
   */
  /**
   * Main processing pipeline.
   * Takes raw API items, normalizes them, and feeds them into the Metadata Storage engine.
   * Runs concurrently for performance.
   * @param {Array} [catalogItems] - Optional manual list of items to process
   * @returns {Promise<Array>} List of successfully enriched and saved items
   */
  async processCatalog(catalogItems = null, progressCallback = null) {
    const storage = this.storage;
    if (!storage) {
      console.error(
        "[CatalogService] Metadata Storage not available. Check window.metadataServices.",
      );
      return [];
    }

    // 1. Get Items
    const items =
      catalogItems || (await this.fetchCatalog("movie", "imdbRating"));

    console.log(
      `[CatalogService] Processing ${items.length} items (Parallel)...`,
    );

    let processedCount = 0;
    const totalCount = items.length;

    // 2. Process concurrently
    const results = await Promise.all(
      items.map(async (item) => {
        try {
          // Map API item -> Standard ProcessedData Structure
          const processedData = this.normalizeItem(item);

          // 3. Feed the Engine (Priority = TRUE)
          // The Engine (MetadataStorage) handles its own concurrency/queuing internally.
          // This saves the basic item to DB.
          let result = await this.storage.processAndSaveData(
            processedData,
            true,
          );

          // 4. Collect Result & Update Cache
          if (result) {
            const originalBackground = result.background;
            const originalLogo = result.logo;

            // --- PERMANENT ENRICHMENT (EAGER) ---
            // Enhance with TMDB images (4K Backdrops / SVG Logos) immediately.
            // This ensures the database holds the "Premium" assets for the Hero Banner cache.
            const enhancedResult = await this.enhanceWithTMDBImages(result);

            // If images were upgraded, we MUST persist the changes to DB now.
            if (
              enhancedResult.background !== originalBackground ||
              enhancedResult.logo !== originalLogo
            ) {
              // Use saveTitle to update the record (it merges changes)
              // Validation already happens inside enhanceWithTMDBImages
              await this.storage.saveTitle(enhancedResult);
              // Update our local reference to the saved version
              result = enhancedResult;
            }

            // Global Logo Validation (Sanity Check)
            const ImageUtils = window.MetadataModules?.imageUtils?.ImageUtils;
            if (result.logo && ImageUtils) {
              const isLogoValid = await ImageUtils.validateUrl(result.logo);
              if (!isLogoValid) {
                result.logo = null; // Trigger UI fallback
              }
            }

            // 5. Private API enrichment (TMDB/MDBList for multi-source ratings)
            // Only wait if Private APIs are configured (has keys)
            const metadataService = window.MetadataModules?.metadataService;
            let finalResult = result;
            if (
              metadataService?.hasPrivateApiAvailable?.() &&
              metadataService?.triggerLazyPrivateEnrichment
            ) {
              try {
                const enrichedResult =
                  await metadataService.triggerLazyPrivateEnrichment(
                    result,
                    true,
                  );
                if (enrichedResult) {
                  finalResult = enrichedResult;
                }
              } catch (e) {
                // Silent fail - use public API result
              }
            }

            processedCount++;

            // Report progress
            if (progressCallback) {
              progressCallback(
                null, // msg
                null, // progress percent
                processedCount, // current count
                finalResult.extractedTitle ||
                  finalResult.title ||
                  finalResult.name, // title name
              );
            }

            return finalResult;
          }
        } catch (error) {
          console.error(
            `[CatalogService] Failed item ${item.extractedTitle || item.name}:`,
            error,
          );
        }
        return null;
      }),
    );

    const enrichedResults = results.filter(Boolean); // Filter nulls

    console.log(`[CatalogService] Finished. Enriched ${processedCount} items.`);
    return enrichedResults;
  }

  /**
   * High-level Orchestrator: Get Movies & Series (Interleaved)
   */
  /**
   * High-level orchestrator to fetch and merge Movie and Series catalogs.
   * Interleaves results to create a mixed content experience.
   * @param {Function} [progressCallback] - Optional callback for UI progress updates
   * @returns {Promise<Array>} Combined enriched sorted list
   */
  async getMoviesAndSeries(progressCallback) {
    await this.waitForMetadata();

    // 1. Determine Limits based on Configuration
    const movieUrl = this.config.MOVIE_CATALOG_URL;
    const seriesUrl = this.config.SERIES_CATALOG_URL;

    let movieLimit = 0;
    let seriesLimit = 0;

    if (movieUrl && seriesUrl) {
      // Both active: Interleave 10 + 10
      movieLimit = 10;
      seriesLimit = 10;
    } else if (movieUrl) {
      // Only Movies: 20
      movieLimit = 20;
    } else if (seriesUrl) {
      // Only Series: 20
      seriesLimit = 20;
    } else {
      // Neither
      console.warn(
        "[CatalogService] Both Movie and Series catalogs are disabled/empty.",
      );
      return [];
    }

    const BUFFER_SIZE = 30;

    if (progressCallback) progressCallback("Fetching popular titles...", 10);

    try {
      // 2. Fetch RAW buffers concurrently (only for active types)
      const promises = [];
      if (movieLimit > 0)
        promises.push(this.fetchCatalog("movie", BUFFER_SIZE));
      else promises.push(Promise.resolve([]));

      if (seriesLimit > 0)
        promises.push(this.fetchCatalog("series", BUFFER_SIZE));
      else promises.push(Promise.resolve([]));

      const [rawMovies, rawSeries] = await Promise.all(promises);

      if (progressCallback)
        progressCallback("Pre-validating backgrounds...", 20);

      // 3. Pre-Validate Loop (Fill Buckets)
      const validMovies = [];
      const validSeries = [];

      const fillBucket = async (candidates, targetBucket, limit) => {
        if (limit === 0) return;
        for (const item of candidates) {
          if (targetBucket.length >= limit) break; // Filled!

          const imdbId = item.imdb_id || item.id;
          if (await this.preValidateBackground(imdbId)) {
            targetBucket.push(item);
          }
        }
      };

      // Run pre-validation in parallel
      await Promise.all([
        fillBucket(rawMovies, validMovies, movieLimit),
        fillBucket(rawSeries, validSeries, seriesLimit),
      ]);

      console.log(
        `[CatalogService] Filled pools: Movies ${validMovies.length}/${movieLimit}, Series ${validSeries.length}/${seriesLimit}`,
      );

      if (progressCallback) progressCallback("Enriching metadata...", 40);

      // 4. Process the VALIDATED lists
      const [enrichedMovies, enrichedSeries] = await Promise.all([
        validMovies.length > 0
          ? this.processCatalog(validMovies, progressCallback)
          : Promise.resolve([]),
        validSeries.length > 0
          ? this.processCatalog(validSeries, progressCallback)
          : Promise.resolve([]),
      ]);

      // 5. Interleave / Merge
      const interleaved = [];
      const maxLength = Math.max(enrichedMovies.length, enrichedSeries.length);
      for (let i = 0; i < maxLength; i++) {
        if (i < enrichedMovies.length) interleaved.push(enrichedMovies[i]);
        if (i < enrichedSeries.length) interleaved.push(enrichedSeries[i]);
      }

      if (progressCallback) progressCallback("Enrichment complete", 100);
      return interleaved;
    } catch (error) {
      console.error("[CatalogService] Error getting Movies/Series:", error);
      return [];
    }
  }

  /**
   * Pre-checks if a background image exists on Metahub.
   * @param {string} imdbId
   * @returns {Promise<boolean>}
   */
  async preValidateBackground(imdbId) {
    if (!imdbId) return false;

    const ImageUtils = window.MetadataModules?.imageUtils?.ImageUtils;
    if (!ImageUtils) return true; // Fail open if util missing

    const url = `https://images.metahub.space/background/large/${imdbId}/img`;
    return await ImageUtils.validateUrl(url);
  }

  /**
   * High-level Orchestrator: Get Anime (Progressive Multi-Day with Quality Filter)
   * OPTIMIZATION: Parallel validation
   * @param {number} targetSize - Target number of titles
   * @param {Function} progressCallback - Optional progress callback
   */
  async getAnimeCatalog(targetSize = 20, progressCallback = null) {
    // Check Anime Cache First
    if (this.cache?.loadAnimeCache) {
      const cached = this.cache.loadAnimeCache();
      if (cached && cached.titles && cached.titles.length > 0) {
        console.log(
          `[CatalogService] Loaded ${cached.titles.length} anime from cache.`,
        );
        return cached.titles;
      }
    }

    console.log(
      `[CatalogService] Building progressive anime catalog (Target: ${targetSize})...`,
    );
    const limit = targetSize || this.config.ANIME_CATALOG_LIMIT || 20;
    const maxDays = this.config.PROGRESSIVE_DAYS_LIMIT || 5;

    let accumulatedEnriched = [];
    let daysAgo = 0;
    let totalProcessedCount = 0; // Track ALL processed titles across all days

    // Progressive Loop
    while (daysAgo <= maxDays && accumulatedEnriched.length < limit) {
      const dayLabel = daysAgo === 0 ? "today" : `${daysAgo} day(s) ago`;
      try {
        // Fetch raw Jikan
        const rawItems = await this.fetchJikanCatalog(daysAgo);

        if (!rawItems || rawItems.length === 0) {
          console.log(`[CatalogService] No anime found for ${dayLabel}`);
          daysAgo++;
          continue;
        }

        // Filter Logic (Quality Control)
        const validItems = rawItems.filter((item) => {
          if (!this.meetsQualityCriteria(item)) return false;

          const alreadyHas = accumulatedEnriched.some(
            (e) =>
              (e.mal && String(e.mal) === String(item.mal_id)) ||
              e.originalTitle === item.title,
          );
          return !alreadyHas;
        });

        if (validItems.length > 0) {
          console.log(
            `[CatalogService] Processing ${validItems.length} valid anime from ${dayLabel}`,
          );

          // Wrapper callback to track cumulative count
          const cumulativeCallback = progressCallback
            ? (msg, prog, current, title) => {
                totalProcessedCount++; // Increment global counter
                progressCallback(msg, prog, totalProcessedCount, title);
              }
            : null;

          // Process this batch with cumulative callback
          const batchResults = await this.processCatalog(
            validItems,
            cumulativeCallback,
          );

          // Parallel Post-Validation
          if (batchResults.length > 0) {
            const validationResults = await Promise.all(
              batchResults.map(async (item) => {
                if (accumulatedEnriched.length >= limit) return null; // Soft limit check

                const isValid = await this.validateEnrichedItem(item);
                if (!isValid) return null;

                // Enhance with TMDB images (optional, graceful degradation)
                return await this.enhanceWithTMDBImages(item);
              }),
            );

            const validatedBatch = validationResults.filter(Boolean);
            accumulatedEnriched.push(...validatedBatch);
          }
        }
      } catch (err) {
        console.error(`[CatalogService] Error processing day ${daysAgo}:`, err);
      }
      daysAgo++;
    }

    // Return gathered results
    if (this.cache?.saveAnimeCache) {
      this.cache.saveAnimeCache({
        titles: accumulatedEnriched.slice(0, limit),
        lastUpdated: Date.now(),
        daysProcessed: daysAgo,
        targetSize: limit,
      });
    }

    return accumulatedEnriched.slice(0, limit);
  }

  /**
   * Refresh Logic: Prepend Today's Anime
   */
  async refreshAnimeCatalog(existingTitles = []) {
    console.log("[CatalogService] Refreshing anime catalog...");

    const rawToday = await this.fetchJikanCatalog(0);

    const validNew = rawToday.filter((item) => this.meetsQualityCriteria(item));

    if (validNew.length === 0) return existingTitles;

    // Process (Parallel)
    const enrichedNew = await this.processCatalog(validNew);

    // Validate (Parallel) and enhance with TMDB images
    const validatedNew = (
      await Promise.all(
        enrichedNew.map(async (item) => {
          const isValid = await this.validateEnrichedItem(item);
          if (!isValid) return null;
          return await this.enhanceWithTMDBImages(item);
        }),
      )
    ).filter(Boolean);

    // Dedup against existing
    const uniqueNew = validatedNew.filter(
      (newItem) => !existingTitles.some((exist) => exist.imdb === newItem.imdb),
    );

    if (uniqueNew.length === 0) return existingTitles;

    const limit = this.config.ANIME_CATALOG_LIMIT || 20;
    const combined = [...uniqueNew, ...existingTitles].slice(0, limit);

    return combined;
  }

  /**
   * Quality Filter Logic
   */
  meetsQualityCriteria(anime) {
    if (!anime.duration || anime.duration === "Unknown") return false;

    // OPTIMIZATION: Use compiled regex
    const durationMatch = anime.duration.match(DURATION_REGEX);
    if (durationMatch) {
      const minutes = parseInt(durationMatch[1]);
      if (minutes < 20) return false; // Filter shorts
    }

    if (anime.demographics && Array.isArray(anime.demographics)) {
      if (
        anime.demographics.some(
          (d) => d.name && d.name.toLowerCase().includes("kids"),
        )
      )
        return false;
    }

    return true;
  }

  /**
   * Post-Enrichment Validation
   * Ensures the final object has necessary UI fields (images, year, etc)
   */
  async validateEnrichedItem(item) {
    if (!item) return false;

    if (!item.background) return false;
    const ImageUtils = window.MetadataModules?.imageUtils?.ImageUtils;
    if (ImageUtils) {
      const isValid = await ImageUtils.validateUrl(item.background);
      if (!isValid) return false;
    }

    if (!item.description && !item.plot) return false;

    if (item.genres && Array.isArray(item.genres)) {
      if (
        item.genres.some(
          (d) => typeof d === "string" && d.toLowerCase().includes("family"),
        )
      )
        return false;
    }

    return true;
  }

  /**
   * Enhance item with TMDB images (backdrop, logo)
   * Called after validation to upgrade Metahub images with higher quality TMDB alternatives
   * @param {Object} item - Enriched item with IMDb ID
   * @returns {Promise<Object>} Item with potentially upgraded images
   */
  async enhanceWithTMDBImages(item) {
    if (!item?.imdb) return item;

    const tmdbFetcher = window.MetadataModules?.tmdbFetcher;
    if (!tmdbFetcher?.isAvailable()) return item;

    try {
      const images = await tmdbFetcher.getImages(item.imdb, item.type);
      if (!images) return item;

      // Upgrade backdrop if TMDB has one (higher resolution)
      if (images.backdrop) {
        const ImageUtils = window.MetadataModules?.imageUtils?.ImageUtils;
        if (ImageUtils) {
          const isValid = await ImageUtils.validateUrl(images.backdrop);
          if (isValid) {
            console.log(
              `[CatalogService] Upgraded backdrop for ${item.title} with TMDB image`,
            );
            item.background = images.backdrop;
            item.tmdbBackdrop = images.backdrop;
          }
        } else {
          item.background = images.backdrop;
          item.tmdbBackdrop = images.backdrop;
        }
      }

      // Upgrade logo if TMDB has one (direct TMDB logo, not Metahub)
      if (images.logo) {
        const ImageUtils = window.MetadataModules?.imageUtils?.ImageUtils;
        if (ImageUtils) {
          const isValid = await ImageUtils.validateUrl(images.logo);
          if (isValid) {
            console.log(
              `[CatalogService] Upgraded logo for ${item.title} with TMDB image`,
            );
            item.logo = images.logo;
            item.tmdbLogo = images.logo;
          }
        } else {
          item.logo = images.logo;
          item.tmdbLogo = images.logo;
        }
      }

      return item;
    } catch (error) {
      console.warn(
        `[CatalogService] TMDB image enhancement failed for ${item.title}:`,
        error,
      );
      return item;
    }
  }

  // ==========================================
  // NORMALIZATION & FETCHING (INFRASTRUCTURE)
  // ==========================================

  /**
   * Maps arbitrary API data to the strict structure required by MetadataStorage
   */
  normalizeItem(apiItem) {
    let year = null;
    if (apiItem.releaseInfo) {
      const yearMatch = apiItem.releaseInfo.match(YEAR_REGEX);
      if (yearMatch) year = parseInt(yearMatch[1]);
    } else if (apiItem.year) {
      year = parseInt(apiItem.year);
    } else if (apiItem.release_year) {
      year = parseInt(apiItem.release_year);
    }

    let type = apiItem.type ? apiItem.type.toLowerCase() : "series";
    if (apiItem.mediatype) {
      type = apiItem.mediatype.toLowerCase();
      if (type === "show") type = "series";
    }
    if (type === "tv") type = "series";

    let runtime = null;
    const rawRuntime = apiItem.duration || apiItem.runtime;

    if (rawRuntime) {
      if (window.MetadataModules?.runtimeUtils?.RuntimeUtils) {
        const minutes =
          window.MetadataModules.runtimeUtils.RuntimeUtils.parse(rawRuntime);
        const episodeCount = apiItem.episodes || 1;
        runtime = window.MetadataModules.runtimeUtils.RuntimeUtils.format(
          minutes,
          type,
          episodeCount,
        );
      } else {
        runtime = rawRuntime;
      }
    }

    const tvdbId = apiItem.tvdbid || apiItem.tvdb_id;
    const tmdbId = apiItem.moviedb_id;

    const normalized = {
      extractedTitle: apiItem.title_english || apiItem.title,
      originalTitle: apiItem.title,
      extractedType: type,
      year: year,
      extractedIds: {
        imdb:
          apiItem.imdb_id || apiItem.id
            ? String(apiItem.imdb_id || apiItem.id)
            : null,
        mal: apiItem.mal_id ? String(apiItem.mal_id) : null,
        tvdb: tvdbId ? String(tvdbId) : null,
        tmdb: tmdbId ? String(tmdbId) : null,
      },
      // Unified ratings object format
      ratings:
        apiItem.mal_id && apiItem.score != null
          ? {
              mal: { score: apiItem.score },
            }
          : {},
      rankMal: apiItem.mal_id ? apiItem.rank : null,
      malUrl: apiItem.url,
      genres: apiItem.genres
        ? apiItem.genres.map((g) => g.name || g)
        : apiItem.genre
          ? [apiItem.genre]
          : [],
      interests: apiItem.themes ? apiItem.themes.map((t) => t.name) : null,
      demographics:
        apiItem.demographics && apiItem.demographics.length > 0
          ? apiItem.demographics[0].name
          : null,
      runtime: runtime,
      metaSource: "catalog",

      status: apiItem.status,
      airing: apiItem.airing,
      episodes: apiItem.episodes,

      // Explicitly add IDs to root for backfilling
      tvdb: tvdbId ? String(tvdbId) : null,
      tmdb: tmdbId ? String(tmdbId) : null,
    };

    return normalized;
  }

  /**
   * Fetches top movies/series from Cinemeta
   */
  async fetchCatalog(type = "movie", limit = 20) {
    // Use EXACT URLs from Config
    const url =
      type === "series"
        ? this.config.SERIES_CATALOG_URL
        : this.config.MOVIE_CATALOG_URL;

    if (!url) {
      console.error(
        "[CatalogService] Missing Catalog URL in Config for type:",
        type,
      );
      return [];
    }

    // HELPER: Fetch with optional proxy fallback
    const fetchWithFallback = async (targetUrl) => {
      // OPTIMIZATION: Cinemeta is trusted and supports CORS. Go DIRECT always.
      if (targetUrl.includes("cinemeta")) {
        // console.log(`[CatalogService] Cinemeta URL detected. Direct Fetch: ${targetUrl}`);
        const response = await fetch(targetUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      }

      // 1. Try DIRECT first
      try {
        const response = await fetch(targetUrl);
        if (response.ok) return await response.json();
      } catch (directError) {
        // console.warn(`[CatalogService] Direct fetch failed for ${targetUrl}. Engaging proxy chain...`);
      }

      // 2. Iterate Proxy Chain
      const proxies = this.config.PROXY_LIST || ["https://corsproxy.io/?"]; // Default fallback
      const encodedUrl = encodeURIComponent(targetUrl);

      for (const proxyPrefix of proxies) {
        try {
          const proxyUrl = proxyPrefix + encodedUrl;

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout per proxy

          const response = await fetch(proxyUrl, { signal: controller.signal });
          clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json();
            // Basic validation to ensure we didn't get an HTML error page masquerading as JSON
            if (data && (Array.isArray(data) || data.metas || data.contents)) {
              return data;
            }
          }
        } catch (e) {
          // Continue to next proxy
        }
      }

      throw new Error("All fetch methods (Direct + Proxy Chain) failed.");
    };

    try {
      const data = await fetchWithFallback(url);

      // Handle both Cinemeta format ({ metas: [] }) and MDBList format ([...])
      const metas = Array.isArray(data) ? data : data.metas || [];
      return metas.slice(0, limit);
    } catch (e) {
      console.warn(
        `[CatalogService] Primary catalog failed (${url}). Checking for fallback...`,
        e,
      );

      // FALLBACK: If MDBList/Others fail, try default Cinemeta
      const cinemetaUrl =
        type === "series"
          ? "https://v3-cinemeta.strem.io/catalog/series/top.json"
          : "https://v3-cinemeta.strem.io/catalog/movie/top.json";

      // Only fallback if we weren't already trying Cinemeta
      if (url !== cinemetaUrl && !url.includes("cinemeta")) {
        try {
          // console.log(`[CatalogService] Falling back to Cinemeta: ${cinemetaUrl}`);
          const fallbackData = await fetchWithFallback(cinemetaUrl);
          const fallbackMetas = Array.isArray(fallbackData)
            ? fallbackData
            : fallbackData.metas || [];
          return fallbackMetas.slice(0, limit);
        } catch (fallbackError) {
          console.error(
            "[CatalogService] Cinemeta Fallback also failed:",
            fallbackError,
          );
        }
      }

      return [];
    }
  }

  /**
   * Fetches Anime schedule from Jikan
   * @param {string|number} daysAgo - 0 for today/Monday, or strict day name
   */
  async fetchJikanCatalog(daysAgo = 0) {
    let endpoint = "";

    // Calculate day name if number passed
    if (typeof daysAgo === "number") {
      const days = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
      ];
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      const dayName = days[date.getDay()];
      endpoint = `${dayName}`;
    } else if (typeof daysAgo === "string") {
      endpoint = `${daysAgo}`;
    }

    const baseUrl = this.config.ANIME_CATALOG_URL;
    const url = `${baseUrl}${endpoint}`;

    try {
      console.log(`[CatalogService] Fetching Jikan: ${url}`);

      // Use Rate Limiter if available
      if (
        this.rateLimiter &&
        typeof this.rateLimiter.makeJikanRequest === "function"
      ) {
        const json = await this.rateLimiter.makeJikanRequest(url);
        return json.data || [];
      }

      // Fallback (Should typically use RateLimiter via getter fallback)
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      return json.data || [];
    } catch (e) {
      console.error("[CatalogService] Failed to fetch Jikan:", e);
      return [];
    }
  }
  /**
   * TEST UTILITY: Batch test proxy candidates
   */
  async testProxies() {
    console.log("--- STARTING PROXY CANDIDATE TEST ---");
    const target = "https://mdblist.com/lists/snoak/trending-movies/json";

    // Note: Some proxies require strict encoding, some don't.
    // We will test with encoded URLs.
    const encodedTarget = encodeURIComponent(target);

    const candidates = [
      { name: "Cors.lol", prefix: "https://api.cors.lol/?url=" },
      { name: "CorsProxy.io", prefix: "https://corsproxy.io/?" },
      { name: "CodeTabs", prefix: "https://api.codetabs.com/v1/proxy?quest=" }, // Official Codetabs API url
      { name: "AllOriginsRaw", prefix: "https://api.allorigins.win/raw?url=" },
      { name: "CorsFix", prefix: "https://corsfix.com/free-cors-proxy?url=" }, // Usually requires ?url=
      { name: "TestWorkers", prefix: "https://test.cors.workers.dev/?url=" },
      { name: "ThingProxy", prefix: "https://thingproxy.freeboard.io/fetch/" },
      { name: "CorsAnywhere", prefix: "https://cors-anywhere.com/" }, // Often requires activation
    ];

    for (const c of candidates) {
      const url = c.prefix + encodedTarget;
      try {
        const start = performance.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

        const response = await fetch(url, { signal: controller.signal });
        const ms = (performance.now() - start).toFixed(0);
        clearTimeout(timeoutId);

        if (response.ok) {
          // Verify JSON content to ensure it's not an HTML error page
          try {
            const data = await response.json();
            if (Array.isArray(data) || data.metas) {
              console.log(`✅ [PASS] ${c.name.padEnd(12)} | ${ms}ms`);
            } else {
              console.warn(
                `⚠️ [WARN] ${c.name.padEnd(12)} | ${ms}ms | Status 200 but invalid JSON`,
              );
            }
          } catch (e) {
            console.warn(
              `⚠️ [WARN] ${c.name.padEnd(12)} | ${ms}ms | Status 200 but Parse Error`,
            );
          }
        } else {
          console.error(
            `❌ [FAIL] ${c.name.padEnd(12)} | ${ms}ms | Status: ${response.status}`,
          );
        }
      } catch (e) {
        // console.log(e);
        console.error(
          `❌ [ERR ] ${c.name.padEnd(12)} | Error: ${e.name === "AbortError" ? "Timeout" : e.message}`,
        );
      }
    }
    console.log("--- TEST COMPLETE ---");
  }
}

// Expose globally
window.HeroPlugin = window.HeroPlugin || {};
window.HeroPlugin.catalogService = new CatalogEnrichmentService();
