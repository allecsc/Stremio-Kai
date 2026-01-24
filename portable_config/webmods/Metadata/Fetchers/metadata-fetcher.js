/**
 * @name Metadata Helper - Metadata Fetcher Module
 * @description Service for fetching and enriching metadata from IMDb and Cinemeta APIs
 */

/**
 * Metadata Fetching Service
 *
 * Handles progressive enrichment of title metadata from multiple sources (IMDb API, Cinemeta).
 * Implements state-driven enrichment with intelligent merging and graceful degradation.
 *
 * @class MetadataFetcher
 */
/**
 * Simple Least Recently Used (LRU) Cache
 * Keeps memory usage flat by removing oldest items when limit is reached.
 */
class SimpleLRUCache {
  constructor(limit = 500) {
    this.limit = limit;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    // Refresh item: remove and re-add to put it at the end (most recently used)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    // If exists, delete first to refresh position
    if (this.cache.has(key)) this.cache.delete(key);

    this.cache.set(key, value);

    // Evict oldest if over limit
    if (this.cache.size > this.limit) {
      // Map.keys() returns iterator in insertion order, so first is oldest
      this.cache.delete(this.cache.keys().next().value);
    }
    return this;
  }

  has(key) {
    return this.cache.has(key);
  }
}

class MetadataFetcher {
  /** @type {number} Maximum number of stars to include in metadata */
  static MAX_STARS = 50;

  /** @type {number} Maximum number of directors to include in metadata */
  static MAX_DIRECTORS = 2;

  /** @type {RegExp} Pattern to match year ranges (e.g., "2020-2025") */
  static YEAR_RANGE_REGEX = /^(\d{4})[-\u2013](\d{4})$/;

  /** @type {string[]} TMDB image size priority order (best quality/availability first) */
  static TMDB_IMAGE_SIZES = [
    "w116_and_h174_bestv2", // Default - works for almost everything
    "w130_and_h195_bestv2", // Larger bestv2
    "w185_and_h278_bestv2", // Even larger bestv2
    "w92", // Small standard - high availability
    "w185", // Standard fallback
    "w220_and_h330_bestv2", // Largest bestv2 as last resort
  ];

  /** @type {string} TMDB image base URL */
  static TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/";

  /**
   * Creates a MetadataFetcher instance
   * @param {Object} rateLimiter - Rate limiter instance for API request management
   */
  constructor(rateLimiter) {
    this.rateLimiter = rateLimiter;
    // Cache for validated image URLs: { imagePath: validatedUrl }
    // Use LRU Cache to prevent memory leaks (limit 500 items)
    this.imageUrlCache = new SimpleLRUCache(500);
    this.imageUtils = window.MetadataModules.imageUtils.ImageUtils;
  }

