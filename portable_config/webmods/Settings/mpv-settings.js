/**
 * @name MPV Settings Injector
 * @description Injects mpv-related settings into Stremio's Advanced settings section
 * @version 2.1
 * @author allecsc
 *
 * @changelog
 *   v2.2 - Fixed Memory Leak & Optimized Observer (Debounce)
 *   v2.1 - Integrated Smart Track Selector configuration (injected directly into Player settings)
 *   v2.0 - Added Anime Enhancements section (Anime4K presets, SVP toggle)
 *   v1.0 - Initial: HDR Passthrough toggle
 */

(function () {
  "use strict";

  if (window.MpvSettings?.initialized) return;
  window.MpvSettings = { initialized: true };

  // Moved CSS injection to init to ensure document.head exists

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ═══════════════════════════════════════════════════════════════════════════

  const STORAGE_KEYS = {
    hdrPassthrough: "kai-hdr-passthrough",
    anime4kPreset: "kai-anime4k-preset",
    svpEnabled: "kai-svp-enabled",
    colorProfile: "kai-color-profile",
    iccProfile: "kai-icc-profile",
    // Smart Track Logic
    MATCH_AUDIO: "kai-smart-track-match-audio",
    USE_FORCED_SUBS: "kai-smart-track-use-forced",

    REJECT_AUDIO: "kai-smart-track-reject-audio",
    REJECT_SUBS: "kai-smart-track-reject-subs",
    // Keyword Lists
    REJECT_AUDIO_KEYWORDS: "kai-smart-track-reject-audio-keywords",
    REJECT_SUB_KEYWORDS: "kai-smart-track-reject-sub-keywords",
    // Notify Skip Logic
    AUTO_SKIP: "kai-notify-auto-skip",
    SHOW_NOTIFICATIONS: "kai-notify-show-notifications",
  };

  // ... (existing helper functions) ...

  /**
   * Create text input option matching Stremio's styling
   */

  const ANIME4K_PRESETS = [
    { value: "none", label: "Off" },
    { value: "optimized", label: "Optimized+ (Recommended)" },
    { value: "fast", label: "Eye Candy (Fast)" },
    { value: "hq", label: "Eye Candy (HQ)" },
  ];

  const COLOR_PROFILES = [
    { value: "original", label: "Original (Neutral)" },
    { value: "kai", label: "Kai (Default)" },
    { value: "vivid", label: "Vivid (High Contrast)" },
  ];

  // Languages (Moved to bottom of file)
  const ISO_LANGUAGES = [];

  /*
   * Keyword Presets (Derived from common usage patterns)
   * "value" is the actual string to be saved (case-insensitive in most logic)
   * "label" is the user-friendly display name
   */

  const AUDIO_REJECT_PRESETS = [
    { value: "commentary", label: "Commentary" },
    { value: "descriptive, audio description", label: "Descriptive Audio" },
    { value: "visually impaired", label: "Visually Impaired" },
  ];

  const SUB_REJECT_PRESETS = [
    { value: "sign", label: "Signs" },
    { value: "song", label: "Songs" },
    { value: "karaoke", label: "Karaoke" },
    { value: "forced", label: "Forced" },
    { value: "sdh", label: "SDH (Hearing Impaired)" },
    { value: "commentary", label: "Commentary" },
    { value: "op", label: "Opening (OP)" },
    { value: "ed", label: "Ending (ED)" },
    { value: "credit", label: "Credits" },
    { value: "text", label: "On-Screen Text" },
    { value: "graphic", label: "Graphics" },
    { value: "translation", label: "Translation" },
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS (STORAGE & STATE)
  // ═══════════════════════════════════════════════════════════════════════════

  function safeGet(key, fallback) {
    try {
      const val = localStorage.getItem(key);
      if (val === null) return fallback;
      if (typeof fallback === "boolean") return val === "true";
      if (Array.isArray(fallback)) return JSON.parse(val);
      // Try parsing if fallback is undefined but val looks like JSON
      if (val.startsWith("[") || val.startsWith("{")) {
        try {
          return JSON.parse(val);
        } catch {
          return val;
        }
      }
      return val;
    } catch {
      return fallback;
    }
  }

  function safeSet(key, val) {
    try {
      const toStore = typeof val === "object" ? JSON.stringify(val) : val;
      localStorage.setItem(key, toStore);
    } catch (e) {
      console.error(`[MPV] Failed to save ${key}`, e);
    }
  }

  function sendConfigUpdate() {
    // Log update for debugging, bridge should react to storage or polling
    console.log("[MPV Settings] Configuration updated via UI");
  }

  const SETTINGS_CONTAINER_SELECTOR = ".settings-content-lLXmk";
  const TARGET_SECTION_LABEL = "Player";

  // Icons (Moved to bottom of file)
  const ICONS = {};

  /**
   * Create a Multi-Select Dropdown (Stremio Style)
   * Uses styles from webmods/Theme/settings-ui.css
   */
  function createMultiSelect(
    label,
    description,
    options,
    currentValues = [], // Array of selected values
    onChange,
    includeSelectAll = false, // Default false to avoid accidental mass-selection
  ) {
    const container = document.createElement("div");
    container.className = "option-container-EGlcv kai-mpv-setting";

    // Label and Description
    const nameContainer = document.createElement("div");
    nameContainer.className = "option-name-container-exGMI";

    const labelEl = document.createElement("div");
    labelEl.className = "label-FFamJ";
    labelEl.textContent = label;

    if (description) {
      const descEl = document.createElement("div");
      descEl.className = "label-FFamJ";
      descEl.style.cssText =
        "color: rgba(191, 191, 191, 0.5); display: block; white-space: normal; word-wrap: break-word; line-height: 1.4; margin-top: 0.25rem;";
      descEl.textContent = description;
      labelEl.appendChild(descEl);
    }
    nameContainer.appendChild(labelEl);

    // Dropdown Container
    const dropdownContainer = document.createElement("div");
    dropdownContainer.className =
      "option-input-container-NPgpT multiselect-container-w0c9l label-container-XOyzm label-container-dhjQS button-container-zVLH6";
    dropdownContainer.tabIndex = 0;

    // Current Value Display (Truncated List)
    const valueLabel = document.createElement("div");
    valueLabel.className = "label-AR_l8";
    valueLabel.style.maxWidth = "11.5rem";

    const updateDisplay = () => {
      if (!currentValues || currentValues.length === 0) {
        valueLabel.textContent = "None";
        return;
      }
      // Map stored values back to labels
      const selectedLabels = currentValues
        .map((val) => {
          const opt = options.find((o) => o.value === val);
          return opt ? opt.label : val;
        })
        .filter(Boolean);

      valueLabel.textContent = selectedLabels.join(", ");
    };
    updateDisplay();
    dropdownContainer.appendChild(valueLabel);

    // Arrow Icon
    dropdownContainer.insertAdjacentHTML("beforeend", ICONS.ARROW);

    // Menu Logic
    const menuContainer = document.createElement("div");
    menuContainer.className =
      "menu-container-B6cqK menu-direction-bottom-right-aJ89V kai-settings-menu";
    menuContainer.setAttribute("data-focus-lock-disabled", "false");

    const innerContainer = document.createElement("div");
    innerContainer.className = "menu-container-qiz0X";
    innerContainer.style.maxHeight = "300px";
    innerContainer.style.overflowY = "auto";

    // Helper to create an option element
    const createOptionEl = (label, isSelected, onClick, isSpecial = false) => {
      const el = document.createElement("div");
      el.className = "option-container-mO9yW button-container-zVLH6";
      if (isSelected) el.classList.add("selected");
      if (isSpecial) el.style.borderBottom = "1px solid rgba(255,255,255,0.05)";

      el.tabIndex = 0;
      el.title = label;

      const optLabel = document.createElement("div");
      optLabel.className = "label-AR_l8";
      optLabel.textContent = label;
      el.appendChild(optLabel);

      if (isSelected && !isSpecial) {
        // Don't show checkmark for None/All to avoid confusion or specific style
        const iconDiv = document.createElement("div");
        iconDiv.className = "icon-jg2il";
        iconDiv.innerHTML = ICONS.CHECK;
        el.appendChild(iconDiv);
      }

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onClick();
      });

      return el;
    };

    // "None" Option (Clear)
    innerContainer.appendChild(
      createOptionEl(
        "None",
        currentValues.length === 0,
        () => {
          currentValues.length = 0; // Clear array
          // Remove 'selected' from all other options in DOM
          innerContainer
            .querySelectorAll(".option-container-mO9yW.selected")
            .forEach((el) => {
              el.classList.remove("selected");
              const icon = el.querySelector(".icon-jg2il");
              if (icon) icon.remove();
            });
          updateDisplay();
          onChange(currentValues);
        },
        true,
      ),
    );

    if (includeSelectAll) {
      // "All" Option (Select All)
      innerContainer.appendChild(
        createOptionEl(
          "All",
          currentValues.length === options.length && options.length > 0,
          () => {
            currentValues.splice(
              0,
              currentValues.length,
              ...options.map((o) => o.value),
            );
            // Add 'selected' to all standard options
            innerContainer
              .querySelectorAll(".option-container-mO9yW")
              .forEach((el) => {
                // Ignore special options
                if (el.textContent === "None" || el.textContent === "All")
                  return;

                if (!el.classList.contains("selected")) {
                  el.classList.add("selected");
                  if (!el.querySelector(".icon-jg2il")) {
                    const iconDiv = document.createElement("div");
                    iconDiv.className = "icon-jg2il";
                    iconDiv.innerHTML = ICONS.CHECK;
                    el.appendChild(iconDiv);
                  }
                }
              });
            updateDisplay();
            onChange(currentValues);
          },
          true,
        ),
      );
    }

    options.forEach((opt) => {
      // Standard Option Creation
      const optionEl = document.createElement("div");
      optionEl.className = "option-container-mO9yW button-container-zVLH6";

      // Check if selected
      const isSelected = currentValues.includes(opt.value);
      if (isSelected) optionEl.classList.add("selected");

      optionEl.tabIndex = 0;
      optionEl.title = opt.label;

      const optLabel = document.createElement("div");
      optLabel.className = "label-AR_l8";
      optLabel.textContent = opt.label;
      optionEl.appendChild(optLabel);

      if (isSelected) {
        const iconDiv = document.createElement("div");
        iconDiv.className = "icon-jg2il";
        iconDiv.innerHTML = ICONS.CHECK;
        optionEl.appendChild(iconDiv); // Add checkmark
      }

      // Toggle Selection on Click
      optionEl.addEventListener("click", (e) => {
        e.stopPropagation();
        const index = currentValues.indexOf(opt.value);
        if (index === -1) {
          currentValues.push(opt.value);
          optionEl.classList.add("selected");
          // Add checkmark if missing
          if (!optionEl.querySelector(".icon-jg2il")) {
            const iconDiv = document.createElement("div");
            iconDiv.className = "icon-jg2il";
            iconDiv.innerHTML = ICONS.CHECK;
            optionEl.appendChild(iconDiv);
          }
        } else {
          currentValues.splice(index, 1);
          optionEl.classList.remove("selected");
          const icon = optionEl.querySelector(".icon-jg2il");
          if (icon) icon.remove();
        }
        updateDisplay();
        onChange(currentValues);
      });

      innerContainer.appendChild(optionEl);
    });

    menuContainer.appendChild(innerContainer);
    dropdownContainer.appendChild(menuContainer);

    // Open/Close Handler
    dropdownContainer.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent closing immediately
      const wasActive = dropdownContainer.classList.contains("active");

      // Close others
      document
        .querySelectorAll(".multiselect-container-w0c9l.active")
        .forEach((el) => {
          if (el !== dropdownContainer) el.classList.remove("active");
        });

      if (!wasActive) {
        dropdownContainer.classList.add("active");
      } else {
        dropdownContainer.classList.remove("active");
      }
    });

    container.appendChild(nameContainer);
    container.appendChild(dropdownContainer);
    return container;
  }

  // Global Click listener to close dropdowns
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".multiselect-container-w0c9l")) {
      document
        .querySelectorAll(".multiselect-container-w0c9l.active")
        .forEach((el) => el.classList.remove("active"));
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STORAGE GETTERS/SETTERS
  // ═══════════════════════════════════════════════════════════════════════════

  function getHdrPassthrough() {
    return localStorage.getItem(STORAGE_KEYS.hdrPassthrough) === "true";
  }

  function setHdrPassthrough(value) {
    localStorage.setItem(STORAGE_KEYS.hdrPassthrough, value.toString());
    console.log(`[MPV Settings] HDR Passthrough set to: ${value}`);
  }

  function getAnime4kPreset() {
    return localStorage.getItem(STORAGE_KEYS.anime4kPreset) || "optimized";
  }

  function setAnime4kPreset(value) {
    localStorage.setItem(STORAGE_KEYS.anime4kPreset, value);
    console.log(`[MPV Settings] Anime4K Preset set to: ${value}`);
  }

  function getSvpEnabled() {
    const stored = localStorage.getItem(STORAGE_KEYS.svpEnabled);
    return stored === null ? true : stored === "true"; // Default true
  }

  function setSvpEnabled(value) {
    localStorage.setItem(STORAGE_KEYS.svpEnabled, value.toString());
    console.log(`[MPV Settings] SVP Enabled set to: ${value}`);
  }

  function getColorProfile() {
    return localStorage.getItem(STORAGE_KEYS.colorProfile) || "kai";
  }

  function setColorProfile(value) {
    localStorage.setItem(STORAGE_KEYS.colorProfile, value);
    console.log(`[MPV Settings] Color Profile set to: ${value}`);
  }

  function getIccProfile() {
    return localStorage.getItem(STORAGE_KEYS.iccProfile) === "true"; // Default OFF
  }

  function setIccProfile(value) {
    localStorage.setItem(STORAGE_KEYS.iccProfile, value.toString());
    console.log(`[MPV Settings] ICC Profile set to: ${value}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UI FACTORY FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create toggle option matching Stremio's styling
   */
  function createToggleOption(label, description, isChecked, onChange) {
    const container = document.createElement("div");
    container.className = "option-container-EGlcv kai-mpv-setting";

    const nameContainer = document.createElement("div");
    nameContainer.className = "option-name-container-exGMI";

    const labelEl = document.createElement("div");
    labelEl.className = "label-FFamJ";
    labelEl.textContent = label;

    // Add description if provided
    if (description) {
      const descEl = document.createElement("div");
      descEl.className = "label-FFamJ";
      descEl.style.cssText =
        "color: rgba(191, 191, 191, 0.5); display: block; white-space: normal; word-wrap: break-word; line-height: 1.4; margin-top: 0.25rem;";
      descEl.textContent = description;
      labelEl.appendChild(descEl);
    }

    nameContainer.appendChild(labelEl);

    const toggleContainer = document.createElement("div");
    toggleContainer.tabIndex = -1;
    toggleContainer.className = `option-input-container-NPgpT toggle-container-lZfHP button-container-zVLH6${
      isChecked ? " checked" : ""
    }`;

    const toggle = document.createElement("div");
    toggle.className = "toggle-toOWM";
    toggleContainer.appendChild(toggle);

    // Toggle click handler
    toggleContainer.addEventListener("click", () => {
      const newValue = !toggleContainer.classList.contains("checked");
      toggleContainer.classList.toggle("checked", newValue);
      onChange(newValue);
    });

    container.appendChild(nameContainer);
    container.appendChild(toggleContainer);

    return container;
  }

  /**
   * Create dropdown option matching Stremio's EXACT structure
   */
  function createDropdownOption(
    label,
    description,
    options,
    currentValue,
    onChange,
  ) {
    const container = document.createElement("div");
    container.className = "option-container-EGlcv kai-mpv-setting";

    // Name container with label and description
    const nameContainer = document.createElement("div");
    nameContainer.className = "option-name-container-exGMI";

    const labelEl = document.createElement("div");
    labelEl.className = "label-FFamJ";
    labelEl.textContent = label;

    if (description) {
      const descEl = document.createElement("div");
      descEl.className = "label-FFamJ";
      descEl.style.cssText =
        "color: rgba(191, 191, 191, 0.5); display: block; white-space: normal; word-wrap: break-word; line-height: 1.4; margin-top: 0.25rem;";
      descEl.textContent = description;
      labelEl.appendChild(descEl);
    }
    nameContainer.appendChild(labelEl);

    // Dropdown container (exact Stremio structure)
    const dropdownContainer = document.createElement("div");
    dropdownContainer.className =
      "option-input-container-NPgpT multiselect-container-w0c9l label-container-XOyzm label-container-dhjQS button-container-zVLH6";
    dropdownContainer.tabIndex = 0;

    let currentIndex = options.findIndex((o) => o.value === currentValue);
    if (currentIndex === -1) currentIndex = 0;
    const currentOption = options[currentIndex];

    // Current value label
    const valueLabel = document.createElement("div");
    valueLabel.className = "label-AR_l8";
    valueLabel.textContent = currentOption.label;
    dropdownContainer.appendChild(valueLabel);

    // Arrow SVG
    dropdownContainer.insertAdjacentHTML(
      "beforeend",
      `<svg class="icon-jg2il" viewBox="0 0 512 512"><path d="m91.7 213.799 145.4 169.6c2.1 2.536 4.7 4.592 7.6 6.031 2.9 1.487 6.1 2.381 9.5 2.633 3.2.251 6.5-.148 9.6-1.171 3.1-1.035 6-2.663 8.5-4.793.9-.797 1.8-1.703 2.6-2.7l145.4-169.6c3.1-3.647 4.9-8.083 5.6-12.8.7-4.719 0-9.539-1.9-13.869-2-4.344-5.2-8.023-9.2-10.599s-8.7-3.942-13.6-3.932H110.6c-3.3-.01-6.6.626-9.6 1.873-4.7 1.86-8.6 5.058-11.2 9.175-2.7 4.109-4.2 8.924-4.2 13.852.1 5.99 2.3 11.756 6.1 16.3" style="fill: currentcolor;"></path></svg>`,
    );

    // Focus guard (top)
    const focusGuardTop = document.createElement("div");
    focusGuardTop.setAttribute("data-focus-guard", "true");
    focusGuardTop.className = "focus-guard";
    focusGuardTop.tabIndex = 0;
    dropdownContainer.appendChild(focusGuardTop);

    // Menu container
    const menuContainer = document.createElement("div");
    menuContainer.className =
      "menu-container-B6cqK menu-direction-bottom-right-aJ89V";
    menuContainer.setAttribute("data-focus-lock-disabled", "false");

    const innerContainer = document.createElement("div");
    innerContainer.className = "menu-container-qiz0X";

    options.forEach((option, index) => {
      const menuItem = document.createElement("div");
      menuItem.className = "option-container-mO9yW button-container-zVLH6";
      if (index === currentIndex) menuItem.classList.add("selected");
      menuItem.tabIndex = 0;
      menuItem.title = option.label;
      menuItem.setAttribute("data-value", index.toString());

      const itemLabel = document.createElement("div");
      itemLabel.className = "label-AR_l8";
      itemLabel.textContent = option.label;
      menuItem.appendChild(itemLabel);

      // Checkmark for selected item
      if (index === currentIndex) {
        const checkIcon = document.createElement("div");
        checkIcon.className = "icon-jg2il";
        menuItem.appendChild(checkIcon);
      }

      menuItem.addEventListener("click", (e) => {
        e.stopPropagation();
        valueLabel.textContent = option.label;
        onChange(option.value);

        // Update selected state and checkmarks
        innerContainer
          .querySelectorAll(".option-container-mO9yW")
          .forEach((item, idx) => {
            item.classList.remove("selected");
            const existingCheck = item.querySelector(".icon-jg2il");
            if (existingCheck) existingCheck.remove();
            if (idx === index) {
              item.classList.add("selected");
              const check = document.createElement("div");
              check.className = "icon-jg2il";
              item.appendChild(check);
            }
          });

        dropdownContainer.classList.remove("active");
      });

      innerContainer.appendChild(menuItem);
    });

    menuContainer.appendChild(innerContainer);
    dropdownContainer.appendChild(menuContainer);

    // Focus guard (bottom)
    const focusGuardBottom = document.createElement("div");
    focusGuardBottom.setAttribute("data-focus-guard", "true");
    focusGuardBottom.className = "focus-guard";
    focusGuardBottom.tabIndex = 0;
    dropdownContainer.appendChild(focusGuardBottom);

    // Toggle dropdown on click
    dropdownContainer.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const wasActive = dropdownContainer.classList.contains("active");
      closeAllDropdowns(dropdownContainer);
      if (!wasActive) {
        dropdownContainer.classList.add("active");
      } else {
        dropdownContainer.classList.remove("active");
      }
    });

    container.appendChild(nameContainer);
    container.appendChild(dropdownContainer);

    return container;
  }

  /**
   * Close all Kai dropdowns except the specified one
   */
  function closeAllDropdowns(excludeContainer) {
    document
      .querySelectorAll(".kai-mpv-setting .multiselect-container-w0c9l.active")
      .forEach((el) => {
        if (el !== excludeContainer) {
          el.classList.remove("active");
        }
      });
  }

  /**
   * Create section category header matching Stremio's styling
   */
  function createSectionHeader(label, svgContent) {
    const header = document.createElement("div");
    header.className = "section-category-container-EOuS0 kai-mpv-setting";

    // Icon
    if (svgContent) {
      header.insertAdjacentHTML("beforeend", svgContent);
    } else {
      // Default Icon (star - representing enhancements/quality)
      header.insertAdjacentHTML(
        "beforeend",
        `<svg class="icon-REQkK" viewBox="0 0 652 712"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329l104.2-103.1c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z" style="fill: currentcolor;"></path></svg>`,
      );
    }

    const labelEl = document.createElement("div");
    labelEl.className = "label-FFamJ";
    labelEl.textContent = label;

    header.appendChild(labelEl);
    return header;
  }

  /**
   * Create footer note for warnings/info
   */
  /**
   * Create a standardized note label (Warning or Info)
   */
  function createNote(type, htmlContent) {
    const note = document.createElement("div");
    note.className = `description-label-h5DXc kai-${type}-note`;

    // Icon selection
    let iconSvg = "";
    if (type === "warning") {
      iconSvg = `<svg class="kai-note-icon" viewBox="0 0 24 24" fill="none"><path d="M12 15H12.01M12 12V9M4.98207 19H19.0179C20.5615 19 21.5233 17.3256 20.7455 15.9923L13.7276 3.96153C12.9558 2.63852 11.0442 2.63852 10.2724 3.96153L3.25452 15.9923C2.47675 17.3256 3.43849 19 4.98207 19Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }
    if (type === "info") {
      iconSvg = `<svg class="kai-note-icon" viewBox="0 0 24 24" fill="none"><path d="M12 16V12M12 8H12.01M7.8 21H16.2C17.8802 21 18.7202 21 19.362 20.673C19.9265 20.3854 20.3854 19.9265 20.673 19.362C21 18.7202 21 17.8802 21 16.2V7.8C21 6.11984 21 5.27976 20.673 4.63803C20.3854 4.07354 19.9265 3.6146 19.362 3.32698C18.7202 3 17.8802 3 16.2 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }

    note.innerHTML = `${iconSvg} <span>${htmlContent}</span>`;
    return note;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INJECTION LOGIC
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Find the Target section (Player) by searching for its specific title class
   * This avoids reliance on parent container classes which might vary.
   */
  function findTargetSection() {
    const titles = document.querySelectorAll(".section-title-Nt71Z");
    for (const title of titles) {
      if (title.textContent.trim() === TARGET_SECTION_LABEL) {
        // The title is a direct child of the section container in the user's HTML
        return title.closest(".section-container-twzKQ");
      }
    }
    return null;
  }

  /**
   * Inject all MPV settings into Target section
   */
  function injectSettings(targetSection) {
    // Check if already injected
    if (targetSection.querySelector(".kai-mpv-setting")) {
      return;
    }

    const injectionFragment = document.createDocumentFragment();

    // 1. Display & Color Section
    const visualHeader = createSectionHeader(
      "Display & Color",
      `<svg class="icon-REQkK" viewBox="0 0 24 24" fill="none"><path d="M12 17V21M8 21H16M6.2 17H17.8C18.9201 17 19.4802 17 19.908 16.782C20.2843 16.5903 20.5903 16.2843 20.782 15.908C21 15.4802 21 14.9201 21 13.8V6.2C21 5.0799 21 4.51984 20.782 4.09202C20.5903 3.71569 20.2843 3.40973 19.908 3.21799C19.4802 3 18.9201 3 17.8 3H6.2C5.0799 3 4.51984 3 4.09202 3.21799C3.71569 3.40973 3.40973 3.71569 3.21799 4.09202C3 4.51984 3 5.07989 3 6.2V13.8C3 14.9201 3 15.4802 3.21799 15.908C3.40973 16.2843 3.71569 16.5903 4.09202 16.782C4.51984 17 5.07989 17 6.2 17Z" stroke="#000000" stroke-width="2" stroke-linecap="round" style="stroke: currentcolor;"/></svg>`,
    );
    injectionFragment.appendChild(visualHeader);

    // 1a. Picture Mode
    const colorDropdown = createDropdownOption(
      "Picture Mode",
      "Select a predefined color and contrast profile for SDR content.",
      COLOR_PROFILES,
      getColorProfile(),
      setColorProfile,
    );
    injectionFragment.appendChild(colorDropdown);

    // 1b. HDR Passthrough
    const hdrToggle = createToggleOption(
      "HDR Passthrough",
      "Direct HDR output to avoid SDR conversion and tonemapping.",
      getHdrPassthrough(),
      setHdrPassthrough,
    );
    // HDR Warning (Appended INSIDE the toggle container)
    const hdrNote = createNote(
      "warning",
      "<strong>Warning:</strong> Enable only if your monitor or TV supports HDR.",
    );
    hdrToggle.appendChild(hdrNote);
    injectionFragment.appendChild(hdrToggle);

    // 1c. ICC Profile Support
    const iccToggle = createToggleOption(
      "Use ICC Profile",
      "Apply the display’s ICC color profile if available. Disable to use raw sRGB output.",
      getIccProfile(),
      setIccProfile,
    );
    // ICC Info Note (Appended INSIDE the toggle container)
    const iccNote = createNote(
      "info",
      "<strong>Note:</strong> Recommended only for calibrated displays.",
    );
    iccToggle.appendChild(iccNote);
    injectionFragment.appendChild(iccToggle);

    // 2. Anime Enhancements section header
    const animeHeader = createSectionHeader(
      "Anime Enhancements",
      `<svg class="icon-REQkK" viewBox="0 0 24 24" fill="none"><path d="M19 3V7M17 5H21M19 17V21M17 19H21M10 5L8.53001 8.72721C8.3421 9.20367 8.24814 9.4419 8.10427 9.64278C7.97675 9.82084 7.82084 9.97675 7.64278 10.1043C7.4419 10.2481 7.20367 10.3421 6.72721 10.53L3 12L6.72721 13.47C7.20367 13.6579 7.4419 13.7519 7.64278 13.8957C7.82084 14.0233 7.97675 14.1792 8.10427 14.3572C8.24814 14.5581 8.3421 14.7963 8.53001 15.2728L10 19L11.47 15.2728C11.6579 14.7963 11.7519 14.5581 11.8957 14.3572C12.0233 14.1792 12.1792 14.0233 12.3572 13.8957C12.5581 13.7519 12.7963 13.6579 13.2728 13.47L17 12L13.2728 10.53C12.7963 10.3421 12.5581 10.2481 12.3572 10.1043C12.1792 9.97675 12.0233 9.82084 11.8957 9.64278C11.7519 9.4419 11.6579 9.20367 11.47 8.72721L10 5Z" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="stroke: currentcolor;"/></svg>`,
    );
    injectionFragment.appendChild(animeHeader);

    // 3. Anime4K preset dropdown
    const anime4kDropdown = createDropdownOption(
      "Anime4K Shaders",
      "GLSL shaders for upscaling and enhancement.",
      ANIME4K_PRESETS,
      getAnime4kPreset(),
      setAnime4kPreset,
    );
    // Anime4K Info Note
    const anime4kNote = createNote(
      "info",
      "<strong>Note:</strong> Higher presets significantly increase GPU usage.",
    );
    anime4kDropdown.appendChild(anime4kNote);
    injectionFragment.appendChild(anime4kDropdown);

    // 4. SVP toggle
    const svpToggle = createToggleOption(
      "SVP Frame Interpolation",
      "Generate in‑between frames for smoother motion.",
      getSvpEnabled(),
      setSvpEnabled,
    );
    // SVP Warning Note
    const svpNote = createNote(
      "warning",
      "<strong>Warning:</strong> High CPU and GPU load. May cause stutter on weaker systems when combined with stronger shaders.",
    );
    svpToggle.appendChild(svpNote);

    // ─────────────────────────────────────────────────────────────────────────
    // WRAP & ORGANIZE SECTIONS
    // ─────────────────────────────────────────────────────────────────────────

    // Helper to wrap content in a Stremio-style section container (Card)
    function wrapInSection(header, ...elements) {
      const wrapper = document.createElement("div");
      wrapper.className = "section-container-twzKQ kai-mpv-setting";
      // Prevent double spacing issues when nested
      wrapper.style.marginBottom = "0";

      wrapper.appendChild(header);
      elements.forEach((el) => wrapper.appendChild(el));
      return wrapper;
    }

    // Wrap Display Section
    const displaySection = wrapInSection(
      visualHeader,
      colorDropdown,
      hdrToggle, // hdrNote is already inside
      iccToggle, // iccNote is already inside
    );

    // Wrap Anime Section
    const animeSection = wrapInSection(
      animeHeader,
      anime4kDropdown, // anime4kNote is already inside
      svpToggle, // svpNote is already inside
    );

    // ─────────────────────────────────────────────────────────────────────────
    // EXTENDED INJECTION (SMART TRACKS)
    // ─────────────────────────────────────────────────────────────────────────

    // Audio Smart Tracks Fragment
    const audioFrag = document.createDocumentFragment();
    audioFrag.appendChild(
      createToggleOption(
        "Match Audio to Video Language",
        "Prioritize audio tracks that match the video's original language.",
        safeGet(STORAGE_KEYS.MATCH_AUDIO, false),
        (val) => {
          safeSet(STORAGE_KEYS.MATCH_AUDIO, val);
          sendConfigUpdate();
        },
      ),
    );

    const currentRejectAudioKw = safeGet(STORAGE_KEYS.REJECT_AUDIO_KEYWORDS, [
      "commentary",
      "descriptive, audio description",
      "visually impaired",
    ]);
    audioFrag.appendChild(
      createMultiSelect(
        "Audio Reject Keywords",
        "Ignore audio tracks containing these keywords.",
        AUDIO_REJECT_PRESETS,
        currentRejectAudioKw,
        (val) => {
          safeSet(STORAGE_KEYS.REJECT_AUDIO_KEYWORDS, val);
          sendConfigUpdate();
        },
        true, // Enable Select All
      ),
    );
    const currentRejectAudio = safeGet(STORAGE_KEYS.REJECT_AUDIO, []);
    audioFrag.appendChild(
      createMultiSelect(
        "Rejected Audio Languages",
        "Audio tracks with these languages will be ignored.",
        ISO_LANGUAGES,
        currentRejectAudio,
        (val) => {
          safeSet(STORAGE_KEYS.REJECT_AUDIO, val);
          sendConfigUpdate();
        },
      ),
    );

    // Subtitle Smart Tracks Fragment
    const subFrag = document.createDocumentFragment();
    subFrag.appendChild(
      createToggleOption(
        "Use Forced Subs for Native Audio",
        "Enable forced subs when audio matches video.",
        safeGet(STORAGE_KEYS.USE_FORCED_SUBS, false),
        (val) => {
          safeSet(STORAGE_KEYS.USE_FORCED_SUBS, val);
          sendConfigUpdate();
        },
      ),
    );

    const currentRejectSubKw = safeGet(STORAGE_KEYS.REJECT_SUB_KEYWORDS, [
      "sign",
      "song",
      "karaoke",
      "forced",
      "commentary",
      "op",
      "ed",
      "credit",
      "text",
      "graphic",
      "translation",
    ]);
    subFrag.appendChild(
      createMultiSelect(
        "Subtitle Reject Keywords",
        "Ignore subtitle tracks containing these keywords (e.g. 'Signs').",
        SUB_REJECT_PRESETS,
        currentRejectSubKw,
        (val) => {
          safeSet(STORAGE_KEYS.REJECT_SUB_KEYWORDS, val);
          sendConfigUpdate();
        },
        true, // Enable Select All
      ),
    );
    const currentRejectSubs = safeGet(STORAGE_KEYS.REJECT_SUBS, []);
    subFrag.appendChild(
      createMultiSelect(
        "Rejected Subtitle Languages",
        "Subtitle tracks with these languages will be ignored.",
        ISO_LANGUAGES,
        currentRejectSubs,
        (val) => {
          safeSet(STORAGE_KEYS.REJECT_SUBS, val);
          sendConfigUpdate();
        },
        false, // No Select All
      ),
    );

    // Skip Integration Fragment
    const skipFrag = document.createDocumentFragment();
    skipFrag.appendChild(
      createToggleOption(
        "Auto Skip Intro/Outro",
        "Automatically skip detected intros and outros without asking.",
        safeGet(STORAGE_KEYS.AUTO_SKIP, false),
        (val) => {
          safeSet(STORAGE_KEYS.AUTO_SKIP, val);
          sendConfigUpdate();
        },
      ),
    );
    skipFrag.appendChild(
      createToggleOption(
        "Show Skip Notifications",
        "Show a popup when skippable content is detected.",
        safeGet(STORAGE_KEYS.SHOW_NOTIFICATIONS, true),
        (val) => {
          safeSet(STORAGE_KEYS.SHOW_NOTIFICATIONS, val);
          sendConfigUpdate();
        },
      ),
    );

    // ─────────────────────────────────────────────────────────────────────────
    // INJECTION
    // ─────────────────────────────────────────────────────────────────────────

    // 1. Inject Display/Anime SECTIONS between Audio and "Controls"
    // 2. Inject Smart Track ITEMS inside "Audio" and "Subtitles" sections
    // 3. Inject Skip ITEMS inside a new "Playback" section (or append to Audio?)
    //    Actually, reusing "Audio" or creating a new "Skip" header is complex.
    //    Let's inject a new "Skip" Group.

    const allLabels = Array.from(document.querySelectorAll(".label-FFamJ"));

    // Find Containers
    // The structure is usually label -> option-name -> option-container -> section-category -> section-container(root)
    // But "Audio" and "Subtitles" are HEADERS of the section-container.
    // wait, "Player" is the section TITLE. "Audio" is a CATEGORY LABEL inside the Player section.
    // Let's find the `section-category-container-EOuS0` that contains "Audio" text.

    // Helper to inject AFTER a header's options but BEFORE the next header
    const injectIntoSection = (headerNode, fragment) => {
      if (!headerNode || !headerNode.parentNode) return;
      const container = headerNode.parentNode; // section-container

      // Find the next header (sibling of current header)
      let nextSibling = headerNode.nextSibling;
      // Skip over options (section-category-container check)
      while (nextSibling) {
        if (
          nextSibling.classList &&
          nextSibling.classList.contains("section-category-container-EOuS0")
        ) {
          break;
        }
        nextSibling = nextSibling.nextSibling;
      }

      // Insert before the next header (or at end if no next header)
      if (nextSibling) {
        container.insertBefore(fragment, nextSibling);
      } else {
        container.appendChild(fragment);
      }
    };

    let audioHeaderInfo = null;
    let subtitleHeaderInfo = null;
    let advancedHeaderInfo = null;
    let controlsContainer = null;

    for (const label of allLabels) {
      const text = label.textContent.trim();
      if (text === "Audio") {
        // This label is likely inside the header div
        audioHeaderInfo = label.closest(".section-category-container-EOuS0");
      }
      if (text === "Subtitles") {
        subtitleHeaderInfo = label.closest(".section-category-container-EOuS0");
      }
      if (text === "Advanced") {
        advancedHeaderInfo = label.closest(".section-category-container-EOuS0");
      }
      if (text === "Controls") {
        controlsContainer = label.closest(".section-container-twzKQ");
      }
    }

    if (audioHeaderInfo) {
      injectIntoSection(audioHeaderInfo, audioFrag);
      console.log("[MPV Settings] Injected Smart Audio Settings");
    }
    if (subtitleHeaderInfo) {
      injectIntoSection(subtitleHeaderInfo, subFrag);
      console.log("[MPV Settings] Injected Smart Subtitle Settings");
    }
    if (advancedHeaderInfo) {
      injectIntoSection(advancedHeaderInfo, skipFrag);
      console.log("[MPV Settings] Injected Notify Skip Settings");
    }

    if (controlsContainer) {
      // Inject Custom Sections BEFORE Controls
      const parent = controlsContainer.parentNode;
      parent.insertBefore(displaySection, controlsContainer);
      parent.insertBefore(animeSection, controlsContainer);
      console.log("[MPV Settings] Injected Custom Sections (Display/Anime)");
    } else {
      // Fallback append
      if (targetSection) {
        targetSection.appendChild(displaySection);
        targetSection.appendChild(animeSection);
      }
    }

    // Event listener moved to top level to prevent duplication

    console.log("[MPV Settings] Settings injected (Wrapped Mode)");
  }

  /**
   * Ensure custom CSS is injected
   */
  function ensureStyles() {
    if (!document.getElementById("kai-settings-ui-css") && document.head) {
      const link = document.createElement("link");
      link.id = "kai-settings-ui-css";
      link.rel = "stylesheet";
      link.href = "webmods/Theme/settings-ui.css";
      document.head.appendChild(link);
    }
  }

  /**
   * Observe DOM for changes and attempt injection
   */
  /**
   * Observe DOM for changes and attempt injection (Debounced)
   */
  function observeSettings() {
    ensureStyles(); // Inject CSS when we start observing/initializing

    let debounceTimer = null;
    const observer = new MutationObserver(() => {
      if (debounceTimer) return;

      debounceTimer = setTimeout(() => {
        debounceTimer = null;

        // Ensure we are still on options page (basic check)
        const settingsContent = document.querySelector(
          SETTINGS_CONTAINER_SELECTOR,
        );
        if (!settingsContent) return; // Optimization: Don't scan if container missing

        // We search for Controls label to trigger injection
        if (!document.querySelector(".kai-mpv-setting")) {
          const controlsLabel = Array.from(
            document.querySelectorAll(".label-FFamJ"),
          ).find((l) => l.textContent.trim() === "Controls");

          if (controlsLabel) {
            const target = findTargetSection();
            if (target || controlsLabel) {
              injectSettings(target);
            }
          }
        }
      }, 50); // 50ms Debounce
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Also check immediately
    const targetSection = findTargetSection();
    if (targetSection) {
      injectSettings(targetSection);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPOSE GETTERS FOR MPV-BRIDGE.JS
  // ═══════════════════════════════════════════════════════════════════════════

  function getSmartTrackConfig() {
    const getBool = (key) => localStorage.getItem(key) === "true";
    const getList = (key) => {
      try {
        return JSON.parse(localStorage.getItem(key) || "[]");
      } catch {
        return [];
      }
    };

    return {
      match_audio_to_video: getBool(STORAGE_KEYS.MATCH_AUDIO),
      use_forced_for_native: getBool(STORAGE_KEYS.USE_FORCED_SUBS),

      audio_reject_langs: getList(STORAGE_KEYS.REJECT_AUDIO),
      sub_reject_langs: getList(STORAGE_KEYS.REJECT_SUBS),
      // Keyword Lists

      audio_reject_keywords: getList(STORAGE_KEYS.REJECT_AUDIO_KEYWORDS),
      sub_reject_keywords: getList(STORAGE_KEYS.REJECT_SUB_KEYWORDS),
    };
  }

  /**
   * Expand a language code into its full alias list (if found)
   * e.g. "eng" -> "eng,en,english"
   */
  function expandLanguage(code) {
    if (!code) return "";
    const cleanCode = code.trim().toLowerCase();
    // Find entry where value contains the code (as a comma-separated token)
    // We check strict token match to avoid "eng" matching "bengali"
    const entry = ISO_LANGUAGES.find((lang) => {
      const tokens = lang.value.split(",");
      return tokens.includes(cleanCode);
    });
    return entry ? entry.value : cleanCode;
  }

  // Also expose to window for bridge usage (Critical for mpv-bridge.js)
  window.MpvSettings.getSmartTrackConfig = getSmartTrackConfig;
  window.MpvSettings.expandLanguage = expandLanguage;

  window.MpvSettings.getHdrPassthrough = getHdrPassthrough;
  window.MpvSettings.getAnime4kPreset = getAnime4kPreset;
  window.MpvSettings.getSvpEnabled = getSvpEnabled;
  window.MpvSettings.getColorProfile = getColorProfile;
  window.MpvSettings.getIccProfile = getIccProfile;

  // Start observing when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observeSettings);
  } else {
    observeSettings();
  }

  // Storage listener for live reactivity (Wizard Support)
  window.addEventListener("storage", (e) => {
    // Only care about our keys
    if (Object.values(STORAGE_KEYS).includes(e.key)) {
      // If settings page is open, the toggles might need visual update
      // For simplicity, we just trigger the observer logic again or wait for next render
      // But since these are custom injected, we can find them.
      const settingsContent = document.querySelector(
        SETTINGS_CONTAINER_SELECTOR,
      );
      if (settingsContent) {
        // Re-trigger visual state update would be complex without state mapping
        // So we just log it for now as the player reads from storage anyway.
        console.log(
          `%c[MPV Settings] Storage changed: ${e.key}`,
          "color: #00aaff;",
        );
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA (Moved to bottom for readability)
  // ═══════════════════════════════════════════════════════════════════════════

  // Placeholder ICONS - Filled via subsequent edit
  ICONS.CHECK =
    '<svg class="icon-jg2il" viewBox="0 0 512 512" style="fill: currentcolor;"><path d="m91.7 213.799 145.4 169.6c2.1 2.536 4.7 4.592 7.6 6.031 2.9 1.487 6.1 2.381 9.5 2.633 3.2.251 6.5-.148 9.6-1.171 3.1-1.035 6-2.663 8.5-4.793.9-.797 1.8-1.703 2.6-2.7l145.4-169.6c3.1-3.647 4.9-8.083 5.6-12.8.7-4.719 0-9.539-1.9-13.869-2-4.344-5.2-8.023-9.2-10.599s-8.7-3.942-13.6-3.932H110.6c-3.3-.01-6.6.626-9.6 1.873-4.7 1.86-8.6 5.058-11.2 9.175-2.7 4.109-4.2 8.924-4.2 13.852.1 5.99 2.3 11.756 6.1 16.3"></path></svg>';
  ICONS.ARROW =
    '<svg class="icon-jg2il" viewBox="0 0 512 512" style="fill: currentcolor;"><path d="m91.7 213.799 145.4 169.6c2.1 2.536 4.7 4.592 7.6 6.031 2.9 1.487 6.1 2.381 9.5 2.633 3.2.251 6.5-.148 9.6-1.171 3.1-1.035 6-2.663 8.5-4.793.9-.797 1.8-1.703 2.6-2.7l145.4-169.6c3.1-3.647 4.9-8.083 5.6-12.8.7-4.719 0-9.539-1.9-13.869-2-4.344-5.2-8.023-9.2-10.599s-8.7-3.942-13.6-3.932H110.6c-3.3-.01-6.6.626-9.6 1.873-4.7 1.86-8.6 5.058-11.2 9.175-2.7 4.109-4.2 8.924-4.2 13.852.1 5.99 2.3 11.756 6.1 16.3"></path></svg>';

  // Placeholder LANGUAGES - Filled via subsequent edit
  const LANGUAGES_DATA = [
    { value: "aar,aa,afar", label: "Afar" },
    { value: "abk,ab,abkhazian", label: "Abkhazian" },
    { value: "afr,af,afrikaans", label: "Afrikaans" },
    { value: "aka,ak,akan", label: "Akan" },
    { value: "alb,sq,sqi,albanian", label: "Albanian" },
    { value: "amh,am,amharic", label: "Amharic" },
    { value: "ara,ar,arabic", label: "Arabic" },
    { value: "arg,an,aragonese", label: "Aragonese" },
    { value: "arm,hy,hye,armenian", label: "Armenian" },
    { value: "asm,as,assamese", label: "Assamese" },
    { value: "ava,av,avaric", label: "Avaric" },
    { value: "ave,ae,avestan", label: "Avestan" },
    { value: "aym,ay,aymara", label: "Aymara" },
    { value: "aze,az,azerbaijani", label: "Azerbaijani" },
    { value: "bak,ba,bashkir", label: "Bashkir" },
    { value: "bam,bm,bambara", label: "Bambara" },
    { value: "baq,eu,eus,basque", label: "Basque" },
    { value: "bel,be,belarusian", label: "Belarusian" },
    { value: "ben,bn,bengali", label: "Bengali" },
    { value: "bih,bh,bihari", label: "Bihari" },
    { value: "bis,bi,bislama", label: "Bislama" },
    { value: "bos,bs,bosnian", label: "Bosnian" },
    { value: "bre,br,breton", label: "Breton" },
    { value: "bul,bg,bulgarian", label: "Bulgarian" },
    { value: "bur,my,mya,burmese", label: "Burmese" },
    { value: "cat,ca,catalan", label: "Catalan" },
    { value: "cha,ch,chamorro", label: "Chamorro" },
    { value: "che,ce,chechen", label: "Chechen" },
    { value: "chi,zh,zho,chinese", label: "Chinese" },
    { value: "chu,cu,church slavic", label: "Church Slavic" },
    { value: "chv,cv,chuvash", label: "Chuvash" },
    { value: "cor,kw,cornish", label: "Cornish" },
    { value: "cos,co,corsican", label: "Corsican" },
    { value: "cre,cr,cree", label: "Cree" },
    { value: "cze,cs,ces,czech", label: "Czech" },
    { value: "dan,da,danish", label: "Danish" },
    { value: "div,dv,divehi", label: "Divehi" },
    { value: "dut,nl,nld,dutch", label: "Dutch" },
    { value: "dzo,dz,dzongkha", label: "Dzongkha" },
    { value: "eng,en,english", label: "English" },
    { value: "epo,eo,esperanto", label: "Esperanto" },
    { value: "est,et,estonian", label: "Estonian" },
    { value: "ewe,ee,ewe", label: "Ewe" },
    { value: "fao,fo,faroese", label: "Faroese" },
    { value: "fij,fj,fijian", label: "Fijian" },
    { value: "fin,fi,finnish", label: "Finnish" },
    { value: "fre,fr,fra,french", label: "French" },
    { value: "fry,fy,western frisian", label: "Western Frisian" },
    { value: "ful,ff,fulah", label: "Fulah" },
    { value: "geo,ka,kat,georgian", label: "Georgian" },
    { value: "ger,de,deu,german", label: "German" },
    { value: "gla,gd,gaelic", label: "Gaelic" },
    { value: "gle,ga,irish", label: "Irish" },
    { value: "glg,gl,galician", label: "Galician" },
    { value: "glv,gv,manx", label: "Manx" },
    { value: "gre,el,ell,greek", label: "Greek" },
    { value: "grn,gn,guarani", label: "Guarani" },
    { value: "guj,gu,gujarati", label: "Gujarati" },
    { value: "hat,ht,haitian", label: "Haitian" },
    { value: "hau,ha,hausa", label: "Hausa" },
    { value: "heb,he,hebrew", label: "Hebrew" },
    { value: "her,hz,herero", label: "Herero" },
    { value: "hin,hi,hindi", label: "Hindi" },
    { value: "hmo,ho,hiri motu", label: "Hiri Motu" },
    { value: "hrv,hr,croatian", label: "Croatian" },
    { value: "hun,hu,hungarian", label: "Hungarian" },
    { value: "ibo,ig,igbo", label: "Igbo" },
    { value: "ice,is,isl,icelandic", label: "Icelandic" },
    { value: "ido,io,ido", label: "Ido" },
    { value: "iii,ii,sichuan yi", label: "Sichuan Yi" },
    { value: "iku,iu,inuktitut", label: "Inuktitut" },
    { value: "ile,ie,interlingue", label: "Interlingue" },
    { value: "ina,ia,interlingua", label: "Interlingua" },
    { value: "ind,id,indonesian", label: "Indonesian" },
    { value: "ipk,ik,inupiaq", label: "Inupiaq" },
    { value: "ita,it,italian", label: "Italian" },
    { value: "jav,jv,javanese", label: "Javanese" },
    { value: "jpn,ja,japanese", label: "Japanese" },
    { value: "kal,kl,kalaallisut", label: "Kalaallisut" },
    { value: "kan,kn,kannada", label: "Kannada" },
    { value: "kas,ks,kashmiri", label: "Kashmiri" },
    { value: "kau,kr,kanuri", label: "Kanuri" },
    { value: "kaz,kk,kazakh", label: "Kazakh" },
    { value: "khm,km,central khmer", label: "Central Khmer" },
    { value: "kik,ki,kikuyu", label: "Kikuyu" },
    { value: "kin,rw,kinyarwanda", label: "Kinyarwanda" },
    { value: "kir,ky,kirghiz", label: "Kirghiz" },
    { value: "kom,kv,komi", label: "Komi" },
    { value: "kon,kg,kongo", label: "Kongo" },
    { value: "kor,ko,korean", label: "Korean" },
    { value: "kua,kj,kuanyama", label: "Kuanyama" },
    { value: "kur,ku,kurdish", label: "Kurdish" },
    { value: "lao,lo,lao", label: "Lao" },
    { value: "lat,la,latin", label: "Latin" },
    { value: "lav,lv,latvian", label: "Latvian" },
    { value: "lim,li,limburgan", label: "Limburgan" },
    { value: "lin,ln,lingala", label: "Lingala" },
    { value: "lit,lt,lithuanian", label: "Lithuanian" },
    { value: "ltz,lb,luxembourgish", label: "Luxembourgish" },
    { value: "lub,lu,luba-katanga", label: "Luba-Katanga" },
    { value: "lug,lg,ganda", label: "Ganda" },
    { value: "mac,mk,mkd,macedonian", label: "Macedonian" },
    { value: "mah,mh,marshallese", label: "Marshallese" },
    { value: "mal,ml,malayalam", label: "Malayalam" },
    { value: "mao,mi,mri,maori", label: "Maori" },
    { value: "mar,mr,marathi", label: "Marathi" },
    { value: "may,ms,msa,malay", label: "Malay" },
    { value: "mlg,mg,malagasy", label: "Malagasy" },
    { value: "mlt,mt,maltese", label: "Maltese" },
    { value: "mon,mn,mongolian", label: "Mongolian" },
    { value: "nau,na,nauru", label: "Nauru" },
    { value: "nav,nv,navajo", label: "Navajo" },
    { value: "nbl,nr,south ndebele", label: "South Ndebele" },
    { value: "nde,nd,north ndebele", label: "North Ndebele" },
    { value: "ndo,ng,ndonga", label: "Ndonga" },
    { value: "nep,ne,nepali", label: "Nepali" },
    { value: "nor,no,norwegian", label: "Norwegian" },
    { value: "nob,nb,norwegian bokmal", label: "Norwegian Bokmål" },
    { value: "nno,nn,norwegian nynorsk", label: "Norwegian Nynorsk" },
    { value: "nya,ny,chichewa", label: "Chichewa" },
    { value: "oci,oc,occitan", label: "Occitan" },
    { value: "oji,oj,ojibwa", label: "Ojibwa" },
    { value: "ori,or,oriya", label: "Oriya" },
    { value: "orm,om,oromo", label: "Oromo" },
    { value: "oss,os,ossetian", label: "Ossetian" },
    { value: "pan,pa,punjabi", label: "Punjabi" },
    { value: "per,fa,fas,persian", label: "Persian" },
    { value: "pli,pi,pali", label: "Pali" },
    { value: "pol,pl,polish", label: "Polish" },
    { value: "por,pt,portuguese", label: "Portuguese" },
    { value: "pus,ps,pushto", label: "Pushto" },
    { value: "que,qu,quechua", label: "Quechua" },
    { value: "roh,rm,romansh", label: "Romansh" },
    { value: "rum,ro,ron,romanian", label: "Romanian" },
    { value: "run,rn,rundi", label: "Rundi" },
    { value: "rus,ru,russian", label: "Russian" },
    { value: "sag,sg,sango", label: "Sango" },
    { value: "san,sa,sanskrit", label: "Sanskrit" },
    { value: "sin,si,sinhala", label: "Sinhala" },
    { value: "slo,sk,slk,slovak", label: "Slovak" },
    { value: "slv,sl,slovenian", label: "Slovenian" },
    { value: "sme,se,northern sami", label: "Northern Sami" },
    { value: "smo,sm,samoan", label: "Samoan" },
    { value: "sna,sn,shona", label: "Shona" },
    { value: "snd,sd,sindhi", label: "Sindhi" },
    { value: "som,so,somali", label: "Somali" },
    { value: "sot,st,southern sotho", label: "Southern Sotho" },
    { value: "spa,es,spanish", label: "Spanish" },
    { value: "srd,sc,sardinian", label: "Sardinian" },
    { value: "srp,sr,serbian", label: "Serbian" },
    { value: "ssw,ss,swati", label: "Swati" },
    { value: "sun,su,sundanese", label: "Sundanese" },
    { value: "swa,sw,swahili", label: "Swahili" },
    { value: "swe,sv,swedish", label: "Swedish" },
    { value: "tah,ty,tahitian", label: "Tahitian" },
    { value: "tam,ta,tamil", label: "Tamil" },
    { value: "tat,tt,tatar", label: "Tatar" },
    { value: "tel,te,telugu", label: "Telugu" },
    { value: "tgk,tg,tajik", label: "Tajik" },
    { value: "tgl,tl,tagalog", label: "Tagalog" },
    { value: "tha,th,thai", label: "Thai" },
    { value: "tib,bo,bod,tibetan", label: "Tibetan" },
    { value: "tir,ti,tigrinya", label: "Tigrinya" },
    { value: "ton,to,tonga", label: "Tonga" },
    { value: "tsn,tn,tswana", label: "Tswana" },
    { value: "tso,ts,tsonga", label: "Tsonga" },
    { value: "tuk,tk,turkmen", label: "Turkmen" },
    { value: "tur,tr,turkish", label: "Turkish" },
    { value: "twi,tw,twi", label: "Twi" },
    { value: "uig,ug,uighur", label: "Uighur" },
    { value: "ukr,uk,ukrainian", label: "Ukrainian" },
    { value: "urd,ur,urdu", label: "Urdu" },
    { value: "uzb,uz,uzbek", label: "Uzbek" },
    { value: "ven,ve,venda", label: "Venda" },
    { value: "vie,vi,vietnamese", label: "Vietnamese" },
    { value: "vol,vo,volapuk", label: "Volapük" },
    { value: "wln,wa,walloon", label: "Walloon" },
    { value: "wel,cy,cym,welsh", label: "Welsh" },
    { value: "wol,wo,wolof", label: "Wolof" },
    { value: "xho,xh,xhosa", label: "Xhosa" },
    { value: "yid,yi,yiddish", label: "Yiddish" },
    { value: "yor,yo,yoruba", label: "Yoruba" },
    { value: "zha,za,zhuang", label: "Zhuang" },
    { value: "zul,zu,zulu", label: "Zulu" },
  ];
  ISO_LANGUAGES.push(...LANGUAGES_DATA);

  console.log("[MPV Settings] Initialized v2.1 (Optimized)");
})();
