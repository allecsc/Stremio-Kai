/**
 * Enhanced Metadata Settings UI
 *
 * Implements a "Enhanced Metadata" section in Stremio settings.
 * Features:
 * - Native-style dropdowns (ported from api-selector.js)
 * - API Key inputs with validation
 * - Language selection
 * - Comprehensive Rating Toggles
 *
 * @module settings-ui
 * @version 2.4.0
 */

(function () {
  "use strict";

  if (window.MetadataModules?.settingsUI?.initialized) return;

  window.MetadataModules = window.MetadataModules || {};

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────────
  const CONFIG = {
    TARGET_ROUTE: "#/settings",
    SECTION_TITLE: "Enhanced Metadata",
    SECTION_INDEX: 3,

    // General Settings Info
    CURRENT_VERSION: "4.2.0",
    GITHUB_URL: "https://github.com/allecsc/Stremio-Kai",

    // Full ISO-639-1 list - Sorted Alphabetically by Label, with English first
    LANGUAGES: [
      { code: "en", label: "English" }, // Default / Top
      { code: "aa", label: "Afar" },
      { code: "ab", label: "Abkhazian" },
      { code: "af", label: "Afrikaans" },
      { code: "ak", label: "Akan" },
      { code: "sq", label: "Albanian" },
      { code: "am", label: "Amharic" },
      { code: "ar", label: "Arabic" },
      { code: "an", label: "Aragonese" },
      { code: "hy", label: "Armenian" },
      { code: "as", label: "Assamese" },
      { code: "av", label: "Avaric" },
      { code: "ae", label: "Avestan" },
      { code: "ay", label: "Aymara" },
      { code: "az", label: "Azerbaijani" },
      { code: "bm", label: "Bambara" },
      { code: "ba", label: "Bashkir" },
      { code: "eu", label: "Basque" },
      { code: "be", label: "Belarusian" },
      { code: "bn", label: "Bengali" },
      { code: "bh", label: "Bihari" },
      { code: "bi", label: "Bislama" },
      { code: "bs", label: "Bosnian" },
      { code: "br", label: "Breton" },
      { code: "bg", label: "Bulgarian" },
      { code: "my", label: "Burmese" },
      { code: "ca", label: "Catalan" },
      { code: "ch", label: "Chamorro" },
      { code: "ce", label: "Chechen" },
      { code: "ny", label: "Chichewa" },
      { code: "zh", label: "Chinese" },
      { code: "cu", label: "Church Slavic" },
      { code: "cv", label: "Chuvash" },
      { code: "kw", label: "Cornish" },
      { code: "co", label: "Corsican" },
      { code: "cr", label: "Cree" },
      { code: "hr", label: "Croatian" },
      { code: "cs", label: "Czech" },
      { code: "da", label: "Danish" },
      { code: "dv", label: "Divehi" },
      { code: "nl", label: "Dutch" },
      { code: "dz", label: "Dzongkha" },
      { code: "eo", label: "Esperanto" },
      { code: "et", label: "Estonian" },
      { code: "ee", label: "Ewe" },
      { code: "fo", label: "Faroese" },
      { code: "fj", label: "Fijian" },
      { code: "fi", label: "Finnish" },
      { code: "fr", label: "French" },
      { code: "ff", label: "Fulah" },
      { code: "gd", label: "Gaelic" },
      { code: "gl", label: "Galician" },
      { code: "lg", label: "Ganda" },
      { code: "ka", label: "Georgian" },
      { code: "de", label: "German" },
      { code: "el", label: "Greek" },
      { code: "kl", label: "Greenlandic" },
      { code: "gn", label: "Guarani" },
      { code: "gu", label: "Gujarati" },
      { code: "ht", label: "Haitian" },
      { code: "ha", label: "Hausa" },
      { code: "he", label: "Hebrew" },
      { code: "hz", label: "Herero" },
      { code: "hi", label: "Hindi" },
      { code: "ho", label: "Hiri Motu" },
      { code: "hu", label: "Hungarian" },
      { code: "is", label: "Icelandic" },
      { code: "io", label: "Ido" },
      { code: "ig", label: "Igbo" },
      { code: "id", label: "Indonesian" },
      { code: "ia", label: "Interlingua" },
      { code: "ie", label: "Interlingue" },
      { code: "iu", label: "Inuktitut" },
      { code: "ik", label: "Inupiaq" },
      { code: "ga", label: "Irish" },
      { code: "it", label: "Italian" },
      { code: "ja", label: "Japanese" },
      { code: "jv", label: "Javanese" },
      { code: "kn", label: "Kannada" },
      { code: "kr", label: "Kanuri" },
      { code: "ks", label: "Kashmiri" },
      { code: "kk", label: "Kazakh" },
      { code: "km", label: "Khmer" },
      { code: "ki", label: "Kikuyu" },
      { code: "rw", label: "Kinyarwanda" },
      { code: "ky", label: "Kyrgyz" },
      { code: "kv", label: "Komi" },
      { code: "kg", label: "Kongo" },
      { code: "ko", label: "Korean" },
      { code: "kj", label: "Kuanyama" },
      { code: "ku", label: "Kurdish" },
      { code: "lo", label: "Lao" },
      { code: "la", label: "Latin" },
      { code: "lv", label: "Latvian" },
      { code: "li", label: "Limburgish" },
      { code: "ln", label: "Lingala" },
      { code: "lt", label: "Lithuanian" },
      { code: "lb", label: "Luxembourgish" },
      { code: "lu", label: "Luba-Katanga" },
      { code: "mk", label: "Macedonian" },
      { code: "mg", label: "Malagasy" },
      { code: "ms", label: "Malay" },
      { code: "ml", label: "Malayalam" },
      { code: "mt", label: "Maltese" },
      { code: "gv", label: "Manx" },
      { code: "mi", label: "Maori" },
      { code: "mr", label: "Marathi" },
      { code: "mh", label: "Marshallese" },
      { code: "mn", label: "Mongolian" },
      { code: "na", label: "Nauru" },
      { code: "nv", label: "Navajo" },
      { code: "ng", label: "Ndonga" },
      { code: "ne", label: "Nepali" },
      { code: "nd", label: "North Ndebele" },
      { code: "se", label: "Northern Sami" },
      { code: "no", label: "Norwegian" },
      { code: "nb", label: "Norwegian Bokmål" },
      { code: "nn", label: "Norwegian Nynorsk" },
      { code: "oc", label: "Occitan" },
      { code: "oj", label: "Ojibwa" },
      { code: "or", label: "Oriya" },
      { code: "om", label: "Oromo" },
      { code: "os", label: "Ossetian" },
      { code: "pi", label: "Pali" },
      { code: "ps", label: "Pashto" },
      { code: "fa", label: "Persian" },
      { code: "pl", label: "Polish" },
      { code: "pt", label: "Portuguese" },
      { code: "pa", label: "Punjabi" },
      { code: "qu", label: "Quechua" },
      { code: "ro", label: "Romanian" },
      { code: "rm", label: "Romansh" },
      { code: "rn", label: "Rundi" },
      { code: "ru", label: "Russian" },
      { code: "sm", label: "Samoan" },
      { code: "sg", label: "Sango" },
      { code: "sa", label: "Sanskrit" },
      { code: "sc", label: "Sardinian" },
      { code: "sr", label: "Serbian" },
      { code: "sn", label: "Shona" },
      { code: "ii", label: "Sichuan Yi" },
      { code: "sd", label: "Sindhi" },
      { code: "si", label: "Sinhala" },
      { code: "sk", label: "Slovak" },
      { code: "sl", label: "Slovenian" },
      { code: "so", label: "Somali" },
      { code: "st", label: "Southern Sotho" },
      { code: "nr", label: "South Ndebele" },
      { code: "es", label: "Spanish" },
      { code: "su", label: "Sundanese" },
      { code: "sw", label: "Swahili" },
      { code: "ss", label: "Swati" },
      { code: "sv", label: "Swedish" },
      { code: "tl", label: "Tagalog" },
      { code: "ty", label: "Tahitian" },
      { code: "tg", label: "Tajik" },
      { code: "ta", label: "Tamil" },
      { code: "tt", label: "Tatar" },
      { code: "te", label: "Telugu" },
      { code: "th", label: "Thai" },
      { code: "bo", label: "Tibetan" },
      { code: "ti", label: "Tigrinya" },
      { code: "to", label: "Tonga" },
      { code: "ts", label: "Tsonga" },
      { code: "tn", label: "Tswana" },
      { code: "tr", label: "Turkish" },
      { code: "tk", label: "Turkmen" },
      { code: "tw", label: "Twi" },
      { code: "ug", label: "Uyghur" },
      { code: "uk", label: "Ukrainian" },
      { code: "ur", label: "Urdu" },
      { code: "uz", label: "Uzbek" },
      { code: "ve", label: "Venda" },
      { code: "vi", label: "Vietnamese" },
      { code: "vo", label: "Volapük" },
      { code: "wa", label: "Walloon" },
      { code: "cy", label: "Welsh" },
      { code: "fy", label: "Western Frisian" },
      { code: "wo", label: "Wolof" },
      { code: "xh", label: "Xhosa" },
      { code: "yi", label: "Yiddish" },
      { code: "yo", label: "Yoruba" },
      { code: "za", label: "Zhuang" },
      { code: "zu", label: "Zulu" },
    ],

    // Rating Providers Sorted by Priority
    RATING_PROVIDERS: [
      { id: "imdb", label: "IMDb" },
      { id: "mal", label: "MyAnimeList" },
      { id: "mdblist", label: "MDBList" },
      { id: "rottenTomatoes", label: "Rotten Tomatoes (Critics)" },
      { id: "rottenTomatoesAudience", label: "Rotten Tomatoes (Audience)" },
      { id: "tmdb", label: "TMDB" },
      { id: "metacritic", label: "Metacritic" },
      { id: "letterboxd", label: "Letterboxd" },
      { id: "trakt", label: "Trakt" },
      { id: "rogerebert", label: "Roger Ebert" },
    ],
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // UI BUILDER
  // ─────────────────────────────────────────────────────────────────────────────
  const UIManager = {
    // --- Icons ---
    ICONS: {
      // Key Icon - User Provided, resized to 30x30, fill #e6e6e6
      KEY: '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" fill="#e6e6e6" viewBox="0 0 56 56"><path fill-rule="evenodd" d="M43.111 4h5.829c.245 0 .51 0 .739.019.26.02.602.073.956.253a2.5 2.5 0 0 1 1.093 1.093c.18.354.232.697.253.956.02.23.02.494.019.739v4.88c0 .245 0 .51-.019.739-.02.26-.073.602-.254.956a2.5 2.5 0 0 1-1.092 1.092c-.354.18-.697.233-.956.254a9.49 9.49 0 0 1-.739.019H46v2.94c0 .245 0 .51-.019.739-.02.26-.073.602-.254.956a2.5 2.5 0 0 1-1.092 1.092c-.354.18-.697.233-.956.254a9.49 9.49 0 0 1-.739.019H40v2.94c0 .245 0 .51-.019.739-.02.26-.073.602-.254.956a2.5 2.5 0 0 1-1.092 1.092c-.354.18-.697.233-.956.254-.23.02-.494.02-.739.019h-3.819l-.029.03-.378.377-.107.107.132.208A14.439 14.439 0 0 1 35 35.5C35 43.508 28.508 50 20.5 50S6 43.508 6 35.5 12.492 21 20.5 21c1.277 0 2.518.166 3.701.477l.159.042.069-.069L40.97 4.908l.036-.036c.128-.13.34-.344.601-.504.224-.137.468-.238.723-.299.297-.071.598-.07.78-.07ZM39.54 21.01h.002Zm6.471-6.471v.002Zm-.469.471h-.002ZM43.122 7l-.03.03L26.55 23.57l-.055.056c-.184.186-.482.488-.847.675a2.428 2.428 0 0 1-1.676.209c-.155-.033-.335-.08-.508-.126l-.027-.007A11.519 11.519 0 0 0 20.5 24C14.149 24 9 29.149 9 35.5S14.149 47 20.5 47 32 41.851 32 35.5a11.44 11.44 0 0 0-1.791-6.167l-.02-.03c-.135-.213-.272-.427-.375-.614a2.423 2.423 0 0 1-.166-2.171c.129-.324.318-.565.464-.732.133-.152.299-.318.456-.475l.403-.403a3.279 3.279 0 0 1 .637-.54 2.49 2.49 0 0 1 .723-.299c.297-.071.598-.07.78-.07l.052.001H37v-2.94c0-.245 0-.51.019-.739.02-.26.073-.602.254-.956a2.5 2.5 0 0 1 1.092-1.092c.354-.18.697-.233.956-.254.23-.02.494-.02.739-.019H43v-2.94c0-.245 0-.51.019-.739.02-.26.073-.602.254-.956a2.5 2.5 0 0 1 1.092-1.092c.354-.18.697-.233.956-.254.23-.02.494-.02.739-.019H49V7h-5.879Zm6.338.011h-.002Zm-.471-.469V6.54Zm0 5.918v-.002Zm.469-.471h.002ZM36.988 24.46l.001-.002Zm.47-.471h.002Z M21 38a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>',

      // Cog Icon - User Provided, resized to 30x30, fill #e6e6e6
      COG: '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24"><path fill="#e6e6e6" d="M7.1339746,5.57179677 L8.65921919,8.21359791 L8.19923483,8.7511076 C7.79976279,9.21790627 7.48900319,9.75394971 7.2842513,10.3332461 L7.04858761,11 L4,11 L4,13 L6.34141142,13 L7.04858761,13 L7.2842513,13.6667539 C7.48900319,14.2460503 7.79976279,14.7820937 8.19923483,15.2488924 L8.65921919,15.7864021 L7.1339746,18.4282032 L8.8660254,19.4282032 L10.3901846,16.788282 L11.084732,16.9165973 C11.3841574,16.9719152 11.6900312,17 12,17 C12.3099688,17 12.6158426,16.9719152 12.915268,16.9165973 L13.6098154,16.788282 L15.1339746,19.4282032 L16.8660254,18.4282032 L15.3407808,15.7864021 L15.8007652,15.2488924 C16.2002372,14.7820937 16.5109968,14.2460503 16.7157487,13.6667539 L16.9514124,13 L20,13 L20,11 L16.9514124,11 L16.7157487,10.3332461 C16.5109968,9.75394971 16.2002372,9.21790627 15.8007652,8.7511076 L15.3407808,8.21359791 L16.8660254,5.57179677 L15.1339746,4.57179677 L13.6098154,7.21171801 L12.915268,7.08340266 C12.6158426,7.0280848 12.3099688,7 12,7 C11.6900312,7 11.3841574,7.0280848 11.084732,7.08340266 L10.3901846,7.21171801 L8.8660254,4.57179677 L7.1339746,5.57179677 Z M7.43946286,8.10091796 L6.26794919,6.07179677 C5.99180682,5.59350415 6.15568197,4.98191374 6.6339746,4.70577137 L8.3660254,3.70577137 C8.84431803,3.42962899 9.45590843,3.59350415 9.73205081,4.07179677 L10.9030596,6.10004354 C11.2587021,6.03433976 11.6253408,6 12,6 C12.3746592,6 12.7412979,6.03433976 13.0969404,6.10004354 L14.2679492,4.07179677 C14.5440916,3.59350415 15.155682,3.42962899 15.6339746,3.70577137 L17.3660254,4.70577137 C17.844318,4.98191374 18.0081932,5.59350415 17.7320508,6.07179677 L16.5605371,8.10091796 C17.0351677,8.65554226 17.4103863,9.29777107 17.6585886,10 L20,10 C20.5522847,10 21,10.4477153 21,11 L21,13 C21,13.5522847 20.5522847,14 20,14 L17.6585886,14 C17.4103863,14.7022289 17.0351677,15.3444577 16.5605371,15.899082 L17.7320508,17.9282032 C18.0081932,18.4064959 17.844318,19.0180863 17.3660254,19.2942286 L15.6339746,20.2942286 C15.155682,20.570371 14.5440916,20.4064959 14.2679492,19.9282032 L13.0969404,17.8999565 C12.7412979,17.9656602 12.3746592,18 12,18 C11.6253408,18 11.2587021,17.9656602 10.9030596,17.8999565 L9.73205081,19.9282032 C9.45590843,20.4064959 8.84431803,20.570371 8.3660254,20.2942286 L6.6339746,19.2942286 C6.15568197,19.0180863 5.99180682,18.4064959 6.26794919,17.9282032 L7.43946286,15.899082 C6.96483234,15.3444577 6.58961373,14.7022289 6.34141142,14 C3.44771525,14 3,13.5522847 3,13 L3,11 C3,10.4477153 3.44771525,10 4,10 L6.34141142,10 C6.58961373,9.29777107 6.96483234,8.65554226 7.43946286,8.10091796 Z M12,14 C13.1045695,14 14,13.1045695 14,12 C14,10.8954305 13.1045695,10 12,10 C10.8954305,10 10,10.8954305 10,12 C10,13.1045695 10.8954305,14 12,14 Z M12,15 C10.3431458,15 9,13.6568542 9,12 C9,10.3431458 10.3431458,9 12,9 C13.6568542,9 15,10.3431458 15,12 C15,13.6568542 13.6568542,15 12,15 Z"/></svg>',

      CHECK:
        '<svg class="icon-jg2il" viewBox="0 0 512 512" style="fill: currentcolor;"><path d="m91.7 213.799 145.4 169.6c2.1 2.536 4.7 4.592 7.6 6.031 2.9 1.487 6.1 2.381 9.5 2.633 3.2.251 6.5-.148 9.6-1.171 3.1-1.035 6-2.663 8.5-4.793.9-.797 1.8-1.703 2.6-2.7l145.4-169.6c3.1-3.647 4.9-8.083 5.6-12.8.7-4.719 0-9.539-1.9-13.869-2-4.344-5.2-8.023-9.2-10.599s-8.7-3.942-13.6-3.932H110.6c-3.3-.01-6.6.626-9.6 1.873-4.7 1.86-8.6 5.058-11.2 9.175-2.7 4.109-4.2 8.924-4.2 13.852.1 5.99 2.3 11.756 6.1 16.3"></path></svg>',

      NOTE: '<svg class="kai-note-icon" viewBox="0 0 24 24" fill="none"><path d="M12 16V12M12 8H12.01M7.8 21H16.2C17.8802 21 18.7202 21 19.362 20.673C19.9265 20.3854 20.3854 19.9265 20.673 19.362C21 18.7202 21 17.8802 21 16.2V7.8C21 6.11984 21 5.27976 20.673 4.63803C20.3854 4.07354 19.9265 3.6146 19.362 3.32698C18.7202 3 17.8802 3 16.2 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',

      GITHUB:
        '<svg height="20" width="20" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>',

      STAR: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="kai-icon kai-icon-star" style="width: 18px; height: 18px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',

      HEART:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="kai-icon kai-icon-heart" style="width: 18px; height: 18px; margin-left: 6px;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    },

    buildCategoryHeader(label, iconSvg) {
      const container = document.createElement("div");
      container.className = "section-category-container-EOuS0";

      const icon = iconSvg || "";
      // Using flex to align icon and text nicely
      container.innerHTML = `<div style="display:flex; align-items:center;">${icon}<span class="label-FFamJ" style="margin-left:8px;">${label}</span></div>`;

      return container;
    },

    buildApiInputRow(provider) {
      const apiKeys = window.MetadataModules?.apiKeys;
      if (!apiKeys) return null;

      const row = document.createElement("div");
      row.className = "option-container-EGlcv kai-api-key-row";

      const labelContainer = document.createElement("div");
      labelContainer.className = "option-name-container-exGMI";
      labelContainer.innerHTML = `
        <div class="label-FFamJ">${provider.label}</div>
        <div class="kai-api-key-hint">${provider.hint} <a href="${provider.hintLink}" target="_blank">${provider.hintLinkText}</a></div>
       `;
      row.appendChild(labelContainer);

      const inputContainer = document.createElement("div");
      inputContainer.className = "kai-settings-input-wrapper";

      const input = document.createElement("input");
      input.className = "kai-settings-input";
      input.type = "password";
      input.placeholder = `Enter API Key...`;

      const existingKey = apiKeys.getKey(provider.id);
      if (existingKey) {
        input.value = existingKey;
        input.dataset.hasKey = "true";
      }

      const badge = document.createElement("div");
      badge.className = "kai-settings-status";
      this.updateBadge(badge, existingKey ? "valid" : "empty");

      let timer = null;
      input.addEventListener("input", () => {
        this.updateBadge(badge, "empty");
        if (timer) clearTimeout(timer);

        if (!input.value.trim()) {
          if (apiKeys.hasKey(provider.id)) {
            apiKeys.clearKey(provider.id);
            this.updatePreferencesState();
          }
          return;
        }

        this.updateBadge(badge, "validating");
        timer = setTimeout(async () => {
          const res = await apiKeys.validateKey(
            provider.id,
            input.value.trim(),
          );
          if (res.valid) {
            apiKeys.setKey(provider.id, input.value.trim());
            input.dataset.hasKey = "true";
            this.updateBadge(badge, "valid");
            this.updatePreferencesState();
          } else {
            this.updateBadge(badge, "invalid", res.error);
          }
        }, 800);
      });

      inputContainer.appendChild(input);
      inputContainer.appendChild(badge);
      row.appendChild(inputContainer);

      return row;
    },

    updateBadge(badge, status, msg = "") {
      badge.dataset.status = status;
      if (status === "valid")
        badge.innerHTML = '<span class="status-valid">✓</span>';
      else if (status === "invalid")
        badge.innerHTML = '<span class="status-invalid">✗</span>';
      else if (status === "validating")
        badge.innerHTML = '<span class="status-loading">⏳</span>';
      else badge.innerHTML = "";
      badge.title = msg;
    },

    // --- Native Dropdown Logic (With Styles to Fix Visibility) ---

    closeAllDropdowns(excludeContainer) {
      document
        .querySelectorAll(".multiselect-container-w0c9l.active")
        .forEach((el) => {
          if (el !== excludeContainer) el.classList.remove("active");
        });
    },

    buildMenu(options, currentCode, onSelect) {
      const menuContainer = document.createElement("div");
      menuContainer.className =
        "menu-container-B6cqK menu-direction-bottom-right-aJ89V kai-settings-menu";
      menuContainer.setAttribute("data-focus-lock-disabled", "false");

      const innerContainer = document.createElement("div");
      innerContainer.className = "menu-container-qiz0X";
      // Allow scrolling for long lists
      innerContainer.style.maxHeight = "300px";
      innerContainer.style.overflowY = "auto";

      options.forEach((opt) => {
        const optionEl = document.createElement("div");
        optionEl.className = "option-container-mO9yW button-container-zVLH6";
        if (opt.code === currentCode) optionEl.classList.add("selected");

        optionEl.tabIndex = 0;
        optionEl.title = opt.label;
        optionEl.setAttribute("data-value", opt.code);

        const label = document.createElement("div");
        label.className = "label-AR_l8";
        label.textContent = opt.label;
        optionEl.appendChild(label);

        if (opt.code === currentCode) {
          const iconDiv = document.createElement("div");
          iconDiv.className = "icon-jg2il";
          optionEl.appendChild(iconDiv);
        }

        optionEl.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelect(opt.code);
        });

        innerContainer.appendChild(optionEl);
      });

      menuContainer.appendChild(innerContainer);
      return menuContainer;
    },

    buildLanguageRow() {
      const row = document.createElement("div");
      row.className = "option-container-EGlcv";

      const labelContainer = document.createElement("div");
      labelContainer.className = "option-name-container-exGMI";
      labelContainer.innerHTML = `<div class="label-FFamJ">Primary Content Language</div>`;
      row.appendChild(labelContainer);

      const inputContainer = document.createElement("div");
      inputContainer.className =
        "option-input-container-NPgpT multiselect-container-w0c9l label-container-XOyzm label-container-dhjQS button-container-zVLH6";
      inputContainer.tabIndex = 0;

      const currentLangCode =
        window.MetadataModules.preferences.get("language") || "en";
      const currentLangLabel =
        CONFIG.LANGUAGES.find((l) => l.code === currentLangCode)?.label ||
        "English";

      // Label
      const valueLabel = document.createElement("div");
      valueLabel.className = "label-AR_l8";
      valueLabel.style.maxWidth = "11.5rem";
      valueLabel.textContent = currentLangLabel;
      inputContainer.appendChild(valueLabel);

      // Icon
      inputContainer.insertAdjacentHTML("beforeend", this.ICONS.CHECK);

      // Focus Guards
      const focusGuardTop = document.createElement("div");
      focusGuardTop.setAttribute("data-focus-guard", "true");
      focusGuardTop.className = "focus-guard";
      focusGuardTop.tabIndex = 0;
      inputContainer.appendChild(focusGuardTop);

      // Menu Interaction
      const menu = this.buildMenu(
        CONFIG.LANGUAGES,
        currentLangCode,
        async (selectedCode) => {
          if (selectedCode === currentLangCode) return;

          const confirmChange = confirm(
            "Changing language requires a reload and will clear metadata caches. Reload now?",
          );

          if (confirmChange) {
            // 1. Update Preference
            window.MetadataModules.preferences.set("language", selectedCode);

            // 2. Clear Metadata Database (Dexie)
            try {
              if (window.metadataStorage?.db) {
                console.log("[Settings] Clearing Metadata DB...");
                await window.metadataStorage.db.delete();
                console.log("[Settings] Metadata DB Cleared.");
              }
            } catch (e) {
              console.error("[Settings] Failed to clear DB:", e);
            }

            // 3. Clear Hero Banner Cache (LocalStorage)
            try {
              console.log("[Settings] Clearing Hero Banner Cache...");
              const keys = [
                "heroMovieTitlesCache",
                "heroAnimeTitlesCache",
                "heroGlobalTimestamp",
              ];
              keys.forEach((k) => localStorage.removeItem(k));
            } catch (e) {
              console.error("[Settings] Failed to clear Hero Cache:", e);
            }

            // 4. Reload
            window.location.reload();
          } else {
            // Just update preference silently if user cancels reload
            window.MetadataModules.preferences.set("language", selectedCode);

            // Update UI Label
            const newLabel = CONFIG.LANGUAGES.find(
              (l) => l.code === selectedCode,
            )?.label;
            valueLabel.textContent = newLabel;

            // Remove menu
            if (menu.parentNode) menu.parentNode.removeChild(menu);
          }
        },
      );

      inputContainer.appendChild(menu);

      const focusGuardBottom = focusGuardTop.cloneNode(true);
      inputContainer.appendChild(focusGuardBottom);

      // Click Handler
      inputContainer.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const wasActive = inputContainer.classList.contains("active");
        this.closeAllDropdowns(inputContainer);

        if (!wasActive) inputContainer.classList.add("active");
        else inputContainer.classList.remove("active");
      });

      row.appendChild(inputContainer);
      return row;
    },

    buildToggleRow(id, label) {
      const row = document.createElement("div");
      row.className = "option-container-EGlcv";

      const labelContainer = document.createElement("div");
      labelContainer.className = "option-name-container-exGMI";
      labelContainer.innerHTML = `<div class="label-FFamJ">Show ${label} Ratings</div>`;
      row.appendChild(labelContainer);

      const toggleContainer = document.createElement("div");
      toggleContainer.tabIndex = 0;
      toggleContainer.className =
        "option-input-container-NPgpT toggle-container-lZfHP button-container-zVLH6";

      const prefs = window.MetadataModules.preferences.get("ratings") || {};
      // Default to true if key is missing or explicitly not false
      const isChecked = prefs[id] !== false;

      if (isChecked) toggleContainer.classList.add("checked");

      toggleContainer.innerHTML = `<div class="toggle-toOWM"></div>`;

      toggleContainer.addEventListener("click", () => {
        const newState = !toggleContainer.classList.contains("checked");
        toggleContainer.classList.toggle("checked", newState);
        window.MetadataModules.preferences.setSubField("ratings", id, newState);
      });

      row.appendChild(toggleContainer);
      return row;
    },

    updatePreferencesState() {
      const languageContainer = document.getElementById(
        "kai-language-container",
      );
      const ratingsContainer = document.getElementById("kai-ratings-container");

      const hasTmdb = window.MetadataModules.apiKeys?.hasKey("tmdb");
      const hasMdblist = window.MetadataModules.apiKeys?.hasKey("mdblist");

      // Language dropdown: hidden if no TMDB key
      if (languageContainer) {
        if (hasTmdb) {
          languageContainer.classList.remove("hidden");
        } else {
          languageContainer.classList.add("hidden");
        }
      }

      // Rating toggles: hidden if no MDBlist key
      if (ratingsContainer) {
        if (hasMdblist) {
          ratingsContainer.classList.remove("hidden");
        } else {
          ratingsContainer.classList.add("hidden");
        }
      }
    },

    // Inject Styles for Dropdown Visibility
    injectStyles() {
      // Styles are now managed in webmods/Theme/settings-ui.css
      // Keeping this method stub for safety if called elsewhere, but it's No-Op now.
      return;
    },

    injectSection() {
      if (document.querySelector(".kai-api-keys-section")) return;

      if (document.querySelector(".kai-api-keys-section")) return;

      // this.injectStyles(); // Removed: styles are in external CSS

      const sectionsContainer = document.querySelector(
        ".sections-container-EUKAe",
      );
      if (!sectionsContainer) return;

      const section = document.createElement("div");
      section.className =
        "section-container-twzKQ kai-api-keys-section animation-fade-in";

      const title = document.createElement("div");
      title.className = "section-title-Nt71Z";
      title.textContent = CONFIG.SECTION_TITLE;
      section.appendChild(title);

      // --- 1. API KEYS SUB-SECTION ---
      section.appendChild(
        this.buildCategoryHeader("Private API Keys", this.ICONS.KEY),
      );

      const tmdbRow = this.buildApiInputRow({
        id: "tmdb",
        label: "TMDB API Key",
        hint: "Free key at",
        hintLink: "https://www.themoviedb.org/settings/api",
        hintLinkText: "themoviedb.org",
      });
      if (tmdbRow) section.appendChild(tmdbRow);

      const mdbRow = this.buildApiInputRow({
        id: "mdblist",
        label: "MDBList API Key",
        hint: "Key at",
        hintLink: "https://mdblist.com/preferences",
        hintLinkText: "mdblist.com",
      });
      if (mdbRow) section.appendChild(mdbRow);

      // --- 2. PREFERENCES SUB-SECTION ---
      const prefsContainer = document.createElement("div");
      prefsContainer.id = "kai-prefs-container";

      prefsContainer.appendChild(
        this.buildCategoryHeader("Preferences", this.ICONS.COG),
      );

      // Language (requires TMDB key)
      const languageContainer = document.createElement("div");
      languageContainer.id = "kai-language-container";
      languageContainer.appendChild(this.buildLanguageRow());
      prefsContainer.appendChild(languageContainer);

      // Rating Toggles (requires MDBlist key)
      const ratingsContainer = document.createElement("div");
      ratingsContainer.id = "kai-ratings-container";
      CONFIG.RATING_PROVIDERS.forEach((p) => {
        ratingsContainer.appendChild(this.buildToggleRow(p.id, p.label));
      });
      prefsContainer.appendChild(ratingsContainer);

      section.appendChild(prefsContainer);

      // Footer
      const footer = document.createElement("div");
      footer.className = "wrapper-FMNA6";

      footer.innerHTML = `<div class="footer-jhua_ kai-api-keys-footer"><div class="description-label-h5DXc kai-info-note">${this.ICONS.NOTE} <span><strong>Note:</strong> Preference changes apply to new items. Clear cache to refresh existing items.</span></div></div>`;
      section.appendChild(footer);

      const children = Array.from(sectionsContainer.children);
      if (children.length >= CONFIG.SECTION_INDEX) {
        sectionsContainer.insertBefore(section, children[CONFIG.SECTION_INDEX]);
      } else {
        sectionsContainer.appendChild(section);
      }

      this.updatePreferencesState();

      // Apply General Settings Patches (Version, GitHub, Donation)
      ConfigurationPatcher.applyPatches();
    },
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GENERAL SETTINGS PATCHER (Version, GitHub, Donation)
  // ─────────────────────────────────────────────────────────────────────────────
  const ConfigurationPatcher = {
    // init removed - driven by UIManager
    // No redundant state - checks DOM directly for idempotency

    applyPatches() {
      if (!window.location.hash.startsWith(CONFIG.TARGET_ROUTE)) return;

      this.injectVersionLabel();
      this.replaceGithubLink();
      this.injectDonationButton();
    },

    injectVersionLabel() {
      const sideMenu = document.querySelector(".side-menu-container-NG17D");
      if (!sideMenu) return;

      // Check if ALREADY injected by looking for unique text content or exact class match if distinct
      // But we used the same class "version-info-label-uMkm7".
      // Let's check if any version label contains "Stremio Kai"
      const existingLabels = sideMenu.querySelectorAll(
        ".version-info-label-uMkm7",
      );
      const alreadyInjected = Array.from(existingLabels).some((el) =>
        el.textContent.includes("Stremio Kai"),
      );
      if (alreadyInjected) return;

      const firstLabel = existingLabels[0]; // Can be undefined if Stremio removes it, but usually there.

      const kaiVersionLabel = document.createElement("div");
      kaiVersionLabel.className = "version-info-label-uMkm7";
      kaiVersionLabel.title = CONFIG.CURRENT_VERSION;
      kaiVersionLabel.textContent =
        "Stremio Kai Version: " + CONFIG.CURRENT_VERSION;

      if (firstLabel) {
        sideMenu.insertBefore(kaiVersionLabel, firstLabel);
      } else {
        sideMenu.appendChild(kaiVersionLabel);
      }
      console.log("[Settings] Kai Version Label injected");
    },

    replaceGithubLink() {
      const links = document.querySelectorAll("a.option-input-container-NPgpT");
      // Find the ORIGINAL Stremio link (by title or partial href)
      // AND ensure it hasn't been modified yet (href check)
      const targetLink = Array.from(links).find(
        (link) =>
          (link.href.includes("stremio-community-v5") ||
            link.title === "Stremio Community V5 Github") &&
          link.href !== CONFIG.GITHUB_URL,
      );

      if (!targetLink) return;

      targetLink.href = CONFIG.GITHUB_URL;
      targetLink.title = "Stremio Kai Github";

      const label = targetLink.querySelector(".label-FFamJ");
      if (label) {
        label.innerHTML = `
             <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                 ${UIManager.ICONS.GITHUB}
                 <span>Stremio Kai Github</span>
             </div>
         `;
      }
      console.log("[Settings] GitHub link replaced");
    },

    injectDonationButton() {
      // Check if wrapper already exists
      if (document.querySelector(".kai-links-row")) return;

      // Find our modified GitHub link to append after/around it
      const githubLink = document.querySelector(
        'a[href="' + CONFIG.GITHUB_URL + '"]',
      );
      // Wait, if replaceGithubLink hasn't run yet, this might fail?
      // But they run in order synchronously.
      if (!githubLink) return;

      const parent = githubLink.parentNode;
      if (!parent) return;

      // Wrap them
      const wrapper = document.createElement("div");
      wrapper.className = "kai-links-row";
      wrapper.style.display = "flex";
      wrapper.style.alignItems = "center";
      wrapper.style.gap = "2rem";
      wrapper.style.marginTop = "0.5rem";

      parent.insertBefore(wrapper, githubLink);
      wrapper.appendChild(githubLink);

      // Star Link
      const starLink = githubLink.cloneNode(true);
      starLink.href = CONFIG.GITHUB_URL;
      starLink.title = "Star on GitHub";
      starLink.classList.add("kai-muted-link");
      const starLabel = starLink.querySelector(".label-FFamJ");
      if (starLabel) {
        starLabel.innerHTML = `
               <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                   ${UIManager.ICONS.STAR}
                   <span>Star the project</span>
               </div>
           `;
      }
      wrapper.appendChild(starLink);

      // Support Link
      const supportLink = githubLink.cloneNode(true);
      supportLink.href = "https://revolut.me/altcelalalt";
      supportLink.title = "Support Development";
      supportLink.classList.add("kai-muted-link");
      const supportLabel = supportLink.querySelector(".label-FFamJ");
      if (supportLabel) {
        supportLabel.innerHTML = `
              <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                  ${UIManager.ICONS.HEART}
                  <span>Support Development</span>
              </div>
           `;
      }
      wrapper.appendChild(supportLink);

      console.log("[Settings] Donation buttons injected");
    },
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // INIT LOGIC
  // ─────────────────────────────────────────────────────────────────────────────
  function init() {
    if (window.MetadataModules.settingsUI.initialized) return;

    // Dependencies
    if (
      !window.MetadataModules.apiKeys ||
      !window.MetadataModules.preferences
    ) {
      setTimeout(init, 500);
      return;
    }

    // Initialize global cleanup listener (once)
    document.addEventListener("click", (e) => {
      // Only close if UIManager is fully loaded and initialized
      if (window.MetadataModules.settingsUI.initialized) {
        if (!e.target.closest(".multiselect-container-w0c9l")) {
          UIManager.closeAllDropdowns(null);
        }
      }
    });

    let debounceTimeout;
    const observer = new MutationObserver(() => {
      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        if (window.location.hash.startsWith(CONFIG.TARGET_ROUTE)) {
          UIManager.injectSection();
        }
      }, 50);
    });

    if (window.location.hash.startsWith(CONFIG.TARGET_ROUTE)) {
      UIManager.injectSection();
      observer.observe(document.body, { childList: true, subtree: true });
    }

    window.addEventListener("hashchange", () => {
      if (window.location.hash.startsWith(CONFIG.TARGET_ROUTE)) {
        UIManager.injectSection();
        observer.observe(document.body, { childList: true, subtree: true });
      } else {
        observer.disconnect();
      }
    });

    window.MetadataModules.settingsUI.initialized = true;

    // Initialize General Settings Patcher immediately
    // ConfigurationPatcher.init(); // Driven by UIManager

    console.log("[Settings UI] Initialized");
  }

  window.MetadataModules.settingsUI = { init };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
