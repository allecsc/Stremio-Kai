/**
 * @name Metadata Helper - DOM Processor Module
 * @description DOM monitoring and title element processing
 */

// DOM Title Processor Service
class DOMTitleProcessor {
  constructor(metadataStorage) {
    this.storage = metadataStorage;
    this.processing = new Set(); // Track titles being processed to prevent concurrent duplicates
    this.observer = null;
    this.observerRetries = 0;
    this.subscribers = new Set(); // Subscribers for element detection

    // Cache config to avoid repeated property access
    this.config = window.MetadataModules.config.METADATA_CONFIG;
    this.domSelectors = this.config.domSelectors;

    // Debounce state
    this.pendingNodes = new Set();
    this.debounceTimer = null;
    this.DEBOUNCE_DELAY = 200; // ms
    this._catalogScrollPaused = false;
    this._scrollPauseTimer = null;
    this._boundMarkCatalogScroll = this.markCatalogScroll.bind(this);

    this.start();
  }

  markCatalogScroll() {
    const hash = window.location.hash || "";
    if (!hash.startsWith("#/discover")) return;

    this._catalogScrollPaused = true;
    clearTimeout(this._scrollPauseTimer);
    this._scrollPauseTimer = setTimeout(() => {
      this._catalogScrollPaused = false;
      if (this.pendingNodes.size > 0) {
        this.scheduleBatchProcessing();
      }
    }, 220);
  }

  isDiscoverCatalogOnly() {
    const hash = window.location.hash || "";
    if (!hash.startsWith("#/discover")) return false;

    for (const el of document.querySelectorAll(
      ".meta-info-container-ub8AH, [class*='metadetails-container']",
    )) {
      if (!el.isConnected) continue;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width > 2 && rect.height > 2) return false;
    }
    return true;
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    // Return unsubscribe function
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers(elements) {
    if (this.subscribers.size === 0 || !elements || elements.length === 0)
      return;

    // Notify all subscribers
    this.subscribers.forEach((callback) => {
      try {
        callback(elements);
      } catch (error) {
        console.error("[METADATA][DOM Processor] Subscriber error:", error);
      }
    });
  }

  start() {
    this.processExistingTitles();
    this.setupObserver();

    // Listen for route changes to optimize performance
    this.boundHandleRouteChange = this.handleRouteChange.bind(this);
    window.addEventListener("hashchange", this.boundHandleRouteChange);
    for (const eventName of ["wheel", "touchmove"]) {
      document.addEventListener(eventName, this._boundMarkCatalogScroll, {
        passive: true,
        capture: true,
      });
    }
    // Initial check
    this.handleRouteChange();

    // Add delayed re-scan for continue watching elements that load later
    setTimeout(() => {
      this.processExistingTitles();
    }, this.config.initialScanDelay);
  }

  disconnect() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Remove listener
    if (this.boundHandleRouteChange) {
      window.removeEventListener("hashchange", this.boundHandleRouteChange);
      this.boundHandleRouteChange = null;
    }
    if (this._boundMarkCatalogScroll) {
      for (const eventName of ["wheel", "touchmove"]) {
        document.removeEventListener(eventName, this._boundMarkCatalogScroll, {
          capture: true,
        });
      }
    }
    clearTimeout(this._scrollPauseTimer);
    this._scrollPauseTimer = null;

