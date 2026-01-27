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
    
    // Enhanced CORS proxy configuration with multiple fallbacks
    this.CORS_PROXIES = [
      "https://corsproxy.io/?",  // Primary
      "https://api.allorigins.win/raw?url=",  // Secondary
      "https://cors-anywhere.herokuapp.com/"  // Tertiary (may need auth)
    ];
    
    // Cache for already-proxied URLs to avoid reprocessing
    this._urlCache = new Map();
  }
  
  /**
   * Apply CORS proxy to URL with fallback support
   * @param {string} url - Original URL
   * @param {number} proxyIndex - Which proxy to use (0, 1, 2)
   * @returns {string} Proxied URL
   */
  proxyUrl(url, proxyIndex = 0) {
    if (!url) return url;
    
    // Check cache first
    const cacheKey = `${url}|${proxyIndex}`;
    if (this._urlCache.has(cacheKey)) {
      return this._urlCache.get(cacheKey);
    }
    
    // Skip proxy for URLs that already have CORS support
    const noProxyDomains = [
      'https://api.jikan.moe/',
      'https://images.metahub.space/',
      'https://api.themoviedb.org/',
      'https://image.tmdb.org/',
      'https://corsproxy.io/?',
      'https://api.allorigins.win/',
      'https://cors-anywhere.herokuapp.com/'
    ];
    
    // Check if URL is already proxied or doesn't need proxy
    const alreadyProxied = noProxyDomains.some(domain => url.startsWith(domain));
    
    if (alreadyProxied) {
      this._urlCache.set(cacheKey, url);
      return url;
    }
    
    // Always proxy these domains (MDBList, Cinemeta)
    const alwaysProxyDomains = [
      'https://mdblist.com/',
      'https://cinemeta-catalogs.strem.io/',
      'http://mdblist.com/',
      'http://cinemeta-catalogs.strem.io/'
    ];
    
    const needsProxy = alwaysProxyDomains.some(domain => url.startsWith(domain));
    
    if (needsProxy && proxyIndex < this.CORS_PROXIES.length) {
      const proxy = this.CORS_PROXIES[proxyIndex];
      const proxiedUrl = proxy + encodeURIComponent(url);
      this._urlCache.set(cacheKey, proxiedUrl);
      return proxiedUrl;
    }
    
    // For other URLs, return as-is
    this._urlCache.set(cacheKey, url);
    return url;
  }

  /**
   * Fetch with retry logic and multiple proxy fallbacks
   * @param {string} url - Original URL
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>}
   */
  async fetchWithCorsRetry(url, options = {}) {
    const maxRetries = 3;
    
    for (let retry = 0; retry <= maxRetries; retry++) {
      try {
        // Use different proxy on each retry
        const proxiedUrl = this.proxyUrl(url, retry % this.CORS_PROXIES.length);
        console.log(`[CatalogService] Attempt ${retry + 1}: ${url} → ${proxiedUrl.substring(0, 100)}...`);
        
        const response = await fetch(proxiedUrl, {
          ...options,
          headers: {
            'Accept': 'application/json',
            ...options.headers
          }
        });
        
        if (response.ok) {
          console.log(`[CatalogService] Success for ${url}`);
          return response;
        }
        
        // If we get a 429 (rate limit), wait and retry
        if (response.status === 429) {
          const waitTime = Math.pow(2, retry) * 1000; // Exponential backoff
          console.log(`[CatalogService] Rate limited, waiting ${waitTime}ms`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        // For other errors, try next proxy
        console.warn(`[CatalogService] HTTP ${response.status} for ${url}, retry ${retry + 1}/${maxRetries}`);
        
      } catch (error) {
        console.warn(`[CatalogService] Network error for ${url}, retry ${retry + 1}/${maxRetries}:`, error.message);
      }
      
      // Wait before next retry
      if (retry < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // All retries failed
    console.error(`[CatalogService] All retries failed for ${url}`);
    throw new Error(`Failed to fetch ${url} after ${maxRetries + 1} attempts`);
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
        new (window.MetadataModules?.rateLimiter?.GlobalRateLimiter ||
          class {
            makeJikanRequest(url) {
              return fetch(url).then((r) => r.json());
            }
          })();
    }
    return this._rateLimiter;
  }

  // ==========================================
  // EXTENDED API FOR HERO BANNER
  // ==========================================

  /**
   * Wait for Metadata System to be ready
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
            "[CatalogService] Timeout waiting for Metadata - proceeding anyway"
          );
          resolve(false);
        }
      }, timeoutMs);
    });
  }

  /**
   * Main processing pipeline
   */
  async processCatalog(catalogItems = null, progressCallback = null) {
    const storage = this.storage;
    if (!storage) {
      console.error(
        "[CatalogService] Metadata Storage not available. Check window.metadataServices."
      );
      return [];
    }

    // 1. Get Items
    const items =
      catalogItems || (await this.fetchCatalog("movie", 20));

    console.log(
      `[CatalogService] Processing ${items.length} items (Parallel)...`
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
          let result = await this.storage.processAndSaveData(
            processedData,
            true
          );

          // 4. Collect Result & Update Cache
          if (result) {
            const originalBackground = result.background;
            const originalLogo = result.logo;

            // Enhance with TMDB images immediately
            const enhancedResult = await this.enhanceWithTMDBImages(result);

            if (
              enhancedResult.background !== originalBackground ||
              enhancedResult.logo !== originalLogo
            ) {
              await this.storage.saveTitle(enhancedResult);
              result = enhancedResult;
            }

            // Global Logo Validation
            const ImageUtils = window.MetadataModules?.imageUtils?.ImageUtils;
            if (result.logo && ImageUtils) {
              const isValid = await ImageUtils.validateUrl(result.logo);
              if (!isValid) {
                result.logo = null;
              }
            }

            // 5. Private API enrichment
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
                    true
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
                  finalResult.name // title name
              );
            }

            return finalResult;
          }
        } catch (error) {
          console.error(
            `[CatalogService] Failed item ${item.extractedTitle || item.name}:`,
            error
          );
        }
        return null;
      })
    );

    const enrichedResults = results.filter(Boolean);
    console.log(`[CatalogService] Finished. Enriched ${processedCount} items.`);
    return enrichedResults;
  }

  /**
   * High-level orchestrator to fetch and merge Movie and Series catalogs.
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
        "[CatalogService] Both Movie and Series catalogs are disabled/empty."
      );
      return [];
    }

    const BUFFER_SIZE = 30;

    if (progressCallback) progressCallback("Fetching popular titles...", 10);

    try {
      // 2. Fetch RAW buffers concurrently
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

      // 3. Pre-Validate Loop
      const validMovies = [];
      const validSeries = [];

      const fillBucket = async (candidates, targetBucket, limit) => {
        if (limit === 0) return;
        for (const item of candidates) {
          if (targetBucket.length >= limit) break;
          const imdbId = item.imdb_id || item.id;
          if (await this.preValidateBackground(imdbId)) {
            targetBucket.push(item);
          }
        }
      };

      await Promise.all([
        fillBucket(rawMovies, validMovies, movieLimit),
        fillBucket(rawSeries, validSeries, seriesLimit),
      ]);

      console.log(
        `[CatalogService] Filled pools: Movies ${validMovies.length}/${movieLimit}, Series ${validSeries.length}/${seriesLimit}`
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
   * Pre-checks if a background image exists
   */
  async preValidateBackground(imdbId) {
    if (!imdbId) return false;

    const ImageUtils = window.MetadataModules?.imageUtils?.ImageUtils;
    if (!ImageUtils) return true;

    const url = `https://images.metahub.space/background/large/${imdbId}/img`;
    
    try {
      const isValid = await ImageUtils.validateUrl(url);
      return isValid;
    } catch (error) {
      console.warn(`[CatalogService] Background validation failed for ${imdbId}:`, error);
      return false;
    }
  }

  /**
   * Get Anime catalog with progressive loading
   */
  async getAnimeCatalog(targetSize = 20, progressCallback = null) {
    // Check Anime Cache First
    if (this.cache?.loadAnimeCache) {
      const cached = this.cache.loadAnimeCache();
      if (cached && cached.titles && cached.titles.length > 0) {
        console.log(
          `[CatalogService] Loaded ${cached.titles.length} anime from cache.`
        );
        return cached.titles;
      }
    }

    console.log(
      `[CatalogService] Building progressive anime catalog (Target: ${targetSize})...`
    );
    const limit = targetSize || this.config.ANIME_CATALOG_LIMIT || 20;
    const maxDays = this.config.PROGRESSIVE_DAYS_LIMIT || 5;

    let accumulatedEnriched = [];
    let daysAgo = 0;
    let totalProcessedCount = 0;

    // Progressive Loop
    while (daysAgo <= maxDays && accumulatedEnriched.length < limit) {
      const dayLabel = daysAgo === 0 ? "today" : `${daysAgo} day(s) ago`;
      try {
        const rawItems = await this.fetchJikanCatalog(daysAgo);

        if (!rawItems || rawItems.length === 0) {
          console.log(`[CatalogService] No anime found for ${dayLabel}`);
          daysAgo++;
          continue;
        }

        // Filter Logic
        const validItems = rawItems.filter((item) => {
          if (!this.meetsQualityCriteria(item)) return false;
          const alreadyHas = accumulatedEnriched.some(
            (e) =>
              (e.mal && String(e.mal) === String(item.mal_id)) ||
              e.originalTitle === item.title
          );
          return !alreadyHas;
        });

        if (validItems.length > 0) {
          console.log(
            `[CatalogService] Processing ${validItems.length} valid anime from ${dayLabel}`
          );

          const cumulativeCallback = progressCallback
            ? (msg, prog, current, title) => {
                totalProcessedCount++;
                progressCallback(msg, prog, totalProcessedCount, title);
              }
            : null;

          const batchResults = await this.processCatalog(
            validItems,
            cumulativeCallback
          );

          if (batchResults.length > 0) {
            const validationResults = await Promise.all(
              batchResults.map(async (item) => {
                if (accumulatedEnriched.length >= limit) return null;
                const isValid = await this.validateEnrichedItem(item);
                if (!isValid) return null;
                return await this.enhanceWithTMDBImages(item);
              })
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

    // Cache results
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
   * Quality Filter Logic
   */
  meetsQualityCriteria(anime) {
    if (!anime.duration || anime.duration === "Unknown") return false;

    const durationMatch = anime.duration.match(DURATION_REGEX);
    if (durationMatch) {
      const minutes = parseInt(durationMatch[1]);
      if (minutes < 20) return false;
    }

    if (anime.demographics && Array.isArray(anime.demographics)) {
      if (
        anime.demographics.some(
          (d) => d.name && d.name.toLowerCase().includes("kids")
        )
      )
        return false;
    }

    return true;
  }

  /**
   * Post-Enrichment Validation
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
          (d) => typeof d === "string" && d.toLowerCase().includes("family")
        )
      )
        return false;
    }

    return true;
  }

  /**
   * Enhance item with TMDB images
   */
  async enhanceWithTMDBImages(item) {
    if (!item?.imdb) return item;

    const tmdbFetcher = window.MetadataModules?.tmdbFetcher;
    if (!tmdbFetcher?.isAvailable()) return item;

    try {
      const images = await tmdbFetcher.getImages(item.imdb, item.type);
      if (!images) return item;

      // Upgrade backdrop if TMDB has one
      if (images.backdrop) {
        const ImageUtils = window.MetadataModules?.imageUtils?.ImageUtils;
        if (ImageUtils) {
          const isValid = await ImageUtils.validateUrl(images.backdrop);
          if (isValid) {
            console.log(
              `[CatalogService] Upgraded backdrop for ${item.title} with TMDB image`
            );
            item.background = images.backdrop;
            item.tmdbBackdrop = images.backdrop;
          }
        } else {
          item.background = images.backdrop;
          item.tmdbBackdrop = images.backdrop;
        }
      }

      // Upgrade logo if TMDB has one
      if (images.logo) {
        const ImageUtils = window.MetadataModules?.imageUtils?.ImageUtils;
        if (ImageUtils) {
          const isValid = await ImageUtils.validateUrl(images.logo);
          if (isValid) {
            console.log(
              `[CatalogService] Upgraded logo for ${item.title} with TMDB image`
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
        error
      );
      return item;
    }
  }

  // ==========================================
  // NORMALIZATION & FETCHING
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
          episodeCount
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

      tvdb: tvdbId ? String(tvdbId) : null,
      tmdb: tmdbId ? String(tmdbId) : null,
    };

    return normalized;
  }

  /**
   * Fetches top movies/series from catalogs
   */
  async fetchCatalog(type = "movie", limit = 20) {
    // Use EXACT URLs from Config
    const url =
      type === "series"
        ? this.config.SERIES_CATALOG_URL
        : this.config.MOVIE_CATALOG_URL;

    if (!url || url.trim() === "") {
      console.log(`[CatalogService] No catalog URL configured for ${type}`);
      return [];
    }

    console.log(`[CatalogService] Fetching ${type} catalog from: ${url}`);

    try {
      // Use our enhanced fetch with retry logic
      const response = await this.fetchWithCorsRetry(url);
      const data = await response.json();

      // Handle different response formats
      const metas = Array.isArray(data) ? data : data.metas || [];
      console.log(`[CatalogService] Received ${metas.length} items from ${type} catalog`);
      return metas.slice(0, limit);
    } catch (e) {
      console.error(`[CatalogService] Failed to fetch ${type} catalog:`, e);
      
      // CRITICAL FIX: Return fallback data instead of empty array
      return this.getFallbackCatalog(type);
    }
  }

  /**
   * Get fallback catalog data when primary sources fail
   */
  getFallbackCatalog(type) {
    console.log(`[CatalogService] Using fallback data for ${type}`);
    
    const fallbackMovies = [
      {
        id: "tt0111161",
        imdb_id: "tt0111161",
        title: "The Shawshank Redemption",
        year: 1994,
        type: "movie",
        description: "Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency."
      },
      {
        id: "tt0068646",
        imdb_id: "tt0068646",
        title: "The Godfather",
        year: 1972,
        type: "movie",
        description: "The aging patriarch of an organized crime dynasty transfers control of his clandestine empire to his reluctant son."
      },
      {
        id: "tt0468569",
        imdb_id: "tt0468569",
        title: "The Dark Knight",
        year: 2008,
        type: "movie",
        description: "When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological and physical tests of his ability to fight injustice."
      }
    ];

    const fallbackSeries = [
      {
        id: "tt0903747",
        imdb_id: "tt0903747",
        title: "Breaking Bad",
        year: 2008,
        type: "series",
        description: "A chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine with a former student in order to secure his family's future."
      },
      {
        id: "tt0944947",
        imdb_id: "tt0944947",
        title: "Game of Thrones",
        year: 2011,
        type: "series",
        description: "Nine noble families fight for control over the lands of Westeros, while an ancient enemy returns after being dormant for millennia."
      },
      {
        id: "tt2861424",
        imdb_id: "tt2861424",
        title: "Rick and Morty",
        year: 2013,
        type: "series",
        description: "An animated series that follows the exploits of a super scientist and his not-so-bright grandson."
      }
    ];

    return type === "series" ? fallbackSeries : fallbackMovies;
  }

  /**
   * Fetches Anime schedule from Jikan
   */
  async fetchJikanCatalog(daysAgo = 0) {
    let endpoint = "";

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

      // Fallback
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      return json.data || [];
    } catch (e) {
      console.error("[CatalogService] Failed to fetch Jikan:", e);
      return [];
    }
  }
}

// Expose globally
window.HeroPlugin = window.HeroPlugin || {};
window.HeroPlugin.catalogService = new CatalogEnrichmentService();
