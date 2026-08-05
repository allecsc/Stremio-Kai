// Custom Shortcuts Plugin
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
  // Entries with `type: "header"` render as visual section dividers.
  const customShortcuts = [
    // ─── KEYBOARD NAVIGATION ───────────────────────────────────────
    { type: "header", name: "Keyboard — Navigation", icon: "keyboard" },
    {
      name: "Grid Navigation",
      keys: ["↑", "/", "↓", "/", "←", "/", "→"],
    },
    {
      name: "Select",
      keys: ["Enter"],
    },
    {
      name: "Layer Switch",
      keys: ["Tab"],
      description:
        "Jump between Navigation Menus (Top/Left) and the Content Grid.",
    },
    {
      name: "Type to Search",
      keys: ["A–Z", "/", "Space"],
    },
    {
      name: "Toggle Hover Panel",
      keys: ["Caps Lock"],
      description: "Show or hide the metadata hover popup on catalog items.",
    },

    // ─── KEYBOARD PLAYER CONTROLS ──────────────────────────────────
    { type: "header", name: "Keyboard — Player Controls", icon: "keyboard" },
    {
      name: "Quick Exit",
      keys: ["Q"],
      description: "Instantly closes the app while watching content.",
    },
    {
      name: "Skip Intro",
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
      description: "Switch between Night Mode, Voice Clarity, and OFF modes.",
    },
    { name: "Mute", keys: ["M"] },
    {
      name: "Playback Speed Menu",
      keys: ["R"],
    },
    {
      name: "Subtitle Track Menu",
      keys: ["S"],
    },
    {
      name: "Audio Track Menu",
      keys: ["A"],
    },
    {
      name: "Episode List",
      keys: ["I"],
    },
    {
      name: "Subtitle Delay",
      keys: ["Z", "/", "X"],
    },
    {
      name: "Show/Hide Subtitles",
      keys: ["V"],
    },
    {
      name: "Ultrawide Zoom In",
      keys: ["U"],
      description: "Cycle between panscan 0.5, 1 and 0.",
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

    // ─── GAMEPAD NAVIGATION ────────────────────────────────────────
    { type: "header", name: "Gamepad — Navigation", icon: "gamepad" },
    {
      name: "Navigate Grid / Sidebar",
      keys: ["L-Stick", "/", "D-Pad"],
    },
    {
      name: "Select",
      keys: ["A", "/", "✕"],
    },
    {
      name: "Back",
      keys: ["B", "/", "◯"],
    },
    {
      name: "Return to Board",
      keys: ["Y", "/", "⃤"],
    },
    {
      name: "Layer Switch",
      keys: ["X", "/", "☐"],
      description:
        "Jump between Navigation Menus (Top/Left) and the Content Grid.",
    },
    {
      name: "Cycle Pages",
      keys: ["L1", "/", "R1"],
      description:
        "Cycle through the 6 main pages (Board → Discover → Library → …).",
    },

    // ─── GAMEPAD PLAYER CONTROLS ───────────────────────────────────
    { type: "header", name: "Gamepad — Player Controls", icon: "gamepad" },
    {
      name: "Seek / Volume",
      keys: ["L-Stick", "/", "D-Pad"],
    },
    {
      name: "Play / Pause",
      keys: ["A", "/", "✕"],
    },
    {
      name: "Skip Intro",
      keys: ["X", "/", "☐"],
    },
    {
      name: "Next Episode",
      keys: ["Start"],
    },
    {
      name: "Subtitle Track Menu",
      keys: ["L3"],
      description: "Press left stick.",
    },
    {
      name: "Audio Track Menu",
      keys: ["R3"],
      description: "Press right stick.",
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
      // SVG icons indexed by shortcut category
      const ICONS = {
        keyboard: `<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M160-200q-33 0-56.5-23.5T80-280v-400q0-33 23.5-56.5T160-760h640q33 0 56.5 23.5T880-680v400q0 33-23.5 56.5T800-200H160Zm0-80h640v-400H160v400Zm160-40h320v-80H320v80ZM200-440h80v-80h-80v80Zm120 0h80v-80h-80v80Zm120 0h80v-80h-80v80Zm120 0h80v-80h-80v80Zm120 0h80v-80h-80v80ZM200-560h80v-80h-80v80Zm120 0h80v-80h-80v80Zm120 0h80v-80h-80v80Zm120 0h80v-80h-80v80Zm120 0h80v-80h-80v80ZM160-280v-400 400Z"></path></svg>`,
        gamepad: `<div class="rounded-xl flex-1 bg-surface text-[#183254] border px-20 py-10 flex items-center justify-center"><div class="w-[160px] h-[160px] md:h-[300px] flex items-center"><svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" x2="10" y1="11" y2="11"></line><line x1="8" x2="8" y1="9" y2="13"></line><line x1="15" x2="15.01" y1="12" y2="12"></line><line x1="18" x2="18.01" y1="10" y2="10"></line><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"></path></svg></div></div>`,
      };

      customShortcuts.forEach((shortcut) => {
        // Section header entries — use the native section-category-container-EOuS0 structure
        if (shortcut.type === "header") {
          const headerDiv = document.createElement("div");
          headerDiv.className =
            "section-category-container-EOuS0 kai-shortcut-section";

          // SVG icon wrapper (matches native size/style)
          const iconContainer = document.createElement("span");
          iconContainer.className = "icon-REQkK";
          iconContainer.style.cssText = "viewBox:0 0 512 512;";
          if (shortcut.icon && ICONS[shortcut.icon]) {
            iconContainer.innerHTML = ICONS[shortcut.icon];
          }

          const headerLabel = document.createElement("div");
          headerLabel.className = "label-FFamJ";
          headerLabel.textContent = shortcut.name;

          headerDiv.appendChild(iconContainer);
          headerDiv.appendChild(headerLabel);
          section.appendChild(headerDiv);
          return;
        }

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
          } else if (key === "/") {
            // Render as 'or' separator (alternative inputs, not a combo)
            const orDiv = document.createElement("div");
            orDiv.className = "label-FFamJ";
            orDiv.textContent = "or";
            orDiv.style.opacity = "0.55";
            orDiv.style.fontSize = "0.8em";
            shortcutContainer.appendChild(orDiv);
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
