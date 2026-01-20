/**
 * @name Metadata Helper - Metadata Storage Module
 * @description Database operations and background update management
 */

// Pure Database Storage Service
class MetadataStorage {
  constructor(fetcher, idConverter, titleSearcher, idLookup) {
    this.fetcher = fetcher;
    this.idConverter = idConverter;
    this.titleSearcher = titleSearcher;
    this.idLookup = idLookup;
    this.db = null;
    this.initPromise = null;
    // Cache IdUtils for easy access
    this.IdUtils = window.MetadataModules.idUtils.IdUtils;

    this.init();
  }

  async init() {
    await this.initDatabase();
  }

  async initDatabase() {
    while (typeof Dexie === "undefined") {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.db = new Dexie("MetadataDB");

    // Version 2: Original schema with multi-entry indexes
    this.db.version(2).stores({
      titles:
        "++id, &imdb, *anilist, *kitsu, *mal, tmdb, tvdb, [type+title], type, title, originalTitle, year, status, genres, interests, demographics, ratingsImdb, ratingsMal, rankMal, ratingsMetacritic, runtime, awards, seasons, episodes, originCountry, metaSource, lastUpdated",
    });

    // Version 3: Extended schema for private API data
    // New fields: ratings (multi-source object), cast, directors, writers, keywords, videos,
    // contentRating, altTitles, collection, metaSourcePrivate, lastEnrichedPrivate
    this.db.version(3).stores({
      titles:
        "++id, &imdb, *anilist, *kitsu, *mal, tmdb, tvdb, [type+title], type, title, originalTitle, year, status, genres, interests, demographics, ratingsImdb, ratingsMal, rankMal, ratingsMetacritic, runtime, awards, seasons, episodes, originCountry, metaSource, lastUpdated, metaSourcePrivate, lastEnrichedPrivate, contentRating",
    });

    // Version 4: Added isAnime field for anime detection caching
    this.db.version(4).stores({
      titles:
        "++id, &imdb, *anilist, *kitsu, *mal, tmdb, tvdb, [type+title], type, title, originalTitle, year, status, genres, interests, demographics, ratingsImdb, ratingsMal, rankMal, ratingsMetacritic, runtime, awards, seasons, episodes, originCountry, metaSource, lastUpdated, metaSourcePrivate, lastEnrichedPrivate, contentRating, isAnime, animeReason",
    });

    // Version 5: Added network field for TV shows
    this.db.version(5).stores({
      titles:
        "++id, &imdb, *anilist, *kitsu, *mal, tmdb, tvdb, [type+title], type, title, originalTitle, year, status, genres, interests, demographics, ratingsImdb, ratingsMal, rankMal, ratingsMetacritic, runtime, awards, seasons, episodes, originCountry, metaSource, lastUpdated, metaSourcePrivate, lastEnrichedPrivate, contentRating, isAnime, animeReason, network",
    });

    await this.db.open();
    console.log(
      "[METADATA][Metadata Storage] IndexedDB initialized successfully (v5)"
    );
  }

  /**
   * Configuration for excluded terms in genres and interests
   */
  static EXCLUDED_TERMS = {
    // Terms to match using substring search (case-insensitive)
    contains: [], // Catches "Animation", "Adult Animation", "Hand-Drawn Animation", etc.
    // Terms to match exactly (case-insensitive)
    exact: [],
  };

  /**
   * Normalizes and merges genres from multiple sources
   * - Splits compound genres (e.g., "Action & Adventure" → ["Action", "Adventure"])
   * - Filters out animation-related and excluded terms
   * - Removes duplicates (case-insensitive)
   * @param {...Array} genreArrays - Multiple genre arrays to merge
   * @returns {Array} Normalized and deduplicated genres
   */
  _normalizeAndMergeGenres(...genreArrays) {
    const seen = new Set();
    const result = [];
    const { contains, exact } = MetadataStorage.EXCLUDED_TERMS;

    for (const genres of genreArrays) {
      if (!Array.isArray(genres)) continue;

      for (const genre of genres) {
        if (typeof genre !== "string") continue;

        // Split on " & " and process each part
        const parts = genre.split(" & ");
        for (const part of parts) {
          const trimmed = part.trim();
          const lower = trimmed.toLowerCase();

          // Check duplicate
          if (seen.has(lower)) continue;

          // Check exact exclusion
          if (exact.includes(lower)) continue;

          // Check substring exclusion
          if (contains.some((term) => lower.includes(term))) continue;

          seen.add(lower);
          result.push(trimmed);
        }
      }
    }

    return result;
  }

  /**
   * Merges arrays and removes duplicates and excluded terms
   * Filters out demographics (they have their own field) and excluded terms
   * Also filters out any items found in the optional excludeList (e.g. existing genres)
   * @param {...Array} arrays - Arrays to merge
   * @param {Array} demographics - Demographics to exclude from interests (optional)
   * @param {Array} excludeList - Explicit list of items to exclude (e.g. existing genres)
   * @returns {Array} Merged array with unique values
   */
  _mergeUniqueArrays(...arrays) {
    // Extract optional trailing arguments (demographics, excludeList)
    // LOGIC PRESERVATION: Original function inspects last argument type to detect optional args
    let demographics = [];
    let excludeList = [];

    // Check if last argument is excludeList or demographics
    if (arrays.length > 0) {
      const lastArg = arrays[arrays.length - 1];
      if (Array.isArray(lastArg)) {
        if (lastArg._isExcludeList) {
          excludeList = arrays.pop();
        } else if (this._isDemographicsArray(lastArg)) {
          demographics = arrays.pop();
        }
      }
    }

    // Re-check for demographics if we just popped excludeList
    if (arrays.length > 0) {
      const lastArg = arrays[arrays.length - 1];
      if (Array.isArray(lastArg) && this._isDemographicsArray(lastArg)) {
        demographics = arrays.pop();
      }
    }

    const excludeSet = new Set(
      (Array.isArray(excludeList) ? excludeList : [])
        .filter((i) => typeof i === "string")
        .map((i) => i.toLowerCase())
    );

    const seen = new Set();
    const result = [];
    const { contains, exact } = MetadataStorage.EXCLUDED_TERMS;

    for (const arr of arrays) {
      if (!Array.isArray(arr)) continue;

      for (const item of arr) {
        if (!item || typeof item !== "string") continue;

        const lower = item.toLowerCase();

        if (seen.has(lower)) continue;
        if (excludeSet.has(lower)) continue;

        // Check demographics
        if (
          demographics.some(
            (d) => typeof d === "string" && d.toLowerCase() === lower
          )
        )
          continue;

        // Check exact exclusion
        if (exact.includes(lower)) continue;

        // Check substring exclusion
        if (contains.some((term) => lower.includes(term))) continue;

        seen.add(lower);
        result.push(item);
      }
    }

    return result;
  }

  // Helper to preserve original demographics detection logic strictly
  _isDemographicsArray(arr) {
    const knownDemographics = [
      "josei",
      "seinen",
      "shōnen",
      "shōjo",
      "shounen",
      "shoujo",
    ];
    return arr.some(
      (item) =>
        typeof item === "string" &&
        knownDemographics.includes(item.toLowerCase())
    );
  }

  /**
   * Merge ratings from multiple sources, preserving existing ratings.
   * New ratings are added, but never replace existing with null/empty.
   * This ensures MAL rating from Jikan isn't lost when MDBList enriches.
   *
   * @param {Object} existingRatings - Current ratings object in database
   * @param {Object} newRatings - New ratings to merge in
   * @returns {Object} Merged ratings object
   */
  _mergeRatings(existingRatings = {}, newRatings = {}) {
    const merged = { ...existingRatings };

    for (const [source, data] of Object.entries(newRatings)) {
      // Only add/update if new data has a valid score
      if (data && typeof data === "object" && data.score != null) {
        merged[source] = data;
      }
    }

    return merged;
  }

  /**
   * CRITICAL: Merge new entry data with existing data, preserving existing values.
   * NEVER replace existing non-null values with null/undefined/empty.
   *
   * This function ensures:
   * - Existing ratings (e.g., MAL from Jikan) aren't lost when MDBList enriches
   * - Existing cast/directors from public APIs aren't overwritten
   * - Only adds/updates fields that have actual new values
   *
   * @param {Object} existing - Current database entry
   * @param {Object} newData - New data to merge in
   * @returns {Object} Merged entry
   */
  _mergeEntryData(existing, newData) {
    const merged = { ...existing };

    for (const [key, newValue] of Object.entries(newData)) {
      // Skip if new value is null/undefined
      if (newValue == null) continue;

      // Skip if new value is empty string
      if (newValue === "") continue;

      // Skip if new value is empty array and existing has data
      if (Array.isArray(newValue) && newValue.length === 0) {
        if (Array.isArray(existing[key]) && existing[key].length > 0) {
          continue; // Keep existing array data
        }
      }

      // Skip if new value is empty object
      if (
        typeof newValue === "object" &&
        !Array.isArray(newValue) &&
        Object.keys(newValue).length === 0
      ) {
        continue;
      }

      // Special handling for ratings - use _mergeRatings
      if (key === "ratings") {
        merged.ratings = this._mergeRatings(existing.ratings, newValue);
        continue;
      }

      // Special handling for network - overwrite only if new value is valid
      if (key === "network") {
        if (newValue && newValue.name) {
          merged.network = newValue;
        }
        continue;
      }

      // Special handling for anime ID arrays - merge, don't replace
      if (key === "mal" || key === "anilist" || key === "kitsu") {
        merged[key] = this.IdUtils.mergeIdArrays(existing[key], newValue);
        continue;
      }

      // Special handling for genres - merge and normalize (imported from legacy merge logic)
      if (key === "genres") {
        merged.genres = this._normalizeAndMergeGenres(
          existing.genres,
          newValue
        );
        continue;
      }

      // Special handling for interests - merge unique (imported from legacy merge logic)
      if (key === "interests") {
        merged.interests = this._mergeUniqueArrays(
          existing.interests,
          newValue
        );
        continue;
      }

      // Special handling for title - ALLOW OVERWRITE to support localization
      // If we have a new title (from TMDB/localized source), use it!
      if (key === "title" && newValue) {
        merged.title = newValue;
        continue;
      }

      // For all other fields, use new value only if it's truthy
      // OR if existing is empty/null
      if (newValue || !existing[key]) {
        merged[key] = newValue;
      }
    }

    // Update timestamp
    merged.lastUpdated = Date.now();

    return merged;
  }

  async saveTitle(richData) {
    try {
      // Check for existing by any available ID (comprehensive check)
      let existing = null;
      const idChecks = [
        { field: "imdb", value: richData.imdb },
        { field: "tmdb", value: richData.tmdb },
        { field: "tvdb", value: richData.tvdb },
        { field: "mal", value: richData.mal },
        { field: "anilist", value: richData.anilist },
        { field: "kitsu", value: richData.kitsu },
      ];

      for (const { field, value } of idChecks) {
        if (value && !existing) {
          if (field === "imdb") {
            existing = await this.getTitle(value);
          } else {
            existing = await this.db.titles.where(field).equals(value).first();
          }
        }
      }

      // Fallback to type+title if no ID match found
      if (!existing && richData.type && richData.title) {
        existing = await this.db.titles
          .where("[type+title]")
          .equals([richData.type, richData.title])
          .first();
      }

      if (existing) {
        // Update existing record with enriched data
        const { id, ...dataToMerge } = richData;

        // If we are merging a temporary entry (richData.id) into a different existing entry,
        // we must delete the temporary entry to prevent duplicates.
        if (richData.id && richData.id !== existing.id) {
          await this.db.titles.delete(richData.id);
        }

        const updated = this._mergeEntryData(existing, dataToMerge);

        // Compute and cache isAnime status using shared detection utility
        const { isAnime, reason } = window.AnimeDetection?.detect(updated) || {
          isAnime: false,
          reason: null,
        };
        updated.isAnime = isAnime;
        updated.animeReason = reason;

        await this.db.titles.put(updated);
        return updated; // Return updated object instead of ID
      } else {
        // Try to create new record
        const storageData = {
          imdb: richData.imdb,
          type: richData.type,
          title: richData.title,
          originalTitle: richData.originalTitle,
          year: richData.year,
          status: richData.status,
          runtime: richData.runtime,
          genres: this._normalizeAndMergeGenres(richData.genres),
          interests: this._mergeUniqueArrays(
            richData.interests,
            Object.assign([], this._normalizeAndMergeGenres(richData.genres), {
              _isExcludeList: true,
            })
          ),
          demographics: richData.demographics,
          // Merge new ratings with existing, preserving MAL/IMDb from public APIs
          ratings: this._mergeRatings(existing?.ratings, richData.ratings),
          rankMal: richData.rankMal, // Jikan
          malUrl: richData.malUrl, // Jikan
          plot: richData.plot,
          awards: richData.awards,
          directors: richData.directors,
          stars: richData.stars,
          originCountry: richData.originCountry,
          seasons: richData.seasons,
          episodes: richData.episodes,
          tmdb: richData.tmdb,
          tvdb: richData.tvdb,
          // Store anime IDs as arrays to support multiple seasons per IMDb ID
          mal: this.IdUtils.ensureArray(richData.mal),
          anilist: this.IdUtils.ensureArray(richData.anilist),
          kitsu: this.IdUtils.ensureArray(richData.kitsu),
          metaSource: richData.metaSource,
          lastUpdated: richData.lastUpdated || Date.now(),
          // Add MetaHub images
          poster: richData.poster,
          background: richData.background,
          logo: richData.logo,
          // Add network
          network: richData.network,
        };

        // Compute and cache isAnime status using shared detection utility
        const { isAnime, reason } = window.AnimeDetection?.detect(
          storageData
        ) || { isAnime: false, reason: null };
        storageData.isAnime = isAnime;
        storageData.animeReason = reason;

        try {
          const result = await this.db.titles.put(storageData);

          // EVENT DISPATCH: Notify listeners of update
          if (typeof CustomEvent !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("metadata-updated", {
                detail: {
                  imdb: storageData.imdb,
                  id: storageData.imdb, // Compatible with different listeners
                  type: storageData.type,
                  source: "storage",
                },
              })
            );
          }

          return { ...storageData, id: result }; // Return full object with new ID
        } catch (error) {
          if (error.name === "ConstraintError") {
            // Constraint error indicates concurrent insert - fetch and merge with existing entry
            return await this.handleConstraintConflict(richData, idChecks);
          }
          throw error; // Re-throw non-constraint errors
        }
      }
    } catch (error) {
      console.error(
        `[METADATA][Storage] Failed to save title "${richData.title}":`,
        error
      );
      return null;
    }
  }

