--[[
  @name Profile Manager
  @description Hybrid profile system: static base profiles + dynamic layers
  @version 7.3
  @author allecsc
  
  @changelog
    v7.3 - AUDIO REVOLUTION (Audiophile Standard):
           - Removed ALL dynamic range compression (loudnorm/acompressor).
           - Removed Content Type split (Anime vs Cinema).
           - Added "Night Mode" (Highpass 70Hz + Lowpass 13kHz + Speech Lift).
           - Added "Voice Clarity" (Dual-band Speech Bias).
           - Default is "Reference" (Bit-perfect passthrough).
    v7.2 - AUDIO & LATCH REFACTOR:
           - Audio: Default mode is now "Off" (Vanilla).
           - Audio: "Night Mode" redesigned (Removed loudnorm, added EQ/Compression).
           - Latch: Strict Parameter Validation (Wait for Primaries/Gamma/Colormatrix).
           - Latch: "Smart Reset" (Freshness check) fixes race condition.
    v7.1 - Added Ultrawide Zoom support (panscan toggle via Stremio metdata)
    v7.0 - ARCHITECTURE REFACTOR: Hybrid static+dynamic approach
           - Base profiles (sdr, anime-sdr) in mpv.conf contain only static settings
           - Dynamic layers (HDR handling, shaders, VF chains) applied via mp.set_property()
           - Eliminates profile inheritance bleeding issues
           - Prepares infrastructure for user-configurable presets
    v6.0 - Cleanup: removed dead language/track code, simplified guard and logging
    v5.0 - Simplified: JS handles all DB detection, Lua only does release groups
    v4.0 - Added release group detection, anti-tier blocking
  
  @requires
    - Stremio Kai's mpv-bridge.js v2.0+ (handles DB-based anime detection with caching)
    - mpv.conf profiles: sdr, anime-sdr (base profiles only)
  
  Architecture:
    1. Base profile applied (sdr or anime-sdr)
    2. HDR layer applied (tonemapping OR passthrough, mutually exclusive)
    3. Anime layers applied (shaders + VF chains)
    4. OSD message set dynamically
--]]

