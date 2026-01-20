// Ensure namespace exists
window.HeroPlugin = window.HeroPlugin || {};

// Load saved catalog preference or default to movies
// Note: We can't access Config here safely if it's not loaded yet, so we hardcode the key or check existence
const CATALOG_PERSIST_KEY = 'heroCatalogPreference'; 
let savedCatalog = localStorage.getItem(CATALOG_PERSIST_KEY) || 'movies';
console.log(`[Hero Plugin] Loaded saved catalog preference: ${savedCatalog}`);

/**
 * Runtime State Management.
 * Holds the current ephemeral state of the Hero Banner (titles, indices, intervals).
 * Some properties (like currentCatalog) are persisted to localStorage but loaded here.
 */
window.HeroPlugin.State = {
    heroTitles: [],
    currentIndex: 0,
    autoRotateInterval: null,
    backgroundRefreshInterval: null,
    isAutoRotating: true,
    heroBannerPaused: false,
    
    // Catalog switching state variables
    currentCatalog: savedCatalog, // 'movies' or 'anime'
    movieSeriesTitles: [],
    animeTitles: [],
    
    // Background preloading flags
    movieCatalogPreloaded: false,
    animeCatalogPreloaded: false,

    // Initialization state
    isInitializing: false,
    initializationComplete: false,
    retryCount: 0,
    titlesReady: false,
    lastKnownHash: window.location.hash,

    fallbackTitles: [
        {
            id: "tt0903747",
            title: "Breaking Bad",
            background: "https://images.metahub.space/background/large/tt0903747/img",
            logo: "https://images.metahub.space/logo/medium/tt0903747/img",
            description: "A chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine with a former student to secure his family's future.",
            releaseInfo: "2008-2013",
            status: "Ended",
            duration: "45 min",
            seasons: "5 seasons",
            rating: "9.5",
            numericRating: 9.5,
            totalEpisodes: null,
            href: null,
            type: "series"
        },
        {
            id: "tt1375666",
            title: "Inception",
            background: "https://images.metahub.space/background/large/tt1375666/img",
            logo: "https://images.metahub.space/logo/medium/tt1375666/img",
            description: "A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into a CEO's mind.",
            releaseInfo: "2010",
            status: null,
            duration: "148 min",
            seasons: "Movie",
            rating: "8.8",
            numericRating: 8.8,
            totalEpisodes: null,
            href: null,
            type: "movie"
        },
        {
            id: "tt0468569",
            title: "The Dark Knight",
            background: "https://images.metahub.space/background/large/tt0468569/img",
            logo: "https://images.metahub.space/logo/medium/tt0468569/img",
            description: "When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological and physical tests.",
            releaseInfo: "2008",
            status: null,
            duration: "152 min",
            seasons: "Movie",
            rating: "9.0",
            numericRating: 9.0,
            totalEpisodes: null,
            href: null,
            type: "movie"
        }
    ]
};
