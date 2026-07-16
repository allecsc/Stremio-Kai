/**
 * @name Show Page Enhancer
 * @description Enriches Stremio detail pages with metadata from the database
 * @version 1.5.1
 * @patched 2026-07-16 — DOM-first detail shell watcher (no preventDefault)
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
 *
 * Changelog v1.3.1:
 * - Fetch metadata on cache miss (Discover → Detail navigation)
 * - Enrich incomplete cache entries on detail page load
 * - Relax DOM readiness gate when enriched metadata is already available
 *
 * Changelog v1.3.2:
 * - Force full fetch when cache has stub entries (Discover catalog scans)
 * - Enrich even when metaSource is "complete" but cast/ratings are missing
 * - Remove description DOM gate; retry injection until container is ready
 * - Pull TMDB/MDBList private metadata for cast on detail page open
 *
 * Changelog v1.3.3:
 * - Detect movie detail shown inside Discover tab (hash stays #/discover/...)
 * - Extract IMDb ID from DOM when URL has no /detail/ segment
 *
 * Changelog v1.3.4:
 * - Single priority fetch path (removed duplicate TMDB/Cinemeta enrichment passes)
 * - Immediate UI inject + faster DOM retries (50ms)
 * - Require cast photos before treating cache as "complete"
 *
 * Changelog v1.3.5:
 * - Progressive inject: show Cinemeta data immediately, TMDB cast follows
 * - Bypass slow storage pipeline on detail pages (direct API fetch)
 * - Prefetch metadata on poster click before navigation
 * - TMDB priority mode: credits-only fetch (no alt titles / heavy bundles)
 *
 * Changelog v1.3.6:
 * - Expose prefetchDetail() for Discover → Board navigation bridge
 * - Discover catalog clicks also parsed from meta-item containers
 *
 * Changelog v1.3.8:
 * - TMDB-only Discover routes (tmdb:123) fetch via TMDB directly
 * - processAndSaveData fallback even when metadata is null
 * - Broader extractDetailFromDOM (metadetails, metahub, page-wide links)
 * - Debounced processRoute; clear injection only when movie ID changes
 * - Reduced injection retries (8×100ms) to stop F5 flicker/jumps
 * - Map TMDB cast photo → image for UI injection
 *
 * Changelog v1.3.9:
 * - Prefetch stores metadata promise (reuse on navigation, no double fetch)
 * - Progressive inject: Cinemeta UI ~1s, TMDB cast upgrades in place
 * - Skip slow processAndSaveData when partial metadata is already usable
 * - saveTitle runs in background (no blocking before inject)
 * - hashchange on detail pages skips debounce; Discover redirect uses rAF
 *
 * Changelog v1.4.0:
 * - Discover prefetch uses Board pipeline (priorityProcessElement → IndexedDB)
 * - Detail page reads cache like Board (findByAnyId → inject, no parallel API path)
 * - mousedown prefetch on catalog items (same timing as Board hover enrichment)
 *
 * Changelog v1.4.1:
 * - TMDB→IMDb via TMDB API (Discover tmdb: links no longer hit 15s title search)
 * - Detail page enrichment non-blocking (UI updates via metadata-updated)
 * - metadata-updated matches tmdb: routes; Discover viewport priority scan
 *
 * Changelog v1.4.2:
 * - Root fix: metadata API no longer waits 15s for catalog on detail pages (main.js)
 * - Instant UI: parallel Cinemeta+TMDB display fetch; Board enrich in background
 *
 * Changelog v1.4.3:
 * - Early hashchange + metadata-modules-ready: works on first Discover click (no Ctrl+F5)
 *
 * Changelog v1.4.4:
 * - Discover click forces processDetailRoute (Stremio native nav bypasses hashchange)
 * - Mutation observer always on; longer inject retries; no PopupTemplates init gate
 * - metadata-core-ready wakes enhancer immediately when storage is live
 *
 * Changelog v1.4.5:
 * - Split init: observers/listeners run before metadata deps (no Ctrl+F5)
 * - Detail watchdog retries inject every 500ms until Kai UI appears
 * - navigation.js: preventDefault + force #/detail/ hash on Discover click
 *
 * Changelog v1.4.6:
 * - Root fix: navigation no longer blocks Stremio click (preventDefault broke React mount)
 * - MutationObserver triggers on detail DOM shell even when hash is still #/discover/
 * - resolveActiveRouteInfo: match metadata via DOM-extracted ID (tmdb/imdb)
 * - Persistent detail-shell watcher at boot (independent of hash/route cache)
 *
 * Changelog v1.4.7:
 * - Pin route ID from Discover poster click (kai-detail-navigate carried ID but enhancer ignored it)
 * - resolveActiveRoute uses pinned ID when hash=#/discover and DOM has no imdb link yet
 *
 * Changelog v1.4.8:
 * - Dedupe identifyAndPrepare + processAndSaveData (fixed 300+ enrich loop)
 * - metadata-updated upgrades inject in-place instead of clear+reprocess
 * - force processRoute no longer stacks parallel runs for same route
 *
 * Changelog v1.5.0:
 * - Inject into visible meta container only (Discover had hidden duplicate DOM)
 * - Persistent inject loop until spe-injected marker appears
 * - navigation sets #/detail/ hash once detail DOM is visible (matches Ctrl+F5 route)
 *
 * Changelog v1.5.1:
 * - Discover catalog scroll: disconnect DOM observers when no detail shell visible
 * - Clear pinned route on catalog grid; remove viewport prefetch scan on scroll
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
    "%c[Show Page Enhancer] v1.5.1 loaded (Discover scroll perf)",
    "color: #7b5bf5; font-weight: bold",
  );

  function showKaiToast(message, type = "info") {
    try {
      let el = document.getElementById("kai-metadata-toast");
      if (!el) {
        el = document.createElement("div");
        el.id = "kai-metadata-toast";
        el.style.cssText =
          "position:fixed;bottom:18px;right:18px;z-index:999999;padding:10px 14px;border-radius:8px;font:12px/1.4 Segoe UI,sans-serif;color:#fff;background:rgba(30,30,30,0.92);box-shadow:0 4px 16px rgba(0,0,0,0.35);pointer-events:none;max-width:320px;";
        document.body.appendChild(el);
      }
      el.textContent = message;
      el.style.background =
        type === "error"
          ? "rgba(176,48,48,0.95)"
          : type === "ok"
            ? "rgba(36,128,72,0.95)"
            : "rgba(30,30,30,0.92)";
      clearTimeout(el._kaiToastTimer);
      el._kaiToastTimer = setTimeout(() => el.remove(), 5000);
    } catch (_) {
      /* ignore */
    }
  }

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

  function isElementVisible(el) {
    if (!el?.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
  }

  /** Prefer the largest visible meta container (Discover may mount hidden duplicates). */
  function getMetaContainer() {
    let best = null;
    let bestArea = 0;

    for (const el of document.querySelectorAll(CONFIG.META_CONTAINER)) {
      if (!isElementVisible(el)) continue;
      const rect = el.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > bestArea) {
        bestArea = area;
        best = el;
      }
    }
    if (best) return best;

    for (const root of document.querySelectorAll('[class*="metadetails-container"]')) {
      if (!isElementVisible(root)) continue;
      const inner = root.querySelector(CONFIG.META_CONTAINER);
      return inner && isElementVisible(inner) ? inner : root;
    }

    return document.querySelector(CONFIG.META_CONTAINER);
  }

  /** Fast check — no getBoundingClientRect (used during catalog scroll). */
  function hasVisibleDetailShell() {
    for (const el of document.querySelectorAll(
      `${CONFIG.META_CONTAINER}, [class*="metadetails-container"]`,
    )) {
      if (!el.isConnected) continue;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width > 2 && rect.height > 2) return true;
    }
    return false;
  }

  /**
   * Route detector and ID extractor with caching
   */
  class RouteDetector {
    // Route state cache (invalidated on hash change)
    static _cache = { hash: "", state: null };
    // ID captured from Discover poster click before DOM/hash expose it
    static _pinnedRoute = null;

    static pinRoute(parsed) {
      if (!parsed?.id) return;
      RouteDetector._pinnedRoute = {
        view: "DETAIL",
        type: parsed.type || "movie",
        id: String(parsed.id),
        source: parsed.source || "imdb",
        fromDiscover: true,
        pinnedAt: Date.now(),
      };
      RouteDetector.invalidateCache();
    }

    static clearPinnedRoute() {
      RouteDetector._pinnedRoute = null;
    }

    static getPinnedRoute() {
      const pinned = RouteDetector._pinnedRoute;
      if (!pinned?.id) return null;
      if (Date.now() - (pinned.pinnedAt || 0) > 120000) {
        RouteDetector._pinnedRoute = null;
        return null;
      }
      return pinned;
    }

    // Known Route Regular Expressions
    static ROUTES = {
      PLAYER: /^#\/player\//,
      STREAMS: /^#\/detail\/(movie|series)\/([^\/]+)\/([^\/?]+)/,
      DETAIL: /^#\/detail\/(movie|series)\/([^\/?]+)/,
    };

    static getRouteState() {
      const hash = window.location.hash;
      const domDetail = RouteDetector.extractDetailFromDOM();
      const cacheKey = domDetail?.id
        ? `${hash}::${domDetail.type}::${domDetail.id}`
        : hash;

      // Return cached state if route context hasn't changed
      if (RouteDetector._cache.hash === cacheKey && RouteDetector._cache.state) {
        return RouteDetector._cache.state;
      }

      let state;

      // 1. Player (Nuclear Cleanup Phase)
      if (RouteDetector.ROUTES.PLAYER.test(hash)) {
        state = { view: "PLAYER", id: null };
        RouteDetector._cache = { hash: cacheKey, state };
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
        RouteDetector._cache = { hash: cacheKey, state };
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
        RouteDetector._cache = { hash: cacheKey, state };
        return state;
      }

      // 4. Discover (and similar) routes keep #/discover/... while showing detail inline
      if (/^#\/(discover|library)\//.test(hash) && domDetail?.id) {
        state = {
          view: "DETAIL",
          type: domDetail.type,
          id: domDetail.id,
          source: domDetail.source || "imdb",
          fromDiscover: hash.startsWith("#/discover/"),
        };
        RouteDetector._cache = { hash: cacheKey, state };
        return state;
      }

      // 5. Fallback: visible detail shell in DOM (SPA remount, Discover inline, delayed hash)
      if (domDetail?.id && getMetaContainer()) {
        state = {
          view: "DETAIL",
          type: domDetail.type,
          id: domDetail.id,
          source: domDetail.source || "imdb",
          fromDiscover: /^#\/discover/.test(hash),
        };
        RouteDetector._cache = { hash: cacheKey, state };
        return state;
      }

      state = { view: "UNKNOWN", id: null };
      RouteDetector._cache = { hash: cacheKey, state };
      return state;
    }

    static invalidateCache() {
      RouteDetector._cache = { hash: "", state: null };
    }

    static parseId(idString) {
      if (!idString) return { id: null, source: "imdb" };

      // Handle case where ID might still have a / or ? attached
      idString = idString.split("/")[0].split("?")[0];

      // Series detail URLs: tt0086659:1 → tt0086659 (season suffix)
      if (idString.startsWith("tt") && idString.includes(":")) {
        idString = idString.split(":")[0];
      }

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

    /** Route from pinned click, hash, and/or mounted detail DOM. */
    static resolveActiveRoute() {
      const pinned = RouteDetector.getPinnedRoute();
      if (pinned?.id) return pinned;

      const state = RouteDetector.getRouteState();
      if (state?.id && state.view !== "UNKNOWN") return state;

      const dom = RouteDetector.extractDetailFromDOM();
      if (!dom?.id) return null;

      return {
        view: "DETAIL",
        type: dom.type || "movie",
        source: dom.source || "imdb",
        id: dom.id,
        fromDiscover: (window.location.hash || "").startsWith("#/discover"),
      };
    }

    static hasDetailShell() {
      return !!getMetaContainer();
    }

    static isDetailContext() {
      if (RouteDetector.isDetailPage()) return true;
      if (hasVisibleDetailShell()) return true;
      const pinned = RouteDetector.getPinnedRoute();
      if (pinned?.id && (window.location.hash || "").startsWith("#/detail")) {
        return true;
      }
      return false;
    }

    static isDiscoverCatalogOnly() {
      const hash = window.location.hash || "";
      if (!hash.startsWith("#/discover")) return false;
      return !hasVisibleDetailShell();
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

    static extractDetailFromDOM() {
      const inferType = (root) =>
        root?.querySelector(CONFIG.EPISODES_CONTAINER) ? "series" : "movie";

      const tryFromRoot = (metaContainer) => {
        if (!metaContainer) return null;

        const imdbBtn = metaContainer.querySelector(
          '.imdb-button-container-gGjxp a[href*="tt"]',
        );
        if (imdbBtn) {
          const id = (imdbBtn.getAttribute("href") || "").match(/tt\d+/)?.[0];
          if (id) {
            return { id, type: inferType(metaContainer), source: "imdb" };
          }
        }

        for (const link of metaContainer.querySelectorAll(
          'a[href*="/detail/"]',
        )) {
          const href = decodeURIComponent(link.getAttribute("href") || "");
          const match = href.match(/\/(movie|series)\/([^/?#]+)/);
          if (!match) continue;
          const idInfo = RouteDetector.parseId(match[2]);
          if (idInfo.id) {
            return {
              id: idInfo.id,
              type: match[1],
              source: idInfo.source,
            };
          }
        }

        for (const link of metaContainer.querySelectorAll('a[href*="tt"]')) {
          const id = (link.getAttribute("href") || "").match(/tt\d+/)?.[0];
          if (id) {
            return { id, type: inferType(metaContainer), source: "imdb" };
          }
        }

        const logoImg = metaContainer.querySelector(CONFIG.LOGO_IMAGE);
        if (logoImg?.src) {
          const tt = logoImg.src.match(/tt\d{7,}/);
          if (tt) {
            return {
              id: tt[0],
              type: inferType(metaContainer),
              source: "imdb",
            };
          }
        }

        return null;
      };

      const roots = [];
      const primary = getMetaContainer();
      if (primary) roots.push(primary);

      document
        .querySelectorAll('[class*="metadetails-container"]')
        .forEach((el) => {
          if (!roots.includes(el)) roots.push(el);
        });

      for (const root of roots) {
        const found = tryFromRoot(root);
        if (found) return found;
      }

      for (const link of document.querySelectorAll(
        'a[href*="imdb.com/title/tt"], a[href*="/detail/"]',
      )) {
        const href = decodeURIComponent(link.getAttribute("href") || "");
        const tt = href.match(/tt\d{7,}/);
        if (tt) {
          const detailMatch = href.match(/\/(movie|series)\//);
          return {
            id: tt[0],
            type: detailMatch?.[1] || inferType(link.closest("body")),
            source: "imdb",
          };
        }
        const match = href.match(/\/(movie|series)\/([^/?#]+)/);
        if (match) {
          const idInfo = RouteDetector.parseId(match[2]);
          if (idInfo.id) {
            return {
              id: idInfo.id,
              type: match[1],
              source: idInfo.source,
            };
          }
        }
      }

      return null;
    }
  }

  /**
   * Metadata injection manager
   */
  class MetadataInjector {
    static clearInjectedContent() {
      // 1. Remove specifically injected section elements (these are OUR elements, safe to remove)
      const sections = document.querySelectorAll(
        `.${CONFIG.RATINGS_CLASS}, .${CONFIG.GENRES_CLASS}, .${CONFIG.CAST_SECTION_CLASS}, .show-page-tagline, .show-page-meta-row, .show-page-injected-plot`,
      );
      sections.forEach((el) => el.remove());

      // Remove any injected separators or specific badges if strict cleanup needed
      const networkBadges = document.querySelectorAll(".show-page-network");
      networkBadges.forEach((el) => el.remove());

      // 1b. Restore React-managed elements we hid (instead of removed)
      // This reverses the hiding done in injectMetadata to keep React's DOM in sync.
      document.querySelectorAll("[data-kai-hidden]").forEach((el) => {
        delete el.dataset.kaiHidden;
        el.style.removeProperty("display");
      });

      // 1c. Restore stashed text node content
      const metaContainer = getMetaContainer();
      if (metaContainer) {
        const desc = metaContainer.querySelector(
          ".description-container-yi8iU",
        );
        if (desc) {
          desc.childNodes.forEach((child) => {
            if (child.nodeType === 3 && child._kaiOriginalText != null) {
              child.textContent = child._kaiOriginalText;
              delete child._kaiOriginalText;
            }
          });
        }
      }

      // 2. Clear marker class from any containers but DON'T remove the container itself
      const marked = document.querySelectorAll(`.${CONFIG.MARKER_CLASS}`);
      marked.forEach((el) => el.classList.remove(CONFIG.MARKER_CLASS));

      if (sections.length || marked.length) {
        console.log(
          `[Show Page Enhancer] Cleared ${sections.length} sections and ${marked.length} markers`,
        );
      }
    }

    static injectMetadata(metadata, intersectionObserver) {
      if (!metadata) return;

      const metaContainer = getMetaContainer();
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

      // Cleanup: HIDE React-managed elements instead of removing them.
      // Removing breaks React's fiber tree → removeChild crash on navigation.
      if (imdbButton) {
        imdbButton.dataset.kaiHidden = "true";
        imdbButton.style.setProperty("display", "none", "important");
      }

      // 4. Plot / Description Replacement
      // HIDE React's children instead of destroying them via textContent.
      if (
        description &&
        (metadata.plot || metadata.overview || metadata.description)
      ) {
        const plotText =
          metadata.plot || metadata.overview || metadata.description;
        const existingLabel = description.querySelector(
          ".label-container-_VXZt",
        );

        // Hide React's existing children (preserve for React's unmount)
        Array.from(description.childNodes).forEach((child) => {
          if (child.nodeType === 1 && child !== existingLabel) {
            // Element node — hide it
            child.dataset.kaiHidden = "true";
            child.style.setProperty("display", "none", "important");
          } else if (child.nodeType === 3) {
            // Text node — stash content and clear visually
            child._kaiOriginalText = child.textContent;
            child.textContent = "";
          }
        });

        // Add our plot text as a new element
        const plotSpan = document.createElement("span");
        plotSpan.className = "show-page-injected-plot";
        plotSpan.textContent = plotText;
        if (existingLabel) {
          existingLabel.after(plotSpan);
        } else {
          description.prepend(plotSpan);
        }
        replaced++;
      }

      metaLinksSections.forEach((s) => {
        s.dataset.kaiHidden = "true";
        s.style.setProperty("display", "none", "important");
      });

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
      this.prefetchHandler = this.handlePrefetchMousedown.bind(this);
      this.mutationObserver = null;
      this.intersectionObserver = null;
      this.currentMetadata = null;
      this.isProcessing = false;
      this.debounceTimer = null;
      this.lastHash = "";
      this.lastInjectedId = null;
      this._prefetchCache = new Map();
      this._discoverCatalogObserved = new WeakSet();
      this.discoverCatalogObserver = null;
      this.lastSeasonParam = null;
      this.lastDiscoverDetailId = null;
      this._activeRouteKey = "";
      this._processRouteTimer = null;
      this._injectionRetryTimer = null;
      this._detailWatchdogTimer = null;
      this._observerConnected = false; // Track observer lifecycle
      this._shellReady = false;
      this._metadataReady = false;
      this._ready = false;
      this._pendingRoute = false;
      this._identifyInflight = new Map();
      this.episodeInjector = new EpisodeInjector();
    }

    markPendingRoute() {
      this._pendingRoute = true;
    }

    flushPendingRoute() {
      if (!this._ready) return;
      if (this._pendingRoute || RouteDetector.isDetailContext()) {
        this._pendingRoute = false;
        this.handleRouteChange();
      }
    }

    init() {
      this.setupShell();
      this.setupMetadataDeps();
    }

    setupShell() {
      if (this._shellReady) return;

      this.episodeInjector.init();

      document.body.addEventListener("click", this.clickHandler);
      document.body.addEventListener("mousedown", this.prefetchHandler, true);

      this.setupIntersectionObserver();
      this.setupMutationObserver();
      this.setupDiscoverCatalogObserver();
      // Observers connect only on detail pages (see handleRouteChange)

      this._shellReady = true;
      this._ready = true;

      window.ShowPageEnhancer.prefetchDetail = (routeInfo) =>
        this.prefetchFromRoute(routeInfo, routeInfo?.element);
      window.ShowPageEnhancer.processDetailRoute = (parsed) => {
        if (parsed?.id) RouteDetector.pinRoute(parsed);
        this.markPendingRoute();
        this.setupShell();
        this.setupMetadataDeps();
        if (this._ready) {
          this.processRoute(true);
        }
      };
      window.ShowPageEnhancer.onDetailShellDetected = (parsed) => {
        if (parsed?.id) RouteDetector.pinRoute(parsed);
        RouteDetector.invalidateCache();
        this.markPendingRoute();
        this.connectDetailShellWatcher();
        this.connectMutationObserver();
        this.processRoute(true);
      };
      window.ShowPageEnhancer.cleanup = () => this.cleanup();

      this.flushPendingRoute();
    }

    setupMetadataDeps() {
      if (this._metadataReady) return;

      if (!window.metadataStorage || !window.metadataServices?.idLookup) {
        if (!this._awaitingMetadataReady) {
          this._awaitingMetadataReady = true;
          window.addEventListener(
            "metadata-core-ready",
            () => this.setupMetadataDeps(),
            { once: true },
          );
          window.addEventListener(
            "metadata-modules-ready",
            () => this.setupMetadataDeps(),
            { once: true },
          );
        }
        setTimeout(() => this.setupMetadataDeps(), 100);
        return;
      }

      this.setupMetadataListener();
      this._metadataReady = true;
      this.flushPendingRoute();

      if (RouteDetector.isDetailContext()) {
        const container = getMetaContainer();
        if (!container?.classList.contains(CONFIG.MARKER_CLASS)) {
          this.processRoute(true);
        }
      }
    }

    stopDetailWatchdog() {
      if (this._detailWatchdogTimer) {
        clearInterval(this._detailWatchdogTimer);
        this._detailWatchdogTimer = null;
      }
    }

    connectDetailShellWatcher() {
      if (this._detailShellWatcher) return;

      this._detailShellWatcher = new MutationObserver(
        debounce(() => {
          if (RouteDetector.isDiscoverCatalogOnly()) return;

          const container = getMetaContainer();
          if (!container || container.classList.contains(CONFIG.MARKER_CLASS)) {
            return;
          }
          if (!RouteDetector.resolveActiveRoute()?.id) return;
          if (this._identifyInflight.size > 0) return;

          this.connectMutationObserver();
          this.processRoute();
        }, 350),
      );

      this._detailShellWatcher.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }

    disconnectDetailShellWatcher() {
      if (this._detailShellWatcher) {
        this._detailShellWatcher.disconnect();
        this._detailShellWatcher = null;
      }
    }

    setupDetailShellWatcher() {
      this.connectDetailShellWatcher();
    }

    startDetailWatchdog() {
      this.stopDetailWatchdog();

      if (!RouteDetector.isDetailContext()) return;

      const container = getMetaContainer();
      if (container?.classList.contains(CONFIG.MARKER_CLASS)) return;

      let elapsed = 0;
      const intervalMs = 500;
      const maxMs = 30000;

      this._detailWatchdogTimer = setInterval(() => {
        elapsed += intervalMs;

        if (!RouteDetector.isDetailContext()) {
          this.stopDetailWatchdog();
          return;
        }

        const currentContainer = getMetaContainer();
        if (currentContainer?.classList.contains(CONFIG.MARKER_CLASS)) {
          this.stopDetailWatchdog();
          return;
        }

        if (elapsed >= maxMs) {
          this.stopDetailWatchdog();
          return;
        }

        this.connectMutationObserver();
        this.processRoute(true);
      }, intervalMs);
    }

    cleanup() {
      document.body.removeEventListener("click", this.clickHandler);
      document.body.removeEventListener("mousedown", this.prefetchHandler, true);
      if (this.metadataListener) {
        window.removeEventListener("metadata-updated", this.metadataListener);
        this.metadataListener = null;
      }
      if (this.mutationObserver) this.mutationObserver.disconnect();
      if (this.intersectionObserver) this.intersectionObserver.disconnect();
      if (this.episodeInjector) this.episodeInjector.disconnect(); // Clean up episodes
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      if (this._processRouteTimer) clearTimeout(this._processRouteTimer);
      if (this._injectionRetryTimer) clearInterval(this._injectionRetryTimer);
      this.stopDetailWatchdog();
      this.stopPersistentInjectLoop();
      this.disconnectDetailShellWatcher();
      if (this._detailShellWatcher) this._detailShellWatcher.disconnect();
      if (this.discoverCatalogObserver) this.discoverCatalogObserver.disconnect();
      this.currentMetadata = null;
      this.lastInjectedId = null;
      MetadataInjector.clearInjectedContent();
    }

    setupMetadataListener() {
      this.metadataListener = (event) => this.handleMetadataUpdate(event);
      window.addEventListener("metadata-updated", this.metadataListener);
    }

    routeMatchesUpdate(routeInfo, detail) {
      if (!routeInfo?.id || !detail) return false;

      const routeId = String(routeInfo.id);
      if (routeId === String(detail.id)) return true;
      if (detail.imdb && routeId === String(detail.imdb)) return true;
      if (detail.tmdb && routeId === String(detail.tmdb)) return true;

      if (routeInfo.source === "tmdb") {
        if (this.currentMetadata?.tmdb && routeId === String(this.currentMetadata.tmdb)) {
          return true;
        }
        if (detail.imdb && this.currentMetadata?.imdb === detail.imdb) {
          return true;
        }
      }

      return false;
    }

    handleMetadataUpdate(event) {
      // Validation
      if (!event || !event.detail) return;
      const detail = event.detail;

      // Check if we are currently viewing the updated item
      const routeInfo = RouteDetector.resolveActiveRoute();
      if (!routeInfo || !routeInfo.id) return;

      if (!this.routeMatchesUpdate(routeInfo, detail)) return;

      requestAnimationFrame(() => {
        const currentRoute = RouteDetector.resolveActiveRoute();
        if (
          !currentRoute ||
          !this.routeMatchesUpdate(currentRoute, detail)
        )
          return;

        const container = getMetaContainer();
        if (
          container?.classList.contains(CONFIG.MARKER_CLASS) &&
          this.hasDetailPageFields(this.currentMetadata)
        ) {
          return;
        }

        const merged = this.mergeDetailMetadata(
          this.currentMetadata || {},
          detail,
        );
        this.applyMetadataAndInject(this.normalizePeopleForUI(merged), {
          forceReinject: !container?.classList.contains(CONFIG.MARKER_CLASS),
        });
      });
    }

    setupDiscoverCatalogObserver() {
      this.discoverCatalogObserver = new IntersectionObserver(
        (entries) => {
          if (!window.location.hash.startsWith("#/discover")) return;

          for (const entry of entries) {
            if (!entry.isIntersecting) continue;

            const item = entry.target;
            if (this._discoverCatalogObserved.has(item)) continue;
            this._discoverCatalogObserved.add(item);

            const routeInfo = this.parseRouteFromClickTarget(item);
            if (routeInfo) {
              this.prefetchFromRoute(routeInfo, routeInfo.element);
            }
            this.discoverCatalogObserver.unobserve(item);
          }
        },
        { rootMargin: "250px" },
      );
    }

    scanDiscoverCatalogItems() {
      if (!this.discoverCatalogObserver) return;
      if (!window.location.hash.startsWith("#/discover")) return;

      document.querySelectorAll(".meta-item-container-Tj0Ib").forEach((item) => {
        if (!this._discoverCatalogObserved.has(item)) {
          this.discoverCatalogObserver.observe(item);
        }
      });
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

          if (!RouteDetector.isDetailContext() || isPlayer) {
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

          // 1b. Detail shell visible — process even if hash still #/discover/
          const routeInfo =
            RouteDetector.resolveActiveRoute() ||
            RouteDetector.extractFromHash();
          if (routeInfo?.id) {
            if (this.clearInjectionIfMovieChanged(routeInfo)) {
              this.processRoute(true);
              return;
            }
            const container = getMetaContainer();
            if (container?.classList.contains(CONFIG.MARKER_CLASS)) {
              return;
            }
            if (container && !this.currentMetadata && !this._identifyInflight.size) {
              this.processRoute();
              return;
            }
          }

          // 2. Refresh injection if container is missing markers
          const container = getMetaContainer();
          if (container && !container.classList.contains(CONFIG.MARKER_CLASS)) {
            if (this.currentMetadata) {
              this.injectIfReady(container);
            } else {
              this.processRoute();
            }
          }

          // 2b. Post-injection native element sweep.
          // Slow addons can trigger a React re-render of the container AFTER our
          // injection has already set the marker. The re-render inserts fresh DOM
          // nodes (new .meta-links-Xiao3, new .imdb-button-container-gGjxp, etc.)
          // without data-kai-hidden. We sweep for any visible native elements on
          // each debounce cycle and hide them on sight.
          if (container && container.classList.contains(CONFIG.MARKER_CLASS)) {
            container
              .querySelectorAll(
                `.imdb-button-container-gGjxp:not([data-kai-hidden]),
                 ${CONFIG.EXISTING_GENRES}:not([data-kai-hidden])`,
              )
              .forEach((el) => {
                el.dataset.kaiHidden = "true";
                el.style.setProperty("display", "none", "important");
              });
          }

          // 3. Delegate to EpisodeInjector
          const episodesList = document.querySelector(
            CONFIG.EPISODES_CONTAINER,
          );
          if (episodesList) {
            this.episodeInjector.handleEpisodesMutation(episodesList);
          }

          if (window.location.hash.startsWith("#/discover")) {
            this.scanDiscoverCatalogItems();
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
      if (!RouteDetector.isDetailContext()) return;

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
        getMetaContainer(),
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
        RouteDetector.clearPinnedRoute();
        this.setContainerState(false);
        this.disconnectMutationObserver();
        this.disconnectDetailShellWatcher();
        this.stopDetailWatchdog();
        this.stopPersistentInjectLoop();
        this.isProcessing = false;
        return;
      }

      const inDetail = RouteDetector.isDetailContext();

      if (RouteDetector.isDiscoverCatalogOnly()) {
        RouteDetector.clearPinnedRoute();
        this.disconnectMutationObserver();
        this.disconnectDetailShellWatcher();
        this.stopDetailWatchdog();
        this.stopPersistentInjectLoop();
        this.setContainerState(true);
        return;
      }

      if (!inDetail) {
        RouteDetector.clearPinnedRoute();
        this.disconnectMutationObserver();
        this.disconnectDetailShellWatcher();
        this.stopDetailWatchdog();
        this.stopPersistentInjectLoop();
        this.setContainerState(true);
        return;
      }

      this.connectMutationObserver();
      this.connectDetailShellWatcher();
      this.setContainerState(true);

      const routeInfo = RouteDetector.resolveActiveRoute();
      this.processRoute(!!routeInfo?.id);
      this.startDetailWatchdog();
    }

    getRouteKey(routeInfo) {
      if (!routeInfo?.id) return "";
      return `${routeInfo.type || "?"}:${routeInfo.source || "imdb"}:${routeInfo.id}`;
    }

    shouldSkipProcessing(routeInfo) {
      const key = this.getRouteKey(routeInfo);
      if (!key || key !== this._activeRouteKey) return false;
      const container = getMetaContainer();
      return !!(
        container?.classList.contains(CONFIG.MARKER_CLASS) &&
        this.currentMetadata
      );
    }

    clearInjectionIfMovieChanged(routeInfo) {
      const key = this.getRouteKey(routeInfo);
      if (!key || key === this._activeRouteKey) return false;

      this._activeRouteKey = key;
      this.lastDiscoverDetailId = routeInfo.id;
      this.currentMetadata = null;
      this.lastInjectedId = null;
      RouteDetector.invalidateCache();

      const container = getMetaContainer();
      if (container) {
        container.classList.remove(CONFIG.MARKER_CLASS);
        MetadataInjector.clearInjectedContent();
      }
      return true;
    }

    processRoute(force = false) {
      if (force) {
        if (this._processRouteTimer) {
          clearTimeout(this._processRouteTimer);
          this._processRouteTimer = null;
        }
        return this._processRouteImpl(true);
      }

      if (this._processRouteTimer) clearTimeout(this._processRouteTimer);
      this._processRouteTimer = setTimeout(() => {
        this._processRouteTimer = null;
        this._processRouteImpl(false);
      }, 50);
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

    async _processRouteImpl(force = false) {
      const routeInfo = RouteDetector.resolveActiveRoute();
      if (!routeInfo?.id) return;

      const routeKey = this.getRouteKey(routeInfo);

      if (this._identifyInflight.has(routeKey)) {
        if (!force) return;
        await this._identifyInflight.get(routeKey);
        const container = getMetaContainer();
        if (container && this.currentMetadata) {
          this.injectIfReady(container);
        }
        return;
      }

      if (this.isProcessing && !force) return;
      if (!force && this.shouldSkipProcessing(routeInfo)) {
        return;
      }

      this.isProcessing = true;

      this.clearInjectionIfMovieChanged(routeInfo);

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
        const work = this.identifyAndPrepare(
          RouteDetector.resolveActiveRoute() ||
            RouteDetector.getRouteState(),
        );
        this._identifyInflight.set(routeKey, work);
        await work;
      } catch (err) {
        console.error("[Show Page Enhancer] Error processing route:", err);
      } finally {
        this._identifyInflight.delete(routeKey);
        this.isProcessing = false;
      }
    }

    hasDetailPageFields(metadata) {
      if (!metadata) return false;

      const hasPeople = !!(
        metadata.stars?.length || metadata.directors?.length
      );
      const hasPlot = !!(
        metadata.plot || metadata.overview || metadata.description
      );
      const hasRatings =
        (metadata.ratings && Object.keys(metadata.ratings).length > 0) ||
        metadata.ratingsImdb != null ||
        metadata.ratingsMetacritic != null;

      return hasPeople || (hasPlot && hasRatings);
    }

    isMetadataComplete(metadata) {
      if (!metadata) return false;
      if (metadata.metaSource === "complete") return true;
      return this.hasDetailPageFields(metadata);
    }

    async lookupMetadata(routeInfo, domInfo) {
      if (!window.metadataServices?.idLookup) return null;

      try {
        return await window.metadataServices.idLookup.findByAnyId(
          routeInfo.id,
          routeInfo.source || "imdb",
          { type: routeInfo.type, title: domInfo?.title },
        );
      } catch (e) {
        console.warn("[Show Page Enhancer] ID Lookup failed:", e);
        return null;
      }
    }

    needsCastPhotos(metadata) {
      if (!metadata) return true;
      const people = [
        ...(metadata.stars || []),
        ...(metadata.directors || []),
      ];
      if (people.length === 0) return true;
      return !people.some((person) => person?.image || person?.photo);
    }

    mergeDetailMetadata(base, ...sources) {
      const fetcher = window.metadataServices?.metadataFetcher;
      let merged = { ...(base || {}) };

      for (const source of sources) {
        if (!source) continue;
        if (fetcher?.smartMerge) {
          Object.assign(merged, fetcher.smartMerge(merged, source));
        } else {
          Object.assign(merged, source);
        }
      }

      return merged;
    }

    normalizePeopleForUI(metadata) {
      if (!metadata) return metadata;

      const mapPeople = (people) =>
        (people || []).map((person) => ({
          ...person,
          image: person?.image || person?.photo || null,
        }));

      return {
        ...metadata,
        stars: mapPeople(metadata.stars),
        directors: mapPeople(metadata.directors),
      };
    }

    async fetchDisplayMetadataFast(routeInfo, metadata, processedData) {
      const type =
        routeInfo.type || metadata?.type || processedData?.extractedType;
      if (!type) return metadata;

      const fetcher = window.metadataServices?.metadataFetcher;
      const metadataService = window.MetadataModules?.metadataService;
      const tmdbFetcher = window.MetadataModules?.tmdbFetcher;

      let imdbId =
        this.resolveRouteImdbId(routeInfo, metadata) ||
        metadata?.imdb ||
        (routeInfo.source === "imdb" ? routeInfo.id : null);

      if (
        !imdbId &&
        routeInfo.source === "tmdb" &&
        tmdbFetcher?.resolveImdbIdFromTmdb
      ) {
        imdbId = await tmdbFetcher.resolveImdbIdFromTmdb(routeInfo.id, type);
      }

      if (imdbId && fetcher) {
        const baseEntry = metadata || {
          imdb: imdbId,
          type,
          title: processedData?.extractedTitle || null,
        };

        const [cinemetaData, privateData] = await Promise.all([
          fetcher.fetchCinemetaData(imdbId, type, true),
          metadataService?.hasPrivateApiAvailable?.()
            ? metadataService.getEnrichedMetadata(imdbId, type, true)
            : Promise.resolve(null),
        ]);

        return this.normalizePeopleForUI(
          this.mergeDetailMetadata(baseEntry, cinemetaData, privateData, {
            imdb: imdbId,
            type,
            tmdb: routeInfo.source === "tmdb" ? routeInfo.id : baseEntry.tmdb,
          }),
        );
      }

      if (routeInfo.source === "tmdb" && routeInfo.id && tmdbFetcher) {
        const tmdbId = Number(routeInfo.id);
        const details =
          type === "series"
            ? await tmdbFetcher.fetchTVDetails(tmdbId, true)
            : await tmdbFetcher.fetchMovieDetails(tmdbId, true);
        if (!details) return metadata;

        return this.normalizePeopleForUI(
          this.mergeDetailMetadata(
            metadata || {
              tmdb: tmdbId,
              type,
              title: details.title || processedData?.extractedTitle || null,
            },
            details,
            { tmdb: tmdbId, type, metaSourcePrivate: "tmdb" },
          ),
        );
      }

      return metadata;
    }

    prefetchFromRoute(routeInfo, element = null) {
      if (!routeInfo?.type || !routeInfo?.id) return;

      const key = this.getRouteKey(routeInfo);
      if (this._prefetchCache.has(key)) return;

      const catalogElement = element || routeInfo.element;
      let promise = null;

      if (catalogElement && window.metadataHelper?.priorityProcessElement) {
        console.log(
          "[Show Page Enhancer] Board prefetch:",
          routeInfo.source || "imdb",
          routeInfo.id,
        );
        promise = window.metadataHelper.priorityProcessElement(catalogElement);
      } else if (window.metadataStorage?.processAndSaveData) {
        promise = window.metadataStorage.processAndSaveData(
          this.buildProcessedDataFromRoute(routeInfo),
          true,
        );
      }

      if (!promise) return;

      promise = promise.catch(() => null);
      this._prefetchCache.set(key, promise);
      promise.finally(() => {
        setTimeout(() => {
          if (this._prefetchCache.get(key) === promise) {
            this._prefetchCache.delete(key);
          }
        }, 60000);
      });
    }

    parseRouteFromClickTarget(target) {
      if (!target?.closest) return null;

      let link = target.closest('a[href*="/detail/"]');
      if (!link) {
        const posterHost = target.closest(".meta-item-container-Tj0Ib");
        if (posterHost) {
          link =
            posterHost.closest('a[href*="/detail/"]') ||
            posterHost.querySelector('a[href*="/detail/"]');
        }
      }
      if (!link) return null;

      const href = decodeURIComponent(link.getAttribute("href") || "");
      const match = href.match(/\/(movie|series)\/([^/?#]+)/);
      if (!match) return null;

      const idInfo = RouteDetector.parseId(match[2]);
      if (!idInfo?.id) return null;

      return {
        type: match[1],
        id: idInfo.id,
        source: idInfo.source || "imdb",
        element: link.closest(".meta-item-container-Tj0Ib") || link,
      };
    }

    handlePrefetchMousedown(event) {
      const routeInfo = this.parseRouteFromClickTarget(event.target);
      if (!routeInfo) return;
      this.prefetchFromRoute(routeInfo, routeInfo.element);
    }

    tryInjectNow() {
      const container = getMetaContainer();
      if (container && this.currentMetadata) {
        this.injectIfReady(container);
      }
    }

    startPersistentInjectLoop() {
      if (this._persistentInjectTimer) return;

      let elapsed = 0;
      this._persistentInjectTimer = setInterval(() => {
        elapsed += 400;
        if (elapsed > 20000) {
          clearInterval(this._persistentInjectTimer);
          this._persistentInjectTimer = null;
          return;
        }

        if (RouteDetector.isDiscoverCatalogOnly()) {
          this.stopPersistentInjectLoop();
          return;
        }

        if (!this.currentMetadata) return;

        const container = getMetaContainer();
        if (!container) return;

        if (container.classList.contains(CONFIG.MARKER_CLASS)) {
          clearInterval(this._persistentInjectTimer);
          this._persistentInjectTimer = null;
          RouteDetector.clearPinnedRoute();
          return;
        }

        this.injectIfReady(container);
      }, 400);
    }

    stopPersistentInjectLoop() {
      if (this._persistentInjectTimer) {
        clearInterval(this._persistentInjectTimer);
        this._persistentInjectTimer = null;
      }
    }

    applyMetadataAndInject(metadata, options = {}) {
      if (!metadata) return;
      this.currentMetadata = metadata;

      const container = getMetaContainer();
      const alreadyInjected =
        container?.classList.contains(CONFIG.MARKER_CLASS) ?? false;
      const castReady =
        (metadata.stars?.length || metadata.directors?.length) &&
        !this.needsCastPhotos(metadata);
      const missingCastSection =
        container &&
        !container.querySelector(`.${CONFIG.CAST_SECTION_CLASS}`);

      if (
        container &&
        alreadyInjected &&
        (options.forceReinject || (castReady && missingCastSection))
      ) {
        container.classList.remove(CONFIG.MARKER_CLASS);
        MetadataInjector.clearInjectedContent();
      }

      if (container) {
        this.injectIfReady(container);
      }

      if (!alreadyInjected || options.forceReinject) {
        this.scheduleInjectionAttempts(40, 300);
        this.startPersistentInjectLoop();
      }
    }

    resolveRouteImdbId(routeInfo, metadata = null) {
      if (metadata?.imdb?.startsWith("tt")) return metadata.imdb;
      if (routeInfo?.source === "imdb" && routeInfo?.id?.startsWith("tt")) {
        return routeInfo.id;
      }
      return null;
    }

    buildProcessedDataFromRoute(routeInfo) {
      const domInfo = RouteDetector.extractFromDOM();
      const idSource = routeInfo.source || "imdb";
      const extractedIds = {
        imdb: null,
        tmdb: null,
        tvdb: null,
        mal: null,
        anilist: null,
        kitsu: null,
      };
      extractedIds[idSource] = String(routeInfo.id);

      return {
        extractedIds,
        extractedTitle: domInfo?.title || null,
        extractedType: routeInfo.type,
        year: domInfo?.year || null,
      };
    }

    async enrichMetadataIfNeeded(metadata, routeInfo, force = false) {
      if (!metadata) return metadata;

      const imdbId = this.resolveRouteImdbId(routeInfo, metadata);
      if (!imdbId || !window.metadataServices?.metadataFetcher) return metadata;

      const needsEnrichment =
        force || !this.hasDetailPageFields(metadata) || metadata.metaSource !== "complete";
      if (!needsEnrichment) return metadata;

      try {
        const enriched =
          await window.metadataServices.metadataFetcher.enrichTitleProgressively(
            imdbId,
            metadata.type || routeInfo.type,
            metadata.metaSource || "dom",
            metadata,
            true,
          );

        if (enriched && window.metadataStorage) {
          await window.metadataStorage.saveTitle(enriched);
          return enriched;
        }
      } catch (e) {
        console.warn("[Show Page Enhancer] Enrichment failed:", e);
      }

      return metadata;
    }

    async fetchPrivateMetadata(routeInfo, metadata) {
      const imdbId = this.resolveRouteImdbId(routeInfo, metadata);
      const metadataService = window.MetadataModules?.metadataService;
      if (!imdbId || !metadataService?.getEnrichedMetadata) return metadata;

      try {
        const privateData = await metadataService.getEnrichedMetadata(
          imdbId,
          metadata?.type || routeInfo.type,
          true,
        );
        if (!privateData) return metadata;

        const merged = { ...metadata, ...privateData, imdb: imdbId };
        if (window.metadataStorage) {
          await window.metadataStorage.saveTitle(merged);
        }
        return merged;
      } catch (e) {
        console.warn("[Show Page Enhancer] Private metadata fetch failed:", e);
        return metadata;
      }
    }

    scheduleInjectionAttempts(maxAttempts = 25, intervalMs = 200) {
      if (this._injectionRetryTimer) {
        clearInterval(this._injectionRetryTimer);
        this._injectionRetryTimer = null;
      }

      let attempts = 0;
      this._injectionRetryTimer = setInterval(() => {
        attempts += 1;

        if (!RouteDetector.isDetailContext()) {
          clearInterval(this._injectionRetryTimer);
          this._injectionRetryTimer = null;
          return;
        }

        const container = getMetaContainer();
        if (container) {
          this.injectIfReady(container);
        }

        const injected = container?.classList.contains(CONFIG.MARKER_CLASS);
        if (injected || attempts >= maxAttempts) {
          clearInterval(this._injectionRetryTimer);
          this._injectionRetryTimer = null;
        }
      }, intervalMs);
    }

    async identifyAndPrepare(routeInfo) {
      if (!routeInfo?.id) return;

      if (!this._metadataReady) {
        this.markPendingRoute();
        this.setupMetadataDeps();
        if (this.currentMetadata) {
          const container = getMetaContainer();
          if (container) this.injectIfReady(container);
        }
        return;
      }

      const domInfo = RouteDetector.extractFromDOM();
      const processedData = this.buildProcessedDataFromRoute(routeInfo);
      const routeKey = this.getRouteKey(routeInfo);

      let metadata = await this.lookupMetadata(routeInfo, domInfo);

      if (this.isMetadataComplete(metadata)) {
        this.applyMetadataAndInject(this.normalizePeopleForUI(metadata));
        showKaiToast("Kai v1.5.0 — metadata spremna", "ok");
        return;
      }

      showKaiToast("Kai: ucitavam metadata...", "info");

      const isActiveRoute = () =>
        this.getRouteKey(RouteDetector.resolveActiveRoute()) === routeKey;

      let fullEnrichPromise = this._prefetchCache.get(routeKey);
      if (!fullEnrichPromise && window.metadataStorage) {
        fullEnrichPromise = window.metadataStorage
          .processAndSaveData(processedData, true)
          .catch(() => null);
        this._prefetchCache.set(routeKey, fullEnrichPromise);
      }

      try {
        console.log(
          "[Show Page Enhancer] Fast display fetch:",
          routeInfo.source || "imdb",
          routeInfo.id,
        );
        const displayMeta = await this.fetchDisplayMetadataFast(
          routeInfo,
          metadata,
          processedData,
        );

        if (displayMeta && isActiveRoute()) {
          metadata = metadata
            ? this.mergeDetailMetadata(metadata, displayMeta)
            : displayMeta;

          if (this.hasDetailPageFields(metadata)) {
            this.applyMetadataAndInject(this.normalizePeopleForUI(metadata));
            showKaiToast("Kai v1.5.0 — prikaz spreman", "ok");
          }
        }
      } catch (e) {
        console.warn("[Show Page Enhancer] Fast display fetch failed:", e);
      }

      if (!fullEnrichPromise) return;

      fullEnrichPromise
        .then(async (fresh) => {
          if (!isActiveRoute()) return;

          let resolved = fresh;
          if (!resolved || !this.isMetadataComplete(resolved)) {
            resolved =
              (await this.lookupMetadata(routeInfo, domInfo)) || resolved;
          }
          if (!resolved) return;

          this.applyMetadataAndInject(this.normalizePeopleForUI(resolved), {
            forceReinject: true,
            upgraded: true,
          });

          if (this.isMetadataComplete(resolved)) {
            showKaiToast("Kai v1.5.0 — metadata spremna", "ok");
          }
        })
        .catch((e) => {
          console.warn("[Show Page Enhancer] Background enrich failed:", e);
        })
        .finally(() => {
          if (this._prefetchCache.get(routeKey) === fullEnrichPromise) {
            this._prefetchCache.delete(routeKey);
          }
        });
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

      // 3. ID Validation — use DOM-aware route (Discover tmdb: vs imdb)
      const routeInfo = RouteDetector.resolveActiveRoute();
      if (!routeInfo?.id) return;

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
      if (!isCorrectMetadata && routeInfo.source === "tmdb" && this.currentMetadata?.tmdb) {
        isCorrectMetadata =
          String(this.currentMetadata.tmdb) === String(routeInfo.id);
      }
      if (!isCorrectMetadata && routeInfo.source === "imdb" && this.currentMetadata?.imdb) {
        isCorrectMetadata =
          String(this.currentMetadata.imdb) === String(routeInfo.id);
      }
      if (!isCorrectMetadata) return;

      // 4. Update Episode Context (ALWAYS run this, even if already injected)
      if (this.episodeInjector) {
        this.episodeInjector.updateContext(this.currentMetadata);
      }

      // 5. Already Injected? (Idempotency Check)
      if (container.classList.contains(CONFIG.MARKER_CLASS)) {
        return;
      }

      // 6. DOM Readiness — logo, placeholder, or any native detail anchor
      const logoReady = !!container.querySelector(CONFIG.LOGO_IMAGE);
      const logoPlaceholderReady = !!container.querySelector(
        ".logo-placeholder-rE1ld",
      );
      const hasNativeAnchor = !!(
        container.querySelector(CONFIG.RELEASE_INFO) ||
        container.querySelector(CONFIG.RUNTIME_LABEL) ||
        container.querySelector(".description-container-yi8iU") ||
        container.querySelector('[class*="logo"]')
      );
      if (!logoReady && !logoPlaceholderReady && !hasNativeAnchor) {
        return;
      }

      // 7. Proceed with full injection
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
      RouteDetector.clearPinnedRoute();
      showKaiToast("Kai v1.5.0 — prikaz detalja ucitan", "ok");

      this.setContainerState(true);
    }
  }

  // Singleton — survives init retries; catches hashchange before deps are ready
  let _enhancerInstance = null;

  function getEnhancer() {
    if (!_enhancerInstance) {
      _enhancerInstance = new ShowPageEnhancer();
    }
    return _enhancerInstance;
  }

  function bootEnhancer() {
    getEnhancer().init();
  }

  function wakeEnhancerFromDiscover(parsed) {
    if (parsed?.id) RouteDetector.pinRoute(parsed);
    const enhancer = getEnhancer();
    enhancer.markPendingRoute();
    bootEnhancer();
    if (!enhancer._ready) return;
    const key = `${parsed?.type || "movie"}:${parsed?.source || "imdb"}:${parsed?.id}`;
    if (enhancer._identifyInflight.has(key)) {
      enhancer.tryInjectNow();
      return;
    }
    enhancer.processRoute(true);
  }

  window.ShowPageEnhancer.processDetailRoute = (parsed) => {
    wakeEnhancerFromDiscover(parsed);
  };

  window.addEventListener("kai-detail-navigate", (e) => {
    wakeEnhancerFromDiscover(e.detail);
  });

  window.addEventListener("hashchange", () => {
    const enhancer = getEnhancer();
    if (!enhancer._ready) {
      enhancer.markPendingRoute();
      bootEnhancer();
      return;
    }
    enhancer.handleRouteChange();
  });

  window.addEventListener("metadata-core-ready", () => {
    bootEnhancer();
    getEnhancer().setupMetadataDeps();
  });
  window.addEventListener("metadata-modules-ready", () => {
    bootEnhancer();
    getEnhancer().setupMetadataDeps();
  });
  if (window.__kaiMetadataCoreReady) bootEnhancer();
  if (window.MetadataModules?.ready) bootEnhancer();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootEnhancer);
  } else {
    bootEnhancer();
  }
})();