local opts = {
    -- Tier 1: Anime-only release groups (from SeaDex curated list + additional research)
    -- These groups ONLY release anime, so matching = definitely anime
    -- NOTE: Use plain names - the matches_group function handles escaping
    anime_release_groups = {
        -- Anime BD Tier 01-04 (Top SeaDex Muxers)
        "Aergia", "Legion", "sam", "smol", "SoM", "Vanilla", "Vodes",
        "Arg0", "LYS1TH3A", "OZR", "SCY", "ZeroBuild",
        "Alt", "ARC", "Arid", "Crow", "DemiHuman", "Drag", "Lulu", "Metal",
        "Moxie", "Not-Vodes", "Smoke", "Thighs", "Yuki",
        "0x539", "aro", "Baws", "BKC", "Brrrrrrr", "Chotab", "CsS", "CUNNY",
        "Cunnysseur", "D-Z0N3", "Dae", "Datte13", "FLFL", "hydes", "iKaos",
        "JySzE", "LostYears", "Matsya", "MC", "McBalls", "MTBB", "Noyr",
        "NSDAB", "Okay-Subs", "pog42", "pyroneko", "RAI", "Reza", "Shimatta",
        "Spirale", "UDF",
        "Ayashii", "CRUCiBLE", "Dekinai", "EXP", "Headpatter", "Kaizoku",
        "Mysteria", "Senjou", "YURI", "ASC", "AssMix", "B00BA", "CBT", "CTR",
        "CyC", "Flugel", "Galator", "GSK", "Holomux", "IK", "AnimeKaizoku",
        "Kametsu", "KH", "kuchikirukia", "LazyRemux", "MK", "Netaro", "Pn8",
        "Pookie", "Quetzal", "Rasetsu", "ShowY", "WBDP", "WSE", "Yoghurt", "ZOIO", "ZR",
        "Asakura", "Bolshevik", "Bulldog", "Chihiro", "Chimera", "Davinci",
        "Doki", "Foxtrot", "Lia", "Orphan", "SOLA", "Tsundere",
        "9volt", "AOmundson", "ASO", "Cait-Sidhe", "CoalGirls", "Commie", "D3",
        "deanzel", "Dragon-Releases", "GHS", "HaiveMind", "hchcsen", "Kaleido",
        "karios", "kBaraka", "kmplx", "Koitern", "Kulot", "MCLR", "mottoj",
        "NH", "NTRM", "RMX", "SallySubs", "Scriptum", "ShadyCrab", "SNSbu",
        "THORA", "UWU", "xPearse",
        -- Anime BD Tier 05 (Remuxes)
        "VULCAN", "BluDragon", "D4C", "Raizel", "REVO", "SRLS", "TTGA", "PMR",
        "Beatrice-Raws", "Nan0", "Zanros",
        -- Anime BD Tier 06 (FanSubs)
        "Afro", "Akai", "Almighty", "ANE", "CH", "Harunatsu", "Impatience",
        "Judgment", "Kantai", "Nii-sama", "Soldado", "Sushi", "Vivid",
        "Watashi", "Yabai", "Asenshi", "BlurayDesuYo", "Bunny-Apocalypse",
        "EJF", "Exiled-Destiny", "E-D", "FFF", "Final8", "GS", "Inka-Subs",
        "LCE", "Licca", "niizk", "Nishi-Taku", "OnDeed", "orz", "PAS",
        "peachflavored", "Saizen", "SCP-2223", "SHiN-gx", "SmugCat", "Zurako",
        "AnimeChap", "ReinForce", "DDY",
        -- Anime BD Tier 07 (P2P/Scene)
        "NPC", "STRiFE", "A-L", "ANiHLS", "CBM", "DHD", "DragsterPS", "HAiKU",
        "Hark0N", "iAHD", "inid4c", "KS", "KiyoshiStar", "MCR", "RedBlade",
        "RH", "SEV", "TENEIGHTY", "WaLMaRT", "Moozzi",
        -- Anime BD Tier 08 (Mini Encodes)
        "EDGE", "EMBER", "GHOST", "Judas", "naiyas", "Prof", "YURASUKA",
        "AkihitoSubs", "Arukoru", "ASW", "Cleo", "DB", "NeoHVC", "Trix",
        "YuiSubs", "Tenrai-Sensei",
        -- Anime Web Tier 01-06
        "Setsugen", "Z4ST1N", "Cyan", "Gao", "Pizza", "tenshi", "Half-Baked",
        "HatSubs", "MALD", "Slyfox", "SoLCE", "SubsPlease", "SubsPlus", "ZigZag",
        "BlueLobster", "Erai-raws", "GST", "HorribleRips", "HorribleSubs",
        "KAN3D2M", "NanDesuKa", "URANIME", "VARYG", "GJM", "SobsPlease",
        "Some-Stuffs", "DameDesuYo", "KawaSubs", "AC", "AnimeRG", "Anime Time",
        "Sokudo", "zza", "One Pace", "ToonsHub", "Kanjouteki", "stition", "TACHiKEN", "Reaktor", "Godim"
    },

    -- Anti-Tier: General release groups (release all content types)
    -- If JP audio but from these groups → likely NOT anime (live-action)
    general_release_groups = {
        -- WEB Tier 01 (Top P2P)
        "ABBIE", "AJP69", "APEX", "PAXA", "PEXA", "XEPA", "BLUTONiUM",
        "CasStudio", "CMRG", "CRFW", "CRUD", "CtrlHD", "FLUX", "GNOME",
        "HONE", "KiNGS", "Kitsune", "monkee", "NOSiViD", "NTb", "NTG",
        "QOQ", "RTN", "SiC", "TEPES", "TheFarm", "T6D", "TOMMY", "ViSUM",
        -- WEB Tier 02
        "3cTWeB", "BTW", "BYNDR", "Cinefeel", "CiT", "Coo7", "dB", "DEEP",
        "END", "ETHiCS", "FC", "Flights", "iJP", "iKA", "iT00NZ", "JETIX",
        "KHN", "KiMCHI", "LAZY", "MiU", "MZABI", "NPMS", "NYH", "orbitron",
        "PHOENiX", "playWEB", "PSiG", "RAWR", "ROCCaT", "RTFM", "SA89",
        "SbR", "SDCC", "SIGMA", "SMURF", "SPiRiT", "TVSmash", "WELP",
        "XEBEC", "4KBEC", "CEBEX", "TBD",
        -- WEB Tier 03
        "Dooky", "DRACULA", "GNOMiSSiON", "NINJACENTRAL", "SLiGNOME",
        "SwAgLaNdEr", "T4H", "ViSiON", "TrollHD", "REL1VIN",
        -- WEB Scene
        "DEFLATE", "INFLATE",
        -- Remux Tiers (general, not anime-specific)
        "3L", "BiZKiT", "BLURANiUM", "CiNEPHiLES", "FraMeSToR", "PmP",
        "PiRAMiDHEAD", "ZQ", "BMF", "WiLDCAT",
        "ATELiER", "NCmt", "playBD", "SiCFoI", "SURFINBIRD", "12GaugeShotgun",
        "decibeL", "EPSiLON", "HiFi", "KRaLiMaRKo", "PTer", "TRiToN",
        "iFT", "PTP", "SumVision", "TOA", "Tigole",
        -- Bluray Tiers (general)
        "BBQ", "c0kE", "CRiSC", "Dariush", "DON", "EbP", "EDPH", "Geek",
        "LolHD", "MainFrame", "TayTO", "TDD", "TnP", "VietHD", "ZoroSenpai",
        "W4NK3R", "EA", "HiDt", "HiSD", "HQMUX", "sbR", "BHDStudio",
        "hallowed", "LoRD", "SPHD", "WEBDV", "playHD",
        -- Common scene/generic tags
        "G66", "Joy", "Monkee", "NOGRP", "MeGusta", "EVO", "AMIABLE", "SPARKS", "RMTeam", "Qxr",
        "RGzsRutracker", "NeoNoir", "Me7alh", "Lat", "MiNX", "sylix", "Silence", "ION10"
    }
}