  async handleConstraintConflict(richData, idChecks) {
    // Try to find the conflicting entry by checking unique constraints
    let conflictingEntry = null;
    let conflictField = null;

    // Check IMDb first (most common constraint)
    if (richData.imdb) {
      conflictingEntry = await this.getTitle(richData.imdb);
      if (conflictingEntry) {
        conflictField = "imdb";
      }
    }

    // If not found by IMDb, check other ID fields
    if (!conflictingEntry) {
      for (const { field, value } of idChecks) {
        if (value && field !== "imdb") {
          conflictingEntry = await this.db.titles
            .where(field)
            .equals(value)
            .first();
          if (conflictingEntry) {
            conflictField = field;
            break;
          }
        }
      }
    }

    // If still not found, try type+title compound index
    if (!conflictingEntry && richData.type && richData.title) {
      conflictingEntry = await this.db.titles
        .where("[type+title]")
        .equals([richData.type, richData.title])
        .first();
      if (conflictingEntry) {
        conflictField = "type+title";
      }
    }

    if (conflictingEntry) {
      console.warn(
        `[METADATA][Storage] Race condition detected for "${
          richData.title
        }" - merging with existing entry (conflict on ${conflictField}: ${
          conflictField === "type+title"
            ? richData.type + "/" + richData.title
            : richData[conflictField]
        })`
      );

      // Merge richData with existing entry, handling array merging for anime IDs
      // and nested object merging (ratings). Never replace existing with null.
      const { id, ...dataToMerge } = richData;

      const updated = {
        ...conflictingEntry,
        ...dataToMerge,
        // Merge arrays for anime IDs
        mal: this.IdUtils.mergeIdArrays(conflictingEntry.mal, richData.mal),
        anilist: this.IdUtils.mergeIdArrays(
          conflictingEntry.anilist,
          richData.anilist
        ),
        kitsu: this.IdUtils.mergeIdArrays(
          conflictingEntry.kitsu,
          richData.kitsu
        ),
        // Merge ratings (preserve existing, add new)
        ratings: this._mergeRatings(conflictingEntry.ratings, richData.ratings),
        // Never replace existing cast/directors with empty arrays
        stars:
          richData.stars?.length > 0 ? richData.stars : conflictingEntry.stars,
        directors:
          richData.directors?.length > 0
            ? richData.directors
            : conflictingEntry.directors,
        lastUpdated: Date.now(),
      };

      await this.db.titles.put(updated);
      return updated; // Return updated object
    }

    // This should rarely happen - constraint error but can't find conflicting entry
    console.error(
      `[METADATA][Storage] Unable to resolve constraint violation for "${richData.title}" - no conflicting entry found`
    );
    throw new Error(`Unresolved constraint violation for "${richData.title}"`);
  }

