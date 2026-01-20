// Custom Shortcuts Plugin for Liquid Glass Theme
// Replaces the default Player Shortcuts section with user-defined shortcuts
// v1.1.0 - Performance optimization: Added 50ms debounce to MutationObserver

(function () {
  "use strict";

  // Configuration
  const CONFIG = {
    TARGET_ROUTE: "#/settings",
    OBSERVER_TIMEOUT_MS: 10000,
  };

  // Define the custom shortcuts array
  const customShortcuts = [
    {
      name: "Quick Exit",
      keys: ["Q"],
      description: "Instantly closes the app while watching content.",
    },
    {
      name: "Smart Skip",
      keys: ["Tab"],
      description: "Skips the current intro/outro when prompted.",
    },
    {
      name: "Show Statistics",
      keys: ["T"],
      description: "Toggles the playback statistics overlay.",
    },
    {
      name: "Cycle Audio Presets",
      keys: ["`"],
      description:
        "Switch between Night, OFF, Cinema (-16LUFS) and Anime  modes.",
    },
    {
      name: "Anime4K: Optimized+",
      keys: ["F1"],
      description: "Efficient upscaling for lower-end hardware.",
    },
    {
      name: "Anime4K: Eye Candy (Fast)",
      keys: ["F2"],
      description: "Balanced upscaling for most systems.",
    },
    {
      name: "Anime4K: Eye Candy (HQ)",
      keys: ["F3"],
      description: "High-quality upscaling for powerful GPUs.",
    },
    {
      name: "Clear Anime4K",
      keys: ["F4"],
      description: "Removes only Anime4K shaders.",
    },
    {
      name: "Reset All Shaders",
      keys: ["Ctrl", "+", "F4"],
      description: "Disables all active GLSL shaders.",
    },
    {
      name: "Cycle Visual Profile",
      keys: ["F8"],
      description: "Switch between Kai (Cinematic), Vivid, and Original.",
    },
    {
      name: "Toggle Auto ICC",
      keys: ["Ctrl", "+", "F8"],
      description: "Enables/disables automatic ICC profile correction.",
    },
    {
      name: "Toggle Debanding",
      keys: ["F6"],
      description: "Fixes color banding artifacts in gradients.",
    },
    {
      name: "Adaptive Sharpen",
      keys: ["F11"],
      description: "Smart sharpening for softer content.",
    },
    {
      name: "Toggle Denoiser (Filter)",
      keys: ["F9"],
      description: "Hardware-based temporal+spatial denoising.",
    },
    {
      name: "Toggle Denoiser (Shader)",
      keys: ["F10"],
      description: "Shader-based denoising (lighter).",
    },
    {
      name: "SVP Motion Smoothing",
      keys: ["F12"],
      description: "Enables high frame rate interpolation.",
    },
    {
      name: "Deinterlace",
      keys: ["F7"],
      description: "Fixes combing artifacts in older content.",
    },
    {
      name: "Deinterlace + SVP",
      keys: ["Ctrl", "+", "F12"],
      description: "Combined processing for interlaced content.",
    },
  ];

  // State
  let state = {
    shortcutsReplaced: false,
    observer: null,
    isInitialized: false,
  };

  const DOMManipulator = {
    replaceShortcuts() {
      if (state.shortcutsReplaced) return true;

      // 1. Change Menu Button Text
      const allButtons = document.querySelectorAll(".side-menu-button-vbkJ1");
      const playerShortcutsButton = Array.from(allButtons).find(
        (btn) => btn.textContent.trim() === "Player Shortcuts",
      );

      if (playerShortcutsButton) {
        playerShortcutsButton.textContent = "Kai Shortcuts";
      }

      // 2. Find Target Section
      const allSectionTitles = document.querySelectorAll(
        ".section-title-Nt71Z",
      );
      let sectionTitle = null;
      for (const title of allSectionTitles) {
        if (title.textContent.includes("Player Shortcuts")) {
          sectionTitle = title;
          break;
        }
      }

      if (!sectionTitle) return false; // Not ready yet

      // 3. Update Title
      const titleTextNode = Array.from(sectionTitle.childNodes).find(
        (node) => node.nodeType === 3,
      );
      if (titleTextNode) {
        titleTextNode.textContent = titleTextNode.textContent.replace(
          "Player Shortcuts",
          "Kai Shortcuts",
        );
      }

      const section = sectionTitle.closest(".section-container-twzKQ");
      if (!section) return false;

      // 4. Hide Original Link (Requested by user)
      const linkContainer = sectionTitle.querySelector(".link-container-ERYsD");
      if (linkContainer) {
        linkContainer.style.display = "none";
      }

      // 5. Clear Old Options
      const existingOptions = section.querySelectorAll(
        ".option-container-EGlcv:not(.link-container-ERYsD)",
      );
      existingOptions.forEach((option) => option.remove());

      // 6. Inject New Shortcuts
      customShortcuts.forEach((shortcut) => {
        const optionDiv = document.createElement("div");
        optionDiv.className = "option-container-EGlcv";

        // Name
        const nameContainer = document.createElement("div");
        nameContainer.className = "option-name-container-exGMI";

        const nameLabel = document.createElement("div");
        nameLabel.className = "label-FFamJ";
        nameLabel.textContent = shortcut.name;

        if (shortcut.description) {
          const descLabel = document.createElement("div");
          descLabel.className = "label-FFamJ";
          descLabel.style.color = "rgba(191, 191, 191, 0.5)";
          descLabel.style.display = "block";
          descLabel.style.whiteSpace = "normal";
          descLabel.style.wordWrap = "break-word";
          descLabel.style.lineHeight = "1.4";
          descLabel.style.marginTop = "0.25rem";
          descLabel.textContent = shortcut.description;
          nameLabel.appendChild(descLabel);
        }

        nameContainer.appendChild(nameLabel);
        optionDiv.appendChild(nameContainer);

        // Keys
        const shortcutContainer = document.createElement("div");
        shortcutContainer.className =
          "option-input-container-NPgpT shortcut-container-ZSm5O";

        shortcut.keys.forEach((key) => {
          if (key === "+") {
            const plusDiv = document.createElement("div");
            plusDiv.className = "label-FFamJ";
            plusDiv.textContent = "+";
            shortcutContainer.appendChild(plusDiv);
          } else {
            const kbd = document.createElement("kbd");
            kbd.textContent = key;
            shortcutContainer.appendChild(kbd);
          }
        });

        optionDiv.appendChild(shortcutContainer);
        section.appendChild(optionDiv);
      });

      state.shortcutsReplaced = true;
      console.log("%c[Kai Shortcuts] Applied successfully", "color: #00ff00;");
      return true;
    },
  };

  const LifecycleManager = {
    init() {
      if (state.isInitialized) return;

      // Route Check
      if (!window.location.hash.startsWith(CONFIG.TARGET_ROUTE)) return;

      state.isInitialized = true;
      console.log("%c[Kai Shortcuts] Init (Settings Page)", "color: #00aaff;");

      // Try immediate replacement
      if (!DOMManipulator.replaceShortcuts()) {
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
          if (DOMManipulator.replaceShortcuts()) {
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
      state.shortcutsReplaced = false;
      state.isInitialized = false;
      console.log(
        "%c[Kai Shortcuts] Cleanup (Left Settings)",
        "color: #ff9900;",
      );
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
