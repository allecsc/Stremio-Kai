/**
 * @name Metadata Bootstrapper
 * @description Orchestrates the initialization of metadata modules in the correct order.
 */

const MetadataBootstrapper = {
  requiredModules: [
    "config",
    "rateLimiter",
    "ratingsUtils", // Shared ratings utility (must load before hoverPopup)
    "metadataFetcher",
    "idConversion",
    "titleSearch",
    "idLookup",
    "metadataStorage",
    "domProcessor",
    "hoverPopup",
    "apiKeys",
    "preferences",
    "settingsUI",
    "main",
  ],

  init() {
    console.log("[MetadataBootstrapper] Starting initialization sequence...");
    this.waitForModules()
      .then(() => this.initSequence())
      .catch((err) =>
        console.error("[MetadataBootstrapper] Initialization failed:", err)
      );
  },

  waitForModules(retryCount = 0) {
    return new Promise((resolve, reject) => {
      if (retryCount > 100) {
        // 10 seconds max
        return reject("Timeout waiting for modules");
      }

      if (!window.MetadataModules) {
        console.log(
          `[MetadataBootstrapper] Waiting for MetadataModules namespace... (${retryCount})`
        );
        setTimeout(
          () =>
            this.waitForModules(retryCount + 1)
              .then(resolve)
              .catch(reject),
          100
        );
        return;
      }

      const missing = this.requiredModules.filter(
        (m) => !window.MetadataModules[m]
      );
      if (missing.length > 0) {
        // Log only every 10 retries to reduce noise
        if (retryCount % 10 === 0) {
          console.log(
            `[MetadataBootstrapper] Waiting for modules: ${missing.join(
              ", "
            )}... (${retryCount})`
          );
        }
        setTimeout(
          () =>
            this.waitForModules(retryCount + 1)
              .then(resolve)
              .catch(reject),
          100
        );
        return;
      }

      console.log("[MetadataBootstrapper] All modules registered.");
      resolve();
    });
  },

  waitForDexie(retryCount = 0) {
    return new Promise((resolve, reject) => {
      if (typeof Dexie !== "undefined") {
        return resolve();
      }

      if (retryCount > 100) {
        // 10 seconds max
        return reject("Timeout waiting for Dexie.js");
      }

      if (retryCount % 10 === 0) {
        console.log(
          `[MetadataBootstrapper] Waiting for Dexie.js... (${retryCount})`
        );
      }
      setTimeout(
        () =>
          this.waitForDexie(retryCount + 1)
            .then(resolve)
            .catch(reject),
        100
      );
    });
  },

  async initSequence() {
    console.log("[MetadataBootstrapper] Beginning initialization sequence...");

    try {
      // 1. Initialize Config (Loads Dexie)
      if (window.MetadataModules.config && window.MetadataModules.config.init) {
        console.log(
          "[MetadataBootstrapper] Initializing Config (Loading Dexie)..."
        );
        window.MetadataModules.config.init();
      }

      // 2. Wait for Dexie to be fully loaded
      await this.waitForDexie();
      console.log("[MetadataBootstrapper] Dexie.js confirmed loaded.");

      // 3. Initialize Main (Starts the Manager)
      if (window.MetadataModules.main && window.MetadataModules.main.init) {
        console.log("[MetadataBootstrapper] Initializing Main...");
        window.MetadataModules.main.init();
      }

      console.log(
        "[MetadataBootstrapper] Initialization sequence complete. System is running."
      );

      // Signal readiness to other plugins (like Hero Banner)
      window.MetadataModules.ready = true;
      window.dispatchEvent(new CustomEvent("metadata-modules-ready"));
      console.log("[MetadataBootstrapper] Dispatched readiness event.");
    } catch (error) {
      console.error(
        "[MetadataBootstrapper] Error during initialization sequence:",
        error
      );
    } finally {
      // Attempt to initialize Donation Manager if available
      if (window.DonationManager && window.DonationManager.init) {
        console.log("[MetadataBootstrapper] Initializing DonationManager...");
        window.DonationManager.init();
      }
    }
  },
};

// Start the bootstrapper when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () =>
    MetadataBootstrapper.init()
  );
} else {
  MetadataBootstrapper.init();
}
