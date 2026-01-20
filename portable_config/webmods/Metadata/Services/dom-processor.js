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

    this.start();
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
    // Check if element itself is already a suitable target (<a> from meta-items-container)
    if (
      element.tagName === "A" &&
      (element.id ||
        element.href ||
        element.querySelector(this.domSelectors.posterImageGeneric))
    ) {
      return element;
    }

    // Fallback: Try catalog rows (<a id="...">)
    const linkElement = element.closest("a[id]");
    if (linkElement) return linkElement;

    // Fallback: Try continue watching (<div tabindex="0">)
    const divElement = element.closest("div[tabindex]");
    if (divElement) return divElement;

    return null; // No suitable element found
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

    // Extract from element ID
    if (element.id) {
      const parsed = this.parseId(element.id);
      if (parsed && typeof parsed.id === "string") {
        ids[parsed.idSource] = parsed.id;
      }
    }

    // Extract from href
    const href = element.getAttribute("href");
    if (href) {
      const urlData = this.extractFromUrl(href);
      if (urlData && typeof urlData.id === "string") {
        ids.type = urlData.type;
        ids[urlData.idSource] = urlData.id;
      }
    }

    // Extract from poster image
    const img = element.querySelector(this.domSelectors.posterImage);
    if (img?.src) {
      const urlData = this.extractFromUrl(img.src);
      if (urlData && typeof urlData.id === "string") {
        if (!ids.type) ids.type = urlData.type;
        ids[urlData.idSource] = urlData.id;
      } else {
        // Fallback for poster URLs
        const match = img.src.match(
          /\/poster\/(?:small|medium|large)\/(tt\d{7,})/,
        );
        if (match && typeof match[1] === "string") {
          ids.imdb = match[1];
        }
      }
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
    if (!targetElement) {
      return this.createEmptyResult(titleText, element);
    }

    const ids = this.extractIdsFromElement(targetElement);
    return {
      ...ids,
      title: titleText || element.getAttribute("title") || "",
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
