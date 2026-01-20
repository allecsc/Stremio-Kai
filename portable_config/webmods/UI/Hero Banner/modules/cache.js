// Ensure namespace exists
window.HeroPlugin = window.HeroPlugin || {};

/**
 * Manages caching for Hero Banner data.
 * Supports a two-level cache: In-Memory (fast) and LocalStorage (persistent).
 * Implements a daily expiration strategy.
 */
class CacheManager {
    constructor() {
        this.memoryCache = new Map();
    }
    
    // ==========================================
    // CORE METHODS
    // ==========================================

    /**
     * Returns today's date as a string for cache validation.
     * @returns {string} Today's date in string format
     */
    getTodayString() {
        return new Date().toDateString();
    }

    /**
     * Generic save method.
     * @param {string} cacheKey - Storage key for data
     * @param {string} timestampKey - Storage key for timestamp
     * @param {any} data - Data to store
     * @returns {boolean} Success status
     */
    save(cacheKey, timestampKey, data) {
        try {
            // Level 1: Memory
            this.memoryCache.set(cacheKey, data);
            
            // Level 2: Storage
            localStorage.setItem(cacheKey, JSON.stringify(data));
            localStorage.setItem(timestampKey, this.getTodayString());
            return true;
        } catch (error) {
            console.warn(`[HeroCache] Failed to save ${cacheKey}:`, error);
            return false;
        }
    }
    
    /**
     * Generic load method.
     * CRITICAL: Always returns cached data if it exists, regardless of age.
     * Use isCacheValid() separately to check if refresh is needed.
     * @param {string} cacheKey - Storage key for data
     * @param {string} timestampKey - Storage key for timestamp
     * @returns {any|null} Cached data or null if missing (never null for stale)
     */
    load(cacheKey, timestampKey) {
        // Level 1: Memory
        if (this.memoryCache.has(cacheKey)) {
            return this.memoryCache.get(cacheKey);
        }

        // Level 2: Storage
        try {
            const cached = localStorage.getItem(cacheKey);
            const timestamp = localStorage.getItem(timestampKey);
            
            if (cached && timestamp) {
                const data = JSON.parse(cached);
                
                // Always hydrate memory cache
                this.memoryCache.set(cacheKey, data);
                
                // Log staleness for debugging, but still return data
                const isToday = timestamp === this.getTodayString();
                if (!isToday) {
                    console.log(`[HeroCache] Returning stale cache for ${cacheKey} (timestamp: ${timestamp})`);
                }
                
                return data;
            }
        } catch (error) {
            console.warn(`[HeroCache] Failed to load ${cacheKey}:`, error);
        }
        
        // Only return null if cache doesn't exist at all
        return null;
    }
    
    /**
     * Checks if the cache for a given key is valid (from today).
     * @param {string} timestampKey - Storage key for timestamp
     * @returns {boolean} True if valid
     */
    isValid(timestampKey) {
        try {
            const timestamp = localStorage.getItem(timestampKey);
            return timestamp === this.getTodayString();
        } catch (error) {
            console.warn(`[HeroCache] Failed to check validity for ${timestampKey}:`, error);
            return false;
        }
    }
    
    /**
     * Clears all in-memory cached data.
     * Note: Does not clear localStorage, only the memory cache.
     */
    clearAll() {
        this.memoryCache.clear();
        console.log('[HeroCache] Memory cache cleared');
    }

    // ==========================================
    // SPECIFIC HELPERS (Refactored from Utils)
    // ==========================================

    /** Saves movie catalog to cache. */
    saveMovieCache(titles) {
        const C = window.HeroPlugin.Config;
        return this.save(C.MOVIE_CACHE_KEY, C.GLOBAL_CACHE_TIMESTAMP_KEY, titles);
    }

    /** Loads movie catalog from cache. */
    loadMovieCache() {
        const C = window.HeroPlugin.Config;
        return this.load(C.MOVIE_CACHE_KEY, C.GLOBAL_CACHE_TIMESTAMP_KEY);
    }

    /** Saves anime catalog to cache. */
    saveAnimeCache(data) {
        const C = window.HeroPlugin.Config;
        return this.save(C.ANIME_CACHE_KEY, C.GLOBAL_CACHE_TIMESTAMP_KEY, data);
    }
    
    /** Loads anime catalog from cache. */
    loadAnimeCache() {
        const C = window.HeroPlugin.Config;
        return this.load(C.ANIME_CACHE_KEY, C.GLOBAL_CACHE_TIMESTAMP_KEY);
    }
    
    /** Checks if global cache timestamp is from today. */
    isCacheValid() {
        const C = window.HeroPlugin.Config;
        return this.isValid(C.GLOBAL_CACHE_TIMESTAMP_KEY);
    }
}

// Expose Single Instance
window.HeroPlugin.Cache = new CacheManager();
