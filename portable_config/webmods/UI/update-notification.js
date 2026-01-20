// Stremio Kai Version Plugin for Liquid Glass Theme
// Adds a custom version line above the existing version info
// Uses element caching for toast notification (create once, show/hide as needed)

(function () {
  "use strict";

  // Configuration
  const CONFIG = {
    CURRENT_VERSION: "4.0.0",
    REPO_URL:
      "https://api.github.com/repos/allecsc/Stremio-Kai/releases/latest",
    GITHUB_URL: "https://github.com/allecsc/Stremio-Kai",
    RELEASES_URL: "https://github.com/allecsc/Stremio-Kai/releases/latest",
    TARGET_ROUTE: "#/settings",
    OBSERVER_TIMEOUT_MS: 10000,
    ROUTE_CHANGE_DELAY_MS: 100,
    TOAST_AUTO_HIDE_MS: 30000,
    LOGO_PULSING_MAX_RETRIES: 10,
    LOGO_PULSING_RETRY_INTERVAL_MS: 1000,
    MUTATION_DEBOUNCE_MS: 50,
  };

  // State
  let state = {
    versionAdded: false,
    githubLinkReplaced: false,
    updateAvailable: false,
    logoEnhanced: false,
    donationAdded: false,
    observer: null,
    isInitialized: false,
    cachedToast: null,
    toastAutoHideTimeout: null,
    logoRetryTimeout: null,
    hasShownToast: false,
    logoPulsingRetryCount: 0, // Proper state for retry count
    mutationDebounceTimer: null, // Debounce timer for observer
  };

  /**
   * Manages update checking and notification display.
   * Runs once on app initialization to check for new versions.
   */
  const UpdateManager = {
    async init() {
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
          this.enhanceLogo();
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
     * Creates toast element, shows it, and destroys after timeout.
     */
    showToast() {
      // Only show once per session
      if (state.hasShownToast) return;

      // Create toast element
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

        // Attach close button listener
        const closeBtn = toast.querySelector(".toast-close");
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.hideToast();
        });

        // Attach toast click listener (open releases page)
        toast.addEventListener("click", () => {
          window.open(CONFIG.RELEASES_URL, "_blank");
        });

        // Insert into DOM
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

      // Show the toast
      if (state.cachedToast) {
        state.cachedToast.style.display = "block";
        state.hasShownToast = true;

        // Set auto-hide timer
        state.toastAutoHideTimeout = setTimeout(() => {
          this.hideToast();
        }, CONFIG.TOAST_AUTO_HIDE_MS);
      }
    },

    /**
     * Hides and destroys the update notification toast.
     * Removes element from DOM completely to free memory.
     */
    hideToast() {
      if (state.cachedToast) {
        // Clear auto-hide timeout
        if (state.toastAutoHideTimeout) {
          clearTimeout(state.toastAutoHideTimeout);
          state.toastAutoHideTimeout = null;
        }

        // Remove from DOM completely
        state.cachedToast.remove();
        state.cachedToast = null;
      }
    },

    /**
     * Enhances the Stremio logo with click behavior and optional pulsing animation.
     * Uses event delegation to survive DOM re-renders on route changes.
     * Logo is always clickable - opens GitHub home by default, releases page when update is available.
     */
    enhanceLogo() {
      if (state.logoEnhanced) return;

      // Use event delegation on document to survive logo re-renders
      // Single click handler - no zombies
      document.addEventListener("click", (e) => {
        const logo = e.target.closest(".logo-oPx1q");
        if (!logo) return;

        e.preventDefault();

        // Determine URL based on update availability
        const url = state.updateAvailable
          ? CONFIG.RELEASES_URL
          : CONFIG.GITHUB_URL;
        window.open(url, "_blank");
      });

      // Use event delegation for dynamic tooltips and cursor
      // Mouseover sets tooltip and cursor when logo appears/reappears
      document.addEventListener("mouseover", (e) => {
        const logo = e.target.closest(".logo-oPx1q");
        if (!logo) return;

        // Apply cursor styling
        logo.style.cursor = "pointer";
        logo.style.transition = "all 0.3s ease";

        // Set tooltip based on update availability
        if (state.updateAvailable) {
          logo.title = "Click to view Stremio Kai updates";
        } else {
          logo.title = "Visit Stremio Kai on GitHub";
        }
      });

      // Apply initial visual enhancements (pulsing animation if update available)
      this.applyLogoPulsing();

      state.logoEnhanced = true;
    },

    /**
     * Applies pulsing animation to logo if update is available.
     * Called on init and can be re-called if logo is re-rendered.
     */
    applyLogoPulsing() {
      if (!state.updateAvailable) return;

      const logoContainer = document.querySelector(".logo-container-jteMT");
      if (!logoContainer) {
        // Retry with limit to prevent infinite retries
        if (state.logoPulsingRetryCount < CONFIG.LOGO_PULSING_MAX_RETRIES) {
          state.logoPulsingRetryCount++;
          state.logoRetryTimeout = setTimeout(
            () => this.applyLogoPulsing(),
            CONFIG.LOGO_PULSING_RETRY_INTERVAL_MS,
          );
        }
        return;
      }

      // Reset counter on success
      state.logoPulsingRetryCount = 0;
      const logo = logoContainer.querySelector(".logo-oPx1q");
      if (!logo) return;

      // Add pulsing animation class
      logo.classList.add("update-available");
    },
  };

  /**
   * Manages UI elements specific to the settings page.
   * Injects version label into the settings sidebar.
   */
  const UIManager = {
    injectVersionLabel() {
      if (state.versionAdded) return true;

      const sideMenu = document.querySelector(".side-menu-container-NG17D");
      if (!sideMenu) return false;

      const versionLabels = sideMenu.querySelectorAll(
        ".version-info-label-uMkm7",
      );
      if (versionLabels.length === 0) return false;

      const kaiVersionLabel = document.createElement("div");
      kaiVersionLabel.className = "version-info-label-uMkm7";
      kaiVersionLabel.title = CONFIG.CURRENT_VERSION;
      kaiVersionLabel.textContent =
        "Stremio Kai Version: " + CONFIG.CURRENT_VERSION;

      sideMenu.insertBefore(kaiVersionLabel, versionLabels[0]);

      state.versionAdded = true;
      console.log("%c[Kai Version] Label injected", "color: #00ff00;");
      return true;
    },

    replaceGithubLink() {
      if (state.githubLinkReplaced) return true;

      // Find the link by href or title
      const links = document.querySelectorAll("a.option-input-container-NPgpT");
      const targetLink = Array.from(links).find(
        (link) =>
          link.href.includes("stremio-community-v5") ||
          link.title === "Stremio Community V5 Github",
      );

      if (!targetLink) return false;

      // Update Link Attributes
      targetLink.href = CONFIG.GITHUB_URL;
      targetLink.title = "Stremio Kai Github";

      // Update Label Text
      const label = targetLink.querySelector(".label-FFamJ");
      if (label) {
        // Add GitHub icon + text
        label.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <svg height="20" width="20" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
                        </svg>
                        <span>Stremio Kai Github</span>
                    </div>
                `;
      }

      state.githubLinkReplaced = true;
      console.log("%c[Kai Version] GitHub link replaced", "color: #00ff00;");
      return true;
    },

    injectDonationButton() {
      if (state.donationAdded) return true;

      const githubLink = document.querySelector(
        'a[href="' + CONFIG.GITHUB_URL + '"]',
      );
      if (!githubLink) return false;

      const parent = githubLink.parentNode;
      if (!parent) return false;

      // 1. Create the wrapper container
      const wrapper = document.createElement("div");
      wrapper.className = "kai-links-row";
      wrapper.style.display = "flex";
      wrapper.style.alignItems = "center";
      wrapper.style.gap = "2rem";
      wrapper.style.marginTop = "0.5rem";

      // 2. Insert wrapper before the Github link
      parent.insertBefore(wrapper, githubLink);

      // 3. Move Github link INSIDE wrapper
      wrapper.appendChild(githubLink);

      // 4. Create Star Link
      const starLink = githubLink.cloneNode(true);
      starLink.href = CONFIG.GITHUB_URL;
      starLink.title = "Star on GitHub";
      starLink.classList.add("kai-muted-link");
      const starLabel = starLink.querySelector(".label-FFamJ");
      if (starLabel) {
        starLabel.innerHTML = `
              <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="kai-icon kai-icon-star" style="width: 18px; height: 18px;">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                  <span>Star the project</span>
              </div>
          `;
      }
      wrapper.appendChild(starLink);

      // 5. Create Support Link (Text Only)
      const supportLink = githubLink.cloneNode(true);
      supportLink.href = "https://revolut.me/altcelalalt";
      supportLink.title = "Support Development";
      supportLink.classList.add("kai-muted-link");
      const supportLabel = supportLink.querySelector(".label-FFamJ");
      if (supportLabel) {
        supportLabel.innerHTML = `
             <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="kai-icon kai-icon-heart" style="width: 18px; height: 18px; margin-left: 6px;">
                     <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>
                 </svg>
                 <span>Support Development</span>
             </div>
          `;
      }
      wrapper.appendChild(supportLink);

      state.donationAdded = true;
      console.log(
        "%c[Kai Version] Links row injected (Github + Star + Support)",
        "color: #00ff00;",
      );
      return true;
    },
  };

  /**
   * Manages the lifecycle of the settings page UI injection.
   * Handles MutationObserver for dynamic content and cleanup on route changes.
   */
  const LifecycleManager = {
    init() {
      if (state.isInitialized) return;

      if (!window.location.hash.startsWith(CONFIG.TARGET_ROUTE)) return;

      state.isInitialized = true;

      // Try to perform injections
      const labelInjected = UIManager.injectVersionLabel();
      const linkReplaced = UIManager.replaceGithubLink();
      const donationInjected = UIManager.injectDonationButton();

      if (!labelInjected || !linkReplaced || !donationInjected) {
        this.startObserver();
      }
    },

    startObserver() {
      if (state.observer) return;

      state.observer = new MutationObserver((mutations) => {
        // Debounce: wait for DOM to stabilize
        if (state.mutationDebounceTimer) {
          clearTimeout(state.mutationDebounceTimer);
        }

        state.mutationDebounceTimer = setTimeout(() => {
          const labelInjected = UIManager.injectVersionLabel();
          const linkReplaced = UIManager.replaceGithubLink();
          const donationInjected = UIManager.injectDonationButton();

          if (labelInjected && linkReplaced && donationInjected) {
            this.stopObserver();
          }
        }, CONFIG.MUTATION_DEBOUNCE_MS);
      });

      // Observe narrower scope: nav container instead of entire body
      const navContainer =
        document.querySelector(".horizontal-nav-bar-container-Y_zvK") ||
        document.querySelector("#root") ||
        document.body;

      state.observer.observe(navContainer, {
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

      // Clear debounce timer
      if (state.mutationDebounceTimer) {
        clearTimeout(state.mutationDebounceTimer);
        state.mutationDebounceTimer = null;
      }
    },

    cleanup() {
      this.stopObserver();

      // Clean up timeouts
      if (state.logoRetryTimeout) {
        clearTimeout(state.logoRetryTimeout);
        state.logoRetryTimeout = null;
      }
      if (state.toastAutoHideTimeout) {
        clearTimeout(state.toastAutoHideTimeout);
        state.toastAutoHideTimeout = null;
      }

      // Clean up toast if still present
      if (state.cachedToast) {
        state.cachedToast.remove();
        state.cachedToast = null;
      }

      // Reset state flags
      state.versionAdded = false;
      state.githubLinkReplaced = false;
      state.donationAdded = false;
      state.isInitialized = false;
      state.logoPulsingRetryCount = 0;
    },
  };

  /**
   * Coordinates global lifecycle events and route monitoring.
   * Manages app initialization and route change handling.
   */
  const GlobalLifecycle = {
    start() {
      // A. Start Global Update Check (Once)
      UpdateManager.init();

      // B. Start Route Monitoring
      this.checkRoute();

      // C. Hide toast on any route change (KISS - no complex route tracking)
      window.addEventListener("hashchange", () => {
        UpdateManager.hideToast();
        this.checkRoute();
      });
    },

    checkRoute() {
      const isSettings = window.location.hash.startsWith(CONFIG.TARGET_ROUTE);

      if (isSettings) {
        setTimeout(() => LifecycleManager.init(), CONFIG.ROUTE_CHANGE_DELAY_MS);
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
