/**
 * @name Metadata Helper - ID Lookup Module
 * @description Service for finding titles by any ID type with cross-referencing
 */

// ID Lookup Service - orchestrates finding titles by any ID with fallbacks
class IdLookupService {
    constructor(idConverter, titleSearcher) {
        this.idConverter = idConverter;
        this.titleSearcher = titleSearcher;
        // Cache IdUtils
        this.IdUtils = window.MetadataModules.idUtils.IdUtils;
    }

    setStorage(storage) {
        this.storage = storage;
    }

    /**
     * Triggers background enrichment for incomplete metadata entries
     * @private
     */
    _triggerBackgroundEnrichment(entry) {
        if (entry.metaSource === 'complete') return;
        
        setTimeout(() => {
            this.storage.fetcher.enrichTitleProgressively(entry.imdb, entry.type, entry.metaSource, entry)
                .then(enrichedData => {
                    if (enrichedData) {
                        this.storage.saveTitle(enrichedData);
                    }
                })
                .catch(error => {
                    console.warn(`[METADATA][Background Enrichment] ❌ Enrichment failed for ${entry.imdb}:`, error);
                });
        }, window.MetadataModules.config.METADATA_CONFIG.enrichmentTriggerDelay);
    }

    /**
     * Performs a fast local-only DB lookup without conversion or network calls
     * @private
     */
    async _checkLocalDbOnly(id, idSource) {
        try {
            if (idSource === 'imdb') {
                return await this.storage.getTitle(id);
            } else if (idSource === 'tmdb') {
                return await this.storage.db.titles.where('tmdb').equals(id).first();
            } else if (idSource === 'tvdb') {
                return await this.storage.db.titles.where('tvdb').equals(id).first();
            } else if (idSource === 'mal') {
                return await this.storage.db.titles.where('mal').equals(id).first();
            } else if (idSource === 'anilist') {
                return await this.storage.db.titles.where('anilist').equals(id).first();
            } else if (idSource === 'kitsu') {
                return await this.storage.db.titles.where('kitsu').equals(id).first();
            }
            return null;
        } catch (error) {
            console.warn(`[METADATA][ID Lookup] Local DB check failed for ${idSource}:${id}:`, error);
            return null;
        }
    }

    async findByAnyId(id, idSource, context = {}) {
        try {
            // Direct IMDb lookup (most common)
            if (idSource === 'imdb') {
                const cachedEntry = await this.storage.getTitle(id);
                if (cachedEntry) {
                    this._triggerBackgroundEnrichment(cachedEntry);
                    return cachedEntry;
                }
            }

            // Universal cross-reference lookup for any stored ID
            let crossRefEntry = null;
            if (idSource === 'tmdb') {
                crossRefEntry = await this.storage.db.titles.where('tmdb').equals(id).first();
            } else if (idSource === 'tvdb') {
                crossRefEntry = await this.storage.db.titles.where('tvdb').equals(id).first();
            } else if (idSource === 'mal') {
                crossRefEntry = await this.storage.db.titles.where('mal').equals(id).first();
            } else if (idSource === 'anilist') {
                crossRefEntry = await this.storage.db.titles.where('anilist').equals(id).first();
            } else if (idSource === 'kitsu') {
                crossRefEntry = await this.storage.db.titles.where('kitsu').equals(id).first();
            }
            if (crossRefEntry) return crossRefEntry;

            // Try ID conversion for anime sources
            if (this.idConverter.isAnimeSource(idSource)) {
                const conversionResult = await this.idConverter.convertToImdb(id, idSource);
                if (conversionResult?.imdb) {
                    const convertedEntry = await this.storage.getTitle(conversionResult.imdb);
                    if (convertedEntry) {
                        // Merge ALL conversion IDs into existing entry immediately to avoid duplicate API calls
                        // Use IdUtils to correctly merge arrays (Fixes bug where new IDs were ignored)
                        const updatedEntry = {
                            ...convertedEntry,
                            mal: this.IdUtils.mergeIdArrays(convertedEntry.mal, conversionResult.mal),
                            anilist: this.IdUtils.mergeIdArrays(convertedEntry.anilist, conversionResult.anilist),
                            kitsu: this.IdUtils.mergeIdArrays(convertedEntry.kitsu, conversionResult.kitsu),
                            tmdb: convertedEntry.tmdb || conversionResult.tmdb,
                            tvdb: convertedEntry.tvdb || conversionResult.tvdb,
                            lastUpdated: Date.now()
                        };

                        // Check if any IDs were added
                        const hasNewIds = (conversionResult.mal && !convertedEntry.mal) ||
                                          (conversionResult.anilist && !convertedEntry.anilist) ||
                                          (conversionResult.kitsu && !convertedEntry.kitsu) ||
                                          (conversionResult.tmdb && !convertedEntry.tmdb) ||
                                          (conversionResult.tvdb && !convertedEntry.tvdb);

                        if (hasNewIds) {
                            await this.storage.db.titles.put(updatedEntry);
                        }

                        return updatedEntry; // Return updated entry with all IDs
                    }
                }
            }

            // Last resort: IMDB search fallback using stored DOM context
            if (context.title) {
                try {
                    const foundId = await this.titleSearcher.searchImdbForId(context.title, context.type);
                    if (foundId) {
                        return await this.storage.getTitle(foundId);
                    }
                } catch (error) {
                    console.warn(`[Fallback] IMDB search failed for "${context.title}"`);
                }
            }

            return null;
        } catch (error) {
            console.warn(`[METADATA][ID Lookup] findByAnyId failed for ${idSource}:${id}:`, error);
            return null;
        }
    }

