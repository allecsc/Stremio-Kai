// Stremio Kai Navigation Enhancer
// Handles global navigation shortcuts and overrides
// - Logo Click: Go to Board (or Releases if update available)
// - Back Button: Go to Board (from Detail pages)

(function () {
  "use strict";

  if (window.KaiNavigation?.initialized) return;
  window.KaiNavigation = window.KaiNavigation || {};
  window.KaiNavigation.initialized = true;

  const CONFIG = {
    RELEASES_URL: "https://allecsc.github.io/Stremio-Kai/changelog.html",
  };

  const NavigationManager = {
    init() {
      this.enhanceLogo();
      this.enhanceBackButton();
      this.enhanceKeyboardNavigation();
      this.enhanceFocusState();
      this.enhanceDiscoverDetailNavigation();
      this.initGamepad();

      // Programmatically seize Electron Window Focus after rendering.
      // `.horizontal-nav-bar-container-Y_zvK` is always mounted regardless of hero settings.
      const focusPoller = setInterval(() => {
        const navBar = document.querySelector(
          ".horizontal-nav-bar-container-Y_zvK",
        );
        if (navBar) {
          navBar.click(); // Synthetic click to seize webview focus
          document.body.focus();
          clearInterval(focusPoller);
        }
      }, 200);

      console.log("[Kai Navigation] Initialized");
    },

    /**
     * Discover tab: open films on the same #/detail/ route as Board (not inline).
     * Warms metadata cache on mousedown so the detail page loads instantly.
     */
    enhanceDiscoverDetailNavigation() {
      const parseDetailFromElement = (target) => {
        if (!target?.closest) return null;

        let link = target.closest('a[href*="/detail/"]');
        if (!link) {
          const posterHost = target.closest(".meta-item-container-Tj0Ib");
          if (posterHost) {
            link =
              posterHost.closest('a[href*="/detail/"]') ||
              posterHost.querySelector('a[href*="/detail/"]');
          }
        }
        if (!link) return null;

        const href = decodeURIComponent(
          link.getAttribute("href") || link.href || "",
        );
        const match = href.match(/\/(movie|series)\/([^/?#]+)/);
        if (!match) return null;

        let id = decodeURIComponent(match[2]).split("/")[0].split("?")[0];
        let source = "imdb";
        if (id.startsWith("tmdb:")) {
          source = "tmdb";
          id = id.replace("tmdb:", "");
        } else if (id.startsWith("tvdb:")) {
          source = "tvdb";
          id = id.replace("tvdb:", "");
        }

        return {
          type: match[1],
          id,
          source,
          element: link,
        };
      };

      const warmDetailCache = (parsed) => {
        if (!parsed) return;

        // Board pipeline: priorityProcessElement saves full metadata to IndexedDB
        if (window.ShowPageEnhancer?.prefetchDetail) {
          window.ShowPageEnhancer.prefetchDetail(parsed);
          return;
        }

        if (window.metadataHelper?.priorityProcessElement && parsed.element) {
          window.metadataHelper
            .priorityProcessElement(parsed.element)
            .catch(() => {});
        }
      };

      const handleDiscoverItem = (target) => {
        if (!window.location.hash.startsWith("#/discover")) return null;

        const parsed = parseDetailFromElement(target);
        if (!parsed) return null;

        warmDetailCache(parsed);
        return parsed;
      };

      document.addEventListener(
        "mousedown",
        (e) => {
          handleDiscoverItem(e.target);
        },
        true,
      );

      const buildDetailHash = (parsed) => {
        const rawId =
          parsed.source === "imdb"
            ? parsed.id
            : `${parsed.source}:${parsed.id}`;
        return `#/detail/${parsed.type}/${rawId}`;
      };

      const isDetailDomVisible = () => {
        for (const el of document.querySelectorAll(
          ".meta-info-container-ub8AH, [class*='metadetails-container']",
        )) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 2 && rect.height > 2) return true;
        }
        return false;
      };

      // Wake enhancer after Stremio's native SPA navigation mounts detail DOM.
      // Do NOT preventDefault — blocking Stremio breaks React mount (Ctrl+F5 was the workaround).
      const wakeDetailEnhancer = (parsed) => {
        warmDetailCache(parsed);
        const detailHash = buildDetailHash(parsed);

        const tick = () => {
          if (isDetailDomVisible() && window.location.hash !== detailHash) {
            window.location.hash = detailHash;
          }
          window.dispatchEvent(
            new CustomEvent("kai-detail-navigate", { detail: parsed }),
          );
          window.ShowPageEnhancer?.onDetailShellDetected?.(parsed);
          window.ShowPageEnhancer?.processDetailRoute?.(parsed);
        };

        tick();
        [100, 300, 600, 1200, 2000, 3500].forEach((ms) =>
          setTimeout(tick, ms),
        );
      };

      document.addEventListener(
        "click",
        (e) => {
          const parsed = handleDiscoverItem(e.target);
          if (!parsed) return;
          wakeDetailEnhancer(parsed);
        },
        true,
      );

      document.addEventListener(
        "keydown",
        (e) => {
          if (e.key !== "Enter") return;
          const parsed = handleDiscoverItem(e.target);
          if (!parsed) return;
          wakeDetailEnhancer(parsed);
        },
        true,
      );

      document.addEventListener(
        "mouseover",
        (e) => {
          if (!window.location.hash.startsWith("#/discover")) return;
          const item = e.target.closest(".meta-item-container-Tj0Ib");
          if (!item) return;
          const now = Date.now();
          if (now - (NavigationManager._lastDiscoverWarm || 0) < 400) return;
          NavigationManager._lastDiscoverWarm = now;
          const parsed = parseDetailFromElement(item);
          warmDetailCache(parsed);
        },
        true,
      );

      console.log(
        "[Kai Navigation] Discover detail hash + inject (v1.5.0)",
      );
    },

    /**
     * Tracks focus to toggle a global body class when the navigation layer is active.
     */
    enhanceFocusState() {
      document.addEventListener(
        "focusin",
        (e) => {
          if (
            e.target &&
            e.target.closest &&
            e.target.closest(
              ".vertical-nav-bar-container-UPAkA, .buttons-container-Oc5z1",
            )
          ) {
            document.body.classList.add("nav-layer-active");
          } else {
            document.body.classList.remove("nav-layer-active");
          }
        },
        true, // Must capture phase to monitor all children
      );
    },

    /**
     * Enhances the Stremio logo with click behavior.
     * Uses event delegation to survive DOM re-renders.
     */
    enhanceLogo() {
      document.addEventListener("click", (e) => {
        const logo = e.target.closest(".logo-container-jteMT");
        if (!logo) return;

        e.preventDefault();

        // 1. Check if update is available (flagged by update-notification.js via class)
        // Checks specifically specifically for the pulsing class or a data attribute if we add one later
        const isUpdateAvailable = logo.classList.contains("update-available");

        // 2. Determine if we are on the main page
        const isMainPage =
          window.location.hash === "#/" || window.location.hash === "";

        if (isUpdateAvailable && isMainPage) {
          window.open(CONFIG.RELEASES_URL, "_blank");
        } else {
          window.location.href = "#/";
        }
      });

      // Tooltip handling removed - handled by update-notification.js (title update) and CSS (cursor).
    },

    /**
     * Enhances the back button behavior on detail pages.
     * - Episode chain (ep1→ep2→ep3): skips back to board (#/).
     * - Contextual navigation (Library→detail): goes back normally.
     */
    enhanceBackButton() {
      document.addEventListener(
        "click",
        (e) => {
          const backButton = e.target.closest(".back-button-container-lDB1N");
          if (!backButton) return;

          // Only intercept on detail pages
          if (!window.location.hash.startsWith("#/detail/")) return;

          e.preventDefault();
          e.stopPropagation();

          // Go back naturally, then check where we landed
          history.back();

          window.addEventListener(
            "hashchange",
            () => {
              // If we landed on another detail page (episode chain), skip to board
              if (window.location.hash.startsWith("#/detail/")) {
                window.location.href = "#/";
              }
              // Otherwise (Library, Discover, etc.) — do nothing, we're already there
            },
            { once: true },
          );
        },
        { capture: true },
      );
    },

    /**
     * Global Keyboard Intercepts (Capture Phase)
     * - Smart ESC: Hard-locked to back button behavior ONLY. Cannot exit Fullscreen natively.
     * - Search Auto-Focus: Letters & Space auto-focus the search bar. F key works.
     * - Tab: Swap macro-layers (Navigation <-> Grid).
     */
    enhanceKeyboardNavigation() {
      // --- Smart Auto-Landing (Detail Page) ---
      const getBestDetailContentFocus = () => {
        if (!window.location.hash.startsWith("#/detail")) return null;

        // 1. Unwatched Strategy: Find the first missing .watched-container-gvzs3 flag
        const episodes = Array.from(
          document.querySelectorAll('.videos-list-nE0LJ [tabindex="0"]'),
        ).filter((el) => {
          const rect = el.getBoundingClientRect();
          return (
            rect.width > 0 &&
            !el.disabled &&
            !el.classList.contains("disabled") &&
            window.getComputedStyle(el).visibility !== "hidden"
          );
        });

        if (episodes.length > 0) {
          const unwatchedEpisode = episodes.find(
            (ep) => !ep.querySelector(".watched-container-gvzs3"),
          );
          // Return first unwatched, fallback to first episode completely
          return unwatchedEpisode ? unwatchedEpisode : episodes[0];
        }

        // 2. Stream strategy: Standard movie detail layouts
        const streams = Array.from(
          document.querySelectorAll(
            '.streams-list-Y1lCM [tabindex="0"], .streams-list-Y1lCM a[href]',
          ),
        ).filter((el) => {
          const rect = el.getBoundingClientRect();
          return (
            rect.width > 0 &&
            !el.disabled &&
            !el.classList.contains("disabled") &&
            window.getComputedStyle(el).visibility !== "hidden"
          );
        });

        if (streams.length > 0) return streams[0];
        return null;
      };

      document.addEventListener(
        "keydown",
        (e) => {
          const activeEl = document.activeElement;
          const isTypingInInput =
            activeEl &&
            (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");

          const hash = window.location.hash;
          const isGridPage =
            hash === "" ||
            hash === "#/" ||
            hash.startsWith("#/discover") ||
            hash.startsWith("#/library") ||
            hash.startsWith("#/detail");

          const resumeFocusOnGrid = () => {
            if (hash.startsWith("#/detail")) {
              const smartTarget = getBestDetailContentFocus();
              if (smartTarget) {
                smartTarget.focus();
                return true;
              }
            }

            const allItems = Array.from(
              document.querySelectorAll(
                '.board-content-nPWv1 .board-row-CoJrZ, .meta-items-container-n8vNz .meta-item-container-Tj0Ib, .meta-items-container-IKrND .meta-item-container-Tj0Ib, .videos-list-nE0LJ [tabindex="0"], .streams-list-Y1lCM [tabindex="0"], .streams-list-Y1lCM a[href], .action-buttons-container-XbKVa .action-button-XIZa3',
              ),
            );
            // Find the first row/item whose top edge is visible in the viewport (60px buffer for the Top Nav banner)
            const visibleItem =
              allItems.find((row) => row.getBoundingClientRect().top > 60) ||
              allItems[0];
            if (visibleItem) {
              const target =
                visibleItem.classList.contains("meta-item-container-Tj0Ib") ||
                visibleItem.classList.contains("action-button-XIZa3") ||
                visibleItem.classList.contains("video-container-ezBpK") ||
                visibleItem.classList.contains("stream-container-JPdah") ||
                visibleItem.classList.contains("toggle-container-lZfHP")
                  ? visibleItem
                  : visibleItem.querySelector(
                      ".meta-item-container-Tj0Ib, .see-all-container-MoOtW",
                    );
              if (target) {
                target.focus();
                return true;
              }
            }
            return false;
          };

          // 1. Smart ESC
          if (e.key === "Escape") {
            // Check if a dropdown or dialog is open in the DOM body
            const openOverlay = document.querySelector(
              ".dropdown-container-T9bZ2, .menu-container-B6cqK, .dialog-container-S5c_E, .modal-backdrop",
            );
            if (openOverlay) {
              return; // Let native Stremio handle Escape (close modal/dropdown)
            }

            // Hard clamp on native Escape (prevent internal history/fullscreen events locally if possible)
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            if (!isGridPage) {
              window.location.hash = "#/"; // Strictly back to Native Board
            }
            return;
          }

          // --- CONTINUE WATCHING: Direct-play shortcut ---
          // Enter/Space on a card inside the Continue Watching row triggers the
          // play-icon layer directly, starting the last-used stream immediately
          // instead of navigating to the detail page.
          if (e.key === "Enter" || e.key === " ") {
            const inContinueWatching =
              activeEl && activeEl.closest(".continue-watching-row-ZiNSa");
            if (inContinueWatching) {
              const playIcon =
                activeEl.querySelector(".play-icon-layer-vpQIo") ||
                activeEl
                  .closest(".meta-item-container-Tj0Ib")
                  ?.querySelector(".play-icon-layer-vpQIo");
              if (playIcon) {
                e.preventDefault();
                e.stopPropagation();
                playIcon.dispatchEvent(
                  new MouseEvent("mousedown", {
                    bubbles: true,
                    cancelable: true,
                  }),
                );
                playIcon.dispatchEvent(
                  new MouseEvent("mouseup", {
                    bubbles: true,
                    cancelable: true,
                  }),
                );
                playIcon.click();
                return;
              }
            }
          }

          // --- PLAYER OVERLAY CONTROLS (Executes regardless of isGridPage) ---
          if (hash.startsWith("#/player")) {
            // Player UI Toggling (Gamepad X / Tab) is handled natively inside `pollGamepad` due to React synthetic event numbness.

            // 3. Arrow Keys: Priority-ordered spatial navigation
            if (
              ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
                e.key,
              )
            ) {
              // PRIORITY 1: A popup menu is open (Subtitles/Audio/Speed) → intercept arrows for it.
              // Check the DOM directly, NOT via activeEl, so we catch it even after focus drops to body.
              const openPopup = document.querySelector(".menu-layer-HZFG9");
              if (openPopup) {
                e.preventDefault();
                e.stopPropagation();

                const inPopup =
                  activeEl && activeEl.closest(".menu-layer-HZFG9");
                if (!inPopup) {
                  // Focus dropped to body after a selection — snap back to first menu item
                  const firstOption = openPopup.querySelector(
                    ".button-container-zVLH6, .language-option-O1Yr9, .variant-option-t7_LA, .option-COcvW, .option-GcPlB",
                  );
                  if (firstOption) firstOption.focus();
                  return;
                }

                // Inside the menu — 2D Euclidean spatial navigation
                const menuOptions = Array.from(
                  openPopup.querySelectorAll(
                    ".button-container-zVLH6, .language-option-O1Yr9, .variant-option-t7_LA, .option-COcvW, .option-GcPlB",
                  ),
                ).filter((el) => {
                  const rect = el.getBoundingClientRect();
                  return (
                    rect.width > 0 &&
                    rect.height > 0 &&
                    window.getComputedStyle(el).visibility !== "hidden"
                  );
                });

                if (menuOptions.length > 0) {
                  const currentRect = activeEl.getBoundingClientRect();
                  const currentCenterX =
                    currentRect.left + currentRect.width / 2;
                  const currentCenterY =
                    currentRect.top + currentRect.height / 2;

                  // Pre-cache all candidate rects in one sequential read pass to reduce layout thrashing
                  const candidates = menuOptions
                    .filter((item) => item !== activeEl)
                    .map((item) => {
                      const r = item.getBoundingClientRect();
                      return {
                        el: item,
                        cx: r.left + r.width / 2,
                        cy: r.top + r.height / 2,
                      };
                    });

                  let bestTarget = null;
                  let minDistance = Infinity;

                  candidates.forEach(({ el, cx, cy }) => {
                    let isValidDirection = false;
                    if (e.key === "ArrowUp")
                      isValidDirection = cy < currentCenterY - 5;
                    else if (e.key === "ArrowDown")
                      isValidDirection = cy > currentCenterY + 5;
                    else if (e.key === "ArrowLeft")
                      isValidDirection = cx < currentCenterX - 5;
                    else if (e.key === "ArrowRight")
                      isValidDirection = cx > currentCenterX + 5;

                    if (isValidDirection) {
                      const dX = Math.abs(cx - currentCenterX);
                      const dY = Math.abs(cy - currentCenterY);
                      const distance =
                        e.key === "ArrowUp" || e.key === "ArrowDown"
                          ? dY + dX * 2
                          : dX + dY * 2;

                      if (distance < minDistance) {
                        minDistance = distance;
                        bestTarget = el;
                      }
                    }
                  });

                  if (bestTarget) bestTarget.focus();
                }
                return;
              }

              // PRIORITY 2: Focused inside the control bar (no popup open) → horizontal nav
              const inControlBar =
                activeEl && activeEl.closest(".control-bar-container-xsWA7");
              if (inControlBar) {
                e.preventDefault();
                e.stopPropagation();

                const buttons = Array.from(
                  document.querySelectorAll(
                    ".control-bar-buttons-container-SWhkU .button-container-zVLH6",
                  ),
                );

                if (buttons.length > 0) {
                  const currentIndex = buttons.indexOf(activeEl);
                  if (
                    e.key === "ArrowRight" &&
                    currentIndex < buttons.length - 1
                  )
                    buttons[currentIndex + 1].focus();
                  else if (e.key === "ArrowLeft" && currentIndex > 0)
                    buttons[currentIndex - 1].focus();
                }
                return;
              }

              // PRIORITY 3: No popup open, focus not in control bar → pass through to native Stremio seek/volume
              return;
            }
          }

          // If we aren't natively on a Grid layout page, let Stremio handle Tabs and Arrows naturally.
          if (!isGridPage) return;

          // 2. Tab: Macro-Layer Zones (Navigation vs Board Grid)
          if (e.key === "Tab") {
            if (isTypingInInput) {
              // Allow normal tab out of the search box
              activeEl.blur(); // Remove focus from search so our logic picks up cleanly
            }

            // Close any native Stremio dropdowns before executing the layer jump
            const openOverlay = document.querySelector(
              ".dropdown-container-T9bZ2, .menu-container-B6cqK",
            );
            if (openOverlay) {
              document.body.click(); // Synthetically forces React to close dropdowns
            }

            e.preventDefault(); // Stop native sequential tabbing
            e.stopPropagation();

            const isDetailPage = hash.startsWith("#/detail");
            const detailActionBtnSel =
              '.action-buttons-container-XbKVa [tabindex="0"], .action-buttons-container-XbKVa a[href]';
            const detailContentSel =
              '.seasons-bar-Ma8vp [tabindex="0"], .videos-list-nE0LJ [tabindex="0"], .streams-list-Y1lCM [tabindex="0"], .streams-list-Y1lCM a[href]';

            if (isDetailPage) {
              const inDetailActionButtons =
                activeEl && activeEl.closest(".action-buttons-container-XbKVa");
              const inDetailContent =
                activeEl &&
                activeEl.closest(
                  ".videos-list-nE0LJ, .streams-list-Y1lCM, .seasons-bar-Ma8vp",
                );

              if (inDetailActionButtons || inDetailContent) {
                if (inDetailActionButtons) {
                  const smartTarget = getBestDetailContentFocus();
                  if (smartTarget) {
                    smartTarget.focus();
                    return;
                  }
                }

                const targetSelector = inDetailContent
                  ? detailActionBtnSel
                  : detailContentSel;

                const targets = Array.from(
                  document.querySelectorAll(targetSelector),
                ).filter((el) => {
                  const rect = el.getBoundingClientRect();
                  return (
                    rect.width > 0 &&
                    rect.height > 0 &&
                    !el.disabled &&
                    !el.classList.contains("disabled") &&
                    window.getComputedStyle(el).visibility !== "hidden"
                  );
                });

                if (targets.length > 0) {
                  targets[0].focus();
                } else {
                  // Fallback to top nav if the target layer is completely empty
                  const topNavItems = Array.from(
                    document.querySelectorAll(
                      ".horizontal-nav-bar-container-Y_zvK .buttons-container-Oc5z1 .button-container-zVLH6",
                    ),
                  );
                  if (topNavItems.length > 0) topNavItems[0].focus();
                }
                return;
              }
            }

            // Define the CSS Selectors for the 2 Macro-layers
            const navSelector =
              ".vertical-nav-bar-container-UPAkA a.nav-tab-button-tW6qT, .horizontal-nav-bar-container-Y_zvK .buttons-container-Oc5z1 .button-container-xT9_L, .horizontal-nav-bar-container-Y_zvK .submit-button-container-MImNa";

            const gridSelector =
              ".board-content-nPWv1 .meta-item-container-Tj0Ib, .meta-items-container-n8vNz .meta-item-container-Tj0Ib, .meta-items-container-IKrND .meta-item-container-Tj0Ib";

            // Determine current active zone
            // Use closest() or matches() on activeEl to figure out where we currently are
            const isInNav = activeEl && activeEl.matches(navSelector);
            const isInGrid =
              activeEl &&
              activeEl.closest(
                ".board-content-nPWv1, .meta-items-container-n8vNz, .meta-items-container-IKrND",
              );

            // Logic: If in Nav -> Go to Grid. If in Grid -> Go to Nav. Else -> Default to Grid
            const targetSelector = isInNav ? gridSelector : navSelector;

            // If escaping Navigation, calculate the visible row viewport offset to land smoothly
            if (isInNav) {
              if (resumeFocusOnGrid()) return;
            }

            // Find elements
            const targets = Array.from(
              document.querySelectorAll(targetSelector),
            ).filter((el) => {
              const rect = el.getBoundingClientRect();
              return (
                rect.width > 0 &&
                rect.height > 0 &&
                window.getComputedStyle(el).visibility !== "hidden"
              );
            });

            if (targets.length > 0) {
              let finalTarget = targets[0];

              // If jumping from Grid -> Nav Layer, try to resume the previously active tab
              if (!isInNav) {
                const activeNav = targets.find(
                  (el) =>
                    el.classList.contains("selected") ||
                    el.classList.contains("active"),
                );
                if (activeNav) finalTarget = activeNav;
              }

              finalTarget.focus();
            }
            return;
          }

          // 3. Arrow Keys: Spatial Navigation
          if (
            ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
          ) {
            // Only engage if we aren't typing in an input
            if (isTypingInInput) return;

            // If a dropdown/menu is active or we are focused inside one, run a local spatial loop
            const inDropdown =
              activeEl &&
              activeEl.closest(
                '[class*="dropdown"], [class*="menu-container"], [class*="dialog"]',
              );

            const dropdownVisible = document.querySelector(
              ".dropdown-container-T9bZ2, .menu-container-B6cqK, .dialog-container-S5c_E",
            );

            const activeDropdown = inDropdown || dropdownVisible;

            if (activeDropdown) {
              // If focused on the Top Nav button, Left/Right shouldn't navigate the top nav behind the menu!
              e.preventDefault();
              e.stopPropagation();

              if (e.key === "ArrowLeft" || e.key === "ArrowRight") return;

              const dropdownItems = Array.from(
                activeDropdown.querySelectorAll(
                  'a[tabindex], [tabindex="0"], button',
                ),
              ).filter((el) => {
                const style = window.getComputedStyle(el);
                return (
                  style.display !== "none" &&
                  style.visibility !== "hidden" &&
                  style.opacity !== "0"
                );
              });

              if (dropdownItems.length > 0) {
                e.preventDefault();
                e.stopPropagation();

                const currentIndex = dropdownItems.indexOf(activeEl);
                let nextIndex = currentIndex !== -1 ? currentIndex : 0;

                if (e.key === "ArrowDown") {
                  nextIndex =
                    currentIndex < dropdownItems.length - 1
                      ? currentIndex + 1
                      : 0;
                } else if (e.key === "ArrowUp") {
                  nextIndex =
                    currentIndex > 0
                      ? currentIndex - 1
                      : dropdownItems.length - 1;
                }

                dropdownItems[nextIndex].focus();
              }
              return;
            }

            // Stop native scrolling
            e.preventDefault();
            e.stopPropagation();

            const sidebarItems = Array.from(
              document.querySelectorAll(
                ".vertical-nav-bar-container-UPAkA a.nav-tab-button-tW6qT",
              ),
            );
            const topNavItems = Array.from(
              document.querySelectorAll(
                ".horizontal-nav-bar-container-Y_zvK .buttons-container-Oc5z1 .button-container-zVLH6",
              ),
            );

            // Check where we are currently focused
            const inSidebarIdx = sidebarItems.indexOf(activeEl);
            const inTopNavIdx = topNavItems.indexOf(activeEl);
            const inGrid =
              activeEl &&
              activeEl.closest(
                ".board-content-nPWv1, .meta-items-container-n8vNz, .meta-items-container-IKrND",
              );
            const inDetails =
              activeEl &&
              activeEl.closest(
                ".videos-list-nE0LJ, .streams-list-Y1lCM, .action-buttons-container-XbKVa, .seasons-bar-Ma8vp",
              );
            const isDetailPage = hash.startsWith("#/detail");

            // --- B. Focus is in Detail Page Linear Tree (Gamepads only!) ---
            if (
              isDetailPage &&
              (inDetails ||
                (!inGrid && inSidebarIdx === -1 && inTopNavIdx === -1))
            ) {
              e.preventDefault();
              e.stopPropagation();

              // Get all focusable elements natively available in a flat DOM array
              const detailItems = Array.from(
                document.querySelectorAll(
                  '.action-buttons-container-XbKVa [tabindex="0"], .action-buttons-container-XbKVa a[href], .seasons-bar-Ma8vp [tabindex="0"], .videos-list-nE0LJ [tabindex="0"], .streams-list-Y1lCM [tabindex="0"], .streams-list-Y1lCM a[href]',
                ),
              ).filter((el) => {
                const rect = el.getBoundingClientRect();
                return (
                  rect.width > 0 &&
                  rect.height > 0 &&
                  !el.disabled &&
                  !el.classList.contains("disabled") &&
                  window.getComputedStyle(el).visibility !== "hidden"
                );
              });

              if (detailItems.length > 0) {
                const currentIndex = detailItems.indexOf(activeEl);
                if (currentIndex === -1) {
                  // Focus the very first playable thing or action button smartly
                  const smartTarget = getBestDetailContentFocus();
                  if (smartTarget) smartTarget.focus();
                  else detailItems[0].focus();
                  return;
                }

                if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                  if (currentIndex < detailItems.length - 1)
                    detailItems[currentIndex + 1].focus();
                } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                  if (currentIndex > 0) detailItems[currentIndex - 1].focus();
                  else if (topNavItems.length > 0) topNavItems[0].focus(); // Escape upwards to Top Nav Layout
                }
              }
              return;
            }

            // --- A. Focus Fallback (Nothing focused / Body) ---
            if (!inGrid && inSidebarIdx === -1 && inTopNavIdx === -1) {
              // Specifically resume focus on the visible portion of the grid
              if (resumeFocusOnGrid()) return;

              if (sidebarItems.length > 0) {
                sidebarItems[0].focus();
                return;
              }
            }

            // --- A. Focus is in Navigation Layer ---
            if (inSidebarIdx !== -1) {
              if (
                e.key === "ArrowDown" &&
                inSidebarIdx < sidebarItems.length - 1
              ) {
                sidebarItems[inSidebarIdx + 1].focus();
              } else if (e.key === "ArrowUp" && inSidebarIdx > 0) {
                sidebarItems[inSidebarIdx - 1].focus();
              } else if (e.key === "ArrowRight" && topNavItems.length > 0) {
                topNavItems[0].focus(); // Jump to Top Nav
              }
              return;
            }

            if (inTopNavIdx !== -1) {
              if (
                e.key === "ArrowRight" &&
                inTopNavIdx < topNavItems.length - 1
              ) {
                topNavItems[inTopNavIdx + 1].focus();
              } else if (e.key === "ArrowLeft") {
                if (inTopNavIdx > 0) {
                  topNavItems[inTopNavIdx - 1].focus();
                } else if (sidebarItems.length > 0) {
                  // Jump back to Sidebar (prefer selected, else first)
                  const selectedSidebar =
                    sidebarItems.find((el) =>
                      el.classList.contains("selected"),
                    ) || sidebarItems[0];
                  selectedSidebar.focus();
                }
              }
              return;
            }

            // --- B. Focus is in Board Grid/Discover/Library ---
            if (inGrid) {
              const boardRow = activeEl.closest(".board-row-CoJrZ");
              const flatGrid = activeEl.closest(
                ".meta-items-container-n8vNz, .meta-items-container-IKrND",
              );

              const container = boardRow || flatGrid;
              if (!container) return; // Should never happen based on inGrid check

              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                const items = Array.from(
                  container.querySelectorAll(
                    ".meta-item-container-Tj0Ib, .see-all-container-MoOtW",
                  ),
                );
                const currentIndex = items.indexOf(activeEl);
                const modifier = e.key === "ArrowRight" ? 1 : -1;
                const nextItem = items[currentIndex + modifier];
                if (nextItem) nextItem.focus();
                return;
              }

              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                if (boardRow) {
                  // Existing board row logic
                  const allRows = Array.from(
                    document.querySelectorAll(
                      ".board-content-nPWv1 .board-row-CoJrZ",
                    ),
                  );
                  const currentRowIdx = allRows.indexOf(boardRow);
                  const nextRowIdx =
                    e.key === "ArrowDown"
                      ? currentRowIdx + 1
                      : currentRowIdx - 1;

                  const targetRow = allRows[nextRowIdx];
                  if (!targetRow) return;

                  const targetItems = Array.from(
                    targetRow.querySelectorAll(
                      ".meta-item-container-Tj0Ib, .see-all-container-MoOtW",
                    ),
                  );
                  if (targetItems.length === 0) return;

                  // 2D Spatial Math: Find element with closest horizontal center
                  const currentRect = activeEl.getBoundingClientRect();
                  const currentCenterX =
                    currentRect.left + currentRect.width / 2;

                  let closestItem = targetItems[0];
                  let minDistance = Infinity;

                  targetItems.forEach((item) => {
                    const rect = item.getBoundingClientRect();
                    const targetCenterX = rect.left + rect.width / 2;
                    const distance = Math.abs(currentCenterX - targetCenterX);

                    if (distance < minDistance) {
                      minDistance = distance;
                      closestItem = item;
                    }
                  });

                  if (closestItem) closestItem.focus();
                } else if (flatGrid) {
                  // Discover & Library dynamic mathematical flat grid calculation
                  const items = Array.from(
                    flatGrid.querySelectorAll(".meta-item-container-Tj0Ib"),
                  );
                  const currentIndex = items.indexOf(activeEl);
                  if (items.length === 0 || currentIndex === -1) return;

                  // 1. Visually calculate `columnsPerRow` dynamically by finding the first wrapping poster
                  const firstTop = items[0].getBoundingClientRect().top;
                  let columnsPerRow = items.findIndex(
                    (item) => item.getBoundingClientRect().top > firstTop + 10,
                  );
                  if (columnsPerRow <= 0) columnsPerRow = items.length; // Fallback to 1 row

                  // 2. Perform array index math
                  let nextIndex =
                    currentIndex +
                    (e.key === "ArrowDown" ? columnsPerRow : -columnsPerRow);

                  // If we press Down at the bottom row, but nextIndex overflows, snap to the very last index mathematically.
                  if (
                    e.key === "ArrowDown" &&
                    nextIndex >= items.length &&
                    currentIndex < items.length - 1
                  ) {
                    nextIndex = items.length - 1;
                  }

                  if (nextIndex >= 0 && nextIndex < items.length) {
                    items[nextIndex].focus();
                  } else if (nextIndex < 0) {
                    // We pushed Up on the first row! Send focus back to the Navigation Top Bar
                    const topNavItems = Array.from(
                      document.querySelectorAll(
                        ".horizontal-nav-bar-container-Y_zvK .buttons-container-Oc5z1 .button-container-zVLH6, .horizontal-nav-bar-container-Y_zvK .submit-button-container-MImNa",
                      ),
                    );
                    if (topNavItems.length > 0) topNavItems[0].focus();
                  }
                }
              }
              return;
            }
          }

          // 4. Search Auto-Focus (Letters and Space)
          const isLetterOrSpace =
            (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) || e.key === " ";

          if (
            isLetterOrSpace &&
            !isTypingInInput &&
            !e.ctrlKey &&
            !e.metaKey &&
            !e.altKey &&
            (hash === "" ||
              hash === "#/" ||
              hash.startsWith("#/discover") ||
              hash.startsWith("#/library"))
          ) {
            if (e.key === " ") e.preventDefault(); // Stop native space scroll

            // 1. Programmatically click the Search icon to force React to mount the <input>
            const searchToggleButton =
              document.querySelector(".submit-button-container-MImNa") ||
              document.querySelector(".search-button-RzywM");
            if (searchToggleButton) {
              searchToggleButton.click();
            }

            // 2. Wait a frame for React to mount the actual DOM <input> element before trying to focus it
            setTimeout(() => {
              const searchInput =
                document.querySelector(".search-input-IQ0ZW input") ||
                document.querySelector(".search-bar-container-asfq1 input");

              if (searchInput) {
                searchInput.focus();

                if (e.key === " ") {
                  searchInput.value = searchInput.value + " ";
                  searchInput.dispatchEvent(
                    new Event("input", { bubbles: true }),
                  );
                } else {
                  // Standard keydown usually populates letters natively once focused,
                  // but we append it manually in case React's lifecycle swallowed the primary keystroke.
                  searchInput.value = searchInput.value + e.key;
                  searchInput.dispatchEvent(
                    new Event("input", { bubbles: true }),
                  );
                }
              }
            }, 50);

            // 3. Stop Stremio's native body listeners from processing this keydown further
            e.preventDefault();
            e.stopPropagation();
          }
        },
        { capture: true },
      );
    },

    /**
     * Gamepad Polling & Synthetic Event Translation
     * - Maps Xbox/PlayStation equivalent XInput bindings to Synthetic KeyboardEvents
     * - Our native `enhanceKeyboardNavigation` script flawlessly catches these events as genuine keypresses!
     */
    initGamepad() {
      let isPolling = false;
      let lastButtonPress = 0;
      const COOLDOWN = 140; // milliseconds to prevent hyper-scrolling when holding Axis down

      // Static page list — declared once here, not inside the rAF loop
      const PAGES = [
        "#/",
        "#/discover",
        "#/library",
        "#/calendar",
        "#/addons",
        "#/settings",
      ];

      const pollGamepad = () => {
        if (!isPolling) return;
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        if (!gamepads) return;

        // Take the first connected active gamepad (loop avoids Array.from allocation at 60fps)
        let gp = null;
        for (let i = 0; i < gamepads.length; i++) {
          if (gamepads[i]) {
            gp = gamepads[i];
            break;
          }
        }
        if (!gp) {
          requestAnimationFrame(pollGamepad);
          return;
        }

        const now = Date.now();
        if (now - lastButtonPress < COOLDOWN) {
          requestAnimationFrame(pollGamepad);
          return;
        }

        let keyToDispatch = null;
        let actionToDispatch = null;
        let isAxisMove = false;

        // Button evaluator helper (safeguards cross-browser GamepadButton inconsistencies)
        const isPressed = (b) =>
          typeof b === "object" ? b.pressed : b === 1.0;

        // Map Standard XInput controller layout to Key Strings natively used by our grid router!
        if (isPressed(gp.buttons[12]) || gp.axes[1] < -0.5) {
          keyToDispatch = "ArrowUp";
          isAxisMove = true;
        } else if (isPressed(gp.buttons[13]) || gp.axes[1] > 0.5) {
          keyToDispatch = "ArrowDown";
          isAxisMove = true;
        } else if (isPressed(gp.buttons[14]) || gp.axes[0] < -0.5) {
          keyToDispatch = "ArrowLeft";
          isAxisMove = true;
        } else if (isPressed(gp.buttons[15]) || gp.axes[0] > 0.5) {
          keyToDispatch = "ArrowRight";
          isAxisMove = true;
        } else if (isPressed(gp.buttons[0])) {
          // A
          actionToDispatch = "SIMULATE_CLICK";
        } else if (isPressed(gp.buttons[1])) {
          // B
          actionToDispatch = "HISTORY_BACK";
        } else if (isPressed(gp.buttons[2])) {
          // X
          keyToDispatch = "Tab";
        } else if (isPressed(gp.buttons[3])) {
          // Y
          actionToDispatch = "FORCE_HOME";
        } else if (isPressed(gp.buttons[4])) {
          // L Bumper
          actionToDispatch = "PAGE_CYCLE_PREV";
        } else if (isPressed(gp.buttons[5])) {
          // R Bumper
          actionToDispatch = "PAGE_CYCLE_NEXT";
        } else if (isPressed(gp.buttons[9])) {
          // Start Button
          actionToDispatch = "PLAYER_NEXT_VIDEO";
        } else if (
          window.location.hash.startsWith("#/player") &&
          isPressed(gp.buttons[10])
        ) {
          // L3 (Player-only: toggle Subtitles menu)
          keyToDispatch = "s";
        } else if (
          window.location.hash.startsWith("#/player") &&
          isPressed(gp.buttons[11])
        ) {
          // R3 (Player-only: toggle Audio menu)
          keyToDispatch = "a";
        }

        if (keyToDispatch || actionToDispatch) {
          lastButtonPress = now;
          // Axis: lightly stricter cooldown (COOLDOWN + 40ms).
          // `now + 40` shifts the baseline forward so the next eligible input fires at t+180ms vs t+140ms for buttons.
          if (isAxisMove) lastButtonPress = now + 40;

          if (actionToDispatch === "SIMULATE_CLICK") {
            const activeEl = document.activeElement;

            // Media Control Bypass: If on the Player page, and NOT focused on an interactive UI control button, Play/Pause.
            const isButton =
              activeEl &&
              (activeEl.tagName === "BUTTON" ||
                activeEl.tagName === "A" ||
                parseInt(activeEl.getAttribute("tabindex"), 10) >= 0);

            if (
              window.location.hash.startsWith("#/player") &&
              (!activeEl || activeEl === document.body || !isButton)
            ) {
              // React's internal video state gets desynced if we force HTML5 <video>.play() methods.
              // Instead, we cleanly dispatch the native keyboard Media Key that Stremio intrinsically listens to!
              // MediaPlayPause is the clean, dedicated key Stremio Player listens to.
              // The Space fallback has been removed — dispatching both caused double-toggle.
              document.dispatchEvent(
                new KeyboardEvent("keydown", {
                  key: "MediaPlayPause",
                  code: "MediaPlayPause",
                  keyCode: 179,
                  bubbles: true,
                  cancelable: true,
                }),
              );
              // Cleanly drop through so requestAnimationFrame stays alive!
            } else if (activeEl && activeEl !== document.body) {
              // Continue Watching shortcut: redirect click to the play-icon layer so the
              // last-used stream starts immediately instead of navigating to the detail page.
              const inContinueWatching = activeEl.closest(
                ".continue-watching-row-ZiNSa",
              );
              if (inContinueWatching) {
                const playIcon =
                  activeEl.querySelector(".play-icon-layer-vpQIo") ||
                  activeEl
                    .closest(".meta-item-container-Tj0Ib")
                    ?.querySelector(".play-icon-layer-vpQIo");
                if (playIcon) {
                  playIcon.dispatchEvent(
                    new MouseEvent("mousedown", {
                      bubbles: true,
                      cancelable: true,
                    }),
                  );
                  playIcon.dispatchEvent(
                    new MouseEvent("mouseup", {
                      bubbles: true,
                      cancelable: true,
                    }),
                  );
                  playIcon.click();
                }
              }

              // React ignores programmatic Enter keydowns on non-form elements. Simulating physical mouse interactions natively triggers its internal pointer event states.
              if (!inContinueWatching) {
                activeEl.dispatchEvent(
                  new MouseEvent("mousedown", {
                    bubbles: true,
                    cancelable: true,
                  }),
                );
                activeEl.dispatchEvent(
                  new MouseEvent("mouseup", {
                    bubbles: true,
                    cancelable: true,
                  }),
                );
                activeEl.click();
              }
            } else if (!window.location.hash.startsWith("#/player")) {
              // Cold start: nothing is focused yet. Snap to the first visible grid item
              // without clicking — D-pad then snaps here first, A fires on the next press.
              const firstVisible = Array.from(
                document.querySelectorAll(
                  ".board-content-nPWv1 .meta-item-container-Tj0Ib, .meta-items-container-n8vNz .meta-item-container-Tj0Ib, .meta-items-container-IKrND .meta-item-container-Tj0Ib",
                ),
              ).find((el) => el.getBoundingClientRect().top > 60);
              if (firstVisible) firstVisible.focus();
            }
          } else if (actionToDispatch === "HISTORY_BACK") {
            window.history.back();
          } else if (actionToDispatch === "FORCE_HOME") {
            window.location.hash = "#/";
          } else if (actionToDispatch === "PLAYER_NEXT_VIDEO") {
            if (window.location.hash.startsWith("#/player")) {
              const nextBtn = document.querySelector('div[title="Next Video"]');
              if (nextBtn) {
                nextBtn.dispatchEvent(
                  new MouseEvent("mousedown", {
                    bubbles: true,
                    cancelable: true,
                  }),
                );
                nextBtn.dispatchEvent(
                  new MouseEvent("mouseup", {
                    bubbles: true,
                    cancelable: true,
                  }),
                );
                nextBtn.click();
              }
            }
          } else if (
            actionToDispatch === "PAGE_CYCLE_PREV" ||
            actionToDispatch === "PAGE_CYCLE_NEXT"
          ) {
            const currentHash = window.location.hash;

            let currentIndex = PAGES.findIndex(
              (p) => currentHash === p || currentHash.startsWith(p + "/"),
            );
            if (currentIndex === -1) {
              // Fallback routing inference for edge cases
              if (currentHash.startsWith("#/discover")) currentIndex = 1;
              else if (currentHash.startsWith("#/library")) currentIndex = 2;
              else if (currentHash.startsWith("#/calendar")) currentIndex = 3;
              else if (currentHash.startsWith("#/addons")) currentIndex = 4;
              else if (currentHash.startsWith("#/settings")) currentIndex = 5;
              else currentIndex = 0; // Board fallback
            }

            if (actionToDispatch === "PAGE_CYCLE_PREV") {
              currentIndex = Math.max(0, currentIndex - 1);
            } else {
              currentIndex = Math.min(PAGES.length - 1, currentIndex + 1);
            }

            window.location.hash = PAGES[currentIndex];
          } else if (keyToDispatch) {
            // Map virtual keystrings into perfect physical hardware replicas to bypass React / Mousetrap.js validation
            let kCode = 0;
            let codeStr = "";
            if (keyToDispatch === "Tab") {
              kCode = 9;
              codeStr = "Tab";
            } else if (keyToDispatch === "ArrowUp") {
              kCode = 38;
              codeStr = "ArrowUp";
            } else if (keyToDispatch === "ArrowDown") {
              kCode = 40;
              codeStr = "ArrowDown";
            } else if (keyToDispatch === "ArrowLeft") {
              kCode = 37;
              codeStr = "ArrowLeft";
            } else if (keyToDispatch === "ArrowRight") {
              kCode = 39;
              codeStr = "ArrowRight";
            } else if (keyToDispatch === "s") {
              kCode = 83;
              codeStr = "KeyS";
            } else if (keyToDispatch === "a") {
              kCode = 65;
              codeStr = "KeyA";
            }

            document.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: keyToDispatch,
                code: codeStr,
                keyCode: kCode, // Intentional: Mousetrap.js reads keyCode/which — do not remove
                which: kCode,
                bubbles: true,
                cancelable: true,
                composed: true,
              }),
            );
          }
        }

        requestAnimationFrame(pollGamepad);
      };

      const startPolling = () => {
        if (!isPolling) {
          isPolling = true;
          requestAnimationFrame(pollGamepad);
        }
      };

      window.addEventListener("gamepadconnected", (e) => {
        console.log(`[Kai Navigation] Gamepad connected: ${e.gamepad.id}`);
        startPolling();
      });

      window.addEventListener("gamepaddisconnected", (e) => {
        console.log(`[Kai Navigation] Gamepad disconnected: ${e.gamepad.id}`);
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        const hasGamepad = Array.from(gamepads).some((pad) => pad !== null);
        if (!hasGamepad) isPolling = false;
      });

      // Quick boot check in case the controller was plugged in before script execution
      const initialGamepads = navigator.getGamepads
        ? navigator.getGamepads()
        : [];
      if (Array.from(initialGamepads).some((pad) => pad !== null)) {
        startPolling();
      }
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () =>
      NavigationManager.init(),
    );
  } else {
    NavigationManager.init();
  }
})();
