/**
 * Ratings Utilities - Shared module for rating display across UI components
 * Used by: hover-popup.js, hero-banner/ui.js, show-page-enhancer.js
 *
 * NOTE: This module generates HTML with CSS class names. All styling must be in CSS files.
 * - hover-popup.css for .metadata-popup-rating-* classes
 * - HeroBanner.css for .hero-rating-* classes
 */

(function () {
  "use strict";

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ═══════════════════════════════════════════════════════════════════════════

  const LOGOS = {
    imdb: "https://upload.wikimedia.org/wikipedia/commons/5/57/IMDb_Logo_Rectangle.svg",
    mal: "https://upload.wikimedia.org/wikipedia/commons/9/9b/MyAnimeList_favicon.svg",
    letterboxd:
      "https://a.ltrbxd.com/logos/letterboxd-decal-dots-neg-rgb-500px.png",
    mdblist: "https://mdblist.com/static/mdblist_logo.png",
    metacritic:
      "https://upload.wikimedia.org/wikipedia/commons/f/f2/Metacritic_M.png",
    rtFresh:
      "https://upload.wikimedia.org/wikipedia/commons/5/5b/Rotten_Tomatoes.svg",
    rtRotten:
      "https://upload.wikimedia.org/wikipedia/commons/5/52/Rotten_Tomatoes_rotten.svg",
    rtAudienceFresh:
      "https://upload.wikimedia.org/wikipedia/commons/d/da/Rotten_Tomatoes_positive_audience.svg",
    rtAudienceRotten:
      "https://upload.wikimedia.org/wikipedia/commons/6/63/Rotten_Tomatoes_negative_audience.svg",
    tmdb: "https://www.themoviedb.org/assets/2/v4/logos/v2/blue_square_2-d537fb228cf3ded904ef09b136fe3fec72548ebc1fea3fbbd1ad9e36364db38b.svg",
  };

  // Trakt inline SVG
  const TRAKT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="rating-logo trakt-logo"><path fill="#DE2318" d="M19.178 18.464a9.654 9.654 0 0 0 2.484-6.466c0-3.885-2.287-7.215-5.568-8.76l-6.089 6.076 9.173 9.15zm-6.83-7.393v-.008l-.678-.676 4.788-4.79.679.689-4.789 4.785zm3.863-7.265.677.682-5.517 5.517-.68-.679 5.52-5.52zM4.89 18.531A9.601 9.601 0 0 0 12 21.644a9.618 9.618 0 0 0 4.027-.876l-6.697-6.68-4.44 4.443z"></path><path fill="#DE2318" d="M12 24c6.615 0 12-5.385 12-12S18.615 0 12 0 0 5.385 0 12s5.385 12 12 12zm0-22.789c5.95 0 10.79 4.839 10.79 10.789S17.95 22.79 12 22.79 1.211 17.95 1.211 12 6.05 1.211 12 1.211z"></path><path fill="#DE2318" d="m4.276 17.801 5.056-5.055.359.329 7.245 7.245a3.31 3.31 0 0 0 .42-.266L9.33 12.05l-4.854 4.855-.679-.679 5.535-5.535.359.331 8.46 8.437c.135-.1.255-.215.375-.316L9.39 10.027l-.083.015-.006-.007-5.074 5.055-.679-.68L15.115 2.849A9.756 9.756 0 0 0 12 2.34C6.663 2.337 2.337 6.663 2.337 12c0 2.172.713 4.178 1.939 5.801z"></path></svg>`;

  // Roger Ebert inline SVG
  const ROGEREBERT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" class="rating-logo rogerebert-logo"><path d="M45.9097 18.878c-1.0898-.5919-3.6657-.7892-8.4212-.592h-.2973c-1.4861 0-2.8731.1973-3.8638.2959h-.0991c-.1981 0-.4953 0-.6935.0987.1982-.7893.4954-1.8744.8917-3.2556.6935-2.9595.3963-4.5379.1981-6.0178-.099-.2959-.099-.5919-.099-.9865-.1981-1.973-1.1889-4.6366-1.8824-5.919-.9908-1.7757-3.5667-2.0717-3.8639-2.0717-.5944-.0986-1.6842-.0986-2.1796.6906-.1981.2959-.2972.8879-.3963 2.3676v.1973c-.099 0-.099.3946-.099.9865v1.0852c0 .9865-.099 2.1704-.099 2.9596-.099 1.677-1.2879 3.946-1.6842 4.6366-.3963.6906-1.5851 2.3677-2.3777 3.5515-.4954.6905-.9907 1.381-1.1889 1.7756-.7926 1.2825-2.4768 1.3812-2.675 1.3812-.099 0-.1981.0986-.1981.0986-.099.0987-.099.1973-.099.1973l.099.9865s0 .1973.099.2959c0 0 .099.0987.2972.0987 1.0898-.0987 2.9722-.4932 4.0621-2.269.1981-.2959.5944-.8879 1.0898-1.4798l.0991-.1973c.8916-1.2825 2.0014-2.8609 2.4968-3.6501.6935-1.1839 1.7833-3.4528 1.8824-5.3263 0-.7892.099-1.8744.099-2.7622v-.6905c0-.7892.0991-1.4798.0991-1.677v-.1973c0-.6906.0991-1.1839.0991-1.381.099 0 .2972 0 .5944 0 .3963 0 1.8824.296 2.2787 1.0852.6935 1.1838 1.4861 3.5515 1.6842 5.3263 0 .2959.099.5919.099.8878v.1973c.1982 1.3812.4954 2.7623-.1981 5.4259-.7926 3.1569-1.0898 3.8474-1.1889 4.0447-.099.2959-.099.6906.099.8879.3962.5919.8916.4932 2.873.296 1.0898-.0987 2.3777-.1973 3.7647-.2959h.2973c5.7462-.1973 7.1332.1973 7.4304.3945.8916.4933 1.288.7893.8916 2.3677l-.2972.9865c-.099.2959-.2881.4933-.4863.5919-.297.1973-.7924.1973-1.684.1973h-1.4861c-.2972 0-.5944.0986-.7926.296-.1981.1973-.1981.3946-.2972.6906 0 .0986-.099.0986-.099.1973-.0991.1973-.0991.296 0 .3946.099.0987.2972.1973.3963.1973.4953 0 1.387 0 2.2787 0 1.0898 0 1.8823-.0986 2.4768-.3946 0 0 .1981-.0986.5944-.3946.2972-.296.6935-.9865.9907-1.7757 0 0 0-.0986 0-.1973 0-.0987.099-.296.099-.296v-.0987c.5944-2.467-.1982-3.4534-1.5852-4.2427z" fill="#B99B68"/><path d="M44.0271 32.1959c-.1981 0-.6935.1973-.9907.296-.1981.0986-.2972.2959-.3963.4932-.099.1973-.099.2959-.099.3946 0 .0987-.099.296-.099.4933 0 .0987-.0991.1973-.0991.296l-.099.2959c-.2972.6906-.5944.8879-2.1796.8879h-.1981c-.3963 0-.8917 0-1.287 0-.1982 0-.5945 0-.7926.296-.1982.1973-.1982.3946-.2972.6905 0 .0987-.099.0987-.099.1973-.0991.1973-.0991.2959 0 .3946.099.0987.2972.1973.3963.1973.4953 0 1.387 0 2.2786 0 2.2787 0 3.2694-.4933 3.8639-2.0717.1981-.3946.2972-.789.3963-1.2823.099-.1973.1981-.4932.2972-.789 0-.1973.099-.3946 0-.4933-.1981-.3946-.3963-.3946-.5944-.2959z" fill="#B99B68"/><path d="M41.8478 37.5232h-.1982-.099-.099c-.2972 0-.4954.0986-.6935.1973-.0991.0986-.2972.296-.4954.6906v.0986c-1.0898 1.973-1.6842 2.269-2.2787 2.4663h-.099c-1.3871.5919-4.5574.6906-7.0342.1973-.4954-.0987-1.0898-.1973-1.6842-.296-2.1796-.3946-4.3592-.789-5.6471-.5917l-5.2509.789s-.099 0-.1981.0987c-.099.0987-.099.1973-.099.3946 0 0 0 .5919.099.8878 0 .0987.099.1973.099.296.099.0987.2972 0 .2972 0l5.3499-.789c1.0898-.1973 3.2694.1973 5.1518.5919.5944.0987 1.0898.1973 1.6842.296 1.0898.1973 2.3777.296 3.5666.296 1.8823 0 3.4675-.1973 4.458-.5919 1.1889-.4932 2.1796-1.0852 3.6657-4.3407.1982-.296.1982-.4932.099-.6905-.099 0-.3962 0-.5944 0z" fill="#B99B68"/><path d="M45.8113 26.8689c-.1982 0-.6935.1973-.9908.2959-.1981.0987-.2972.296-.2972.3946-.099.1973-.099.2959-.099.3946 0 .0986-.099.296-.099.4932v.0987c0 .0986-.0991.1973-.0991.1973l-.2972.296c-.1981.3946-.2972.5919-.5944.6906-.2972.0986-.8917.1973-1.5851.1973-.4954 0-.9907 0-1.4861 0-.1981 0-.3962 0-.5944.1973-.099.0987-.1981.0986-.1981.1973-.1981.1973-.1981.3946-.2972.6906 0 .0986-.0991.0986-.0991.1973-.099.1973-.099.2959 0 .3946.099.0986.2972.1973.3963.1973.4953 0 1.3869 0 2.2786 0 1.1888 0 1.9814-.1973 2.5759-.4932.5944-.296.9907-.789 1.288-1.677.1981-.3946.2972-.8879.4954-1.2825.099-.1973.1981-.4932.1981-.6906.099-.1973.099-.3946 0-.4932-.1981-.3946-.3963-.3946-.4954-.2959z" fill="#B99B68"/><path d="M14.8998 20.4565c0-.4933-.3963-.789-.8917-.789h-4.3604c-.099 0-.2972 0-.3963.0987-.099.0986 0 .296 0 .3946 0 .0986.099.0986.099.1973.099.1973.1981.3946.2972.5919.1981.296.6935.296.8916.296h2.3777c.1981 0 .1981 0 .1981.0987l.5944 8.9773c0 .0986 0 .1973 0 .2959 0 .1973 0 .1973-.099.1973h-2.7741c-.099 0-.2881 0-.3872.0986-.099.0987 0 .296 0 .3946 0 .0987.099.0987.099.1973.099.1973.1981.3946.2972.6906.1981.296.5944.296.8916.296h1.8823c.1982 0 .2972 0 .2972.0987l.5944 9.1746c0 .1973 0 .1973-.099.1973h-3.9639s-.1981 0-.2972 0c-.1981 0-1.0898-.0987-1.2879-.8879-.099-.296-.099-.9865-.1981-1.1838 0 0-.1981-2.9596-.2972-4.5379 0-.296 0-.4933-.099-.789v-.1973-.0987c-.099-.9865-.3872-1.5784-.9816-2.1703-.1982-.0987-.3963-.296-.5944-.3946.6935-.5919.9907-1.0852 1.1888-1.7757.1982-.6906.099-2.3677.099-2.4663l-.1981-4.242c0-.0987-.099-.9865-.1981-1.4798-.3963-1.7757-2.2787-2.1703-2.9722-2.1703h-3.7646c-.1982 0-.4954.0987-.5945.2959-.1981.1973-.2972.3946-.1981.5919l1.2879 22.5912c0 .4933.3962.789.8916.789h2.774c.099 0 .2881 0 .3872-.0987.099-.0986 0-.296 0-.3946 0-.0986 0-.0986-.099-.1973-.099-.1973-.1981-.3946-.2972-.6905-.1981-.296-.6935-.296-.8917-.296h-.7925c-.2972 0-.2972 0-.2972-.0987l-1.2879-20.6182h2.6749s1.0898 0 1.288.8879c.099.296.099 1.0852.1982 1.1838 0 0 .099 2.1704.1981 4.1434.1981 2.3677-.1982 2.6636-.3963 2.861-.3963.3946-.6935.6906-.8916.789-.1982.0987-.3963.1973-.4954.296-.099 0-.1981.0987-.1981.0987s-.099.0986-.099.1973c0 .0986.099.1973.4954.3946.2972.0986.5944.296 1.1888.6906.1982.0986.3963.296.5945.5918 0 0 0 .0987.099.0987-.099 0-.099.0986-.099.1973.1981.4932.2972.9865.2972 1.5784 0 .0987 0 .296 0 .3946l.2972 4.3407c0 .296.099.9866.1981 1.4798.3963 1.7757 2.2787 2.1703 2.9722 2.1703h5.35c.1982 0 .4954-.0986.5945-.2959.1981-.1973.2972-.3946.1981-.5919l-1.2879-22.4926z" fill="#B99B68"/></svg>`;

  // Letterboxd inline SVG (dots logo)
  const LETTERBOXD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="61 180 378 140" class="rating-logo letterboxd-logo"><g fill="none" fill-rule="evenodd"><ellipse fill="#00E054" cx="250" cy="249.97" rx="70.08" ry="69.97"/><ellipse fill="#40BCF4" cx="368" cy="249.97" rx="70.08" ry="69.97"/><ellipse fill="#FF8000" cx="131.08" cy="249.97" rx="70.08" ry="69.97"/><path d="M190.54 287.02c-6.73-10.74-10.62-23.44-10.62-37.05 0-13.6 3.89-26.3 10.62-37.05 6.73 10.74 10.62 23.44 10.62 37.05 0 13.6-3.89 26.3-10.62 37.05z" fill="#FFF"/><path d="M309.46 212.92c6.73 10.74 10.62 23.44 10.62 37.05 0 13.6-3.89 26.3-10.62 37.05-6.73-10.74-10.62-23.44-10.62-37.05 0-13.6 3.89-26.3 10.62-37.05z" fill="#FFF"/></g></svg>`;

  // ═══════════════════════════════════════════════════════════════════════════
  // COLOR HELPERS (for dynamic values CSS can't compute)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Calculate IMDb rating color (gold gradient based on score)
   * This MUST be inline because the color is computed from the score value.
   */
  function getIMDbColor(rating) {
    if (!rating || rating < 0) return "rgb(108, 108, 108)";
    const numRating = parseFloat(rating);

    if (numRating >= 9.0) return "rgb(245, 197, 24)";
    if (numRating >= 7.0) {
      const progress = (9.0 - numRating) / 2.0;
      const s = 85 - progress * 35;
      const l = 50 - progress * 5;
      return hslToRgb(45, s, l);
    }
    if (numRating >= 5.0) {
      const progress = (7.0 - numRating) / 2.0;
      const s = 50 - progress * 40;
      const l = 45 - progress * 10;
      return hslToRgb(45, s, l);
    }
    if (numRating >= 3.0) {
      const progress = (5.0 - numRating) / 2.0;
      const greyValue = 184 - progress * 38;
      return `rgb(${Math.round(greyValue)}, ${Math.round(
        greyValue,
      )}, ${Math.round(greyValue)})`;
    }
    const greyValue = Math.max(108, 146 - (3.0 - numRating) * 19);
    return `rgb(${Math.round(greyValue)}, ${Math.round(
      greyValue,
    )}, ${Math.round(greyValue)})`;
  }

  function hslToRgb(h, s, l) {
    h /= 360;
    s /= 100;
    l /= 100;
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(
      b * 255,
    )})`;
  }

  /**
   * Get MDBList score class (for CSS color)
   */
  function getMDBListClass(score) {
    if (score >= 90) return "mdblist-excellent";
    if (score >= 80) return "mdblist-great";
    if (score >= 60) return "mdblist-good";
    if (score >= 40) return "mdblist-mixed";
    return "mdblist-bad";
  }

  /**
   * Metacritic color class
   */
  function getMetacriticClass(score) {
    const s = parseInt(score, 10);
    if (s >= 60) return "metacritic-high";
    if (s >= 40) return "metacritic-medium";
    return "metacritic-low";
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN RATINGS HTML GENERATOR
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate ratings HTML section
   * All styling is via CSS classes - only IMDb uses inline style for dynamic color.
   *
   * @param {Object} metadata - Metadata object with ratings
   * @param {Object} opts - Options
   * @param {string} opts.prefix - CSS class prefix ('metadata-popup-rating' or 'hero-rating')
   * @param {string} opts.containerClass - Container CSS class
   * @returns {string} HTML string
   */
  function createRatingsHTML(metadata, opts = {}) {
    const prefix = opts.prefix || "metadata-popup-rating";
    const containerClass = opts.containerClass || "metadata-popup-ratings";

    // Get User Preferences (Default to true if module missing or key undefined)
    const prefs = window.MetadataModules?.preferences?.get("ratings") || {};
    const show = (key) => prefs[key] !== false;

    let html = `<div class="${containerClass}">`;
    let hasRatings = false;

    // Helper to get rating value (unified ratings object format only)
    const getRating = (source) => metadata.ratings?.[source]?.score ?? null;

    // Helper to get vote count
    const getVotes = (source) => metadata.ratings?.[source]?.votes ?? null;

    // Helper to format vote count for tooltip
    const formatVotesTooltip = (sourceName, votes) => {
      if (votes == null || votes === 0) return sourceName;
      const formatted =
        votes >= 1000000
          ? `${(votes / 1000000).toFixed(1)}M`
          : votes >= 1000
            ? `${(votes / 1000).toFixed(1)}K`
            : votes.toLocaleString();
      return `${sourceName} • ${formatted} Votes`;
    };

    // ─────────────────────────────────────────────────────────────────────────
    // PRIORITY 1: IMDb (always first)
    // NOTE: IMDb color is dynamic, MUST use inline style
    // ─────────────────────────────────────────────────────────────────────────
    const imdbRating = getRating("imdb");
    const imdbVotes = getVotes("imdb");
    if (show("imdb") && imdbRating != null && metadata.imdb) {
      hasRatings = true;
      const imdbColor = getIMDbColor(imdbRating);
      const imdbTooltip = formatVotesTooltip("IMDb", imdbVotes);
      html += `
        <button class="${prefix}-item" onclick="event.stopPropagation(); window.open('https://www.imdb.com/title/${
          metadata.imdb
        }/', '_blank')" title="${imdbTooltip}">
          <img src="${
            LOGOS.imdb
          }" class="${prefix}-logo" alt="IMDb" decoding="async">
          <span class="${prefix}-imdb" style="color: ${imdbColor};">${Number(
            imdbRating,
          ).toFixed(1)}</span>
        </button>`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIORITY 2: MAL (second for anime)
    // ─────────────────────────────────────────────────────────────────────────
    const malRating = getRating("mal");
    const malVotes = getVotes("mal");
    if (show("mal") && (malRating != null || metadata.rankMal)) {
      hasRatings = true;
      const malId =
        metadata.malId ||
        (Array.isArray(metadata.mal) ? metadata.mal[0] : metadata.mal);
      const malUrl =
        metadata.malUrl ||
        (malId ? `https://myanimelist.net/anime/${malId}` : null);
      const malTooltip = formatVotesTooltip("MyAnimeList", malVotes);

      if (malUrl) {
        html += `<button class="${prefix}-item" onclick="event.stopPropagation(); window.open('${malUrl}', '_blank')" title="${malTooltip}">`;
      } else {
        html += `<div class="${prefix}-item" title="${malTooltip}">`;
      }

      if (malRating != null) {
        html += `
          <img src="${
            LOGOS.mal
          }" class="${prefix}-logo" alt="MAL" decoding="async">
          <span class="${prefix}-mal">${Number(malRating).toFixed(2)}</span>`;
      }
      if (metadata.rankMal) {
        html += `
          <span class="${prefix}-rank-wrapper">
            <span class="${prefix}-rank-icon">🏆</span>
            <span class="${prefix}-rank">#${metadata.rankMal}</span>
          </span>`;
      }
      html += malUrl ? "</button>" : "</div>";
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIORITY 3: MDBList Score (aggregate of all ratings)
    // ─────────────────────────────────────────────────────────────────────────
    const mdbRating = metadata.ratings?.mdblist?.score;
    if (show("mdblist") && mdbRating != null) {
      hasRatings = true;
      const mdbClass = getMDBListClass(mdbRating);
      html += `
        <button class="${prefix}-item" onclick="event.stopPropagation(); window.open('https://mdblist.com/', '_blank')" title="MDBList Score">
          <img src="${LOGOS.mdblist}" class="${prefix}-logo mdblist-logo" alt="MDBList" decoding="async">
          <span class="${prefix}-mdblist ${mdbClass}">${mdbRating}</span>
        </button>`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIORITY 4: Rotten Tomatoes Critics
    // ─────────────────────────────────────────────────────────────────────────
    const rtRating = metadata.ratings?.rottenTomatoes?.score;
    const rtVotes = getVotes("rottenTomatoes");
    if (show("rottenTomatoes") && rtRating != null) {
      hasRatings = true;
      const isFresh = rtRating >= 60;
      const rtTooltip = formatVotesTooltip("Rotten Tomatoes Critics", rtVotes);
      html += `
        <button class="${prefix}-item" onclick="event.stopPropagation(); window.open('https://www.rottentomatoes.com/', '_blank')" title="${rtTooltip}">
          <img src="${
            isFresh ? LOGOS.rtFresh : LOGOS.rtRotten
          }" class="${prefix}-logo" alt="RT" decoding="async">
          <span class="${prefix}-rt ${
            isFresh ? "rt-fresh" : "rt-rotten"
          }">${rtRating}%</span>
        </button>`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIORITY 5: Rotten Tomatoes Audience
    // ─────────────────────────────────────────────────────────────────────────
    const rtaRating = metadata.ratings?.rottenTomatoesAudience?.score;
    const rtaVotes = getVotes("rottenTomatoesAudience");
    if (show("rottenTomatoesAudience") && rtaRating != null) {
      hasRatings = true;
      const isLiked = rtaRating >= 60;
      const rtaTooltip = formatVotesTooltip(
        "Rotten Tomatoes Audience",
        rtaVotes,
      );
      html += `
        <button class="${prefix}-item" onclick="event.stopPropagation(); window.open('https://www.rottentomatoes.com/', '_blank')" title="${rtaTooltip}">
          <img src="${
            isLiked ? LOGOS.rtAudienceFresh : LOGOS.rtAudienceRotten
          }" class="${prefix}-logo" alt="RT Audience" decoding="async">
          <span class="${prefix}-rt ${
            isLiked ? "rt-fresh" : "rt-rotten"
          }">${rtaRating}%</span>
        </button>`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIORITY 6: TMDB
    // ─────────────────────────────────────────────────────────────────────────
    const tmdbRating = metadata.ratings?.tmdb?.score;
    const tmdbVotes = getVotes("tmdb");
    if (show("tmdb") && tmdbRating != null) {
      hasRatings = true;
      const tmdbTooltip = formatVotesTooltip("TMDB", tmdbVotes);
      // Determine TMDB type (movie or tv) and build direct URL
      const tmdbType = metadata.type === "series" ? "tv" : "movie";
      const tmdbId = metadata.tmdb;
      const tmdbUrl = tmdbId
        ? `https://www.themoviedb.org/${tmdbType}/${tmdbId}`
        : "https://www.themoviedb.org/";
      html += `
        <button class="${prefix}-item" onclick="event.stopPropagation(); window.open('${tmdbUrl}', '_blank')" title="${tmdbTooltip}">
          <img src="${LOGOS.tmdb}" class="${prefix}-logo tmdb-logo" alt="TMDB" decoding="async">
          <span class="${prefix}-tmdb">${tmdbRating}%</span>
        </button>`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIORITY 7: Metacritic
    // ─────────────────────────────────────────────────────────────────────────
    const metacriticScore = getRating("metacritic", "ratingsMetacritic");
    if (show("metacritic") && metacriticScore != null) {
      hasRatings = true;
      const metaType = metadata.type === "series" ? "tv" : "movie";
      const titleSlug = (metadata.extractedTitle || metadata.title || "")
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();
      const metaUrl = `https://www.metacritic.com/${metaType}/${titleSlug}/`;
      const colorClass = getMetacriticClass(metacriticScore);

      const metacriticVotes = getVotes("metacritic");
      const metacriticTooltip = formatVotesTooltip(
        "Metacritic",
        metacriticVotes,
      );
      html += `
        <button class="${prefix}-item" onclick="event.stopPropagation(); window.open('${metaUrl}', '_blank')" title="${metacriticTooltip}">
          <img src="${LOGOS.metacritic}" class="${prefix}-logo" alt="Metacritic" decoding="async">
          <span class="${prefix}-metacritic ${colorClass}">${metacriticScore}</span>
        </button>`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIORITY 8: Letterboxd
    // ─────────────────────────────────────────────────────────────────────────
    const lbRating = metadata.ratings?.letterboxd?.score;
    const lbVotes = getVotes("letterboxd");
    if (show("letterboxd") && lbRating != null) {
      hasRatings = true;
      const svgWithPrefix = LETTERBOXD_SVG.replace(
        /class="rating-logo/g,
        `class="${prefix}-logo`,
      );
      const lbTooltip = formatVotesTooltip("Letterboxd", lbVotes);
      html += `
        <button class="${prefix}-item" onclick="event.stopPropagation(); window.open('https://letterboxd.com/', '_blank')" title="${lbTooltip}">
          ${svgWithPrefix}
          <span class="${prefix}-letterboxd">${Number(lbRating).toFixed(
            1,
          )}</span>
        </button>`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIORITY 9: Trakt
    // ─────────────────────────────────────────────────────────────────────────
    const traktRating = metadata.ratings?.trakt?.score;
    const traktVotes = getVotes("trakt");
    if (show("trakt") && traktRating != null) {
      hasRatings = true;
      const svgWithPrefix = TRAKT_SVG.replace(
        /class="rating-logo/g,
        `class="${prefix}-logo`,
      );
      const traktTooltip = formatVotesTooltip("Trakt", traktVotes);
      html += `
        <button class="${prefix}-item" onclick="event.stopPropagation(); window.open('https://trakt.tv/', '_blank')" title="${traktTooltip}">
          ${svgWithPrefix}
          <span class="${prefix}-trakt">${traktRating}%</span>
        </button>`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIORITY 10: Roger Ebert (last, niche)
    // ─────────────────────────────────────────────────────────────────────────
    const reRating = metadata.ratings?.rogerebert?.score;
    const reVotes = getVotes("rogerebert");
    if (show("rogerebert") && reRating != null) {
      hasRatings = true;
      const svgWithPrefix = ROGEREBERT_SVG.replace(
        /class="rating-logo/g,
        `class="${prefix}-logo`,
      );
      const reTooltip = formatVotesTooltip("Roger Ebert", reVotes);
      html += `
        <button class="${prefix}-item" onclick="event.stopPropagation(); window.open('https://www.rogerebert.com/', '_blank')" title="${reTooltip}">
          ${svgWithPrefix}
          <span class="${prefix}-rogerebert">${reRating.toFixed(1)}</span>
        </button>`;
    }

    html += "</div>";
    return hasRatings ? html : "";
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTENT RATING DEFINITIONS
  // ═══════════════════════════════════════════════════════════════════════════

  // Raw data from user
  const RAW_RATINGS = {
    US: [
      {
        certification: "TR-Y",
        meaning: "This program is designed to be appropriate for all children.",
      },
      {
        certification: "TV-Y",
        meaning: "This program is designed to be appropriate for all children.",
      },
      {
        certification: "TV-Y7",
        meaning: "This program is designed for children age 7 and above.",
      },
      {
        certification: "G",
        meaning:
          "All ages admitted. There is no content that would be objectionable to most parents.",
      },
      {
        certification: "TV-G",
        meaning: "Most parents would find this program suitable for all ages.",
      },
      {
        certification: "PG",
        meaning: "Some material may not be suitable for children under 10.",
      },
      {
        certification: "TV-PG",
        meaning:
          "This program contains material that parents may find unsuitable for younger children.",
      },
      {
        certification: "PG-13",
        meaning: "Some material may be inappropriate for children under 13.",
      },
      {
        certification: "TV-14",
        meaning:
          "This program contains some material that many parents would find unsuitable for children under 14 years of age.",
      },
      {
        certification: "R",
        meaning:
          "Under 17 requires accompanying parent or adult guardian 21 or older.",
      },
      {
        certification: "NC-17",
        meaning:
          "These films contain excessive graphic violence, intense or explicit sex, depraved, abhorrent behavior, explicit drug abuse.",
      },
      {
        certification: "TV-MA",
        meaning:
          "This program is specifically designed to be viewed by adults and therefore may be unsuitable for children under 17.",
      },
      { certification: "NR", meaning: "No rating information." },
    ],
    GB: [
      {
        certification: "U",
        meaning:
          "Universal. A U film should be suitable for audiences aged four years and over.",
      },
      {
        certification: "PG",
        meaning:
          "Parental Guidance. Suitable for general viewing, but some scenes may be unsuitable for young children.",
      },
      {
        certification: "12A",
        meaning:
          "Generally not suitable for children aged under 12. Requires adult accompaniment.",
      },
      {
        certification: "12",
        meaning: "Not generally suitable for children aged under 12.",
      },
      {
        certification: "15",
        meaning: "No-one under 15 is allowed to see a 15 film at the cinema.",
      },
      {
        certification: "18",
        meaning: "Films rated 18 are for adults. No-one under 18 is allowed.",
      },
      {
        certification: "R18",
        meaning:
          "Special classification for explicit works, restricted to licensed adult cinemas.",
      },
    ],
    CA: [
      { certification: "G", meaning: "Suitable for general audiences." },
      {
        certification: "PG",
        meaning: "Parental guidance. Moderate violence and profanity allowed.",
      },
      {
        certification: "14+",
        meaning: "Programming intended for viewers ages 14 and older.",
      },
      {
        certification: "18+",
        meaning: "Programming intended for viewers ages 18 and older.",
      },
      {
        certification: "C",
        meaning: "Programming suitable for children ages of 2–7 years.",
      },
      { certification: "C8", meaning: "Suitable for children ages 8+." },
      {
        certification: "Exempt",
        meaning: "Shows which are exempt from ratings.",
      },
      { certification: "R", meaning: "Restricted to 18 years and over." },
      {
        certification: "A",
        meaning: "Admittance restricted to people 18 years of age or older.",
      },
      { certification: "E", meaning: "Exempt." },
    ],
    AU: [
      { certification: "E", meaning: "Exempt from classification." },
      {
        certification: "G",
        meaning: "General exhibition; all ages are permitted.",
      },
      {
        certification: "PG",
        meaning: "Parental guidance is recommended for young viewers.",
      },
      { certification: "M", meaning: "Recommended for mature audiences." },
      {
        certification: "MA 15+",
        meaning: "Not suitable for children and teens under 15.",
      },
      {
        certification: "AV 15+",
        meaning:
          "Not suitable for children and teens under 15. Strong violence.",
      },
      {
        certification: "R 18+",
        meaning: "Not for children under 18; restricted to adults.",
      },
      {
        certification: "X 18+",
        meaning: "Restricted to 18 years and over. Pornographic content.",
      },
      { certification: "RC", meaning: "Refused Classification. Banned." },
      { certification: "P", meaning: "Preschool children." },
      { certification: "C", meaning: "Children." },
    ],
    DE: [
      { certification: "0", meaning: "No age restriction." },
      {
        certification: "6",
        meaning: "No children younger than 6 years admitted.",
      },
      { certification: "12", meaning: "Children 12 or older admitted." },
      { certification: "16", meaning: "Children 16 or older admitted." },
      { certification: "18", meaning: "No youth admitted, only adults." },
    ],
    FR: [
      {
        certification: "10",
        meaning: "Not recommended for children under 10.",
      },
      {
        certification: "12",
        meaning: "Not recommended for children under 12.",
      },
      {
        certification: "16",
        meaning: "Not recommended for children under 16.",
      },
      { certification: "18", meaning: "Not recommended for persons under 18." },
      { certification: "TP", meaning: "Valid for all audiences." },
      { certification: "NR", meaning: "No rating information." },
    ],
    KR: [
      { certification: "All", meaning: "Film suitable for all ages." },
      {
        certification: "7",
        meaning:
          "May contain material inappropriate for children younger than 7.",
      },
      {
        certification: "12",
        meaning: "Film intended for audiences 12 and over.",
      },
      {
        certification: "15",
        meaning: "Film intended for audiences 15 and over.",
      },
      {
        certification: "19",
        meaning: "No one under 19 is allowed to watch this film.",
      },
      { certification: "Exempt", meaning: "Exempt from rating." },
      {
        certification: "Restricted Screening",
        meaning: "Restricted screening.",
      },
    ],
    JP: [
      { certification: "G", meaning: "General, suitable for all ages." },
      {
        certification: "PG12",
        meaning: "Parental guidance requested for young people under 12 years.",
      },
      { certification: "R15+", meaning: "No one under 15 admitted." },
      { certification: "R18+", meaning: "No one under 18 admitted." },
    ],
    HK: [
      { certification: "I", meaning: "Suitable for all ages." },
      { certification: "IIA", meaning: "Not suitable for children." },
      {
        certification: "IIB",
        meaning: "Not suitable for young persons and children.",
      },
      { certification: "III", meaning: "Persons aged 18 and above only." },
    ],
    NZ: [
      { certification: "G", meaning: "Suitable for general audiences." },
      { certification: "PG", meaning: "Parental guidance recommended." },
      {
        certification: "M",
        meaning: "Suitable for mature audiences 16 years and over.",
      },
      {
        certification: "16",
        meaning: "People under 16 years should not view.",
      },
      {
        certification: "18",
        meaning: "People under 18 years should not view.",
      },
      {
        certification: "R13",
        meaning: "Restricted to persons 13 years and over.",
      },
      {
        certification: "R15",
        meaning: "Restricted to persons 15 years and over.",
      },
      {
        certification: "R16",
        meaning: "Restricted to persons 16 years and over.",
      },
      {
        certification: "R18",
        meaning: "Restricted to persons 18 years and over.",
      },
      { certification: "R", meaning: "Restricted." },
      { certification: "RP13", meaning: "Restricted 13 unless accompanied." },
      { certification: "RP16", meaning: "Restricted 16 unless accompanied." },
      { certification: "RP18", meaning: "Restricted 18 unless accompanied." },
    ],
    IE: [
      {
        certification: "G",
        meaning: "Suitable for children of school going age.",
      },
      {
        certification: "PG",
        meaning:
          "Suitable for children over 8. Parental guidance recommended under 12.",
      },
      {
        certification: "12A",
        meaning: "Suitable for 12+. Younger children admitted with adult.",
      },
      {
        certification: "15A",
        meaning: "Suitable for 15+. Younger viewers admitted with adult.",
      },
      { certification: "12", meaning: "Suitable for 12+." },
      { certification: "15", meaning: "Suitable for 15+." },
      { certification: "16", meaning: "Suitable for 16+." },
      { certification: "18", meaning: "Suitable only for adults." },
    ],
    BR: [
      { certification: "L", meaning: "General Audiences." },
      { certification: "10", meaning: "Not recommended for minors under 10." },
      { certification: "12", meaning: "Not recommended for minors under 12." },
      { certification: "14", meaning: "Not recommended for minors under 14." },
      { certification: "16", meaning: "Not recommended for minors under 16." },
      { certification: "18", meaning: "Not recommended for minors under 18." },
    ],
    NL: [
      { certification: "AL", meaning: "All ages." },
      {
        certification: "6",
        meaning: "Potentially harmful to children under 6.",
      },
      {
        certification: "9",
        meaning: "Potentially harmful to children under 9.",
      },
      {
        certification: "12",
        meaning: "Potentially harmful to children under 12.",
      },
      {
        certification: "14",
        meaning: "Potentially harmful to children under 14.",
      },
      {
        certification: "16",
        meaning: "Potentially harmful to children under 16.",
      },
      {
        certification: "18",
        meaning: "Potentially harmful to children under 18.",
      },
    ],
    IN: [
      { certification: "U", meaning: "Unrestricted Public Exhibition." },
      {
        certification: "UA",
        meaning: "Parental guidance for children below 12.",
      },
      { certification: "U/A 7+", meaning: "Viewable for 7 and above." },
      { certification: "U/A 13+", meaning: "Viewable for 13 and above." },
      { certification: "U/A 16+", meaning: "Viewable for 16 and above." },
      { certification: "A", meaning: "Restricted to adults." },
      {
        certification: "S",
        meaning: "Restricted to special class of persons.",
      },
    ],
    ES: [
      { certification: "A", meaning: "General admission." },
      { certification: "Ai", meaning: "General admission." },
      { certification: "7", meaning: "Not recommended for under 7." },
      { certification: "7i", meaning: "Not recommended for under 7." },
      { certification: "12", meaning: "Not recommended for under 12." },
      { certification: "16", meaning: "Not recommended for under 16." },
      { certification: "18", meaning: "Not recommended for under 18." },
      { certification: "X", meaning: "Prohibited for under 18." },
      { certification: "TP", meaning: "For general viewing." },
    ],
    IT: [
      { certification: "T", meaning: "All ages admitted." },
      { certification: "BA", meaning: "Parental guidance suggested." },
      { certification: "6+", meaning: "Not suitable for children under 6." },
      { certification: "14+", meaning: "Released to ages 14 and older." },
      { certification: "18+", meaning: "Released to ages 18 and older." },
      {
        certification: "VM12",
        meaning: "Not recommended for children under 12.",
      },
      {
        certification: "VM14",
        meaning: "Not recommended for children under 14.",
      },
      {
        certification: "VM18",
        meaning: "Not recommended for children under 18.",
      },
    ],
    FI: [
      { certification: "S", meaning: "Allowed at all times." },
      { certification: "K7", meaning: "Not recommended for children under 7." },
      {
        certification: "K12",
        meaning: "Not recommended for children under 12.",
      },
      {
        certification: "K16",
        meaning: "Not recommended for children under 16.",
      },
      {
        certification: "K18",
        meaning: "Not recommended for children under 18.",
      },
      { certification: "KK", meaning: "Banned." },
    ],
    NO: [
      { certification: "A", meaning: "Allowed at all times." },
      { certification: "6", meaning: "6 years." },
      { certification: "9", meaning: "9 years." },
      { certification: "12", meaning: "12 years." },
      { certification: "15", meaning: "15 years." },
      { certification: "18", meaning: "18 years." },
    ],
    SE: [
      { certification: "Btl", meaning: "All ages." },
      { certification: "7", meaning: "Children under 7." },
      { certification: "11", meaning: "Children over 11." },
      { certification: "15", meaning: "Children over 15." },
    ],
    DK: [
      { certification: "A", meaning: "Suitable for general audience." },
      { certification: "7", meaning: "Not recommended for children under 7." },
      { certification: "11", meaning: "For ages 11 and up." },
      { certification: "15", meaning: "For ages 15 and up." },
      { certification: "F", meaning: "Exempt." },
    ],
    BG: [
      { certification: "12", meaning: "Content suitable for viewers over 12." },
      { certification: "14", meaning: "Content suitable for viewers over 14." },
      { certification: "16", meaning: "Content suitable for viewers over 16." },
      { certification: "18", meaning: "Content suitable for viewers over 18." },
      { certification: "A", meaning: "Recommended for children." },
      { certification: "B", meaning: "Without age restrictions." },
      { certification: "C", meaning: "Not recommended for children under 12." },
      { certification: "D", meaning: "Prohibited for persons under 16." },
      { certification: "X", meaning: "Prohibited for persons under 18." },
    ],
    HU: [
      { certification: "KN", meaning: "Without age restriction." },
      { certification: "6", meaning: "Not recommended below 6." },
      { certification: "12", meaning: "Not recommended below 12." },
      { certification: "16", meaning: "Not recommended below 16." },
      { certification: "18", meaning: "Not recommended below 18." },
      { certification: "X", meaning: "Restricted below 18." },
    ],
    LT: [
      { certification: "V", meaning: "Movies for all ages." },
      { certification: "N-7", meaning: "Viewers from 7 years old." },
      { certification: "N-13", meaning: "Viewers from 13 years old." },
      { certification: "N-14", meaning: "Viewers from 14 years old." },
      { certification: "N-16", meaning: "Viewers from 16 years old." },
      { certification: "N-18", meaning: "Viewers from 18 years old." },
      { certification: "S", meaning: "Adults only." },
    ],
    PT: [
      { certification: "T", meaning: "Suitable for all." },
      { certification: "Públicos", meaning: "For all public." },
      { certification: "M/3", meaning: "Viewers aged 3 and older." },
      { certification: "M/6", meaning: "Viewers aged 6 and older." },
      { certification: "M/12", meaning: "Viewers aged 12 and older." },
      { certification: "10AP", meaning: "Parental guidance advised." },
      { certification: "12AP", meaning: "Parental guidance advised." },
      { certification: "M/14", meaning: "Viewers aged 14 and older." },
      { certification: "M/16", meaning: "Viewers aged 16 and older." },
      { certification: "M/18", meaning: "Viewers aged 18 and older." },
      { certification: "P", meaning: "Pornography." },
    ],
    RU: [
      { certification: "0+", meaning: "All ages admitted." },
      { certification: "6+", meaning: "Unsuitable for children under 6." },
      { certification: "12+", meaning: "Unsuitable for children under 12." },
      { certification: "16+", meaning: "Unsuitable for children under 16." },
      { certification: "18+", meaning: "Prohibited for children under 18." },
    ],
    MX: [
      { certification: "AA", meaning: "Understandable for children under 7." },
      { certification: "A", meaning: "For all age groups." },
      { certification: "B", meaning: "For adolescents 12 and older." },
      {
        certification: "B-15",
        meaning: "Not recommended for children under 15.",
      },
      { certification: "C", meaning: "For adults 18 and older." },
      { certification: "D", meaning: "Adult movies." },
    ],
    PH: [
      { certification: "G", meaning: "Suitable for all ages." },
      { certification: "PG", meaning: "Parental guidance suggested." },
      {
        certification: "SPG",
        meaning: "Stronger parental guidance suggested.",
      },
      { certification: "R-13", meaning: "Viewers 13 and above." },
      { certification: "R-16", meaning: "Viewers 16 and above." },
      { certification: "R-18", meaning: "Viewers 18 and above." },
      { certification: "X", meaning: "Not suitable for public exhibition." },
    ],
    TH: [
      { certification: "P", meaning: "Educational." },
      { certification: "G", meaning: "General audience." },
      { certification: "13", meaning: "Suitable for 13+." },
      { certification: "15", meaning: "Suitable for 15+." },
      { certification: "18", meaning: "Suitable for 18+." },
      { certification: "20", meaning: "Unsuitable for under 20." },
      { certification: "Banned", meaning: "Banned." },
    ],
    MY: [
      { certification: "U", meaning: "General Audiences." },
      { certification: "P13", meaning: "Parental Guidance 13." },
      { certification: "18", meaning: "For viewers 18 and above." },
      { certification: "18SG", meaning: "Violence/Horror 18+." },
      { certification: "18SX", meaning: "Sexual Content 18+." },
      { certification: "18PA", meaning: "Political/Religious 18+." },
      { certification: "18PL", meaning: "Various 18+." },
    ],
    ID: [
      { certification: "SU", meaning: "All ages." },
      { certification: "P", meaning: "Pre-school." },
      { certification: "A", meaning: "Children." },
      { certification: "R", meaning: "Teens." },
      { certification: "D", meaning: "Adults." },
      { certification: "13+", meaning: "Suitable for 13+." },
      { certification: "17+", meaning: "Suitable for 17+." },
      { certification: "21+", meaning: "Suitable for 21+." },
    ],
    TR: [
      { certification: "Genel İzleyici Kitlesi", meaning: "General audience." },
      { certification: "6A", meaning: "Under 6 with family." },
      { certification: "6+", meaning: "6 and over." },
      { certification: "7+", meaning: "7 and over." },
      { certification: "10A", meaning: "Under 10 with family." },
      { certification: "10+", meaning: "10 and over." },
      { certification: "13A", meaning: "Under 13 with family." },
      { certification: "13+", meaning: "13 and over." },
      { certification: "16+", meaning: "16 and over." },
      { certification: "18+", meaning: "18 and over." },
    ],
    AR: [
      { certification: "ATP", meaning: "Suitable for all audiences." },
      { certification: "SAM 13", meaning: "Suitable for 13+." },
      { certification: "SAM 16", meaning: "Suitable for 16+." },
      { certification: "SAM 18", meaning: "Suitable for 18+." },
      { certification: "+13", meaning: "13+." },
      { certification: "+16", meaning: "16+." },
      { certification: "+18", meaning: "18+." },
      { certification: "C", meaning: "Restricted." },
    ],
    SG: [
      { certification: "G", meaning: "Suitable for all ages." },
      { certification: "PG", meaning: "Parental guidance." },
      {
        certification: "PG13",
        meaning: "Parental guidance advised for children below 13.",
      },
      {
        certification: "NC16",
        meaning: "Suitable for persons aged 16 and above.",
      },
      {
        certification: "M18",
        meaning: "Suitable for persons aged 18 and above.",
      },
      {
        certification: "R21",
        meaning: "Suitable for adults aged 21 and above.",
      },
    ],
    ZA: [
      { certification: "All", meaning: "Suitable for all." },
      { certification: "A", meaning: "Suitable for all." },
      { certification: "PG", meaning: "Parental Guidance." },
      { certification: "7-9PG", meaning: "Not suitable for under 7." },
      { certification: "10-12PG", meaning: "Not suitable for under 10." },
      { certification: "13", meaning: "Not suitable for under 13." },
      { certification: "16", meaning: "Not suitable for under 16." },
      { certification: "18", meaning: "Not suitable for under 18." },
      { certification: "X18", meaning: "Adults only." },
      { certification: "XX", meaning: "Banned." },
    ],
  };

  /**
   * Flatten the ratings into a single map.
   * Priority: US > GB > CA > AU > others
   * This handles collisions (e.g. "PG") by preferring the US definition.
   */
  const CONTENT_RATING_DEFINITIONS = {};

  // Helper to merge
  const merge = (countryCode) => {
    if (!RAW_RATINGS[countryCode]) return;
    RAW_RATINGS[countryCode].forEach((item) => {
      // Only set if not already set (respects priority order)
      if (!CONTENT_RATING_DEFINITIONS[item.certification]) {
        CONTENT_RATING_DEFINITIONS[item.certification] = item.meaning;
      }
    });
  };

  // Priority Order - Aggressive flattening
  const ALL_COUNTRIES = Object.keys(RAW_RATINGS);
  // Remove priority ones from list to avoid double processing (though helper handles checks)
  const PRIORITY = [
    "US",
    "GB",
    "CA",
    "AU",
    "NZ",
    "IE",
    "DE",
    "FR",
    "KR",
    "JP",
    "HK",
  ];
  const OTHERS = ALL_COUNTRIES.filter((c) => !PRIORITY.includes(c));

  [...PRIORITY, ...OTHERS].forEach(merge);

  // Merge any extras from other user-provided lists if needed dynamically?
  // For now, this covers the major requested ones + the logic works for any we add to RAW_RATINGS.

  /**
   * Get description for a content rating (certification)
   * @param {string} rating - e.g. "PG-13" or "TV-MA"
   * @returns {string} Description or empty string if not found
   */
  function getContentRatingDefinition(rating) {
    if (!rating) return "";
    return CONTENT_RATING_DEFINITIONS[rating] || "";
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORTS
  // ═══════════════════════════════════════════════════════════════════════════

  const RatingsUtils = {
    LOGOS,
    TRAKT_SVG,
    ROGEREBERT_SVG,
    LETTERBOXD_SVG,
    getIMDbColor,
    getMDBListClass,
    getMetacriticClass,
    createRatingsHTML,
    getContentRatingDefinition,
  };

  // Expose globally
  window.MetadataModules = window.MetadataModules || {};
  window.MetadataModules.ratingsUtils = RatingsUtils;

  console.log("[RatingsUtils] ✅ Shared ratings utilities loaded");
})();