  async getTitle(imdbId) {
    try {
      if (!imdbId) return null;
      const title = await this.db.titles.where("imdb").equals(imdbId).first();

      // Check if stale and trigger background refresh
      if (title && this.isStale(title)) {
        this.refreshTitleInBackground(title);
      }

      return title; // Return immediately (even if stale, fresh data comes next hover)
    } catch (error) {
      console.error(
        `[METADATA][Storage] Failed to get title ${imdbId}:`,
        error
      );
      return null;
    }
  }

  // Check if title metadata is stale (>3 days old)
  isStale(title) {
    if (!title || !title.lastUpdated) return false;
    const staleThreshold =
      window.MetadataModules.config.METADATA_CONFIG.staleThreshold;
    return Date.now() - title.lastUpdated > staleThreshold;
  }

  // Refresh title in background (non-blocking)
  async refreshTitleInBackground(title) {
    // Run after small delay to avoid blocking
    setTimeout(async () => {
      try {
        const enrichedData = await this.fetcher.retryIncompleteEnrichment(
          title.imdb,
          title.type,
          title.metaSource,
          title
        );

        if (enrichedData) {
          await this.saveTitle(enrichedData);
          console.log(
            `[METADATA][Storage] ✅ Lazy refresh completed: ${title.title}`
          );
        }
      } catch (error) {
        console.warn(
          `[METADATA][Storage] ⚠️ Lazy refresh failed for ${title.imdb}:`,
          error
        );
      }
    }, 100); // Small delay to avoid blocking
  }

