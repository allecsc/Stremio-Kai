/**
 * @name Anime Detection Utility
 * @description Shared utility for determining if content is anime
 * @version 1.0.0
 * @author allecsc
 *
 * Used by:
 *   - mpv-bridge.js (sends detection result to profile-manager.lua)
 *   - metadata-storage.js (triggers Jikan enrichment for anime)
 *
 * Detection Tiers (checked in order):
 *   T1: Demographics (Shounen, Seinen, Josei, Shoujo) - anime-exclusive terms
 *   T2: Japan + Animation/Anime combo - inferential but reliable
 *   T3: Explicit anime IDs (MAL, AniList, Kitsu) - may be incomplete
 */

(function () {
  "use strict";

  // Idempotency Guard
  if (window.AnimeDetection) return;

  class AnimeDetection {
    /**
     * Determines if a database entry is anime content
     * Tier order prioritizes always-available signals over potentially-incomplete ones
     * @param {Object} entry - Database entry from metadataStorage
     * @returns {{ isAnime: boolean, reason: string|null }}
     */
    static detect(entry) {
      if (!entry) return { isAnime: false, reason: null };

      // T1: Demographics (Shounen, Seinen, Josei, Shoujo = anime-exclusive terms)
      // Cheapest check, always populated from Cinemeta/IMDb if available
      if (entry.demographics?.length) {
        return {
          isAnime: true,
          reason: `Demographics: ${entry.demographics[0]}`,
        };
      }

      // T2: Origin + Animation/Anime combo
      // Japan + any animation term = anime by definition
      if (this.isJapanAnimation(entry)) {
        return { isAnime: true, reason: "T2: Japan + Animation" };
      }

      // T3: Explicit anime database IDs (may be incomplete for some titles)
      // Checked last since Vinland Saga-type entries may lack these initially
      if (entry.mal?.length || entry.anilist?.length || entry.kitsu?.length) {
        const malId = entry.mal?.[0];
        return {
          isAnime: true,
          reason: malId ? `DB: MAL ${malId}` : "DB: Anime IDs",
        };
      }

      return { isAnime: false, reason: null };
    }

    /**
     * Checks if entry is Japanese animation
     * Handles: "Animation", "Anime", "Hand-Drawn Animation", "Adult Animation", etc.
     * @param {Object} entry - Database entry
     * @returns {boolean}
     */
    static isJapanAnimation(entry) {
      const origin = entry?.originCountry?.toLowerCase();
      if (origin !== "japan") return false;

      // Check BOTH genres AND interests (may differ)
      const allTerms = [
        ...(entry?.genres || []),
        ...(entry?.interests || []),
      ].map((t) => t.toLowerCase());

      // Match: "animation", "anime", "hand-drawn animation", "adult animation", etc.
      return allTerms.some(
        (t) => t.includes("animation") || t.includes("anime")
      );
    }
  }

  // Expose globally
  window.AnimeDetection = AnimeDetection;

  console.log("[AnimeDetection] Utility loaded");
})();