    async findExistingTitle(extractedIds, extractedTitle, extractedType) {
        try {
            // Phase 1: Fast parallel local DB checks for all IDs
            const lookupPromises = Object.entries(extractedIds)
                .filter(([_, id]) => id)
                .map(([source, id]) => this._checkLocalDbOnly(id, source));
            
            const localResults = await Promise.all(lookupPromises);
            const foundLocal = localResults.find(result => result !== null);
            if (foundLocal) {
                return foundLocal;
            }

            // Phase 2: Check for type+title match (compound index) - only if we have both type and title
            if (extractedType && extractedTitle) {
                const titleMatch = await this.storage.db.titles
                    .where('[type+title]')
                    .equals([extractedType, extractedTitle])
                    .first();

                if (titleMatch) {
                    return titleMatch;
                }
            }

            // Phase 3: If no local match, try conversion for anime sources (slow path)
            for (const [source, id] of Object.entries(extractedIds)) {
                if (id && this.idConverter.isAnimeSource(source)) {
                    const conversionResult = await this.idConverter.convertToImdb(id, source);
                    if (conversionResult?.imdb) {
                        const convertedEntry = await this.storage.getTitle(conversionResult.imdb);
                        if (convertedEntry) {
                            // Merge conversion results using IdUtils
                            const updatedEntry = {
                                ...convertedEntry,
                                mal: this.IdUtils.mergeIdArrays(convertedEntry.mal, conversionResult.mal),
                                anilist: this.IdUtils.mergeIdArrays(convertedEntry.anilist, conversionResult.anilist),
                                kitsu: this.IdUtils.mergeIdArrays(convertedEntry.kitsu, conversionResult.kitsu),
                                tmdb: convertedEntry.tmdb || conversionResult.tmdb,
                                tvdb: convertedEntry.tvdb || conversionResult.tvdb,
                                lastUpdated: Date.now()
                            };

                            const hasNewIds = (conversionResult.mal && !convertedEntry.mal) ||
                                              (conversionResult.anilist && !convertedEntry.anilist) ||
                                              (conversionResult.kitsu && !convertedEntry.kitsu) ||
                                              (conversionResult.tmdb && !convertedEntry.tmdb) ||
                                              (conversionResult.tvdb && !convertedEntry.tvdb);

                            if (hasNewIds) {
                                await this.storage.db.titles.put(updatedEntry);
                            }

                            return updatedEntry;
                        }
                    }
                }
            }

            // Step 4: No existing entry found - return null to indicate new entry
            return null;
        } catch (error) {
            console.warn(`[METADATA][ID Lookup] findExistingTitle failed for "${extractedTitle}":`, error);
            return null;
        }
    }

    async tryResolveImdbId(savedEntry, extractedIds, extractedTitle, extractedType, priority = false) {
        // If we already have a real IMDb ID, skip resolution
        if (savedEntry.imdb && savedEntry.imdb.startsWith('tt')) {
            return null;
        }

        let conversionResult = null;

        // Method 1: Convert anime IDs to IMDb
        if (extractedIds.mal || extractedIds.anilist || extractedIds.kitsu) {
            const animeSource = extractedIds.mal ? 'mal' : extractedIds.anilist ? 'anilist' : 'kitsu';
            const animeId = extractedIds.mal || extractedIds.anilist || extractedIds.kitsu;

            try {
                conversionResult = await this.idConverter.convertToImdb(animeId, animeSource);

                if (conversionResult?.imdb) {
                    return await this.storage.updateEntryWithConversionResults(savedEntry, conversionResult, extractedIds);
                } else if (conversionResult) {
                    // Conversion succeeded but returned no IMDb ID (common for specific seasons)
                    // Save the IDs we got, but continue to Method 2 (Title Search) to find the parent IMDb ID
                    console.log(`[METADATA] Conversion found IDs but no IMDb for "${extractedTitle}" - trying title search fallback`);
                    
                    // Update entry with conversion results first so we don't lose them
                    savedEntry = await this.storage.updateEntryWithConversionResults(savedEntry, conversionResult, extractedIds);
                }
            } catch (error) {
                console.warn(`[METADATA] ID conversion failed for ${animeSource}:${animeId}:`, error);
            }
        }

        // Method 2: Title search fallback
        try {
            // Use originalTitle as alternate search term (4th argument)
            const foundImdbId = await this.titleSearcher.searchImdbForId(
                extractedTitle, 
                savedEntry.year, // Fix: Pass year as 2nd arg (previously passed type)
                priority, 
                savedEntry.originalTitle
            );

            if (foundImdbId) {
                // Get current entry from DB (which may have conversion results from above)
                const currentEntry = await this.storage.db.titles.get(savedEntry.id);
                
                // Merge found IMDb ID with existing data
                const updatedEntry = {
                    ...currentEntry,
                    imdb: foundImdbId,
                    lastUpdated: Date.now()
                };
                
                return await this.storage.saveTitle(updatedEntry);
            }
        } catch (error) {
            console.warn(`[METADATA] Title search failed for "${extractedTitle}":`, error);
        }

        return null;
    }
}

// Export to global scope
window.MetadataModules = window.MetadataModules || {};
window.MetadataModules.idLookup = {
    IdLookupService
};