/**
 * @name Metadata Helper - ID Conversion Module
 * @description Service for converting external IDs (MAL, AniList, Kitsu) to IMDb and other formats
 */

/**
 * ID Conversion Service - Main API for converting external IDs to standardized formats
 *
 * Provides caching, validation, and cross-platform ID conversion functionality.
 * Handles conversion between MAL, AniList, Kitsu, and other metadata sources.
 */
class IdConversionService {
  // Constants
  static SOURCE_MAP = {
    mal: "myanimelist",
    anilist: "anilist",
    kitsu: "kitsu",
  };

  static ANIME_SOURCES = [
    "myanimelist",
    "anilist",
    "anidb",
    "anime-planet",
    "anisearch",
    "kitsu",
    "livechart",
    "notify-moe",
  ];

  static API_BASE_URL = "https://arm.haglund.dev/api/v2/ids";
  static REVERSE_API_URL = "https://arm.haglund.dev/api/v2/imdb";
  static API_INCLUDE_PARAMS =
    "imdb,kitsu,anilist,myanimelist,thetvdb,themoviedb";

  // Cache configuration - prevent memory leaks
  static MAX_CACHE_SIZE = 10000; // Maximum number of entries
  static CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours TTL

  constructor(rateLimiter) {
    this.rateLimiter = rateLimiter;
    // Optimized: single Map storing {value, timestamp} instead of two separate Maps
    this.cache = new Map(); // Map<string, {value: any, timestamp: number}>
    this.pendingRequests = new Map(); // Map<string, Promise> for request coalescing
    this.cacheHits = 0; // Performance tracking
    this.cacheMisses = 0; // Performance tracking
  }

  // ==========================================
  // CACHE MANAGEMENT METHODS
  // ==========================================

  /**
   * Gets a value from cache with TTL validation
   * @private
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined if not found/expired
   */
  getFromCache(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.cacheMisses++;
      return undefined;
    }

    const now = Date.now();
    if (now - entry.timestamp > IdConversionService.CACHE_TTL_MS) {
      // Entry expired, remove it
      this.cache.delete(key);
      this.cacheMisses++;
      return undefined;
    }

    // Cache hit - move to end (most recently used) for LRU
    this.cacheHits++;
    const value = entry.value;
    this.cache.delete(key);
    this.cache.set(key, entry); // Re-insert to update LRU order

