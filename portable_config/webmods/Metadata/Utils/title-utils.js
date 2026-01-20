/**
 * @name Metadata Helper - Title Utils Module
 * @description Static utility class for title processing and cleaning
 */

// Shared regex patterns
const YEAR_PATTERN = /\s*\(\d{4}\)/g;

// Title Utilities - static class for title processing functions
class TitleUtils {
  /**
   * Converts a string to title case (each word starts with uppercase)
   * @param {string} str - The string to convert
   * @returns {string} The string in title case
   */
  static toTitleCase(str) {
    if (!str) return "";

    // Roman numerals (up to 30) - ensure they stay uppercase
    const romanNumerals = new Set([
      "I",
      "II",
      "III",
      "IV",
      "V",
      "VI",
      "VII",
      "VIII",
      "IX",
      "X",
      "XI",
      "XII",
      "XIII",
      "XIV",
      "XV",
      "XVI",
      "XVII",
      "XVIII",
      "XIX",
      "XX",
      "XXI",
      "XXII",
      "XXIII",
      "XXIV",
      "XXV",
      "XXVI",
      "XXVII",
      "XXVIII",
      "XXIX",
      "XXX",
    ]);

    // Minor words that should be lowercase (unless first/last)
    const minorWords = new Set([
      "a",
      "an",
      "the",
      "and",
      "but",
      "or",
      "for",
      "nor",
      "on",
      "at",
      "to",
      "from",
      "by",
      "with",
      "in",
      "of",
    ]);

    return str
      .toLowerCase()
      .split(" ")
      .map((word, index, arr) => {
        // 1. Handle Roman Numerals (case-insensitive check)
        if (romanNumerals.has(word.toUpperCase())) {
          return word.toUpperCase();
        }

        // 2. Handle Possessives (e.g., "world's" -> "World's", not "World'S")
        // This is handled naturally by the capitalization logic below if we don't capitalize after apostrophe

        // 3. Handle Minor Words
        // Always capitalize first and last word
        if (index === 0 || index === arr.length - 1) {
          return this._capitalizeWord(word);
        }
        if (minorWords.has(word)) {
          return word;
        }

        return this._capitalizeWord(word);
      })
      .join(" ");
  }

