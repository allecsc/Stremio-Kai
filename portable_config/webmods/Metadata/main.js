/**
 * @name Metadata Helper - Main Module
 * @description Service initialization and API exports with Lifecycle Management
 */

class PersistentCore {
    constructor() {
        console.log('[METADATA] Initializing Persistent Core...');
        
        // Initialize services that should persist for the app's lifetime
        this.rateLimiter = new window.MetadataModules.rateLimiter.GlobalRateLimiter();
        this.metadataFetcher = new window.MetadataModules.metadataFetcher.MetadataFetcher(this.rateLimiter);
        this.idConverter = new window.MetadataModules.idConversion.IdConversionService(this.rateLimiter);
        this.titleSearcher = new window.MetadataModules.titleSearch.TitleSearchService(this.rateLimiter);
        this.idLookup = new window.MetadataModules.idLookup.IdLookupService(this.idConverter, this.titleSearcher);
        this.metadataStorage = new window.MetadataModules.metadataStorage.MetadataStorage(
            this.metadataFetcher, 
            this.idConverter, 
            this.titleSearcher, 
            this.idLookup
        );

        // Link services
        this.idLookup.setStorage(this.metadataStorage);
    }
}

class TransientUI {
    constructor(core) {
        console.log('[METADATA] Initializing Transient UI...');
        this.core = core;
        this.domProcessor = new window.MetadataModules.domProcessor.DOMTitleProcessor(core.metadataStorage);
        this.hoverPopup = new window.MetadataModules.hoverPopup.MetadataHoverPopupService(
            this.domProcessor,
            core.metadataStorage,
            core.idLookup
        );
    }

    destroy() {
        console.log('[METADATA] Destroying Transient UI...');
        if (this.domProcessor && this.domProcessor.disconnect) {
            this.domProcessor.disconnect();
        }
        this.domProcessor = null;

        if (this.hoverPopup && this.hoverPopup.destroy) {
            this.hoverPopup.destroy();
        }
        this.hoverPopup = null;
    }
}

class MetadataManager {
    constructor() {
        this.core = null;
        this.ui = null;
        this.init();
    }

    init() {
        // 1. Initialize Core (Once)
        if (!this.core) {
            this.core = new PersistentCore();
        }

        // 2. Initialize UI (Transient)
        // We wait for the app to be fully loaded (routes container) to avoid attaching observers too early
        this.waitForApp().then(() => {
            this.startUI();
        });
    }

    startUI() {
        if (this.ui) {
            this.ui.destroy();
        }
        this.ui = new TransientUI(this.core);
        this.exposeGlobalAPI();
    }

    stopUI() {
        if (this.ui) {
            this.ui.destroy();
            this.ui = null;
        }
    }

    waitForApp() {
        return new Promise((resolve) => {
            // Wait for any of the catalog containers defined in config
            // This ensures we only start the UI when there is actual content to process
            const selectors = window.MetadataModules.config.METADATA_CONFIG.domSelectors.containers;
            
            if (document.querySelector(selectors)) {
                console.log('[METADATA] Catalog container detected, starting UI...');
                return resolve();
            }

            console.log('[METADATA] Waiting for catalog containers...');
            const observer = new MutationObserver((mutations, obs) => {
                if (document.querySelector(selectors)) {
                    console.log('[METADATA] Catalog container detected!');
                    obs.disconnect();
                    resolve();
                }
            });

            observer.observe(document.body || document.documentElement, {
                childList: true,
                subtree: true
            });
            
            // Fallback timeout - increased to 15s to allow for slow network/rendering
            // If no catalog appears (e.g. settings page), we might not want to start at all?
            // For now, we'll log a warning and resolve to ensure services are available if needed manually
            setTimeout(() => {
                if (!document.querySelector(selectors)) {
                    console.warn('[METADATA] Catalog wait timeout - starting anyway (or maybe we are on a non-catalog page)');
                }
                observer.disconnect();
                resolve(); 
            }, 15000);
        });
    }

