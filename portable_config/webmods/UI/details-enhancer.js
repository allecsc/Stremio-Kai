/**
 * @name Show Page Enhancer
 * @description Enriches Stremio detail pages with metadata from the database
 * @version 1.3.0
 *
 * Injects enhanced ratings, tags, awards, and cast/crew information into title detail pages
 * using route-based detection and the existing metadata system.
 *
 * Changelog v1.3.0:
 * - Debounced MutationObserver for performance
 * - Consolidated to single debounce mechanism
 * - CSS-only state management (removed inline styles)
 * - Route state caching for efficiency
 * - Observer lifecycle management (disconnect on non-detail pages)
 * - Error boundary around observer callback
 * - Exposed cleanup via window.ShowPageEnhancer
 */

(function () {
  "use strict";

  // Idempotency Guard (per webmods.md rules)
  if (window.ShowPageEnhancer?.initialized) return;

  // Expose control object for debugging and cleanup
  window.ShowPageEnhancer = {
    initialized: true,
    cleanup: null, // Will be set after init
  };

  console.log(
    "%c[Show Page Enhancer] Script loaded!",
    "color: #7b5bf5; font-weight: bold",
  );

  // Configuration
  const CONFIG = {
    // Route detection
    DETAIL_ROUTE_PATTERN: /^#\/detail\/(movie|series)\/(.+)$/,

    // DOM Selectors
    META_CONTAINER: ".meta-info-container-ub8AH",
    EXISTING_GENRES: ".meta-links-Xiao3",
    LOGO_IMAGE: ".logo-X3hTV",
    RELEASE_INFO: ".release-info-label-LPJMB",
    RUNTIME_LABEL: ".runtime-label-TzAGI",
    EPISODES_CONTAINER: ".videos-container-msX8s",
    EPISODE_ITEM: ".video-container-ezBpK",
    THUMBNAIL_IMG: ".thumbnail-J81W3",
    INFO_CONTAINER: ".info-container-xyynk",
    SEASONS_BAR: ".seasons-bar-Ma8vp",
    SEASON_LABEL: ".label-SoEGc",
    EPISODE_TITLE: ".title-container-NcfV9",

    // Metadata preferences
    MAX_CAST: 8, // 8 Cast + 2 Directors = 10 items (2 rows of 5)
    MAX_DIRECTORS: 2,
    DEFAULT_AVATAR:
      "https://icons.veryicon.com/png/128/clothes-accessories/through-item/avatar-10.png",

    // Timing
    DEBOUNCE_DELAY: 150,

    // CSS Markers
    MARKER_CLASS: "spe-injected",
    RATINGS_CLASS: "show-page-section-ratings",
    GENRES_CLASS: "show-page-section-genres",
    CAST_SECTION_CLASS: "show-page-section-cast",
    DESC_CLASS: "episode-description-spe",
  };

  /**
   * Route detector and ID extractor with caching
   */
  class RouteDetector {
    // Route state cache (invalidated on hash change)
    static _cache = { hash: "", state: null };

    // Known Route Regular Expressions
    static ROUTES = {
      PLAYER: /^#\/player\//,
      STREAMS: /^#\/detail\/(movie|series)\/([^\/]+)\/([^\/?]+)/,
      DETAIL: /^#\/detail\/(movie|series)\/([^\/?]+)/,
    };

    static getRouteState() {
      const hash = window.location.hash;

      // Return cached state if hash hasn't changed
      if (RouteDetector._cache.hash === hash && RouteDetector._cache.state) {
        return RouteDetector._cache.state;
      }

      let state;

      // 1. Player (Nuclear Cleanup Phase)
      if (RouteDetector.ROUTES.PLAYER.test(hash)) {
        state = { view: "PLAYER", id: null };
        RouteDetector._cache = { hash, state };
        return state;
      }

      // 2. Stream Selection
      const streamsMatch = hash.match(RouteDetector.ROUTES.STREAMS);
      if (streamsMatch) {
        const type = streamsMatch[1];
        const rawId = decodeURIComponent(streamsMatch[2]);
        const idInfo = RouteDetector.parseId(rawId);

        state = {
          view: "STREAMS",
          type: type,
          id: idInfo.id,
          source: idInfo.source,
          episodeId: decodeURIComponent(streamsMatch[3]),
        };
        RouteDetector._cache = { hash, state };
        return state;
      }

      // 3. Detail Page (Injection Phase)
      const detailMatch = hash.match(RouteDetector.ROUTES.DETAIL);
      if (detailMatch) {
        const rawId = decodeURIComponent(detailMatch[2]).split("/")[0];
        const idInfo = RouteDetector.parseId(rawId);

        const urlParams = new URLSearchParams(hash.split("?")[1] || "");
        const season = urlParams.get("season");

        state = {
          view: "DETAIL",
          type: detailMatch[1],
          id: idInfo.id,
          source: idInfo.source,
          season: season,
        };
        RouteDetector._cache = { hash, state };
        return state;
      }

      state = { view: "UNKNOWN", id: null };
      RouteDetector._cache = { hash, state };
      return state;
    }

    static invalidateCache() {
      RouteDetector._cache = { hash: "", state: null };
    }

    static parseId(idString) {
      if (!idString) return { id: null, source: "imdb" };

      // Handle case where ID might still have a / or ? attached
      idString = idString.split("/")[0].split("?")[0];

      let id = idString;
      let source = "imdb";

      if (idString.startsWith("tmdb:")) {
        id = idString.replace("tmdb:", "");
        source = "tmdb";
      } else if (idString.startsWith("tvdb:")) {
        id = idString.replace("tvdb:", "");
        source = "tvdb";
      } else if (idString.startsWith("mal:")) {
        id = idString.replace("mal:", "");
        source = "mal";
      } else if (idString.startsWith("kitsu:")) {
        id = idString.replace("kitsu:", "");
        source = "kitsu";
      } else if (idString.startsWith("anilist:")) {
        id = idString.replace("anilist:", "");
        source = "anilist";
      } else if (idString.startsWith("anidb:")) {
        id = idString.replace("anidb:", "");
        source = "anidb";
      }

      return { id, source };
    }

    static isDetailPage() {
      const state = RouteDetector.getRouteState();
      return state.view === "DETAIL" || state.view === "STREAMS";
    }

    static extractFromHash() {
      return RouteDetector.getRouteState();
    }

    static extractFromDOM() {
      const logoImg = document.querySelector(CONFIG.LOGO_IMAGE);
      const releaseInfo = document.querySelector(CONFIG.RELEASE_INFO);

      if (!logoImg) return null;

      const title = logoImg.getAttribute("title");
      const yearText = releaseInfo?.textContent || "";
      const year = yearText.match(/\d{4}/)?.[0] || "";

      return title ? { title, year } : null;
    }
  }

  /**
   * Metadata injection manager
   */
  class MetadataInjector {
    static clearInjectedContent() {
      // 1. Remove specifically injected section elements
      const sections = document.querySelectorAll(
        `.${CONFIG.RATINGS_CLASS}, .${CONFIG.GENRES_CLASS}, .${CONFIG.CAST_SECTION_CLASS}, .show-page-tagline, .show-page-meta-row`,
      );
      sections.forEach((el) => el.remove());

      // Remove any injected separators or specific badges if strict cleanup needed
      const networkBadges = document.querySelectorAll(".show-page-network");
      networkBadges.forEach((el) => el.remove());

      // 2. Clear marker class from any containers but DON'T remove the container itself
      const marked = document.querySelectorAll(`.${CONFIG.MARKER_CLASS}`);
      marked.forEach((el) => el.classList.remove(CONFIG.MARKER_CLASS));

      // 3. Restore hidden native elements (optional, but good practice if we want a clean state)
      // Native elements are hidden via CSS !important, so no JS restoration needed usually.

      if (sections.length || marked.length) {
        console.log(
          `[Show Page Enhancer] Cleared ${sections.length} sections and ${marked.length} markers`,
        );
      }
    }

    static injectMetadata(metadata, intersectionObserver) {
      if (!metadata) return;

      const metaContainer = document.querySelector(CONFIG.META_CONTAINER);
      if (!metaContainer) {
        console.error(
          "[Show Page Enhancer] Meta container not found during injection!",
        );
        return;
      }

      // READ PHASE: Gather all targets
      const runtimeEl = metaContainer.querySelector(CONFIG.RUNTIME_LABEL);
      const releaseEl = metaContainer.querySelector(CONFIG.RELEASE_INFO);
      const imdbButton = metaContainer.querySelector(
        ".imdb-button-container-gGjxp",
      );
      const metaLinksSections = metaContainer.querySelectorAll(
        CONFIG.EXISTING_GENRES,
      );
      const description = metaContainer.querySelector(
        ".description-container-yi8iU",
      );

      // PREPARE PHASE: Generate content (No DOM layout thrashing)
      let ratingsWrapper = null;
      // FIX: Do not require imdbButton to exist to create our ratings.
      // We only use imdbButton to remove it later.
      if (window.PopupTemplates?.createRatingsSection) {
        const html = window.PopupTemplates.createRatingsSection(metadata);
        if (html) {
          ratingsWrapper = document.createElement("div");
          ratingsWrapper.className = CONFIG.RATINGS_CLASS;
          ratingsWrapper.innerHTML = html;
        }
      }

      let genresWrapper = null;
      let genresLabel = null;
      if (window.PopupTemplates?.createGenresSection) {
        let html = window.PopupTemplates.createGenresSection(metadata);
        if (html) {
          html = html.replace(
            /<div class="metadata-popup-genres-label">.*?<\/div>/,
            "",
          );
          genresWrapper = document.createElement("div");
          genresWrapper.className = CONFIG.GENRES_CLASS;
          genresWrapper.innerHTML = html;

          if (description) {
            const label = description.querySelector(".label-container-_VXZt");
            if (label) genresLabel = label;
          }
        }
      }

      let castWrapper = null;
      if (metadata.stars?.length > 0 || metadata.directors?.length > 0) {
        const html = this.createCombinedPersonSection(
          metadata.directors || [],
          metadata.stars || [],
        );
        if (html) {
          const temp = document.createElement("div");
          temp.innerHTML = html;
          castWrapper = temp.firstElementChild;
        }
      }

      // WRITE PHASE: Mutate DOM in one go
      // Prevent double injection
      if (metaContainer.classList.contains(CONFIG.MARKER_CLASS)) {
        this.clearInjectedContent();
      }
      metaContainer.classList.add(CONFIG.MARKER_CLASS);
      metaContainer.classList.remove("is-movie", "is-series");
      if (metadata.type === "movie") metaContainer.classList.add("is-movie");
      if (metadata.type === "series") metaContainer.classList.add("is-series");

      let replaced = 0;

      // -----------------------------------------------------------
      // STRICT ORDER CONSTRUCTION (No Jumping)
      // -----------------------------------------------------------
      // We will re-arrange the elements strictly relative to the Logo.
      // Order: Logo -> Tagline -> Custom Meta Row -> Ratings Row -> [Native Rest]

      const mainLogo = metaContainer.querySelector(CONFIG.LOGO_IMAGE);

      // LOGO: Replace content if needed
      if (mainLogo && metadata.logo) {
        mainLogo.src = metadata.logo;
      }

      // 1. Tagline Element
      let taglineEl = null;
      if (metadata.tagline) {
        taglineEl = document.createElement("div");
        taglineEl.className = "show-page-tagline";
        taglineEl.textContent = metadata.tagline;
        replaced++;
      }

      // 2. Custom Meta Row
      const customMetaRow = document.createElement("div");
      customMetaRow.className = "show-page-meta-row";

      const metaItems = [];

      // 2a. Certification Badge
      if (metadata.certification || metadata.rated) {
        const cert = document.createElement("span");
        cert.className = "show-page-certification";
        cert.textContent = metadata.certification || metadata.rated;
        metaItems.push(cert);
      }

      // 2b. Year & Status
      if (metadata.year) {
        const yearStatus = document.createElement("span");
        yearStatus.className = "show-page-meta-text show-page-meta-year";

        let cleanYear = metadata.year;
        // Fix "2024-" -> "2024" if we are appending Ongoing
        if (cleanYear.endsWith("-") || cleanYear.endsWith("–")) {
          cleanYear = cleanYear.slice(0, -1);
        }

        const statusSuffix =
          metadata.status === "Ongoing" || metadata.status === "Continuing"
            ? "-Ongoing"
            : "";

        yearStatus.textContent = `${cleanYear}${statusSuffix}`;
        metaItems.push(yearStatus);
      }

      // 2c. Runtime
      if (metadata.runtime) {
        const runtime = document.createElement("span");
        runtime.className = "show-page-meta-text show-page-meta-runtime";
        runtime.textContent = metadata.runtime;
        metaItems.push(runtime);
      }

      // 2d. Network/Studio (TEXT ONLY PREFERENCE)
      let badgeEntity = metadata.network;
      if (metadata.isAnime && metadata.studio) {
        badgeEntity = metadata.studio;
      }

      if (badgeEntity) {
        const networkBadge = document.createElement("span");
        networkBadge.className = "show-page-network show-page-meta-text";
        const networkName = badgeEntity.name || badgeEntity;
        networkBadge.textContent = networkName;
        metaItems.push(networkBadge);
      }

      // Append Items with Separators
      metaItems.forEach((item, index) => {
        customMetaRow.appendChild(item);

        // Add separator if not the last item
        if (index < metaItems.length - 1) {
          const sep = document.createElement("span");
          sep.className = "show-page-meta-separator";
          sep.innerHTML = "●"; // Bullet entity
          customMetaRow.appendChild(sep);
        }
      });

      if (metaItems.length > 0) replaced++;

      // -----------------------------------------------------------
      // DOM INSERTION (The "No Jumping" Logic)
      // -----------------------------------------------------------

      // Determine Anchor Point:
      // 1. Prefer Logo Image (Best)
      // 2. Fallback to Logo Placeholder (Text Title) - Apply styling!
      // 3. Fallback to Top (Safety)

      let insertionPoint = null;

      if (mainLogo) {
        insertionPoint = mainLogo.nextSibling;
      } else {
        // Check for user-identified placeholder
        const placeholder = metaContainer.querySelector(
          ".logo-placeholder-rE1ld",
        );
        if (placeholder) {
          placeholder.classList.add("show-page-missing-logo-title");
          insertionPoint = placeholder.nextSibling;
        } else {
          insertionPoint = metaContainer.firstChild;
        }
      }

      // Helper to insert and advance anchor
      const insertNext = (node) => {
        if (!node) return;
        // If node is already in DOM, move it (insertBefore handles move)
        metaContainer.insertBefore(node, insertionPoint);
        // Update insertion point to be after the node we just inserted
        insertionPoint = node.nextSibling;
      };

      // 1. Tagline
      if (taglineEl) insertNext(taglineEl);

      // 2. Meta Row
      if (metaItems.length > 0) insertNext(customMetaRow);

      // 3. Ratings
      if (ratingsWrapper) insertNext(ratingsWrapper);

      // 4. Genres (Move if exists)
      if (genresWrapper) {
        // Standard placement logic for genres (keeping existing logic for desc compatibility)
        // But guarding against "Jumping"
        if (description && description.parentNode === metaContainer) {
          if (genresLabel) metaContainer.insertBefore(genresLabel, description);
          metaContainer.insertBefore(genresWrapper, genresLabel || description);
        } else {
          insertNext(genresWrapper);
        }
        replaced++;
      }

      // Cleanup
      if (imdbButton) imdbButton.remove();

      // 4. Plot / Description Replacement
      if (
        description &&
        (metadata.plot || metadata.overview || metadata.description)
      ) {
        const plotText =
          metadata.plot || metadata.overview || metadata.description;
        // Keep the Label if it exists inside
        const existingLabel = description.querySelector(
          ".label-container-_VXZt",
        );

        description.textContent = plotText;

        // Restore label if it was wiped
        if (existingLabel) {
          description.insertBefore(existingLabel, description.firstChild);
        }
        replaced++;
      }

      metaLinksSections.forEach((s) => s.remove());

      if (genresWrapper) {
        if (description) {
          if (genresLabel) metaContainer.insertBefore(genresLabel, description);
          metaContainer.insertBefore(genresWrapper, genresLabel || description);
        } else {
          metaContainer.appendChild(genresWrapper);
        }
        replaced++;
      }

      if (castWrapper) {
        metaContainer.appendChild(castWrapper);
        replaced++;
      }

      // Lazy images
      if (intersectionObserver) {
        metaContainer
          .querySelectorAll("img[data-src]")
          .forEach((img) => intersectionObserver.observe(img));
      } else {
        this.activateLazyImages(metaContainer);
      }

      console.log(
        `%c[Show Page Enhancer] ✅ Injected ${replaced} sections successfully!`,
        "color: #00ff00; font-weight: bold",
      );
    }

    static activateLazyImages(container) {
      container.querySelectorAll("img[data-src]").forEach((img) => {
        if (img.dataset.src) {
          img.src = img.dataset.src;
          img.removeAttribute("data-src");
          img.classList.remove("lazy");
        }
      });
    }

    /**
     * Create combined section with Directors (first) and Cast (rest)
     */
    static createCombinedPersonSection(directors, cast) {
      const limitedDirectors = directors.slice(0, CONFIG.MAX_DIRECTORS);
      const limitedCast = cast.slice(0, CONFIG.MAX_CAST);

      if (limitedDirectors.length === 0 && limitedCast.length === 0) return "";

      // Generate Directors HTML
      let directorsHTML = limitedDirectors
        .map(
          (person) => `
                <div class="show-page-person-item" data-name="${
                  person.name
                }" data-role="director">
                    <img data-src="${person.image || CONFIG.DEFAULT_AVATAR}" 
                         src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
                         class="show-page-person-image lazy" 
                         alt="${person.name}"
                         draggable="false">
                    <span class="show-page-person-name">${person.name}</span>
                    <span class="show-page-person-character spec-director">Director</span>
                </div>
            `,
        )
        .join("");

      // Generate Cast HTML
      const castHTML = limitedCast
        .map(
          (person) => `
                <div class="show-page-person-item" data-name="${
                  person.name
                }" data-role="cast">
                    <img data-src="${person.image || CONFIG.DEFAULT_AVATAR}" 
                         src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
                         class="show-page-person-image lazy" 
                         alt="${person.name}"
                         draggable="false">
                    <span class="show-page-person-name">${person.name}</span>
                    ${
                      person.character
                        ? `<span class="show-page-person-character">${person.character}</span>`
                        : ""
                    }
                </div>
            `,
        )
        .join("");

      // Conditional Sidebar: Only render directors if they exist
      const directorSidebarData =
        limitedDirectors.length > 0
          ? `
                        <div class="show-page-directors-sidebar">
                            ${directorsHTML}
                        </div>
            `
          : "";

      // Layout Adjustment: If no directors, we rely on flex-grow in CSS to expand the cast mosaic
      // No extra class needed, CSS flex-grow: 1 on mosaic handles it.

      return `
                <div class="${CONFIG.CAST_SECTION_CLASS}">
                    <div class="show-page-section-label">Cast & Crew</div>
                    <div class="show-page-persons-layout">
                        ${directorSidebarData}
                        <div class="show-page-cast-mosaic">
                            ${castHTML}
                        </div>
                    </div>
                </div>
            `;
    }
  }
  /**
   * Episode injector for series
   */
  class EpisodeInjector {
    constructor() {
      this.processedEpisodes = new Set();
      this.currentMetadata = null;
    }

    init() {
      // Initialization is silent - no console spam
    }

    disconnect() {
      this.cleanupInjectedContent();
      this.processedEpisodes.clear();
      this.currentMetadata = null;
    }

    // Context Strategy: Receive full metadata object
    updateContext(metadata) {
      this.currentMetadata = metadata;

      // Re-run if we have a container already
      const container = document.querySelector(CONFIG.EPISODES_CONTAINER);
      if (container && this.currentMetadata) {
        this.handleEpisodesMutation(container);
      }
    }

    cleanupInjectedContent() {
      const descriptions = document.querySelectorAll("." + CONFIG.DESC_CLASS);
      descriptions.forEach((el) => el.remove());

      const processed = document.querySelectorAll(".spe-processed");
      processed.forEach((el) => el.classList.remove("spe-processed"));
    }

    // External Reset: Force fresh start (e.g. for Season change)
    reset() {
      this.cleanupInjectedContent();
      this.processedEpisodes.clear();
    }

    handleEpisodesMutation(container) {
      if (!this.currentMetadata) return;

      const season = this.getCurrentSeason();
      if (season === null || season === undefined) return;

      const episodes = container.querySelectorAll(CONFIG.EPISODE_ITEM);

      for (const episodeEl of episodes) {
        if (episodeEl.classList.contains("spe-processed")) continue;

        episodeEl.classList.add("spe-processed");
        this.injectDescription(season, episodeEl);
      }
    }

    // Correctly locate the ACTIVE season
    getCurrentSeason() {
      // Priority 1: Check Route State (Most Reliable)
      const routeState = RouteDetector.getRouteState();
      if (routeState && routeState.season) {
        return parseInt(routeState.season, 10);
      }

      // Priority 2: Fallback to DOM Scraper
      const labels = document.querySelectorAll(
        `${CONFIG.SEASONS_BAR} ${CONFIG.SEASON_LABEL}`,
      );
      if (labels.length === 0) return 1;

      let targetLabel = labels[0]; // Default to first

      // If multiple seasons, find the one with an indication of being active
      if (labels.length > 1) {
        for (const label of labels) {
          if (
            label.classList.length > 1 ||
            label.className.includes("active") ||
            label.className.includes("selected") ||
            label.className.includes("current")
          ) {
            targetLabel = label;
            break;
          }
        }
      }

      const text = targetLabel.textContent.trim();
      const match = text.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : 1;
    }

    getEpisodeNumber(episodeEl) {
      const titleEl = episodeEl.querySelector(CONFIG.EPISODE_TITLE);
      if (!titleEl) return null;

      const text = titleEl.textContent.trim();
      const match = text.match(/^(\d+)/);
      return match ? parseInt(match[1], 10) : null;
    }

    /**
     * Extract the episode title from DOM (without episode number prefix)
     */
    getEpisodeTitle(episodeEl) {
      const titleEl = episodeEl.querySelector(CONFIG.EPISODE_TITLE);
      if (!titleEl) return null;

      const text = titleEl.textContent.trim();
      // Remove leading episode number and separator (e.g., "1. ", "01 - ")
      return text.replace(/^\d+[\.\-:\s]+/, "").trim();
    }

    /**
     * Normalize title for matching (case-insensitive, punctuation-free)
     */
    normalizeTitle(title) {
      if (!title) return "";
      return title
        .toLowerCase()
        .replace(/^episode\s*\d+[:\.\-\s]*/i, "") // Remove "Episode X:" prefix
        .replace(/[^\w\s]/g, "") // Remove punctuation
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim();
    }

    /**
     * Find matching episode using hybrid approach:
     * 1. Try exact season+episode match (fast path)
     * 2. Fallback to title matching (robust path)
     */
    findMatchingEpisode(season, episodeNum, domTitle) {
      const videos = this.currentMetadata?.videos;
      if (!videos || !Array.isArray(videos)) return null;

      // Fast path: Exact season + episode match
      let episode = videos.find(
        (ep) =>
          parseInt(ep.season) === season && parseInt(ep.episode) === episodeNum,
      );

      if (episode) return episode;

      // Fallback: Title matching (for absolute vs seasonal numbering mismatch)
      if (domTitle) {
        const normalizedDomTitle = this.normalizeTitle(domTitle);

        episode = videos.find((ep) => {
          if (!ep.title) return false;
          const normalizedDbTitle = this.normalizeTitle(ep.title);
          // Check if either contains the other (handles partial matches)
          return (
            normalizedDbTitle.includes(normalizedDomTitle) ||
            normalizedDomTitle.includes(normalizedDbTitle)
          );
        });

        if (episode) {
          // Title fallback matched - silent unless debugging
        }
      }

      return episode;
    }

    // Feature: Inject episode description using hybrid matching
    injectDescription(season, episodeEl) {
      if (!document.body.contains(episodeEl)) return;

      const episodeNum = this.getEpisodeNumber(episodeEl);
      if (episodeNum === null) return;

      const infoContainer = episodeEl.querySelector(CONFIG.INFO_CONTAINER);
      if (!infoContainer) return;

      // Check if already has description
      if (infoContainer.querySelector("." + CONFIG.DESC_CLASS)) return;

      // Get DOM episode title for fallback matching
      const domTitle = this.getEpisodeTitle(episodeEl);

      // Find episode using hybrid matching
      const episode = this.findMatchingEpisode(season, episodeNum, domTitle);

      if (episode?.overview) {
        const descEl = document.createElement("p");
        descEl.className = CONFIG.DESC_CLASS;
        descEl.textContent = episode.overview;
        infoContainer.appendChild(descEl);
      }
    }
  }

  /**
   * Debounce utility for rate-limiting function execution
   * @param {Function} fn - Function to debounce
   * @param {number} delay - Delay in milliseconds
   * @returns {Function} Debounced function
   */
  function debounce(fn, delay) {
    let timeoutId = null;
    return function (...args) {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /**
   * Main show page enhancer
   */
  class ShowPageEnhancer {
    constructor() {
      this.hashChangeHandler = this.handleRouteChange.bind(this);
      this.clickHandler = this.handleClick.bind(this);
      this.mutationObserver = null;
      this.intersectionObserver = null;
      this.currentMetadata = null;
      this.isProcessing = false;
      this.debounceTimer = null;
      this.lastHash = "";
      this.lastInjectedId = null;
      this.lastSeasonParam = null;
      this._observerConnected = false; // Track observer lifecycle
      this.episodeInjector = new EpisodeInjector();
    }

    init() {
      // Dependency check (silent retry)
      if (
        !window.metadataHelper ||
        !window.PopupTemplates ||
        !window.MetadataModules?.metadataStorage
      ) {
        setTimeout(() => this.init(), 500);
        return;
      }

      // Init Episode Injector (no storage needed - uses in-memory videos array)
      this.episodeInjector.init();

      // Setup listeners
      window.addEventListener("hashchange", this.hashChangeHandler);
      document.body.addEventListener("click", this.clickHandler); // Delegated click listener
      this.setupMetadataListener(); // Listener for background updates

      // Setup observers
      this.setupIntersectionObserver();
      this.setupMutationObserver();

      // Initial check
      if (RouteDetector.isDetailPage()) {
        this.handleRouteChange();
      }

      // Expose cleanup for debugging
      window.ShowPageEnhancer.cleanup = () => this.cleanup();
    }

    cleanup() {
      window.removeEventListener("hashchange", this.hashChangeHandler);
      document.body.removeEventListener("click", this.clickHandler);
      if (this.metadataListener) {
        window.removeEventListener("metadata-updated", this.metadataListener);
        this.metadataListener = null;
      }
      if (this.mutationObserver) this.mutationObserver.disconnect();
      if (this.intersectionObserver) this.intersectionObserver.disconnect();
      if (this.episodeInjector) this.episodeInjector.disconnect(); // Clean up episodes
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.currentMetadata = null;
      this.lastInjectedId = null;
      MetadataInjector.clearInjectedContent();
    }

    setupMetadataListener() {
      this.metadataListener = (event) => this.handleMetadataUpdate(event);
      window.addEventListener("metadata-updated", this.metadataListener);
    }

    handleMetadataUpdate(event) {
      // Validation
      if (!event || !event.detail) return;
      const { id, imdb } = event.detail;

      // Check if we are currently viewing the updated item
      const routeInfo = RouteDetector.extractFromHash();
      if (!routeInfo || !routeInfo.id) return;

      if (routeInfo.id === id || routeInfo.id === imdb) {
        console.log(
          `[Show Page Enhancer] Received metadata update for active item: ${id}`,
        );

        // Force re-process
        // We clear current metadata to force a fresh lookup
        this.currentMetadata = null;

        // Clear existing injection so it can be replaced
        // Note: processRoute will eventually call identifyAndPrepare which does usage lookup
        // But we need to make sure injectIfReady proceeds.

        const container = document.querySelector(CONFIG.META_CONTAINER);
        if (container) {
          // Remove marker to allow re-injection
          container.classList.remove(CONFIG.MARKER_CLASS);
          // Also clean up content to prevent duplication before new content arrives
          // actually injectMetadata calls clearInjectedContent, but let's be safe
          MetadataInjector.clearInjectedContent();
        }

        // Trigger processing
        this.processRoute(true); // force=true
      }
    }

    setupIntersectionObserver() {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const img = entry.target;
              if (img.dataset.src) {
                img.src = img.dataset.src;
                img.removeAttribute("data-src");
                img.classList.remove("lazy");
                img.classList.add("fade-in");
              }
              this.intersectionObserver.unobserve(img);
            }
          });
        },
        { rootMargin: "100px" },
      );
    }

    setupMutationObserver() {
      // Debounced handler to prevent CPU spikes from React's frequent DOM updates
      const debouncedHandler = debounce(() => {
        try {
          // 1. Guard against non-detail pages OR active player
          const isPlayer = !!(
            document.querySelector("video") ||
            document.querySelector(".video-player") ||
            document.querySelector(".player-panel-lBK74")
          );

          if (!RouteDetector.isDetailPage() || isPlayer) {
            if (isPlayer) {
              // Release focus from injected buttons to prevent spacebar hijacking
              if (
                document.activeElement &&
                document
                  .querySelector(CONFIG.META_CONTAINER)
                  ?.contains(document.activeElement)
              ) {
                document.activeElement.blur();
              }

              if (document.querySelector(`.${CONFIG.MARKER_CLASS}`)) {
                MetadataInjector.clearInjectedContent();
              }
            }
            return;
          }

          // 2. Refresh injection if container is missing markers
          const container = document.querySelector(CONFIG.META_CONTAINER);
          if (container && !container.classList.contains(CONFIG.MARKER_CLASS)) {
            if (this.currentMetadata) {
              this.injectIfReady(container);
            } else {
              this.processRoute();
            }
          }

          // 3. Delegate to EpisodeInjector
          const episodesList = document.querySelector(
            CONFIG.EPISODES_CONTAINER,
          );
          if (episodesList) {
            this.episodeInjector.handleEpisodesMutation(episodesList);
          }
        } catch (err) {
          console.error("[Show Page Enhancer] Error in MutationObserver:", err);
        }
      }, CONFIG.DEBOUNCE_DELAY);

      this.mutationObserver = new MutationObserver(debouncedHandler);
      // Note: Observer is connected/disconnected via handleRouteChange()
    }

    handleClick(event) {
      // Only process clicks on the detail page
      if (!RouteDetector.isDetailPage()) return;

      // 1. Person Clicks (Cast/Director)
      const personItem = event.target.closest(".show-page-person-item");
      if (personItem) {
        const name = personItem.dataset.name;
        if (name) {
          window.location.href = `#/search?search=${encodeURIComponent(name)}`;
        }
        return;
      }

      // 2. Genre/Tag Clicks
      const genreBadge = event.target.closest(".metadata-popup-genre-badge"); // We reuse this class for badges
      if (genreBadge) {
        const genre = genreBadge.dataset.genre;
        const type = genreBadge.dataset.type; // 'movie' or 'series'

        if (genre && type) {
          this.handleGenreClick(genre, type);
        }
      }
    }

    handleGenreClick(genre, type) {
      // Standard Cinemeta Genres (Safe for Discover)
      const STANDARD_GENRES = new Set([
        "action",
        "adventure",
        "animation",
        "biography",
        "comedy",
        "crime",
        "documentary",
        "drama",
        "family",
        "fantasy",
        "history",
        "horror",
        "mystery",
        "romance",
        "sci-fi",
        "sport",
        "thriller",
        "war",
        "western",
        "reality-tv",
        "talk-show",
        "game-show",
      ]);

      const lowerGenre = genre.toLowerCase();

      if (STANDARD_GENRES.has(lowerGenre)) {
        window.location.href = `#/discover/https%3A%2F%2Fv3-cinemeta.strem.io%2Fmanifest.json/${type}/top?genre=${encodeURIComponent(
          genre,
        )}`;
      } else {
        window.location.href = `#/search?search=${encodeURIComponent(genre)}`;
      }
    }

    // ---------------------------

    // --- Interaction Control ---

    /**
     * Set container interactivity state (CSS-only approach)
     * Uses 'inert' attribute for accessibility + spe-inert class for styling
     */
    setContainerState(isActive) {
      const targets = [
        document.querySelector(CONFIG.META_CONTAINER),
        document.querySelector(CONFIG.EPISODES_CONTAINER),
        document.querySelector(".hero-container"),
        document.querySelector(".metadata-hover-popup"),
      ];

      targets.forEach((el) => {
        if (!el) return;

        // Toggle inert attribute (accessibility) and class (CSS styling)
        el.toggleAttribute("inert", !isActive);
        el.toggleAttribute("aria-hidden", !isActive);
        el.classList.toggle("spe-inert", !isActive);
      });
    }

    handleRouteChange() {
      // Invalidate route cache on navigation
      RouteDetector.invalidateCache();
      const routeState = RouteDetector.getRouteState();

      // State Management: Only PLAYER view needs inert state
      if (routeState.view === "PLAYER") {
        this.setContainerState(false);
        this.disconnectMutationObserver();
        this.isProcessing = false;
        return;
      }

      // Ensure observer is connected on detail pages
      this.connectMutationObserver();
      this.setContainerState(true);

      // Trigger metadata processing directly (observer handles DOM changes)
      // No additional debounce needed - observer is already debounced
      this.processRoute();
    }

    connectMutationObserver() {
      if (this.mutationObserver && !this._observerConnected) {
        const target =
          document.querySelector(".application-S5_Fh") || document.body;
        this.mutationObserver.observe(target, {
          childList: true,
          subtree: true,
        });
        this._observerConnected = true;
      }
    }

    disconnectMutationObserver() {
      if (this.mutationObserver && this._observerConnected) {
        this.mutationObserver.disconnect();
        this._observerConnected = false;
      }
    }

    async processRoute(force = false) {
      if (this.isProcessing && !force) return;
      this.isProcessing = true;

      const routeInfo = RouteDetector.extractFromHash();
      if (!routeInfo || !routeInfo.id) {
        this.isProcessing = false;
        return;
      }

      // Season Check (For Series Description Updates)
      const currentSeason = routeInfo.season || null;
      const hasSeasonChanged = currentSeason !== this.lastSeasonParam;
      this.lastSeasonParam = currentSeason;

      if (hasSeasonChanged) {
        if (this.episodeInjector) this.episodeInjector.reset();
      }

      // ID Check - If same show, just re-inject/update context immediately
      // FIX: Removed cache optimization to force fresh DB lookup on navigation.
      // This ensures we pick up metadata enriched by Hover Panel while user was elsewhere.
      /* 
      if (
        this.currentMetadata &&
        (this.currentMetadata.imdb === routeInfo.id ||
          this.currentMetadata.id === routeInfo.id)
      ) {
         // ... previously returned early
      }
      */

      console.log(
        "[Show Page Enhancer] Processing route:",
        routeInfo.type,
        routeInfo.id,
        hasSeasonChanged ? `[Season ${currentSeason}]` : "",
      );

      try {
        await this.identifyAndPrepare(RouteDetector.getRouteState());
      } catch (err) {
        console.error("[Show Page Enhancer] Error processing route:", err);
      } finally {
        this.isProcessing = false;
      }
    }

    async identifyAndPrepare(routeInfo) {
      let metadata = null;

      if (
        routeInfo &&
        window.metadataServices &&
        window.metadataServices.idLookup
      ) {
        try {
          metadata = await window.metadataServices.idLookup.findByAnyId(
            routeInfo.id,
            routeInfo.source || "imdb",
            { type: routeInfo.type },
          );
        } catch (e) {
          console.warn("[Show Page Enhancer] ID Lookup failed:", e);
        }
      }

      if (metadata) {
        this.currentMetadata = metadata;
        const container = document.querySelector(CONFIG.META_CONTAINER);
        if (container) {
          this.injectIfReady(container);
        }
      }
    }

    injectIfReady(container) {
      if (!container) return;

      // 1. Player check
      if (
        document.querySelector("video") ||
        document.querySelector(".video-player")
      )
        return;

      // 2. Metadata availability
      if (!this.currentMetadata) return;

      // 3. ID Validation
      const routeInfo = RouteDetector.extractFromHash();
      if (!routeInfo) return;

      let isCorrectMetadata =
        this.currentMetadata.imdb === routeInfo.id ||
        this.currentMetadata.id === routeInfo.id;
      if (!isCorrectMetadata && routeInfo.source) {
        const sourceIds = this.currentMetadata[routeInfo.source];
        if (sourceIds) {
          if (Array.isArray(sourceIds)) {
            isCorrectMetadata = sourceIds.some(
              (id) => String(id) === String(routeInfo.id),
            );
          } else {
            isCorrectMetadata = String(sourceIds) === String(routeInfo.id);
          }
        }
      }
      if (!isCorrectMetadata) return;

      // 4. Update Episode Context (ALWAYS run this, even if already injected)
      // This ensures season changes update descriptions without needing full re-injection
      if (this.episodeInjector) {
        this.episodeInjector.updateContext(this.currentMetadata);
      }

      // 5. Already Injected? (Idempotency Check)
      if (container.classList.contains(CONFIG.MARKER_CLASS)) {
        return;
      }

      // 6. Proceed with full injection (Movies, Series Detail, and now Series Streams)
      // Container isolation via setContainerState() handles interactivity safely
      const routeState = RouteDetector.getRouteState();
      const type = this.currentMetadata.type || routeState.type;

      console.log(
        "[Show Page Enhancer] Injecting for:",
        this.currentMetadata.title,
        `(${type})`,
      );
      MetadataInjector.injectMetadata(
        this.currentMetadata,
        this.intersectionObserver,
      );
      this.lastInjectedId = routeInfo.id;

      // State is managed in handleRouteChange() - this is just safety net for injection path
      this.setContainerState(true);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () =>
      new ShowPageEnhancer().init(),
    );
  } else {
    new ShowPageEnhancer().init();
  }
})();