    this.pendingNodes.clear();
    this.processing.clear();
    this.subscribers.clear();
  }

  handleRouteChange() {
    if (!window.RouteDetector) return;

    const state = window.RouteDetector.getRouteState();
    const hash = window.location.hash;

    // Routes where we DON'T need the DOM Processor running
    // 1. Player: Critical performance needed, no posters to scan
    // 2. Settings: Static UI
    // 3. Addons: Mostly native/static
    const isIgnoredRoute =
      state.view === "PLAYER" ||
      hash.includes("/settings") ||
      hash.includes("/addons");

    if (isIgnoredRoute) {
      if (this.observer) {
        // System log commented out to reduce noise, but useful for debug
        // console.log('[METADATA] Pausing DOM Observer on ignored route:', hash);
        this.observer.disconnect();
        this.observer = null;
      }
    } else {
      if (!this.observer) {
        // console.log('[METADATA] Resuming DOM Observer on route:', hash);
        this.setupObserver();
        // Trigger a scan on resume
        this.processExistingTitles();
      }
    }
  }

  async processExistingTitles() {
    if (this.isDiscoverCatalogOnly()) return;

    // Use requestIdleCallback to avoid blocking main thread during initial load
    this.runIdle(() => {
      const elements = this.findTitleElements();
      // Process titles one by one to respect rate limits
      for (const element of elements) {
        // Skip if already processed
        if (element.dataset.metadataProcessed) continue;

        this.storage.processAndSaveTitleElement(element, this);
        element.dataset.metadataProcessed = "true";
      }

      // Notify subscribers about these existing elements
      // We pass ALL found elements, even if we just processed them
      if (elements.length > 0) {
        this.notifySubscribers(elements);
      }
    });
  }

  // Wrapper for requestIdleCallback with fallback
  runIdle(callback) {
    if (window.requestIdleCallback) {
      window.requestIdleCallback(callback, { timeout: 2000 });
    } else {
      setTimeout(callback, 1);
    }
  }

  findTitleElements() {
    const titleElements = [];

    // Primary: Container-targeted scanning for known structures
    const containers = document.querySelectorAll(this.domSelectors.containers);
    containers.forEach((container) => {
      // Find both <a> and <div tabindex> elements in containers, but FILTER for actual title posters
      const elementsInContainer = container.querySelectorAll(
        this.domSelectors.items,
      );
      const titleElementsInContainer = Array.from(elementsInContainer).filter(
        (el) => {
          // Optimization: Skip already processed elements at the source
          if (el.dataset.metadataProcessed) return false;

          return (
            el.querySelector(this.domSelectors.posterImage) || // Has poster image
            (el.href && el.href.includes("/detail/")) || // Links to detail pages
            el.id
          ); // Has ID attribute
        },
      );
      titleElements.push(...titleElementsInContainer);
    });

    return titleElements;
  }

  async processTitleElement(element) {
    let titleKey;
    let mediaInfo;

    try {
      // Step 1: DOM Extraction -> IDs found
      mediaInfo = this.extractMediaInfo("", element);
      titleKey = `${mediaInfo.type}:${mediaInfo.title}`;

      // Check if this title is already being processed
      if (this.processing.has(titleKey)) {
        return null;
      }

      this.processing.add(titleKey);

      const hasValidIds =
        mediaInfo.imdb ||
        mediaInfo.mal ||
        mediaInfo.anilist ||
        mediaInfo.kitsu ||
        mediaInfo.tvdb ||
        mediaInfo.tmdb;
      if (!hasValidIds) {
        this.processing.delete(titleKey);
        return null;
      }

      const extractedIds = {
        imdb: mediaInfo.imdb,
        mal: mediaInfo.mal,
        anilist: mediaInfo.anilist,
        kitsu: mediaInfo.kitsu,
        tvdb: mediaInfo.tvdb,
        tmdb: mediaInfo.tmdb,
      };

      // Detect if this is an anime title (has anime-specific IDs)
      const isAnime = !!(
        extractedIds.mal ||
        extractedIds.anilist ||
        extractedIds.kitsu
      );

      // Clean title and extract year before saving
      const { cleanedTitle, year } =
        window.MetadataModules.titleUtils.TitleUtils.extractYearFromTitle(
          mediaInfo.title,
        );
      const extractedTitle =
        window.MetadataModules.titleUtils.TitleUtils.cleanTitleForSearch(
          cleanedTitle,
          isAnime,
        );
      const extractedType = mediaInfo.type;

      // Return processed data for storage layer to handle
      return {
        extractedIds,
        extractedTitle,
        extractedType,
        year,
        titleKey,
      };
    } catch (error) {
      console.warn(
        `[METADATA][DOM Processor] Title processing failed for "${mediaInfo?.title || "unknown"}":`,
        error,
      );
      return null;
    } finally {
      // Always remove from processing set
      if (titleKey) {
        this.processing.delete(titleKey);
      }
    }
  }

  setupObserver() {
    if (typeof MutationObserver === "undefined") {
      console.warn("[Background] MutationObserver not available");
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      if (this.isDiscoverCatalogOnly()) return;

      let hasRelevantMutations = false;

      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.pendingNodes.add(node);
              hasRelevantMutations = true;
            }
          }
        }
      }

      if (hasRelevantMutations) {
        this.scheduleBatchProcessing();
      }
    });

    // Start observing
    const observeTarget = document.body || document.documentElement;
    if (observeTarget) {
      this.observer.observe(observeTarget, {
        childList: true,
        subtree: true,
      });
    } else {
      this.observerRetries++;
      if (this.observerRetries < 10) {
        setTimeout(() => this.setupObserver(), this.config.observerRetryDelay);
      } else {
        console.warn(
          "[Background] Failed to setup MutationObserver after 10 retries",
        );
      }
    }
  }

  scheduleBatchProcessing() {
    if (this.isDiscoverCatalogOnly()) {
      this.pendingNodes.clear();
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      return;
    }

    if (this._catalogScrollPaused && (window.location.hash || "").startsWith("#/discover")) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.scheduleBatchProcessing();
      }, 220);
      return;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processPendingNodes();
    }, this.DEBOUNCE_DELAY);
  }

  processPendingNodes() {
    if (this.pendingNodes.size === 0) return;

    // Clone and clear set to allow new mutations to accumulate
    const nodesToProcess = Array.from(this.pendingNodes);
    this.pendingNodes.clear();
    this.debounceTimer = null;

    this.runIdle(() => {
      const allNewElements = [];

      for (const node of nodesToProcess) {
        // Fail fast: if node is not connected, skip
        if (!node.isConnected) continue;

        const titleElements = this.findTitleElementsInNode(node);
        if (titleElements.length > 0) {
          allNewElements.push(...titleElements);
          titleElements.forEach((el) => {
            if (el.dataset.metadataProcessed) return;

            this.storage.processAndSaveTitleElement(el, this);
            el.dataset.metadataProcessed = "true";
          });
        }
      }

      // Notify subscribers of all new elements found in this batch
      if (allNewElements.length > 0) {
        this.notifySubscribers(allNewElements);
      }
    });
  }

  findTitleElementsInNode(node) {
    // Optimization: Fail fast if node isn't an element
    if (node.nodeType !== Node.ELEMENT_NODE) return [];

    const elements = [];

    // Check if node itself is a title element
    if (this.isTitleElement(node) && !node.dataset.metadataProcessed) {
      elements.push(node);
    }

    // Optimization: Only query if the node could potentially contain items
    // Check if node matches container selector OR contains a container
    // This avoids querying every single added span or div
    const containerSelector = this.domSelectors.containers;

    // 1. Is the node itself a container?
    if (node.matches && node.matches(containerSelector)) {
      this.extractFromContainer(node, elements);
    }
    // 2. Does it contain containers?
    else if (node.querySelectorAll) {
      // Limit depth of query if possible, but for now standard query
      const containers = node.querySelectorAll(containerSelector);
      containers.forEach((container) => {
        this.extractFromContainer(container, elements);
      });
    }

    return elements;
  }

  extractFromContainer(container, resultsArray) {
    const allElements = container.querySelectorAll(this.domSelectors.items);
    const titleElements = Array.from(allElements).filter((el) => {
      if (el.dataset.metadataProcessed) return false;

      return (
        el.querySelector(this.domSelectors.posterImage) || // Has poster image
        (el.href && el.href.includes("/detail/")) || // Links to detail pages
        el.id
      ); // Has ID attribute
    });
    resultsArray.push(...titleElements);
  }

  isTitleElement(element) {
    return (
      (element.id ||
        element.href ||
        element.querySelector(this.domSelectors.posterImage)) &&
      (element.tagName === "A" || element.hasAttribute("tabindex"))
    );
  }

  // Private DOM extraction methods
  findTargetElement(element) {
    if (!element) return null;

    const posterHost =
      element.closest?.(".meta-item-container-Tj0Ib, [class*='meta-item-container']") ||
      element;

    // Check if element itself is already a suitable target (<a> from meta-items-container)
    if (
      element.tagName === "A" &&
      (element.id ||
        element.href ||
        element.querySelector(this.domSelectors.posterImageGeneric))
    ) {
      return element;
    }

    // Discover/Board detail links often have href but no id attribute
    const detailLink =
      posterHost.closest?.('a[href*="/detail/"]') ||
      posterHost.querySelector?.('a[href*="/detail/"]') ||
      element.closest?.('a[href*="/detail/"]') ||
      element.querySelector?.('a[href*="/detail/"]');
    if (detailLink) return detailLink;

    const tabItem =
      posterHost.querySelector?.('div[tabindex], a[id]') ||
      posterHost.closest?.("div[tabindex]");
    if (tabItem) return tabItem;

    if (
      posterHost.querySelector?.(this.domSelectors.posterImageGeneric) ||
      posterHost.className?.includes?.("meta-item-container")
    ) {
      return posterHost;
    }

    // Fallback: Try catalog rows (<a id="...">)
    const linkElement = element.closest("a[id]");
    if (linkElement) return linkElement;

    // Fallback: Try continue watching (<div tabindex="0">)
    const divElement = element.closest("div[tabindex]");
    if (divElement) return divElement;

    return posterHost !== element ? posterHost : null;
  }

  inferTypeFromContext() {
    const hash = window.location.hash || "";
    const hashMatch = hash.match(/\/(movie|series)(?:\/|$|\?)/);
    if (hashMatch) return hashMatch[1];
    return null;
  }

  mergeIdFromRaw(rawId, ids) {
    if (!rawId) return;
    const decoded = decodeURIComponent(String(rawId).split("/")[0].split("?")[0]);
    const parsed = this.parseId(decoded);
    if (!parsed?.id || parsed.idSource === "unknown") return;
    if (!ids.type && (decoded.includes("movie") || decoded.includes("series"))) {
      const typeMatch = decoded.match(/\/(movie|series)\//);
      if (typeMatch) ids.type = typeMatch[1];
    }
    ids[parsed.idSource] = parsed.id;
  }

  mergeFromHref(href, ids) {
    if (!href) return;
    const urlData = this.extractFromUrl(href);
    if (urlData?.id) {
      if (!ids.type) ids.type = urlData.type;
      ids[urlData.idSource] = urlData.id;
      return;
    }
    const imdbMatch = href.match(/tt\d{7,}/);
    if (imdbMatch) ids.imdb = imdbMatch[0];
  }

  mergeFromPosterSrc(src, ids) {
    if (!src) return;

    const urlData = this.extractFromUrl(src);
    if (urlData?.id) {
      if (!ids.type) ids.type = urlData.type;
      ids[urlData.idSource] = urlData.id;
      return;
    }

    const posterMatch = src.match(/\/poster\/(?:small|medium|large)\/([^/?]+)/);
    if (posterMatch) {
      this.mergeIdFromRaw(posterMatch[1], ids);
      return;
    }

    const metahubMatch = src.match(/metahub\.space\/(?:poster|background|logo)\/[^/]+\/([^/?]+)/);
    if (metahubMatch) {
      this.mergeIdFromRaw(metahubMatch[1], ids);
      return;
    }

    const rpdbMatch = src.match(/ratingsposterdb\.com\/[^/]+\/imdb\/[^/]+\/(tt\d{7,})/);
    if (rpdbMatch) {
      ids.imdb = rpdbMatch[1];
      return;
    }

    const imdbMatch = src.match(/tt\d{7,}/);
    if (imdbMatch) ids.imdb = imdbMatch[0];
  }

  extractTitleFromRoot(root, fallback = "") {
    if (!root) return fallback;
    const candidates = [
      root.getAttribute?.("title"),
      root.querySelector?.('[class*="title-bar"] [class*="label"]')?.textContent,
      root.querySelector?.('[class*="title-bar-container"]')?.textContent,
      root.querySelector?.('[class*="name-label"]')?.textContent,
      root.querySelector?.('[class*="title-label"]')?.textContent,
    ];
    for (const value of candidates) {
      const text = String(value || "").trim();
      if (text) return text;
    }
    return fallback;
  }

  extractIdsFromElement(element) {
    const ids = {
      imdb: null,
      mal: null,
      anilist: null,
      kitsu: null,
      tvdb: null,
      tmdb: null,
      type: null,
    };

    const roots = new Set([element]);
    const posterHost = element.closest?.(
      ".meta-item-container-Tj0Ib, [class*='meta-item-container']",
    );
    if (posterHost) roots.add(posterHost);

    for (const root of roots) {
      if (root.id) this.mergeIdFromRaw(root.id, ids);

      this.mergeFromHref(root.getAttribute?.("href"), ids);

      root.querySelectorAll?.('a[href*="/detail/"], a[href*="imdb.com/title/"]').forEach((link) => {
        this.mergeFromHref(
          decodeURIComponent(link.getAttribute("href") || link.href || ""),
          ids,
        );
      });

      root.querySelectorAll?.(
        `${this.domSelectors.posterImage}, ${this.domSelectors.posterImageGeneric}, img[src*="metahub"], img[src*="poster"]`,
      ).forEach((img) => {
        this.mergeFromPosterSrc(img.getAttribute("src") || img.src, ids);
      });
    }

    if (!ids.type) {
      ids.type = this.inferTypeFromContext() || "movie";
    }

    return ids;
  }

  createEmptyResult(titleText, element) {
    return {
      imdb: null,
      mal: null,
      anilist: null,
      kitsu: null,
      tvdb: null,
      tmdb: null,
      type: null,
      title: titleText || element.getAttribute("title") || null,
    };
  }

  extractMediaInfo(titleText, element) {
    const targetElement = this.findTargetElement(element);
    const root = targetElement || element;
    const title =
      titleText ||
      this.extractTitleFromRoot(root, "") ||
      this.extractTitleFromRoot(element, "");

    if (!targetElement) {
      const ids = this.extractIdsFromElement(element);
      const hasValidIds =
        ids.imdb || ids.mal || ids.anilist || ids.kitsu || ids.tvdb || ids.tmdb;
      if (!hasValidIds) {
        return this.createEmptyResult(title, element);
      }
      return { ...ids, title };
    }

    const ids = this.extractIdsFromElement(targetElement);
    return {
      ...ids,
      title,
    };
  }

  extractFromUrl(url) {
    // Match: /movie/tt1312221 or /series/mal:52807
    const match = url.match(/\/(movie|series)\/([^/?]+)/);
    if (match) {
      const type = match[1];
      const rawId = decodeURIComponent(match[2]); // Handle URL encoding
      const { id, idSource } = this.parseId(rawId);
      return { type, id, idSource };
    }
    return null;
  }

  parseId(rawId) {
    // IMDb IDs always start with 'tt'
    if (rawId.startsWith("tt")) {
      return { id: rawId, idSource: "imdb" };
    }

    // All other sources use prefix:id format
    if (rawId.includes(":")) {
      const [source, id] = rawId.split(":");
      return { id, idSource: source.toLowerCase() };
    }

    // Fallback for unknown formats - check if it looks like an IMDb ID
    // IMDb IDs are tt followed by digits
    if (/^tt\d+$/.test(rawId)) {
      return { id: rawId, idSource: "imdb" };
    }

    // Otherwise unknown
    return { id: rawId, idSource: "unknown" };
  }
}

// Export to global scope
window.MetadataModules = window.MetadataModules || {};
window.MetadataModules.domProcessor = {
  DOMTitleProcessor,
};
