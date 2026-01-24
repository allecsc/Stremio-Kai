/**
 * @name Metadata Hover Popup Module
 * @description Interactive hover pop-up displaying detailed metadata for Stremio catalog items
 */

// Configuration constants - no magic numbers
const POPUP_CONFIG = {
  popupClass: "metadata-hover-popup",
  popupContentClass: "metadata-hover-popup-content",
  maxWidth: 380, // Maximum popup width in pixels
  maxHeight: 800, // Maximum popup height in pixels
  offset: 10, // Distance from poster in pixels
  offsetY: 250,
  showDelay: 800, // Delay before showing popup (ms)
  hideDelay: 200, // Delay before hiding popup (ms)
  observerRetryDelay: 1000, // Retry observer setup
  verboseLogging: false, // Enable detailed logging
  defaultAvatarUrl:
    "https://icons.veryicon.com/png/128/clothes-accessories/through-item/avatar-10.png",
  containerSelector: ".poster-container-qkw48", // Selector for poster containers
};

// Template functions for generating popup HTML content
class PopupTemplates {
  static createTitleSection(metadata) {
    const yearStatus =
      metadata.year && metadata.year.length < 6 && metadata.status === "Ongoing"
        ? `${metadata.year}${metadata.status}`
        : metadata.year || "";

    // Calculate max characters based on Oscar presence
    // Base limit: 43 chars. Oscar penalty: ~4 chars.
    const maxChars = metadata.awards ? 39 : 43;
    const titleParts = this.splitTitle(
      metadata.title || "Unknown Title",
      maxChars,
    );
    const titleClass = metadata.awards
      ? "metadata-popup-title-main has-oscar"
      : "metadata-popup-title-main";

    // Generate length info: for series show seasons • episodes • runtime, for movies just runtime
    let lengthInfo = "";
    if (metadata.seasons && metadata.seasons > 0) {
      // Series: build "X Season(s) • Y Episode(s) • runtime"
      lengthInfo += `${metadata.seasons} Season${
        metadata.seasons > 1 ? "s" : ""
      }`;
      if (metadata.episodes && metadata.episodes > 0) {
        lengthInfo += ` • ${metadata.episodes} Episode${
          metadata.episodes > 1 ? "s" : ""
        }`;
      }
      if (metadata.runtime) {
        lengthInfo += ` • ${metadata.runtime}`;
      }
    } else if (metadata.runtime) {
      // Movies: just runtime
      lengthInfo = metadata.runtime;
    }

    // Network/Studio Badge logic
    let badgeEntity = metadata.network;
    let isStudio = false;

    // Prioritize Studio for Anime
    if (metadata.isAnime && metadata.studio) {
      badgeEntity = metadata.studio;
      isStudio = true;
    }

    const networkBadge = badgeEntity
      ? `<div class="metadata-network-badge ${isStudio ? "is-studio" : ""}" title="${badgeEntity.name}">
           ${
             badgeEntity.logo
               ? `<img src="${badgeEntity.logo}" 
                       alt="${badgeEntity.name}" 
                       loading="lazy" 
                       class="${
                         !isStudio && PopupUtils.isDarkNetwork(badgeEntity.name)
                           ? "auto-invert"
                           : ""
                       }">`
               : `<span>${badgeEntity.name}</span>`
           }
         </div>`
      : "";

    return `
            <div class="metadata-popup-title">
                <div class="metadata-popup-header">
                    <div class="metadata-title-block">
                        <div class="${titleClass}" title="${
                          // Smart tooltip: show English if localized displayed, else original
                          metadata.englishTitle &&
                          metadata.title !== metadata.englishTitle
                            ? metadata.englishTitle
                            : metadata.originalTitle || ""
                        }">
                            ${
                              titleParts.length > 1
                                ? `<span class="metadata-popup-title-primary">${titleParts[0]}</span><br><span class="metadata-popup-title-secondary">${titleParts[1]}</span>`
                                : metadata.title || "Unknown Title"
                            }
                        </div>
                    </div>
                    ${networkBadge}
                </div>

                ${
                  metadata.tagline
                    ? `<div class="metadata-popup-tagline">${metadata.tagline}</div>`
                    : ""
                }
                <div class="metadata-popup-title-meta">
                    <span class="metadata-popup-title-year">${yearStatus}</span>
                    ${
                      lengthInfo
                        ? `<span class="metadata-popup-title-runtime">${lengthInfo}</span>`
                        : ""
                    }
                </div>
            </div>
        `;
  }

  static splitTitle(title, maxChars) {
    if (!title) return [title];
    title = title.trim();

    // Only split if title is longer than maxChars
    if (title.length <= maxChars) return [title];

    // Priority 1: Hyphen Split (e.g. "Star Wars: Episode V - The Empire Strikes Back")
    // Split at " - " and remove the hyphen
    const hyphenRegex = /\s[-–—]\s/;
    const hyphenMatch = title.match(hyphenRegex);
    if (hyphenMatch) {
      const hyphenIndex = hyphenMatch.index;
      const part1 = title.substring(0, hyphenIndex).trim();
      const part2 = title.substring(hyphenIndex + hyphenMatch[0].length).trim();

      if (part1 && part2) {
        return [part1, part2];
      }
    }

    // Priority 2: Colon Split (e.g. "The Lord of the Rings: The Fellowship...")
    // Split AFTER the colon
    const colonIndex = title.indexOf(": ");
    if (colonIndex !== -1) {
      const part1 = title.substring(0, colonIndex + 1).trim();
      const part2 = title.substring(colonIndex + 1).trim();

      if (part1 && part2) {
        return [part1, part2];
      }
    }

    // Fallback: Return single string and let CSS `text-wrap: balance` handle it
    return [title];
  }

  /**
   * Check if an image is predominantly dark/black and needs inversion
   * @param {HTMLImageElement} img
   */

  static createRatingsSection(metadata) {
    // Use shared RatingsUtils if available, fallback to basic display
    const ratingsUtils = window.MetadataModules?.ratingsUtils;
    if (ratingsUtils) {
      return ratingsUtils.createRatingsHTML(metadata, {
        prefix: "metadata-popup-rating",
        containerClass: "metadata-popup-ratings",
      });
    }

    // Fallback: Basic IMDb only if shared util not loaded (no legacy field fallback)
    const imdbRating = metadata.ratings?.imdb?.score;
    if (!imdbRating || !metadata.imdb) return "";

    return `
      <div class="metadata-popup-ratings">
        <button class="metadata-popup-rating-item" onclick="event.stopPropagation(); window.open('https://www.imdb.com/title/${
          metadata.imdb
        }/', '_blank')" title="IMDb">
          <img src="https://upload.wikimedia.org/wikipedia/commons/5/57/IMDb_Logo_Rectangle.svg" class="metadata-popup-rating-logo" alt="IMDb" decoding="async">
          <span class="metadata-popup-rating-imdb">★ ${Number(
            imdbRating,
          ).toFixed(1)}</span>
        </button>
      </div>`;
  }

  static createOscarStatuette(metadata) {
    if (!metadata.awards) return "";

    return `
            <div class="oscar-container" title="Academy Award Winner">
                <img src="https://upload.wikimedia.org/wikipedia/commons/f/f8/Oscar_gold_silhouette.svg"
                     class="oscar-icon"
                     alt="Academy Award"
                     decoding="async">
            </div>
        `;
  }

  static createGenresSection(metadata) {
    if (
      (!metadata.genres || metadata.genres.length === 0) &&
      (!metadata.interests || metadata.interests.length === 0) &&
      (!metadata.demographics || metadata.demographics.length === 0)
    )
      return "";

    // Combine demographics, genres, and interests
    const allTags = [];
    const seenTags = new Set();

    // 1. Demographics (Always first and distinct)
    if (metadata.demographics) {
      // Handle both array and single string cases
      const demos = Array.isArray(metadata.demographics)
        ? metadata.demographics
        : [metadata.demographics];
      demos.forEach((demo) => {
        if (demo) {
          allTags.push({ type: "demographic", value: demo });
          seenTags.add(demo.toLowerCase());
        }
      });
    }

    // Anime Highlights List
    const ANIME_SUBGENRES = new Set([
      "ecchi",
      "mecha",
      "harem",
      "slice of life",
      "isekai",
      "iyashikei",
      "sports",
    ]);

    // Prioritize tags: Anime Highlights > Standard Genres
    const animeHighlights = [];
    const standardGenres = [];

    // Process Genres
    if (metadata.genres && metadata.genres.length > 0) {
      metadata.genres.forEach((genre) => {
        if (genre && !seenTags.has(genre.toLowerCase())) {
          const isHighlight = ANIME_SUBGENRES.has(genre.toLowerCase());
          const tagObj = { type: "genre", value: genre, isHighlight };

          if (isHighlight) {
            animeHighlights.push(tagObj);
          } else {
            standardGenres.push(tagObj);
          }
          seenTags.add(genre.toLowerCase());
        }
      });
    }

    // Process Interests (Treat as genres but lower priority)
    if (metadata.interests && metadata.interests.length > 0) {
      metadata.interests.forEach((interest) => {
        if (interest && !seenTags.has(interest.toLowerCase())) {
          const isHighlight = ANIME_SUBGENRES.has(interest.toLowerCase());
          const tagObj = { type: "genre", value: interest, isHighlight };

          if (isHighlight) {
            animeHighlights.push(tagObj);
          } else {
            standardGenres.push(tagObj);
          }
          seenTags.add(interest.toLowerCase());
        }
      });
    }

    // Final Order: Demographics > Anime Highlights > Standard Genres
    allTags.push(...animeHighlights);
    allTags.push(...standardGenres);

    // Certification badge HTML (first in tags row)
    const certificationDef =
      window.MetadataModules?.ratingsUtils?.getContentRatingDefinition(
        metadata.contentRating,
      );
    const certificationBadge = metadata.contentRating
      ? `<span class="metadata-popup-certification" title="${
          certificationDef || ""
        }">${metadata.contentRating}</span>`
      : "";

    return `
            <div class="metadata-popup-genres">
                <div class="metadata-popup-genres-label">Tags</div>
                <div class="metadata-popup-genres-list-scroll">
                    <div class="metadata-popup-genres-track">
                        ${certificationBadge}${allTags
                          .map((tag) => {
                            const highlightClass = tag.isHighlight
                              ? "anime-highlight"
                              : "";

                            return tag.type === "genre"
                              ? `<span class="metadata-popup-${tag.type}-badge ${highlightClass}" data-type="${metadata.type}" data-genre="${tag.value}">${tag.value}</span>`
                              : `<span class="metadata-popup-${tag.type}-badge">${tag.value}</span>`;
                          })
                          .join("")}
                    </div>
                </div>
            </div>
        `;
  }

  static createPlotSection(metadata) {
    if (!metadata.plot) return "";

    return `
            <div class="metadata-popup-plot">
                <div class="metadata-popup-plot-label">Plot</div>
                <div class="metadata-popup-plot-text">
                    ${metadata.plot}
                </div>
            </div>
        `;
  }

  static createPersonItem(person, role, options = {}) {
    return `
            <div class="metadata-popup-person-item" data-person-name="${
              person.name
            }" data-person-role="${role}">
                <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-src="${
                  person.image || POPUP_CONFIG.defaultAvatarUrl
                }" class="metadata-popup-person-image lazy" alt="${
                  person.name
                }" decoding="async" loading="lazy">
                <div class="metadata-popup-person-info">
                    <span class="metadata-popup-person-name">${
                      person.name
                    }</span>
                    ${
                      options.showCharacter && person.character
                        ? `<span class="metadata-popup-person-character">${person.character}</span>`
                        : ""
                    }
                </div>
            </div>
        `;
  }

  static createPersonSection(people, role, maxCount = 4, options = {}) {
    if (!people || people.length === 0) return "";

    // Prioritize people with photos
    const peopleWithPhotos = people.filter(
      (person) =>
        person.image && person.image !== POPUP_CONFIG.defaultAvatarUrl,
    );
    const peopleWithoutPhotos = people.filter(
      (person) =>
        !person.image || person.image === POPUP_CONFIG.defaultAvatarUrl,
    );

    // Combine arrays: photos first, then no photos, then slice to maxCount
    const prioritizedPeople = [
      ...peopleWithPhotos,
      ...peopleWithoutPhotos,
    ].slice(0, maxCount);

    const sectionTitle =
      role === "director" ? `Director${people.length > 1 ? "s" : ""}` : "Cast";
    const sectionClass =
      role === "director" ? "metadata-popup-directors" : "metadata-popup-cast";

    return `
            <div class="${sectionClass}">
                <div class="metadata-popup-persons-label">${sectionTitle}</div>
                <div class="metadata-popup-persons-grid">
                    ${prioritizedPeople
                      .map((person) =>
                        this.createPersonItem(person, role, options),
                      )
                      .join("")}
                </div>
            </div>
        `;
  }

  static createNoDataState(title) {
    // Minimal metadata object for title generation
    const metadata = { title: title || "Unknown Title" };

    return `
            ${this.createTitleSection(metadata)}
            <div class="metadata-popup-no-data-container">
                <div class="metadata-popup-no-data-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                    </svg>
                </div>
                <div class="metadata-popup-no-data-text">No details available</div>
            </div>
        `;
  }
}

