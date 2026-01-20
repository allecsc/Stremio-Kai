/**
 * @name Metadata Helper - Title Search Module
 * @description Service for searching IMDb titles via IMDb Scraper API with enhanced fuzzy matching
 */

// Title Search Service - handles IMDb title search with position-aware similarity matching
class TitleSearchService {
  // Cache configuration - prevent memory leaks
  static MAX_CACHE_SIZE = 5000; // Maximum number of entries
  static CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours TTL

  // Search configuration
  static API_MAX_RESULTS = 3; // Take top 3 results from API for validation
  static SIMILARITY_THRESHOLD = 0.75; // Minimum similarity score required (75%)
  static EARLY_WORD_WEIGHT = 1.5; // Extra weight for first 3 words
  static EXTRA_WORD_PENALTY = 0.3; // Penalty for words in result not in search query

  constructor(rateLimiter) {
    this.rateLimiter = rateLimiter;
    this.cache = new Map();
    this.cacheTimestamps = new Map(); // Track insertion timestamps for TTL
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
    if (!this.cache.has(key)) {
      this.cacheMisses++;
      return undefined;
    }

    const timestamp = this.cacheTimestamps.get(key);
    if (timestamp && Date.now() - timestamp > TitleSearchService.CACHE_TTL_MS) {
      // Entry expired, remove it
      this.cache.delete(key);
      this.cacheTimestamps.delete(key);
      this.cacheMisses++;
      return undefined;
    }

    // Cache hit - move to end (most recently used) for LRU
    this.cacheHits++;
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);

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
    this.cache.set(key, value);
    this.cacheTimestamps.set(key, now);

    // Enforce cache size limit with LRU eviction
    if (this.cache.size > TitleSearchService.MAX_CACHE_SIZE) {
      // Remove oldest entry (first in Map due to insertion order)
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      this.cacheTimestamps.delete(oldestKey);
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

    for (const [key, timestamp] of this.cacheTimestamps) {
      if (now - timestamp > TitleSearchService.CACHE_TTL_MS) {
        expiredCount++;
      } else {
        validCount++;
      }
    }

    return {
      size: this.cache.size,
      maxSize: TitleSearchService.MAX_CACHE_SIZE,
      ttlMs: TitleSearchService.CACHE_TTL_MS,
      validEntries: validCount,
      expiredEntries: expiredCount,
      hitRate:
        this.cacheHits !== undefined
          ? this.cacheHits / (this.cacheHits + this.cacheMisses || 1)
          : 0,
    };
  }

  /**
   * Searches for an IMDb ID using the new IMDb Scraper API
   * @param {string} title - Title to search for
   * @param {number|string|null} year - Release year for scoring bonus (optional)
   * @param {boolean} priority - Whether to prioritize this request
   * @param {string|null} alternateTitle - Alternate title to check (e.g. original Japanese title)
   * @returns {Promise<string|null>} IMDb ID (ttXXXXXXX) or null if not found
   */
  async searchImdbForId(
    title,
    year = null,
    priority = false,
    alternateTitle = null
  ) {
    // Input validation
    if (!title || typeof title !== "string" || title.trim() === "") {
      throw new Error("Invalid title: must be a non-empty string");
    }

    const cleanedTitle = this.cleanTitleForSearch(title);
    const cacheKey = year ? `${cleanedTitle}_${year}` : cleanedTitle;

    // Check cache first (with TTL validation)
    const cachedResult = this.getFromCache(cacheKey);
    if (cachedResult !== undefined) {
      return cachedResult;
    }

    try {
      // Search using the primary title (usually English/Romaji)
      const url = `https://imdb.iamidiotareyoutoo.com/search?q=${encodeURIComponent(
        cleanedTitle
      )}`;

      const response = await this.rateLimiter.makeImdbScraperRequest(
        url,
        {},
        priority
      );

      // Check API response structure
      if (
        !response?.ok ||
        !response?.description ||
        !Array.isArray(response.description)
      ) {
        console.warn(
          `[METADATA][Title Search] Invalid response from IMDb Scraper API for "${cleanedTitle}"`
        );
        this.setCache(cacheKey, null);
        return null;
      }

      if (response.description.length === 0) {
        console.warn(
          `[METADATA][Title Search] No results from IMDb Scraper API for "${cleanedTitle}"`
        );
        this.setCache(cacheKey, null);
        return null;
      }

      // Take top 3 results for validation (API pre-sorts by relevance)
      const topResults = response.description.slice(
        0,
        TitleSearchService.API_MAX_RESULTS
      );
      const bestMatch = this.selectBestMatch(
        topResults,
        cleanedTitle,
        year,
        alternateTitle
      );

      // Cache the result with LRU management
      this.setCache(cacheKey, bestMatch);
      return bestMatch;
    } catch (error) {
      if (error.message === "Daily limit exceeded") {
        console.warn(
          `[METADATA][Title Search] Daily limit reached, search skipped for "${title}"`
        );
        // Don't cache daily limit errors
        return null;
      }

      console.warn(
        `[METADATA][Title Search] Search failed for "${title}":`,
        error
      );
      // Cache null results to avoid repeated failed calls
      this.setCache(cacheKey, null);
      return null;
    }
  }

