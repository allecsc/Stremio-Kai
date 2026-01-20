--[[
  @name Smart Track Selector
  @description Automatically selects best audio and subtitle tracks based on configurable preferences
  @version 1.4.0
  @author allecsc
  
  @changelog
    v1.4.0 - Critical optimization: Reduced track list fetching overhead
           - Restored missing subtitle keyword priority logic
           - Added native forced override (bypasses rejection for native audio)
           - Removed obsolete audio priority keywords logic
    v1.3.0 - Added match_audio_to_video: prefer audio matching video track language
           - Added use_forced_for_native: auto-select forced subs for native audio
    v1.2.0 - Added prefer_external_subs option: external subs are prioritized
             over embedded when enabled (useful for manual subtitle files)
    v1.1.0 - Added external subtitle watching: re-evaluates when new subs
             load if no preferred language was found initially (10s window)
    v1.0.0 - Complete rewrite from smart_subs.lua
           - Added audio track selection with rejection lists
           - Improved scoring system (language priority + keyword position)
           - Added defense mechanism for both audio and subtitles
           - Fixed keyword matching (ASCII case-insensitive, substring search)
  
  @requires
    - script-opts/smart_track_selector.conf
  
  Case Sensitivity:
    - ASCII (A-Z):     Case-insensitive (sign matches SIGNS, Signs, etc.)
    - Non-ASCII:       Case-sensitive (надписи does NOT match Надписи)
                       Include all case variants in config for non-ASCII keywords
  
  Scoring Hierarchy:
    1. Language Priority  - Position in preferred_langs list (lower = better)
    2. Keyword Priority   - Position in priority_keywords list (lower = better)
                           Tracks with NO keyword get neutral score (middle of list)
    3. Track Order        - File order as tiebreaker (lower = better)
--]]

local mp = require 'mp'
local options = require 'mp.options'
local utils = require 'mp.utils'

--------------------------------------------------------------------------------
-- 1. CONFIGURATION
--------------------------------------------------------------------------------
-- All defaults are empty. Actual values come from smart_track_selector.conf
local config = {
    -- Subtitle settings
    sub_preferred_langs = "",
    sub_priority_keywords = "",
    sub_reject_keywords = "",
    sub_reject_langs = "",

    -- Audio settings
    audio_preferred_langs = "",
    audio_reject_keywords = "",
    audio_reject_langs = "",

    -- Behavior
    match_audio_to_video = false,  -- When true, prefer audio matching video track language
    use_forced_for_native = false, -- When true, select forced subs when audio matches their language
    debug_logging = false
}

options.read_options(config, "smart_track_selector")

--------------------------------------------------------------------------------
-- 2. CONSTANTS (not configurable)
--------------------------------------------------------------------------------
local DEFENSE_DURATION = 5   -- seconds to defend selection from external changes
local SCRIPT_NAME = "smart_track_selector"

--------------------------------------------------------------------------------
-- 3. STATE
--------------------------------------------------------------------------------
local state = {
    best_sid = nil,
    best_aid = nil,
    defense_active = false,
    parsed_config = nil,      -- Cache parsed lists
}

--------------------------------------------------------------------------------
-- 4. LOGGING
--------------------------------------------------------------------------------
local function log_info(msg)
    mp.msg.info(msg)
end

local function log_debug(msg)
    if config.debug_logging then
        mp.msg.verbose("[DEBUG] " .. msg)
    end
end

local function log_verbose(msg)
    mp.msg.verbose(msg)
end

--------------------------------------------------------------------------------
-- 5. STRING MATCHING UTILITIES
--------------------------------------------------------------------------------

-- Check if haystack contains needle (case-insensitive for ASCII only)
-- For non-ASCII characters (Cyrillic, Japanese, etc.), matching is CASE-SENSITIVE.
-- Users should include all case variants in their keyword lists for non-ASCII.
local function contains_keyword(haystack, needle)
    if not haystack or not needle or needle == "" then return false end

    -- Try case-insensitive match using ASCII lowercase
    local lower_haystack = haystack:lower()
    local lower_needle = needle:lower()

    -- Plain string find (no pattern matching)
    return lower_haystack:find(lower_needle, 1, true) ~= nil
end

--------------------------------------------------------------------------------
-- 6. PARSING
--------------------------------------------------------------------------------

