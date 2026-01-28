// Ensure namespace exists
window.HeroPlugin = window.HeroPlugin || {};

/**
 * Global Configuration for Hero Banner.
 * centralized constants for timeouts, intervals, keys, and API limits.
 */
window.HeroPlugin.Config = {
  MAX_RETRIES: 2,
  ROTATION_INTERVAL: 8000,
  ANIME_CACHE_KEY: "heroAnimeTitlesCache",
  MOVIE_CACHE_KEY: "heroMovieTitlesCache",
  CATALOG_PERSIST_KEY: "heroCatalogPreference",
  CUSTOM_MOVIE_URL_KEY: "heroCustomMovieUrl",
  CUSTOM_SERIES_URL_KEY: "heroCustomSeriesUrl",
  PROGRESSIVE_DAYS_LIMIT: 6,
  GLOBAL_CACHE_TIMESTAMP_KEY: "heroGlobalTimestamp",
  CHECK_INTERVAL: 60 * 60 * 1000, // Check every hour

  // Priority List of CORS Proxies (for fallback chain)
  PROXY_LIST: [
    "https://corsproxy.io/?", // 1. Primary (High Uptime)
    "https://api.cors.lol/?url=", // 2. Fast Secondary
    "https://api.codetabs.com/v1/proxy?quest=", // 3. Reliable Backup
    "https://api.allorigins.win/raw?url=", // 4. Deep Fallback
  ],

  // API Sources
  SOURCES: {
    MOVIES: [
      { name: "None", url: "" },
      {
        name: "Snoak's Latest Digital Releases",
        url: "https://mdblist.com/lists/snoak/latest-movies-digital-release/json",
      },
      {
        name: "Snoak's Trending",
        url: "https://mdblist.com/lists/snoak/trending-movies/json",
      },
      {
        name: "Cinemeta's Popular",
        url: "https://cinemeta-catalogs.strem.io/top/catalog/movie/top.json",
      },
      {
        name: "Cinemeta's Featured",
        url: "https://cinemeta-catalogs.strem.io/top/catalog/movie/imdbRating.json",
      },
      { name: "Custom", url: "" },
    ],
    SERIES: [
      { name: "None", url: "" },
      {
        name: "Snoak's Trakt Trending",
        url: "https://mdblist.com/lists/snoak/trakt-s-trending-shows/json",
      },
      {
        name: "Snoak's Latest",
        url: "https://mdblist.com/lists/snoak/latest-tv-shows/json",
      },
      {
        name: "Cinemeta's Popular",
        url: "https://cinemeta-catalogs.strem.io/top/catalog/series/top.json",
      },
      {
        name: "Cinemeta's Featured",
        url: "https://cinemeta-catalogs.strem.io/top/catalog/series/imdbRating.json",
      },
      { name: "Custom", url: "" },
    ],
  },

  // Dynamic Getters
  get MOVIE_CATALOG_URL() {
    const storedIndex = localStorage.getItem("hero-movie-source-index");
    const index = storedIndex !== null ? parseInt(storedIndex) : 1;
    const source = this.SOURCES.MOVIES[index] || this.SOURCES.MOVIES[1];
    if (source.name === "Custom") {
      return localStorage.getItem(this.CUSTOM_MOVIE_URL_KEY) || "";
    }
    return source.url;
  },

  get SERIES_CATALOG_URL() {
    const storedIndex = localStorage.getItem("hero-series-source-index");
    const index = storedIndex !== null ? parseInt(storedIndex) : 1;
    const source = this.SOURCES.SERIES[index] || this.SOURCES.SERIES[1];
    if (source.name === "Custom") {
      return localStorage.getItem(this.CUSTOM_SERIES_URL_KEY) || "";
    }
    return source.url;
  },

  ANIME_CATALOG_URL: "https://api.jikan.moe/v4/schedules/",

  // Catalog Settings
  MOVIE_CATALOG_LIMIT: 10,
  SERIES_CATALOG_LIMIT: 10,
  ANIME_CATALOG_LIMIT: 20,
};