  /**
   * Cleans title for search
   * @param {string} title - Raw title
   * @returns {string} Cleaned title
   */
  cleanTitleForSearch(title) {
    return window.MetadataModules.titleUtils.TitleUtils.cleanTitleForSearch(
      title
    );
  }

  /**
   * Generates variations of a title to handle romanization differences (macrons vs double vowels)
   * e.g. "Chôbatsu" -> ["Chôbatsu", "Choobatsu", "Choubatsu"]
   * @param {string} title
   * @returns {string[]}
   */
  generateRomanizationVariations(title) {
    if (!title) return [];
    const variations = new Set();

    // 0. Pre-normalize to NFC to ensure chars like 'û' are single codepoints
    // matches NFD 'u' + '^' -> NFC 'û'
    title = title.normalize("NFC");

    // 1. Original (will be normalized cleaning in calculateDiceSimilarity)
    // e.g. "Chôbatsu" -> matches "Chobatsu" (after NFD stripping)
    variations.add(title);

    // Maps for expansion
    const doubleMap = {
      ā: "aa",
      Â: "aa",
      â: "aa",
      Ā: "aa",
      ī: "ii",
      Î: "ii",
      î: "ii",
      Ī: "ii",
      ū: "uu",
      Û: "uu",
      û: "uu",
      Ū: "uu",
      ē: "ee",
      Ê: "ee",
      ê: "ee",
      Ē: "ee",
      ō: "oo",
      Ô: "oo",
      ô: "oo",
      Ō: "oo",
    };

    // 'ou' specific map for 'o' sounds (Wapuro B), others double
    const ouMap = {
      ...doubleMap,
      ō: "ou",
      Ô: "ou",
      ô: "ou",
      Ō: "ou",
    };

    const expand = (str, map) => {
      const regex = new RegExp(Object.keys(map).join("|"), "g");
      return str.replace(regex, (matched) => map[matched]);
    };

    // 2. Expanded Romanization - Double Vowels (Wapuro A: ô -> oo)
    // e.g. "Chôbatsu" -> "Choobatsu" (matches "Ookami")
    const expandedDouble = expand(title, doubleMap);
    if (expandedDouble !== title) variations.add(expandedDouble);

    // 3. Expanded Romanization - OU Style (Wapuro B: ô -> ou)
    // e.g. "Chôbatsu" -> "Choubatsu" (matches "Choubatsu")
    const expandedOu = expand(title, ouMap);
    if (expandedOu !== title) variations.add(expandedOu);

    return Array.from(variations);
  }

