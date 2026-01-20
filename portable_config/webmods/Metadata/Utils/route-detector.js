/**
 * @name Route Detector
 * @description Shared utility for Stremio route detection and ID extraction
 * @version 1.2.0
 * @author allecsc
 * @changelog
 *   v1.0.0 - Initial extraction from show-page-enhancer.js
 *   v1.1.0 - Enhanced PLAYER route regex to extract IMDb ID from end of URL
 *   v1.2.0 - Added anime ID extraction (mal:, anilist:, kitsu:) from player URLs
 *
 * @exports {Class} RouteDetector - Exposed globally as window.RouteDetector
 *
 * Provides centralized route state detection with caching for all webmod scripts.
 * Handles Stremio's complex URL structures including player, detail, and streams pages.
 */

(function () {
  "use strict";

  // Idempotency Guard
  if (window.RouteDetector) return;

  // DOM Selectors for extractFromDOM (Stremio-specific)
  const SELECTORS = {
    LOGO_IMAGE: ".logo-X3hTV",
    RELEASE_INFO: ".release-info-label-LPJMB",
  };

  /**
   * Route detector and ID extractor with caching
   */
  class RouteDetector {
    // Route state cache (invalidated on hash change)
    static _cache = { hash: "", state: null };

    // Known Route Regular Expressions
    static ROUTES = {
      PLAYER: /^#\/player\//, // Detect player route (IDs parsed inline)
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

      // 1. Player - extract IMDb ID and anime IDs from URL
      // Format: /series/mal%3A11061/tt2098220%3A1%3A2 or /movie/tt1234567/
      if (RouteDetector.ROUTES.PLAYER.test(hash)) {
        const decoded = decodeURIComponent(hash);

        // Extract IMDb ID (always at end of player URL in format tt1234567:season:episode or just tt1234567)
        const imdbMatch = decoded.match(/\/(tt\d+)(?::\d+:\d+)?(?:\/|$)/);
        const imdbId = imdbMatch ? imdbMatch[1] : null;

        // Extract content type
        const typeMatch = decoded.match(/\/(movie|series)\//);
        const type = typeMatch ? typeMatch[1] : null;

        // Extract anime-specific IDs if present
        const malMatch = decoded.match(/mal:(\d+)/);
        const anilistMatch = decoded.match(/anilist:(\d+)/);
        const kitsuMatch = decoded.match(/kitsu:(\d+)/);

        const animeIds =
          malMatch || anilistMatch || kitsuMatch
            ? {
                mal: malMatch ? malMatch[1] : null,
                anilist: anilistMatch ? anilistMatch[1] : null,
                kitsu: kitsuMatch ? kitsuMatch[1] : null,
              }
            : null;

        state = {
          view: "PLAYER",
          id: imdbId,
          type: type,
          source: animeIds ? "anime" : "imdb",
          animeIds: animeIds, // New: { mal, anilist, kitsu } or null
        };
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

    static isPlayerPage() {
      const state = RouteDetector.getRouteState();
      return state.view === "PLAYER";
    }

    static extractFromHash() {
      return RouteDetector.getRouteState();
    }

    static extractFromDOM() {
      const logoImg = document.querySelector(SELECTORS.LOGO_IMAGE);
      const releaseInfo = document.querySelector(SELECTORS.RELEASE_INFO);

      if (!logoImg) return null;

      const title = logoImg.getAttribute("title");
      const yearText = releaseInfo?.textContent || "";
      const year = yearText.match(/\d{4}/)?.[0] || "";

      return title ? { title, year } : null;
    }
  }

  // Expose globally
  window.RouteDetector = RouteDetector;
})();