-- ═══════════════════════════════════════════════════════════════════════════
-- DYNAMIC LAYER CONSTANTS
-- ═══════════════════════════════════════════════════════════════════════════

-- Shader presets (from original mpv.conf comments)
local SHADER_PRESETS = {
    optimized = "~~/shaders/denoise1.glsl;~~/shaders/Anime4K_Clamp_Highlights.glsl;~~/shaders/Anime4K_Restore_CNN_M.glsl;~~/shaders/Anime4K_Upscale_CNN_x2_M.glsl;~~/shaders/Anime4K_AutoDownscalePre_x2.glsl;~~/shaders/Anime4K_AutoDownscalePre_x4.glsl;~~/shaders/Anime4K_Upscale_Denoise_CNN_x2_M.glsl;~~/shaders/Anime4K_Thin_Fast.glsl",
    fast = "~~/shaders/denoise1.glsl;~~/shaders/Anime4K_Clamp_Highlights.glsl;~~/shaders/Anime4K_Restore_CNN_M.glsl;~~/shaders/Anime4K_Upscale_CNN_x2_M.glsl;~~/shaders/Anime4K_Restore_CNN_S.glsl;~~/shaders/Anime4K_AutoDownscalePre_x2.glsl;~~/shaders/Anime4K_AutoDownscalePre_x4.glsl;~~/shaders/Anime4K_Upscale_CNN_x2_S.glsl;~~/shaders/Anime4K_Thin_HQ.glsl;~~/shaders/Anime4K_Thin_Fast.glsl;~~/shaders/Anime4K_Thin_VeryFast.glsl",
    hq = "~~/shaders/nlmeans.glsl;~~/shaders/Anime4K_Clamp_Highlights.glsl;~~/shaders/Anime4K_Restore_CNN_VL.glsl;~~/shaders/Anime4K_Upscale_CNN_x2_VL.glsl;~~/shaders/Anime4K_Restore_CNN_M.glsl;~~/shaders/Anime4K_AutoDownscalePre_x2.glsl;~~/shaders/Anime4K_AutoDownscalePre_x4.glsl;~~/shaders/Anime4K_Upscale_CNN_x2_M.glsl;~~/shaders/Anime4K_Thin_HQ.glsl;~~/shaders/Anime4K_Thin_Fast.glsl;~~/shaders/Anime4K_Thin_VeryFast.glsl"
}

-- VF components (composable)
local VF_FILTERS = {
    -- Base filters (always applied for anime)
    hqdn3d = '@HQDN3D_HIGH:lavfi=[hqdn3d=luma_spatial=5:chroma_spatial=5:luma_tmp=6:chroma_tmp=6]',
    bwdif = '@BWDIF:lavfi=[bwdif=mode=1:parity=auto:deint=all]',
    -- SVP interpolation (anime vs cinema)
    svp_anime = '@SVP:vapoursynth="~~/svp_anime.vpy":buffered-frames=8:concurrent-frames=16',
    svp_cinema = '@SVP:vapoursynth="~~/svp_cinema.vpy":buffered-frames=8:concurrent-frames=16'
}

-- Audio Presets (Audiophile / Non-Destructive)
local AUDIO_FILTERS = {
    -- Night Mode: Aggressive bass cut (120Hz), highs tamed (10kHz), voice boost (+6dB @ 2kHz, Q=2)
    NIGHT = "@NIGHT:lavfi=[highpass=f=120,lowpass=f=10000,equalizer=f=2000:width_type=q:width=2:g=6]",
    
    -- Voice Clarity: Strong intelligibility boost (+8dB @ 2kHz, +6dB @ 4kHz, Q=2)
    VOICE = "@VOICE:lavfi=[highpass=f=80,equalizer=f=2000:width_type=q:width=2:g=8,equalizer=f=4000:width_type=q:width=2:g=6]"
}