    exposeGlobalAPI() {
        if (typeof window === 'undefined') return;

        const { metadataStorage, idLookup, metadataFetcher, idConverter, rateLimiter, titleSearcher } = this.core;
        const { domProcessor } = this.ui;

        // Debugging & Stats
        window.metadataStats = () => metadataStorage.getStats().then(stats => {
            console.log('[METADATA] Stats:', stats);
            return stats;
        });
        window.metadataClear = () => metadataStorage.clear();

    // Expose storage for manual operations
        window.metadataStorage = metadataStorage;

    // Expose services for debugging and testing
        window.metadataServices = {
            idConverter,
            rateLimiter,
            metadataFetcher,
            titleSearcher,
            idLookup
        };

        // External API
        window.extractMediaInfo = (titleText, element) => domProcessor.extractMediaInfo(titleText, element);
        window.getTitle = (imdbId) => metadataStorage.getTitle(imdbId);

    // Expose DOM processing functions for metadata-display plugin
        window.metadataHelper = {
            // Lifecycle
            destroy: () => this.stopUI(), // Allow manual cleanup

            // Core DOM processing
            processTitleElement: (element) => domProcessor.processTitleElement(element),
            findTitleElements: () => domProcessor.findTitleElements(),
            extractMediaInfo: (titleText, element) => domProcessor.extractMediaInfo(titleText, element),
            findTitleElementsInNode: (node) => domProcessor.findTitleElementsInNode(node),
            isTitleElement: (element) => domProcessor.isTitleElement(element),

            // Storage
            getTitle: (imdbId) => metadataStorage.getTitle(imdbId),
            hasTitle: (imdbId) => metadataStorage.hasTitle(imdbId),

        // Database access for advanced queries
            db: metadataStorage.db,

        // Cross-referencing for hover popups and external scripts
            findExistingTitle: (extractedIds, extractedTitle, extractedType) =>
                idLookup.findExistingTitle(extractedIds, extractedTitle, extractedType),

        // Priority enrichment for hover popups - accepts any ID type
            priorityEnrichTitle: async (anyId, idSource, type, progressCallback) => {
                try {
                // Use the full cross-referencing system to find the correct entry
                    const existingData = await idLookup.findByAnyId(anyId, idSource);
                    if (!existingData) {
                        console.warn(`[METADATA][Priority Enrichment] No existing data found for ${idSource}:${anyId}`);
                        return null;
                    }

                // Use priority enrichment with progress callbacks
                    const enrichedData = await metadataFetcher.enrichTitleProgressively(existingData.imdb, type, existingData.metaSource, existingData, true);

                    if (enrichedData && enrichedData !== existingData) {
                    // Save the enriched data
                        await metadataStorage.saveTitle(enrichedData);

                    // Update progress if callback provided
                        if (progressCallback && enrichedData.metaSource === 'complete') {
                            progressCallback('Complete metadata loaded');
                        }
                    }

                    return enrichedData;
                } catch (error) {
                    console.error(`[METADATA][Priority Enrichment] Failed for ${anyId}:`, error);
                    return null;
                }
            },

            // Priority processing for new elements discovered by popup
            priorityProcessElement: async (element) => {
                try {
                    return await metadataStorage.processAndSaveTitleElement(element, domProcessor, true);
                } catch (error) {
                    console.error(`[METADATA][Priority Process] Failed for element:`, error);
                    return null;
                }
            }
        };
    }
}

// ==========================================
// Bootstrap
// ==========================================

function bootstrap(retryCount = 0) {
    // Check for dependencies
    if (!window.MetadataModules || 
        !window.MetadataModules.config ||
        !window.MetadataModules.rateLimiter || 
        !window.MetadataModules.metadataFetcher || 
        !window.MetadataModules.idConversion ||
        !window.MetadataModules.titleSearch ||
        !window.MetadataModules.idLookup ||
        !window.MetadataModules.metadataStorage ||
        !window.MetadataModules.domProcessor ||
        !window.MetadataModules.hoverPopup) {
        
        // Dependencies not ready, retry shortly
        if (retryCount < 50) { // Retry for ~2.5 seconds max
            setTimeout(() => bootstrap(retryCount + 1), 50);
        } else {
            console.warn('[METADATA] Bootstrap failed: Dependencies not loaded after 50 retries.');
        }
        return;
    }

    // Singleton Pattern: Prevent duplicate initialization
    if (window.metadataManager) {
        console.warn('[METADATA] MetadataManager already exists. Skipping initialization.');
    } else {
        window.metadataManager = new MetadataManager();
        console.log('[METADATA] Modular system initialized successfully (v2 - Core/UI Split)');
    }
}

// Export to global scope
window.MetadataModules = window.MetadataModules || {};
window.MetadataModules.main = {
    init: bootstrap
};