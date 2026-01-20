/**
 * @name Timeline Hover Time Display
 * @description Shows time position when hovering over the video timeline
 * @version 1.2.0
 * @author allecsc
 * @changelog v1.2.0 - Performance optimization: Added 50ms debounce to MutationObserver to reduce CPU usage.
 */

(function () {
  "use strict";

  // Configuration - All magic numbers centralized
  const CONFIG = {
    UPDATE_INTERVAL_MS: 100, // How often to update time display during hover
    TOOLTIP_OFFSET_PX: 3, // Pixels above the timeline
    DURATION_CACHE_TTL_MS: 5000, // Duration cache validity time
    INITIALIZATION_RETRY_MS: 1000, // Retry delay for initialization
    POLLING_INTERVAL_MS: 2000, // Polling interval for DOM changes
    Z_INDEX: 9999, // Tooltip z-index
    VIEWPORT_PADDING_PX: 5, // Padding from viewport edges
    TIME_FORMAT: "HH:MM:SS", // Default time format
    DEBUG_MODE: false, // Enable debug logging
  };

  // State management
  let state = {
    tooltipElement: null,
    cachedDuration: { value: 0, timestamp: 0 },
    seekBarElement: null,
    isInitialized: false,
    observer: null,
    hashChangeListener: null,
  };

  // TooltipManager - Handles tooltip creation and positioning (Single Responsibility)
  const TooltipManager = {
    create() {
      if (state.tooltipElement) return state.tooltipElement;

      state.tooltipElement = document.createElement("div");
      state.tooltipElement.id = "timeline-tooltip";
      // Note: Styles are handled by seekbar-hover-time.plugin.css

      document.body.appendChild(state.tooltipElement);
      return state.tooltipElement;
    },

    show(timePosition, mouseX, seekBarRect) {
      const tooltip = this.create();
      if (!tooltip) return;

      tooltip.textContent = TimeFormatter.format(timePosition);

      // Position tooltip above seek bar
      // Note: 'top' and 'left' are dynamic and must remain inline
      tooltip.style.left = `${mouseX}px`;
      tooltip.style.top = `${seekBarRect.top - CONFIG.TOOLTIP_OFFSET_PX - tooltip.offsetHeight}px`;
      tooltip.style.display = "block";

      // Center horizontally on cursor and keep within viewport
      this.adjustPosition(mouseX);
    },

    adjustPosition(mouseX) {
      const tooltip = state.tooltipElement;
      if (!tooltip) return;

      const tooltipRect = tooltip.getBoundingClientRect();
      tooltip.style.left = `${mouseX - tooltipRect.width / 2}px`;

      // Keep within viewport bounds
      const viewportWidth = window.innerWidth;
      if (tooltipRect.right > viewportWidth) {
        tooltip.style.left = `${viewportWidth - tooltipRect.width - CONFIG.VIEWPORT_PADDING_PX}px`;
      }
      if (tooltipRect.left < 0) {
        tooltip.style.left = `${CONFIG.VIEWPORT_PADDING_PX}px`;
      }
    },

    hide() {
      if (state.tooltipElement) {
        state.tooltipElement.style.display = "none";
      }
    },
  };

  // TimeFormatter - Handles time formatting (Single Responsibility)
  const TimeFormatter = {
    format(seconds) {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);

      if (CONFIG.TIME_FORMAT === "HH:MM:SS" || hours > 0) {
        return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
      } else {
        return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
      }
    },
  };

  // DurationManager - Handles video duration retrieval and caching (Single Responsibility)
  const DurationManager = {
    // Cached duration with timestamp validation
    getCached() {
      const now = Date.now();
      if (now - state.cachedDuration.timestamp < CONFIG.DURATION_CACHE_TTL_MS) {
        return state.cachedDuration.value;
      }
      return this.updateCache();
    },

    updateCache() {
      const duration = this._getDuration();
      state.cachedDuration = {
        value: duration,
        timestamp: Date.now(),
      };
      return duration;
    },

    _getDuration() {
      try {
        // Primary: Try video element
        const duration = this._getFromVideoElement();
        if (duration > 0) return duration;

        // Fallback: Try UI labels
        return this._getFromUILabels();
      } catch (error) {
        if (CONFIG.DEBUG_MODE)
          console.warn("DurationManager: Error getting duration:", error);
        return 0;
      }
    },

    _getFromVideoElement() {
      const videoSelectors = [
        "video",
        ".video-player video",
        '[class*="video"] video',
        ".player video",
      ];

      for (const selector of videoSelectors) {
        const video = document.querySelector(selector);
        if (video && video.duration && !isNaN(video.duration)) {
          return video.duration;
        }
      }
      return 0;
    },

    _getFromUILabels() {
      // DRY: Single time parsing function
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

      // Check seek bar labels
      const durationLabels = document.querySelectorAll(
        ".seek-bar-I7WeY .label-QFbsS",
      );
      let maxDuration = 0;

      for (const label of durationLabels) {
        const text = label.textContent || "";
        const duration = parseTimeText(text);
        if (duration > maxDuration) {
          maxDuration = duration;
        }
      }

      if (maxDuration > 0) return maxDuration;

      // Additional fallback: any time elements
      const timeElements = document.querySelectorAll(
        '[class*="time"], [class*="duration"]',
      );
      for (const el of timeElements) {
        const text = el.textContent || "";
        const duration = parseTimeText(text);
        if (duration > 0) return duration;
      }

      return 0;
    },
  };

  // DOMManager - Handles DOM element finding and observation (Single Responsibility)
  const DOMManager = {
    findSeekBar() {
      const seekBarSelectors = [
        ".seek-bar-I7WeY .slider-hBDOf", // Primary selector based on HTML structure
        ".seek-bar-container-JGGTa .slider-hBDOf",
        '[class*="seek-bar"] [class*="slider"]',
        ".control-bar-container-xsWA7 .seek-bar-I7WeY",
        '[class*="progress"] [class*="bar"]',
        '[class*="timeline"] [class*="slider"]',
      ];

      for (const selector of seekBarSelectors) {
        const element = document.querySelector(selector);
        if (element) return element;
      }
      return null;
    },

    observeChanges(callback) {
      let debounceTimer = null;

      const observer = new MutationObserver((mutations) => {
        // Optimization: Debounce triggers to avoid high CPU usage
        if (debounceTimer) return;

        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          callback();
        }, 50); // 50ms Debounce
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      return observer;
    },
  };

  // EventHandler - Handles user interactions (Single Responsibility)
  const EventHandler = {
    onSeekBarHover(event) {
      const seekBar = event.currentTarget;
      if (!seekBar) return;

      // Get cached duration (no expensive operations here)
      const duration = DurationManager.getCached();
      if (duration <= 0) return;

      // Calculate progress and time position
      const rect = seekBar.getBoundingClientRect();
      const progress = Math.max(
        0,
        Math.min(1, (event.clientX - rect.left) / rect.width),
      );
      const timePosition = duration * progress;

      // Show tooltip with calculated position
      TooltipManager.show(timePosition, event.clientX, rect);
    },

    onSeekBarLeave() {
      TooltipManager.hide();
    },
  };

  // InitializationManager - Handles setup and lifecycle (Single Responsibility)
  const InitializationManager = {
    init() {
      // Idempotency check: if already initialized, do nothing
      if (state.isInitialized) return;

      // Route check: only initialize if we are on the player page
      if (!window.location.hash.startsWith("#/player")) {
        // Silent return to avoid log spam
        return;
      }

      try {
        TooltipManager.create();
        this.setupSeekBar();
        this.setupObservers();
        state.isInitialized = true;

        console.log(
          "%c[TimelineHover] Plugin Initialized (Player Active)",
          "color: #00ff00; font-weight: bold;",
        );
      } catch (error) {
        console.error("[TimelineHover] Initialization failed:", error);
      }
    },

    setupSeekBar() {
      const seekBar = DOMManager.findSeekBar();
      if (!seekBar) return;

      state.seekBarElement = seekBar;

      // Clean up existing listeners
      seekBar.removeEventListener("mousemove", EventHandler.onSeekBarHover);
      seekBar.removeEventListener("mouseleave", EventHandler.onSeekBarLeave);

      // Add new listeners
      seekBar.addEventListener("mousemove", EventHandler.onSeekBarHover);
      seekBar.addEventListener("mouseleave", EventHandler.onSeekBarLeave);

      // Initial duration cache
      DurationManager.updateCache();
    },

    setupObservers() {
      // Cleanup existing observer if any
      if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
      }

      // Use MutationObserver instead of polling
      state.observer = DOMManager.observeChanges(() => {
        if (!state.seekBarElement || !document.contains(state.seekBarElement)) {
          this.setupSeekBar();
        }
      });
    },

    // Cleanup method for proper resource management
    cleanup() {
      if (state.seekBarElement) {
        state.seekBarElement.removeEventListener(
          "mousemove",
          EventHandler.onSeekBarHover,
        );
        state.seekBarElement.removeEventListener(
          "mouseleave",
          EventHandler.onSeekBarLeave,
        );
      }

      if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
      }

      // Reset state but KEEP the hashChangeListener (it's global)
      state.tooltipElement = null; // Will be recreated on next init
      state.cachedDuration = { value: 0, timestamp: 0 };
      state.seekBarElement = null;
      state.isInitialized = false;
      state.observer = null;

      console.log(
        "%c[TimelineHover] Plugin Destroyed (Player Exited)",
        "color: #ff9900; font-weight: bold;",
      );
    },
  };

  // Global Lifecycle Controller
  const GlobalLifecycle = {
    start() {
      // 1. Initial check
      this.checkRouteAndInit();

      // 2. Setup persistent route listener
      window.addEventListener("hashchange", () => {
        // Small delay to allow DOM to update
        setTimeout(
          () => this.checkRouteAndInit(),
          CONFIG.INITIALIZATION_RETRY_MS,
        );
      });
    },

    checkRouteAndInit() {
      const isPlayer = window.location.hash.startsWith("#/player");

      if (isPlayer) {
        // We are entering the player -> Initialize
        InitializationManager.init();
      } else {
        // We are leaving the player -> Cleanup
        if (state.isInitialized) {
          InitializationManager.cleanup();
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
