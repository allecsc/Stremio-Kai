/**
 * Fetch Utilities Module
 * 
 * Shared utilities for API requests inspired by AIOStreams patterns.
 * Includes retry logic, timeout handling, and response validation.
 * 
 * @module fetch-utils
 */

(function() {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────────────
    // INITIALIZATION GUARD
    // ─────────────────────────────────────────────────────────────────────────────
    if (window.MetadataModules?.fetchUtils?.initialized) {
        console.log('[Fetch Utils] Already initialized, skipping.');
        return;
    }

    window.MetadataModules = window.MetadataModules || {};

    // ─────────────────────────────────────────────────────────────────────────────
    // DEFAULT CONFIGURATION
    // ─────────────────────────────────────────────────────────────────────────────
    const DEFAULT_TIMEOUT = 5000;
    const DEFAULT_RETRIES = 1;

    // ─────────────────────────────────────────────────────────────────────────────
    // RETRY UTILITY
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Retry an async operation with configurable attempts
     * Inspired by AIOStreams' withRetry utility
     * 
     * @param {Function} operation - Async function to retry
     * @param {Object} options - Configuration options
     * @param {number} [options.retries=1] - Number of retry attempts (not including initial)
     * @param {Function} [options.shouldRetry] - Function to determine if error should trigger retry
     * @param {Function} [options.getContext] - Function to get context for logging
     * @param {number} [options.retryDelay=1000] - Delay between retries in ms
     * @returns {Promise<*>} Result of the operation
     * @throws {Error} The last error if all retries fail
     */
    async function withRetry(operation, options = {}) {
        const {
            retries = DEFAULT_RETRIES,
            shouldRetry = () => true,
            getContext = () => '',
            retryDelay = 1000
        } = options;

        const maxAttempts = retries + 1;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                return await operation();
            } catch (error) {
                const isLastAttempt = attempt === maxAttempts - 1;
                const shouldTryAgain = !isLastAttempt && shouldRetry(error);
                const context = getContext() ? ` for ${getContext()}` : '';

                if (shouldTryAgain) {
                    console.warn(
                        `[Fetch Utils] Operation failed${context}: ${error.message}. ` +
                        `Retrying in ${retryDelay}ms (${maxAttempts - attempt - 1} attempts left).`
                    );
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                } else {
                    if (isLastAttempt) {
                        console.warn(`[Fetch Utils] Operation failed${context}: ${error.message}. All retries exhausted.`);
                    } else {
                        console.warn(`[Fetch Utils] Operation failed${context}: ${error.message}. Not retrying.`);
                    }
                    throw error;
                }
            }
        }

        // Should never reach here
        throw new Error('Unexpected state in retry logic');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // TIMEOUT UTILITY
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Execute an async operation with timeout and fallback
     * Inspired by AIOStreams' withTimeout utility
     * 
     * @param {Function} operation - Async function to execute
     * @param {*} fallback - Value to return on timeout or error
     * @param {Object} options - Configuration options
     * @param {number} [options.timeout=5000] - Timeout in milliseconds
     * @param {Function} [options.getContext] - Function to get context for logging
     * @param {Function} [options.shouldProceed] - Precondition check
     * @returns {Promise<*>} Result of operation or fallback value
     */
    async function withTimeout(operation, fallback, options = {}) {
        const {
            timeout = DEFAULT_TIMEOUT,
            getContext = () => '',
            shouldProceed
        } = options;

        // Check precondition
        if (shouldProceed && !shouldProceed()) {
            const context = getContext() ? ` for ${getContext()}` : '';
            console.debug(`[Fetch Utils] Operation skipped${context}: Precondition check failed.`);
            return fallback;
        }

        try {
            // Create timeout promise
            const timeoutPromise = new Promise((_, reject) => {
                const id = setTimeout(() => {
                    clearTimeout(id);
                    reject(new Error(`Operation timed out after ${timeout}ms`));
                }, timeout);
            });

            // Race the operation against the timeout
            return await Promise.race([operation(), timeoutPromise]);
        } catch (error) {
            const context = getContext() ? ` for ${getContext()}` : '';
            console.warn(`[Fetch Utils] Operation failed${context}: ${error.message}. Using fallback.`);
            return fallback;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // RESPONSE VALIDATION
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Simple response shape validator
     * Validates that data has expected fields with correct types
     * 
     * @param {Object} data - Response data to validate
     * @param {Object} shape - Expected shape as { field: 'type' | ['type1', 'type2'] }
     * @returns {{ valid: boolean, errors: string[] }}
     * 
     * @example
     * validateShape(data, {
     *   id: 'number',
     *   name: 'string',
     *   items: 'array',
     *   meta: ['object', 'undefined']
     * });
     */
    function validateShape(data, shape) {
        const errors = [];

        if (data === null || data === undefined) {
            return { valid: false, errors: ['Data is null or undefined'] };
        }

        for (const [field, expectedType] of Object.entries(shape)) {
            const value = data[field];
            const actualType = Array.isArray(value) ? 'array' : typeof value;
            
            // Handle multiple allowed types
            const allowedTypes = Array.isArray(expectedType) ? expectedType : [expectedType];
            
            if (!allowedTypes.includes(actualType)) {
                // Skip if field is optional (undefined is allowed)
                if (allowedTypes.includes('undefined') && value === undefined) {
                    continue;
                }
                // Skip if field is nullable (null is allowed as object)
                if (allowedTypes.includes('null') && value === null) {
                    continue;
                }
                
                errors.push(`Field '${field}' expected ${allowedTypes.join(' or ')}, got ${actualType}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // HTTP REQUEST UTILITY
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Make an HTTP request with timeout and error handling
     * 
     * @param {string} url - URL to request
     * @param {Object} options - Fetch options plus custom options
     * @param {number} [options.timeout=5000] - Request timeout in ms
     * @param {boolean} [options.parseJson=true] - Whether to parse response as JSON
     * @returns {Promise<{ ok: boolean, status: number, data?: any, error?: string }>}
     */
    async function makeRequest(url, options = {}) {
        const {
            timeout = DEFAULT_TIMEOUT,
            parseJson = true,
            ...fetchOptions
        } = options;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(url, {
                ...fetchOptions,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const result = {
                ok: response.ok,
                status: response.status
            };

            if (!response.ok) {
                result.error = `HTTP ${response.status}: ${response.statusText}`;
                return result;
            }

            if (parseJson) {
                try {
                    result.data = await response.json();
                } catch (jsonError) {
                    result.ok = false;
                    result.error = 'Failed to parse JSON response';
                }
            } else {
                result.data = await response.text();
            }

            return result;
        } catch (error) {
            if (error.name === 'AbortError') {
                return {
                    ok: false,
                    status: 0,
                    error: `Request timed out after ${timeout}ms`
                };
            }

            return {
                ok: false,
                status: 0,
                error: error.message || 'Network error'
            };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // RATE LIMIT DETECTION
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Check if response indicates rate limiting
     * @param {Response|Object} response - Fetch response or result object
     * @returns {boolean}
     */
    function isRateLimitResponse(response) {
        const status = response.status;
        return status === 429 || status === 420;
    }

    /**
     * Check if error indicates rate limiting
     * @param {Error} error - Error object
     * @returns {boolean}
     */
    function isRateLimitError(error) {
        return error.message?.includes('429') || 
               error.message?.includes('rate limit') ||
               error.message?.includes('too many requests');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // PARALLEL EXECUTION
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Execute multiple promises in parallel with graceful degradation
     * Returns results with status for each promise
     * 
     * @param {Object} operations - Named object of promises or functions returning promises
     * @returns {Promise<Object>} Object with same keys, values are { ok: boolean, data?: any, error?: string }
     * 
     * @example
     * const results = await executeParallel({
     *   tmdb: () => fetchTMDB(id),
     *   mdblist: () => fetchMDBList(id)
     * });
     * // results.tmdb.ok, results.tmdb.data, etc.
     */
    async function executeParallel(operations) {
        const entries = Object.entries(operations);
        
        const promises = entries.map(async ([key, operation]) => {
            try {
                const fn = typeof operation === 'function' ? operation : () => operation;
                const data = await fn();
                return { key, ok: true, data };
            } catch (error) {
                return { key, ok: false, error: error.message };
            }
        });

        const settled = await Promise.all(promises);
        
        return Object.fromEntries(
            settled.map(result => [result.key, { ok: result.ok, data: result.data, error: result.error }])
        );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────────────────────────────────────
    window.MetadataModules.fetchUtils = {
        initialized: true,

        // Core utilities
        withRetry,
        withTimeout,
        
        // Validation
        validateShape,
        
        // HTTP
        makeRequest,
        
        // Rate limit helpers
        isRateLimitResponse,
        isRateLimitError,
        
        // Parallel execution
        executeParallel,

        // Constants
        DEFAULT_TIMEOUT,
        DEFAULT_RETRIES
    };

    console.log('[Fetch Utils] Module initialized.');
})();