  /**
   * Progressively enriches title metadata from IMDb and Cinemeta sources based on current state
   *
   * @param {string} imdbId - IMDb ID of the title (e.g., "tt1234567")
   * @param {string} type - Media type ("movie" or "series")
   * @param {string} currentMetaSource - Current enrichment state: "dom", "cinemeta", "imdbapi", or "complete"
   * @param {Object} databaseData - Existing metadata from database
   * @param {boolean} priority - Whether this is a priority request (e.g., user hover)
   * @returns {Promise<Object|null>} Enriched metadata object or null if no database data
   */
  async enrichTitleProgressively(
    imdbId,
    type,
    currentMetaSource = "dom",
    databaseData = null,
    priority = false,
  ) {
    // If no database data provided, we can't enrich (fetcher doesn't have DB access)
    if (!databaseData) {
      return null;
    }

    let enrichedData = { ...databaseData };
    let hasCinemetaData =
      currentMetaSource === "cinemeta" || currentMetaSource === "complete";
    let hasImdbData =
      currentMetaSource === "imdbapi" || currentMetaSource === "complete";

    try {
      // Determine what data we need to fetch based on current state
      const needsCinemeta = !hasCinemetaData;
      const needsImdb = !hasImdbData;

      // Edge case: Missing type - need IMDbAPI first to get type
      if (!type && imdbId && needsCinemeta) {
        // Determine episode count if we have partial data (unlikely here but for completeness)
        const episodeCount = enrichedData.episodes || 1;
        const imdbData = await this.fetchImdbData(
          imdbId,
          priority,
          episodeCount,
        );
        if (imdbData) {
          type = imdbData.type;
          // Save intermediate result with IMDb data
          Object.assign(enrichedData, imdbData, {
            metaSource: "imdbapi",
            lastUpdated: Date.now(),
          });
          hasImdbData = true;
        }
      }

      // Fetch Cinemeta data if needed
      if (needsCinemeta && type) {
        const cinemetaData = await this.fetchCinemetaData(
          imdbId,
          type,
          priority,
        );
        if (cinemetaData) {
          hasCinemetaData = true;

          // If we have both sources, merge them properly (Cinemeta base, IMDbAPI overrides)
          if (hasImdbData) {
            const mergedCredits = this.mergeCreditsWithFallback(
              cinemetaData.stars || [],
              enrichedData.stars || [],
              MetadataFetcher.MAX_STARS,
            );
            const mergedDirectors = this.mergeCreditsWithFallback(
              cinemetaData.directors || [],
              enrichedData.directors || [],
              MetadataFetcher.MAX_DIRECTORS,
            );

            // SMART MERGE: Cinemeta base, IMDbAPI overrides (already in enrichedData)
            // But ensure we don't overwrite valid Cinemeta data (like runtime) with nulls from IMDb
            const smartMerged = this.smartMerge(enrichedData, cinemetaData);

            Object.assign(enrichedData, smartMerged, {
              plot: cinemetaData.plot || enrichedData.plot,
              stars: mergedCredits,
              directors: mergedDirectors,
              metaSource: "complete",
              lastUpdated: Date.now(),
            });
          } else {
            // Save intermediate result with Cinemeta data only
            // Use smartMerge here too to respect existing data (e.g. from Jikan)
            const smartMerged = this.smartMerge(enrichedData, cinemetaData);
            Object.assign(enrichedData, smartMerged, {
              metaSource: "cinemeta",
              lastUpdated: Date.now(),
            });
          }
        }
      }

      // Fetch IMDb data if needed (and we have type or already have Cinemeta)
      if (needsImdb && (type || hasCinemetaData)) {
        // Pass episode count from existing data (e.g. from Cinemeta) to help normalizer fix runtime
        const episodeCount = enrichedData.episodes || 1;
        const imdbData = await this.fetchImdbData(
          imdbId,
          priority,
          episodeCount,
        );
        if (imdbData) {
          // Merge credits: prioritize Cinemeta, fallback to IMDbAPI
          const mergedCredits = this.mergeCreditsWithFallback(
            enrichedData.stars || [],
            imdbData.stars || [],
            MetadataFetcher.MAX_STARS,
          );
          const mergedDirectors = this.mergeCreditsWithFallback(
            enrichedData.directors || [],
            imdbData.directors || [],
            MetadataFetcher.MAX_DIRECTORS,
          );

          // SMART MERGE: IMDb data over existing
          const smartMerged = this.smartMerge(enrichedData, imdbData);

          // Merge IMDb data, preserve Cinemeta plot if it exists
          Object.assign(enrichedData, smartMerged, {
            plot: enrichedData.plot || imdbData.plot,
            stars: mergedCredits,
            directors: mergedDirectors,
            metaSource: hasCinemetaData ? "complete" : "imdbapi",
            lastUpdated: Date.now(),
          });
          hasImdbData = true;
        }
      }

      // -----------------------------------------------------------------------
      // SEQUENTIAL PRIVATE ENRICHMENT
      // Automatically triggers if keys are available, ensuring full metadata on discovery
      // -----------------------------------------------------------------------
      const metadataService = window.MetadataModules?.metadataService;
      if (
        (hasCinemetaData || hasImdbData) &&
        metadataService?.hasPrivateApiAvailable()
      ) {
        try {
          // Await sequentially to respect rate limits (handled by service/fetchers)
          const privateData = await metadataService.getEnrichedMetadata(
            imdbId,
            type,
            priority,
          );

          if (privateData) {
            // Smart Merge: Private data (TMDB/MDBList) overrides Public data where strictly better
            // (e.g. Logos, Ratings, Content Ratings)
            const smartMerged = this.smartMerge(enrichedData, privateData);

            Object.assign(enrichedData, smartMerged, {
              metaSourcePrivate: privateData.metaSourcePrivate,
              lastEnrichedPrivate: Date.now(),
            });
          }
        } catch (e) {
          console.warn(
            `[METADATA][Enrichment] ⚠️ Private enrichment failed for ${imdbId}:`,
            e,
          );
        }
      }

      return enrichedData;
    } catch (error) {
      console.warn(`[METADATA][Enrichment] ❌ Failed for ${imdbId}:`, error);
      return databaseData; // Return original data on error
    }
  }

