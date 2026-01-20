/**
 * @name Metadata Helper - Preferences Module
 * @description Manages user preferences for the metadata system
 * Handles storage, retrieval, and event dispatching for settings
 */

(function () {
  "use strict";

  if (window.MetadataModules?.preferences?.initialized) return;

  window.MetadataModules = window.MetadataModules || {};

  const STORAGE_PREFIX = "kai-pref-";

  // Default values
  const DEFAULTS = {
    language: "en",
    ratings: {
      imdb: true,
      tmdb: true,
      rottenTomatoes: true,
      metacritic: true,
      mal: true,
      trakt: true,
      letterboxd: true,
    },
  };

  class PreferencesManager {
    constructor() {
      this.listeners = new Set();
    }

    _getKey(key) {
      return STORAGE_PREFIX + key;
    }

    /**
     * Get a preference value
     * @param {string} key - Preference key (e.g., 'language')
     * @returns {any} The value or default
     */
    get(key) {
      const storageKey = this._getKey(key);
      const raw = localStorage.getItem(storageKey);

      if (raw === null) {
        return DEFAULTS[key] !== undefined ? DEFAULTS[key] : null;
      }

      try {
        return JSON.parse(raw);
      } catch (e) {
        return raw;
      }
    }

    /**
     * Set a preference value
     * @param {string} key - Preference key
     * @param {any} value - Value to set
     */
    set(key, value) {
      const storageKey = this._getKey(key);
      localStorage.setItem(storageKey, JSON.stringify(value));

      this._notify(key, value);
    }

    /**
     * Update a specific field within an object preference (e.g. toggling a single rating provider)
     * @param {string} parentKey - The main key (e.g., 'ratings')
     * @param {string} field - The field to update (e.g., 'trakt')
     * @param {any} value - The new value
     */
    setSubField(parentKey, field, value) {
      const current = this.get(parentKey) || {};
      const updated = { ...current, [field]: value };
      this.set(parentKey, updated);
    }

    /**
     * Dispatch change event
     */
    _notify(key, value) {
      // Dispatch window event for other modules
      window.dispatchEvent(
        new CustomEvent("kai-pref-changed", {
          detail: { key, value },
        }),
      );
    }
  }

  // Export
  window.MetadataModules.preferences = new PreferencesManager();
  window.MetadataModules.preferences.initialized = true;

  console.log("[Metadata Preferences] Initialized");
})();
