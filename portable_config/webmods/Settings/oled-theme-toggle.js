/**
 * @name OLED Theme Toggle
 * @description Toggle between OLED-friendly pure black theme and default purple theme
 * @version 1.3.1
 * @author allecsc
 * @changelog v1.3.1 - Performance optimization: Added 50ms debounce to MutationObserver.
 */

(function () {
  "use strict";

  // Configuration
  const CONFIG = {
    STORAGE_KEY: "stremio-oled-theme-enabled",
    TARGET_ROUTE: "#/settings",
    OBSERVER_TIMEOUT_MS: 10000,
    THEMES: {
      default: {
        primary: "#0c0b11",
        secondary: "#1a173e",
      },
      oled: {
        primary: "#000000",
        secondary: "#000000",
      },
    },
  };

  // State
  let state = {
    isOledMode: localStorage.getItem(CONFIG.STORAGE_KEY) === "true",
    observer: null,
    isInitialized: false,
    toggleContainer: null,
  };

  // Theme Logic
  const ThemeManager = {
    apply(theme) {
      const root = document.documentElement;
      root.style.setProperty("--primary-background-color", theme.primary);
      root.style.setProperty("--secondary-background-color", theme.secondary);
    },

    toggle() {
      state.isOledMode = !state.isOledMode;
      const theme = state.isOledMode
        ? CONFIG.THEMES.oled
        : CONFIG.THEMES.default;

      this.apply(theme);
      UIManager.updateVisualState();
      localStorage.setItem(CONFIG.STORAGE_KEY, state.isOledMode.toString());

      console.log(
        `%c[OLED Toggle] Switched to ${
          state.isOledMode ? "OLED" : "default"
        } theme`,
        "color: #00aaff; font-weight: bold;",
      );
    },

    initTheme() {
      const theme = state.isOledMode
        ? CONFIG.THEMES.oled
        : CONFIG.THEMES.default;
      this.apply(theme);
    },
  };

  const UIManager = {
    findOptionByLabel(labelText) {
      const labels = Array.from(document.querySelectorAll(".label-FFamJ"));
      const label = labels.find((el) => el.textContent.trim() === labelText);
      return label ? label.closest(".option-container-EGlcv") : null;
    },

    createToggleOption(label, isChecked, onChange) {
      const container = document.createElement("div");
      container.className = "option-container-EGlcv oled-theme-option";

      const nameContainer = document.createElement("div");
      nameContainer.className = "option-name-container-exGMI";

      const labelEl = document.createElement("div");
      labelEl.className = "label-FFamJ";
      labelEl.textContent = label;

      nameContainer.appendChild(labelEl);

      const toggleContainer = document.createElement("div");
      toggleContainer.tabIndex = -1;
      toggleContainer.className = `option-input-container-NPgpT toggle-container-lZfHP button-container-zVLH6${
        isChecked ? " checked" : ""
      }`;

      const toggle = document.createElement("div");
      toggle.className = "toggle-toOWM";
      toggleContainer.appendChild(toggle);

      toggleContainer.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onChange();
      });

      container.appendChild(nameContainer);
      container.appendChild(toggleContainer);
      return container;
    },

    updateVisualState() {
      if (!state.toggleContainer) return;

      const inputContainer = state.toggleContainer.querySelector(
        ".toggle-container-lZfHP",
      );
      if (inputContainer) {
        if (state.isOledMode) {
          inputContainer.classList.add("checked");
        } else {
          inputContainer.classList.remove("checked");
        }
      }
    },

    inject() {
      // Avoid duplicates
      if (document.querySelector(".oled-theme-option")) return true;

      // 1. Find Anchor (UI Language)
      const uiLanguageOption = this.findOptionByLabel("UI Language");
      if (!uiLanguageOption) return false;

      // 2. Create Option from scratch
      const newOption = this.createToggleOption(
        "OLED Theme",
        state.isOledMode,
        () => ThemeManager.toggle(),
      );

      // 3. Store reference
      state.toggleContainer = newOption;

      // 4. Inject
      uiLanguageOption.parentNode.insertBefore(
        newOption,
        uiLanguageOption.nextSibling,
      );

      console.log("%c[OLED Toggle] Injected into Settings", "color: #00ff00;");
      return true;
    },
  };

  const LifecycleManager = {
    init() {
      if (state.isInitialized) return;

      // Route Check
      if (!window.location.hash.startsWith(CONFIG.TARGET_ROUTE)) return;

      state.isInitialized = true;
      ThemeManager.initTheme(); // Ensure theme is applied even if we haven't injected yet

      // Try immediate replacement
      if (!UIManager.inject()) {
        this.startObserver();
      }
    },

    startObserver() {
      if (state.observer) return;

      let debounceTimer = null;
      state.observer = new MutationObserver((mutations) => {
        if (debounceTimer) return;

        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          if (UIManager.inject()) {
            this.stopObserver();
          }
        }, 50);
      });

      state.observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // Safety timeout
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
      state.toggleContainer = null;
      // Note: We don't revert the theme on cleanup, user persistence is desired.
    },
  };

  const GlobalLifecycle = {
    start() {
      // Apply theme immediately on load regardless of route
      ThemeManager.initTheme();

      this.checkRoute();
      window.addEventListener("hashchange", () => this.checkRoute());

      // Storage listener for live reactivity (Wizard Support)
      window.addEventListener("storage", (e) => {
        if (e.key === CONFIG.STORAGE_KEY) {
          const newValue = e.newValue === "true";
          if (state.isOledMode !== newValue) {
            state.isOledMode = newValue;
            ThemeManager.initTheme();
            UIManager.updateVisualState();
            console.log(
              "%c[OLED Toggle] Synced from storage change",
              "color: #00aaff;",
            );
          }
        }
      });
    },

    checkRoute() {
      const isSettings = window.location.hash.startsWith(CONFIG.TARGET_ROUTE);

      if (isSettings) {
        // Small delay to allow DOM to clear/render
        setTimeout(() => LifecycleManager.init(), 100);
      } else {
        if (state.isInitialized) {
          LifecycleManager.cleanup();
        }
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
