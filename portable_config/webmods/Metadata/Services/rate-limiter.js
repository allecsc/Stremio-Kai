/**
 * @name Metadata Helper - Rate Limiter Module
 * @description Queue-based API rate limiting service for IMDb, Haglund, Cinemeta, and IMDb Scraper APIs.
 * Uses configuration-driven approach to eliminate code duplication.
 * 
 * @example
 * const limiter = new GlobalRateLimiter();
 * const data = await limiter.makeImdbRequest('https://api.imdbapi.dev/title/tt1234567');
 * const searchData = await limiter.makeImdbScraperRequest('https://imdb.iamidiotareyoutoo.com/search?q=Matrix');
 */

class GlobalRateLimiter {
    /**
     * Creates a new GlobalRateLimiter instance
     * Initializes API configurations and starts queue processors
     */
    constructor() {
        // API configurations - single source of truth
        this.apis = {
            imdb: {
                queue: [],
                processing: false,
                lastRequest: 0,
                interval: 200,          // 5 req/sec
                useTimestamp: true      // Dual-layer protection
            },
            haglund: {
                queue: [],
                processing: false,
                interval: 500           // 2 req/sec
            },
            cinemeta: {
                queue: [],
                processing: false,
                interval: 50            // 20 req/sec
            },
            imdbScraper: {
                queue: [],
                processing: false,
                lastRequest: 0,
                interval: 100,          // 10 req/sec
                useTimestamp: true,
                dailyLimit: 500,
                dailyCount: 0,
                dailyResetTime: this.getNextMidnight()
            },
            jikan: {
                queue: [],
                processing: false,
                lastRequest: 0,
                interval: 1000,          // 1 req/sec
                useTimestamp: true
            }
        };

        // Start queue processors for each API
        Object.keys(this.apis).forEach(apiName => {
            const config = this.apis[apiName];
            setInterval(() => this.processQueue(apiName), config.interval);
        });
    }

    // ==========================================
    // PUBLIC API METHODS (backwards compatible)
    // ==========================================

    /**
     * Enqueues an IMDb API request with rate limiting (5 requests/second)
     * @param {string} url - Full API URL to request
     * @param {RequestInit} [options={}] - Fetch options (headers, method, body, etc)
     * @param {boolean} [priority=false] - If true, adds to front of queue for immediate processing
     * @returns {Promise<any>} Resolves with parsed JSON response
     * @throws {Error} 'Rate limited' (429), 'Timeout', or other HTTP/network errors
     */
    async makeImdbRequest(url, options = {}, priority = false) {
        return this.makeRequest('imdb', url, options, priority);
    }

    /**
     * Enqueues a Haglund.dev API request with rate limiting (2 requests/second)
     * @param {string} url - Full API URL to request
     * @param {RequestInit} [options={}] - Fetch options (headers, method, body, etc)
     * @param {boolean} [priority=false] - If true, adds to front of queue for immediate processing
     * @returns {Promise<any>} Resolves with parsed JSON response
     * @throws {Error} 'Rate limited' (429), 'Timeout', or other HTTP/network errors
     */
    async makeHaglundRequest(url, options = {}, priority = false) {
        return this.makeRequest('haglund', url, options, priority);
    }

    /**
     * Enqueues a Cinemeta API request (no documented rate limit, 20 requests/second conservative)
     * @param {string} url - Full API URL to request
     * @param {RequestInit} [options={}] - Fetch options (headers, method, body, etc)
     * @param {boolean} [priority=false] - If true, adds to front of queue for immediate processing
     * @returns {Promise<any>} Resolves with parsed JSON response
     * @throws {Error} 'Rate limited' (429), 'Timeout', or other HTTP/network errors
     */
    async makeCinemetaRequest(url, options = {}, priority = false) {
        return this.makeRequest('cinemeta', url, options, priority);
    }

    /**
     * Enqueues an IMDb Scraper API request with rate limiting (10 requests/second, 500/day max)
     * @param {string} url - Full API URL to request
     * @param {RequestInit} [options={}] - Fetch options (headers, method, body, etc)
     * @param {boolean} [priority=false] - If true, adds to front of queue for immediate processing
     * @returns {Promise<any>} Resolves with parsed JSON response
     * @throws {Error} 'Daily limit exceeded', 'Rate limited' (429), 'Timeout', or other HTTP/network errors
     */
    async makeImdbScraperRequest(url, options = {}, priority = false) {
        return this.makeRequest('imdbScraper', url, options, priority);
    }

    /**
     * Enqueues a Jikan API request with rate limiting (2 requests/second)
     * @param {string} url - Full API URL to request
     * @param {RequestInit} [options={}] - Fetch options
     * @param {boolean} [priority=false] - Priority flag
     * @returns {Promise<any>} Resolves with parsed JSON response
     */
    async makeJikanRequest(url, options = {}, priority = false) {
        return this.makeRequest('jikan', url, options, priority);
    }

    // ==========================================
    // CORE QUEUE LOGIC (DRY implementation)
    // ==========================================