-- Audio Cycle State
local audio_state = {
    mode = "off" -- "off" (Default), "night", "voice"
}

-- ═══════════════════════════════════════════════════════════════════════════
-- INTERNAL STATE
-- ═══════════════════════════════════════════════════════════════════════════

local function log(str)
    mp.msg.info("[profile-manager] " .. str)
end

-- Latch State
local state = {
    profile_applied = false,
    video_params_ready = false,
    metadata_ready = false,
    params_cache = nil
}

local utils = require("mp.utils")
local stremio_metadata = nil


-- Forward declaration
local try_execute_profile

-- Stremio metadata bridge
mp.register_script_message("anime-metadata", function(json_str)
    stremio_metadata = utils.parse_json(json_str)
    if stremio_metadata then
        log("Received Stremio metadata:" ..
            " anime=" .. tostring(stremio_metadata.is_anime) .. 
            ", type=" .. tostring(stremio_metadata.content_type) ..
            ", hdr=" .. tostring(stremio_metadata.hdr_passthrough) ..
            ", shaders=" .. tostring(stremio_metadata.shader_preset) ..
            ", svp=" .. tostring(stremio_metadata.svp_enabled) ..
            ", osd=" .. tostring(stremio_metadata.osd_profile_messages) ..
            ", uw=" .. tostring(stremio_metadata.ultrawide_zoom))
            
        state.metadata_ready = true
        state.metadata_arrival = mp.get_time() -- Track arrival time to prevent race-condition wipes
        
        -- Immediate Ultrawide Zoom (safe anytime)
        if stremio_metadata.ultrawide_zoom then
            mp.set_property("panscan", "1.0")
            log("[Ultrawide] Zoom enabled (panscan=1.0)")
        else
            mp.set_property("panscan", "0.0")
        end
        
        -- TRIGGER LATCH
        try_execute_profile()
    end
end)

-- Enhanced HDR detection function
local function detect_hdr(video_params)
    if not video_params then return false end
    
    local primaries = video_params.primaries
    local gamma = video_params.gamma
    local colormatrix = video_params.colormatrix
    
    -- Log the detected values for debugging
    log("Video params - Primaries: " .. tostring(primaries) .. ", Gamma: " .. tostring(gamma) .. ", Colormatrix: " .. tostring(colormatrix))
    
    -- Check for Dolby Vision profile
    if colormatrix == "dolbyvision" then
        log("Dolby Vision detected")
        return true
    end
    
    -- Check for HDR10/HDR10+ via primaries
    if primaries == "bt.2020" or primaries == "rec2020" then
        log("HDR detected via primaries: " .. tostring(primaries))
        return true
    end
    
    -- Check for HDR via gamma/transfer characteristics
    if gamma == "smpte2084" or gamma == "pq" or gamma == "st2084" then
        log("HDR10 detected via gamma: " .. tostring(gamma))
        return true
    end
    
    if gamma == "arib-std-b67" or gamma == "hlg" then
        log("HLG detected via gamma: " .. tostring(gamma))
        return true
    end
    
    -- Additional checks for HDR indicators
    if colormatrix == "bt.2020-ncl" or colormatrix == "bt.2020-cl" or colormatrix == "rec2020" then
        log("HDR detected via colormatrix: " .. tostring(colormatrix))
        return true
    end
    
    return false
end

-- ═══════════════════════════════════════════════════════════════════════════
-- DYNAMIC LAYER HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Apply SDR baseline settings (safe defaults for SDR content or as a reset)
-- Called at the START of every profile application to ensure clean slate
local function apply_sdr_baseline()
    log("Applying SDR baseline (clean slate)")
    
    -- 0. Reset hwdec to safe default (prevents auto-copy from sticking)
    mp.set_property("hwdec", "auto")
    
    -- 1. Reset Rendering Chains (prevents bleed-over without resetting global prefs like volume)
    mp.set_property("glsl-shaders", "")   -- Clear all shaders
    mp.set_property("vf", "")             -- Clear video filters
    mp.set_property("af", "")             -- Clear audio filters
    
    -- 2. Reset Colorspace to Neutral/Auto
    mp.set_property("target-colorspace-hint", "no")   -- Don't trigger HDR mode
    mp.set_property("target-peak", "203")             -- SDR peak (100 nits nominal)
    mp.set_property("hdr-compute-peak", "no")         -- Not needed for SDR
    mp.set_property("hdr-contrast-recovery", "0")     -- Not needed for SDR
    mp.set_property("tone-mapping", "auto")           -- Reset tone mapping
