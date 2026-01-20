/**
 * @name Donation Manager
 * @description Tracks "unique active days" to determine when to show the donation prompt.
 * Uses a respectful progressive snooze schedule (Day 7 -> +14 -> +30).
 */

(function () {
  "use strict";

  if (window.DonationManager?.initialized) return;

  const KEY_PREFIX = "kai_donate_";
  const KEYS = {
    FIRST_INSTALL: `${KEY_PREFIX}first_install_ts`,
    LAST_ACTIVE: `${KEY_PREFIX}last_active_date`,
    ACTIVE_DAYS: `${KEY_PREFIX}active_days`,
    STATE: `${KEY_PREFIX}state`, // JSON: { shownCount, nextShowTs, dismissed, donated }
  };

  const CONFIG = {
    MIN_DAYS_INSTALLED: 7,
    MIN_ACTIVE_DAYS: 4,
    SNOOZE_SCHEDULE: [
      14 * 24 * 60 * 60 * 1000, // 14 days (Snooze 1)
      30 * 24 * 60 * 60 * 1000, // 30 days (Snooze 2)
    ],
    MAX_SHOWS: 3, // Initial + 2 snoozes
  };

  const DonationManager = {
    init() {
      this.state = this._loadState();
      this._trackActivity();

      // Small delay to let app settle before checking eligibility
      setTimeout(() => this._checkEligibility(), 3000);
    },

    /**
     * Updates activity counters.
     * Only increments "Active Days" if the last recorded date was NOT today.
     */
    _trackActivity() {
      const now = new Date();
      const todayStr = now.toISOString().split("T")[0]; // YYYY-MM-DD

      // 1. First Install
      if (!localStorage.getItem(KEYS.FIRST_INSTALL)) {
        localStorage.setItem(KEYS.FIRST_INSTALL, now.getTime().toString());
      }

      // 2. Daily Active Check
      const lastActive = localStorage.getItem(KEYS.LAST_ACTIVE);
      if (lastActive !== todayStr) {
        let currentDays = parseInt(
          localStorage.getItem(KEYS.ACTIVE_DAYS) || "0",
          10
        );
        currentDays++;
        localStorage.setItem(KEYS.ACTIVE_DAYS, currentDays.toString());
        localStorage.setItem(KEYS.LAST_ACTIVE, todayStr);
        console.log(
          `[DonationManager] New active day recorded! Total: ${currentDays}`
        );
      }
    },

    _loadState() {
      try {
        const raw = localStorage.getItem(KEYS.STATE);
        return raw
          ? JSON.parse(raw)
          : {
              shownCount: 0,
              nextShowTs: 0,
              dismissed: false,
              donated: false,
            };
      } catch (e) {
        return {
          shownCount: 0,
          nextShowTs: 0,
          dismissed: false,
          donated: false,
        };
      }
    },

    _saveState() {
      localStorage.setItem(KEYS.STATE, JSON.stringify(this.state));
    },

    _checkEligibility() {
      // 1. Block conditions
      if (this.state.dismissed || this.state.donated) return;
      if (this.state.shownCount >= CONFIG.MAX_SHOWS) return;

      const now = Date.now();

      // 2. Snooze check
      if (this.state.nextShowTs && now < this.state.nextShowTs) {
        // Still snoozed
        return;
      }

      // 3. Usage Maturity checks
      const installTs = parseInt(
        localStorage.getItem(KEYS.FIRST_INSTALL) || "0",
        10
      );
      const activeDays = parseInt(
        localStorage.getItem(KEYS.ACTIVE_DAYS) || "0",
        10
      );
      const msSinceInstall = now - installTs;
      const daysSinceInstall = msSinceInstall / (1000 * 60 * 60 * 24);

      console.log(
        `[DonationManager] Check: Installed ${daysSinceInstall.toFixed(
          1
        )}d ago, Active ${activeDays}d`
      );

      if (
        daysSinceInstall >= CONFIG.MIN_DAYS_INSTALLED &&
        activeDays >= CONFIG.MIN_ACTIVE_DAYS
      ) {
        this._triggerPrompt();
      }
    },

    _triggerPrompt() {
      console.log("[DonationManager] Implementation triggering prompt...");
      if (
        window.KaiWelcomeWizard &&
        window.KaiWelcomeWizard.showDonationPrompt
      ) {
        window.KaiWelcomeWizard.showDonationPrompt({
          onSupport: () => this.handleSupport(),
          onSnooze: () => this.handleSnooze(),
          onDismiss: () => this.handleDismiss(),
        });
      } else {
        console.warn("[DonationManager] Wizard not ready to show prompt.");
      }
    },

    // --- Actions exposed to UI ---

    handleSupport() {
      console.log("[DonationManager] User supported! Marking as donated.");
      this.state.donated = true;
      this._saveState();
      window.open("https://revolut.me/altcelalalt", "_blank");
    },

    handleSnooze() {
      const scheduleIdx = Math.min(
        this.state.shownCount,
        CONFIG.SNOOZE_SCHEDULE.length - 1
      );
      const snoozeDuration = CONFIG.SNOOZE_SCHEDULE[scheduleIdx];

      this.state.shownCount++;
      this.state.nextShowTs = Date.now() + snoozeDuration;

      console.log(
        `[DonationManager] Snoozed. Count: ${
          this.state.shownCount
        }. Next show in ${(snoozeDuration / 86400000).toFixed(1)} days.`
      );

      if (this.state.shownCount >= CONFIG.MAX_SHOWS) {
        // This was the last chance
        this.state.dismissed = true;
      }

      this._saveState();
    },

    handleDismiss() {
      console.log("[DonationManager] Dismissed forever.");
      this.state.dismissed = true;
      this._saveState();
    },
  };

  window.DonationManager = DonationManager;
  window.DonationManager.initialized = true;

  // Auto-init instructions should ideally be in main bootstrapper,
  // but for reliability in webmods we can self-boot if DOM is ready
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    setTimeout(() => DonationManager.init(), 1000);
  } else {
    window.addEventListener("DOMContentLoaded", () => DonationManager.init());
  }
})();
