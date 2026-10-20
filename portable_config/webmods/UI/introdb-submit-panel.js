/**
 * @name IntroDB Submit Panel
 * @description Player control-bar button and panel for marking intro/recap/outro
 *              timestamps and submitting them to IntroDB
 * @version 1.0.0
 *
 * The panel is a view over notify_skip's state: every action is sent to
 * modules/introdb-submit.lua as "introdb-ui", and Lua publishes the resulting
 * state in user-data/kai/introdb-ui, which mpv-bridge.js lets us observe.
 * The keyboard shortcuts (Alt+[ / Alt+] / Alt+Enter / Alt+i) share the same
 * marks, so both stay in sync.
 *
 * @requires {window.MpvBridge} - sendToMpv / observeMpvProp
 * @requires {window.RouteDetector} - series detection
 */

(function () {
  "use strict";

  if (window.IntroDBPanel?.initialized) return;
  window.IntroDBPanel = { initialized: true };

  const CONFIG = {
    STATE_PROP: "user-data/kai/introdb-ui",
    KEEP_CONTROLS_MS: 500, // well under Stremio's 3s auto-hide
    ENABLED_KEY: "kai-introdb-submit-enabled",
    PLAYER_ROUTE: "#/player",
    NUDGE_SEC: 0.5,
    TYPES: [
      { value: "intro", label: "Intro" },
      { value: "recap", label: "Recap" },
      { value: "outro", label: "Outro" },
    ],
  };

  // Flag with a clock: "mark a moment in time"
  const ICON_SVG = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 21V4"/>
      <path d="M5 4h11l-2 4 2 4H5"/>
      <circle cx="17.5" cy="17.5" r="3.5"/>
      <path d="M17.5 16v1.6l1 .9"/>
    </svg>`;

  const state = {
    button: null,
    panel: null,
    open: false,
    mpvState: null,
    observer: null,
    subscribed: false,
    checkTimer: null,
    keepControlsTimer: null,
    closeSeq: null,
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  function isEnabled() {
    try {
      return localStorage.getItem(CONFIG.ENABLED_KEY) === "true";
    } catch {
      return false;
    }
  }

  function isSeriesPlayer() {
    if (!window.location.hash.startsWith(CONFIG.PLAYER_ROUTE)) return false;
    const route = window.RouteDetector?.getRouteState?.();
    return route?.type === "series";
  }

  function fmtTime(sec) {
    if (typeof sec !== "number" || sec < 0) return "--:--";
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return `${m}:${s.toFixed(1).padStart(4, "0")}`;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
  }

  // "3:34.5" / "1:02:15" / "214.5" -> seconds, or null if unreadable
  function parseTime(text) {
    const value = text.trim().replace(",", ".");
    if (/^\d+(\.\d+)?$/.test(value)) return parseFloat(value);
    const match = value.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
    if (!match) return null;
    const [, h, m, s] = match;
    if (parseFloat(s) >= 60 || (h !== undefined && parseInt(m, 10) >= 60)) return null;
    return (parseInt(h || "0", 10) * 3600) + parseInt(m, 10) * 60 + parseFloat(s);
  }

  function send(action, arg) {
    const args = ["notify_skip", "introdb-ui", action];
    if (arg !== undefined) args.push(String(arg));
    window.MpvBridge?.sendToMpv?.("script-message-to", args);
  }

  // React keeps each element's props on its fiber; the Icon component that
  // renders a control-bar button's <svg> carries props.name ("speed", ...).
  function iconName(button) {
    const svg = button.querySelector("svg");
    if (!svg) return null;
    const fiberKey = Object.keys(svg).find((k) => k.startsWith("__reactFiber$"));
    let fiber = fiberKey ? svg[fiberKey] : null;
    for (let depth = 0; fiber && depth < 6; depth++, fiber = fiber.return) {
      const name = fiber.memoizedProps?.name;
      if (typeof name === "string") return name;
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Control-bar button
  // ─────────────────────────────────────────────────────────────────────────

  function findPlayerContainer() {
    return document.querySelector("[class*='player-container']");
  }

  // Stremio hides the controls 3s after the last mouse move unless the move
  // came from the control bar, which marks it nativeEvent.immersePrevented.
  // Sending a marked move keeps the controls up the way its own menus do.
  function keepControlsVisible() {
    const container = findPlayerContainer();
    if (!container) return;
    const event = new MouseEvent("mousemove", { bubbles: true });
    event.immersePrevented = true;
    container.dispatchEvent(event);
  }

  function findMenuContainer() {
    return document.querySelector(
      "[class*='control-bar-container'] [class*='control-bar-buttons-menu-container']",
    );
  }

  function createButton(template) {
    const button = document.createElement("div");
    button.className = "kai-introdb-button";
    // Borrow Stremio's hashed button/icon classes so it matches the bar
    if (template) {
      template.classList.forEach((c) => c !== "disabled" && button.classList.add(c));
    }
    button.tabIndex = -1;
    button.title = "Submit intro/outro timestamps to IntroDB";
    button.innerHTML = ICON_SVG;
    const templateIcon = template?.querySelector("svg");
    if (templateIcon) {
      templateIcon.classList.forEach((c) => button.querySelector("svg").classList.add(c));
    }
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePanel();
    });
    return button;
  }

  // Insert (or re-insert after a React re-render) just left of the speed button
  function ensureButton() {
    const show = isEnabled() && isSeriesPlayer();
    if (!show) {
      state.button?.remove();
      if (state.open) closePanel();
      return;
    }

    const menu = findMenuContainer();
    if (!menu) return;

    const buttons = Array.from(menu.children).filter((el) => el !== state.button);
    const speed = buttons.find((el) => iconName(el) === "speed");
    // Fallback if fiber lookup fails: the menu's first slot, still left of speed
    const anchor = speed || buttons[0] || null;

    if (!state.button) state.button = createButton(speed || buttons[0]);
    if (state.button.parentNode !== menu || state.button.nextSibling !== anchor) {
      menu.insertBefore(state.button, anchor);
    }
    state.button.classList.toggle("kai-introdb-button-active", state.open);

    // The panel lives inside the player so hovering it counts as being in the
    // player (leaving the player container hides the controls at once)
    const container = findPlayerContainer();
    if (state.panel && container && state.panel.parentNode !== container) {
      container.appendChild(state.panel);
    }
    // One panel at a time, like Stremio's own menus
    if (state.open && document.querySelector("[class*='menu-layer']")) closePanel();
  }

  function scheduleCheck() {
    if (state.checkTimer) return;
    state.checkTimer = setTimeout(() => {
      state.checkTimer = null;
      ensureButton();
    }, 100);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Panel
  // ─────────────────────────────────────────────────────────────────────────

  function createPanel() {
    const panel = document.createElement("div");
    panel.className = "kai-introdb-panel";
    panel.innerHTML = `
      <div class="kai-introdb-header">
        <span class="kai-introdb-title">Submit to IntroDB</span>
        <button class="kai-introdb-close" data-action="close" title="Close">✕</button>
      </div>
      <div class="kai-introdb-types" role="radiogroup">
        ${CONFIG.TYPES.map(
          (t) => `<button class="kai-introdb-type" role="radio" data-action="set-type" data-arg="${t.value}">${t.label}</button>`,
        ).join("")}
      </div>
      ${["start", "end"]
        .map(
          (which) => `
        <div class="kai-introdb-row" data-row="${which}">
          <span class="kai-introdb-row-label">${which === "start" ? "Start" : "End"}</span>
          <input class="kai-introdb-time" data-time="${which}" type="text" inputmode="decimal"
                 spellcheck="false" autocomplete="off" placeholder="m:ss.s"
                 title="Type a time (3:34.5, 1:02:15 or seconds) and press Enter">

          <button class="kai-introdb-nudge" data-action="nudge-${which}" data-arg="-${CONFIG.NUDGE_SEC}" title="Back ${CONFIG.NUDGE_SEC}s">−</button>
          <button class="kai-introdb-nudge" data-action="nudge-${which}" data-arg="${CONFIG.NUDGE_SEC}" title="Forward ${CONFIG.NUDGE_SEC}s">+</button>
          <button class="kai-introdb-preview" data-action="preview-${which}" title="Play from a few seconds before this mark">▶</button>
          <button class="kai-introdb-mark" data-action="mark-${which}">Set to now</button>
        </div>`,
        )
        .join("")}
      <div class="kai-introdb-end-extra">
        <button data-action="end-of-video" title="Set End to the last moment of the episode">Use video end</button>
      </div>
      <div class="kai-introdb-length"></div>
      <div class="kai-introdb-mine" hidden>
        <div class="kai-introdb-mine-title">Saved times for this episode</div>
        <div class="kai-introdb-mine-list"></div>
      </div>
      <div class="kai-introdb-message" aria-live="polite"></div>
      <div class="kai-introdb-actions">
        <button class="kai-introdb-clear" data-action="clear">Clear</button>
        <button class="kai-introdb-submit" data-action="submit">Submit</button>
      </div>
      <div class="kai-introdb-note">Only submit accurate times. IntroDB is shared by everyone.</div>
    `;

    panel.addEventListener("click", (e) => {
      e.stopPropagation();
      const target = e.target.closest("[data-action]");
      if (!target || target.disabled) return;
      target.blur(); // keep Space/Enter going to the player, not this button
      const action = target.dataset.action;
      if (action === "close") return closePanel();
      send(action, target.dataset.arg);
    });
    // Keep the player from treating panel clicks as play/pause or seeks
    ["mousedown", "mouseup", "pointerdown", "dblclick", "wheel"].forEach((type) =>
      panel.addEventListener(type, (e) => e.stopPropagation()),
    );
    // Typed timecodes: Enter or leaving the field applies, Escape reverts
    panel.querySelectorAll(".kai-introdb-time").forEach((input) => {
      const commit = () => {
        const text = input.value.trim();
        const shown = input.dataset.shown || "";
        if (text === shown) return;
        if (text === "") {
          input.value = shown;
          return;
        }
        const sec = parseTime(text);
        if (sec === null) {
          input.classList.add("invalid");
          input.title = "Use m:ss.s, h:mm:ss or seconds";
          return;
        }
        input.classList.remove("invalid");
        send(`set-${input.dataset.time}`, sec.toFixed(3));
      };
      // Keep typing out of the player's shortcuts (Space, arrows, digits, ...)
      ["keydown", "keyup", "keypress"].forEach((type) =>
        input.addEventListener(type, (e) => e.stopPropagation()),
      );
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          commit();
          input.blur();
        } else if (e.key === "Escape") {
          input.value = input.dataset.shown || "";
          input.classList.remove("invalid");
          input.blur();
        }
      });
      input.addEventListener("blur", commit);
      input.addEventListener("input", () => input.classList.remove("invalid"));
    });

    // Moving over the panel counts as moving over the control bar
    ["mousemove", "mouseover"].forEach((type) =>
      panel.addEventListener(type, (e) => {
        e.immersePrevented = true;
      }),
    );

    (findPlayerContainer() || document.body).appendChild(panel);
    return panel;
  }

  function openPanel() {
    if (!state.panel) state.panel = createPanel();
    state.open = true;
    state.panel.classList.add("open");
    state.button?.classList.add("kai-introdb-button-active");
    render();
    send("open"); // Lua picks Intro/Outro from the position and pauses auto-skip
    keepControlsVisible();
    clearInterval(state.keepControlsTimer);
    state.keepControlsTimer = setInterval(keepControlsVisible, CONFIG.KEEP_CONTROLS_MS);
  }

  function closePanel() {
    if (state.open) send("close"); // Lua resumes auto-skip
    state.open = false;
    clearInterval(state.keepControlsTimer);
    state.keepControlsTimer = null;
    state.panel?.classList.remove("open");
    state.button?.classList.remove("kai-introdb-button-active");
  }

  function togglePanel() {
    state.open ? closePanel() : openPanel();
  }

  function render() {
    const panel = state.panel;
    const s = state.mpvState;
    if (!panel || !s) return;

    const unavailable = s.unavailable || "";
    panel.classList.toggle("kai-introdb-unavailable", !!unavailable);

    panel.querySelectorAll(".kai-introdb-type").forEach((btn) => {
      const selected = btn.dataset.arg === s.type;
      btn.classList.toggle("selected", selected);
      btn.setAttribute("aria-checked", String(selected));
    });

    const hasStart = s.start_sec >= 0;
    const hasEnd = s.end_sec >= 0;
    [["start", s.start_sec], ["end", s.end_sec]].forEach(([which, sec]) => {
      const input = panel.querySelector(`[data-time="${which}"]`);
      input.dataset.shown = sec >= 0 ? fmtTime(sec) : "";
      // Don't overwrite what the user is typing
      if (document.activeElement !== input) {
        input.value = input.dataset.shown;
        input.classList.remove("invalid");
      }
    });
    panel.querySelector('[data-time="end"]').disabled = !hasStart;
    const endExtra = panel.querySelector(".kai-introdb-end-extra");
    endExtra.hidden = s.type !== "outro";
    endExtra.querySelector("button").disabled = !hasStart;
    panel.querySelectorAll('[data-row="start"] .kai-introdb-nudge, [data-row="start"] .kai-introdb-preview')
      .forEach((b) => (b.disabled = !hasStart));
    panel.querySelectorAll('[data-row="end"] .kai-introdb-nudge, [data-row="end"] .kai-introdb-preview')
      .forEach((b) => (b.disabled = !hasEnd));
    panel.querySelector('[data-action="mark-end"]').disabled = !hasStart;

    const length = panel.querySelector(".kai-introdb-length");
    const typeLabel = CONFIG.TYPES.find((t) => t.value === s.type)?.label || "Segment";
    if (hasStart && hasEnd) {
      const len = s.end_sec - s.start_sec;
      length.textContent = s.invalid
        ? s.invalid
        : `${typeLabel} length ${len.toFixed(1)}s (allowed ${
            s.type === "intro" ? "5–180s, 300s for Arabic titles" : `${s.min_len}–${s.max_len}s`
          })`;
      length.classList.toggle("error", !!s.invalid);
    } else {
      length.textContent = hasStart
        ? `Now mark where the ${typeLabel.toLowerCase()} ends.`
        : `Pause on the first frame of the ${typeLabel.toLowerCase()} and set Start, or type a time.`;
      length.classList.remove("error");
    }

    // Saved times for this episode: what IntroDB has now ("live", from anyone)
    // and this install's own submissions ("mine"; IntroDB can't list those)
    const asMap = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
    const live = asMap(s.live);
    const mine = asMap(s.mine);
    const same = (a, b) =>
      Math.abs(a.start_sec - b.start_sec) < 0.5 && Math.abs(a.end_sec - b.end_sec) < 0.5;
    const rows = [];
    CONFIG.TYPES.forEach((t) => {
      const l = live[t.value];
      const m = mine[t.value];
      if (l) {
        const count = l.submission_count || 0;
        const meta = [
          "on IntroDB",
          count ? `${count} submission${count === 1 ? "" : "s"}` : "",
          m && same(l, m) ? "includes yours" : "",
        ];
        rows.push({ source: "live", type: t, entry: l, meta });
      }
      if (m && !(l && same(l, m))) {
        const when = m.submitted_at
          ? new Date(m.submitted_at * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })
          : "";
        rows.push({ source: "mine", type: t, entry: m, meta: ["yours", m.status, when] });
      }
    });
    panel.querySelector(".kai-introdb-mine").hidden = rows.length === 0;
    panel.querySelector(".kai-introdb-mine-list").innerHTML = rows
      .map(
        (r) => `<button class="kai-introdb-mine-row" data-action="load" data-arg="${r.source}:${r.type.value}"
                  data-source="${r.source}" title="Load these times to check or correct them">
                  <span class="kai-introdb-mine-type">${r.type.label}</span>
                  <span class="kai-introdb-mine-times">${fmtTime(r.entry.start_sec)} – ${fmtTime(r.entry.end_sec)}</span>
                  <span class="kai-introdb-mine-meta">${escapeHtml(r.meta.filter(Boolean).join(" · "))}</span>
                </button>`,
      )
      .join("");

    const message = panel.querySelector(".kai-introdb-message");
    const text = unavailable || s.message || "";
    message.textContent = text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
    message.dataset.kind = unavailable ? "error" : s.message_kind || "info";

    const submit = panel.querySelector(".kai-introdb-submit");
    submit.disabled = !s.ready || s.submitting || !!unavailable;
    submit.textContent = s.submitting ? "Submitting…" : s.ready ? `Submit ${s.label}` : "Submit";
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  function subscribe() {
    if (state.subscribed) return true;
    if (!window.MpvBridge?.observeMpvProp) return false;
    state.subscribed = true;
    window.MpvBridge.observeMpvProp(CONFIG.STATE_PROP, (value) => {
      if (!value || typeof value !== "object") return;
      // Lua bumps close_seq after a successful submit once playback resumes
      if (state.closeSeq !== null && value.close_seq > state.closeSeq) closePanel();
      state.closeSeq = value.close_seq;
      state.mpvState = value;
      render();
    });
    return true;
  }

  function onRouteChange() {
    if (!window.location.hash.startsWith(CONFIG.PLAYER_ROUTE)) {
      closePanel();
      state.button?.remove();
      state.button = null;
    }
    scheduleCheck();
  }

  function init(retry = 0) {
    if (!subscribe() || !document.body) {
      if (retry < 100) setTimeout(() => init(retry + 1), 100);
      return;
    }

    // A page reload can drop the panel without closing it, so start Lua closed
    send("close");

    state.observer = new MutationObserver(() => {
      if (window.location.hash.startsWith(CONFIG.PLAYER_ROUTE)) scheduleCheck();
    });
    state.observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("hashchange", onRouteChange);
    window.addEventListener("kai-settings-changed", scheduleCheck);
    window.addEventListener("storage", (e) => e.key === CONFIG.ENABLED_KEY && scheduleCheck());
    document.addEventListener("keydown", (e) => {
      // Escape in a time field only reverts that field
      if (e.key === "Escape" && state.open && !e.target.closest?.(".kai-introdb-time")) {
        e.stopPropagation();
        closePanel();
      }
    }, { capture: true });

    scheduleCheck();
  }

  init();
})();