end

-- Apply SVP sync engine policies (forces hwdec=auto-copy and real-time frame sync settings when active)
local function apply_svp_sync_policy(active)
    if active then
        mp.set_property("hwdec", "auto-copy")
        mp.set_property("hr-seek-framedrop", "no")
        mp.set_property("video-latency-hacks", "yes")
        mp.set_property("mc", "0")
        mp.set_property("autosync", "30")
        mp.set_property("vd-queue-enable", "yes")
        mp.set_property("vd-queue-max-bytes", "1024MiB")
        mp.set_property("vd-queue-max-samples", "120")
        mp.set_property("vd-queue-max-secs", "60")
        log("SVP Engine Active: applied real-time sync & enlarged queue buffer (1024MiB / 120 samples)")
    else
        mp.set_property("hwdec", "auto")
        mp.set_property("hr-seek-framedrop", "yes")
        mp.set_property("video-latency-hacks", "no")
        mp.set_property("mc", "-1")
        mp.set_property("autosync", "0")
        mp.set_property("vd-queue-enable", "no")
        log("SVP Engine Inactive: restored default mpv playback baseline")
    end
end

-- Apply HDR passthrough settings (for HDR displays)
local function apply_hdr_passthrough(target_peak)
    log("Applying HDR passthrough layer")
    mp.set_property("target-colorspace-hint", "yes")
    mp.set_property("icc-profile-auto", "no")
    mp.set_property("hdr-compute-peak", "yes")
    mp.set_property("hdr-peak-percentile", "99.9")
    mp.set_property("hdr-peak-decay-rate", "20")
    mp.set_property("hdr-contrast-recovery", "0.3")
    mp.set_property("target-contrast", "inf")
    -- Use user-specified target-peak if provided, else auto
    mp.set_property("target-peak", target_peak or "auto")
    log("Target-peak set to: " .. (target_peak or "auto"))
    -- Reset color adjustments for true passthrough
    mp.set_property("brightness", "0")
    mp.set_property("contrast", "0")
    mp.set_property("gamma", "0")
    mp.set_property("saturation", "0")
end

-- Apply HDR-to-SDR tonemapping settings (for SDR displays)
-- ACTIVE PROCESSING: mpv analyzes HDR signal and maps it to SDR range
local function apply_tonemapping()
    log("Applying HDR-to-SDR tonemapping layer")
    mp.set_property("tone-mapping", "bt.2446a")       -- Balanced, good highlight roll-off
    mp.set_property("tone-mapping-param", "0.5")      -- Adjust highlight compression
    mp.set_property("gamut-mapping-mode", "perceptual")
    mp.set_property("tone-mapping-mode", "hybrid")
    
    -- Dynamic peak detection for scene-by-scene adjustments
    mp.set_property("hdr-compute-peak", "yes")        -- Analyze HDR signal
    mp.set_property("hdr-peak-percentile", "99.8")    -- Ignore extreme highlight outliers
    mp.set_property("hdr-peak-decay-rate", "20")      -- Smooth scene-to-scene transitions
    mp.set_property("hdr-contrast-recovery", "0.3")   -- Recover crushed shadows
end

-- Remove denoise shaders from chain (for legacy/HDR anime)
local function remove_denoise_shaders(shader_chain)
    return shader_chain
        :gsub("~~/shaders/denoise1%.glsl;?", "")
        :gsub("~~/shaders/denoise3%.glsl;?", "")
        :gsub("~~/shaders/nlmeans%.glsl;?", "")
        :gsub(";$", "")  -- Clean trailing semicolon
end

-- Apply anime shader preset
local function apply_anime_shaders(preset, is_legacy, is_hdr)
    local shader_chain = SHADER_PRESETS[preset] or SHADER_PRESETS.optimized
    
    -- Legacy and HDR anime: remove denoise shaders
    if is_legacy or is_hdr then
        shader_chain = remove_denoise_shaders(shader_chain)
        log("Removed denoise shaders for " .. (is_legacy and "legacy" or "HDR") .. " content")
    end
    
    log("Applying shader preset: " .. preset)
    mp.set_property("glsl-shaders", shader_chain)
end