// Memoization cache for expensive operations
class MemoizationCache {
  constructor(maxSize = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  // Generate cache key from multiple parameters
  static generateKey(...args) {
    return args
      .map((arg) => {
        if (typeof arg === "object") {
          // For objects, create a stable string representation
          return JSON.stringify(arg, Object.keys(arg).sort());
        }
        return String(arg);
      })
      .join("|");
  }

  get(key) {
    return this.cache.get(key);
  }

  set(key, value) {
    // Implement LRU-style cache eviction
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
    return value;
  }

  clear() {
    this.cache.clear();
  }

  // Clear cache when viewport changes (invalidate position calculations)
  clearOnViewportChange() {
    let lastViewport = { width: window.innerWidth, height: window.innerHeight };

    const checkViewport = () => {
      const currentViewport = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      if (
        currentViewport.width !== lastViewport.width ||
        currentViewport.height !== lastViewport.height
      ) {
        this.clear();
        lastViewport = currentViewport;
        PopupUtils.log("debug", "Viewport changed, cleared memoization cache");
      }
    };

    // Check on resize and scroll
    window.addEventListener("resize", checkViewport, { passive: true });
    window.addEventListener("scroll", checkViewport, { passive: true });
  }
}

// Global memoization caches
const positionCache = new MemoizationCache(50); // Position calculations
const contentCache = new MemoizationCache(200); // HTML content generation

// IMDb rating color calculation - uses shared utility from ratingsUtils
const IMDbColorCalculator = {
  calculateColor: (rating) => {
    const ratingsUtils = window.MetadataModules?.ratingsUtils;
    if (ratingsUtils) {
      return ratingsUtils.getIMDbColor(rating);
    }
    // Fallback if shared util not loaded
    return "rgb(245, 197, 24)"; // Default gold
  },
};

// Initialize viewport change detection
positionCache.clearOnViewportChange();

// Utility functions for DOM manipulation and positioning
class PopupUtils {
  static getMetacriticColorClass(score) {
    if (score >= 60) return "metacritic-high";
    if (score >= 40) return "metacritic-medium";
    return "metacritic-low";
  }
  static log(level, message, data = null) {
    if (!POPUP_CONFIG.verboseLogging && level === "debug") return;

    const prefix = `[METADATA][HOVER-POPUP]`;
    const fullMessage = data ? `${prefix} ${message}:` : `${prefix} ${message}`;

    switch (level) {
      case "error":
        console.error(fullMessage, data);
        break;
      case "warn":
        console.warn(fullMessage, data);
        break;
      case "info":
        console.info(fullMessage, data);
        break;
      case "debug":
        console.debug(fullMessage, data);
        break;
      default:
        console.log(fullMessage, data);
    }
  }