  /**
   * Fetches metadata from IMDb API
   *
   * @param {string} imdbId - IMDb ID to fetch
   * @param {boolean} priority - Whether this is a priority request
   * @param {number} episodeCount - Episode count (for series runtime normalization)
   * @returns {Promise<Object|null>} Normalized IMDb metadata or null on failure
   */
  async fetchImdbData(imdbId, priority = false, episodeCount = 1) {
    const url = `${window.MetadataModules.config.METADATA_CONFIG.imdbApiBase}/titles/${imdbId}`;

    try {
      const response = await this.rateLimiter.makeImdbRequest(
        url,
        {},
        priority,
      );

      // Check if response ID matches requested ID
      if (response?.id !== imdbId) {
        console.warn(
          `[METADATA][Enrichment] ⚠️ IMDb API returned wrong ID! Requested: ${imdbId}, Got: ${response?.id}`,
        );
        return null; // Don't use mismatched data
      }

      const normalizedData = this.normalizeIMDbData(response, episodeCount);
      return normalizedData;
    } catch (error) {
      console.warn(
        `[METADATA][Enrichment] ❌ IMDbAPI call failed for ${imdbId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Fetches metadata from Cinemeta API
   *
   * @param {string} imdbId - IMDb ID to fetch
   * @param {string} type - Media type ("movie" or "series")
   * @param {boolean} priority - Whether this is a priority request
   * @returns {Promise<Object|null>} Normalized Cinemeta metadata or null on failure
   */
  async fetchCinemetaData(imdbId, type, priority = false) {
    // Single call since we know the type from DOM extraction
    const url = `${window.MetadataModules.config.METADATA_CONFIG.cinemetaApiBase}/${type}/${imdbId}.json`;

    try {
      const response = await this.rateLimiter.makeCinemetaRequest(
        url,
        {},
        priority,
      );

      if (!response?.meta) {
        console.warn(
          `[METADATA][Enrichment] ⚠️ Cinemeta response missing meta field for ${imdbId}`,
        );
        return null;
      }

      const normalizedData = await this.normalizeCinemetaData(response.meta);

      // Include videos array for episode storage (series only)
      if (
        type === "series" &&
        response.meta.videos &&
        Array.isArray(response.meta.videos)
      ) {
        normalizedData.videos = response.meta.videos;
      }

      return normalizedData;
    } catch (error) {
      console.warn(
        `[METADATA][Enrichment] ❌ Cinemeta ${type} call failed for ${imdbId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Fetches metadata from Jikan API (MAL)
   *
   * @param {string|number} malId - MAL ID to fetch
   * @param {boolean} priority - Whether this is a priority request
   * @returns {Promise<Object|null>} Normalized Jikan metadata or null on failure
   */
  async fetchJikanData(malId, priority = false) {
    if (!malId) return null;
    const url = `https://api.jikan.moe/v4/anime/${malId}`;

    try {
      const response = await this.rateLimiter.makeJikanRequest(
        url,
        {},
        priority,
      );

      if (!response?.data) {
        console.warn(
          `[METADATA][Enrichment] ⚠️ Jikan response missing data field for MAL ID ${malId}`,
        );
        return null;
      }

      return this.normalizeJikanData(response.data);
    } catch (error) {
      console.warn(
        `[METADATA][Enrichment] ❌ Jikan call failed for MAL ID ${malId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Normalizes raw Jikan API response data
   *
   * @param {Object} data - Raw Jikan API data object
   * @returns {Object} Normalized metadata object
   */
  normalizeJikanData(data) {
    // Handle runtime
    let runtime = null;
    if (data.duration) {
      const minutes = window.MetadataModules.runtimeUtils.RuntimeUtils.parse(
        data.duration,
      );
      const type = data.type === "TV" ? "series" : "movie"; // Simple mapping
      const episodeCount = data.episodes || 1;
      runtime = window.MetadataModules.runtimeUtils.RuntimeUtils.format(
        minutes,
        type,
        episodeCount,
      );
    }

    const normalized = {
      id: String(data.mal_id), // Use MAL ID as temporary ID needed for structure, but caller will merge
      // Unified ratings object format
      ratings: {
        ...(data.score && {
          mal: {
            score: data.score,
            votes: data.scored_by || null,
          },
        }),
      },
      rankMal: data.rank,
      malUrl: data.url,
      // Jikan-specific enriched fields
      genres: data.genres ? data.genres.map((g) => g.name) : [],
      interests: data.themes ? data.themes.map((t) => t.name) : [],
      demographics:
        data.demographics && data.demographics.length > 0
          ? data.demographics[0].name
          : null,
      runtime: runtime,
      status: data.status,
      metaSource: "jikan", // Marker source
    };

    return normalized;
  }

  /**
   * Normalizes media type to 'movie' or 'series'
   * Maps various IMDb/Cinemeta types to our internal binary classification
   *
   * @param {string} type - Raw type string
   * @returns {string} Normalized type ('movie' or 'series')
   */
  normalizeType(type) {
    if (!type) return "movie"; // Default fallback
    const lowerType = type.toLowerCase();

    // Movie variants
    if (["movie", "tvmovie", "short", "tvshort", "video"].includes(lowerType)) {
      return "movie";
    }

    // Series variants (tvSeries, tvMiniSeries, tvSpecial, etc.)
    return "series";
  }

  /**
   * Normalizes raw IMDb API response data into standard metadata format
   *
   * @param {Object} data - Raw IMDb API response
   * @param {number} episodeCount - Episode count (to normalize series runtime)
   * @returns {Object} Normalized metadata object
   */
  normalizeIMDbData(data, episodeCount = 1) {
    const allInterests = data.interests?.map((interest) => interest.name) || [];
    const demographics = allInterests.filter((interest) =>
      ["Josei", "Seinen", "Shōnen", "Shōjo"].includes(interest),
    );

    // Remove demographics from interests (they have their own field)
    const interests = allInterests.filter(
      (interest) => !["Josei", "Seinen", "Shōnen", "Shōjo"].includes(interest),
    );

    const computedType = this.normalizeType(data.type);

    const normalized = {
      id: data.id,
      title: data.primaryTitle,
      originalTitle: data.originalTitle,
      type: computedType,
      runtime: data.runtimeSeconds
        ? this.formatRuntime(
            Math.floor(data.runtimeSeconds / 60),
            computedType,
            episodeCount,
          )
        : null,
      genres: data.genres || [],
      interests, // Now excludes demographics
      demographics: demographics.length > 0 ? demographics[0] : null, // Flatten to single string
      // Unified ratings object format
      ratings: {
        ...(data.rating?.aggregateRating && {
          imdb: {
            score: parseFloat(data.rating.aggregateRating),
            votes: data.rating.voteCount || null,
          },
        }),
        ...(data.metacritic?.score && {
          metacritic: {
            score: data.metacritic.score,
            votes: null,
          },
        }),
      },
      plot: data.plot,
      directors:
        data.directors?.map((d) => ({
          name: d.displayName,
          image: d.primaryImage?.url
            ? d.primaryImage.url.replace("._V1_.", "._V1_UX150_.")
            : null,
        })) || [],
      stars:
        data.stars?.map((s) => ({
          name: s.displayName,
          image: s.primaryImage?.url
            ? s.primaryImage.url.replace("._V1_.", "._V1_UX150_.")
            : null,
        })) || [],
      originCountry: data.originCountries?.[0]?.name || null,
      metaSource: "imdbapi",
    };

    return normalized;
  }

  /**
   * Normalizes raw Cinemeta API response data into standard metadata format
   *
   * @param {Object} data - Raw Cinemeta API response
   * @returns {Promise<Object>} Normalized metadata object
   */
  async normalizeCinemetaData(data) {
    // Extract series metadata first (to get episode count for runtime normalization)
    const seriesMetadata = this.extractSeriesMetadata(data.videos);

    const parsedRuntime = data.runtime ? this.parseRuntime(data.runtime) : null;
    const formattedRuntime = parsedRuntime
      ? window.MetadataModules.runtimeUtils.RuntimeUtils.format(
          parsedRuntime,
          data.type,
          seriesMetadata.episodes,
        )
      : null;

    // Extract and normalize credits data with validation
    const credits = await this.extractCreditsData(data);

    const cleanedYear = window.MetadataModules.titleUtils.TitleUtils.cleanYear(
      data.releaseInfo,
    );
    const computedType = this.normalizeType(data.type);

    const normalized = {
      id: data.imdb_id || data.id,
      title: data.name,
      type: computedType,
      year: cleanedYear,
      status: data.status === "Continuing" ? "Ongoing" : data.status,
      runtime: formattedRuntime,
      genres: data.genres || data.genre || [],
      // Unified ratings object format
      ratings: {
        ...(data.imdbRating && {
          imdb: {
            score: parseFloat(data.imdbRating),
            votes: null, // Cinemeta doesn't provide votes
          },
        }),
      },
      plot: data.description,
      awards: this.checkForOscar(data.awards),
      ...(seriesMetadata.seasons > 0 && { seasons: seriesMetadata.seasons }),
      ...(seriesMetadata.episodes > 0 && { episodes: seriesMetadata.episodes }),
      ...(credits.stars &&
        credits.stars.length > 0 && { stars: credits.stars }),
      ...(credits.directors &&
        credits.directors.length > 0 && { directors: credits.directors }),
      imdb: data.imdb_id || data.id,
      tmdb: data.moviedb_id ? String(data.moviedb_id) : null,
      tvdb: data.tvdb_id ? String(data.tvdb_id) : null,
      metaSource: "cinemeta",
      // Add MetaHub images
      poster: `https://images.metahub.space/poster/small/${
        data.imdb_id || data.id
      }/img`,
      background: `https://images.metahub.space/background/large/${
        data.imdb_id || data.id
      }/img`,
      logo: `https://images.metahub.space/logo/large/${
        data.imdb_id || data.id
      }/img`,
    };

    return normalized;
  }

  /**
   * Validates TMDB image URL by trying different sizes, with IMDb fallback
   * Uses native Image() object to avoid CORS issues
   *
   * @param {string} tmdbPath - TMDB image path (e.g., "/BE2sdjpgsa2rNTFa66f7upkaOP.jpg")
   * @param {string|null} imdbFallback - IMDb image URL as fallback
   * @returns {Promise<string|null>} Working image URL or null if all failed
   */
  async validateImageUrl(tmdbPath, imdbFallback = null) {
    if (!tmdbPath && !imdbFallback) return null;

    // Check cache first
    const cacheKey = `${tmdbPath}|${imdbFallback}`;
    if (this.imageUrlCache.has(cacheKey)) {
      return this.imageUrlCache.get(cacheKey);
    }

    let validatedUrl = null;

    // Try TMDB sizes if path provided
    if (tmdbPath) {
      for (const size of MetadataFetcher.TMDB_IMAGE_SIZES) {
        const url = `${MetadataFetcher.TMDB_IMAGE_BASE}${size}${tmdbPath}`;
        const isValid = await this.imageUtils.validateUrl(url);
        if (isValid) {
          validatedUrl = url;
          break; // Found working size!
        }
      }
    }

    // If TMDB failed, try IMDb fallback
    if (!validatedUrl && imdbFallback) {
      const isValid = await this.imageUtils.validateUrl(imdbFallback);
      if (isValid) {
        validatedUrl = imdbFallback;
      }
    }

    // Cache the result
    this.imageUrlCache.set(cacheKey, validatedUrl);
    return validatedUrl;
  }

  /**
   * Parses runtime string (e.g., "120 min") and extracts minutes as integer
   *
   * @param {string} runtimeString - Runtime string from API
   * @returns {number|null} Runtime in minutes or null if invalid
   */
  parseRuntime(runtimeString) {
    return window.MetadataModules.runtimeUtils.RuntimeUtils.parse(
      runtimeString,
    );
  }

  /**
   * Formats runtime minutes into human-readable string
   *
   * @param {number} totalMinutes - Total runtime in minutes
   * @param {string} type - Media type ("movie" or "series")
   * @param {number} episodeCount - Episode count (to normalize series runtime)
   * @returns {string|null} Formatted runtime (e.g., "2h 15min") or null if invalid
   */
  formatRuntime(totalMinutes, type = "movie", episodeCount = 1) {
    return window.MetadataModules.runtimeUtils.RuntimeUtils.format(
      totalMinutes,
      type,
      episodeCount,
    );
  }

  /**
   * Checks if awards string contains Oscar wins
   *
   * @param {string} awardsString - Awards string from API
   * @returns {string|null} "Oscar Winner" if found, null otherwise
   */
  checkForOscar(awardsString) {
    if (!awardsString) return null;
    return awardsString.toLowerCase().includes("oscar") ? "Oscar Winner" : null;
  }

  /**
   * Extracts series metadata (seasons and episodes) in a single pass for optimal performance
   *
   * @param {Array} videos - Array of video objects from Cinemeta
   * @returns {{seasons: number, episodes: number}} Series metadata
   */
  extractSeriesMetadata(videos) {
    if (!videos || !Array.isArray(videos)) {
      return { seasons: 0, episodes: 0 };
    }

    let maxSeason = 0;
    let episodeCount = 0;

    for (const video of videos) {
      if (video.season > maxSeason) {
        maxSeason = video.season;
      }
      // Count episodes (exclude season 0 which is usually specials)
      if (video.season !== 0) {
        episodeCount++;
      }
    }

    return {
      seasons: maxSeason,
      episodes: episodeCount,
    };
  }

  /**
   * Extracts and normalizes credits data from Cinemeta response with image validation
   *
   * @param {Object} data - Cinemeta metadata object
   * @returns {Promise<{stars: Array, directors: Array}>} Normalized credits
   */
  async extractCreditsData(data) {
    if (!data) return { stars: [], directors: [] };

    const credits = { stars: [], directors: [] };

    // Extract actors from credits_cast (prioritize with photos)
    credits.stars = await this.extractCreditsWithPhotoPriority(
      data.credits_cast,
      (person) => person.name,
      MetadataFetcher.MAX_STARS,
    );

    // Extract directors from credits_crew (prioritize with photos)
    const directors =
      data.credits_crew?.filter((crew) => crew.job === "Director") || [];
    credits.directors = await this.extractCreditsWithPhotoPriority(
      directors,
      (person) => person.name,
      MetadataFetcher.MAX_DIRECTORS,
    );

    return credits;
  }

  /**
   * Extracts credits with photo priority and validates image URLs
   *
   * @param {Array} peopleArray - Array of people objects
   * @param {Function} nameGetter - Function to extract name from person object
   * @param {number} maxCount - Maximum number of people to include
   * @param {Array} imdbFallbackCredits - IMDb credits for fallback images
   * @returns {Promise<Array>} Array of {name, image} objects, prioritized by photo availability
   */
  async extractCreditsWithPhotoPriority(
    peopleArray,
    nameGetter,
    maxCount,
    imdbFallbackCredits = [],
  ) {
    if (!peopleArray || !Array.isArray(peopleArray) || maxCount <= 0) {
      return [];
    }

    const validationPromises = [];
    const creditsWithoutPhotos = [];

    // First pass: collect credits and validate images
    for (const person of peopleArray) {
      if (validationPromises.length + creditsWithoutPhotos.length >= maxCount)
        break;

      const name = nameGetter(person);
      if (!name) continue;

      // Capture character if available
      const character = person.character || null;

      // Find IMDb fallback for this person (fuzzy match)
      const normalizedName = this.normalizeName(name);
      const imdbCredit = imdbFallbackCredits.find(
        (c) => this.normalizeName(c.name) === normalizedName,
      );
      const imdbFallback = imdbCredit?.image || null;

      if (person.profile_path) {
        // TMDB image exists - validate it
        const promise = this.validateImageUrl(
          person.profile_path,
          imdbFallback,
        ).then((validatedUrl) => ({ name, character, image: validatedUrl }));
        validationPromises.push(promise);
      } else if (imdbFallback) {
        // No TMDB but has IMDb - validate IMDb
        const promise = this.validateImageUrl(null, imdbFallback).then(
          (validatedUrl) => ({ name, character, image: validatedUrl }),
        );
        validationPromises.push(promise);
      } else {
        // No image at all - add to fallback list
        creditsWithoutPhotos.push({ name, character, image: null });
      }
    }

    // Wait for all validations
    const validated = await Promise.all(validationPromises);

    // Separate by photo availability after validation
    const withPhotos = validated.filter((c) => c.image !== null);
    const withoutPhotos = [
      ...validated.filter((c) => c.image === null),
      ...creditsWithoutPhotos,
    ];

    // Combine: photos first, then no-photos, limit to maxCount
    return [...withPhotos, ...withoutPhotos].slice(0, maxCount);
  }

  /**
   * Normalizes a name for deduplication (removes accents, lowercase)
   * e.g. "Yôichi Fujita" -> "yoichi fujita"
   *
   * @param {string} name - Name to normalize
   * @returns {string} Normalized name
   */
  normalizeName(name) {
    if (!name) return "";
    return name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  /**
   * Merges credits from primary and fallback sources with photo priority and deduplication
   * Optimized using index-based iteration (Option 2)
   *
   * @param {Array} primaryCredits - Priority credits (e.g., from Cinemeta)
   * @param {Array} fallbackCredits - Fallback credits (e.g., from IMDb)
   * @param {number} maxCount - Maximum number of credits to return
   * @returns {Array} Merged and deduplicated credits array
   */
  mergeCreditsWithFallback(primaryCredits, fallbackCredits, maxCount) {
    if (maxCount <= 0) return [];
    if (!primaryCredits?.length && !fallbackCredits?.length) return [];

    const result = [];
    const addedNames = new Set();
    const sources = [primaryCredits || [], fallbackCredits || []];

    // Iterate: first with photos (hasImage=1), then without (hasImage=0)
    for (let hasImage = 1; hasImage >= 0; hasImage--) {
      for (const credits of sources) {
        for (const credit of credits) {
          if (result.length >= maxCount) return result;

          // Skip if doesn't match current photo requirement
          if (!!credit.image !== !!hasImage) continue;

          const normalizedName = this.normalizeName(credit.name);

          // Add if unique
          if (!addedNames.has(normalizedName)) {
            result.push(credit);
            addedNames.add(normalizedName);
          }
        }
      }
    }

    return result;
  }

  /**
   * Intelligently merges new data into existing data
   * - Does NOT overwrite non-null values with null/undefined
   * - Merges arrays (like genres) instead of replacing
   *
   * @param {Object} existing - Current metadata object
   * @param {Object} incoming - New metadata object (e.g. from API)
   * @returns {Object} Merged result for Object.assign
   */
  smartMerge(existing, incoming) {
    const result = { ...incoming };

    // 1. Protect Critical Fields
    // Runtime Priority: Existing (e.g. Jikan) > Incoming (e.g. Cinemeta/IMDb)
    // If we already have a runtime, keep it. Only use incoming if existing is null/undefined.
    if (existing.runtime) {
      result.runtime = existing.runtime;
    }

    // Demographics Priority: Keep existing if incoming is missing
    if (existing.demographics && !incoming.demographics) {
      result.demographics = existing.demographics;
    }

    // Generic Null Protection: Never overwrite ANY existing non-null value with null/undefined from incoming
    // (excluding arrays which are handled below)
    for (const key in incoming) {
      if (!Array.isArray(incoming[key])) {
        // Arrays have special merge logic
        if (existing[key] != null && incoming[key] == null) {
          result[key] = existing[key];
        }
      }
    }

    // 2. Cumulative Merge for Arrays (Genres/Interests)
    // Instead of replacing Jikan genres with IMDb genres, we want BOTH
    if (existing.genres && Array.isArray(existing.genres)) {
      const incomingGenres = incoming.genres || [];
      // Union of arrays
      result.genres = [...new Set([...existing.genres, ...incomingGenres])];
    }

    if (existing.interests && Array.isArray(existing.interests)) {
      const incomingInterests = incoming.interests || [];
      result.interests = [
        ...new Set([...existing.interests, ...incomingInterests]),
      ];
    }

    return result;
  }

  /**
   * Retries incomplete enrichment - delegates to progressive enrichment
   * Note: API-level retries are handled automatically by the queue system
   *
   * @param {string} imdbId - IMDb ID to enrich
   * @param {string} type - Media type
   * @param {string} initialMetaSource - Initial metadata source state
   * @param {Object} databaseData - Existing metadata from database
   * @param {number} maxRetries - (Unused) Maximum retries - handled by queue
   * @param {boolean} priority - Whether this is a priority request
   * @returns {Promise<Object|null>} Enriched metadata
   */
  async retryIncompleteEnrichment(
    imdbId,
    type,
    initialMetaSource,
    databaseData,
    maxRetries = 2,
    priority = false,
  ) {
    // Simply call enrichment once - queue handles API retries automatically
    return await this.enrichTitleProgressively(
      imdbId,
      type,
      initialMetaSource,
      databaseData,
      priority,
    );
  }
}

// Export to global scope
window.MetadataModules = window.MetadataModules || {};
window.MetadataModules.metadataFetcher = {
  MetadataFetcher,
};