    return value;
  }

  /**
   * Sets a value in cache with LRU eviction and size limits
   * @private
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   */
  setCache(key, value) {
    const now = Date.now();

    // If key exists, remove it first (to update LRU order)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Add to cache (at the end - most recently used)
    this.cache.set(key, { value, timestamp: now });

    // Enforce cache size limit with LRU eviction
    if (this.cache.size > IdConversionService.MAX_CACHE_SIZE) {
      // Remove oldest entry (first in Map due to insertion order)
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Gets cache performance statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    const now = Date.now();
    let expiredCount = 0;
    let validCount = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > IdConversionService.CACHE_TTL_MS) {
        expiredCount++;
      } else {
        validCount++;
      }
    }

    return {
      size: this.cache.size,
      maxSize: IdConversionService.MAX_CACHE_SIZE,
      ttlMs: IdConversionService.CACHE_TTL_MS,
      validEntries: validCount,
      expiredEntries: expiredCount,
      hitRate:
        this.cacheHits !== undefined
          ? this.cacheHits / (this.cacheHits + this.cacheMisses || 1)
          : 0,
    };
  }

  /**
   * Clears expired entries from cache
   * @returns {number} Number of entries removed
   */
  cleanupExpiredCache() {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > IdConversionService.CACHE_TTL_MS) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  // ==========================================
  // PUBLIC API METHODS
  // ==========================================

  /**
   * Converts an external ID from a specific source to standardized format
   * Implements request coalescing to prevent duplicate concurrent requests
   * @param {string} id - The external ID to convert
   * @param {string} source - The source platform (mal, anilist, kitsu)
   * @returns {Promise<Object|null>} Normalized ID mapping or null if failed
   */
  async convertToImdb(id, source) {
    // Input validation
    if (!id || typeof id !== "string" || id.trim() === "") {
      throw new Error("Invalid ID: must be a non-empty string");
    }
    if (!source || typeof source !== "string" || source.trim() === "") {
      throw new Error("Invalid source: must be a non-empty string");
    }

    const cacheKey = `${source}:${id}`;

    // Check cache first (with TTL validation)
    const cachedResult = this.getFromCache(cacheKey);
    if (cachedResult !== undefined) {
      return cachedResult;
    }

    // Request coalescing: check if request is already in flight
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }

    // Create new request promise
    const requestPromise = this._executeConversion(id, source, cacheKey);

    // Store pending request
    this.pendingRequests.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Clean up pending request
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Internal method to execute the actual conversion
   * @private
   * @param {string} id - The external ID
   * @param {string} source - The source platform
   * @param {string} cacheKey - The cache key
   * @returns {Promise<Object|null>} Normalized ID mapping or null
   */
  async _executeConversion(id, source, cacheKey) {
    try {
      // Map internal source names to API-expected names
      const apiSource = IdConversionService.SOURCE_MAP[source] || source;

      const url = `${IdConversionService.API_BASE_URL}?source=${apiSource}&id=${id}&include=${IdConversionService.API_INCLUDE_PARAMS}`;

      const response = await this.rateLimiter.makeHaglundRequest(url);

      if (!response) {
        console.warn(
          `[METADATA][ID Conversion] No response from Haglund API for ${source}:${id}`
        );
        // Don't cache null for "no response" - could be temporary
        return null;
      }

      // Normalize the response keys to match our database fields
      const normalized = this.normalizeConversionResponse(response);

      // Cache the result with LRU management
      this.setCache(cacheKey, normalized);
      return normalized;
    } catch (error) {
      console.warn(
        `[METADATA][ID Conversion] Conversion failed for ${source}:${id}:`,
        error
      );

      // Smart error caching: only cache null for 404 (permanent not found)
      // Network errors, timeouts, rate limits should NOT be cached
      if (error.message && error.message.includes("HTTP 404")) {
        this.setCache(cacheKey, null);
      }

      return null;
    }
  }

  /**
   * Converts IMDb ID to anime IDs (MAL, AniList, Kitsu)
   * Uses different endpoint: /api/v2/imdb which returns array of mappings
   * @param {string} imdbId - IMDb ID (e.g., "tt1234567")
   * @param {boolean} priority - Whether this is a priority request
   * @returns {Promise<Object|null>} { mal: [], anilist: [], kitsu: [], tmdb, tvdb }
   */
  async convertFromImdb(imdbId, priority = false) {
    if (!imdbId?.startsWith("tt")) return null;

    const cacheKey = `reverse:${imdbId}`;
    const cached = this.getFromCache(cacheKey);
    if (cached !== undefined) return cached;

    // Request coalescing
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }

    const requestPromise = this._executeReverseConversion(
      imdbId,
      cacheKey,
      priority
    );
    this.pendingRequests.set(cacheKey, requestPromise);

    try {
      return await requestPromise;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Internal method for reverse conversion execution
   * @private
   */
  async _executeReverseConversion(imdbId, cacheKey, priority) {
    try {
      const url = `${IdConversionService.REVERSE_API_URL}?id=${imdbId}&include=${IdConversionService.API_INCLUDE_PARAMS}`;
      const results = await this.rateLimiter.makeHaglundRequest(
        url,
        {},
        priority
      );

      if (!results || !Array.isArray(results) || results.length === 0) {
        this.setCache(cacheKey, null);
        return null;
      }

      // Collect and deduplicate all IDs from array response
      const normalized = {
        mal: [
          ...new Set(
            results
              .map((r) => r.myanimelist)
              .filter(Boolean)
              .map(String)
          ),
        ],
        anilist: [
          ...new Set(
            results
              .map((r) => r.anilist)
              .filter(Boolean)
              .map(String)
          ),
        ],
        kitsu: [
          ...new Set(
            results
              .map((r) => r.kitsu)
              .filter(Boolean)
              .map(String)
          ),
        ],
        tmdb: results[0]?.themoviedb ? String(results[0].themoviedb) : null,
        tvdb: results[0]?.thetvdb ? String(results[0].thetvdb) : null,
      };

      console.log(
        `[ID Conversion] Reverse lookup for ${imdbId}: MAL[${normalized.mal.length}], AniList[${normalized.anilist.length}], Kitsu[${normalized.kitsu.length}]`
      );

      this.setCache(cacheKey, normalized);
      return normalized;
    } catch (error) {
      console.warn(
        `[ID Conversion] Reverse lookup failed for ${imdbId}:`,
        error
      );
      return null;
    }
  }

  // ==========================================
  // PRIVATE UTILITY METHODS
  // ==========================================

  /**
   * Normalizes API response keys to internal database field names
   * @private
   * @param {Object} response - Raw API response from Haglund
   * @returns {Object} Normalized ID mapping with internal field names
   */
  normalizeConversionResponse(response) {
    // Define mapping from API keys to internal keys
    const keyMapping = {
      imdb: "imdb",
      kitsu: "kitsu",
      anilist: "anilist",
      myanimelist: "mal", // API returns 'myanimelist', we store as 'mal'
      thetvdb: "tvdb", // API returns 'thetvdb', we store as 'tvdb'
      themoviedb: "tmdb", // API returns 'themoviedb', we store as 'tmdb'
    };

    // Use reduce for efficient single-pass processing
    return Object.entries(keyMapping).reduce(
      (normalized, [apiKey, internalKey]) => {
        if (response[apiKey]) {
          normalized[internalKey] = String(response[apiKey]);
        }
        return normalized;
      },
      {}
    );
  }

  /**
   * Checks if a source platform is anime-related
   * @private
   * @param {string} source - The source platform to check
   * @returns {boolean} True if the source is anime-related
   */
  isAnimeSource(source) {
    if (!source || typeof source !== "string") {
      return false;
    }
    return IdConversionService.ANIME_SOURCES.includes(source);
  }

  /**
   * Enriches an entry with all available cross-reference IDs via conversion
   * @param {Object} entry - The entry object to enrich
   * @returns {Promise<Object>} The enriched entry with additional IDs
   */
  async enrichWithAllIds(entry) {
    // Input validation
    if (!entry || typeof entry !== "object") {
      throw new Error("Invalid entry: must be an object");
    }

    // Find the primary anime ID to use for conversion
    const primaryId = this.findPrimaryAnimeId(entry);
    if (!primaryId) {
      return entry; // No anime IDs to convert
    }

    // Check if we already have all relevant IDs (Optimization)
    // If we have IMDb, AniList, and Kitsu, we likely don't need to re-convert
    const hasImdb = entry.imdb;
    const hasAnilist =
      entry.anilist &&
      (Array.isArray(entry.anilist) ? entry.anilist.length > 0 : true);
    const hasMal =
      entry.mal && (Array.isArray(entry.mal) ? entry.mal.length > 0 : true);
    const hasKitsu =
      entry.kitsu &&
      (Array.isArray(entry.kitsu) ? entry.kitsu.length > 0 : true);

    if (hasImdb && hasAnilist && hasMal && hasKitsu) {
      return entry; // Already complete
    }

    // Try conversion
    const conversionResult = await this.convertToImdb(
      primaryId.id,
      primaryId.source
    );

    if (conversionResult) {
      // Merge any new IDs found, preserving existing ones
      return this.mergeIds(entry, conversionResult);
    }

    return entry; // Return original entry if conversion failed
  }

  /**
   * Finds the primary anime ID to use for conversion (prioritizes mal > anilist > kitsu)
   * @private
   * @param {Object} entry - The entry object to analyze
   * @returns {Object|null} Primary ID info or null if no anime ID found
   */
  findPrimaryAnimeId(entry) {
    const prioritySources = ["mal", "anilist", "kitsu"];

    for (const source of prioritySources) {
      if (entry[source]) {
        let id = entry[source];

        // Handle array IDs (take the first one)
        if (Array.isArray(id)) {
          id = id.length > 0 ? id[0] : null;
        }

        if (id) {
          return {
            id: String(id),
            source,
            key: `${source}:${id}`,
          };
        }
      }
    }

    return null; // No anime ID found
  }

  /**
   * Merges conversion results with existing entry data, preserving existing values
   * @private
   * @param {Object} entry - The original entry object
   * @param {Object} conversionResult - The conversion result to merge
   * @returns {Object} Merged entry with additional IDs and lastUpdated timestamp
   */
  mergeIds(entry, conversionResult) {
    const idFields = ["imdb", "mal", "anilist", "kitsu", "tmdb", "tvdb"];

    const merged = { ...entry };

    // Merge each ID field, keeping existing values if they exist
    for (const field of idFields) {
      if (conversionResult[field] && !merged[field]) {
        merged[field] = conversionResult[field];
      }
    }

    merged.lastUpdated = Date.now();
    return merged;
  }
}

// Export to global scope
window.MetadataModules = window.MetadataModules || {};
window.MetadataModules.idConversion = {
  IdConversionService,
};
