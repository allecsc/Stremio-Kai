/**
 * @name Playback Clock & Estimated Finish Time
 * @description Displays the current time and estimated finish time in the player UI with Settings Toggles
 * @version 1.2.0
 * @author Antigravity
 */

(function () {
  "use strict";

  // Configuration
  const CONFIG = {
    UPDATE_INTERVAL_MS: 1000,
    INITIALIZATION_RETRY_MS: 1000,
    STORAGE_KEYS: {
      ENABLED: "stremio-player-clock-enabled",
      USE_24H: "stremio-player-clock-24h",
    },
    SETTINGS_ROUTE: "#/settings",
    PLAYER_ROUTE: "#/player",
  };

  // State management
  let state = {
    isEnabled: localStorage.getItem(CONFIG.STORAGE_KEYS.ENABLED) !== "false",
    use24Hour: localStorage.getItem(CONFIG.STORAGE_KEYS.USE_24H) !== "false",
    clockElement: null,
    timeSpan: null,
    endsSpan: null,
    separatorSpan: null,
    isInitialized: false,
    observer: null,
    updateInterval: null,
    hashTimeoutId: null,
    settingsObserver: null,
    settingsInitialized: false,
    enabledToggleContainer: null,
    formatToggleContainer: null,
  };

  // Time Formatter
  const TimeFormatter = {
    formatter24: new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    formatter12: new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),

    formatTime(date, use24Hour) {
      return use24Hour
        ? this.formatter24.format(date)
        : this.formatter12.format(date);
    },
  };

  // ClockManager - Handles creating, updating, and removing the clock element
  const ClockManager = {
    create() {
      if (state.clockElement) return state.clockElement;

      const container = document.createElement("div");
      container.id = "player-clock-eta";
      container.className = "player-clock-eta";
      container.innerHTML = `
        <span class="player-clock-time" id="player-clock-time">--:--</span>
        <span class="player-clock-separator">•</span>
        <span class="player-clock-ends" id="player-clock-ends">Ends at --:--</span>
      `;

      state.clockElement = container;
      state.timeSpan = container.querySelector("#player-clock-time");
      state.endsSpan = container.querySelector("#player-clock-ends");
      state.separatorSpan = container.querySelector(".player-clock-separator");

      return container;
    },

    update() {
      if (!state.clockElement) return;

      const now = new Date();
      if (state.timeSpan) {
        state.timeSpan.textContent = TimeFormatter.formatTime(
          now,
          state.use24Hour,
        );
      }

      // Try to find the video element to calculate end time
      const video = document.querySelector("video");
      let duration = 0;
      let currentTime = 0;
      let speed = 1;

      if (video && video.duration && !isNaN(video.duration)) {
        duration = video.duration;
        currentTime = video.currentTime || 0;
        speed = video.playbackRate || 1;
      } else {
        // Fallback: Try reading seek bar UI labels
        const durationLabels = document.querySelectorAll(
          ".seek-bar-I7WeY .label-QFbsS",
        );
        if (durationLabels.length >= 2) {
          const parseTimeText = (text) => {
            const match =
              text.match(/(\d{1,2}):(\d{2}):(\d{2})/) ||
              text.match(/(\d{1,2}):(\d{2})/);
            if (!match) return 0;

            const parts = match.slice(1).map(Number);
            if (parts.length === 3) {
              return parts[0] * 3600 + parts[1] * 60 + parts[2];
            } else if (parts.length === 2) {
              return parts[0] * 60 + parts[1];
            }
            return 0;
          };

          const currentText = durationLabels[0].textContent || "";
          const durationText = durationLabels[1].textContent || "";

          currentTime = parseTimeText(currentText);
          if (durationText.startsWith("-")) {
            const remaining = parseTimeText(durationText.substring(1));
            duration = currentTime + remaining;
          } else {
            duration = parseTimeText(durationText);
          }
        }
      }

      if (duration > 0 && currentTime >= 0) {
        const remainingSeconds = Math.max(0, duration - currentTime) / speed;
        const endTime = new Date(now.getTime() + remainingSeconds * 1000);

        if (state.endsSpan) {
          state.endsSpan.textContent = `Ends at ${TimeFormatter.formatTime(
            endTime,
            state.use24Hour,
          )}`;
          state.endsSpan.style.display = "inline";
        }
        if (state.separatorSpan) {
          state.separatorSpan.style.display = "inline";
        }
      } else {
        if (state.endsSpan) {
          state.endsSpan.style.display = "none";
        }
        if (state.separatorSpan) {
          state.separatorSpan.style.display = "none";
        }
      }
    },

    remove() {
      if (state.clockElement) {
        state.clockElement.remove();
        state.clockElement = null;
      }
      state.timeSpan = null;
      state.endsSpan = null;
      state.separatorSpan = null;
    },
  };

  // DOMManager - Handles finding target elements and observing changes
  const DOMManager = {
    findPlayerContainer() {
      return (
        document.querySelector("[class*='player-container']") ||
        document.querySelector(".player-container-wIELK")
      );
    },

    findNavBar(playerContainer) {
      const container = playerContainer || this.findPlayerContainer();
      if (!container) return null;

      const selectors = [
        "nav[class*='horizontal-nav-bar-container']",
        ".horizontal-nav-bar-container-Y_zvK",
        "nav[class*='nav-bar-layer']",
        ".nav-bar-layer-r9HT5",
      ];
      for (const selector of selectors) {
        const el = container.querySelector(selector);
        if (el) {
          return el;
        }
      }
      return null;
    },

    findButtonsContainer(navBar) {
      if (!navBar) return null;
      const selectors = [
        ".buttons-container-Oc5z1",
        "div[class*='buttons-container']",
        "[class*='buttons-container']",
      ];
      for (const selector of selectors) {
        const el = navBar.querySelector(selector);
        if (el) {
          return el;
        }
      }
      return null;
    },

    observeChanges(target, callback) {
      if (!target) return null;

      const observer = new MutationObserver((mutations) => {
        callback();
      });

      observer.observe(target, {
        childList: true,
        subtree: true,
      });

      return observer;
    },
  };

  // SettingsUIManager - Handles injecting options into Stremio Settings UI
  const SettingsUIManager = {
    findAdvancedCategory() {
      const labels = Array.from(document.querySelectorAll(".label-FFamJ"));
      for (const label of labels) {
        if (label.textContent.trim() === "Advanced") {
          return label.closest(".section-category-container-EOuS0");
        }
      }
      return null;
    },

    createToggleOption(label, isChecked, onChange) {
      const container = document.createElement("div");
      container.className =
        "option-container-EGlcv player-clock-settings-option";

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
      if (state.enabledToggleContainer) {
        const input = state.enabledToggleContainer.querySelector(
          ".toggle-container-lZfHP",
        );
        if (input) {
          input.classList.toggle("checked", state.isEnabled);
        }
      }
      if (state.formatToggleContainer) {
        const input = state.formatToggleContainer.querySelector(
          ".toggle-container-lZfHP",
        );
        if (input) {
          input.classList.toggle("checked", state.use24Hour);
        }
      }
    },

    inject() {
      if (document.querySelector(".player-clock-settings-option")) return true;

      const advancedCategory = this.findAdvancedCategory();
      if (!advancedCategory || !advancedCategory.parentNode) return false;

      const enabledOption = this.createToggleOption(
        "Show Playback Clock & ETA",
        state.isEnabled,
        () => {
          state.isEnabled = !state.isEnabled;
          localStorage.setItem(
            CONFIG.STORAGE_KEYS.ENABLED,
            state.isEnabled.toString(),
          );
          this.updateVisualState();
          if (!state.isEnabled && state.isInitialized) {
            InitializationManager.cleanup();
          } else if (
            state.isEnabled &&
            window.location.hash.startsWith(CONFIG.PLAYER_ROUTE)
          ) {
            InitializationManager.init();
          }
        },
      );

      const formatOption = this.createToggleOption(
        "Use 24-Hour Time Format",
        state.use24Hour,
        () => {
          state.use24Hour = !state.use24Hour;
          localStorage.setItem(
            CONFIG.STORAGE_KEYS.USE_24H,
            state.use24Hour.toString(),
          );
          this.updateVisualState();
          if (state.isInitialized) {
            ClockManager.update();
          }
        },
      );

      state.enabledToggleContainer = enabledOption;
      state.formatToggleContainer = formatOption;

      const parent = advancedCategory.parentNode;
      let nextSibling = advancedCategory.nextSibling;
      while (nextSibling) {
        if (
          nextSibling.classList &&
          nextSibling.classList.contains("section-category-container-EOuS0")
        ) {
          break;
        }
        nextSibling = nextSibling.nextSibling;
      }

      const fragment = document.createDocumentFragment();
      fragment.appendChild(enabledOption);
      fragment.appendChild(formatOption);

      if (nextSibling) {
        parent.insertBefore(fragment, nextSibling);
      } else {
        parent.appendChild(fragment);
      }

      return true;
    },
  };

  // SettingsLifecycleManager - Handles setup and cleanup of settings injection
  const SettingsLifecycleManager = {
    init() {
      if (state.settingsInitialized) return;
      if (!window.location.hash.startsWith(CONFIG.SETTINGS_ROUTE)) return;

      state.settingsInitialized = true;
      if (!SettingsUIManager.inject()) {
        this.startObserver();
      }
    },

    startObserver() {
      if (state.settingsObserver) return;

      let debounceTimer = null;
      state.settingsObserver = new MutationObserver(() => {
        if (debounceTimer) return;

        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          if (SettingsUIManager.inject()) {
            this.stopObserver();
          }
        }, 50);
      });

      state.settingsObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });

      setTimeout(() => this.stopObserver(), 10000);
    },

    stopObserver() {
      if (state.settingsObserver) {
        state.settingsObserver.disconnect();
        state.settingsObserver = null;
      }
    },

    cleanup() {
      this.stopObserver();
      state.settingsInitialized = false;
      state.enabledToggleContainer = null;
      state.formatToggleContainer = null;
    },
  };

  // InitializationManager - Handles setup and cleanup of state for player page
  const InitializationManager = {
    init() {
      if (state.isInitialized) return;
      if (!state.isEnabled) return;

      if (!window.location.hash.startsWith(CONFIG.PLAYER_ROUTE)) {
        return;
      }

      try {
        const playerContainer = DOMManager.findPlayerContainer();
        const navBar = DOMManager.findNavBar(playerContainer);
        if (!navBar) return;

        this.setupClock(navBar);
        this.setupObservers(playerContainer);

        // Start update timer
        if (state.updateInterval) {
          clearInterval(state.updateInterval);
        }
        state.updateInterval = setInterval(() => {
          ClockManager.update();
        }, CONFIG.UPDATE_INTERVAL_MS);

        state.isInitialized = true;
      } catch (error) {
        console.error("[PlayerClockEta] Initialization failed:", error);
      }
    },

    setupClock(navBar) {
      if (!navBar) return;

      const clock = ClockManager.create();

      if (!navBar.contains(clock)) {
        const buttonsContainer = DOMManager.findButtonsContainer(navBar);

        if (buttonsContainer && buttonsContainer.parentNode === navBar) {
          navBar.insertBefore(clock, buttonsContainer);
        } else {
          navBar.appendChild(clock);
        }
      }

      ClockManager.update();
    },

    setupObservers(playerContainer) {
      if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
      }

      if (!playerContainer) return;

      state.observer = DOMManager.observeChanges(playerContainer, () => {
        const navBar = DOMManager.findNavBar(playerContainer);
        if (!navBar) return;

        const clock = ClockManager.create();
        if (!navBar.contains(clock)) {
          this.setupClock(navBar);
        }
      });
    },

    cleanup() {
      if (state.hashTimeoutId) {
        clearTimeout(state.hashTimeoutId);
        state.hashTimeoutId = null;
      }

      if (state.updateInterval) {
        clearInterval(state.updateInterval);
        state.updateInterval = null;
      }

      if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
      }

      ClockManager.remove();
      state.isInitialized = false;
    },
  };

  // Global Lifecycle Controller
  const GlobalLifecycle = {
    start() {
      this.checkRouteAndInit();

      window.addEventListener("hashchange", () => {
        if (state.hashTimeoutId) {
          clearTimeout(state.hashTimeoutId);
        }
        state.hashTimeoutId = setTimeout(() => {
          this.checkRouteAndInit();
          state.hashTimeoutId = null;
        }, CONFIG.INITIALIZATION_RETRY_MS);
      });

      // Storage event listener for tab sync
      window.addEventListener("storage", (e) => {
        if (e.key === CONFIG.STORAGE_KEYS.ENABLED) {
          state.isEnabled = e.newValue !== "false";
          SettingsUIManager.updateVisualState();
          if (!state.isEnabled && state.isInitialized) {
            InitializationManager.cleanup();
          } else if (
            state.isEnabled &&
            window.location.hash.startsWith(CONFIG.PLAYER_ROUTE)
          ) {
            InitializationManager.init();
          }
        } else if (e.key === CONFIG.STORAGE_KEYS.USE_24H) {
          state.use24Hour = e.newValue !== "false";
          SettingsUIManager.updateVisualState();
          if (state.isInitialized) {
            ClockManager.update();
          }
        }
      });
    },

    checkRouteAndInit() {
      const isPlayer = window.location.hash.startsWith(CONFIG.PLAYER_ROUTE);
      const isSettings = window.location.hash.startsWith(
        CONFIG.SETTINGS_ROUTE,
      );

      if (isPlayer) {
        InitializationManager.init();
      } else {
        if (state.isInitialized) {
          InitializationManager.cleanup();
        }
      }

      if (isSettings) {
        setTimeout(() => SettingsLifecycleManager.init(), 100);
      } else {
        if (state.settingsInitialized) {
          SettingsLifecycleManager.cleanup();
        }
      }
    },
  };

  // Start the global lifecycle
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () =>
      GlobalLifecycle.start(),
    );
  } else {
    GlobalLifecycle.start();
  }
})();