-- Parse comma-separated string into array (trimmed, no case conversion here)
local function parse_list(str)
    if not str or str == "" then return {} end

    local list = {}
    for item in string.gmatch(str, "([^,]+)") do
        local trimmed = item:match("^%s*(.-)%s*$")
        if trimmed and trimmed ~= "" then
            table.insert(list, trimmed)
        end
    end
    return list
end

-- Parse all config lists once
local function parse_config()
    if state.parsed_config then return state.parsed_config end

    state.parsed_config = {
        sub = {
            preferred_langs = parse_list(config.sub_preferred_langs),
            priority_keywords = parse_list(config.sub_priority_keywords),
            reject_keywords = parse_list(config.sub_reject_keywords),
            reject_langs = parse_list(config.sub_reject_langs)
        },
        audio = {
            preferred_langs = parse_list(config.audio_preferred_langs),
            reject_keywords = parse_list(config.audio_reject_keywords),
            reject_langs = parse_list(config.audio_reject_langs)
        }
    }

    log_debug("Parsed config:")
    log_debug("  sub_preferred_langs: " .. table.concat(state.parsed_config.sub.preferred_langs, ", "))
    log_debug("  sub_reject_keywords: " .. table.concat(state.parsed_config.sub.reject_keywords, ", "))
    log_debug("  audio_preferred_langs: " .. table.concat(state.parsed_config.audio.preferred_langs, ", "))
    log_debug("  audio_reject_langs: " .. table.concat(state.parsed_config.audio.reject_langs, ", "))

    return state.parsed_config
end

--------------------------------------------------------------------------------
-- 7. TRACK EVALUATION
--------------------------------------------------------------------------------

-- Check if language matches any in the list
local function matches_language(track_lang, lang_list)
    if not track_lang or #lang_list == 0 then return false, 0 end

    for i, lang in ipairs(lang_list) do
        if contains_keyword(track_lang, lang) then
            return true, i  -- Return position for scoring
        end
    end
    return false, 0
end

-- Check if title contains any keyword from the list, returns position (1 = best)
local function matches_keyword(title, keyword_list)
    if not title or #keyword_list == 0 then return false, 0 end

    for i, keyword in ipairs(keyword_list) do
        if contains_keyword(title, keyword) then
            return true, i  -- Return position for scoring
        end
    end
    return false, 0
end

-- Evaluate a single track, returns nil if rejected, or a score table
local function evaluate_track(track, track_type, cfg)
    local title = track.title or ""
    local lang = track.lang or ""

    -- Treat forced flag as "forced" keyword for robust matching
    if track.forced then
        title = title .. " forced"
    end

    log_debug(string.format("  Evaluating %s track #%d: lang='%s', title='%s'",
        track_type, track.id, lang, title))

    -- REJECTION CHECKS (early exit)



    -- Check rejected languages
    if matches_language(lang, cfg.reject_langs) then
        log_debug("    → REJECTED: language in reject list")
        return nil
    end

    -- Check rejected keywords in title
    if matches_keyword(title, cfg.reject_keywords) then
        log_debug("    → REJECTED: keyword in title matches reject list")
        return nil
    end

    -- SCORING

    local score = {
        lang_priority = 999,
        keyword_priority = 999,
        track_order = track.id
    }

    -- Language scoring
    local lang_match, lang_pos = matches_language(lang, cfg.preferred_langs)
    if lang_match then
        score.lang_priority = lang_pos
        log_debug(string.format("    + Language match at priority %d", lang_pos))
    end

    -- Keyword scoring (Priority Keywords)
    -- Only relevant if configured (mostly for subtitles)
    if cfg.priority_keywords and #cfg.priority_keywords > 0 then
        local key_match, key_pos = matches_keyword(title, cfg.priority_keywords)
        if key_match then
            score.keyword_priority = key_pos
            log_debug(string.format("    + Priority keyword match at priority %d", key_pos))
        end
    end

    return score
end

-- Compare two scores, return true if score_a is better than score_b
local function is_better_score(score_a, score_b)
    if not score_b then return true end
    if not score_a then return false end



    -- Language priority (lower is better)
    if score_a.lang_priority < score_b.lang_priority then return true end
    if score_a.lang_priority > score_b.lang_priority then return false end

    -- Keyword priority (lower is better, used if languages are equal)
    if score_a.keyword_priority < score_b.keyword_priority then return true end
    if score_a.keyword_priority > score_b.keyword_priority then return false end



    -- Track order as tiebreaker (lower is better)
    return score_a.track_order < score_b.track_order