  static createPopupElement() {
    PopupUtils.log("debug", "Creating popup element");

    const popup = document.createElement("div");
    popup.className = POPUP_CONFIG.popupClass;

    const content = document.createElement("div");
    content.className = POPUP_CONFIG.popupContentClass;
    content.innerHTML =
      '<div class="metadata-popup-loading">Loading metadata...</div>'; // Placeholder content with loading animation

    popup.appendChild(content);
    return popup;
  }

  static calculatePopupPosition(posterRect, popupElement) {
    // Create cache key from poster rect and popup dimensions
    // Note: CSS min-height ensures offsetHeight is always sufficient for correct positioning
    const popupWidth = popupElement.offsetWidth || POPUP_CONFIG.maxWidth;
    const popupHeight = popupElement.offsetHeight || POPUP_CONFIG.maxHeight;

    const cacheKey = MemoizationCache.generateKey(
      Math.round(posterRect.left),
      Math.round(posterRect.right),
      Math.round(posterRect.top),
      popupWidth,
      popupHeight,
      window.innerWidth,
      window.innerHeight,
      window.scrollX,
      window.scrollY,
    );

    // Check cache first
    const cached = positionCache.get(cacheKey);
    if (cached) {
      PopupUtils.log(
        "debug",
        "Position calculation cached - returning cached result",
      );
      return cached;
    }

    PopupUtils.log("debug", "Calculating popup position (cache miss)", {
      posterRect: posterRect,
      popupSize: { width: popupWidth, height: popupHeight },
    });

    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };

    // Calculate poster center for balanced positioning
    const posterCenterY = posterRect.top + posterRect.height / 2;

    // Calculate available space above and below poster center
    const spaceAbove = posterCenterY - viewport.scrollY;
    const spaceBelow = viewport.height + viewport.scrollY - posterCenterY;

    // Choose vertical direction based on available space
    let top;
    let verticalDirection;
    if (spaceBelow >= popupHeight) {
      // Enough space below - start at poster center, expand down
      top = posterCenterY;
      verticalDirection = "below";
    } else if (spaceAbove >= popupHeight) {
      // Enough space above - end at poster center, expand up
      top = posterCenterY - popupHeight;
      verticalDirection = "above";
    } else {
      // Not enough space either way - fallback to centering
      top = posterCenterY - popupHeight / 2;
      verticalDirection = spaceBelow > spaceAbove ? "below" : "above";
    }

    // Ensure popup stays within viewport bounds
    if (top < viewport.scrollY) {
      top = viewport.scrollY + POPUP_CONFIG.offset;
    }
    if (top + popupHeight > viewport.height + viewport.scrollY) {
      top =
        viewport.height + viewport.scrollY - popupHeight - POPUP_CONFIG.offset;
    }

    // Horizontal positioning (unchanged)
    let left = posterRect.right + POPUP_CONFIG.offset;
    let position = "right";

    // Check if right side fits
    if (left + popupWidth > viewport.width + viewport.scrollX) {
      // Try left side
      left = posterRect.left - popupWidth - POPUP_CONFIG.offset;
      position = "left";

      // If left doesn't fit either, keep right but adjust
      if (left < viewport.scrollX) {
        left = posterRect.right + POPUP_CONFIG.offset;
        position = "right";
      }
    }

    // Determine vertical position relative to poster
    const popupCenterY = top + popupHeight / 2;
    const verticalPosition = popupCenterY < posterCenterY ? "above" : "below";

    const result = { left, top, position, verticalPosition };
    PopupUtils.log(
      "debug",
      "Calculated position (cached for future use)",
      result,
    );

    // Cache the result
    return positionCache.set(cacheKey, result);
  }

  // Networks known to use black/dark logos that need inversion
  static isDarkNetwork(name) {
    if (!name) return false;
    const darkNetworks = [
      "hbo",
      "hbo max",
      "apple tv",
      "a&e",
      "cinemax",
      "nbc",
      "warner bros.",
      "fox",
      "amazon prime video",
      "disney+", // Sometimes dark blue/black
      "comedy central",
      "cartoon network",
      "adult swim",
      "history",
      "discovery",
      "amc",
      "fx",
      "tnt",
      "tbs",
      "usa network",
      "syfy",
      "bbc",
      "peacock",
      "cbs",
      "paramount network",
      "curiositystream",
      "kan 11",
      "bbc america",
      "upn",
      "nippon tv",
    ];
    return darkNetworks.includes(name.toLowerCase());
  }

