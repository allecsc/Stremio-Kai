/**
 * TMDB Fetcher Module
 *
 * Handles all interactions with The Movie Database (TMDB) API.
 * Supports ID conversion, metadata fetching, and alternative titles.
 *
 * @module tmdb-fetcher
 * @version 1.0.0
 */

(function () {
  "use strict";

  // ─────────────────────────────────────────────────────────────────────────────
  // INITIALIZATION GUARD
  // ─────────────────────────────────────────────────────────────────────────────
  if (window.MetadataModules?.tmdbFetcher?.initialized) {
    console.log("[TMDB Fetcher] Already initialized, skipping.");
    return;
  }

  window.MetadataModules = window.MetadataModules || {};

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────────
  const API_BASE = "https://api.themoviedb.org/3";
  const IMAGE_BASE = "https://image.tmdb.org/t/p/";
  const TIMEOUT_MS = 8000;

  // Image size presets (in order of preference)
  const IMAGE_SIZES = {
    profile: ["w185", "w300", "original"],
    poster: ["w500", "w780", "original"],
    backdrop: ["original", "w2160", "w1440", "w1280"],
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // ID CONVERSION CACHE (in-memory, long TTL)
  // ─────────────────────────────────────────────────────────────────────────────
  const idConversionCache = new Map();
  const ID_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

  function getCachedIdConversion(imdbId, type) {
    const key = `${imdbId}:${type}`;
    const cached = idConversionCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.tmdbId;
    }
    idConversionCache.delete(key);
    return null;
  }

  function setCachedIdConversion(imdbId, type, tmdbId) {
    const key = `${imdbId}:${type}`;
    idConversionCache.set(key, {
      tmdbId,
      expiresAt: Date.now() + ID_CACHE_TTL_MS,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function getApiKeys() {
    return window.MetadataModules?.apiKeys;
  }

  function getFetchUtils() {
    return window.MetadataModules?.fetchUtils;
  }

  function buildImageUrl(path, type = "profile", sizeIndex = 0) {
    if (!path) return null;
    const sizes = IMAGE_SIZES[type] || IMAGE_SIZES.profile;
    const size = sizes[sizeIndex] || sizes[0];
    return `${IMAGE_BASE}${size}${path}`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TMDB FETCHER CLASS
  // ─────────────────────────────────────────────────────────────────────────────

  class TMDBFetcher {
    constructor() {
      this.apiBase = API_BASE;
    }

    /**
     * Get the API key from storage
     */
    getApiKey() {
      const apiKeys = getApiKeys();
      return apiKeys?.getKey("TMDB");
    }

    /**
     * Check if TMDB is available (has key and not rate-limited)
     */
    isAvailable() {
      const apiKeys = getApiKeys();
      return apiKeys?.isAvailable("TMDB") ?? false;
    }

    /**
     * Convert IMDb ID to TMDB ID
     * @param {string} imdbId - IMDb ID (tt1234567)
     * @param {string} type - 'movie' or 'series'
     * @returns {Promise<number|null>} TMDB ID or null
     */
    async convertToTmdbId(imdbId, type) {
      // Check cache first
      const cached = getCachedIdConversion(imdbId, type);
      if (cached !== null) {
        console.debug(`[TMDB Fetcher] Cache hit for ${imdbId} → ${cached}`);
        return cached;
      }

      const apiKey = this.getApiKey();
      if (!apiKey) return null;

      const fetchUtils = getFetchUtils();
      const url = `${this.apiBase}/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id`;

      try {
        const result = await fetchUtils.makeRequest(url, {
          timeout: TIMEOUT_MS,
        });

        if (!result.ok) {
          if (result.status === 429) {
            getApiKeys()?.markRateLimited("TMDB");
          }
          console.warn(`[TMDB Fetcher] Find failed: ${result.error}`);
          return null;
        }

        const data = result.data;
        const mediaType = type === "series" ? "tv" : "movie";
        const results =
          mediaType === "tv" ? data.tv_results : data.movie_results;

        if (results && results.length > 0) {
          const tmdbId = results[0].id;
          setCachedIdConversion(imdbId, type, tmdbId);
          console.debug(`[TMDB Fetcher] Converted ${imdbId} → ${tmdbId}`);
          return tmdbId;
        }

        return null;
      } catch (error) {
        console.error(`[TMDB Fetcher] ID conversion error:`, error);
        return null;
      }
    }

    /**
     * Fetch detailed metadata for a movie
     * @param {number} tmdbId - TMDB movie ID
     * @returns {Promise<Object|null>}
     */
    async fetchMovieDetails(tmdbId) {
      const apiKey = this.getApiKey();
      if (!apiKey) return null;

      const fetchUtils = getFetchUtils();
      const userLang =
        window.MetadataModules?.preferences?.get("language") || "en";
      const appendToResponse = "credits,images";
      const url = `${this.apiBase}/movie/${tmdbId}?api_key=${apiKey}&language=${userLang}&append_to_response=${appendToResponse}`;

      try {
        const result = await fetchUtils.makeRequest(url, {
          timeout: TIMEOUT_MS,
        });

        if (!result.ok) {
          if (result.status === 429) {
            getApiKeys()?.markRateLimited("TMDB");
          }
          return null;
        }

        return this.normalizeMovieData(result.data);
      } catch (error) {
        console.error(`[TMDB Fetcher] Movie details error:`, error);
        return null;
      }
    }

    /**
     * Fetch detailed metadata for a TV show
     * @param {number} tmdbId - TMDB TV ID
     * @returns {Promise<Object|null>}
     */
    async fetchTVDetails(tmdbId) {
      const apiKey = this.getApiKey();
      if (!apiKey) return null;

      const fetchUtils = getFetchUtils();
      const userLang =
        window.MetadataModules?.preferences?.get("language") || "en";
      const appendToResponse = "credits,content_ratings,images";
      const url = `${this.apiBase}/tv/${tmdbId}?api_key=${apiKey}&language=${userLang}&append_to_response=${appendToResponse}`;

      try {
        const result = await fetchUtils.makeRequest(url, {
          timeout: TIMEOUT_MS,
        });

        if (!result.ok) {
          if (result.status === 429) {
            getApiKeys()?.markRateLimited("TMDB");
          }
          return null;
        }

        return this.normalizeTVData(result.data);
      } catch (error) {
        console.error(`[TMDB Fetcher] TV details error:`, error);
        return null;
      }
    }

    /**
     * Fetch alternative titles for a title
     * @param {number} tmdbId - TMDB ID
     * @param {string} type - 'movie' or 'series'
     * @returns {Promise<string[]>}
     */
    async fetchAlternativeTitles(tmdbId, type) {
      const apiKey = this.getApiKey();
      if (!apiKey) return [];

      const fetchUtils = getFetchUtils();
      const mediaType = type === "series" ? "tv" : "movie";
      const url = `${this.apiBase}/${mediaType}/${tmdbId}/alternative_titles?api_key=${apiKey}`;

      try {
        const result = await fetchUtils.makeRequest(url, { timeout: 5000 });

        if (!result.ok) return [];

        const data = result.data;
        const titles = data.titles || data.results || [];
        return titles.map((t) => t.title).filter(Boolean);
      } catch (error) {
        return [];
      }
    }

    /**
     * Combined fetch: ID conversion + details + alt titles (parallel where possible)
     * @param {string} imdbId - IMDb ID
     * @param {string} type - 'movie' or 'series'
     * @param {boolean} priority - Whether this is a priority request
     * @returns {Promise<Object|null>}
     */
    async fetchByImdbId(imdbId, type, priority = false) {
      if (!this.isAvailable()) {
        console.debug(`[TMDB Fetcher] Not available for ${imdbId}`);
        return null;
      }

      // Step 1: Convert IMDb ID to TMDB ID
      const tmdbId = await this.convertToTmdbId(imdbId, type);
      if (!tmdbId) {
        console.debug(`[TMDB Fetcher] No TMDB ID found for ${imdbId}`);
        return null;
      }

      // Step 2: Fetch details + alt titles in parallel
      const fetchUtils = getFetchUtils();
      const detailsPromise =
        type === "series"
          ? this.fetchTVDetails(tmdbId)
          : this.fetchMovieDetails(tmdbId);

      const altTitlesPromise = this.fetchAlternativeTitles(tmdbId, type);

      const [details, altTitles] = await Promise.all([
        detailsPromise,
        altTitlesPromise,
      ]);

      if (!details) return null;

      // Merge alt titles into result
      details.altTitles = altTitles;
      details.tmdbId = tmdbId;
      details.imdbId = imdbId;

      console.debug(`[TMDB Fetcher] Fetched ${imdbId}: ${details.title}`);
      return details;
    }

    /**
     * Extracts the first production studio with a logo (or first available)
     * @param {Array} companies - production_companies array
     * @returns {Object|null} Studio object {name, logo} or null
     */
    extractStudio(companies) {
      if (!companies || !Array.isArray(companies) || companies.length === 0)
        return null;

      // Prioritize companies with logos
      const withLogo = companies.find((c) => c.logo_path);
      const company = withLogo || companies[0];

      return {
        name: company.name,
        logo: company.logo_path ? `${IMAGE_BASE}w92${company.logo_path}` : null,
      };
    }

    /**
     * Normalize movie data to internal format
     * Per plan, TMDB provides:
     * - plot (from overview), tagline
     * - poster, background
     * - stars (from cast[0:8]), directors (from crew[Director][0:2])
     */
    normalizeMovieData(data) {
      const credits = data.credits || {};

      return {
        // Content
        title: data.title || null,
        originalTitle: data.original_title || null,
        plot: data.overview || null,
        tagline: data.tagline || null,

        // Cast & Crew (per plan: cast→stars)
        stars: this.extractCast(credits.cast || [], 8),
        directors: this.extractCrew(credits.crew || [], "Director", 2),

        // Images
        poster: buildImageUrl(data.poster_path, "poster"),
        background: buildImageUrl(data.backdrop_path, "backdrop"),
        logo: this.processImages(data).logo,

        // Studio (using production companies)
        studio: this.extractStudio(data.production_companies),

        // Source tracking
        source: "tmdb",
      };
    }

    /**
     * Normalize TV data to internal format
     * Per plan, TMDB provides:
     * - plot (from overview), tagline
     * - poster, background
     * - stars (from cast[0:8]), directors (from crew[Director][0:2])
     * - network (name + logo) for shows
     */
    normalizeTVData(data) {
      const credits = data.credits || {};

      // Network (shows only, per plan) - STRICT SINGLE ENTRY ONLY
      // If multiple networks exist (e.g. coproductions like BBC/HBO), ignore them to avoid ambiguity.
      let network = null;
      if (data.networks && data.networks.length === 1) {
        const primaryNetwork = data.networks[0];
        if (primaryNetwork) {
          network = {
            name: primaryNetwork.name,
            logo: buildImageUrl(primaryNetwork.logo_path, "profile"),
          };
        }
      }

      return {
        // Content
        title: data.name || null,
        originalTitle: data.original_name || null,
        plot: data.overview || null,
        tagline: data.tagline || null,

        // Cast & Crew (per plan: cast→stars)
        stars: this.extractCast(credits.cast || [], 8),
        directors: this.extractCrew(credits.crew || [], "Director", 2),

        // Images
        poster: buildImageUrl(data.poster_path, "poster"),
        background: buildImageUrl(data.backdrop_path, "backdrop"),
        logo: this.processImages(data).logo,

        // Network & Studio
        network: network,
        studio: this.extractStudio(data.production_companies),

        // Metadata // Source tracking
        source: "tmdb",
      };
    }

    /**
     * Extract cast with photos (limit to top billed)
     */
    extractCast(castArray, limit = 20) {
      return castArray.slice(0, limit).map((person) => ({
        name: person.name,
        character: person.character,
        photo: buildImageUrl(person.profile_path, "profile"),
        tmdbId: person.id,
        order: person.order,
      }));
    }

    /**
     * Extract crew by job (directors, writers, etc.)
     */
    extractCrew(crewArray, job, limit = 5) {
      return crewArray
        .filter((person) => person.job === job)
        .slice(0, limit)
        .map((person) => ({
          name: person.name,
          photo: buildImageUrl(person.profile_path, "profile"),
          tmdbId: person.id,
        }));
    }

    /**
     * Extract videos (trailers, teasers)
     */
    extractVideos(videosArray, limit = 5) {
      const validTypes = ["Trailer", "Teaser"];
      return videosArray
        .filter((v) => v.site === "YouTube" && validTypes.includes(v.type))
        .slice(0, limit)
        .map((v) => ({
          type: v.type,
          name: v.name,
          key: v.key,
          site: v.site,
        }));
    }

    /**
     * Validate API key by making a test request
     */
    async validateAuthorization() {
      const apiKey = this.getApiKey();
      if (!apiKey) return { valid: false, error: "No API key" };

      const fetchUtils = getFetchUtils();
      const url = `${this.apiBase}/authentication?api_key=${apiKey}`;

      try {
        const result = await fetchUtils.makeRequest(url, { timeout: 5000 });
        return {
          valid: result.ok,
          error: result.ok ? null : result.error,
        };
      } catch (error) {
        return { valid: false, error: error.message };
      }
    }

    /**
     * Fetch images (backdrops, logos, posters) for a title
     * Useful for Hero Banner to get high-quality TMDB images
     * @param {string} imdbId - IMDb ID
     * @param {string} type - 'movie' or 'series'
     * @returns {Promise<{backdrop: string|null, logo: string|null, poster: string|null}>}
     */
    async getImages(imdbId, type) {
      if (!this.isAvailable()) return null;

      const tmdbId = await this.convertToTmdbId(imdbId, type);
      if (!tmdbId) return null;

      const apiKey = this.getApiKey();
      const fetchUtils = getFetchUtils();

      // Get user language
      const userLang =
        window.MetadataModules?.preferences?.get("language") || "en";

      const mediaType = type === "series" ? "tv" : "movie";

      // We explicitly ask for:
      // 1. User Language (for Logos/Posters)
      // 2. English (Fallback)
      // 3. Null (Textless - Critical for Backdrops)
      const langs = [userLang, "en", "null"];
      const uniqueLangs = [...new Set(langs)].join(","); // Dedupe if userLang is 'en'

      const url = `${this.apiBase}/${mediaType}/${tmdbId}/images?api_key=${apiKey}&include_image_language=${uniqueLangs}`;

      try {
        const result = await fetchUtils.makeRequest(url, { timeout: 5000 });
        if (!result.ok) return null;

        const data = result.data;

        // --- SCORING HELPERS ---

        /**
         * Score a backdrop based on Resolution, Cleanliness, and Popularity
         * Goal: 4K Textless > 4K English > 1080p Textless > 1080p English
         * CRITIQUE: User wants backdrops UNAFFECTED by language setting.
         * So strict Textless/English priority must remain.
         */
        const scoreBackdrop = (img) => {
          let score = 0;

          // 1. Resolution
          if (img.width >= 3840)
            score += 50; // 4K/UHD
          else if (img.width >= 1920)
            score += 20; // 1080p
          else score -= 10; // Low Res

          // 2. Cleanliness (Strict Textless Preference)
          if (!img.iso_639_1)
            score += 40; // Textless (Gold Standard)
          else if (img.iso_639_1 === "en")
            score += 10; // English (Acceptable)
          else score -= 20; // Foreign text (Penalize, even if it matches userLang)

          // 3. Popularity (Tie-Breaker)
          const popularityBonus = Math.min(
            10,
            (img.vote_average * (img.vote_count || 0)) / 10,
          );
          score += popularityBonus;

          return score;
        };

        /**
         * Score a logo based on Format, Language, and Resolution
         * Goal: SVG UserLang > SVG English > High-Res PNG UserLang
         */
        const scoreLogo = (img) => {
          let score = 0;

          const isSvg = img.file_path.endsWith(".svg");

          // 1. Format (SVG is King)
          if (isSvg) score += 100;

          // 2. Language Matching
          if (img.iso_639_1 === userLang)
            score += 50; // Perfect Match
          else if (img.iso_639_1 === "en")
            score += 20; // English Fallback
          else if (!img.iso_639_1)
            score += 5; // Textless (Rare for logos but exists)
          else score -= 50; // Wrong Language

          // 3. Resolution & Popularity (Raster Tuning)
          if (!isSvg) {
            if (img.width < 250) {
              score -= 50; // Too blurry
            } else {
              // Heavy Vote Weight
              const heavyPopBonus = Math.min(
                30,
                (img.vote_average * (img.vote_count || 0)) / 1,
              );
              score += heavyPopBonus;
            }
          }

          // 4. Standard Popularity (Tie-breaker for all)
          const standardPop = Math.min(
            5,
            (img.vote_average * (img.vote_count || 0)) / 10,
          );
          score += standardPop;

          return score;
        };

        // --- SELECTION ---

        const backdrops = data.backdrops || [];
        const logos = data.logos || [];
        const posters = data.posters || [];

        // Sort by score descending
        backdrops.sort((a, b) => scoreBackdrop(b) - scoreBackdrop(a));
        logos.sort((a, b) => scoreLogo(b) - scoreLogo(a));

        // Posters: Prefer User Language, Fallback to English, Fallback to Most Popular
        const bestPoster =
          posters
            .filter((p) => p.iso_639_1 === userLang)
            .sort(
              (a, b) =>
                b.vote_average * b.vote_count - a.vote_average * a.vote_count,
            )[0] ||
          posters
            .filter((p) => p.iso_639_1 === "en")
            .sort(
              (a, b) =>
                b.vote_average * b.vote_count - a.vote_average * a.vote_count,
            )[0] ||
          posters.sort(
            (a, b) =>
              b.vote_average * b.vote_count - a.vote_average * a.vote_count,
          )[0]; // Absolute fallback

        const bestBackdrop = backdrops[0];
        const bestLogo = logos[0];

        if (bestBackdrop) {
          console.debug(
            `[TMDB] Best Backdrop: ${bestBackdrop.width}x${
              bestBackdrop.height
            } (${bestBackdrop.iso_639_1 || "textless"})`,
          );
        }

        if (bestLogo) {
          console.debug(
            `[TMDB] Best Logo: ${bestLogo.file_path.split(".").pop()} (${
              bestLogo.iso_639_1
            })`,
          );
        }

        return {
          backdrop: bestBackdrop
            ? buildImageUrl(bestBackdrop.file_path, "backdrop", 0)
            : null,
          logo: bestLogo ? `${IMAGE_BASE}original${bestLogo.file_path}` : null,
          poster: bestPoster
            ? buildImageUrl(bestPoster.file_path, "poster")
            : null,
          tmdbId,
        };
      } catch (error) {
        console.error(`[TMDB Fetcher] Image fetch error:`, error);
        return null;
      }
    }

    /**
     * Helper to process images and extract best logo
     * Reuses scoring logic from getImages concept but for embedded data
     */
    processImages(data, userLang = "en") {
      if (!data?.images) return { logo: null };

      const IMAGE_BASE = "https://image.tmdb.org/t/p/";
      const logos = data.images?.logos || [];

      if (!logos.length) return { logo: null };

      // Simplified scoring for sync context
      const scoreLogo = (img) => {
        let score = 0;
        const isSvg = img.file_path.endsWith(".svg");
        // 1. Format (SVG is King)
        if (isSvg) score += 100;

        // 2. Language Matching
        if (img.iso_639_1 === userLang)
          score += 50; // Perfect Match
        else if (img.iso_639_1 === "en")
          score += 20; // English Fallback
        else if (!img.iso_639_1)
          score += 5; // Textless
        else score -= 50; // Wrong Language

        // 3. Resolution & Popularity (Raster Tuning)
        if (!isSvg) {
          if (img.width < 250) score -= 50;
          else
            score += Math.min(
              30,
              (img.vote_average * (img.vote_count || 0)) / 1,
            );
        }
        return score;
      };

      logos.sort((a, b) => scoreLogo(b) - scoreLogo(a));
      const bestLogo = logos[0];

      return {
        logo: bestLogo ? `${IMAGE_BASE}original${bestLogo.file_path}` : null,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────────
  const instance = new TMDBFetcher();

  window.MetadataModules.tmdbFetcher = {
    initialized: true,
    instance,

    // Convenience methods
    fetchByImdbId: (...args) => instance.fetchByImdbId(...args),
    convertToTmdbId: (...args) => instance.convertToTmdbId(...args),
    getImages: (...args) => instance.getImages(...args),
    isAvailable: () => instance.isAvailable(),
    validateAuthorization: () => instance.validateAuthorization(),

    // Image URL helper
    buildImageUrl,
  };

  console.log("[TMDB Fetcher] Module initialized.");
})();
