// Ensure namespace exists
window.HeroPlugin = window.HeroPlugin || {};

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

window.HeroPlugin.UI = {
  // Cache for DOM elements to avoid repeated queries
  elements: {
    container: null,
    image: null,
    logo: null,
    description: null,
    info: null,
    genres: null,
    actions: null,
    watchButton: null,
    metaLine: null,
    ratings: null,
    tags: null,
  },

  /**
   * Resets the internal DOM element cache.
   * Call this when the banner is destroyed or re-created.
   */
  resetElementCache() {
    this.elements = {
      container: null,
      image: null,
      logo: null,
      description: null,
      info: null,
      genres: null,
      actions: null,
      watchButton: null,
      metaLine: null,
      ratings: null,
      tags: null,
    };
  },

  /**
   * Helper to generate the Ratings Row HTML using shared utility.
   */
  createRatingsHTML(title) {
    // Use shared RatingsUtils if available
    const ratingsUtils = window.MetadataModules?.ratingsUtils;
    if (ratingsUtils) {
      return ratingsUtils.createRatingsHTML(title, {
        prefix: "hero-rating",
        containerClass: "hero-ratings-row",
      });
    }

    // Fallback: Basic IMDb + MAL if shared util not loaded
    let html = '<div class="hero-ratings-row">';
    let hasRatings = false;

    // IMDb (Dynamic Color) - Clickable
    const imdbRating = title.ratings?.imdb?.score || title.ratingsImdb;
    if (imdbRating) {
      hasRatings = true;
      const imdbColor =
        IMDbColorCalculator?.calculateColor?.(imdbRating) ||
        "rgb(245, 197, 24)";
      html += `
                <button class="hero-rating-item" onclick="event.stopPropagation(); window.open('https://www.imdb.com/title/${
                  title.imdb
                }/', '_blank')" title="Open IMDb">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/5/57/IMDb_Logo_Rectangle.svg" class="hero-rating-logo" alt="IMDb">
                    <span class="hero-rating-text" style="color: ${imdbColor} !important;">★ ${Number(
                      imdbRating,
                    ).toFixed(1)}</span>
                </button>`;
    }

    // MAL Rating if available
    const malRating = title.ratings?.mal?.score || title.ratingsMal;
    if (malRating) {
      hasRatings = true;
      const malId =
        title.malId || (Array.isArray(title.mal) ? title.mal[0] : title.mal);
      const malUrl =
        title.malUrl ||
        (malId ? `https://myanimelist.net/anime/${malId}` : null);

      if (malUrl) {
        html += `<button class="hero-rating-item" onclick="event.stopPropagation(); window.open('${malUrl}', '_blank')" title="Open MyAnimeList">`;
      } else {
        html += `<div class="hero-rating-item">`;
      }

      html += `
                <img src="https://upload.wikimedia.org/wikipedia/commons/9/9b/MyAnimeList_favicon.svg" class="hero-rating-logo" alt="MAL">
                <span class="hero-rating-text hero-rating-mal">${Number(
                  malRating,
                ).toFixed(2)}</span>`;

      html += malUrl ? `</button>` : `</div>`;
    }

    html += "</div>";
    return hasRatings ? html : "";
  },

  /**
   * Helper to generate the Scrollable Tags Row (Structure matches Hover Popup)
   * Wrapper > Track approach for correct masking and scrolling
   */
  /**
   * Helper to generate the Scrollable Tags Row (Structure matches Hover Popup)
   * Wrapper > Track approach for correct masking and scrolling
   */
  createTagsHTML(title) {
    if (
      (!title.genres || title.genres.length === 0) &&
      !title.demographics &&
      !title.interests
    )
      return "";

    // Highlights List (Same as Hover Popup)
    const ANIME_SUBGENRES = new Set([
      "ecchi",
      "mecha",
      "harem",
      "slice of life",
      "isekai",
      "iyashikei",
      "sports",
    ]);

    const allTags = [];
    const seenTags = new Set();

    // 1. Demographics
    if (title.demographics) {
      const demos = Array.isArray(title.demographics)
        ? title.demographics
        : [title.demographics];
      demos.forEach((demo) => {
        if (demo) {
          allTags.push({ type: "hero-badge-demo", value: demo });
          seenTags.add(demo.toLowerCase());
        }
      });
    }

    const animeHighlights = [];
    const standardGenres = [];

    const processList = (list) => {
      if (!list) return;
      const arr = Array.isArray(list) ? list : [list];
      arr.forEach((tag) => {
        if (!tag) return;
        const lower = tag.toLowerCase();
        if (seenTags.has(lower)) return;
        seenTags.add(lower);

        const isHighlight = ANIME_SUBGENRES.has(lower);
        const tagObj = {
          type: isHighlight ? "hero-badge-highlight" : "hero-badge-genre",
          value: tag,
        };

        if (isHighlight) animeHighlights.push(tagObj);
        else standardGenres.push(tagObj);
      });
    };

    processList(title.genres);
    processList(title.interests);

    // Merge Order: Demos -> Highlights -> Standard
    allTags.push(...animeHighlights);
    allTags.push(...standardGenres);

    // Get content type for routing (default to 'movie' if not specified)
    const contentType = title.type || "movie";

    // Certification badge HTML (first in tags row)
    const certificationDef =
      window.MetadataModules?.ratingsUtils?.getContentRatingDefinition(
        title.contentRating,
      );
    const certificationBadge = title.contentRating
      ? `<span class="hero-certification" title="${certificationDef || ""}">${
          title.contentRating
        }</span>`
      : "";

    return `
            <div class="hero-tags-container">
                <div class="hero-tags-track">
                    ${certificationBadge}${allTags
                      .map((tag) => {
                        // Class naming to match HeroBanner.css but using styles from hover-popup
                        let className = "hero-badge";
                        if (tag.type === "hero-badge-demo")
                          className += " hero-badge-demo";
                        else if (tag.type === "hero-badge-highlight")
                          className += " hero-badge-highlight";

                        // Use data attributes for click handler with type for proper routing
                        return `<span class="${className}" data-genre="${tag.value}" data-type="${contentType}">${tag.value}</span>`;
                      })
                      .join("")}
                </div>
            </div>`;
  },

  /**
   * Helper for "X Seasons • Y Episodes • Z Runtime" (Hover Popup Logic)
   */
  getMetaLineItems(title) {
    // 1. Year Status
    const yearStatus =
      title.year && String(title.year).length < 6 && title.status === "Ongoing"
        ? `${title.year}${title.status}`
        : title.year
          ? String(title.year)
          : title.releaseInfo || "";

    let lengthInfo = "";

    // Check if it's a movie or series
    const isMovie = title.type === "movie";

    if (isMovie) {
      // Movies: Show "Movie" + Runtime
      lengthInfo = "Movie";
      if (title.duration || title.runtime) {
        lengthInfo += ` • ${title.duration || title.runtime}`;
      }
    } else if (title.seasons && title.seasons > 0) {
      // Series: Show Seasons + Episodes + Runtime
      lengthInfo += `${title.seasons} Season${title.seasons > 1 ? "s" : ""}`;
      if (title.episodes && title.episodes > 0) {
        lengthInfo += ` • ${title.episodes} Episode${
          title.episodes > 1 ? "s" : ""
        }`;
      }
      if (title.duration || title.runtime) {
        lengthInfo += ` • ${title.duration || title.runtime}`;
      }
    } else if (title.duration || title.runtime) {
      // Fallback: Just show runtime if no seasons info
      lengthInfo = title.duration || title.runtime;
    }

    const items = [];
    if (yearStatus) items.push(yearStatus);
    if (lengthInfo) items.push(lengthInfo);

    // Network/Studio logic
    let badgeEntity = title.network;

    // Prioritize Studio for Anime
    if (title.isAnime && title.studio) {
      badgeEntity = title.studio;
    }

    if (badgeEntity && badgeEntity.name) {
      items.push(badgeEntity.name);
    }

    return items.join(" • ");
  },

  /**
   * Generates the HTML string.
   */
  createHeroHTML(title) {
    const HeroState = window.HeroPlugin.State;

    // Ratings on its own row (uses metadata-popup-rating prefix for shared CSS)
    const ratingsHTML = this.createRatingsHTML(title);

    // Metadata text row (year, runtime, etc.)
    // Metadata text row (year, runtime, etc.)
    const metaText = this.getMetaLineItems(title);

    // Updated: Network is now part of metaText joined by dots, clean and simple.
    const metaRow = `
            <div class="hero-meta-row" id="heroMetaRow">
                <span class="hero-meta-text">${metaText}</span>
            </div>
        `;

    const tagsHTML = this.createTagsHTML(title);

    return `
            <div class="hero-container">
                <img src="${
                  title.background
                }" alt="Hero Background" class="hero-image" id="heroImage">
                
                <div class="hero-overlay">
                    <!-- 1. Logo Container (Fixed Size) -->
                    <div class="hero-logo-container">
                        ${
                          title.logo
                            ? `<img src="${
                                title.logo
                              }" alt="Title Logo" class="hero-overlay-image" id="heroLogo" title="${
                                title.originalTitle || ""
                              }">`
                            : `<h1 class="hero-title-text" id="heroLogo" title="${
                                title.originalTitle || ""
                              }">${
                                title.extractedTitle || title.title || ""
                              }</h1>`
                        }
                    </div>
                    
                    <!-- 1.5. Tagline (if available) -->
                    ${
                      title.tagline
                        ? `<p class="hero-tagline" id="heroTagline">${title.tagline}</p>`
                        : ""
                    }
                    
                    <!-- 2. Ratings Row (own row, between tagline and metadata) -->
                    ${ratingsHTML}
                    
                    <!-- 3. Metadata Row (year, runtime, etc.) -->
                    ${metaRow}
                    
                    <!-- 4. Tags (Scrollable Track) -->
                    ${tagsHTML}
                    
                    <!-- 4. Description (Fixed Size, Scrollable, Bottom Padding) -->
                    <div class="hero-description-container">
                        <p class="hero-overlay-description" id="heroDescription">${
                          title.plot
                        }</p>
                    </div>
                    
                    <!-- 5. Actions -->
                   <div class="hero-overlay-actions">
                        <button class="hero-overlay-button-watch hero-overlay-button-watch" onclick="event.stopPropagation(); playTitle('${
                          title.type
                        }', '${title.imdb}')">
                            <span class="play-icon">▶</span>
                            Watch Now
                        </button>
                    </div>
                </div>

                <!-- Controls -->
                <div class="hero-controls">
                    <button class="hero-control-btn" onclick="previousTitle()">⟨</button>
                    <button class="hero-control-btn" onclick="nextTitle()">⟩</button>
                </div>
                <div class="hero-indicators">
                    ${HeroState.heroTitles
                      .map(
                        (_, index) =>
                          `<div class="hero-indicator ${
                            index === HeroState.currentIndex ? "active" : ""
                          }" 
                              onclick="goToTitle(${index})" data-index="${index}"></div>`,
                      )
                      .join("")}
                </div>
            </div>
        `;
  },

  updateHeroContent(title, animate = true) {
    const HeroState = window.HeroPlugin.State;

    // Refresh Cache if empty (first run or re-creation)
    if (!this.elements.image) {
      this.elements = {
        image: document.getElementById("heroImage"),
        logo: document.getElementById("heroLogo"),
        description: document.getElementById("heroDescription"),
        metaRow: document.getElementById("heroMetaRow"),
        watchButton: document.querySelector(".hero-overlay-button-watch"),
        tags: document.querySelector(".hero-tags-container"),
      };
    }

    const el = this.elements;
    if (!el.image) return;

    // --- Generate New Content (Separate ratings and meta) ---
    const metaText = this.getMetaLineItems(title);
    const ratingsHTML = this.createRatingsHTML(title);

    // Network is now integrated into metaText string
    const metaRowHTML = `<span class="hero-meta-text">${metaText}</span>`;

    const tagsHTML = this.createTagsHTML(title);

    // --- Update Logic ---
    const updateContent = () => {
      el.image.src = title.background;

      // Check if we need to swap element type (IMG <-> H1)
      const needsImage = !!title.logo;
      const currentIsImage = el.logo.tagName === "IMG";

      if (needsImage !== currentIsImage) {
        const newLogo = document.createElement(needsImage ? "img" : "h1");
        newLogo.id = "heroLogo";
        if (needsImage) {
          newLogo.className = "hero-overlay-image";
          newLogo.alt = "Title Logo";
        } else {
          newLogo.className = "hero-title-text";
        }

        el.logo.replaceWith(newLogo);
        el.logo = newLogo; // Update local ref
        this.elements.logo = newLogo; // Update global cache
      }

      if (needsImage) {
        el.logo.src = title.logo;
        el.logo.title = title.extractedTitle || title.title || "";

        // Safety Fallback: If image fails to load (despite validation), revert to text title
        el.logo.onerror = () => {
          console.warn(
            "[Hero Plugin] Logo failed to load, falling back to text title:",
            title.title,
          );
          const newTitle = document.createElement("h1");
          newTitle.id = "heroLogo";
          newTitle.className = "hero-title-text";
          newTitle.textContent = title.extractedTitle || title.title || "";

          if (el.logo && el.logo.parentNode) {
            el.logo.replaceWith(newTitle);
            el.logo = newTitle; // Update local ref
            this.elements.logo = newTitle; // Update global cache
          }
        };
      } else {
        el.logo.textContent = title.extractedTitle || title.title || "";
      }

      el.description.textContent = title.plot;
      el.description.scrollTop = 0;

      // Update Tagline (dynamic add/remove)
      let taglineEl = document.getElementById("heroTagline");
      if (title.tagline) {
        if (!taglineEl) {
          taglineEl = document.createElement("p");
          taglineEl.id = "heroTagline";
          taglineEl.className = "hero-tagline";
          // Insert after logo container
          const logoContainer = document.querySelector(".hero-logo-container");
          if (logoContainer) {
            logoContainer.insertAdjacentElement("afterend", taglineEl);
          }
        }
        taglineEl.textContent = title.tagline;
      } else if (taglineEl) {
        taglineEl.remove();
      }

      // Update ratings row (own row, inserted before meta row)
      let ratingsRow = document.querySelector(".hero-ratings-row");
      if (ratingsHTML) {
        if (!ratingsRow) {
          // Create container and insert before meta row
          const tempDiv = document.createElement("div");
          tempDiv.innerHTML = ratingsHTML;
          ratingsRow = tempDiv.firstElementChild;
          if (el.metaRow) {
            el.metaRow.insertAdjacentElement("beforebegin", ratingsRow);
          }
        } else {
          ratingsRow.outerHTML = ratingsHTML;
        }
      } else if (ratingsRow) {
        ratingsRow.remove();
      }

      // Update meta row (text only, no ratings)
      if (el.metaRow) el.metaRow.innerHTML = metaRowHTML;

      // Update Tags
      const descContainer = el.description.closest(
        ".hero-description-container",
      );

      let currentTags = document.querySelector(".hero-tags-container");
      if (currentTags) currentTags.remove();
      if (tagsHTML && descContainer) {
        descContainer.insertAdjacentHTML("beforebegin", tagsHTML);
        // Re-attach Momentum Scroll to new Tags
        const newTagsTrack = document.querySelector(".hero-tags-track");
        if (newTagsTrack && window.MetadataModules?.scrollUtils?.ScrollUtils) {
          window.MetadataModules.scrollUtils.ScrollUtils.attachMomentumScroll(
            newTagsTrack,
          );
        }
      }

      if (el.watchButton) {
        el.watchButton.setAttribute(
          "onclick",
          `event.stopPropagation(); playTitle('${title.type}', '${title.imdb}')`,
        );
      }

      this.updateIndicators();
    };

    if (animate) {
      const getDynamics = () => [
        el.image,
        el.logo,
        el.description,
        el.metaRow,
        el.watchButton,
        document.querySelector(".hero-tags-container"),
        document.getElementById("heroTagline"),
        document.querySelector(".hero-ratings-row"),
      ];

      getDynamics().forEach((e) => {
        if (e) e.style.opacity = "0";
      });

      setTimeout(() => {
        updateContent();
        setTimeout(() => {
          getDynamics().forEach((e) => {
            if (e) e.style.opacity = "1";
          });
        }, 50);
      }, 300);
    } else {
      updateContent();
    }
  },

  _createElementFromHTML(htmlString) {
    const div = document.createElement("div");
    div.innerHTML = htmlString.trim();
    return div.firstChild;
  },

  updateIndicators() {
    const HeroState = window.HeroPlugin.State;
    const indicatorsContainer = document.querySelector(".hero-indicators");
    if (!indicatorsContainer) return;

    const currentIndicatorsCount = indicatorsContainer.children.length;
    if (currentIndicatorsCount !== HeroState.heroTitles.length) {
      const newIndicatorsHTML = HeroState.heroTitles
        .map(
          (_, index) =>
            `<div class="hero-indicator ${
              index === HeroState.currentIndex ? "active" : ""
            }"
                      onclick="goToTitle(${index})" data-index="${index}"></div>`,
        )
        .join("");
      indicatorsContainer.innerHTML = newIndicatorsHTML;
    } else {
      const indicators = document.querySelectorAll(".hero-indicator");
      indicators.forEach((indicator, index) => {
        indicator.classList.toggle("active", index === HeroState.currentIndex);
      });
    }
  },

  // ==========================================
  // IN-BANNER LOADING (Replaces fullscreen loader)
  // ==========================================

  /**
   * Show in-banner loading state with detailed progress
   * @param {Object} options - Loading options
   * @param {string} options.catalog - 'movies' or 'anime'
   * @param {string} options.currentTitle - Currently processing title name
   * @param {number} options.current - Current index (0-based)
   * @param {number} options.total - Total count
   */
  showBannerLoading(options = {}) {
    const {
      catalog = "movies",
      currentTitle = null,
      current = 0,
      total = 0,
    } = options;

    const heroContainer = document.querySelector(".hero-container");
    if (!heroContainer) return;

    let bannerLoader = heroContainer.querySelector(".hero-banner-loader");
    if (!bannerLoader) {
      const catalogLabel =
        catalog === "anime" ? "Anime Catalog" : "Movie Catalog";
      const titleText = currentTitle
        ? `Processing: ${currentTitle}`
        : "Initializing...";
      const progressText = total > 0 ? `${current} / ${total} titles` : "";
      const progressPercent = total > 0 ? (current / total) * 100 : 0;

      bannerLoader = document.createElement("div");
      bannerLoader.className = "hero-banner-loader";
      bannerLoader.innerHTML = `
                <div class="loading-spinner"></div>
                <div class="banner-loading-catalog">${catalogLabel}</div>
                <div class="banner-loading-text">${titleText}</div>
                <div class="banner-loading-progress">${progressText}</div>
                <div class="banner-loading-bar">
                    <div class="banner-loading-bar-fill" style="width: ${progressPercent}%"></div>
                </div>
            `;
      heroContainer.appendChild(bannerLoader);

      requestAnimationFrame(() => {
        bannerLoader.classList.add("visible");
      });
    }
  },

  /**
   * Update the banner loading progress
   * @param {Object} options - Update options
   * @param {string} options.currentTitle - Currently processing title
   * @param {number} options.current - Current index
   * @param {number} options.total - Total count
   */
  updateBannerLoading(options = {}) {
    const { currentTitle = null, current = 0, total = 0 } = options;

    const bannerLoader = document.querySelector(".hero-banner-loader");
    if (!bannerLoader) return;

    const titleText = currentTitle
      ? `Processing: ${currentTitle}`
      : "Processing...";
    const progressText = total > 0 ? `${current} / ${total} titles` : "";
    const progressPercent = total > 0 ? (current / total) * 100 : 0;

    const textEl = bannerLoader.querySelector(".banner-loading-text");
    const progressEl = bannerLoader.querySelector(".banner-loading-progress");
    const barFillEl = bannerLoader.querySelector(".banner-loading-bar-fill");

    if (textEl) textEl.textContent = titleText;
    if (progressEl) progressEl.textContent = progressText;
    if (barFillEl) barFillEl.style.width = `${progressPercent}%`;
  },

  hideBannerLoading() {
    const heroContainer = document.querySelector(".hero-container");
    if (!heroContainer) return;

    const bannerLoader = heroContainer.querySelector(".hero-banner-loader");
    if (bannerLoader) {
      bannerLoader.classList.remove("visible");
      setTimeout(() => {
        bannerLoader.remove();
      }, 300);
    }
  },

  // ==========================================
  // DOM UTILS
  // ==========================================

  isBoardTabSelected() {
    const boardTab = document.querySelector(
      'a[title="Board"].selected, a[href="#/"].selected, .nav-tab-button-container-dYhs0.selected[href="#/"]',
    );
    return boardTab !== null;
  },

  isBoardPage() {
    const currentHash = window.location.hash;
    return currentHash === "#/" || currentHash === "" || currentHash === "#";
  },

  shouldShowHero() {
    // Simple heuristic: Are we on the Board tab/page?
    return this.isBoardTabSelected() && this.isBoardPage();
  },

  /**
   * Finds the specific container for banner injection.
   * Target: .nav-content-container-zl9hQ
   */
  findParentElement() {
    return document.querySelector(".nav-content-container-zl9hQ");
  },

  /**
   * Waits for the Board UI elements to be present in the DOM.
   * @param {number} timeout - Max wait time
   */
  waitForBoardElements(timeout = 5000) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkForElements = () => {
        if (!this.shouldShowHero()) {
          resolve(false);
          return;
        }

        const parent = this.findParentElement();
        // Simple presence check of the parent itself is enough now
        const hasRequiredElements = parent !== null;

        if (hasRequiredElements || Date.now() - startTime > timeout) {
          resolve(hasRequiredElements);
        } else {
          setTimeout(checkForElements, 100);
        }
      };

      checkForElements();
    });
  },

  /**
   * Main Render Function.
   * Creates and injects the Hero Banner into the DOM.
   */
  createHeroDirect() {
    const HeroState = window.HeroPlugin.State;

    if (!this.shouldShowHero()) return;
    if (HeroState.isHeroDisabled) return; // Explicitly disabled via Settings (None/None)

    const parent = this.findParentElement();
    if (!parent) return;

    // Clean up existing
    const existingHero = parent.querySelector(".hero-container");
    if (existingHero) existingHero.remove();
    this.resetElementCache(); // Reset cache on re-creation!

    // Prepare Data
    if (HeroState.heroTitles.length === 0) {
      HeroState.heroTitles = [...HeroState.fallbackTitles];
    }
    HeroState.currentIndex = 0;

    // Generate HTML
    const heroHTML = this.createHeroHTML(HeroState.heroTitles[0]);

    // Convert HTML String to Element for appendChild
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = heroHTML.trim();
    const insertedHeroElement = tempDiv.firstElementChild;

    // Injection Strategy: Append to target container
    parent.prepend(insertedHeroElement);

    // Inject Catalog Toggle independently
    this.injectCatalogToggle();

    // Post-Injection Setup
    const insertedHero = parent.querySelector(".hero-container");
    if (insertedHero) {
      window.dispatchEvent(new CustomEvent("hero-banner-created"));
      // Apply Layout Fixes
      document.body.classList.add("hero-active");

      this._attachHoverListeners(insertedHero);
      this._attachGenreClickListeners(insertedHero);

      // Attach Momentum Scroll
      if (window.MetadataModules?.scrollUtils?.ScrollUtils) {
        const ScrollUtils = window.MetadataModules.scrollUtils.ScrollUtils;

        // 1. Genres (Horizontal)
        const genreTrack = insertedHero.querySelector(".hero-tags-track");
        if (genreTrack) {
          ScrollUtils.attachMomentumScroll(genreTrack);
        }
      }
    }
  },

  _attachHoverListeners(element) {
    const HeroState = window.HeroPlugin.State;
    let hoverTimeout = null;
    let isHovered = false;

    const onEnter = () => {
      if (hoverTimeout) clearTimeout(hoverTimeout);
      isHovered = true;
      if (HeroState.isAutoRotating) {
        window.dispatchEvent(new CustomEvent("hero-stop-rotation"));
      }
    };

    const onLeave = () => {
      hoverTimeout = setTimeout(() => {
        isHovered = false;
        if (HeroState.isAutoRotating) {
          window.dispatchEvent(new CustomEvent("hero-start-rotation"));
        }
      }, 100);
    };

    element.addEventListener("mouseenter", onEnter);
    element.addEventListener("mouseleave", onLeave);

    // Overlay specific listeners (legacy support, might be redundant if overlay is child)
    const overlay = element.querySelector(".hero-overlay");
    if (overlay) {
      overlay.addEventListener("mouseenter", onEnter);
      overlay.addEventListener("mouseleave", onLeave);
    }
  },

  /**
   * Attach click handlers for genre/tag badges (copied from hover-popup.js)
   */
  _attachGenreClickListeners(element) {
    element.addEventListener("click", (event) => {
      const genreBadge = event.target.closest(".hero-badge");
      if (!genreBadge) return;

      const genre = genreBadge.dataset.genre;
      const type = genreBadge.dataset.type || "movie";
      if (!genre) return;

      // Add visual feedback
      genreBadge.classList.add("clicked");
      setTimeout(() => {
        genreBadge.classList.remove("clicked");
      }, 200);

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
        // Safe to use Discover page - use proper URL format matching hover-popup
        const discoverUrl = `#/discover/https%3A%2F%2Fv3-cinemeta.strem.io%2Fmanifest.json/${type}/top?genre=${encodeURIComponent(
          genre,
        )}`;
        window.location.href = discoverUrl;
      } else {
        // Unsafe/Custom Tag (Interests, Niche Genres) -> Fallback to Search
        const searchUrl = `#/search?search=${encodeURIComponent(genre)}`;
        window.location.href = searchUrl;
      }
    });
  },

  injectCatalogToggle() {
    const HeroState = window.HeroPlugin.State;
    const navBar = document.querySelector(
      ".horizontal-nav-bar-ji5GB.horizontal-nav-bar-container-Y_zvK",
    );

    if (!navBar) return;

    let toggleBtn = document.getElementById("heroCatalogToggle");

    if (!toggleBtn) {
      toggleBtn = document.createElement("button");
      toggleBtn.id = "heroCatalogToggle";
      toggleBtn.className = "hero-catalog-btn";
      toggleBtn.setAttribute("onclick", "toggleCatalog()");
      navBar.appendChild(toggleBtn);
      // Cache reference
      this.elements.catalogToggle = toggleBtn;
    }

    // Always update text state
    toggleBtn.textContent =
      HeroState.currentCatalog === "movies" ? "🎌 Anime" : "📺 Movies";
  },

  async addHeroDiv() {
    const HeroState = window.HeroPlugin.State;

    if (!this.shouldShowHero()) return;
    if (document.querySelector(".hero-container")) return;
    if (HeroState.isInitializing) return;

    const ready = await this.waitForBoardElements(3000);
    if (!ready) return;

    if (HeroState.heroTitles.length > 0) {
      this.createHeroDirect();
    } else {
      // Request Data
      window.dispatchEvent(new CustomEvent("hero-request-init"));
    }
  },

  _formatYearWithStatus(year, status, fallbackReleaseInfo) {
    if (
      year &&
      typeof year === "string" &&
      year.length < 6 &&
      status === "Ongoing"
    ) {
      return `${year}${status}`;
    }
    return year ? String(year) : fallbackReleaseInfo || "";
  },

  setupHeroObserver(callback) {
    try {
      if (!document.body || document.body.nodeType !== Node.ELEMENT_NODE) {
        setTimeout(() => this.setupHeroObserver(callback), 100);
        return;
      }

      this.disconnectHeroObserver();

      window.heroObserver = new MutationObserver((mutations) => {
        let relevant = false;
        for (const m of mutations) {
          if (m.addedNodes.length > 0) {
            // Fast check for Board containers
            for (const node of m.addedNodes) {
              if (
                node.nodeType === 1 &&
                (node.className?.includes?.("board") ||
                  node.querySelector?.('[class*="board"]'))
              ) {
                relevant = true;
                break;
              }
            }
          }
          if (relevant) break;
        }

        if (relevant && typeof callback === "function") {
          callback();
        }
      });

      window.heroObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
      console.log("[Hero Plugin] Observer Active");
    } catch (error) {
      console.warn("[Hero Plugin] Observer setup failed:", error);
    }
  },

  disconnectHeroObserver() {
    if (window.heroObserver) {
      window.heroObserver.disconnect();
      delete window.heroObserver;
    }
  },
};
