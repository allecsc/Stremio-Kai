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
        greyValue
      )}, ${Math.round(greyValue)})`;
    }
    const greyValue = Math.max(108, 146 - (3.0 - numRating) * 19);
    return `rgb(${Math.round(greyValue)}, ${Math.round(
      greyValue
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
      b * 255
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
        imdbRating
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
        rtaVotes
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
        metacriticVotes
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
        `class="${prefix}-logo`
      );
      const lbTooltip = formatVotesTooltip("Letterboxd", lbVotes);
      html += `
        <button class="${prefix}-item" onclick="event.stopPropagation(); window.open('https://letterboxd.com/', '_blank')" title="${lbTooltip}">
          ${svgWithPrefix}
          <span class="${prefix}-letterboxd">${Number(lbRating).toFixed(
        1
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
        `class="${prefix}-logo`
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
        `class="${prefix}-logo`
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
  };

  // Expose globally
  window.MetadataModules = window.MetadataModules || {};
  window.MetadataModules.ratingsUtils = RatingsUtils;

  console.log("[RatingsUtils] ✅ Shared ratings utilities loaded");
})();