end

--------------------------------------------------------------------------------
-- 8. SELECTION LOGIC
--------------------------------------------------------------------------------

local function select_best_track(track_type, track_list)
    if not track_list then return nil end

    local cfg = parse_config()[track_type]
    if not cfg then
        log_info("No config for track type: " .. track_type)
        return nil
    end

    -- Check if we have any preferences configured
    local has_prefs = #cfg.preferred_langs > 0 or #cfg.reject_keywords > 0 or
                      #cfg.reject_langs > 0

    if not has_prefs then
        log_debug("No preferences configured for " .. track_type .. ", skipping selection")
        return nil
    end

    log_info(string.format("Analyzing %s tracks...", track_type))

    local best_track = nil
    local best_score = nil

    for _, track in ipairs(track_list) do
        if track.type == track_type then
            local score = evaluate_track(track, track_type, cfg)

            if score and is_better_score(score, best_score) then
                best_track = track
                best_score = score
            end
        end
    end

    if best_track then
        log_info(string.format("Selected %s track #%d: %s (%s)",
            track_type, best_track.id,
            best_track.title or "(no title)",
            best_track.lang or "(no lang)"))
        return best_track.id
    else
        log_info("No suitable " .. track_type .. " track found")
        return nil
    end
end

-- Get the language of the first video track (used for match_audio_to_video)
local function get_video_language(track_list)
    for _, track in ipairs(track_list) do
        if track.type == "video" and track.lang then
            return track.lang
        end
    end
    return nil
end

-- Select audio track matching video language (for match_audio_to_video feature)
-- Returns track ID if found, nil otherwise
local function select_audio_by_vlang(track_list)
    if not config.match_audio_to_video then return nil end
    
    local vlang = get_video_language(track_list)
    if not vlang then
        log_debug("match_audio_to_video: No video language tag found")
        return nil
    end
    
    log_info(string.format("Video language detected: %s", vlang))
    
    local cfg = parse_config()["audio"]
    
    -- Find audio track matching vlang (but not in reject list)
    for _, track in ipairs(track_list) do
        if track.type == "audio" and track.lang then
            -- Check if this track matches vlang
            if contains_keyword(track.lang, vlang) then
                -- Check if this language is rejected
                if cfg and matches_language(track.lang, cfg.reject_langs) then
                    log_debug(string.format("  Skipping audio #%d (%s) - language rejected", track.id, track.lang))
                else
                    -- Check reject keywords
                    local title = track.title or ""
                    if cfg and matches_keyword(title, cfg.reject_keywords) then
                        log_debug(string.format("  Skipping audio #%d (%s) - keyword rejected", track.id, title))
                    else
                        log_info(string.format("Selected audio #%d matching video language (%s)", track.id, vlang))
                        return track.id
                    end
                end
            end
        end
    end
    
    log_debug("match_audio_to_video: No matching audio track found, falling back to normal selection")
    return nil
end

-- Get the language of the selected audio track
local function get_selected_audio_language(track_list)
    if not state.best_aid then return nil end
    
    for _, track in ipairs(track_list) do
        if track.type == "audio" and track.id == state.best_aid then
            return track.lang
        end
    end
    return nil
end

-- Select forced subtitle matching audio language (for use_forced_for_native feature)
-- Returns track ID if found, nil otherwise
local function select_forced_sub_for_native(track_list)
    if not config.use_forced_for_native then return nil end
    
    local alang = get_selected_audio_language(track_list)
    if not alang then
        log_debug("use_forced_for_native: No audio language detected")
        return nil
    end
    
    local cfg = parse_config()["sub"]
    
    -- Find forced subtitle matching audio language
    for _, track in ipairs(track_list) do
        if track.type == "sub" and track.lang then
            -- Check for forced flag OR "forced" in title
            local is_forced = track.forced
            local title = (track.title or ""):lower()
            if not is_forced and title:find("forced") then
                is_forced = true
            end

            if is_forced then
                log_verbose(string.format("  Checking forced candidate #%d (%s) against audio (%s)", track.id, track.lang, alang))
                -- Check if this track matches audio language
                if contains_keyword(track.lang, alang) then
                    -- For native forced subs, we override rejection rules (e.g. "forced" keyword)
                    log_info(string.format("Selected forced sub #%d for native audio (%s) [Override Rejection]", track.id, alang))
                    return track.id
                else
                    log_verbose(string.format("    -> Lang mismatch: track='%s' vs audio='%s'", track.lang, alang))
                end
            end
        end
    end
    
    log_debug(string.format("use_forced_for_native: No forced sub found for audio language '%s'", alang))
    return nil