  async hasTitle(imdbId) {
    try {
      const title = await this.db.titles.where("imdb").equals(imdbId).first();
      return !!title;
    } catch (error) {
      console.error(
        `[METADATA][Storage] Failed to check if title exists ${imdbId}:`,
        error
      );
      return false;
    }
  }

  async enrichTitleIds(imdbId, additionalData) {
    try {
      if (!additionalData || Object.keys(additionalData).length === 0) return;

      const existing = await this.getTitle(imdbId);
      if (existing) {
        // Exclude 'id' field to preserve existing record's primary key
        const {
          id,
          interests: newInterests,
          demographics: newDemographics,
          ...dataToMerge
        } = additionalData;

        // Merge interests with deduplication
        let mergedInterests = existing.interests || [];
        if (newInterests && newInterests.length > 0) {
          mergedInterests = this._mergeUniqueArrays(
            existing.interests || [],
            newInterests,
            Object.assign([], existing.genres || [], { _isExcludeList: true })
          );
        }

        // Demographics: single value, only fill if empty
        // Either IMDB API or Jikan can fill this, first one wins
        const finalDemographics =
          existing.demographics || newDemographics || null;

        const updated = {
          ...existing, // Preserve existing primary key and all existing data
          ...dataToMerge, // Merge enriched metadata (ratings, dirs, etc.)
          interests: mergedInterests,
          demographics: finalDemographics,
          lastUpdated: Date.now(),
        };

        await this.db.titles.put(updated);

        // EVENT DISPATCH: Notify listeners of update
        if (typeof CustomEvent !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("metadata-updated", {
              detail: {
                imdb: existing.imdb,
                id: existing.imdb,
                type: existing.type,
                source: "enrichment",
              },
            })
          );
        }

        return updated;
      }
    } catch (error) {
      console.error(
        `[METADATA][Storage] Failed to enrich title IDs for ${imdbId}:`,
        error
      );
      return null;
    }
  }

  async updateEntryWithConversionResults(
    savedEntry,
    conversionResult,
    extractedIds
  ) {
    try {
      const updatedEntry = {
        ...savedEntry,
        imdb: conversionResult.imdb || savedEntry.imdb || null,
        // Merge new IDs into existing arrays
        mal: this.IdUtils.mergeIdArrays(
          savedEntry.mal,
          extractedIds.mal || conversionResult.mal
        ),
        anilist: this.IdUtils.mergeIdArrays(
          savedEntry.anilist,
          extractedIds.anilist || conversionResult.anilist
        ),
        kitsu: this.IdUtils.mergeIdArrays(
          savedEntry.kitsu,
          extractedIds.kitsu || conversionResult.kitsu
        ),
        tmdb:
          extractedIds.tmdb || conversionResult.tmdb || savedEntry.tmdb || null,
        tvdb:
          extractedIds.tvdb || conversionResult.tvdb || savedEntry.tvdb || null,
        lastUpdated: Date.now(),
      };
      await this.db.titles.put(updatedEntry);
      return updatedEntry;
    } catch (error) {
      if (error.name === "ConstraintError") {
        // Entry already exists with this ID - we must merge into it!
        console.log(
          `[METADATA] ConstraintError in updateEntryWithConversionResults - merging into existing entry`
        );

        try {
          // 1. Find the conflicting entry (the one that already has the IMDb ID)
          const existingEntry = await this.getTitle(conversionResult.imdb);

          if (existingEntry) {
            // 2. Merge our new IDs into the existing entry
            const mergedEntry = this._mergeEntryData(existingEntry, {
              ...extractedIds,
              ...conversionResult,
            });

            // 3. Delete the temporary entry (savedEntry) to prevent duplicates
            if (savedEntry.id && savedEntry.id !== existingEntry.id) {
              console.log(
                `[METADATA] Deleting temporary entry ${savedEntry.id} in favor of existing ${existingEntry.id}`
              );
              await this.db.titles.delete(savedEntry.id);
            }

            // 4. Save the merged entry
            await this.db.titles.put(mergedEntry);
            return mergedEntry;
          }
        } catch (mergeError) {
          console.error(
            `[METADATA] Failed to merge after ConstraintError:`,
            mergeError
          );
        }

        return savedEntry;
      }
      console.error(
        `[METADATA][Background] Failed to update entry with conversion results:`,
        error
      );
      return savedEntry;
    }
  }

  // Process background updates for a specific title (used for immediate post-enrichment retries)
  async processBackgroundUpdatesForTitle(imdbId) {
    try {
      const title = await this.getTitle(imdbId);
      if (!title || title.metaSource === "complete") {
        return; // Nothing to do
      }

      // Processing immediate background update

      // Use retry logic to ensure complete enrichment
      const enrichedData = await this.fetcher.retryIncompleteEnrichment(
        title.imdb,
        title.type,
        title.metaSource,
        title
      );

      if (enrichedData) {
        // Save the enriched data
        const savedId = await this.saveTitle(enrichedData);
      }
    } catch (error) {
      console.warn(
        `[METADATA][Storage] Immediate background update failed for ${imdbId}:`,
        error
      );
    }
  }

  // ========================================
  // Helper Methods for processAndSaveTitleElement
  // ========================================

  async ensureDatabaseReady() {
    if (this.db) return; // Optimization: Avoid await if already ready
    if (!this.db) {
      console.warn(
        "[METADATA][Storage] Database not ready, waiting for initialization"
      );
      await this.init();
    }
  }

  async extractFromDOM(element, processor) {
    const processedData = await processor.processTitleElement(element);
    if (!processedData) return null;
    return processedData;
  }

  // ... (mergeNewIds is here, skipping)

  // ...

  async mergeProcessedData(existingEntry, processedData) {
    const { extractedIds } = processedData;

    // 1. Merge IDs first (preserving existing ones)
    const safeExtractedIds = { ...extractedIds };
    if (existingEntry.tmdb) delete safeExtractedIds.tmdb;
    if (existingEntry.tvdb) delete safeExtractedIds.tvdb;
    if (existingEntry.imdb) delete safeExtractedIds.imdb;

    // 2. Prepare data to merge: IDs + Generic Backfill from processedData
    // We want to fill ANY field from processedData that is MISSING in existingEntry.
    const backfillData = {};

    // Fields to exclude from direct backfill (handled separately or internal)
    const excludedKeys = [
      "extractedIds",
      "extractedTitle",
      "extractedType",
      "year",
    ];
    // Note: 'year' is core identity, usually don't want to change it, but maybe we should if missing?
    // Let's stick to rich metadata fields for now.

    for (const [key, value] of Object.entries(processedData)) {
      if (excludedKeys.includes(key)) continue;

      // If value exists in processedData AND is missing in existingEntry
      if (
        value !== undefined &&
        value !== null &&
        (existingEntry[key] === undefined || existingEntry[key] === null)
      ) {
        backfillData[key] = value;
      }
    }

    const dataToMerge = {
      ...safeExtractedIds,
      ...backfillData,
    };

    // 3. Perform the merge using helper (handles array merging for IDs/Genres)
    const mergedEntry = this._mergeEntryData(existingEntry, dataToMerge);

    // 4. Change Detection to minimize writes
    // Check ID changes
    const hasMalChange =
      (mergedEntry.mal?.length || 0) >
      (this.IdUtils.ensureArray(existingEntry.mal)?.length || 0);
    const hasAnilistChange =
      (mergedEntry.anilist?.length || 0) >
      (this.IdUtils.ensureArray(existingEntry.anilist)?.length || 0);
    const hasKitsuChange =
      (mergedEntry.kitsu?.length || 0) >
      (this.IdUtils.ensureArray(existingEntry.kitsu)?.length || 0);
    const hasTmdbChange = safeExtractedIds.tmdb && !existingEntry.tmdb;
    const hasTvdbChange = safeExtractedIds.tvdb && !existingEntry.tvdb;

    // Check Backfill changes
    const hasBackfillChange = Object.keys(backfillData).length > 0;

    if (
      hasMalChange ||
      hasAnilistChange ||
      hasKitsuChange ||
      hasTmdbChange ||
      hasTvdbChange ||
      hasBackfillChange
    ) {
      await this.db.titles.put(mergedEntry);
      // console.log(`[METADATA][Storage] Updated existing entry "${existingEntry.title}" with new data`);
      return mergedEntry;
    }

    return existingEntry;
  }

  async createEntryFromData(processedData) {
    const { extractedIds, extractedTitle, extractedType, year } = processedData;

    const newEntry = {
      // Core Identity
      title: extractedTitle,
      originalTitle: processedData.originalTitle, // Fix: Ensure originalTitle is saved (e.g. for dual-title search)
      type: extractedType,
      year: year,

      // IDs - Sanitize to String to avoid integer vs string issues (e.g. MAL ID from Jikan)
      mal: extractedIds.mal ? String(extractedIds.mal) : null,
      imdb: extractedIds.imdb ? String(extractedIds.imdb) : null,
      anilist: extractedIds.anilist ? String(extractedIds.anilist) : null,
      kitsu: extractedIds.kitsu ? String(extractedIds.kitsu) : null,
      tmdb: extractedIds.tmdb ? String(extractedIds.tmdb) : null,
      tvdb: extractedIds.tvdb ? String(extractedIds.tvdb) : null,

      // Rich Data (if provided)
      runtime: processedData.runtime,
      genres: processedData.genres,
      interests: processedData.interests,
      demographics: processedData.demographics,
      // Use unified ratings object format
      ratings: processedData.ratings || {},
      rankMal: processedData.rankMal,
      malUrl: processedData.malUrl,

      // Metadata State
      metaSource: processedData.metaSource || "dom", // Use provided source or default to 'dom'
      lastUpdated: Date.now(),
    };

    const savedEntry = await this.saveTitle(newEntry);
    if (!savedEntry) {
      console.warn(
        `[METADATA][Background] Failed to save new entry for "${newEntry.title}"`
      );
      return null;
    }

    return savedEntry;
  }

  async findOrCreateEntry(processedData) {
    const { extractedIds, extractedTitle, extractedType, year } = processedData;

    const existingByIds = await this.idLookup.findExistingTitle(
      extractedIds,
      extractedTitle,
      extractedType
    );

    if (existingByIds) {
      return await this.mergeProcessedData(existingByIds, processedData);
    } else {
      return await this.createEntryFromData(processedData);
    }
  }

  async enrichWithCrossReferenceIds(currentEntry) {
    const enrichedEntry = await this.idLookup.idConverter.enrichWithAllIds(
      currentEntry
    );
    if (enrichedEntry && enrichedEntry !== currentEntry) {
      // Ensure anime IDs are stored as arrays for consistency
      enrichedEntry.mal = this.IdUtils.ensureArray(enrichedEntry.mal);
      enrichedEntry.anilist = this.IdUtils.ensureArray(enrichedEntry.anilist);
      enrichedEntry.kitsu = this.IdUtils.ensureArray(enrichedEntry.kitsu);

      try {
        await this.db.titles.put(enrichedEntry);
        return enrichedEntry;
      } catch (error) {
        if (error.name === "ConstraintError") {
          console.log(
            `[METADATA] ConstraintError in enrichWithCrossReferenceIds - merging into existing entry`
          );

          // If the IMDb ID we found already exists, we must merge into THAT entry
          // and delete our current temporary entry
          if (enrichedEntry.imdb) {
            const existingEntry = await this.getTitle(enrichedEntry.imdb);
            if (existingEntry) {
              console.log(
                `[METADATA] Merging temp entry ${enrichedEntry.id} into existing ${existingEntry.id}`
              );

              const mergedEntry = this._mergeEntryData(
                existingEntry,
                enrichedEntry
              );

              if (enrichedEntry.id && enrichedEntry.id !== existingEntry.id) {
                await this.db.titles.delete(enrichedEntry.id);
              }

              await this.db.titles.put(mergedEntry);
              return mergedEntry;
            }
          }
        }
        // If not a constraint error or we couldn't resolve it, rethrow or return original
        console.warn(
          `[METADATA] Failed to save enriched entry in enrichWithCrossReferenceIds:`,
          error
        );
        return currentEntry;
      }
    }
    return currentEntry;
  }

  async resolveImdbId(currentEntry, processedData, priority = false) {
    const { extractedIds, extractedTitle, extractedType } = processedData;

    // If we already have an IMDb ID, no need to resolve
    if (currentEntry.imdb) return currentEntry;

    // 1. Try ID Conversion first
    let conversionResult = null;
    // Prioritize MAL > AniList > Kitsu
    const animeSource = extractedIds.mal
      ? "mal"
      : extractedIds.anilist
      ? "anilist"
      : extractedIds.kitsu
      ? "kitsu"
      : null;

    if (animeSource) {
      const idVal = extractedIds[animeSource];
      const animeId = Array.isArray(idVal) ? idVal[0] : idVal;
      try {
        conversionResult = await this.idLookup.idConverter.convertToImdb(
          animeId,
          animeSource
        );
      } catch (err) {
        console.warn(`[METADATA] Conversion failed in resolveImdbId:`, err);
      }
    }

    if (conversionResult && conversionResult.imdb) {
      // OPTIMIZATION: Check if this converted IMDb ID already exists in DB
      const existingByImdb = await this.getTitle(conversionResult.imdb);

      if (existingByImdb) {
        console.log(
          `[METADATA] Found existing entry via converted IMDb ID: ${conversionResult.imdb}`
        );

        // CRITICAL FIX: If we are switching to a different entry (merging temp into existing),
        // we MUST delete the temporary entry to prevent duplicates.
        if (currentEntry.id && currentEntry.id !== existingByImdb.id) {
          console.log(
            `[METADATA] Deleting temporary entry ${currentEntry.id} in favor of existing ${existingByImdb.id}`
          );
          await this.db.titles.delete(currentEntry.id);
        }

        // Merge our current known IDs into this existing entry
        // We use the DOM entry's IDs (extractedIds) + any from conversion
        const mergedEntry = this._mergeEntryData(existingByImdb, {
          ...extractedIds,
          ...conversionResult,
        });

        await this.db.titles.put(mergedEntry);
        return mergedEntry;
      }
    }

    // 2. If no existing entry found, proceed with standard resolution (which might include title search)
    const resolvedEntry = await this.idLookup.tryResolveImdbId(
      currentEntry,
      extractedIds,
      extractedTitle,
      extractedType,
      priority
    );

    const finalEntry = resolvedEntry || currentEntry;

    if (!finalEntry) {
      return currentEntry;
    }

    return finalEntry;
  }

  schedulePostEnrichmentRetry(imdbId) {
    setTimeout(async () => {
      try {
        await this.processBackgroundUpdatesForTitle(imdbId);
      } catch (error) {
        console.warn(
          `[METADATA] Post-enrichment retry failed for ${imdbId}:`,
          error
        );
      }
    }, 3000);
  }

  async enrichFromAPIs(finalEntry, processedData, priority) {
    const { extractedType } = processedData;

    if (!finalEntry.imdb) {
      return finalEntry;
    }

    // LAZY JIKAN ENRICHMENT (Side Effect)
    // Trigger this even if entry is 'complete', as it might be missing MAL ratings
    if (priority) {
      const metadataService = window.MetadataModules?.metadataService;
      if (metadataService?.triggerLazyJikan) {
        metadataService.triggerLazyJikan(finalEntry, priority);
      }
    }

    // Skip if already complete
    if (finalEntry.metaSource === "complete") {
      return finalEntry;
    }

    let enrichedData = await this.fetcher.retryIncompleteEnrichment(
      finalEntry.imdb,
      extractedType,
      finalEntry.metaSource || "dom",
      finalEntry,
      2,
      priority
    );

    if (enrichedData) {
      enrichedData = await this.saveTitle(enrichedData);
      console.log(
        `[METADATA] Successfully enriched: ${enrichedData.title} (${enrichedData.metaSource})`
      );

      // Schedule post-enrichment retry for IMDb-only entries
      if (enrichedData.metaSource === "imdbapi") {
        this.schedulePostEnrichmentRetry(enrichedData.imdb);
      }

      return enrichedData;
    }

    return finalEntry;
  }

  // ========================================
  // Main Processing Method (REFACTORED)
  // ========================================

  async processAndSaveTitleElement(element, processor, priority = false) {
    await this.ensureDatabaseReady();

    try {
      const processedData = await this.extractFromDOM(element, processor);
      if (!processedData) return null;

      return await this.processAndSaveData(processedData, priority);
    } catch (error) {
      console.error(`[METADATA][Storage] processAndSaveTitleElement failed:`, {
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
        fullError: error,
      });
      return null;
    }
  }

  /**
   * Core processing method - decoupled from DOM
   * Takes standardized data object and runs the full enrichment pipeline
   * @param {Object} processedData - Standardized data object
   * @param {boolean} priority - Whether to prioritize API calls
   */
  async processAndSaveData(processedData, priority = false) {
    await this.ensureDatabaseReady();

    // SANITIZATION: Ensure all IDs are strings to prevent conversion errors
    if (processedData?.extractedIds) {
      for (const key in processedData.extractedIds) {
        if (processedData.extractedIds[key]) {
          processedData.extractedIds[key] = String(
            processedData.extractedIds[key]
          );
        }
      }
    }

    try {
      let currentEntry = await this.findOrCreateEntry(processedData);
      if (!currentEntry) return null;

      currentEntry = await this.enrichWithCrossReferenceIds(currentEntry);

      const finalEntry = await this.resolveImdbId(
        currentEntry,
        processedData,
        priority
      );
      if (!finalEntry) return currentEntry;

      return await this.enrichFromAPIs(finalEntry, processedData, priority);
    } catch (error) {
      console.error(
        `[METADATA][Storage] processAndSaveData failed for "${processedData?.extractedTitle}":`,
        error
      );
      return null;
    }
  }

  async getStats() {
    try {
      const totalTitles = await this.db.titles.count();
      const staleThreshold =
        Date.now() -
        window.MetadataModules.config.METADATA_CONFIG.staleThreshold;
      const needRefresh = await this.db.titles
        .where("lastUpdated")
        .below(staleThreshold)
        .count();

      return {
        totalTitles,
        needRefresh,
      };
    } catch (error) {
      console.error(`[METADATA][Storage] Failed to get stats:`, error);
      return { totalTitles: 0, needRefresh: 0 };
    }
  }

  async clear() {
    try {
      await this.db.titles.clear();
      console.log("[METADATA][Storage] Database cleared");
    } catch (error) {
      console.error(`[METADATA][Storage] Failed to clear database:`, error);
    }
  }
}

// Export to global scope
window.MetadataModules = window.MetadataModules || {};
window.MetadataModules.metadataStorage = {
  MetadataStorage,
};
