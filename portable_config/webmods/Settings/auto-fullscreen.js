/**
 * @name Auto Fullscreen
 * @description Automatically enter fullscreen on startup if enabled
 * @version 1.1.0
 * @author allecsc
 * @changelog v1.1.0 - Performance optimization: Added 50ms debounce to MutationObserver.
 */

(function () {
  "use strict";

  const CONFIG = {
    STORAGE_KEY: "stremio-auto-fullscreen",
    TARGET_ROUTE: "#/settings",
    OBSERVER_TIMEOUT_MS: 10000,
  };

  let state = {
    isEnabled: localStorage.getItem(CONFIG.STORAGE_KEY) === "true",
    observer: null,
    isInitialized: false,
    toggleContainer: null,
  };

  const FullscreenManager = {
    toggle() {
      state.isEnabled = !state.isEnabled;
      localStorage.setItem(CONFIG.STORAGE_KEY, state.isEnabled.toString());
      UIManager.updateVisualState();

      if (state.isEnabled) {
        this.enter();
      }
    },

    enter() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((err) => {
          // Fallback for missing user gesture
          this.addFallbackListener();
        });
      }
    },

    addFallbackListener() {
      const onInteract = () => {
        if (state.isEnabled && !document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
        window.removeEventListener("click", onInteract);
        window.removeEventListener("keydown", onInteract);
      };
      window.addEventListener("click", onInteract);
      window.addEventListener("keydown", onInteract);
    },
  };

  const UIManager = {
    findOptionByLabel(labelText) {
      const labels = Array.from(document.querySelectorAll(".label-FFamJ"));
      const label = labels.find((el) => el.textContent.trim() === labelText);
      return label ? label.closest(".option-container-EGlcv") : null;
    },

    updateVisualState() {
      if (!state.toggleContainer) return;

      const inputContainer = state.toggleContainer.querySelector(
        ".toggle-container-lZfHP",
      );
      if (inputContainer) {
        if (state.isEnabled) {
          inputContainer.classList.add("checked");
        } else {
          inputContainer.classList.remove("checked");
        }
      }
    },

    inject() {
      if (document.querySelector(".auto-fullscreen-option")) return true;

      const uiLanguageOption = this.findOptionByLabel("UI Language");
      const cloneSource = this.findOptionByLabel("Escape key exit full screen");

      if (!uiLanguageOption || !cloneSource) return false;

      const newOption = cloneSource.cloneNode(true);
      newOption.classList.add("auto-fullscreen-option");

      const label = newOption.querySelector(".label-FFamJ");
      if (label) label.textContent = "Auto Fullscreen";

      state.toggleContainer = newOption;
      const inputContainer = newOption.querySelector(".toggle-container-lZfHP");

      if (inputContainer) {
        inputContainer.onclick = null;
        inputContainer.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          FullscreenManager.toggle();
        });

        this.updateVisualState();
      }

      // Insert after UI Language (Order will be: UI Lang -> (Maybe OLED) -> Auto Fullscreen)
      // By inserting after UI Lang always, we stack them.
      // If I insertBefore UI Lang's sibling, I take the spot right after UI Lang.
      // oled-theme-toggle also does this. So the *second* script to run takes the top spot.
      // To ensure consistent ordering, we could look for OLED option first.

      const oledOption = document.querySelector(".oled-theme-option");
      const target = oledOption || uiLanguageOption;

      target.parentNode.insertBefore(newOption, target.nextSibling);

      return true;
    },
  };

  const LifecycleManager = {
    init() {
      if (state.isInitialized) return;

      if (!window.location.hash.startsWith(CONFIG.TARGET_ROUTE)) return;

      state.isInitialized = true;

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
    },
  };

  const GlobalLifecycle = {
    start() {
      if (state.isEnabled) {
        FullscreenManager.enter();
      }

      this.checkRoute();
      window.addEventListener("hashchange", () => this.checkRoute());

      // Storage listener for live reactivity (Wizard Support)
      window.addEventListener("storage", (e) => {
        if (e.key === CONFIG.STORAGE_KEY) {
          const newValue = e.newValue === "true";
          if (state.isEnabled !== newValue) {
            state.isEnabled = newValue;
            UIManager.updateVisualState();
            if (state.isEnabled) FullscreenManager.enter();
            console.log(
              "%c[Auto FS] Synced from storage change",
              "color: #00aaff;",
            );
          }
        }
      });
    },

    checkRoute() {
      const isSettings = window.location.hash.startsWith(CONFIG.TARGET_ROUTE);

      if (isSettings) {
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