end

--------------------------------------------------------------------------------
-- 9. DEFENSE MECHANISM
--------------------------------------------------------------------------------

local function defend_subtitle(name, value)
    if not state.defense_active or not state.best_sid then return end

    if value and value ~= state.best_sid then
        mp.set_property("sid", state.best_sid)
        log_verbose(string.format("Restored subtitle track #%d (overrode external change)", state.best_sid))
    end
end

local function defend_audio(name, value)
    if not state.defense_active or not state.best_aid then return end

    if value and value ~= state.best_aid then
        mp.set_property("aid", state.best_aid)
        log_verbose(string.format("Restored audio track #%d (overrode external change)", state.best_aid))
    end
end

local function activate_defense()
    if not state.best_sid and not state.best_aid then return end

    state.defense_active = true
    log_debug(string.format("Defense activated for %d seconds", DEFENSE_DURATION))

    mp.add_timeout(DEFENSE_DURATION, function()
        state.defense_active = false
        log_debug("Defense period ended")
    end)
end



--------------------------------------------------------------------------------
-- 11. MAIN ORCHESTRATOR
--------------------------------------------------------------------------------

local function on_file_loaded()
    -- Reset state
    state.best_sid = nil
    state.best_aid = nil
    state.defense_active = false
    state.parsed_config = nil  -- Re-parse config (allows hot-reload of conf file)

    -- AUDIO SELECTION
    local track_list = mp.get_property_native("track-list") or {}

    -- Priority 1: Try to match video language (if match_audio_to_video is enabled)
    state.best_aid = select_audio_by_vlang(track_list)
    
    -- Priority 2: Fall back to normal selection
    if not state.best_aid then
        state.best_aid = select_best_track("audio", track_list)
    end
    
    if state.best_aid then
        mp.set_property("aid", state.best_aid)
    end

    -- SUBTITLE SELECTION
    -- Priority 1: Try forced sub for native audio (if use_forced_for_native is enabled)
    state.best_sid = select_forced_sub_for_native(track_list)
    
    -- Priority 2: Fall back to normal selection
    if not state.best_sid then
        state.best_sid = select_best_track("sub", track_list)
    end
    
    if state.best_sid then
        mp.set_property("sid", state.best_sid)
    end
    


    -- Activate defense
    activate_defense()
end

--------------------------------------------------------------------------------
-- 12. INITIALIZATION & EVENT REGISTRATION
--------------------------------------------------------------------------------

mp.register_event("file-loaded", on_file_loaded)
mp.observe_property("sid", "number", defend_subtitle)
mp.observe_property("aid", "number", defend_audio)

--------------------------------------------------------------------------------
-- 13. DYNAMIC CONFIGURATION (SCRIPT MESSAGE)
--------------------------------------------------------------------------------