  /**
   * Selects the best match using Dice Coefficient + Length Guard + Year Bonus
   */
  selectBestMatch(results, targetTitle, year = null, alternateTitle = null) {
    // Optimization: Convert year once outside loop
    const searchYear = year ? String(year) : null;
    const cleanedAlt = alternateTitle
      ? this.cleanTitleForSearch(alternateTitle)
      : null;
    let bestMatchId = null;
    let bestScore = 0;

    console.log(
      `[METADATA][Title Search] Selecting best match for "${targetTitle}" (Year: ${
        searchYear || "N/A"
      }, Alt: ${cleanedAlt || "N/A"})`
    );

    for (const result of results) {
      const resultTitle = result["#TITLE"];
      const imdbId = result["#IMDB_ID"];
      const resultYear = result["#YEAR"];

      // DEBUG: Log result structure to check keys
      // console.log(`[METADATA][Title Search] Inspecting result keys:`, Object.keys(result), "Values:", result);

      if (!resultTitle || !imdbId) continue;

      const candidates = this.generateRomanizationVariations(resultTitle);

      // Track the best score for THIS result, and the length of the source that generated it
      // This ensures we validate length against the actual matching string (Alt vs Result), not the mismatching one (Target vs Result)
      let maxScoreForThisResult = 0;
      let bestSourceLength = targetTitle.length; // Default to target

      // Check all candidates (Original vs Expanded)
      for (const candidate of candidates) {
        // Check Main Title
        let mainScore = this.calculateDiceSimilarity(targetTitle, candidate);
        if (mainScore > maxScoreForThisResult) {
          maxScoreForThisResult = mainScore;
          bestSourceLength = targetTitle.length;
        }

        // Check Alternate Title
        if (cleanedAlt) {
          const altScore = this.calculateDiceSimilarity(cleanedAlt, candidate);
          if (altScore > maxScoreForThisResult) {
            maxScoreForThisResult = altScore;
            bestSourceLength = cleanedAlt.length;
          }
        }
      }

      let finalScore = maxScoreForThisResult;

      // 2. Apply Length Penalty (The "Red" Guard)
      // NOW we compare against the source that actually matched
      const lenA = bestSourceLength;
      const lenB = resultTitle.length; // Approximate, but good enough. Using resultTitle is safer as base truth.
      const lengthRatio = Math.min(lenA, lenB) / Math.max(lenA, lenB);

      if (lengthRatio < 0.8) {
        finalScore -= 0.3; // Huge penalty for size mismatch
      }

      // 3. Year Bonus (The Confidence Booster)
      // Soft check: allow +/- 1 year variance
      if (searchYear && resultYear) {
        const diff = Math.abs(parseInt(searchYear) - parseInt(resultYear));
        if (diff <= 1) {
          finalScore += 0.25;
        }
      }

      console.log(
        `[METADATA][Title Search] Candidate: "${resultTitle}" (${resultYear}) - Final Score: ${finalScore.toFixed(
          2
        )}`
      );

      // 4. Threshold & Selection
      if (finalScore > bestScore) {
        bestScore = finalScore;
        bestMatchId = imdbId;
      }
    }

    // Final Threshold Check (0.85 is a safe high bar)
    if (bestScore >= 0.85) {
      console.log(
        `[METADATA][Title Search] Winner: ${bestMatchId} (Score: ${bestScore.toFixed(
          2
        )})`
      );
      return bestMatchId;
    }

    console.warn(
      `[METADATA][Title Search] No matches above threshold (0.85) for "${targetTitle}"`
    );
    return null;
  }

  /**
   * Calculates Dice Coefficient using Trigrams (3-character tokens)
   * Excellent for fuzzy matching, romanization differences, and typos.
   * @param {string} str1
   * @param {string} str2
   * @returns {number} Score 0.0 - 1.0 (1.0 = Perfect)
   */
  calculateDiceSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;

    // Normalize: NFD (split diacritics), remove accents, lowercase, remove non-alphanumeric
    // This ensures "Pokémon" matches "Pokemon"
    const normalize = (s) =>
      s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

    const clean1 = normalize(str1);
    const clean2 = normalize(str2);

    if (clean1 === clean2) return 1.0;
    if (clean1.length < 2 || clean2.length < 2) return 0;

    // Generate Trigrams
    const getTrigrams = (s) => {
      const trigrams = new Set();
      // Pad string to give weight to start/end
      const padded = `__${s}__`;
      for (let i = 0; i < padded.length - 2; i++) {
        trigrams.add(padded.slice(i, i + 3));
      }
      return trigrams;
    };

    const set1 = getTrigrams(clean1);
    const set2 = getTrigrams(clean2);

    // Calculate Intersection
    let intersection = 0;
    for (const gram of set1) {
      if (set2.has(gram)) intersection++;
    }

    // Dice Formula: (2 * Intersection) / (Size1 + Size2)
    return (2.0 * intersection) / (set1.size + set2.size);
  }
}

// Export to global scope
window.MetadataModules = window.MetadataModules || {};
window.MetadataModules.titleSearch = {
  TitleSearchService,
};