-- Apply anime VF chain (composable: base filter + optional SVP)
local function apply_anime_vf(is_legacy, svp_enabled)
    local base_filter = is_legacy and VF_FILTERS.bwdif or VF_FILTERS.hqdn3d
    
    local base_name = is_legacy and "BWDIF" or "hqdn3d"
    log("Appending VF Base: " .. base_name)
    mp.commandv("vf", "append", base_filter)
    
    if svp_enabled then
        log("Appending VF: SVP (Anime)")
        mp.commandv("vf", "append", VF_FILTERS.svp_anime)
    end
end

-- Extract filename from path/URL
local function get_filename()
    local path = mp.get_property("path") or ""
    -- URL decode common patterns
    path = path:gsub("%%20", " "):gsub("%%5B", "["):gsub("%%5D", "]"):gsub("%%28", "("):gsub("%%29", ")")
    -- Extract filename from path or URL
    local filename = path:match("[^/\\]+$") or path
    return filename
end

-- Check if filename matches any release group with proper word boundaries
-- Patterns checked:
--   1. [GroupName] - bracket format (common for anime fansubs)
--   2. -GroupName. or -GroupName at end - scene format
--   3. (GroupName) - parenthesis format (less common)
local function matches_group(filename, group_list)
    for _, group in ipairs(group_list) do
        -- Escape Lua pattern special chars in group name (except our intentional patterns)
        local escaped = group:gsub("([%(%)%.%%%+%-%*%?%[%]%^%$])", "%%%1")
        
        -- Pattern 1: [GroupName] - bracket format
        if filename:find("%[" .. escaped .. "%]") then
            return group
        end
        
        -- Pattern 2: -GroupName followed by . or end of filename
        if filename:find("%-" .. escaped .. "[%.%s%-%[]") or 
           filename:match("%-" .. escaped .. "$") or
           filename:match("%-" .. escaped .. "%.mkv$") or
           filename:match("%-" .. escaped .. "%.mp4$") then
            return group
        end
        
        -- Pattern 3: x265-GroupName or x264-GroupName (common scene format)
        -- FIXED: Added boundary check to prevent partial matches (e.g. EDGE matching EDGE2020)
        local p3_match = filename:match("x26[45]%-" .. escaped .. "([%.%s%-%[])") or 
                         filename:match("x26[45]%-" .. escaped .. "$") or
                         filename:match("x26[45]%-" .. escaped .. "%.mkv$") or
                         filename:match("x26[45]%-" .. escaped .. "%.mp4$")
        
        if p3_match then
            return group
        end
    end
    return nil
end



-- Visual Identity Application Function
local current_visual_profile = "kai" -- Default tracking

local function apply_visual_settings(profile_name, icc_enabled, is_hdr_passthrough, show_osd)
    -- Update tracking state if a valid profile name is passed
    if profile_name then current_visual_profile = profile_name end
    
    log("[Visuals] Applying Profile: " .. (current_visual_profile or "nil") .. ", ICC: " .. tostring(icc_enabled) .. ", HDR Passthrough: " .. tostring(is_hdr_passthrough))

    -- 1. ICC Profile Logic
    -- FIXED: Force ICC OFF if HDR Passthrough is active (prevents override during cycling)
    if icc_enabled and not is_hdr_passthrough then
        mp.set_property("icc-profile-auto", "yes")
        log("[Visuals] ICC Profile: Validated Auto")
    else
        mp.set_property("icc-profile", "") -- Clears it (sRGB/Monitor Native)
        local reason = is_hdr_passthrough and "Forced OFF (HDR Passthrough)" or "OFF"
        log("[Visuals] ICC Profile: " .. reason)
    end

    -- 2. Color Profile Logic
    
    -- NOTE: We trust the user. If they manually select a profile during HDR playback, apply it.
    -- The "Default to Original" logic is handled int the select_and_apply_profile function.

    if current_visual_profile == "original" then
        mp.set_property("contrast", 0)
        mp.set_property("brightness", 0)
        mp.set_property("saturation", 0)
        mp.set_property("gamma", 0)
        if show_osd then mp.osd_message("Color Profile: Original (Neutral)") end
    elseif current_visual_profile == "vivid" then
        mp.set_property("contrast", 5)
        mp.set_property("brightness", -4)
        mp.set_property("saturation", 15)
        mp.set_property("gamma", -2)
        if show_osd then mp.osd_message("Color Profile: Vivid (High Contrast)") end
    else -- "kai" (default)
        mp.set_property("contrast", 2)
        mp.set_property("brightness", -6)
        mp.set_property("saturation", 2)
        mp.set_property("gamma", 2)
        if show_osd then mp.osd_message("Color Profile: Kai (Cinematic)") end
    end
end