  static showPopup(popup, position) {
    PopupUtils.log("debug", "Showing popup at position", position);

    popup.style.left = `${position.left}px`;
    popup.style.top = `${position.top}px`;

    // Set vertical position class for transform-origin
    popup.classList.remove("popup-above", "popup-below");
    popup.classList.add(`popup-${position.verticalPosition}`);

    popup.classList.add("visible"); // Enable interactions via CSS
  }

  static hidePopup(popup) {
    PopupUtils.log("debug", "Hiding popup");

    popup.classList.remove("visible", "content-loaded", "ready"); // Disable interactions and reset expansion state
    // NOTE: We intentionally do NOT remove 'popup-above' or 'popup-below' here.
    // Keeping them ensures the exit animation (transform: scale) uses the correct transform-origin
    // to shrink back towards the poster. They will be reset by the next showPopup call.

    // Reset Oscar animation classes to prevent state pollution
    const oscarElement = popup.querySelector(".oscar-container");
    if (oscarElement) {
      oscarElement.classList.remove("oscar-enter", "oscar-glow");
    }
  }

  static isElementInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <=
        (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }
}

// Main hover popup service
class MetadataHoverPopupService {
  constructor(domProcessor, metadataStorage, idLookup) {
    this.domProcessor = domProcessor;
    this.metadataStorage = metadataStorage;
    this.idLookup = idLookup;

    // this.observer = null; // Removed in favor of subscription
    this.popup = null; // Single reusable popup element
    this.activeContainer = null; // Currently active container
    this.pendingContainer = null; // Next container to show (handles race conditions)
    this.hideTimeout = null; // Single hide timeout
    this.showTimeout = null; // Single show timeout
    this.isInteractingWithPopup = false; // Lock flag to prevent repositioning during interaction
    // this.processedElements = new WeakSet(); // Removed: No longer needed with Event Delegation
    this.imageObserver = null; // Lazy loading observer for images

    // Debounce mechanism for enrichment updates (prevents flicker from rapid updates)
    this.pendingEnrichment = null; // Queued metadata from Jikan/Private API
    this.enrichmentDebounceTimer = null; // Debounce timer ID
    this.enrichmentContainer = null; // Container for pending enrichment
    this.ENRICHMENT_DEBOUNCE_MS = 350; // Debounce delay

    // Bind event handlers for proper removal
    this.boundMouseOver = this.handleDelegatedMouseOver.bind(this);
    this.boundMouseOut = this.handleDelegatedMouseOut.bind(this);

    this.init();
  }

