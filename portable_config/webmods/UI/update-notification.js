// Stremio Kai Version Plugin
// Checks for GitHub releases and shows a toast notification if a new version is available.
// Also flags the logo with 'update-available' class for navigation.js to use.

(function () {
  "use strict";

  if (window.KaiUpdatePlugin?.initialized) return;
  window.KaiUpdatePlugin = window.KaiUpdatePlugin || {};
  window.KaiUpdatePlugin.initialized = true;

  // Configuration
  const CONFIG = {
    CURRENT_VERSION: "4.2.0",
    REPO_URL:
      "https://api.github.com/repos/allecsc/Stremio-Kai/releases/latest",
    RELEASES_URL: "https://allecsc.github.io/Stremio-Kai/changelog.html",
    TOAST_AUTO_HIDE_MS: 30000,
    LOGO_PULSING_MAX_RETRIES: 10,
    LOGO_PULSING_RETRY_INTERVAL_MS: 1000,
  };

  // State
  let state = {
    updateAvailable: false,
    cachedToast: null,
    toastAutoHideTimeout: null,
    logoRetryTimeout: null,
    hasShownToast: false,
    logoPulsingRetryCount: 0,
    isInitialized: false,
  };

  /**
   * Manages update checking and notification display.
   * Runs once on app initialization to check for new versions.
   */
  const UpdateManager = {
    async init() {
      if (state.isInitialized) return;
      state.isInitialized = true;

      console.log(
        `%c[Kai Version] Checking for updates (v${CONFIG.CURRENT_VERSION})...`,
        "color: #00aaff;",
      );

      try {
        const response = await fetch(CONFIG.REPO_URL);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const latestVersion = data.tag_name;
        const currentVersionStr = "v" + CONFIG.CURRENT_VERSION;

        if (latestVersion && latestVersion !== currentVersionStr) {
          console.log(
            `%c[Kai Version] Update available: ${latestVersion}`,
            "color: #00ff00; font-weight: bold;",
          );
          state.updateAvailable = true;
          this.showToast();
          this.applyLogoPulsing();
        } else {
          console.log("[Kai Version] Up to date.");
        }
      } catch (error) {
        console.warn(
          "[Kai Version] Update check failed:",
          error.message || error,
        );
      }
    },

    /**
     * Shows the update notification toast.
     */
    showToast() {
      if (state.hasShownToast) return;

      if (!state.cachedToast) {
        const toast = document.createElement("div");
        toast.className = "kai-update-toast";
        toast.innerHTML = `
            <div class="toast-content">
                <span class="toast-icon">🔔</span>
                <div class="toast-text">
                    <div class="toast-title">Update Available</div>
                    <div class="toast-message">New Stremio Kai version ready!</div>
                </div>
                <button class="toast-close">✕</button>
            </div>
        `;

        const closeBtn = toast.querySelector(".toast-close");
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.hideToast();
        });

        toast.addEventListener("click", () => {
          window.open(CONFIG.RELEASES_URL, "_blank");
        });

        const logoContainer = document.querySelector(".logo-container-jteMT");
        if (logoContainer) {
          logoContainer.parentElement.insertBefore(
            toast,
            logoContainer.nextSibling,
          );
        } else {
          document.body.appendChild(toast);
        }

        state.cachedToast = toast;
      }

      if (state.cachedToast) {
        state.cachedToast.style.display = "block";
        state.hasShownToast = true;

        state.toastAutoHideTimeout = setTimeout(() => {
          this.hideToast();
        }, CONFIG.TOAST_AUTO_HIDE_MS);
      }
    },

    hideToast() {
      if (state.cachedToast) {
        if (state.toastAutoHideTimeout) {
          clearTimeout(state.toastAutoHideTimeout);
          state.toastAutoHideTimeout = null;
        }
        state.cachedToast.remove();
        state.cachedToast = null;
      }
    },

    /**
     * Applies pulsing animation to logo if update is available.
     * Also marks the logo with '.update-available' for navigation.js to read.
     */
    applyLogoPulsing() {
      if (!state.updateAvailable) return;

      const logoContainer = document.querySelector(".logo-container-jteMT");
      if (!logoContainer) {
        if (state.logoPulsingRetryCount < CONFIG.LOGO_PULSING_MAX_RETRIES) {
          state.logoPulsingRetryCount++;
          state.logoRetryTimeout = setTimeout(
            () => this.applyLogoPulsing(),
            CONFIG.LOGO_PULSING_RETRY_INTERVAL_MS,
          );
        }
        return;
      }

      state.logoPulsingRetryCount = 0;
      const logo = logoContainer.querySelector(".logo-oPx1q");
      if (!logo) return;

      // This class triggers CSS animation AND tells navigation.js to redirect to releases
      logoContainer.classList.add("update-available");
      logo.classList.add("update-available");

      // Update title for hover tooltip
      logoContainer.title = "Click to view Stremio Kai updates";
    },
  };

  // Route change handler to hide toast
  window.addEventListener("hashchange", () => {
    UpdateManager.hideToast();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => UpdateManager.init());
  } else {
    UpdateManager.init();
  }
})();