mp.register_script_message("cycle-visual-profile", function()
    -- Check for HDR Passthrough PREFERENCE (logging only)
    -- But we no longer block the user based on it.

    -- Cycle logic: Kai -> Vivid -> Original -> Kai
    if current_visual_profile == "kai" then
        current_visual_profile = "vivid"
    elseif current_visual_profile == "vivid" then
        current_visual_profile = "original"
    else
        current_visual_profile = "kai"
    end
    
    -- Re-apply with current state (preserve ICC setting)
    -- We can retrieve current passthrough state from metadata for logging transparency
    local is_hdr_passthrough = stremio_metadata and stremio_metadata.hdr_passthrough
    local icc_enabled = stremio_metadata and stremio_metadata.icc_profile
    apply_visual_settings(current_visual_profile, icc_enabled, is_hdr_passthrough, true)
end)

-- Helper to apply audio filter non-destructively
local function apply_audio_current()
    -- 1. Remove existing preset (by label) to avoid stacking or conflicts
    mp.commandv("af", "remove", "@NIGHT")
    mp.commandv("af", "remove", "@VOICE")

    -- 2. Determine target filter based on state
    local target_filter = nil
    local osd_name = "Off (Pass-Through)"

    if audio_state.mode == "night" then
        target_filter = AUDIO_FILTERS.NIGHT
        osd_name = "Night Mode"
    elseif audio_state.mode == "voice" then
        target_filter = AUDIO_FILTERS.VOICE
        osd_name = "Voice Clarity"
    else
        -- "off", do nothing (filter already removed)
        osd_name = "Off (Pass-Through)"
    end

    -- 3. Apply if exists
    if target_filter then
        mp.commandv("af", "add", target_filter)
    end

    return osd_name
end

mp.register_script_message("cycle-audio-preset", function()
    -- Cycle Logic: OFF -> NIGHT -> VOICE -> OFF
    if audio_state.mode == "off" then
        audio_state.mode = "night"
    elseif audio_state.mode == "night" then
        audio_state.mode = "voice"
    else
        audio_state.mode = "off"
    end
    
    local name = apply_audio_current()
    mp.osd_message("Audio: " .. name)
    log("[Audio] Cycled to: " .. name)
end)


-- ═══════════════════════════════════════════════════════════════════════════
-- MAIN EXECUTION LATCH
-- ═══════════════════════════════════════════════════════════════════════════