  async init() {
    PopupUtils.log("info", "Initializing metadata hover popup service");

    // Create lazy loading observer for images
    this.imageObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target;
            const src = img.dataset.src;

            // Set up load handler for smooth fade-in
            const handleLoad = () => {
              img.parentElement.classList.add("loaded");
              img.removeEventListener("load", handleLoad);
              img.removeEventListener("error", handleError);
            };

            // Set up error handler for fallback
            const handleError = () => {
              img.src = POPUP_CONFIG.defaultAvatarUrl;
              // Check if default is already loaded
              if (img.complete) {
                img.parentElement.classList.add("loaded");
              } else {
                img.addEventListener("load", () => {
                  img.parentElement.classList.add("loaded");
                });
              }
              img.removeEventListener("load", handleLoad);
              img.removeEventListener("error", handleError);
            };

            img.addEventListener("load", handleLoad);
            img.addEventListener("error", handleError);

            // Start loading
            img.src = src;
            img.classList.remove("lazy");

            // Handle cached images that load immediately
            if (img.complete) {
              img.parentElement.classList.add("loaded");
            }

            this.imageObserver.unobserve(img);
          }
        });
      },
      { rootMargin: "50px" },
    );

    // Create single reusable popup element
    this.popup = PopupUtils.createPopupElement();
    document.body.appendChild(this.popup);

    // Attach event handlers once to the single popup
    this.attachPopupEventHandlers();

    // Start immediately
    this.start();
  }

  start() {
    PopupUtils.log("info", "Starting hover popup service");

    // Setup delegated event listeners (The "One Eye" Refactor Phase 2)
    this.setupDelegatedListeners();

    // Setup periodic memory cleanup
    this.setupMemoryCleanup();

    PopupUtils.log("info", "Hover popup service started successfully");
  }

  setupMemoryCleanup() {
    // Periodic cleanup to prevent memory bloat
    this.cleanupInterval = setInterval(() => {
      const positionCacheSize = positionCache.cache.size;
      const contentCacheSize = contentCache.cache.size;

      // Clear caches if they exceed thresholds
      if (positionCacheSize > 100) {
        positionCache.clear();
        PopupUtils.log(
          "debug",
          `Cleared position cache (${positionCacheSize} entries) for memory management`,
        );
      }
      if (contentCacheSize > 300) {
        contentCache.clear();
        PopupUtils.log(
          "debug",
          `Cleared content cache (${contentCacheSize} entries) for memory management`,
        );
      }
    }, 300000); // Check every 5 minutes
  }

  // Attach event handlers once to the single popup element
  attachPopupEventHandlers() {
    PopupUtils.log("debug", "Attaching event handlers to single popup element");

    // Mouse enter on popup
    this.popup.addEventListener("mouseenter", () => {
      PopupUtils.log("debug", "Mouse entered popup - locking interaction");
      this.isInteractingWithPopup = true; // Lock popup from changes during interaction
      // Cancel show timeout
      if (this.showTimeout) {
        clearTimeout(this.showTimeout);
        this.showTimeout = null;
      }
      // Cancel hide timeout
      if (this.hideTimeout) {
        clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
      }
    });

    // Mouse leave on popup
    this.popup.addEventListener("mouseleave", (event) => {
      PopupUtils.log("debug", "Mouse left popup - unlocking interaction");
      this.isInteractingWithPopup = false; // Unlock popup after interaction ends

      // Check if mouse is moving back to active container
      if (
        this.activeContainer &&
        this.activeContainer.contains(event.relatedTarget)
      ) {
        PopupUtils.log(
          "debug",
          "Mouse moving from popup back to active container",
        );
        return; // Keep visible
      }
      PopupUtils.hidePopup(this.popup);
      this.activeContainer = null;
      PopupUtils.log("debug", "Popup hidden from popup mouseleave");
    });

    // Event delegation for person and genre clicks
    this.popup.addEventListener("click", (event) => {
      const personItem = event.target.closest(".metadata-popup-person-item");
      if (personItem) {
        this.handlePersonClick(event);
        return;
      }

      const genreBadge = event.target.closest(".metadata-popup-genre-badge");
      if (genreBadge) {
        this.handleGenreClick(event);
      }
    });

    // Horizontal scrolling for genres with mouse wheel
    this.popup.addEventListener(
      "wheel",
      (event) => {
        // Check for genres track
        const genresTrack =
          event.target.closest(".metadata-popup-genres-track") ||
          event.target
            .closest(".metadata-popup-genres-list-scroll")
            ?.querySelector(".metadata-popup-genres-track");

        if (genresTrack) {
          event.preventDefault();
          genresTrack.scrollLeft += event.deltaY;
          return;
        }

        // Check for ratings container
        const ratingsContainer = event.target.closest(
          ".metadata-popup-ratings",
        );
        if (ratingsContainer) {
          event.preventDefault();
          ratingsContainer.scrollLeft += event.deltaY;
        }
      },
      { passive: false },
    );
  }

  setupDelegatedListeners() {
    PopupUtils.log(
      "info",
      "Setting up delegated event listeners on document body",
    );

    // 1. Delegated MouseOver (Enter)
    document.body.addEventListener("mouseover", this.boundMouseOver);

    // 2. Delegated MouseOut (Leave)
    document.body.addEventListener("mouseout", this.boundMouseOut);

    // 3. Delegated Focus (Keyboard Navigation)
    this.boundFocusIn = this.handleDelegatedFocus.bind(this);
    this.boundFocusOut = this.handleDelegatedFocusOut.bind(this); // Optional: usually focusin on new element handles switch

    document.body.addEventListener("focusin", this.boundFocusIn);
    document.body.addEventListener("focusout", this.boundFocusOut);

    PopupUtils.log("debug", "Delegated listeners attached (Mouse + Keyboard)");
  }

  teardownDelegatedListeners() {
    PopupUtils.log(
      "info",
      "Removing delegated event listeners from document body",
    );
    document.body.removeEventListener("mouseover", this.boundMouseOver);
    document.body.removeEventListener("mouseout", this.boundMouseOut);
    document.body.removeEventListener("focusin", this.boundFocusIn);
    document.body.removeEventListener("focusout", this.boundFocusOut);
  }

  handleDelegatedMouseOver(event) {
    const container = event.target.closest(POPUP_CONFIG.containerSelector);

    // If not a poster container, or if we are moving internally within the same container
    if (!container || container.contains(event.relatedTarget)) {
      return;
    }

    // Store the catalog item reference if not already there (lazy extraction)
    if (!container._catalogItem) {
      const catalogItem = container.closest("a, div[tabindex]");
      if (catalogItem) {
        container._catalogItem = catalogItem;
      }
    }

    this.triggerShowPopup(container);
  }

  handleDelegatedMouseOut(event) {
    const container = event.target.closest(POPUP_CONFIG.containerSelector);

    // If not a poster container, or if we are moving internally within the same container
    if (!container || container.contains(event.relatedTarget)) {
      return;
    }

    // Check if moving to the popup itself
    if (this.popup && this.popup.contains(event.relatedTarget)) {
      PopupUtils.log(
        "debug",
        "Mouse moving from poster to popup, keeping popup visible",
      );
      return;
    }

    this.triggerHidePopup();
  }

  handleDelegatedFocus(event) {
    // Focus event targets the generic container (e.g. <a> tag), so we look INSIDE it for the poster container
    const focusedElement = event.target;

    // Safety: Ignore focus on the popup itself (if we ever make it focusable)
    if (this.popup && this.popup.contains(focusedElement)) return;

    // 1. Check if the focused element IS a container (unlikely, but possible)
    // 2. Check if it WRAPS a container (common: <a href>...<div poster-container>...</a>)
    let container = focusedElement.closest(POPUP_CONFIG.containerSelector);

    if (!container) {
      container = focusedElement.querySelector(POPUP_CONFIG.containerSelector);
    }

    if (container) {
      PopupUtils.log(
        "debug",
        "Keyboard focus detected on container",
        container,
      );

      // Store catalog item (the focused element itself usually)
      if (!container._catalogItem) {
        container._catalogItem =
          focusedElement.closest("a, div[tabindex]") || focusedElement;
      }

      this.triggerShowPopup(container);
    }
  }

  handleDelegatedFocusOut(event) {
    // If moving focus to the popup (unlikely) or another valid container, don't hide immediately
    if (
      event.relatedTarget &&
      ((this.popup && this.popup.contains(event.relatedTarget)) ||
        event.relatedTarget.closest(POPUP_CONFIG.containerSelector) ||
        event.relatedTarget.querySelector(POPUP_CONFIG.containerSelector))
    ) {
      return;
    }

    this.triggerHidePopup();
  }

  triggerShowPopup(container) {
    // If already showing for this container, ignore
    if (this.activeContainer === container) return;

    // If user is currently interacting with popup, don't switch content or reposition
    if (this.isInteractingWithPopup) {
      PopupUtils.log(
        "debug",
        "User is interacting with popup, ignoring hover on new container",
      );
      return;
    }

    PopupUtils.log("debug", "Mouse entered poster container", container);

    // Set as pending container (handles race conditions)
    this.pendingContainer = container;

    // Clear any existing show timeout
    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
      this.showTimeout = null;
    }

    // Clear any existing hide timeout
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    // Position and show popup after delay, then load content
    this.showTimeout = setTimeout(() => {
      if (this.pendingContainer === container && !this.isInteractingWithPopup) {
        const posterRect = container.getBoundingClientRect();
        const position = PopupUtils.calculatePopupPosition(
          posterRect,
          this.popup,
        );
        PopupUtils.showPopup(this.popup, position);

        // Load metadata and update popup content AFTER positioning
        this.loadMetadataForPopup(container, this.popup);

        this.activeContainer = container;
        this.pendingContainer = null;
        this.showTimeout = null; // Clear the timeout ID
        PopupUtils.log("debug", "Popup shown and content loaded for container");
      } else if (this.isInteractingWithPopup) {
        PopupUtils.log(
          "debug",
          "Popup show cancelled - user started interacting with popup",
        );
        this.showTimeout = null;
      }
    }, POPUP_CONFIG.showDelay);
  }

  triggerHidePopup() {
    PopupUtils.log(
      "debug",
      "Mouse left poster container, checking if should hide",
    );

    // Clear show timeout
    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
      this.showTimeout = null;
    }

    // Clear pending container
    this.pendingContainer = null;

    // Hide popup after delay
    this.hideTimeout = setTimeout(() => {
      if (this.activeContainer) {
        PopupUtils.hidePopup(this.popup);
        this.activeContainer = null;
        PopupUtils.log("debug", "Popup hidden");
      }
    }, POPUP_CONFIG.hideDelay);
  }

  // Method to update popup content (silent update - no fade)
  updatePopupContent(content, callback = null) {
    const contentElement = this.popup.querySelector(
      `.${POPUP_CONFIG.popupContentClass}`,
    );
    if (contentElement) {
      // Use rAF to batch DOM writes and prevent layout thrash
      requestAnimationFrame(() => {
        this._applyContent(contentElement, content, callback);
      });
    }
  }

  // Helper to apply content and attach scroll utilities
  _applyContent(contentElement, content, callback) {
    // Update content
    contentElement.innerHTML = content;

    // Attach Momentum Scroll (Shared Utility)
    if (window.MetadataModules?.scrollUtils?.ScrollUtils) {
      const ScrollUtils = window.MetadataModules.scrollUtils.ScrollUtils;

      // 1. Genres (Horizontal)
      const genreTrack = contentElement.querySelector(
        ".metadata-popup-genres-track",
      );
      if (genreTrack) {
        ScrollUtils.attachMomentumScroll(genreTrack);
      }

      // 2. Ratings (Horizontal)
      const ratingsContainer = contentElement.querySelector(
        ".metadata-popup-ratings",
      );
      if (ratingsContainer) {
        ScrollUtils.attachMomentumScroll(ratingsContainer);
      }
    }

    this.popup.classList.add("content-loaded"); // CSS handles smooth expansion

    // Setup lazy loading for images
    const lazyImages = contentElement.querySelectorAll("img.lazy");
    lazyImages.forEach((img) => this.imageObserver.observe(img));

    // Listen for transition end to enable overflow
    const handleTransitionEnd = (e) => {
      if (
        e.propertyName === "transform" &&
        this.popup.classList.contains("content-loaded")
      ) {
        this.popup.classList.add("ready"); // Allow overflow content to show
        this.popup.removeEventListener("transitionend", handleTransitionEnd);
        PopupUtils.log(
          "debug",
          "Popup expansion complete, overflow now visible",
        );
      }
    };

    this.popup.addEventListener("transitionend", handleTransitionEnd);
    PopupUtils.log("debug", "Updated popup content with CSS animation");

    // Execute callback after DOM updates
    if (callback) {
      callback();
    }
  }

  /**
   * Queue an enrichment update with debouncing
   * Batches multiple enrichments (Jikan + Private API) into a single update
   * @param {Object} metadata - Updated metadata from enrichment
   * @param {HTMLElement} container - The container this update is for
   */
  queueEnrichmentUpdate(metadata, container) {
    // Only accept updates for the currently active container
    if (container !== this.activeContainer) {
      PopupUtils.log(
        "debug",
        "Ignoring enrichment update for inactive container",
      );
      return;
    }

    // Wait for popup to be ready before accepting updates
    if (!this.popup.classList.contains("ready")) {
      PopupUtils.log(
        "debug",
        "Popup not ready yet, delaying enrichment update",
      );
      // Retry after a short delay
      setTimeout(() => this.queueEnrichmentUpdate(metadata, container), 100);
      return;
    }

    // Merge with any pending enrichment
    if (this.pendingEnrichment) {
      // Deep merge - new data takes precedence
      this.pendingEnrichment = { ...this.pendingEnrichment, ...metadata };
      PopupUtils.log("debug", "Merged enrichment update with pending");
    } else {
      this.pendingEnrichment = metadata;
      this.enrichmentContainer = container;
    }

    // Clear existing timer and restart debounce
    if (this.enrichmentDebounceTimer) {
      clearTimeout(this.enrichmentDebounceTimer);
    }

    this.enrichmentDebounceTimer = setTimeout(() => {
      if (
        this.pendingEnrichment &&
        this.enrichmentContainer === this.activeContainer
      ) {
        PopupUtils.log("debug", "Applying debounced enrichment update");
        this.applySurgicalUpdate(this.pendingEnrichment);
      }
      // Clear pending state
      this.pendingEnrichment = null;
      this.enrichmentContainer = null;
      this.enrichmentDebounceTimer = null;
    }, this.ENRICHMENT_DEBOUNCE_MS);
  }

  /**
   * Apply surgical DOM updates instead of full innerHTML replacement
   * Preserves existing elements (like loaded photos) and only updates changed sections
   * @param {Object} metadata - The metadata to render
   */
  applySurgicalUpdate(metadata) {
    const contentElement = this.popup.querySelector(
      `.${POPUP_CONFIG.popupContentClass}`,
    );
    if (!contentElement) return;

    // Generate fresh content HTML
    const freshContent = this.generatePopupContent(metadata);

    // Create a temporary container to parse the new content
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = freshContent;

    // Define sections to update surgically
    // insertBefore: insert before this element (takes priority)
    // insertAfter: insert after this element (fallback)
    const sections = [
      {
        selector: ".metadata-popup-tagline",
        insertBefore: ".metadata-popup-title-meta", // Insert before meta row (year/runtime)
        insertAfter: ".metadata-popup-title", // Fallback: after title
      },
      {
        selector: ".metadata-popup-ratings",
        insertAfter: ".metadata-popup-tagline",
      },
      { selector: ".metadata-popup-header", replace: true }, // Update Title/Network Badge
      { selector: ".metadata-popup-cast", replace: true },
      { selector: ".metadata-popup-directors", replace: true },
    ];

    requestAnimationFrame(() => {
      sections.forEach(({ selector, insertAfter, insertBefore, replace }) => {
        const newSection = tempDiv.querySelector(selector);
        const existingSection = contentElement.querySelector(selector);

        if (newSection && !existingSection) {
          // Section doesn't exist - INSERT with fade-in animation
          // Try insertBefore first (for tagline before ratings), then fallback to insertAfter
          let insertionNode = null;
          let insertBeforeNode = true;

          if (insertBefore) {
            insertionNode = contentElement.querySelector(insertBefore);
          }
          if (!insertionNode && insertAfter) {
            const afterNode = contentElement.querySelector(insertAfter);
            if (afterNode) {
              insertionNode = afterNode.nextSibling;
              insertBeforeNode = true;
            }
          }

          if (insertionNode) {
            // Clone and add fade-in
            const clone = newSection.cloneNode(true);
            clone.style.opacity = "0";
            clone.style.transition = "opacity 0.3s ease-in";
            insertionNode.parentNode.insertBefore(clone, insertionNode);
            // Trigger fade-in
            requestAnimationFrame(() => {
              clone.style.opacity = "1";
            });
            PopupUtils.log("debug", `Inserted new section: ${selector}`);
          }
        } else if (newSection && existingSection && replace) {
          // Section exists and should be replaced - UPDATE in-place
          // For cast/directors, only update if content actually changed

          let hasChanged = false;

          // SPECIAL HANDLING: For cast/directors, use robust DOM signature comparison
          // This avoids issues with HTML serialization differences (lazy classes, attribute order, quotes)
          if (selector.includes("cast") || selector.includes("directors")) {
            const getSignature = (el) => {
              const items = Array.from(
                el.querySelectorAll(".metadata-popup-person-item"),
              );
              return items
                .map((item) => {
                  const img = item.querySelector("img");
                  return [
                    item.getAttribute("data-person-name") || "",
                    item.getAttribute("data-person-role") || "",
                    img ? img.getAttribute("data-src") || "" : "",
                  ].join(":");
                })
                .join("|");
            };

            const existingSig = getSignature(existingSection);
            const newSig = getSignature(newSection);

            if (existingSig !== newSig) {
              hasChanged = true;
              PopupUtils.log("debug", `Section ${selector} changed signature`);
            }
          } else {
            // Standard string comparison for other sections
            // Normalize slightly to be safe
            const normalize = (s) => (s || "").replace(/\s+/g, " ").trim();
            if (
              normalize(existingSection.innerHTML) !==
              normalize(newSection.innerHTML)
            ) {
              hasChanged = true;
            }
          }

          if (hasChanged) {
            existingSection.innerHTML = newSection.innerHTML;
            // Re-observe lazy images in updated section
            const lazyImages = existingSection.querySelectorAll("img.lazy");
            lazyImages.forEach((img) => this.imageObserver.observe(img));
            PopupUtils.log("debug", `Updated section: ${selector}`);
          }
        } else if (newSection && existingSection && !replace) {
          // Section exists - only update if content changed significantly
          const existingText = existingSection.textContent?.trim();
          const newText = newSection.textContent?.trim();
          if (existingText !== newText) {
            existingSection.innerHTML = newSection.innerHTML;
            PopupUtils.log("debug", `Updated section content: ${selector}`);
          }
        }
      });

      // Attach momentum scroll to any new scrollable sections
      if (window.MetadataModules?.scrollUtils?.ScrollUtils) {
        const ScrollUtils = window.MetadataModules.scrollUtils.ScrollUtils;
        const ratingsContainer = contentElement.querySelector(
          ".metadata-popup-ratings",
        );
        if (ratingsContainer && !ratingsContainer._momentumAttached) {
          ScrollUtils.attachMomentumScroll(ratingsContainer);
          ratingsContainer._momentumAttached = true;
        }
      }
    });
  }

  // Load metadata for popup content
  async loadMetadataForPopup(container, popup) {
    try {
      // Use the stored catalog item for media info extraction
      const catalogItem = container._catalogItem;
      if (!catalogItem) {
        PopupUtils.log(
          "error",
          "No catalog item found for container",
          container,
        );
        return;
      }

      // Extract media info using domProcessor with the correct catalog item
      const mediaInfo = this.domProcessor.extractMediaInfo("", catalogItem);
      if (!mediaInfo) {
        PopupUtils.log("debug", "No media info extracted from catalog item");
        this.updatePopupContent(
          PopupTemplates.createNoDataState("Unknown Title"),
        );
        return;
      }

      PopupUtils.log("debug", "Extracted media info:", mediaInfo);

      // Check database FIRST before showing skeleton (eliminates flash for enriched items)
      const extractedIds = {
        imdb: mediaInfo.imdb,
        tmdb: mediaInfo.tmdb,
        tvdb: mediaInfo.tvdb,
        mal: mediaInfo.mal,
        anilist: mediaInfo.anilist,
        kitsu: mediaInfo.kitsu,
      };
      const existingMetadata = await this.idLookup.findExistingTitle(
        extractedIds,
        mediaInfo.title,
        mediaInfo.type,
      );

      // Only show skeleton if we don't have complete metadata
      if (!existingMetadata || existingMetadata.metaSource !== "complete") {
        const basicContent = this.generateBasicPopupContent(mediaInfo);
        this.updatePopupContent(basicContent);
      }

      if (!existingMetadata) {
        // Title not found in database - trigger priority processing to get it immediately
        PopupUtils.log(
          "debug",
          "Title not found in database, triggering priority processing for immediate enrichment",
        );
        const priorityData = await this.priorityProcessElement(catalogItem);
        if (priorityData && priorityData.metaSource === "complete") {
          // Success! Show complete content
          PopupUtils.log(
            "debug",
            "Priority processing successful for new title, showing complete content",
          );
          const content = this.generatePopupContent(priorityData);
          this.updatePopupContent(content, () =>
            this.triggerOscarEntranceAnimation(popup),
          );
        } else {
          // Processing didn't complete - keep basic content, background will eventually complete
          PopupUtils.log(
            "debug",
            "Priority processing incomplete for new title, keeping basic content for background completion",
          );

          this.updatePopupContent(
            PopupTemplates.createNoDataState(mediaInfo.title),
          );
        }
      } else if (existingMetadata.metaSource === "complete") {
        // Complete metadata available - show immediately
        PopupUtils.log("debug", "Complete metadata available, showing content");

        // Trigger Jikan enrichment in background (for MAL rating)
        const metadataService = window.MetadataModules?.metadataService;
        if (metadataService?.triggerLazyJikan) {
          metadataService
            .triggerLazyJikan(existingMetadata, true)
            .then((updated) => {
              // Queue update with debouncing - will batch with Private API if both complete
              if (updated) {
                this.queueEnrichmentUpdate(updated, container);
              }
            })
            .catch(() => {
              /* Silent fail - Jikan is optional */
            });
        }

        // Trigger private API enrichment in background (for multi-source ratings, cast photos)
        if (metadataService?.triggerLazyPrivateEnrichment) {
          metadataService
            .triggerLazyPrivateEnrichment(existingMetadata, true)
            .then((updated) => {
              // Queue update with debouncing - will batch with Jikan if both complete
              if (updated) {
                this.queueEnrichmentUpdate(updated, container);
              }
            })
            .catch(() => {
              /* Silent fail - private APIs are optional */
            });
        }

        const content = this.generatePopupContent(existingMetadata);
        this.updatePopupContent(content, () =>
          this.triggerOscarEntranceAnimation(popup),
        );
      } else {
        // Title exists but metadata incomplete - trigger priority processing
        PopupUtils.log(
          "debug",
          "Incomplete metadata found, triggering priority processing",
        );
        const priorityData = await this.priorityProcessElement(catalogItem);
        if (priorityData && priorityData.metaSource === "complete") {
          // Success! Show complete content
          PopupUtils.log(
            "debug",
            "Priority processing successful, showing complete content",
          );

          // Trigger Lazy Jikan for newly prioritized items too
          const metadataService2 = window.MetadataModules?.metadataService;
          if (metadataService2?.triggerLazyJikan) {
            metadataService2
              .triggerLazyJikan(priorityData, true)
              .then((updated) => {
                if (updated) {
                  this.queueEnrichmentUpdate(updated, container);
                }
              })
              .catch(() => {
                /* Silent fail - Jikan is optional */
              });
          }

          // Trigger private API enrichment in background (detached)
          if (metadataService2?.triggerLazyPrivateEnrichment) {
            metadataService2
              .triggerLazyPrivateEnrichment(priorityData, true)
              .then((updated) => {
                if (updated) {
                  this.queueEnrichmentUpdate(updated, container);
                }
              })
              .catch(() => {});
          }

          const content = this.generatePopupContent(priorityData);
          this.updatePopupContent(content, () =>
            this.triggerOscarEntranceAnimation(popup),
          );
        } else {
          // Processing didn't complete - keep basic content, background will eventually complete
          PopupUtils.log(
            "debug",
            "Priority processing incomplete, keeping basic content for background completion",
          );
          this.updatePopupContent(
            PopupTemplates.createNoDataState(mediaInfo.title),
          );
        }
      }
    } catch (error) {
      PopupUtils.log("error", "Failed to load metadata for popup:", error);

      this.updatePopupContent(
        PopupTemplates.createNoDataState("Unknown Title"),
      );
    }
  }

  async priorityProcessElement(element) {
    try {
      return await this.metadataStorage.processAndSaveTitleElement(
        element,
        this.domProcessor,
        true,
      );
    } catch (error) {
      console.error(`[METADATA][Priority Process] Failed for element:`, error);
      return null;
    }
  }

  // Generate basic HTML content for immediate display (Skeleton UI)
  generateBasicPopupContent(mediaInfo) {
    const title = mediaInfo.title || "Unknown Title";

    return `
            <div class="metadata-popup-title">
                <div class="metadata-popup-title-main">${title}</div>
            </div>
            <div class="skeleton-wrapper">
                <div class="skeleton-meta"></div>
                <div class="skeleton-tags">
                    <div class="skeleton-tag"></div>
                    <div class="skeleton-tag"></div>
                    <div class="skeleton-tag"></div>
                </div>
                <div class="skeleton-text"></div>
                <div class="skeleton-text"></div>
                <div class="skeleton-text"></div>
                <div class="skeleton-text"></div>
                <div class="skeleton-text"></div>
                <div class="skeleton-text"></div>
                <div class="skeleton-people">
                    <div class="skeleton-person"></div>
                    <div class="skeleton-person"></div>
                    <div class="skeleton-person"></div>
                    <div class="skeleton-person"></div>
                </div>
            </div>
        `;
  }

  // Generate rich HTML content for popup
  generatePopupContent(metadata) {
    // Create cache key from metadata object (stable serialization)
    const cacheKey = MemoizationCache.generateKey(metadata);

    // Check cache first
    const cached = contentCache.get(cacheKey);
    if (cached) {
      PopupUtils.log(
        "debug",
        "Content generation cached - returning cached HTML",
      );
      return cached;
    }

    PopupUtils.log("debug", "Generating popup content (cache miss)");

    const content = `
            ${PopupTemplates.createOscarStatuette(metadata)}
            ${PopupTemplates.createTitleSection(metadata)}
            ${PopupTemplates.createRatingsSection(metadata)}
            ${PopupTemplates.createGenresSection(metadata)}
            ${PopupTemplates.createPlotSection(metadata)}
            ${PopupTemplates.createPersonSection(
              metadata.directors,
              "director",
              2,
            )}
            ${PopupTemplates.createPersonSection(metadata.stars, "actor", 4, {
              showCharacter: true,
            })}
        `;

    PopupUtils.log("debug", "Generated popup content (cached for future use)");

    // Cache the result
    return contentCache.set(cacheKey, content);
  }

  // Handle person click events (for future filmography display)
  handlePersonClick(event) {
    const personItem = event.target.closest(".metadata-popup-person-item");
    if (!personItem) return;

    const personName = personItem.dataset.personName;
    const personRole = personItem.dataset.personRole;

    PopupUtils.log("info", `Person clicked: ${personName} (${personRole})`);

    // Add visual feedback
    personItem.classList.add("clicked");
    setTimeout(() => {
      personItem.classList.remove("clicked");
    }, 200);

    // Navigate to Stremio search for this person
    const searchUrl = `#/search?search=${encodeURIComponent(personName)}`;
    window.location.href = searchUrl;

    // Hide popup immediately after navigation
    PopupUtils.hidePopup(this.popup);
    this.activeContainer = null;
  }

  // Handle genre click events
  handleGenreClick(event) {
    const genreBadge = event.target.closest(".metadata-popup-genre-badge");
    if (!genreBadge) return;

    const genre = genreBadge.dataset.genre;
    const type = genreBadge.dataset.type;

    PopupUtils.log("info", `Genre clicked: ${genre} (${type})`);

    // Add visual feedback
    genreBadge.classList.add("clicked");
    setTimeout(() => {
      genreBadge.classList.remove("clicked");
    }, 200);

    // Standard Cinemeta Genres (Safe for Discover)
    // These keys map to what the official router expects
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
      // Safe to use Discover page
      PopupUtils.log(
        "debug",
        `Navigating to Discover (Standard Genre): ${genre}`,
      );
      const discoverUrl = `#/discover/https%3A%2F%2Fv3-cinemeta.strem.io%2Fmanifest.json/${type}/top?genre=${encodeURIComponent(
        genre,
      )}`;
      window.location.href = discoverUrl;
    } else {
      // Unsafe/Custom Tag (Interests, Niche Genres) -> Fallback to Search
      PopupUtils.log("debug", `Navigating to Search (Custom Tag): ${genre}`);
      const searchUrl = `#/search?search=${encodeURIComponent(genre)}`;
      window.location.href = searchUrl;
    }

    // Hide popup immediately after navigation
    PopupUtils.hidePopup(this.popup);
    this.activeContainer = null;
  }

  // Trigger Oscar entrance animation after popup is fully visible
  triggerOscarEntranceAnimation(popup) {
    const oscarElement = popup.querySelector(".oscar-container");
    if (oscarElement) {
      // Wait for popup to be fully visible before starting Oscar animation
      // This creates the "reveal sequence": popup → content → Oscar bonus
      setTimeout(() => {
        requestAnimationFrame(() => {
          oscarElement.classList.add("oscar-enter");
          PopupUtils.log(
            "debug",
            "Oscar entrance animation triggered after popup reveal",
          );

          // Add pulsing glow effect after entrance animation completes
          setTimeout(() => {
            oscarElement.classList.add("oscar-glow");
            PopupUtils.log("debug", "Oscar glow effect activated");
          }, 0);
        });
      }, 500);
    }
  }

  // Cleanup method
  destroy() {
    PopupUtils.log("info", "Destroying hover popup service");

    // Clear hide timeout
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    // Clear show timeout
    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
      this.showTimeout = null;
    }

    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Remove single popup
    if (this.popup && this.popup.parentNode) {
      this.popup.parentNode.removeChild(this.popup);
      this.popup = null;
    }

    // Reset state
    this.activeContainer = null;
    this.pendingContainer = null;
    this.isInteractingWithPopup = false;

    // Disconnect observers
    // if (this.observer) {
    //     this.observer.disconnect();
    //     this.observer = null;
    // }
    if (this.imageObserver) {
      this.imageObserver.disconnect();
      this.imageObserver = null;
    }

    // Remove delegated listeners
    this.teardownDelegatedListeners();

    // Clear memoization caches
    positionCache.clear();
    contentCache.clear();

    PopupUtils.log("info", "Hover popup service destroyed");
  }
}

// Export to global scope
window.MetadataModules = window.MetadataModules || {};
window.MetadataModules.hoverPopup = {
  MetadataHoverPopupService,
  PopupTemplates, // Export templates for reuse in other scripts
};

// ALSO expose PopupTemplates directly on window for backward compatibility and easy access
window.PopupTemplates = PopupTemplates;