    /**
     * Generic request enqueuing method
     * @private
     * @param {string} apiName - Name of API (imdb, haglund, cinemeta, imdbScraper)
     * @param {string} url - Full API URL to request
     * @param {RequestInit} options - Fetch options
     * @param {boolean} priority - Priority flag
     * @returns {Promise<any>} Resolves with parsed JSON response
     */
    async makeRequest(apiName, url, options = {}, priority = false) {
        const config = this.apis[apiName];

        // Check daily limit if applicable
        if (config.dailyLimit) {
            this.resetDailyCountIfNeeded(apiName);
            
            if (config.dailyCount >= config.dailyLimit) {
                this.log('warn', `${apiName} daily limit exceeded (${config.dailyLimit}/day)`, { 
                    count: config.dailyCount,
                    resetTime: new Date(config.dailyResetTime).toISOString()
                });
                return Promise.reject(new Error('Daily limit exceeded'));
            }
        }

        return new Promise((resolve, reject) => {
            const request = { url, options, resolve, reject };
            if (priority) {
                config.queue.unshift(request); // Add to front for priority
            } else {
                config.queue.push(request); // Add to back for regular
            }
        });
    }

    /**
     * Generic queue processor
     * @private
     * @param {string} apiName - Name of API to process
     */
    async processQueue(apiName) {
        const config = this.apis[apiName];

        if (config.queue.length === 0 || config.processing) {
            return; // Early exit
        }

        // Check daily limit if applicable
        if (config.dailyLimit) {
            this.resetDailyCountIfNeeded(apiName);
            if (config.dailyCount >= config.dailyLimit) {
                return; // Don't process, wait for reset
            }
        }

        // Timestamp validation for dual-layer protection
        if (config.useTimestamp) {
            const now = Date.now();
            const timeSinceLastRequest = now - config.lastRequest;
            
            if (timeSinceLastRequest < config.interval) {
                return; // Too soon, skip this cycle
            }
            
            config.processing = true;
            config.lastRequest = now;
            
            // Increment daily counter if applicable
            if (config.dailyLimit) {
                config.dailyCount++;
            }
        } else {
            // Interval-only protection
            config.processing = true;
        }

        try {
            const request = config.queue.shift();
            await this.executeRequest(request);
        } finally {
            config.processing = false;
        }
    }

    // ==========================================
    // DAILY LIMIT HELPERS
    // ==========================================

    /**
     * Gets the timestamp for next midnight (daily reset)
     * @private
     * @returns {number} Timestamp for next midnight
     */
    getNextMidnight() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return tomorrow.getTime();
    }

    /**
     * Resets daily counter if past midnight
     * @private
     * @param {string} apiName - Name of API
     */
    resetDailyCountIfNeeded(apiName) {
        const config = this.apis[apiName];
        if (!config.dailyLimit) return;

        const now = Date.now();
        if (now >= config.dailyResetTime) {
            config.dailyCount = 0;
            config.dailyResetTime = this.getNextMidnight();
            this.log('info', `${apiName} daily counter reset`);
        }
    }

    // ==========================================
    // REQUEST EXECUTION
    // ==========================================

    /**
     * Executes a single HTTP request with timeout protection
     * @param {Object} request - Request object from queue
     * @param {string} request.url - URL to fetch
     * @param {RequestInit} request.options - Fetch options
     * @param {Function} request.resolve - Promise resolve function
     * @param {Function} request.reject - Promise reject function
     * @private
     */
    async executeRequest({ url, options, resolve, reject }) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), window.MetadataModules.config.METADATA_CONFIG.timeout);

            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 429) {
                    this.log('error', '429 Rate Limited', { url });
                    reject(new Error('Rate limited'));
                    return;
                }
                this.log('error', `HTTP ${response.status}`, { url });
                reject(new Error(`HTTP ${response.status}`));
                return;
            }

            const data = await response.json();
            resolve(data);
        } catch (error) {
            if (error.name === 'AbortError') {
                this.log('warn', 'Request Timeout', { url, timeout: window.MetadataModules.config.METADATA_CONFIG.timeout });
                reject(new Error('Timeout'));
            } else {
                this.log('error', 'Request Failed', { url, error: error.message });
                reject(error);
            }
        }
    }

    /**
     * Consistent logging helper with severity levels
     * @param {string} level - Log level: 'error', 'warn', 'info', 'debug'
     * @param {string} message - Log message
     * @param {Object} [context={}] - Additional context data
     * @private
     */
    log(level, message, context = {}) {
        const prefix = '[Rate Limiter]';
        const contextStr = Object.keys(context).length > 0 ? JSON.stringify(context) : '';
        const fullMessage = contextStr ? `${prefix} ${message}: ${contextStr}` : `${prefix} ${message}`;

        switch (level) {
            case 'error':
                console.error(fullMessage);
                break;
            case 'warn':
                console.warn(fullMessage);
                break;
            case 'info':
                console.info(fullMessage);
                break;
            case 'debug':
                console.debug(fullMessage);
                break;
            default:
                console.log(fullMessage);
        }
    }
}

// Export to global scope
window.MetadataModules = window.MetadataModules || {};
window.MetadataModules.rateLimiter = {
    GlobalRateLimiter
};