local function update_config(json_data)
    if not json_data then return end
    
    log_info("Received raw config data: " .. tostring(json_data))

    local success, new_config = pcall(function() return utils.parse_json(json_data) end)
    
    if not success or not new_config then
        log_info("Failed to parse config JSON")
        return
    end
    
    
    log_info("Received dynamic config update")

    -- Ensure config is parsed/initialized before we try to update it
    parse_config()
    
    -- Update internal config (override definition)
    -- We map the keys from JS to our config keys
    
    if new_config.sub_preferred_langs ~= nil then
        config.sub_preferred_langs = new_config.sub_preferred_langs
        state.parsed_config.sub.preferred_langs = parse_list(new_config.sub_preferred_langs)
        log_debug("  Updated sub_preferred_langs: " .. tostring(new_config.sub_preferred_langs))
    end

    if new_config.sub_priority_keywords ~= nil then
        config.sub_priority_keywords = new_config.sub_priority_keywords
        state.parsed_config.sub.priority_keywords = parse_list(new_config.sub_priority_keywords)
        log_debug("  Updated sub_priority_keywords: " .. tostring(new_config.sub_priority_keywords))
    end
    
    if new_config.audio_preferred_langs ~= nil then
        config.audio_preferred_langs = new_config.audio_preferred_langs
        state.parsed_config.audio.preferred_langs = parse_list(new_config.audio_preferred_langs)
        log_debug("  Updated audio_preferred_langs: " .. tostring(new_config.audio_preferred_langs))
    end
    
    if new_config.sub_reject_langs ~= nil then
        config.sub_reject_langs = new_config.sub_reject_langs
        state.parsed_config.sub.reject_langs = parse_list(new_config.sub_reject_langs)
        log_debug("  Updated sub_reject_langs: " .. tostring(new_config.sub_reject_langs))
    end
    
    if new_config.audio_reject_langs ~= nil then
        config.audio_reject_langs = new_config.audio_reject_langs
        state.parsed_config.audio.reject_langs = parse_list(new_config.audio_reject_langs)
        log_debug("  Updated audio_reject_langs: " .. tostring(new_config.audio_reject_langs))
    end

    if new_config.audio_reject_keywords ~= nil then
        config.audio_reject_keywords = new_config.audio_reject_keywords
        state.parsed_config.audio.reject_keywords = parse_list(new_config.audio_reject_keywords)
        log_debug("  Updated audio_reject_keywords: " .. tostring(new_config.audio_reject_keywords))
    end

    if new_config.sub_reject_keywords ~= nil then
        config.sub_reject_keywords = new_config.sub_reject_keywords
        state.parsed_config.sub.reject_keywords = parse_list(new_config.sub_reject_keywords)
        log_debug("  Updated sub_reject_keywords: " .. tostring(new_config.sub_reject_keywords))
    end
    
    if new_config.match_audio_to_video ~= nil then
        config.match_audio_to_video = new_config.match_audio_to_video
        log_debug("  Updated match_audio_to_video: " .. tostring(config.match_audio_to_video))
    end
    
    if new_config.use_forced_for_native ~= nil then
        config.use_forced_for_native = new_config.use_forced_for_native
        log_debug("  Updated use_forced_for_native: " .. tostring(config.use_forced_for_native))
    end
    

    

    


    -- ═════════════════════════════════════════════════════════════════════════
    -- EFFECTIVE CONFIG LOGGING
    -- ═════════════════════════════════════════════════════════════════════════
    log_info("=== EFFECTIVE SMART TRACK CONFIGURATION ===")
    log_info("AUDIO PREF LANGS: " .. utils.to_string(state.parsed_config.audio.preferred_langs))
    log_info("AUDIO REJECT LANGS: " .. utils.to_string(state.parsed_config.audio.reject_langs))
    log_info("AUDIO REJECT KW: " .. utils.to_string(state.parsed_config.audio.reject_keywords))
    log_info("SUB PREF LANGS: " .. utils.to_string(state.parsed_config.sub.preferred_langs))
    log_info("SUB PRIORITY KW: " .. utils.to_string(state.parsed_config.sub.priority_keywords))
    log_info("SUB REJECT LANGS: " .. utils.to_string(state.parsed_config.sub.reject_langs))
    log_info("SUB REJECT KW: " .. utils.to_string(state.parsed_config.sub.reject_keywords))
    log_info("FLAGS: MatchAudio=" .. tostring(config.match_audio_to_video) .. 
             ", UseForced=" .. tostring(config.use_forced_for_native))
    log_info("===========================================")


    -- Trigger re-evaluation
    -- Disable defense temporarily to allow changes
    local was_defending = state.defense_active
    state.defense_active = false
    
    log_info("Re-evaluating tracks with new config...")
    local track_list = mp.get_property_native("track-list") or {}
    
    -- Audio
    state.best_aid = select_audio_by_vlang(track_list)
    if not state.best_aid then
        state.best_aid = select_best_track("audio", track_list)
    end
    if state.best_aid then
        mp.set_property("aid", state.best_aid)
    end
    
    -- Subtitles
    state.best_sid = select_forced_sub_for_native(track_list)
    if not state.best_sid then
        state.best_sid = select_best_track("sub", track_list)
    end
    if state.best_sid then
        mp.set_property("sid", state.best_sid)
    end
    
    -- Restore defense
    if was_defending then
        activate_defense()
    end
end

mp.register_script_message("track-selector-config", update_config)

log_info("Smart Track Selector initialized (v1.4.0) - Dynamic Config Enabled")