function try_execute_profile()
    -- 1. Check Latch Conditions
    if state.profile_applied then return end
    
    if not state.video_params_ready then
        -- Still waiting for MPV to analyze file
        return 
    end
    
    if not state.metadata_ready then
        -- Waiting for Stremio metadata (Strict Latch)
        log("Latch: Waiting for Metadata...")
        return
    end
    
    -- 2. Lock Latch
    state.profile_applied = true

    
    -- 3. Prepare Data
    local video_params = state.params_cache
    
    log("--- Starting Profile Application ---")
    log("Metadata Ready: " .. tostring(state.metadata_ready))
    
    -- Extract video info
    local height = video_params.h
    local is_interlaced = video_params.interlaced or false
    local is_hdr = detect_hdr(video_params)
    local filename = get_filename()
    
    -- The Decision Logic (Tiered Approach)
    local is_anime = false
    local detection_reason = "None"

    -- TIER 0: Stremio Metadata
    if stremio_metadata and stremio_metadata.is_anime then
        is_anime = true
        detection_reason = "Stremio: " .. (stremio_metadata.detection_reason or "Unknown")
        log("STREMIO MATCH: " .. detection_reason)
    end

    -- TIER 1: Known Anime Release Group
    if not is_anime then
        local matched_group = matches_group(filename, opts.anime_release_groups)
        if matched_group then
            is_anime = true
            detection_reason = "Release Group: " .. matched_group
            log("TIER 1 MATCH: " .. detection_reason)
        end
    end

    -- ANTI-TIER: Block detection if from Known General Release Group
    if not is_anime then
        local blocked_by = matches_group(filename, opts.general_release_groups)
        if blocked_by then
            log("ANTI-TIER: " .. blocked_by)
            detection_reason = "Default (General group: " .. blocked_by .. ")"
        end
    end

    -- ═══════════════════════════════════════════════════════════════════════
    -- HYBRID PROFILE SYSTEM
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- Get preferences (safely handle nil if metadata never arrived)
    local meta = stremio_metadata or {}
    local hdr_passthrough = meta.hdr_passthrough or false
    local shader_preset = meta.shader_preset or "optimized"
    local color_profile = meta.color_profile or "kai"
    local icc_profile_enabled = meta.icc_profile
    local svp_enabled = meta.svp_enabled
    if svp_enabled == nil then svp_enabled = true end
    local svp_global = meta.svp_global or false
    local target_peak = meta.target_peak or "auto"
    local vulkan_mode = meta.vulkan_mode or false

    local is_legacy_anime = is_anime and is_interlaced and height <= 576
    local should_run_global_svp = not is_anime and svp_enabled and svp_global

    if vulkan_mode then
        log("Vulkan mode enabled")
        mp.set_property("gpu-api", "vulkan")
        mp.set_property("vulkan-async-compute", "yes")
        mp.set_property("vulkan-async-transfer", "yes")
    end
    
    -- Determine base profile
    local base_profile = is_anime and "anime-sdr" or "sdr"
    
    -- Build OSD message
    local osd_parts = {}
    if is_anime then
        table.insert(osd_parts, "Anime")
        if is_legacy_anime then table.insert(osd_parts, "Legacy") end
    else
        table.insert(osd_parts, "Cinema")
    end
    if is_hdr then
        table.insert(osd_parts, hdr_passthrough and "HDR" or "HDR→SDR")
    end
    if should_run_global_svp then
        table.insert(osd_parts, "SVP")
    end
    
    -- APPLY
    log("--- FINAL DECISION ---")
    log("Reason: " .. detection_reason)
    log("HDR Status: " .. tostring(is_hdr) .. ", Passthrough: " .. tostring(hdr_passthrough))
    log("Resolution: " .. tostring(height) .. "p")
    log("Legacy Anime: " .. tostring(is_legacy_anime))
    log("Global SVP Active: " .. tostring(should_run_global_svp))

    apply_sdr_baseline()
    
    log("Applying base: " .. base_profile)
    mp.commandv("apply-profile", base_profile)
    
    local is_passthrough_active = false
    if is_hdr then
        if hdr_passthrough then
            apply_hdr_passthrough(target_peak)
            is_passthrough_active = true
        else
            apply_tonemapping()
        end
    end
    
    if is_passthrough_active then
        color_profile = "original"
        log("HDR Passthrough: Forcing 'original' colors")
    end
    
    apply_visual_settings(color_profile, icc_profile_enabled, is_passthrough_active, false)
    
    if is_anime then
        if shader_preset ~= "none" then
            apply_anime_shaders(shader_preset, is_legacy_anime, is_hdr and hdr_passthrough)
        end
        apply_anime_vf(is_legacy_anime, svp_enabled)
    elseif should_run_global_svp then
        log("Appending VF: Global SVP (Cinema)")
        mp.commandv("vf", "append", VF_FILTERS.svp_cinema)
    end

    audio_state.mode = meta.audio_preset or "off"
    apply_audio_current()
    
    -- HWDEC & SVP Sync Engine Policy Application
    apply_svp_sync_policy(is_anime or should_run_global_svp)
    
    -- OSD
    local show_osd = meta.osd_profile_messages
    if show_osd == nil then show_osd = true end
    
    if show_osd then
        local osd_msg = "• " .. table.concat(osd_parts, " • ") .. " •"
        mp.set_property("osd-playing-msg", osd_msg)
        mp.osd_message(osd_msg, 3)
    else
        mp.set_property("osd-playing-msg", "")
    end
    
    log("Profile applied successfully.")
end


-- Observer for video-params (Phase 1 of Latch)
mp.observe_property('video-params', 'native', function(_, params)
    -- STRICT VALIDATION: Ignore partial updates.
    -- We must have ALL components needed by detect_hdr before burning the latch.
    if not params or 
       not params.primaries or 
       not params.gamma or 
       not params.colormatrix then 
        return 
    end
    
    -- Cache params for execution
    state.params_cache = params
    state.video_params_ready = true
    
    -- TRIGGER LATCH
    try_execute_profile()
end)


-- Reset state on new file
mp.register_event('start-file', function()
    -- Clear previous state
    state.profile_applied = false
    state.video_params_ready = false
    state.params_cache = nil
    
    -- Clear stale OSD from previous session
    mp.set_property("osd-playing-msg", "")
    
    -- Smart Metadata Clear: Only clear if it didn't just arrive
    -- This fixes the race condition where metadata arrives milliseconds before start-file
    local now = mp.get_time()
    local arrival = state.metadata_arrival or 0
    if state.metadata_ready and (now - arrival < 2.0) then
        log("Preserving fresh metadata received " .. string.format("%.3f", now - arrival) .. "s ago")
        -- Keep stremio_metadata and state.metadata_ready = true
    else
        state.metadata_ready = false
        stremio_metadata = nil
    end
    
    log("State reset. Waiting for latch (params + metadata)...")
end)
