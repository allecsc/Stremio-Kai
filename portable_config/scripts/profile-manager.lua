--[[
  @name Profile Manager
  @description Hybrid profile system: static base profiles + dynamic layers
  @version 7.0
  @author allecsc
  
  @changelog
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
    -- SVP interpolation (optional, appended if enabled)
    svp = '@SVP:vapoursynth="~~/svp_main.vpy":buffered-frames=8:concurrent-frames=16'
}

-- Audio Presets
local AUDIO_FILTERS = {
    NIGHT  = "@NIGHT:lavfi=[loudnorm=I=-16:TP=-3:LRA=4,acompressor=threshold=0.0625:ratio=4:attack=5:release=300:makeup=1,highpass=f=100,lowpass=f=16000]",
    CINEMA = "@CINEMA:lavfi=[loudnorm=I=-16:TP=-1.5:LRA=20]",
    ANIME  = "@ANIME:lavfi=[loudnorm=I=-16:TP=-1.5:LRA=15]"
}

-- Audio Cycle State
local audio_state = {
    mode = "std", -- "std" (Default), "night", "off"
    is_anime = false
}

-- ═══════════════════════════════════════════════════════════════════════════
-- INTERNAL STATE
-- ═══════════════════════════════════════════════════════════════════════════

local function log(str)
    mp.msg.info("[profile-manager] " .. str)
end

local profile_applied_for_this_file = false
local observer_registered = false
local detection_reason = "None"

-- Stremio metadata bridge (receives cached isAnime from mpv-bridge.js)
local stremio_metadata = nil
local utils = require("mp.utils")

mp.register_script_message("anime-metadata", function(json_str)
    stremio_metadata = utils.parse_json(json_str)
    if stremio_metadata then
        log("Received Stremio metadata:" ..
            " anime=" .. tostring(stremio_metadata.is_anime) .. 
            ", type=" .. tostring(stremio_metadata.content_type) ..
            ", hdr=" .. tostring(stremio_metadata.hdr_passthrough) ..
            ", shaders=" .. tostring(stremio_metadata.shader_preset) ..
            ", svp=" .. tostring(stremio_metadata.svp_enabled))
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
-- A/V SYNC WATCHDOG
-- ═══════════════════════════════════════════════════════════════════════════

local Watchdog = {
    timer = nil,
    grace_period_end = 0,
    consecutive_errors = 0,
    THRESHOLD = 0.4, -- seconds (video lagging behind audio)
    MAX_ERRORS = 2
}

function Watchdog:start()
    self:stop() -- Ensure no previous timer
    self.grace_period_end = mp.get_time() + 5 -- 5s grace period
    self.consecutive_errors = 0
    
    self.timer = mp.add_periodic_timer(1.0, function()
        self:check()
    end)
    log("[Watchdog] Started active monitoring")
end

function Watchdog:stop()
    if self.timer then
        self.timer:kill()
        self.timer = nil
        -- log("[Watchdog] Stopped")
    end
end

function Watchdog:check()
    -- Skip if paused or in grace period
    if mp.get_property_bool("pause") then return end
    if mp.get_property_bool("seeking") then return end
    if mp.get_time() < self.grace_period_end then return end
    
    -- Skip if fast-forwarding (speed > 2.0)
    -- This prevents the watchdog from fighting notify_skip during 90x skips
    if mp.get_property_number("speed", 1) > 2 then return end

    local av_delay = mp.get_property_number("avsync") or 0
    
    -- "avsync" is Audio Time - Video Time. 
    -- Positive/High value means Audio is ahead (Video lagging).
    -- User reports Video lagging, so we look for positive drift.
    
    if av_delay > self.THRESHOLD then
        self.consecutive_errors = self.consecutive_errors + 1
        log(string.format("[Watchdog] Drift detected: %.3fs (Count: %d/%d)", av_delay, self.consecutive_errors, self.MAX_ERRORS))
        
        if self.consecutive_errors >= self.MAX_ERRORS then
            self:resync()
        end
    else
        if self.consecutive_errors > 0 then
            self.consecutive_errors = 0
            log(string.format("[Watchdog] Drift recovered (current: %.3fs)", av_delay))
        end
    end
end

function Watchdog:resync()
    log("[Watchdog] CRITICAL DESYNC DETECTED - Forcing Hard Resync")
    mp.commandv("seek", "0", "relative+exact")
    self.consecutive_errors = 0
    self.grace_period_end = mp.get_time() + 2 -- Give it 2s to settle after seek
end

-- ═══════════════════════════════════════════════════════════════════════════
-- DYNAMIC LAYER HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Apply SDR baseline settings (safe defaults for SDR content or as a reset)
-- Called at the START of every profile application to ensure clean slate
local function apply_sdr_baseline()
    log("Applying SDR baseline (clean slate)")
    
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
        log("Appending VF: SVP")
        mp.commandv("vf", "append", VF_FILTERS.svp)
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
        if filename:find("x26[45]%-" .. escaped) then
            return group
        end
    end
    return nil
end

function select_and_apply_profile(name, video_params)
    if profile_applied_for_this_file then return end

    -- Wait for video params to be fully loaded
    -- HDR detection needs: primaries, gamma, colormatrix
    -- Legacy detection needs: h, interlaced
    if not video_params or not video_params.h then
        return
    end
    
    -- Wait for video params to be fully loaded
    local primaries = video_params.primaries
    local gamma = video_params.gamma
    local colormatrix = video_params.colormatrix
    
    if not primaries or not gamma or not colormatrix then
        return
    end

    log("--- Starting Profile Evaluation ---")
    
    -- Extract video info
    local height = video_params.h
    local is_interlaced = video_params.interlaced or false
    local is_hdr = detect_hdr(video_params)
    
    -- Get filename for release group detection
    local filename = get_filename()
    
    -- The Decision Logic (Tiered Approach)
    local is_anime = false

    -- TIER 0: Stremio Metadata (cached isAnime from DB)
    if stremio_metadata and stremio_metadata.is_anime then
        is_anime = true
        detection_reason = "Stremio: " .. (stremio_metadata.detection_reason or "Unknown")
        log("STREMIO MATCH: " .. detection_reason)
    end

    -- TIER 1: Known Anime Release Group (from filename)
    if not is_anime then
        local matched_group = matches_group(filename, opts.anime_release_groups)
        if matched_group then
            is_anime = true
            detection_reason = "Release Group: " .. matched_group
            log("TIER 1 MATCH: " .. detection_reason)
        end
    end

    -- ANTI-TIER: Block detection if from Known General Release Group
    -- Only logs for debugging, doesn't affect is_anime (which is already false)
    if not is_anime then
        local blocked_by = matches_group(filename, opts.general_release_groups)
        if blocked_by then
            log("ANTI-TIER: File from general group '" .. blocked_by .. "' - confirmed non-anime")
            detection_reason = "Default (General group: " .. blocked_by .. ")"
        end
    end

-- Visual Identity Application Function
local current_visual_profile = "kai" -- Default tracking

local function apply_visual_settings(profile_name, icc_enabled, is_hdr_passthrough, show_osd)
    -- Update tracking state if a valid profile name is passed
    if profile_name then current_visual_profile = profile_name end
    
    log("[Visuals] Applying Profile: " .. (current_visual_profile or "nil") .. ", ICC: " .. tostring(icc_enabled) .. ", HDR Passthrough: " .. tostring(is_hdr_passthrough))

    -- 1. ICC Profile Logic
    if icc_enabled then
        mp.set_property("icc-profile-auto", "yes")
        log("[Visuals] ICC Profile: Validated Auto")
    else
        mp.set_property("icc-profile", "") -- Clears it (sRGB/Monitor Native)
        log("[Visuals] ICC Profile: OFF")
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
    mp.commandv("af", "remove", "@CINEMA")
    mp.commandv("af", "remove", "@ANIME")

    -- 2. Determine target filter based on state and content type
    local target_filter = nil
    local osd_name = "Off"

    if audio_state.mode == "night" then
        target_filter = AUDIO_FILTERS.NIGHT
        osd_name = "Night Mode"
    elseif audio_state.mode == "std" then
        if audio_state.is_anime then
            target_filter = AUDIO_FILTERS.ANIME
            osd_name = "Anime"
        else
            target_filter = AUDIO_FILTERS.CINEMA
            osd_name = "Cinema"
        end
    else
        -- "off", do nothing (filter already removed)
        osd_name = "Off"
    end

    -- 3. Apply if exists
    if target_filter then
        mp.commandv("af", "add", target_filter)
    end

    return osd_name
end

mp.register_script_message("cycle-audio-preset", function()
    -- Cycle Logic: STD -> NIGHT -> OFF -> STD
    if audio_state.mode == "std" then
        audio_state.mode = "night"
    elseif audio_state.mode == "night" then
        audio_state.mode = "off"
    else
        audio_state.mode = "std"
    end
    
    local name = apply_audio_current()
    mp.osd_message("Audio Preset: " .. name)
    log("[Audio] Cycled to: " .. name)
end)

    -- ═══════════════════════════════════════════════════════════════════════
    -- HYBRID PROFILE SYSTEM: Base Profile + Dynamic Layers
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- HDR passthrough preference from Stremio settings
    local hdr_passthrough = stremio_metadata and stremio_metadata.hdr_passthrough or false
    
    -- Legacy anime detection: interlaced SD content (≤576p)
    local is_legacy_anime = is_anime and is_interlaced and height <= 576
    
    -- Shader preset from Stremio settings (default: "optimized")
    local shader_preset = stremio_metadata and stremio_metadata.shader_preset or "optimized"

    -- Color Profile (default: "kai")
    local color_profile = stremio_metadata and stremio_metadata.color_profile or "kai"
    
    -- ICC Profile Toggle (default: false/nil)
    local icc_profile_enabled = stremio_metadata and stremio_metadata.icc_profile
    
    -- SVP enabled from Stremio settings (default: true)
    local svp_enabled = stremio_metadata and stremio_metadata.svp_enabled
    if svp_enabled == nil then svp_enabled = true end
    
    -- Target Peak from Stremio settings (default: "auto")
    local target_peak = stremio_metadata and stremio_metadata.target_peak or "auto"
    
    -- Vulkan Mode from Stremio settings (default: false)
    local vulkan_mode = stremio_metadata and stremio_metadata.vulkan_mode or false
    if vulkan_mode then
        log("Vulkan mode enabled by user preference")
        mp.set_property("gpu-api", "vulkan")
        mp.set_property("vulkan-async-compute", "yes")
        mp.set_property("vulkan-async-transfer", "yes")
    end
    
    -- Determine base profile
    local base_profile = is_anime and "anime-sdr" or "sdr"
    
    -- Build OSD message dynamically
    local osd_parts = {}
    if is_anime then
        table.insert(osd_parts, "Anime")
        if is_legacy_anime then
            table.insert(osd_parts, "Legacy")
            detection_reason = detection_reason .. " + Interlaced"
        end
    else
        table.insert(osd_parts, "Cinema")
        detection_reason = "Default (No Anime Detected)"
    end
    if is_hdr then
        if hdr_passthrough then
            table.insert(osd_parts, "HDR")
        else
            table.insert(osd_parts, "HDR→SDR")
        end
    end
    
    log("--- FINAL DECISION ---")
    log("Reason: " .. detection_reason)
    log("HDR Status: " .. tostring(is_hdr) .. ", Passthrough: " .. tostring(hdr_passthrough))
    log("Resolution: " .. tostring(height) .. "p")
    log("Legacy Anime: " .. tostring(is_legacy_anime))
    
    -- STEP 0: Reset colorspace to clean SDR baseline (prevents HDR state bleeding)
    apply_sdr_baseline()
    
    -- STEP 1: Apply base profile
    log("Applying base profile: " .. base_profile)
    mp.commandv("apply-profile", base_profile)
    
    -- STEP 2: Apply HDR layer (mutually exclusive)
    local is_passthrough_active = false
    if is_hdr then
        if hdr_passthrough then
            apply_hdr_passthrough(target_peak)
            is_passthrough_active = true
        else
            apply_tonemapping()
        end
    end
    
    -- STEP 3: Apply Visual Identity (Color & ICC)
    -- Logic: Default to "Original" for HDR Passthrough, but allow user overrides later
    if is_passthrough_active then
        color_profile = "original"
        log("HDR Passthrough active: Defaulting to 'original' color profile (User can override)")
    end
    
    apply_visual_settings(color_profile, icc_profile_enabled, is_passthrough_active, false)
    
    -- STEP 4: Apply anime-specific layers
    if is_anime then
        -- Apply shaders only if preset is not "none"
        if shader_preset ~= "none" then
            apply_anime_shaders(shader_preset, is_legacy_anime, is_hdr and hdr_passthrough)
        else
            log("Shaders disabled (preset: none)")
        end
        apply_anime_vf(is_legacy_anime, svp_enabled)
    end

    -- STEP 5: Apply Audio Defaults (Context Aware)
    audio_state.is_anime = is_anime
    audio_state.mode = "std" -- Always reset to standard (appropriate default) on file load
    apply_audio_current()
    
    -- STEP 5.5: Enable hwdec=auto-copy for SERIES (required for VF-based intro detection)
    -- Note: This is required for filters (SVP/Blackdetect) to see frames.
    local content_type = stremio_metadata and stremio_metadata.content_type or "unknown"
    if content_type == "series" then
        mp.set_property("hwdec", "auto-copy")
        log("Series detected: Enabled hwdec=auto-copy for VF-data access")
    end
    
    -- STEP 6: Set OSD message dynamically (respect user preference)
    local show_osd_profile = stremio_metadata and stremio_metadata.osd_profile_messages
    if show_osd_profile == nil then show_osd_profile = true end -- Default true
    
    local osd_msg = "• " .. table.concat(osd_parts, " • ") .. " •"
    if show_osd_profile then
        mp.set_property("osd-playing-msg", osd_msg)
        log("OSD message: " .. osd_msg)
    else
        mp.set_property("osd-playing-msg", "")
        log("OSD profile messages disabled by user")
    end
    
    -- A/V RESYNC: Anime profiles have heavy shaders/VF that cause desync on D3D11
    if is_anime then
        Watchdog:start()
        
        -- FORCE PIPELINE SETTLE: Start paused to let shaders compile/init logic run
        -- This prevents the "silent desync" race condition by holding playback until ready.
        -- mp.set_property("pause", "yes")
        -- log("[Startup] Pausing for 2.0s to allow GPU pipeline to settle...")
        
        -- DEFERRED RESYNC: Instead of pausing, schedule a micro-seek to force A/V realignment after SVP loads
        mp.add_timeout(2.5, function()
            -- Checks: Don't seek if user paused or is skipping
            if not mp.get_property_bool("pause") and mp.get_property_number("speed", 1) <= 1.5 then
                 -- Send signal to reactive_vf_bypass.lua to ignore this specific seek
                 -- This prevents it from stripping SVP filters during our maintenance seek
                 mp.commandv("script-message", "bypass-ignore-seek")
                 
                 -- Seek 0 to realign audio/video clock
                mp.commandv("seek", "0", "relative+exact") 
                log("SVP Initialization: Performed micro-seek for A/V sync")
            end
        end)
    end
    
    profile_applied_for_this_file = true
    
    -- Unregister the observer once profile is applied
    mp.unobserve_property(select_and_apply_profile)
    observer_registered = false
    log("Profile and dynamic layers applied. Observer unregistered.")
end

-- Use a self-unregistering observer to wait for metadata (crucial for streams)
mp.observe_property('video-params', 'native', select_and_apply_profile)
observer_registered = true

-- Reset the flag when a new file is loaded
mp.register_event('start-file', function()
    -- =======================================================================
    -- LIST CLEARS ONLY: mpv.conf has reset-on-next-file=all for scalar options
    -- Use change-list for lists as failsafe (most reliable method)
    -- =======================================================================
    
    mp.commandv("change-list", "glsl-shaders", "clr", "")
    mp.commandv("change-list", "vf", "clr", "")
    mp.commandv("change-list", "af", "clr", "")
    

    
    -- Stop any active watchdog from previous file
    Watchdog:stop()
    
    log("Lists cleared. Waiting for profile selection...")
    
    profile_applied_for_this_file = false
    detection_reason = "None"
    
    -- Only register if not already registered (prevents observer leak)
    if not observer_registered then
        mp.observe_property('video-params', 'native', select_and_apply_profile)
        observer_registered = true
    end
end)
