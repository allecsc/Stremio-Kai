/**
 * @name Catalog API Selector
 * @description Allows selecting different API sources for Hero Banner in Settings
 * @version 3.0.0
 * @author allecsc
 */

(function () {
  "use strict";

  const CONFIG = {
    TARGET_ROUTE: "#/settings",
    OBSERVER_TIMEOUT_MS: 10000,
    KEYS: {
      MOVIE: "hero-movie-source-index",
      SERIES: "hero-series-source-index",
    },
    SECTION_TITLE: "Hero Banner",
    SECTION_INDEX: 3, // 4th position (0-indexed)
  };

  let state = {
    isInitialized: false,
    observer: null,
  };

  const getSources = () => {
    return (
      window.HeroPlugin &&
      window.HeroPlugin.Config &&
      window.HeroPlugin.Config.SOURCES
    );
  };

  const UIManager = {
    buildIconSvg() {
      return `<svg class="icon-jg2il" viewBox="0 0 512 512"><path d="m91.7 213.799 145.4 169.6c2.1 2.536 4.7 4.592 7.6 6.031 2.9 1.487 6.1 2.381 9.5 2.633 3.2.251 6.5-.148 9.6-1.171 3.1-1.035 6-2.663 8.5-4.793.9-.797 1.8-1.703 2.6-2.7l145.4-169.6c3.1-3.647 4.9-8.083 5.6-12.8.7-4.719 0-9.539-1.9-13.869-2-4.344-5.2-8.023-9.2-10.599s-8.7-3.942-13.6-3.932H110.6c-3.3-.01-6.6.626-9.6 1.873-4.7 1.86-8.6 5.058-11.2 9.175-2.7 4.109-4.2 8.924-4.2 13.852.1 5.99 2.3 11.756 6.1 16.3" style="fill: currentcolor;"></path></svg>`;
    },

    buildMenu(sources, currentIndex, onSelect) {
      const menuContainer = document.createElement("div");
      menuContainer.className =
        "menu-container-B6cqK menu-direction-bottom-right-aJ89V";
      menuContainer.setAttribute("data-focus-lock-disabled", "false");

      const innerContainer = document.createElement("div");
      innerContainer.className = "menu-container-qiz0X";

      sources.forEach((source, index) => {
        const option = document.createElement("div");
        option.className = "option-container-mO9yW button-container-zVLH6";
        if (index === currentIndex) option.classList.add("selected");

        option.tabIndex = 0;
        option.title = source.name;
        option.setAttribute("data-value", index);

        const label = document.createElement("div");
        label.className = "label-AR_l8";
        label.textContent = source.name;
        option.appendChild(label);

        if (index === currentIndex) {
          const iconDiv = document.createElement("div");
          iconDiv.className = "icon-jg2il";
          option.appendChild(iconDiv);
        }

        option.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelect(index);
        });

        innerContainer.appendChild(option);
      });

      menuContainer.appendChild(innerContainer);
      return menuContainer;
    },

    closeAllDropdowns(excludeContainer) {
      document
        .querySelectorAll(".multiselect-container-w0c9l.active")
        .forEach((el) => {
          if (el !== excludeContainer) el.classList.remove("active");
        });
    },

    buildOption(type, labelText, storageKey, sources) {
      // Use DocumentFragment to append multiple rows without an extra wrapper div
      const fragment = document.createDocumentFragment();

      // 1. MAIN ROW (Dropdown)
      const mainRow = document.createElement("div");
      mainRow.className = `option-container-EGlcv api-selector-${type}`;

      // Name
      const nameContainer = document.createElement("div");
      nameContainer.className = "option-name-container-exGMI";
      const label = document.createElement("div");
      label.className = "label-FFamJ";
      label.textContent = labelText;
      nameContainer.appendChild(label);
      mainRow.appendChild(nameContainer);

      // Dropdown Input Container
      const dropdownContainer = document.createElement("div");
      dropdownContainer.className =
        "option-input-container-NPgpT multiselect-container-w0c9l label-container-XOyzm label-container-dhjQS button-container-zVLH6";
      dropdownContainer.tabIndex = 0;

      const stored = localStorage.getItem(storageKey);
      const currentIndex = stored !== null ? parseInt(stored) : 1;
      const currentSource = sources[currentIndex] || sources[0];

      // Dropdown Label
      const valueLabel = document.createElement("div");
      valueLabel.className = "label-AR_l8";
      valueLabel.textContent = currentSource.name;
      dropdownContainer.appendChild(valueLabel);

      // Icon
      dropdownContainer.insertAdjacentHTML("beforeend", this.buildIconSvg());

      // Focus Guards
      const focusGuardTop = document.createElement("div");
      focusGuardTop.setAttribute("data-focus-guard", "true");
      focusGuardTop.className = "focus-guard"; // CSS class in Settings.css
      focusGuardTop.tabIndex = 0;
      dropdownContainer.appendChild(focusGuardTop);

      // 2. INPUT ROW (Conditional)
      const customStorageKey =
        type === "movie"
          ? window.HeroPlugin.Config.CUSTOM_MOVIE_URL_KEY
          : window.HeroPlugin.Config.CUSTOM_SERIES_URL_KEY;

      const inputRow = document.createElement("div");
      inputRow.className = "custom-input-row hidden"; // Start hidden

      // Input Row Label
      const inputNameContainer = document.createElement("div");
      inputNameContainer.className = "option-name-container-exGMI";

      const inputLabel = document.createElement("div");
      inputLabel.classList.add("label-FFamJ");
      inputLabel.textContent = "Custom URL";
      inputNameContainer.appendChild(inputLabel);
      inputRow.appendChild(inputNameContainer);

      // Input Field Container
      const textInputContainer = document.createElement("div");
      textInputContainer.className = "option-input-container-NPgpT";

      const input = document.createElement("input");
      input.className = "input-field";
      input.type = "text";
      input.placeholder = "https://example.com/catalog.json";
      input.value = localStorage.getItem(customStorageKey) || "";

      input.addEventListener("input", (e) => {
        localStorage.setItem(customStorageKey, e.target.value);
      });
      input.addEventListener("blur", (e) => {
        let val = e.target.value.trim();
        if (val.includes("mdblist.com/lists/") && !val.endsWith("/json")) {
          val += "/json";
          e.target.value = val;
          localStorage.setItem(customStorageKey, val);
          console.log("[API Selector] Auto-normalized MDBList URL:", val);
        }
      });
      input.addEventListener("click", (e) => e.stopPropagation());

      textInputContainer.appendChild(input);
      inputRow.appendChild(textInputContainer);

      // Helper to toggle visibility
      const toggleInput = (isCustom) => {
        if (isCustom) {
          inputRow.classList.remove("hidden");
        } else {
          inputRow.classList.add("hidden");
        }
      };

      // 3. MENU INTERACTION
      const menu = this.buildMenu(sources, currentIndex, (selectedIndex) => {
        localStorage.setItem(storageKey, selectedIndex);
        valueLabel.textContent = sources[selectedIndex].name;

        // Update Vis
        const options = menu.querySelectorAll(".option-container-mO9yW");
        options.forEach((opt, idx) => {
          if (idx === selectedIndex) opt.classList.add("selected");
          else opt.classList.remove("selected");
        });

        dropdownContainer.classList.remove("active");
        console.log(
          `[API Selector] Set ${type}: ${sources[selectedIndex].name}`,
        );

        // Toggle Row
        toggleInput(sources[selectedIndex].name === "Custom");
      });
      dropdownContainer.appendChild(menu);

      const focusGuardBottom = focusGuardTop.cloneNode(true);
      dropdownContainer.appendChild(focusGuardBottom);

      // Dropdown Click
      dropdownContainer.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const wasActive = dropdownContainer.classList.contains("active");
        this.closeAllDropdowns(dropdownContainer);

        if (!wasActive) dropdownContainer.classList.add("active");
        else dropdownContainer.classList.remove("active");
      });

      mainRow.appendChild(dropdownContainer);

      // Assemble Component
      fragment.appendChild(mainRow);
      fragment.appendChild(inputRow);

      // Init State
      toggleInput(currentSource.name === "Custom");

      return fragment;
    },

    buildFooter(keys) {
      // Wrapper Container (added per request)
      const wrapper = document.createElement("div");
      wrapper.className = "wrapper-FMNA6";

      const footer = document.createElement("div");
      footer.className = "footer-jhua_";
      // Styles moved to Settings.css (.wrapper-FMNA6 .footer-jhua_)

      // Info Text (Left)
      const warning = document.createElement("div");
      warning.className = "description-label-h5DXc kai-info-note";

      const iconSvg = `<svg class="kai-note-icon" viewBox="0 0 24 24" fill="none"><path d="M12 16V12M12 8H12.01M7.8 21H16.2C17.8802 21 18.7202 21 19.362 20.673C19.9265 20.3854 20.3854 19.9265 20.673 19.362C21 18.7202 21 17.8802 21 16.2V7.8C21 6.11984 21 5.27976 20.673 4.63803C20.3854 4.07354 19.9265 3.6146 19.362 3.32698C18.7202 3 17.8802 3 16.2 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

      warning.innerHTML = `${iconSvg} <span><strong>Note:</strong> Choosing 'None' for both catalogs will fully disable the Hero Banner and restore Stremio’s default layout.</span>`;
      footer.appendChild(warning);

      // Reload Button (Right)
      const reloadButton = document.createElement("div");
      reloadButton.className =
        "reload-rrVYe button-container-zVLH6 reload-button";
      reloadButton.tabIndex = 0;
      reloadButton.title = "Reload Cache";

      // SVG Icon
      reloadButton.innerHTML = `
                <svg class="icon-FpW91" viewBox="0 0 512 512"><path d="m114.39 169.44 18.88-21.96a171.1 171.1 0 0 1 56.64-39.35 171.2 171.2 0 0 1 67.55-13.81c94.78 0 171.69 76.91 171.69 171.7 0 94.78-76.91 171.69-171.69 171.69-35.52 0-70.14-11.02-99.15-31.51a171.75 171.75 0 0 1-62.76-82.94" style="stroke: currentcolor; stroke-linecap: round; stroke-miterlimit: 10; stroke-width: 34; fill: none;"></path><path d="M57.16 124.22v98.88c0 1.87.36 3.73 1.08 5.47.73 1.74 1.78 3.31 3.1 4.64 1.34 1.32 2.91 2.39 4.66 3.09 1.72.73 3.58 1.1 5.47 1.1h98.87c2.83 0 5.6-.84 7.96-2.4a14.43 14.43 0 0 0 5.28-6.43c1.08-2.62 1.35-5.49.81-8.27-.55-2.78-1.93-5.32-3.92-7.33L81.58 114.1c-2.01-2-4.55-3.38-7.33-3.93-2.78-.54-5.65-.27-8.27.81a14.3 14.3 0 0 0-6.42 5.27 14.24 14.24 0 0 0-2.4 7.97" style="fill: currentcolor;"></path></svg>
                <div class="label-dEugA">Reload</div>
            `;

      reloadButton.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Clear Caches
        localStorage.removeItem(window.HeroPlugin.Config.MOVIE_CACHE_KEY);

        console.log("[API Selector] Movie Cache cleared. Reloading...");
        window.location.reload();
      });

      footer.appendChild(reloadButton);
      wrapper.appendChild(footer);
      return wrapper;
    },

    injectSection(sources) {
      // Check if already injected
      if (document.querySelector(".hero-banner-settings-section")) return true;

      const sectionsContainer = document.querySelector(
        ".sections-container-EUKAe",
      );
      if (!sectionsContainer) return false;

      // Create Section
      const section = document.createElement("div");
      section.className =
        "section-container-twzKQ hero-banner-settings-section animation-fade-in";

      // Title
      const title = document.createElement("div");
      title.className = "section-title-Nt71Z";
      title.textContent = CONFIG.SECTION_TITLE;
      section.appendChild(title);

      // Build Options
      const movieOption = this.buildOption(
        "movie",
        "Movie Catalog",
        CONFIG.KEYS.MOVIE,
        sources.MOVIES,
      );
      section.appendChild(movieOption);

      const seriesOption = this.buildOption(
        "series",
        "Series Catalog",
        CONFIG.KEYS.SERIES,
        sources.SERIES,
      );
      section.appendChild(seriesOption);

      // Build Footer (Reload Button + Warning)
      const footer = this.buildFooter();
      section.appendChild(footer);

      // Insert at correct index
      const children = Array.from(sectionsContainer.children);
      if (children.length >= CONFIG.SECTION_INDEX) {
        sectionsContainer.insertBefore(section, children[CONFIG.SECTION_INDEX]);
      } else {
        sectionsContainer.appendChild(section);
      }

      // Close dropdowns on outside click
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".multiselect-container-w0c9l")) {
          this.closeAllDropdowns(null);
        }
      });

      return true;
    },
  };

  const LifecycleManager = {
    init() {
      if (state.isInitialized) return;
      if (!window.location.hash.startsWith(CONFIG.TARGET_ROUTE)) return;

      state.isInitialized = true;
      this.waitForConfig();
    },

    waitForConfig() {
      if (
        window.HeroPlugin &&
        window.HeroPlugin.Config &&
        window.HeroPlugin.Config.SOURCES
      ) {
        // If previously injected options exist (from route switch), they might be gone from DOM
        // so we always try to inject.
        if (!UIManager.injectSection(window.HeroPlugin.Config.SOURCES)) {
          this.startObserver();
        }
      } else {
        setTimeout(() => this.waitForConfig(), 100);
      }
    },

    startObserver() {
      if (state.observer) return;

      state.observer = new MutationObserver((mutations) => {
        if (UIManager.injectSection(window.HeroPlugin.Config.SOURCES)) {
          this.stopObserver();
        }
      });

      state.observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => this.stopObserver(), CONFIG.OBSERVER_TIMEOUT_MS);
    },

    stopObserver() {
      if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
      }
    },

    cleanup() {
      this.stopObserver();
      state.isInitialized = false;
    },
  };

  const GlobalLifecycle = {
    start() {
      this.checkRoute();
      window.addEventListener("hashchange", () => this.checkRoute());
    },

    checkRoute() {
      const isSettings = window.location.hash.startsWith(CONFIG.TARGET_ROUTE);
      if (isSettings) {
        setTimeout(() => LifecycleManager.init(), 100);
      } else {
        if (state.isInitialized) LifecycleManager.cleanup();
      }
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () =>
      GlobalLifecycle.start(),
    );
  } else {
    GlobalLifecycle.start();
  }
})();