  static _capitalizeWord(word) {
    // Handle "word's" or "o'clock" etc.
    // We capitalize the first letter, and then any letter following a hyphen (optional, for compound adjectives)
    // But we explicitly AVOID capitalizing after an apostrophe for possessives
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  /**
   * Cleans a title for search by removing season info, editions, years, etc.
   * Normalizes the title to title case (each word starts with uppercase).
   * @param {string} title - The title to clean
   * @param {boolean} [isAnime=false] - If true, applies aggressive cleaning for anime titles (removes roman numerals and trailing numbers)
   * @returns {string} The cleaned title in title case
   */
  static cleanTitleForSearch(title, isAnime = false) {
    if (!title) return "";

    // Ensure title is a string (handle numbers, objects, etc.)
    if (typeof title !== "string") {
      title = String(title);
    }

    let cleaned = title
      // Season patterns
      .replace(/\s*\d+(?:st|nd|rd|th)\s+season/gi, "")
      .replace(/\s+season\s+\d+/gi, "")
      .replace(/\s+season\s+\w+/gi, "")
      .replace(/\s+(?:final|last|complete|current)\s+season/gi, "")
      // Part/Chapter patterns
      .replace(/\s+part\s+\d+/gi, "")
      .replace(/\s+chapter\s+\d+/gi, "")
      // Edition patterns
      .replace(
        /\s+(?:director'?s?\s+cut|extended\s+edition|special\s+edition|remastered|uncensored|uncut)/gi,
        ""
      )
      // Year patterns (remove years in parentheses)
      .replace(YEAR_PATTERN, "")
      .trim();

    // Aggressive cleaning only for anime titles
    if (isAnime) {
      cleaned = cleaned
        // Roman numerals at end
        .replace(/\s+(II|III|IV|V|VI|VII|VIII|IX|X)\s*$/i, "")
        // Trailing numbers
        .replace(/\s+\d+\s*$/, "")
        .trim();
    }

    return cleaned ? TitleUtils.toTitleCase(cleaned) : "";
  }

  /**
   * Cleans year ranges by removing duplicate years ONLY (e.g., "2025-2025" → "2025")
   * Leaves different years unchanged (e.g., "2020-2025" stays "2020-2025")
   *
   * @param {string} yearInput - Year string from API (may be range like "2020-2025")
   * @returns {string} Cleaned year string
   */
  static cleanYear(yearInput) {
    if (!yearInput || typeof yearInput !== "string") return yearInput;

    // Match year ranges: "2020-2025" or "2020–2025" (en dash)
    const rangeMatch = yearInput.match(/^(\d{4})[-–](\d{4})$/);
    if (rangeMatch) {
      const [_, startYear, endYear] = rangeMatch;
      // ONLY if same year repeated, return single year
      if (startYear === endYear) {
        return startYear;
      }
    }
    return yearInput; // Return unchanged for "2020-2025" or other formats
  }

  /**
   * Extracts year from title and returns cleaned title and year.
   * Only extracts single years like "(2024)", NOT ranges.
   *
   * @param {string} title - The title to process
   * @returns {{cleanedTitle: string, year: string|null}} Object with cleaned title and extracted year
   */
  static extractYearFromTitle(title) {
    if (!title) return { cleanedTitle: "", year: null };

    // Ensure title is a string
    if (typeof title !== "string") {
      title = String(title);
    }

    // Match SINGLE year in parentheses: "Title (2024)" or "Title (2024) Season 2"
    const yearMatch = title.match(/\((\d{4})\)/);
    const year = yearMatch ? yearMatch[1] : null; // Return as string to match Cinemeta format

    // Clean the title by removing the year in parentheses
    const cleanedTitle = title.replace(YEAR_PATTERN, "").trim();

    return { cleanedTitle, year };
  }
}

// ID Utilities - static class for ID management and merging
class IdUtils {
  /**
   * Ensures a value is returned as an array
   * @param {*} value - Value to ensure is array
   * @returns {Array|null} Array of values or null
   */
  static ensureArray(value) {
    if (!value) return null;
    if (Array.isArray(value)) return value;
    return [value];
  }

  /**
   * Merges two ID values/arrays into a single unique array
   * @param {*} existing - Existing value(s)
   * @param {*} incoming - New value(s)
   * @returns {Array|null} Merged unique array or null
   */
  static mergeIdArrays(existing, incoming) {
    // Optimization: Early returns to avoid allocations
    if (!incoming) return existing;
    if (!existing) return this.ensureArray(incoming);

    const existingArr = this.ensureArray(existing) || [];
    const incomingArr = this.ensureArray(incoming) || [];

    if (existingArr.length === 0)
      return incomingArr.length > 0 ? incomingArr : null;
    if (incomingArr.length === 0)
      return existingArr.length > 0 ? existingArr : null;

    // Optimization: Check if merge is needed
    const allExist = incomingArr.every((id) => existingArr.includes(id));
    if (allExist) return existingArr;

    // Merge and deduplicate
    const unique = new Set([...existingArr, ...incomingArr]);
    return Array.from(unique);
  }
}

// Runtime Utilities - static class for runtime parsing and formatting
class RuntimeUtils {
  /**
   * Parses runtime string (e.g., "120 min") and extracts minutes as integer
   *
   * @param {string} runtimeString - Runtime string from API
   * @returns {number|null} Runtime in minutes or null if invalid
   */
  static parse(runtimeString) {
    if (!runtimeString) return null;
    const match = runtimeString.match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  /**
   * Formats runtime minutes into human-readable string
   * Normalizes huge series runtimes (total season duration) by dividing by episode count
   *
   * @param {number} totalMinutes - Total runtime in minutes
   * @param {string} type - Media type ("movie" or "series")
   * @param {number} episodeCount - Number of episodes (default 1)
   * @returns {string|null} Formatted runtime (e.g., "2h 15min") or null if invalid
   */
  static format(totalMinutes, type = "movie", episodeCount = 1) {
    if (!totalMinutes || totalMinutes <= 0) return null;

    let minutes = totalMinutes;

    if (type === "series") {
      // Series: Check for "total season duration" anomaly
      // If runtime > 180min (3h) and we have multiple episodes, likely total duration
      if (minutes > 180 && episodeCount > 1) {
        minutes = Math.round(minutes / episodeCount);
      }
      // Fall through to standard formatting to handle > 60min as Xh Ymin
    }

    // Movies: show as Xh Ymin
    // Movies: show as Xh Ymin only if OVER 60 minutes
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    // Strict check: only switch to hour format if > 60 (so 60 min stays "60 min")
    if (hours > 0 && minutes > 60) {
      return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
    }
    return `${minutes} min`;
  }
}

// Image Utilities - static class for image validation
class ImageUtils {
  /**
   * Tests if an image URL loads successfully
   * Uses the "invisible image" trick with a timeout
   *
   * @param {string} url - Image URL to test
   * @param {number} timeoutMs - Timeout in milliseconds (default 3000)
   * @returns {Promise<boolean>} True if image loads, false otherwise
   */
  static validateUrl(url, timeoutMs = 3000) {
    if (!url) return Promise.resolve(false);

    return new Promise((resolve) => {
      const img = new Image();

      // Safety timeout
      const timer = setTimeout(() => {
        img.onload = null;
        img.onerror = null;
        img.src = ""; // Cancel loading if possible
        resolve(false);
      }, timeoutMs);

      img.onload = () => {
        clearTimeout(timer);
        resolve(true); // Image loaded successfully
      };

      img.onerror = () => {
        clearTimeout(timer);
        resolve(false); // Image failed
      };

      img.src = url;
    });
  }
}

// Scroll Utilities - static class for custom momentum scrolling
class ScrollUtils {
  static CONFIG = {
    SPEED_MULTIPLIER: 0.5, // Global speed configuration
  };

  /**
   * Attaches momentum scrolling to an element (Horizontal Only).
   * Uses linear interpolation for smooth feel and requestAnimationFrame.
   *
   * @param {HTMLElement} element - The element to scroll
   */
  static attachMomentumScroll(element) {
    if (!element) return;

    // Prevent duplicate attachment
    if (element.dataset.hasMomentumScroll) return;
    element.dataset.hasMomentumScroll = "true";

    const speed = ScrollUtils.CONFIG.SPEED_MULTIPLIER;

    // State needs to be closure-scoped per element
    const state = {
      target: element.scrollLeft,
      current: element.scrollLeft,
      isScrolling: false,
    };

    const animate = () => {
      if (!state.isScrolling) return;

      // Lerp (0.1 = friction/smoothness factor)
      state.current += (state.target - state.current) * 0.1;

      element.scrollLeft = state.current;

      // Stop if close enough
      if (Math.abs(state.target - state.current) < 0.5) {
        element.scrollLeft = state.target;
        state.isScrolling = false;
        state.current = state.target;
      } else {
        requestAnimationFrame(animate);
      }
    };

    element.addEventListener(
      "wheel",
      (e) => {
        // Check if scroll is needed (content overflows)
        const maxScroll = element.scrollWidth - element.clientWidth;

        if (maxScroll <= 0) return;

        // Prevent default to take over scrolling
        e.preventDefault();
        e.stopPropagation(); // Stop parent scroll

        // Update Target
        state.target += e.deltaY * speed;
        state.target = Math.max(0, Math.min(state.target, maxScroll));

        // Start animation loop if not running
        if (!state.isScrolling) {
          state.isScrolling = true;
          // Sync current position to handle external interruptions
          state.current = element.scrollLeft;
          requestAnimationFrame(animate);
        }
      },
      { passive: false }
    );
  }
}

// Export to global scope
window.MetadataModules = window.MetadataModules || {};
window.MetadataModules.titleUtils = {
  TitleUtils,
};

window.MetadataModules.idUtils = {
  IdUtils,
};

window.MetadataModules.runtimeUtils = {
  RuntimeUtils,
};

window.MetadataModules.imageUtils = {
  ImageUtils,
};

window.MetadataModules.scrollUtils = {
  ScrollUtils,
};
