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
            // Expose storage/fetcher immediately — detail pages must not wait for catalog grid
            this.exposeCoreAPI();
        }

        // 2. Initialize UI (Transient) — hover/dom observers need catalog OR detail shell
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

    isNonCatalogRoute() {
        const hash = window.location.hash || "";
        return (
            hash.startsWith("#/detail") ||
            hash.startsWith("#/player") ||
            hash.startsWith("#/meta") ||
            hash.includes("/settings") ||
            hash.includes("/addons")
        );
    }

    hasDetailShell() {
        return !!document.querySelector(
            ".meta-info-container-ub8AH, [class*='metadetails-container'], .meta-details-container",
        );
    }

    waitForApp() {
        return new Promise((resolve) => {
            const selectors =
                window.MetadataModules.config.METADATA_CONFIG.domSelectors.containers;

            if (
                document.querySelector(selectors) ||
                this.isNonCatalogRoute() ||
                this.hasDetailShell()
            ) {
                console.log("[METADATA] App shell ready, starting UI...");
                return resolve();
            }

            console.log("[METADATA] Waiting for catalog or detail shell...");
            let settled = false;
            const finish = (reason) => {
                if (settled) return;
                settled = true;
                observer.disconnect();
                console.log(`[METADATA] Starting UI (${reason})`);
                resolve();
            };

            const observer = new MutationObserver(() => {
                if (
                    document.querySelector(selectors) ||
                    this.isNonCatalogRoute() ||
                    this.hasDetailShell()
                ) {
                    finish("shell detected");
                }
            });

            observer.observe(document.body || document.documentElement, {
                childList: true,
                subtree: true,
            });

            // Short fallback — detail pages never had catalog grids (old 15s caused Discover slowness)
            setTimeout(() => finish("timeout fallback"), 1500);
        });
    }

    exposeCoreAPI() {
        if (typeof window === "undefined" || !this.core) return;

        const {
            metadataStorage,
            idLookup,
            metadataFetcher,
            idConverter,
            rateLimiter,
            titleSearcher,
        } = this.core;
        const manager = this;

        window.metadataStats =
            window.metadataStats ||
            (() =>
                metadataStorage.getStats().then((stats) => {
                    console.log("[METADATA] Stats:", stats);
                    return stats;
                }));
        window.metadataClear =
            window.metadataClear || (() => metadataStorage.clear());
        window.metadataStorage = metadataStorage;
        window.metadataServices = {
            idConverter,
            rateLimiter,
            metadataFetcher,
            titleSearcher,
            idLookup,
        };
        window.getTitle = (imdbId) => metadataStorage.getTitle(imdbId);

        window.metadataHelper = {
            destroy: () => manager.stopUI(),
            getTitle: (imdbId) => metadataStorage.getTitle(imdbId),
            hasTitle: (imdbId) => metadataStorage.hasTitle(imdbId),
            db: metadataStorage.db,
            findExistingTitle: (extractedIds, extractedTitle, extractedType) =>
                idLookup.findExistingTitle(
                    extractedIds,
                    extractedTitle,
                    extractedType,
                ),
            priorityEnrichTitle: async (
                anyId,
                idSource,
                type,
                progressCallback,
            ) => {
                try {
                    const existingData = await idLookup.findByAnyId(
                        anyId,
                        idSource,
                    );
                    if (!existingData) return null;

                    const enrichedData =
                        await metadataFetcher.enrichTitleProgressively(
                            existingData.imdb,
                            type,
                            existingData.metaSource,
                            existingData,
                            true,
                        );

                    if (enrichedData && enrichedData !== existingData) {
                        await metadataStorage.saveTitle(enrichedData);
                        if (
                            progressCallback &&
                            enrichedData.metaSource === "complete"
                        ) {
                            progressCallback("Complete metadata loaded");
                        }
                    }
                    return enrichedData;
                } catch (error) {
                    console.error(
                        `[METADATA][Priority Enrichment] Failed for ${anyId}:`,
                        error,
                    );
                    return null;
                }
            },
            priorityProcessElement: async (element) => {
                const domProcessor = manager.ui?.domProcessor;
                if (!domProcessor) return null;
                try {
                    return await metadataStorage.processAndSaveTitleElement(
                        element,
                        domProcessor,
                        true,
                    );
                } catch (error) {
                    console.error(
                        `[METADATA][Priority Process] Failed for element:`,
                        error,
                    );
                    return null;
                }
            },
            processTitleElement: (element) => {
                const domProcessor = manager.ui?.domProcessor;
                return domProcessor
                    ? domProcessor.processTitleElement(element)
                    : null;
            },
            findTitleElements: () =>
                manager.ui?.domProcessor?.findTitleElements?.() || [],
            extractMediaInfo: (titleText, element) => {
                const domProcessor = manager.ui?.domProcessor;
                return domProcessor
                    ? domProcessor.extractMediaInfo(titleText, element)
                    : null;
            },
            findTitleElementsInNode: (node) =>
                manager.ui?.domProcessor?.findTitleElementsInNode?.(node) || [],
            isTitleElement: (element) =>
                manager.ui?.domProcessor?.isTitleElement?.(element) ?? false,
        };

        if (!window.__kaiMetadataCoreReady) {
            window.__kaiMetadataCoreReady = true;
            window.dispatchEvent(new CustomEvent("metadata-core-ready"));
        }
    }

    exposeGlobalAPI() {
        if (typeof window === "undefined" || !this.core || !this.ui) return;

        this.exposeCoreAPI();

        const { domProcessor } = this.ui;
        window.extractMediaInfo = (titleText, element) =>
            domProcessor.extractMediaInfo(titleText, element);
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