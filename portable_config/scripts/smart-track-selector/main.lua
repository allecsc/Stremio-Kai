--[[
  @name Smart Track Selector
  @description Automatically selects best audio and subtitle tracks based on configurable preferences
  @version 1.7.0
  @author allecsc
  
  @changelog
    v1.7.0 - Added metadata original-language audio matching with aliases
           - Unified saved/off/forced/normal subtitle policy
           - Added structural forced exclusion and regular-over-SDH priority
           - Hardened track ID, timer generation, and settle overlap handling
    v1.6.0 - Fixed stored preference validation against rejection rules
           - Added external subtitle waiting (10s window with track-list observer)
           - Fixed user vs auto change detection (auto_change_in_progress flag)
           - Fixed stored pref matching to use substring match (contains_keyword)
    v1.5.0 - Fixed persistence: Now correctly restores saved track preferences per series
           - Moved persistence file to scripts/smart-track-selector/track_preferences.json
           - Fixed race condition in checking stored preferences vs smart selection
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
     2. Subtitle Variant   - Regular before SDH when language is equal
     3. Keyword Priority   - Position in priority_keywords list (lower = better)
                            Tracks with NO keyword get neutral score (middle of list)
     4. Subtitle Source    - Embedded before external when otherwise equivalent
     5. Track Order        - File order as tiebreaker (lower = better)
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
    debug_logging = true
}

options.read_options(config, "smart_track_selector")

--------------------------------------------------------------------------------
-- 2. CONSTANTS (not configurable)
--------------------------------------------------------------------------------
local DEFENSE_DURATION = 2   -- seconds to defend selection from external changes (Stremio's native memory)
local EXTERNAL_SUB_TIMEOUT = 10 -- seconds to wait for external subtitles to load
local AUTO_CHANGE_DELAY = 0.5 -- seconds to wait for observer to fire before allowing saves
local TRACK_SNAPSHOT_DELAY = 0.75 -- coalesce bursts of track-list updates
local CONFIG_RECEIPT_TIMEOUT = 5 -- diagnostic only; does not alter selection
local PERSISTENCE_FILE = mp.command_native({"expand-path", "~~/scripts/smart-track-selector/track_preferences.json"})
local TRACE_PREFIX = "[TRACK_TRACE]"

--------------------------------------------------------------------------------
-- 3. STATE
--------------------------------------------------------------------------------
local state = {
    best_sid = nil,
    best_aid = nil,
    defense_active = false,
    parsed_config = nil,      -- Cache parsed lists
    title_id = nil,           -- Current Series/Movie ID
    remember_selection = false, -- User preference flag
    subtitle_mode = "default", -- subtitleSelectionMode: "default", "forced", "off"
    pending_save = nil,       -- Debounce timer
    prefs_cache = nil,        -- In-memory cache of track_preferences.json
    auto_change_in_progress = { aid = false, sid = false },
    auto_change_sequence = { aid = 0, sid = 0 },
    -- External subtitle watching
    external_sub_watch = false, -- True when waiting for external subs
    external_sub_timer = nil,   -- Timer for external sub window
    last_sub_count = 0,         -- Track count to detect new subs
    language_alias_index = {},  -- raw alias -> full comma-separated alias group
    language_alias_group_count = 0,
    trace_sequence = 0,
    trace_started_at = mp.get_time(),
    file_generation = 0,
    file_active = false,
    selection_phase = "inactive",
    track_snapshot_timer = nil,
    pending_save_context = nil,
    config_received_for_file = false,
    config_timeout_timer = nil,
    config_revision = 0,
    config_sequence = nil,
    selection_run_sequence = 0,
    active_selection_run = nil,
    timer_sequence = 0,
    track_snapshot_timer_id = nil,
    config_timeout_timer_id = nil,
    external_sub_timer_id = nil,
    pending_save_timer_id = nil,
    defense_timer = nil,
    defense_timer_id = nil,
    waiting_for_saved_sub = false,
    saved_sub_match_quality = nil,
    track_list_defense_guard = false,
    original_languages = {}, -- title ID -> expanded original-language aliases
    user_audio_selected_for_file = false,
}

-- Forward declarations to handle cross-references
local queue_save
local perform_save
local normalize_language
local expand_language_aliases

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

-- Detailed diagnostics are controlled by debug_logging. Every entry is tied
-- to one mpv file generation and uses mpv's monotonic clock.
local function trace(event, details)
    if not config.debug_logging then return end

    state.trace_sequence = state.trace_sequence + 1
    local payload = ""
    if details then
        local ok, encoded = pcall(function() return utils.format_json(details) end)
        payload = ok and (" " .. encoded) or " {\"trace_error\":\"unable to encode details\"}"
    end

    mp.msg.info(string.format("%s file=%d cfg=%d cseq=%s run=%s #%d +%.3fs phase=%s %s%s",
        TRACE_PREFIX,
        state.file_generation,
        state.config_revision,
        tostring(state.config_sequence or "-"),
        tostring(state.active_selection_run or "-"),
        state.trace_sequence,
        mp.get_time() - state.trace_started_at,
        state.selection_phase,
        event,
        payload))
end

local function is_track_forced(track)
    if track.forced == true then return true end
    local title = type(track.title) == "string" and track.title:lower() or ""
    return title:find("forced", 1, true) ~= nil
end

local function normalize_track_title(value)
    if type(value) ~= "string" then return "" end
    return value:match("^%s*(.-)%s*$"):lower()
end

local function is_track_sdh(track)
    if track["hearing-impaired"] == true then return true end
    local title = normalize_track_title(track.title)
    return title:find("sdh", 1, true) ~= nil or
        title:find("hearing impaired", 1, true) ~= nil or
        title:find("hearing-impaired", 1, true) ~= nil
end

local function prefer_embedded_candidate(candidates, predicate)
    local external_fallback = nil
    for _, track in ipairs(candidates) do
        if not predicate or predicate(track) then
            if track.external ~= true then
                return track
            end
            external_fallback = external_fallback or track
        end
    end
    return external_fallback
end

local function compact_track(track)
    local title = track.title or ""
    local title_forced = type(title) == "string" and title:lower():find("forced", 1, true) ~= nil
    local property_forced = track.forced == true

    return {
        id = track.id,
        type = track.type,
        lang = track.lang,
        lang_group = expand_language_aliases and expand_language_aliases(track.lang) or normalize_language and normalize_language(track.lang) or track.lang,
        title = title ~= "" and title or nil,
        forced = track.forced,
        forced_by_property = property_forced,
        forced_by_title = title_forced,
        forced_detected = is_track_forced(track),
        sdh_detected = is_track_sdh(track),
        default = track.default,
        selected = track.selected,
        external = track.external,
        hearing_impaired = track["hearing-impaired"],
        visual_impaired = track["visual-impaired"],
    }
end

local function compact_track_list(track_list)
    local compact = {}
    for _, track in ipairs(track_list or {}) do
        table.insert(compact, compact_track(track))
    end
    return compact
end

local function summarize_path(path)
    if type(path) ~= "string" or path == "" then return nil end
    if path:find("://", 1, true) then
        return "remote-stream"
    end
    return path:match("([^/\\]+)$") or path
end

local function log_mpv_snapshot(reason, track_list)
    if not config.debug_logging then return end

    trace("mpv-snapshot", {
        reason = reason,
        path = summarize_path(mp.get_property("path")),
        media_title = mp.get_property("media-title"),
        playlist_pos = mp.get_property_number("playlist-pos"),
        time_pos = mp.get_property_number("time-pos"),
        aid = mp.get_property("aid"),
        sid = mp.get_property("sid"),
        tracks = compact_track_list(track_list or mp.get_property_native("track-list") or {}),
    })
end

local function begin_selection_run(trigger, details)
    state.selection_run_sequence = state.selection_run_sequence + 1
    state.active_selection_run = state.selection_run_sequence
    trace("selection-run-start", {
        trigger = trigger,
        details = details,
        aid = mp.get_property("aid"),
        sid = mp.get_property("sid"),
        title_id = state.title_id,
        config_sequence = state.config_sequence,
    })
    return state.active_selection_run
end

local function finish_selection_run(run_id, outcome, details)
    trace("selection-run-finished", {
        run_id = run_id,
        outcome = outcome,
        details = details,
        aid = mp.get_property("aid"),
        sid = mp.get_property("sid"),
    })
    if state.active_selection_run == run_id then
        state.active_selection_run = nil
    end
end

local function add_traced_timeout(kind, delay, callback, details)
    state.timer_sequence = state.timer_sequence + 1
    local timer_id = state.timer_sequence
    local scheduled_generation = state.file_generation
    local scheduled_phase = state.selection_phase
    local scheduled_run = state.active_selection_run
    local scheduled_config_revision = state.config_revision
    local scheduled_config_sequence = state.config_sequence
    trace("timer-scheduled", {
        timer_id = timer_id,
        kind = kind,
        delay = delay,
        scheduled_generation = scheduled_generation,
        scheduled_phase = scheduled_phase,
        scheduled_run = scheduled_run,
        scheduled_config_revision = scheduled_config_revision,
        scheduled_config_sequence = scheduled_config_sequence,
        details = details,
    })

    local timer = mp.add_timeout(delay, function()
        local before_phase = state.selection_phase
        local before_active = state.file_active
        trace("timer-fired", {
            timer_id = timer_id,
            kind = kind,
            scheduled_generation = scheduled_generation,
            current_generation = state.file_generation,
            stale_generation = scheduled_generation ~= state.file_generation,
            scheduled_phase = scheduled_phase,
            scheduled_run = scheduled_run,
            scheduled_config_revision = scheduled_config_revision,
            scheduled_config_sequence = scheduled_config_sequence,
            current_phase = before_phase,
            file_active = before_active,
        })
        if scheduled_generation ~= state.file_generation then
            trace("timer-skipped", {
                timer_id = timer_id,
                kind = kind,
                reason = "stale-file-generation",
                scheduled_generation = scheduled_generation,
                current_generation = state.file_generation,
            })
            return
        end
        callback()
        trace("timer-completed", {
            timer_id = timer_id,
            kind = kind,
            scheduled_generation = scheduled_generation,
            current_generation = state.file_generation,
            scheduled_run = scheduled_run,
            scheduled_config_revision = scheduled_config_revision,
            scheduled_config_sequence = scheduled_config_sequence,
            phase_before = before_phase,
            phase_after = state.selection_phase,
            file_active_before = before_active,
            file_active_after = state.file_active,
        })
    end)
    return timer, timer_id
end

local function schedule_track_snapshot(reason)
    if not config.debug_logging then return end

    if state.track_snapshot_timer then
        trace("timer-cancelled", { timer_id = state.track_snapshot_timer_id, kind = "track-snapshot", reason = "coalesced" })
        state.track_snapshot_timer:kill()
    end

    local generation = state.file_generation
    state.track_snapshot_timer, state.track_snapshot_timer_id = add_traced_timeout("track-snapshot", TRACK_SNAPSHOT_DELAY, function()
        state.track_snapshot_timer = nil
        state.track_snapshot_timer_id = nil
        if generation ~= state.file_generation then return end
        log_mpv_snapshot(reason)
    end, { reason = reason })
end

local function finish_automatic_selection_after_settle(trigger)
    state.selection_phase = "selector-settle"
    local generation = state.file_generation
    add_traced_timeout("automatic-selection-settle", AUTO_CHANGE_DELAY, function()
        if generation ~= state.file_generation then return end
        if state.defense_active or state.external_sub_watch then return end
        state.selection_phase = "user"
        trace("automatic-selection-finished", { trigger = trigger })
    end, { trigger = trigger })
end

normalize_language = function(value)
    if type(value) ~= "string" then return "" end
    return value:match("^%s*(.-)%s*$"):lower()
end

local function update_language_alias_groups(groups)
    local index = {}
    local count = 0

    if type(groups) == "table" then
        for _, group in ipairs(groups) do
            if type(group) == "string" and group ~= "" then
                local aliases = {}
                for alias in string.gmatch(group, "([^,]+)") do
                    local normalized = normalize_language(alias)
                    if normalized ~= "" then
                        table.insert(aliases, normalized)
                    end
                end
                if #aliases > 0 then
                    local normalized_group = table.concat(aliases, ",")
                    for _, alias in ipairs(aliases) do
                        index[alias] = normalized_group
                    end
                    count = count + 1
                end
            end
        end
    end

    state.language_alias_index = index
    state.language_alias_group_count = count
    trace("language-alias-groups-updated", { groups = count })
end

expand_language_aliases = function(value)
    local normalized = normalize_language(value):gsub("_", "-")
    if normalized == "" or normalized == "none" then return normalized end

    local exact_group = state.language_alias_index[normalized]
    if exact_group then return exact_group end

    -- Safely collapse region variants (en-US, ja-JP, es-419) to the base
    -- language. Keep script variants such as zh-Hans/zh-Hant distinct.
    local base, region = normalized:match("^([a-z][a-z][a-z]?)[-]([a-z][a-z])$")
    if not base then
        base, region = normalized:match("^([a-z][a-z][a-z]?)[-](%d%d%d)$")
    end
    if base and region and state.language_alias_index[base] then
        trace("language-region-fallback", {
            value = value,
            normalized = normalized,
            base = base,
            region = region,
            group = state.language_alias_index[base],
        })
        return state.language_alias_index[base]
    end

    return normalized
end

-- Compare complete comma-separated tokens, never raw substrings.
local function languages_match(left_value, right_value, context)
    local left_group = expand_language_aliases(left_value)
    local right_group = expand_language_aliases(right_value)
    local right_aliases = {}

    for alias in string.gmatch(right_group, "([^,]+)") do
        right_aliases[normalize_language(alias)] = true
    end
    for alias in string.gmatch(left_group, "([^,]+)") do
        if right_aliases[normalize_language(alias)] then
            if context ~= "saved-preference" then
                trace("language-match", {
                    context = context,
                    left = left_value,
                    left_group = left_group,
                    right = right_value,
                    right_group = right_group,
                    matched_alias = normalize_language(alias),
                })
            end
            return true
        end
    end

    return false
end

local function preference_matches_language(saved_value, track_value)
    return languages_match(saved_value, track_value, "saved-preference")
end

local function track_ids_equal(left, right)
    if left == nil or right == nil then return left == right end
    return tostring(left) == tostring(right)
end

-- Safe track setting: marks change as script-initiated to prevent save trigger
local function set_sid_safe(value)
    if state.auto_change_in_progress.sid then
        trace("safe-selection-overlap", { setting = "sid", value = value })
    end
    state.auto_change_in_progress.sid = true
    state.auto_change_sequence.sid = state.auto_change_sequence.sid + 1
    local change_id = state.auto_change_sequence.sid
    trace("selector-write", { property = "sid", before = mp.get_property("sid"), requested = value })
    mp.set_property("sid", value)
    add_traced_timeout("selector-write-settle:sid", AUTO_CHANGE_DELAY, function()
        if state.auto_change_sequence.sid ~= change_id then
            trace("selector-write-settle-skipped", { property = "sid", requested = value, reason = "superseded", change_id = change_id })
            return
        end
        state.auto_change_in_progress.sid = false
        trace("selector-write-settled", { property = "sid", requested = value, actual = mp.get_property("sid") })
        schedule_track_snapshot("selector-write-settled:sid")
    end, { property = "sid", requested = value, change_id = change_id })
end

local function set_aid_safe(value)
    if state.auto_change_in_progress.aid then
        trace("safe-selection-overlap", { setting = "aid", value = value })
    end
    state.auto_change_in_progress.aid = true
    state.auto_change_sequence.aid = state.auto_change_sequence.aid + 1
    local change_id = state.auto_change_sequence.aid
    trace("selector-write", { property = "aid", before = mp.get_property("aid"), requested = value })
    mp.set_property("aid", value)
    add_traced_timeout("selector-write-settle:aid", AUTO_CHANGE_DELAY, function()
        if state.auto_change_sequence.aid ~= change_id then
            trace("selector-write-settle-skipped", { property = "aid", requested = value, reason = "superseded", change_id = change_id })
            return
        end
        state.auto_change_in_progress.aid = false
        trace("selector-write-settled", { property = "aid", requested = value, actual = mp.get_property("aid") })
        schedule_track_snapshot("selector-write-settled:aid")
    end, { property = "aid", requested = value, change_id = change_id })
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
        if languages_match(lang, track_lang, "configured-language") then
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
    if is_track_sdh(track) then
        title = title .. " sdh"
    end

    log_debug(string.format("  Evaluating %s track #%d: lang='%s', title='%s'",
        track_type, track.id, lang, title))

    -- REJECTION CHECKS (early exit)
    if track_type == "sub" and is_track_forced(track) then
        log_debug("    -> REJECTED: forced variant is not eligible for normal selection")
        trace("candidate-rejected", { branch = "scored-selection", reason = "automatic-variant-policy", track = compact_track(track) })
        return nil
    end

    -- Check rejected languages
    if matches_language(lang, cfg.reject_langs) then
        log_debug("    → REJECTED: language in reject list")
        trace("candidate-rejected", { branch = "scored-selection", reason = "reject-language", track = compact_track(track) })
        return nil
    end

    -- Check rejected keywords in title
    if matches_keyword(title, cfg.reject_keywords) then
        log_debug("    → REJECTED: keyword in title matches reject list")
        trace("candidate-rejected", { branch = "scored-selection", reason = "reject-keyword", track = compact_track(track) })
        return nil
    end

    -- SCORING

    local score = {
        lang_priority = 999,
        variant_priority = track_type == "sub" and (is_track_sdh(track) and 1 or 0) or 0,
        keyword_priority = 999,
        source_priority = track_type == "sub" and (track.external == true and 1 or 0) or 0,
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

    if score.lang_priority < 999 or score.keyword_priority < 999 then
        trace("candidate-scored", {
            branch = "scored-selection",
            track = compact_track(track),
            lang_priority = score.lang_priority,
            variant_priority = score.variant_priority,
            keyword_priority = score.keyword_priority,
            source_priority = score.source_priority,
            track_order = score.track_order,
        })
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

    -- Prefer regular subtitles over SDH, but keep SDH as a fallback unless
    -- the user's rejection keywords explicitly disable it.
    if score_a.variant_priority < score_b.variant_priority then return true end
    if score_a.variant_priority > score_b.variant_priority then return false end

    -- Keyword priority (lower is better, used if languages are equal)
    if score_a.keyword_priority < score_b.keyword_priority then return true end
    if score_a.keyword_priority > score_b.keyword_priority then return false end

    -- Prefer embedded subtitles after language and keyword ranking.
    if score_a.source_priority < score_b.source_priority then return true end
    if score_a.source_priority > score_b.source_priority then return false end

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
        trace("selection-skipped", { branch = "select-best", type = track_type, reason = "missing-config" })
        return nil
    end

    -- Check if we have any preferences configured
    local has_prefs = #cfg.preferred_langs > 0 or #cfg.reject_keywords > 0 or
                      #cfg.reject_langs > 0

    if not has_prefs then
        log_debug("No preferences configured for " .. track_type .. ", skipping selection")
        trace("selection-skipped", { branch = "select-best", type = track_type, reason = "no-preferences" })
        return nil
    end

    local started_at = mp.get_time()
    log_info(string.format("Analyzing %s tracks...", track_type))
    trace("select-best-start", { type = track_type, tracks = #track_list })

    local best_track = nil
    local best_score = nil

    for _, track in ipairs(track_list) do
        if track.type == track_type then
            local score = evaluate_track(track, track_type, cfg)

            -- If audio preferences exist, an unrelated language is not a
            -- fallback; leave Stremio's current audio unchanged instead.
            local eligible = score and not (
                track_type == "audio" and
                #cfg.preferred_langs > 0 and
                score.lang_priority == 999
            )
            if score and not eligible then
                trace("candidate-rejected", { branch = "scored-selection", reason = "no-preferred-audio-language-match", track = compact_track(track) })
            end

            if eligible and is_better_score(score, best_score) then
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
        trace("select-best-result", { type = track_type, track = compact_track(best_track), score = best_score, elapsed = mp.get_time() - started_at })
        return best_track.id
    else
        log_info("No suitable " .. track_type .. " track found")
        trace("select-best-result", { type = track_type, id = nil, reason = "no-suitable-track", elapsed = mp.get_time() - started_at })
        return nil
    end
end

-- Keep the existing setting key for compatibility, but match against the
-- title's metadata language rather than the unreliable video-track language.
local function select_audio_by_original_language(track_list)
    if not config.match_audio_to_video then
        trace("selection-skipped", { branch = "audio-original-language", reason = "disabled" })
        return nil
    end

    local original_language = state.title_id and state.original_languages[state.title_id] or nil
    if not original_language or original_language == "" then
        log_debug("match_audio_to_video: No metadata language available")
        trace("selection-skipped", { branch = "audio-original-language", reason = "missing-original-language", title_id = state.title_id })
        return nil
    end

    log_info(string.format("Original metadata language: %s", original_language))
    trace("language-comparison-source", {
        branch = "audio-original-language",
        original_language = original_language,
        title_id = state.title_id,
    })

    local cfg = parse_config()["audio"]

    for _, track in ipairs(track_list) do
        if track.type == "audio" and track.lang then
            if languages_match(original_language, track.lang, "original-language-audio") then
                if cfg and matches_language(track.lang, cfg.reject_langs) then
                    log_debug(string.format("  Skipping audio #%d (%s) - language rejected", track.id, track.lang))
                    trace("candidate-rejected", { branch = "audio-original-language", reason = "reject-language", original_language = original_language, track = compact_track(track) })
                else
                    local title = track.title or ""
                    if cfg and matches_keyword(title, cfg.reject_keywords) then
                        log_debug(string.format("  Skipping audio #%d (%s) - keyword rejected", track.id, title))
                        trace("candidate-rejected", { branch = "audio-original-language", reason = "reject-keyword", original_language = original_language, track = compact_track(track) })
                    else
                        log_info(string.format("Selected audio #%d matching original language (%s)", track.id, original_language))
                        trace("selection-result", { branch = "audio-original-language", original_language = original_language, track = compact_track(track) })
                        return track.id
                    end
                end
            end
        end
    end

    log_debug("match_audio_to_video: No original-language audio found, falling back to preferences")
    trace("selection-result", { branch = "audio-original-language", reason = "no-match", original_language = original_language })
    return nil
end

-- Get the language of the selected audio track
local function get_selected_audio_language(track_list)
    local selected_aid = state.best_aid or mp.get_property_number("aid") or mp.get_property("aid")
    if not selected_aid then return nil end
    
    for _, track in ipairs(track_list) do
        if track.type == "audio" and track_ids_equal(track.id, selected_aid) then
            return track.lang
        end
    end
    return nil
end

-- Select forced subtitle matching audio language (for use_forced_for_native feature)
-- Returns track ID if found, nil otherwise
local function select_forced_sub_for_native(track_list)
    if not config.use_forced_for_native then
        trace("selection-skipped", { branch = "forced-sub-native", reason = "disabled" })
        return nil
    end
    
    local alang = get_selected_audio_language(track_list)
    if not alang then
        log_debug("use_forced_for_native: No audio language detected")
        trace("selection-skipped", { branch = "forced-sub-native", reason = "missing-audio-language" })
        return nil
    end
    
    -- Find forced subtitle matching audio language
    local candidates = {}
    for _, track in ipairs(track_list) do
        if track.type == "sub" and track.lang then
            -- Check for forced flag OR "forced" in title
            local is_forced = is_track_forced(track)

            trace("forced-candidate-inspected", {
                branch = "forced-sub-native",
                audio_lang = alang,
                audio_lang_group = expand_language_aliases(alang),
                current_logic_forced = not not is_forced,
                track = compact_track(track),
            })

            if is_forced then
                log_verbose(string.format("  Checking forced candidate #%d (%s) against audio (%s)", track.id, track.lang, alang))
                -- Check if this track matches audio language
                if languages_match(alang, track.lang, "forced-native") then
                    table.insert(candidates, track)
                else
                    log_verbose(string.format("    -> Lang mismatch: track='%s' vs audio='%s'", track.lang, alang))
                    trace("candidate-rejected", { branch = "forced-sub-native", audio_lang = alang, audio_lang_group = expand_language_aliases(alang), reason = "audio-language-mismatch", track = compact_track(track) })
                end
            end
        end
    end

    local selected = prefer_embedded_candidate(candidates)
    if selected then
        -- For native forced subs, we override rejection rules (e.g. "forced" keyword)
        log_info(string.format("Selected forced sub #%d for native audio (%s) [Override Rejection]", selected.id, alang))
        trace("selection-result", { branch = "forced-sub-native", audio_lang = alang, audio_lang_group = expand_language_aliases(alang), source_priority = selected.external == true and 1 or 0, track = compact_track(selected) })
        return selected.id
    end
    
    log_debug(string.format("use_forced_for_native: No forced sub found for audio language '%s'", alang))
    trace("selection-result", { branch = "forced-sub-native", reason = "no-match", audio_lang = alang })
    return nil
end

-- Select forced subtitle ONLY (for subtitle_mode = "forced")
-- Ignores rejection lists, selects based on Audio Language match
local function select_forced_sub_only(track_list)
    local alang = get_selected_audio_language(track_list)
    if not alang then
        log_debug("select_forced_only: No audio language detected")
        trace("selection-skipped", { branch = "forced-sub-mode", reason = "missing-audio-language" })
        return nil
    end

    local candidates = {}
    for _, track in ipairs(track_list) do
        if track.type == "sub" and track.lang then
            local is_forced = is_track_forced(track)

            trace("forced-candidate-inspected", {
                branch = "forced-sub-mode",
                audio_lang = alang,
                audio_lang_group = expand_language_aliases(alang),
                current_logic_forced = not not is_forced,
                track = compact_track(track),
            })

            if is_forced then
                if languages_match(alang, track.lang, "forced-mode") then
                    table.insert(candidates, track)
                else
                    trace("candidate-rejected", { branch = "forced-sub-mode", audio_lang = alang, audio_lang_group = expand_language_aliases(alang), reason = "audio-language-mismatch", track = compact_track(track) })
                end
            end
        end
    end

    local selected = prefer_embedded_candidate(candidates)
    if selected then
        log_info(string.format("Selected forced sub #%d matching audio (%s) [Mode: Forced]", selected.id, alang))
        trace("selection-result", { branch = "forced-sub-mode", audio_lang = alang, audio_lang_group = expand_language_aliases(alang), source_priority = selected.external == true and 1 or 0, track = compact_track(selected) })
        return selected.id
    end
    
    log_info("Mode 'forced' active but no matching forced track found. Selecting None.")
    trace("selection-result", { branch = "forced-sub-mode", reason = "no-match", audio_lang = alang })
    return nil
end

--------------------------------------------------------------------------------
-- 9. DEFENSE MECHANISM
--------------------------------------------------------------------------------

local function defend_subtitle(name, value)
    if not state.file_active then
        trace("property-change", { property = "sid", value = value, classification = "ignored:file-inactive" })
        return
    end

    if (state.defense_active or state.external_sub_watch) and state.best_sid then
        if value and not track_ids_equal(value, state.best_sid) then
            trace("property-change", {
                property = "sid",
                value = value,
                expected = state.best_sid,
                classification = "defended",
                reason = state.defense_active and "defense-active" or "external-sub-watch",
            })
            state.auto_change_in_progress.sid = true
            state.auto_change_sequence.sid = state.auto_change_sequence.sid + 1
            local change_id = state.auto_change_sequence.sid
            mp.set_property("sid", state.best_sid)
            add_traced_timeout("defense-write-settle:sid", AUTO_CHANGE_DELAY, function()
                if state.auto_change_sequence.sid ~= change_id then return end
                state.auto_change_in_progress.sid = false
                trace("defense-write-settled", { property = "sid", requested = state.best_sid, actual = mp.get_property("sid") })
            end, { property = "sid", requested = state.best_sid, change_id = change_id })
            log_verbose(string.format("Restored subtitle track #%s (overrode external change)", tostring(state.best_sid)))
        else
            trace("property-change", { property = "sid", value = value, classification = "ignored:automatic-selection" })
        end
    elseif state.auto_change_in_progress.sid then
        trace("property-change", { property = "sid", value = value, classification = "ignored:selector-settle" })
    elseif state.selection_phase ~= "user" then
        trace("property-change", { property = "sid", value = value, classification = "ignored:automatic-selection" })
    else
        trace("property-change", { property = "sid", value = value, classification = "saved:user-policy" })
        queue_save("sub", value)
    end
end

local function defend_audio(name, value)
    if not state.file_active then
        trace("property-change", { property = "aid", value = value, classification = "ignored:file-inactive" })
        return
    end

    if state.defense_active and state.best_aid then
        if value and not track_ids_equal(value, state.best_aid) then
            trace("property-change", { property = "aid", value = value, expected = state.best_aid, classification = "defended" })
            state.auto_change_in_progress.aid = true
            state.auto_change_sequence.aid = state.auto_change_sequence.aid + 1
            local change_id = state.auto_change_sequence.aid
            mp.set_property("aid", state.best_aid)
            add_traced_timeout("defense-write-settle:aid", AUTO_CHANGE_DELAY, function()
                if state.auto_change_sequence.aid ~= change_id then return end
                state.auto_change_in_progress.aid = false
                trace("defense-write-settled", { property = "aid", requested = state.best_aid, actual = mp.get_property("aid") })
            end, { property = "aid", requested = state.best_aid, change_id = change_id })
            log_verbose(string.format("Restored audio track #%d (overrode external change)", state.best_aid))
        else
            trace("property-change", { property = "aid", value = value, classification = "ignored:automatic-selection" })
        end
    elseif state.auto_change_in_progress.aid then
        trace("property-change", { property = "aid", value = value, classification = "ignored:selector-settle" })
    elseif state.selection_phase ~= "user" then
        trace("property-change", { property = "aid", value = value, classification = "ignored:automatic-selection" })
    else
        trace("property-change", { property = "aid", value = value, classification = "saved:user-policy" })
        state.user_audio_selected_for_file = true
        queue_save("audio", value)
    end
end

local function activate_defense(track_list_guard)
    if not state.best_sid and not state.best_aid then return end

    if track_list_guard and state.best_sid then
        state.track_list_defense_guard = true
    end

    if state.defense_active then
        trace("defense-overlap", { note = "re-arming defense timer" })
    end
    if state.defense_timer then
        trace("timer-cancelled", { timer_id = state.defense_timer_id, kind = "defense", reason = "re-armed" })
        state.defense_timer:kill()
    end
    state.defense_active = true
    state.selection_phase = "defense"
    trace("defense-start", { duration = DEFENSE_DURATION, best_aid = state.best_aid, best_sid = state.best_sid })
    log_debug(string.format("Defense activated for %d seconds", DEFENSE_DURATION))

    state.defense_timer, state.defense_timer_id = add_traced_timeout("defense", DEFENSE_DURATION, function()
        state.defense_timer = nil
        state.defense_timer_id = nil
        state.defense_active = false
        state.track_list_defense_guard = false
        state.selection_phase = state.external_sub_watch and "external-sub-watch" or "user"
        trace("defense-end", { best_aid = state.best_aid, best_sid = state.best_sid })
        log_debug("Defense period ended")
    end, { best_aid = state.best_aid, best_sid = state.best_sid })
end


--------------------------------------------------------------------------------
-- 10. PERSISTENCE (SMART MEMORY)
--------------------------------------------------------------------------------


local function read_json_file(path)
    local f = io.open(path, "r")
    if not f then return {} end
    local content = f:read("*all")
    f:close()
    if not content or content == "" then return {} end
    
    local success, data = pcall(function() return utils.parse_json(content) end)
    return success and data or {}
end

local function write_json_file(path, data)
    local f, err = io.open(path, "w")
    if not f then
        log_info("Failed to open persistence file: " .. path .. " Error: " .. tostring(err))
        return
    end
    
    local success, json_str = pcall(function() return utils.format_json(data) end)
    if success then
        f:write(json_str)
        log_info("Successfully wrote preferences to " .. path)
    else
        log_info("Failed to serialize legacy data")
    end
    f:close()
end

-- Check if we have a stored preference for this title
-- Returns: aid, sid (if found and valid), or nil
local function check_stored_preference(track_list)
    if not state.remember_selection or not state.title_id then
        return nil, nil, false, false, nil
    end
    
    -- Load cache if needed
    if not state.prefs_cache then
        log_debug("Initializing preferences cache from disk...")
        state.prefs_cache = read_json_file(PERSISTENCE_FILE)
    end

    local show_pref = state.prefs_cache[state.title_id]
    
    if not show_pref then
        trace("stored-preference-miss", { title_id = state.title_id, reason = "no-record" })
        return nil, nil, false, false, nil
    end
    
    log_info("Found stored preference for " .. state.title_id)
    trace("stored-preference-lookup", { title_id = state.title_id, audio = show_pref.audio and show_pref.audio.lang, sub = show_pref.sub and show_pref.sub.lang })
    
    local found_aid = nil
    local found_sid = show_pref.sub and show_pref.sub.lang == "none" and "no" or nil
    local sub_match_quality = found_sid and "exact" or nil
    local has_audio_pref = show_pref.audio ~= nil
    local has_sub_pref = show_pref.sub ~= nil

    -- A manual per-show choice is authoritative and bypasses automatic
    -- rejection rules. Track IDs can change between episodes, so restore by
    -- language aliases and persisted subtitle traits instead.
    for _, track in ipairs(track_list) do
        if track.type == "audio" and show_pref.audio and not found_aid then
            if preference_matches_language(show_pref.audio.lang, track.lang) then
                found_aid = track.id
                trace("stored-preference-audio-restored", { title_id = state.title_id, saved = show_pref.audio, candidate = compact_track(track), bypassed_rejections = true })
            end
        end
    end

    if show_pref.sub and not found_sid then
        local candidates = {}
        local saved_forced = not not show_pref.sub.is_forced
        local saved_title = normalize_track_title(show_pref.sub.title)
        local has_variant_identity = show_pref.sub.title ~= nil or show_pref.sub.is_sdh ~= nil
        local saved_sdh = show_pref.sub.is_sdh
        if saved_sdh == nil and saved_title ~= "" then
            saved_sdh = saved_title:find("sdh", 1, true) ~= nil or
                saved_title:find("hearing impaired", 1, true) ~= nil or
                saved_title:find("hearing-impaired", 1, true) ~= nil
        end

        for _, track in ipairs(track_list) do
            if track.type == "sub" and preference_matches_language(show_pref.sub.lang, track.lang) then
                local track_forced = is_track_forced(track)
                trace("stored-preference-sub-candidate", {
                    saved = show_pref.sub,
                    candidate = compact_track(track),
                    forced_match = track_forced == saved_forced,
                    title_match = saved_title ~= "" and normalize_track_title(track.title) == saved_title,
                    sdh_match = saved_sdh == nil or is_track_sdh(track) == saved_sdh,
                })
                if track_forced == saved_forced then
                    table.insert(candidates, track)
                end
            end
        end

        -- Prefer the exact saved label, then an equivalent SDH/full variant.
        if saved_title ~= "" then
            local exact_match = prefer_embedded_candidate(candidates, function(track)
                return normalize_track_title(track.title) == saved_title
            end)
            found_sid = exact_match and exact_match.id or nil
            if found_sid then sub_match_quality = "exact" end
        end
        if not found_sid and has_variant_identity then
            local variant_match = prefer_embedded_candidate(candidates, function(track)
                return saved_sdh == nil or is_track_sdh(track) == saved_sdh
            end)
            found_sid = variant_match and variant_match.id or nil
            if found_sid then
                sub_match_quality = saved_title ~= "" and "compatible" or "exact"
            end
        end
        if not found_sid and not has_variant_identity then
            -- Legacy records only contain language + forced status.
            local legacy_match = prefer_embedded_candidate(candidates)
            found_sid = legacy_match and legacy_match.id or nil
            if found_sid then sub_match_quality = "legacy" end
        end

        if found_sid then
            for _, track in ipairs(candidates) do
                if track.id == found_sid then
                    trace("stored-preference-sub-restored", { title_id = state.title_id, saved = show_pref.sub, candidate = compact_track(track), match_quality = sub_match_quality, bypassed_rejections = true })
                    break
                end
            end
        elseif #candidates > 0 then
            trace("stored-preference-variant-unavailable", { type = "sub", saved = show_pref.sub, matching_language_and_forced = #candidates })
        end
    end
    
    trace("stored-preference-result", {
        title_id = state.title_id,
        audio = found_aid,
        sub = found_sid,
        sub_match_quality = sub_match_quality,
        audio_reason = found_aid and "matched" or (show_pref.audio and "unavailable" or "not-saved"),
        sub_reason = found_sid and "matched" or (show_pref.sub and "unavailable" or "not-saved"),
    })
    return found_aid, found_sid, has_audio_pref, has_sub_pref, sub_match_quality
end

local function get_track_details(id, track_type)
    if not id then return nil end
    local track_list = mp.get_property_native("track-list") or {}
    for _, t in ipairs(track_list) do
        if t.id == id and t.type == track_type then
            local is_forced = is_track_forced(t)
            local details = {
                -- Save the complete alias group. Future restore happens before
                -- bridge config may arrive, so this record must be self-contained.
                lang = expand_language_aliases(t.lang or "unknown"),
                is_forced = is_forced
            }
            if track_type == "sub" then
                details.title = type(t.title) == "string" and t.title or nil
                details.is_sdh = is_track_sdh(t)
            end
            return details
        end
    end
    return nil
end

perform_save = function()
    local request = state.pending_save_context
    if not state.remember_selection then
        log_debug("Skipping save: remember_selection is OFF")
        trace("persistence-skipped", { reason = "remember-selection-off", request = state.pending_save_context })
        mp.osd_message("Smart Selector: Persistence OFF (Check Settings)", 3)
        state.pending_save = nil
        state.pending_save_timer_id = nil
        state.pending_save_context = nil
        return
    end
    if not state.title_id then 
        log_debug("Skipping save: no title_id")
        trace("persistence-skipped", { reason = "missing-title-id", request = state.pending_save_context })
        state.pending_save = nil
        state.pending_save_timer_id = nil
        state.pending_save_context = nil
        return 
    end
    
    -- Persist the complete selection captured when the observer queued this
    -- save. A later automatic mpv change must not replace the user's intent.
    local aid_prop = request and request.aid or mp.get_property("aid")
    local aid = tonumber(aid_prop) or mp.get_property_number("aid")
    -- sid property: "no" if disabled, "auto", or ID number.
    local sid_prop = request and request.sid or mp.get_property("sid")
    
    local audio_info = get_track_details(aid, "audio")
    local sub_info = nil
    
    if sid_prop == "no" or sid_prop == "auto" then 
        -- "auto" usually means disabled in mpv context if not matching?
        -- Actually "no" is explicit disable.
        sub_info = { lang = "none", is_forced = false }
    else
        sub_info = get_track_details(tonumber(sid_prop), "sub")
    end
    
    if not audio_info and not sub_info then
        trace("persistence-skipped", { reason = "snapshot-tracks-unavailable", request = request })
        state.pending_save = nil
        state.pending_save_timer_id = nil
        state.pending_save_context = nil
        return
    end
    
    log_info("Saving preference for " .. state.title_id)
    -- Ensure cache is loaded
    if not state.prefs_cache then
        state.prefs_cache = read_json_file(PERSISTENCE_FILE)
    end

    local previous = state.prefs_cache[state.title_id]
    local updated = {
        audio = audio_info,
        sub = sub_info,
        timestamp = os.time()
    }
    trace("persistence-save-start", {
        title_id = state.title_id,
        request = request,
        aid = aid,
        sid = sid_prop,
        previous = previous,
        updated = updated,
    })

    -- Update cache
    state.prefs_cache[state.title_id] = updated
    
    -- Write-through to disk
    write_json_file(PERSISTENCE_FILE, state.prefs_cache)
    trace("persistence-save-finished", { title_id = state.title_id, updated = updated })
    state.pending_save = nil
    state.pending_save_timer_id = nil
    state.pending_save_context = nil
end

queue_save = function(track_type, value)
    local aid = mp.get_property("aid")
    local sid = mp.get_property("sid")
    if track_type == "audio" then
        aid = value
    elseif track_type == "sub" then
        sid = value
    end

    local request = {
        track_type = track_type,
        value = value,
        aid = aid,
        sid = sid,
        title_id = state.title_id,
        file_generation = state.file_generation,
    }

    if not state.remember_selection then
        trace("persistence-skipped", { reason = "remember-selection-off", request = request })
        return
    end
    if not state.title_id then
        trace("persistence-skipped", { reason = "missing-title-id", request = request })
        return
    end
    if state.defense_active then
        trace("persistence-skipped", { reason = "defense-active", request = request })
        return
    end
    
    if state.pending_save then
        trace("persistence-save-debounce-cancel", { previous = state.pending_save_context, replacement = request })
        trace("timer-cancelled", { timer_id = state.pending_save_timer_id, kind = "persistence-save", reason = "debounced" })
        state.pending_save:kill()
    end
    
    state.pending_save_context = request
    trace("persistence-save-debounce-queue", { request = request, delay = 2 })
    state.pending_save, state.pending_save_timer_id = add_traced_timeout("persistence-save", 2, perform_save, { request = request })
end




--------------------------------------------------------------------------------
-- 11. MAIN ORCHESTRATOR
--------------------------------------------------------------------------------

local function on_start_file()
    state.file_generation = state.file_generation + 1
    state.file_active = false
    state.selection_phase = "automatic"
    state.trace_sequence = 0
    state.trace_started_at = mp.get_time()
    state.config_received_for_file = false
    state.active_selection_run = nil
    state.user_audio_selected_for_file = false
    state.auto_change_in_progress.aid = false
    state.auto_change_in_progress.sid = false
    state.saved_sub_match_quality = nil
    state.track_list_defense_guard = false

    if state.pending_save then
        trace("timer-cancelled", { timer_id = state.pending_save_timer_id, kind = "persistence-save", reason = "start-file" })
        state.pending_save:kill()
        state.pending_save = nil
        state.pending_save_timer_id = nil
        state.pending_save_context = nil
    end

    if state.track_snapshot_timer then
        trace("timer-cancelled", { timer_id = state.track_snapshot_timer_id, kind = "track-snapshot", reason = "start-file" })
        state.track_snapshot_timer:kill()
        state.track_snapshot_timer = nil
        state.track_snapshot_timer_id = nil
    end
    if state.config_timeout_timer then
        trace("timer-cancelled", { timer_id = state.config_timeout_timer_id, kind = "config-timeout", reason = "start-file" })
        state.config_timeout_timer:kill()
        state.config_timeout_timer = nil
        state.config_timeout_timer_id = nil
    end
    if state.defense_timer then
        trace("timer-cancelled", { timer_id = state.defense_timer_id, kind = "defense", reason = "start-file" })
        state.defense_timer:kill()
        state.defense_timer = nil
        state.defense_timer_id = nil
    end

    trace("lifecycle", { event = "start-file" })
    log_mpv_snapshot("start-file")
end

local function on_end_file(event)
    trace("lifecycle", { event = "end-file", reason = event and event.reason })
    log_mpv_snapshot("end-file")
    if state.config_timeout_timer then
        trace("timer-cancelled", { timer_id = state.config_timeout_timer_id, kind = "config-timeout", reason = "end-file" })
        state.config_timeout_timer:kill()
        state.config_timeout_timer = nil
        state.config_timeout_timer_id = nil
    end
    if state.defense_timer then
        trace("timer-cancelled", { timer_id = state.defense_timer_id, kind = "defense", reason = "end-file" })
        state.defense_timer:kill()
        state.defense_timer = nil
        state.defense_timer_id = nil
    end
    if state.external_sub_timer then
        trace("timer-cancelled", { timer_id = state.external_sub_timer_id, kind = "external-subtitle-timeout", reason = "end-file" })
        state.external_sub_timer:kill()
        state.external_sub_timer = nil
        state.external_sub_timer_id = nil
    end
    state.external_sub_watch = false
    state.waiting_for_saved_sub = false
    state.saved_sub_match_quality = nil
    state.track_list_defense_guard = false
    state.file_active = false
    state.selection_phase = "inactive"
    state.active_selection_run = nil
end

local function on_file_loaded()
    local started_at = mp.get_time()
    state.file_active = true
    state.selection_phase = "automatic"
    local run_id = begin_selection_run("file-loaded", {
        title_id = state.title_id,
        subtitle_mode = state.subtitle_mode,
        alias_groups = state.language_alias_group_count,
    })
    trace("file-loaded-start", {
        title_id = state.title_id,
        subtitle_mode = state.subtitle_mode,
        alias_groups = state.language_alias_group_count,
    })
    -- Reset state
    state.best_sid = nil
    state.best_aid = nil
    state.waiting_for_saved_sub = false
    state.saved_sub_match_quality = nil
    state.track_list_defense_guard = false
    state.defense_active = false
    state.parsed_config = nil  -- Re-parse config (allows hot-reload of conf file)
    -- Keep the latest route title until the bridge publishes the next context.
    -- Title-scoped metadata messages are validated before they can be applied.
    
    local track_list = mp.get_property_native("track-list") or {}
    log_mpv_snapshot("file-loaded:before-selection", track_list)

    if not state.config_received_for_file then
        local generation = state.file_generation
        state.config_timeout_timer, state.config_timeout_timer_id = add_traced_timeout("config-timeout", CONFIG_RECEIPT_TIMEOUT, function()
            state.config_timeout_timer = nil
            state.config_timeout_timer_id = nil
            if generation == state.file_generation and not state.config_received_for_file then
                trace("bridge-config-timeout", { timeout = CONFIG_RECEIPT_TIMEOUT })
                log_mpv_snapshot("bridge-config-timeout")
            end
        end, { expected_generation = generation })
    end

    -- 1. Check Stored Preference (Persistence)
    -- This MUST happen before smart selection to restore user choices
    local stored_aid, stored_sid, _, has_saved_sub, sub_match_quality = check_stored_preference(track_list)

    if stored_aid or stored_sid then
         log_info("Applying stored preference override for " .. tostring(state.title_id))
         
         if stored_aid then 
             state.best_aid = stored_aid
         end
         if stored_sid then
             state.best_sid = stored_sid
         end
    end

    state.saved_sub_match_quality = sub_match_quality
    state.waiting_for_saved_sub = has_saved_sub and
        (not stored_sid or sub_match_quality == "compatible")
    if state.waiting_for_saved_sub then
        trace("stored-preference-waiting", {
            type = "sub",
            title_id = state.title_id,
            provisional_sid = stored_sid,
            match_quality = sub_match_quality,
        })
    end

    -- AUDIO SELECTION
    -- Local track_list defined above
    
    -- Priority 1 after persistence: match the title's original metadata language.
    if not state.best_aid then
        state.best_aid = select_audio_by_original_language(track_list)

        -- Priority 2: Fall back to normal selection
        if not state.best_aid then
            state.best_aid = select_best_track("audio", track_list)
        end
    end
    
    if state.best_aid then
        set_aid_safe(state.best_aid)
    end

    -- SUBTITLE SELECTION
    -- A usable saved choice wins. Otherwise apply the current global mode.
    if state.best_sid then
         -- Persistence already set it.
    elseif state.subtitle_mode == "off" then
        state.best_sid = "no"
    else
        if state.subtitle_mode == "forced" then
            state.best_sid = select_forced_sub_only(track_list)
        else
            state.best_sid = select_forced_sub_for_native(track_list)
            if not state.best_sid then
                state.best_sid = select_best_track("sub", track_list)
            end
        end
    end
    
    if state.best_sid then
        set_sid_safe(state.best_sid)
    end
    
    -- Activate defense
    activate_defense(true)
    
    -- If no subtitle found, start watching for external subs
    if (not state.best_sid or state.waiting_for_saved_sub) and
        (state.subtitle_mode ~= "off" or state.waiting_for_saved_sub) then
        local watch_reason = state.waiting_for_saved_sub and "saved-preference-unavailable" or "no-suitable-subtitle"
        log_info("Waiting for external subs (" .. EXTERNAL_SUB_TIMEOUT .. "s): " .. watch_reason)
        state.external_sub_watch = true
        trace("external-sub-watch-start", { reason = watch_reason, timeout = EXTERNAL_SUB_TIMEOUT })
        -- Count only subtitle tracks, not all tracks
        local initial_sub_count = 0
        for _, t in ipairs(track_list) do
            if t.type == "sub" then initial_sub_count = initial_sub_count + 1 end
        end
        state.last_sub_count = initial_sub_count
        
        -- Set timeout to stop watching
        if state.external_sub_timer then
            trace("timer-cancelled", { timer_id = state.external_sub_timer_id, kind = "external-subtitle-timeout", reason = "replaced" })
            state.external_sub_timer:kill()
        end
        state.external_sub_timer, state.external_sub_timer_id = add_traced_timeout("external-subtitle-timeout", EXTERNAL_SUB_TIMEOUT, function()
            state.external_sub_timer = nil
            state.external_sub_timer_id = nil
            if state.external_sub_watch then
                local finalized_sid = state.best_sid
                log_info(finalized_sid and
                    ("External sub watch timeout. Finalizing fallback #" .. tostring(finalized_sid)) or
                    "External sub watch timeout. No suitable sub found.")
                state.external_sub_watch = false
                state.waiting_for_saved_sub = false
                trace("external-sub-watch-timeout", {
                    timeout = EXTERNAL_SUB_TIMEOUT,
                    finalized_sid = finalized_sid,
                    match_quality = state.saved_sub_match_quality,
                })
                if finalized_sid then
                    activate_defense(true)
                else
                    state.selection_phase = "user"
                end
                log_mpv_snapshot("external-sub-watch-timeout")
            end
        end, { initial_sub_count = state.last_sub_count })
    end
    if state.external_sub_watch then
        state.selection_phase = "external-sub-watch"
    elseif not state.defense_active then
        finish_automatic_selection_after_settle("file-loaded")
    end
    trace("file-loaded-finished", { outcome = "smart-selection", aid = state.best_aid, sid = state.best_sid, waiting_for_external_sub = state.external_sub_watch, elapsed = mp.get_time() - started_at })
    log_mpv_snapshot("file-loaded:after-selection", track_list)
    finish_selection_run(run_id, "smart-selection", { aid = state.best_aid, sid = state.best_sid, waiting_for_external_sub = state.external_sub_watch, elapsed = mp.get_time() - started_at })
end

-- Re-evaluate subtitles when new tracks appear (for external subs)
local function on_track_list_change(name, track_list)
    schedule_track_snapshot("track-list-settled")
    if track_list and state.track_list_defense_guard and state.best_sid then
        trace("defense-rearmed", { reason = "track-list-change", best_sid = state.best_sid })
        activate_defense(true)
    end
    if not state.external_sub_watch or not track_list then return end
    
    -- Count current subtitle tracks
    local sub_count = 0
    for _, track in ipairs(track_list) do
        if track.type == "sub" then sub_count = sub_count + 1 end
    end
    
    -- If new subs appeared, re-evaluate
    if sub_count > state.last_sub_count then
        local previous_sub_count = state.last_sub_count
        state.last_sub_count = sub_count
        local run_id = begin_selection_run("external-track", {
            previous_sub_count = previous_sub_count,
            current_sub_count = sub_count,
        })
        
        -- Try to find a suitable sub from the new tracks
        local new_sid = nil
        local saved_sub_restored = false

        if state.waiting_for_saved_sub then
            local _, saved_sid, _, _, match_quality = check_stored_preference(track_list)
            if saved_sid and match_quality ~= "compatible" then
                new_sid = saved_sid
                saved_sub_restored = true
                state.waiting_for_saved_sub = false
                state.saved_sub_match_quality = match_quality
                trace("stored-preference-sub-arrived", { sid = saved_sid, match_quality = match_quality })
            elseif saved_sid and state.saved_sub_match_quality ~= "compatible" then
                -- Use a compatible language/variant while continuing to wait
                -- for the exact saved title.
                new_sid = saved_sid
                state.saved_sub_match_quality = "compatible"
                trace("stored-preference-sub-provisional", { sid = saved_sid, match_quality = match_quality })
            end
        end

        -- Keep an existing fallback selected while waiting for the saved track.
        if not new_sid and not state.best_sid then
            if state.subtitle_mode == "forced" then
                new_sid = select_forced_sub_only(track_list)
            else
                new_sid = select_forced_sub_for_native(track_list)
                if not new_sid then
                    new_sid = select_best_track("sub", track_list)
                end
            end
        end
        
        if new_sid then
            log_info("Found suitable external sub #" .. tostring(new_sid))
            state.best_sid = new_sid
            state.selection_phase = "selector-settle"
            set_sid_safe(new_sid)
            if saved_sub_restored or not state.waiting_for_saved_sub then
                state.external_sub_watch = false
                if state.external_sub_timer then
                    trace("timer-cancelled", { timer_id = state.external_sub_timer_id, kind = "external-subtitle-timeout", reason = saved_sub_restored and "saved-subtitle-restored" or "subtitle-selected" })
                    state.external_sub_timer:kill()
                    state.external_sub_timer = nil
                    state.external_sub_timer_id = nil
                end
            end
            -- External tracks often arrive after the initial defense expired.
            -- Protect this automatic choice before reopening user persistence.
            activate_defense(true)
            trace("external-sub-selected", { sid = new_sid, saved_preference = saved_sub_restored, still_waiting_for_saved = state.waiting_for_saved_sub, previous_sub_count = previous_sub_count, current_sub_count = sub_count })
            schedule_track_snapshot("external-sub-selected")
        end
        finish_selection_run(run_id, new_sid and "external-sub-selected" or "no-match", {
            sid = new_sid,
            previous_sub_count = previous_sub_count,
            current_sub_count = sub_count,
        })
    end
end

--------------------------------------------------------------------------------
-- 12. INITIALIZATION & EVENT REGISTRATION
--------------------------------------------------------------------------------

mp.register_event("start-file", on_start_file)
mp.register_event("file-loaded", on_file_loaded)
mp.register_event("end-file", on_end_file)
mp.observe_property("sid", "string", defend_subtitle)
mp.observe_property("aid", "string", defend_audio)
mp.observe_property("track-list", "native", on_track_list_change)

--------------------------------------------------------------------------------
-- 13. DYNAMIC CONFIGURATION (SCRIPT MESSAGE)
--------------------------------------------------------------------------------

local function update_config(json_data)
    if not json_data then return end

    local started_at = mp.get_time()

    local success, new_config = pcall(function() return utils.parse_json(json_data) end)
    
    if not success or not new_config then
        log_info("Failed to parse config JSON")
        trace("bridge-config-rejected", { reason = "invalid-json", bytes = #json_data })
        return
    end

    state.config_revision = state.config_revision + 1
    local diagnostics = type(new_config._diagnostics) == "table" and new_config._diagnostics or {}
    state.config_sequence = diagnostics.config_sequence or state.config_sequence
    state.selection_phase = "automatic"
    state.config_received_for_file = true
    if state.config_timeout_timer then
        trace("timer-cancelled", { timer_id = state.config_timeout_timer_id, kind = "config-timeout", reason = "config-received" })
        state.config_timeout_timer:kill()
        state.config_timeout_timer = nil
        state.config_timeout_timer_id = nil
    end
    local run_id = begin_selection_run("bridge-config", {
        config_sequence = diagnostics.config_sequence,
        send_reason = diagnostics.send_reason,
        retry_count = diagnostics.retry_count,
        route = diagnostics.route,
    })
    trace("bridge-config-received", {
        bytes = #json_data,
        config_sequence = diagnostics.config_sequence,
        send_reason = diagnostics.send_reason,
        retry_count = diagnostics.retry_count,
        generated_at_ms = diagnostics.generated_at_ms,
        route = diagnostics.route,
        settings = diagnostics.settings,
        alias_groups = type(new_config.language_alias_groups) == "table" and #new_config.language_alias_groups or 0,
        fields = {
            sub_preferred_langs = new_config.sub_preferred_langs,
            audio_preferred_langs = new_config.audio_preferred_langs,
            sub_priority_keywords = new_config.sub_priority_keywords,
            sub_reject_langs = new_config.sub_reject_langs,
            audio_reject_langs = new_config.audio_reject_langs,
            audio_reject_keywords = new_config.audio_reject_keywords,
            sub_reject_keywords = new_config.sub_reject_keywords,
            match_audio_to_video = new_config.match_audio_to_video,
            use_forced_for_native = new_config.use_forced_for_native,
            title_id = new_config.title_id,
            remember_track_selection = new_config.remember_track_selection,
            subtitle_selection_mode = new_config.subtitle_selection_mode,
        },
    })
    log_mpv_snapshot("bridge-config:before-reevaluation")

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

    if new_config.language_alias_groups ~= nil then
        update_language_alias_groups(new_config.language_alias_groups)
    end
    
    -- New Context Fields
    if new_config.title_id ~= nil then
        if state.title_id ~= nil and state.title_id ~= new_config.title_id then
            trace("title-context-changed", { previous = state.title_id, current = new_config.title_id })
            state.waiting_for_saved_sub = false
            state.saved_sub_match_quality = nil
            state.track_list_defense_guard = false
            state.user_audio_selected_for_file = false
        end
        state.title_id = new_config.title_id
    end
    if new_config.remember_track_selection ~= nil then
        state.remember_selection = new_config.remember_track_selection
        log_info("  Updated remember_selection: " .. tostring(state.remember_selection))
    end
    if new_config.subtitle_selection_mode ~= nil then
        state.subtitle_mode = new_config.subtitle_selection_mode
        log_info("  Updated subtitle_mode: " .. tostring(state.subtitle_mode))
    end

    trace("effective-config", {
        title_id = state.title_id,
        remember_selection = state.remember_selection,
        subtitle_mode = state.subtitle_mode,
        match_audio_to_video = config.match_audio_to_video,
        original_language = state.title_id and state.original_languages[state.title_id] or nil,
        use_forced_for_native = config.use_forced_for_native,
        alias_groups = state.language_alias_group_count,
        audio = state.parsed_config.audio,
        sub = state.parsed_config.sub,
    })

    -- Trigger re-evaluation
    -- Disable defense temporarily to allow changes
    local was_defending = state.defense_active
    state.defense_active = false
    
    local track_list = mp.get_property_native("track-list") or {}
    trace("config-reevaluation-start", { title_id = state.title_id, tracks = #track_list, was_defending = was_defending, alias_groups = state.language_alias_group_count })

    -- Check Stored Preference Override FIRST
    local stored_aid, stored_sid, _, has_saved_sub, sub_match_quality = check_stored_preference(track_list)

    state.best_aid = nil
    state.best_sid = nil

    if stored_aid or stored_sid then
         log_info("Applying stored preference override for " .. tostring(state.title_id))
         if stored_aid then 
             state.best_aid = stored_aid
         end
         if stored_sid then
             state.best_sid = stored_sid
         end
    end

    state.saved_sub_match_quality = sub_match_quality
    state.waiting_for_saved_sub = state.file_active and has_saved_sub and
        (not stored_sid or sub_match_quality == "compatible")
    if state.waiting_for_saved_sub then
        trace("stored-preference-waiting", { type = "sub", title_id = state.title_id, trigger = "bridge-config" })
    end

    -- Trigger re-evaluation (Standard Smart Logic)
    log_info("Re-evaluating tracks with new config...")
    
    -- Audio
    if not state.best_aid then
        state.best_aid = select_audio_by_original_language(track_list)
        if not state.best_aid then
            state.best_aid = select_best_track("audio", track_list)
        end
    end
    if state.best_aid then
        set_aid_safe(state.best_aid)
    end
    
    -- Subtitles (respect subtitle_mode)
    if not state.best_sid then
        if state.subtitle_mode == "off" then
            state.best_sid = "no"
        elseif state.subtitle_mode == "forced" then
            state.best_sid = select_forced_sub_only(track_list)
        else
            state.best_sid = select_forced_sub_for_native(track_list)
            if not state.best_sid then
                state.best_sid = select_best_track("sub", track_list)
            end
        end
    end
    if state.best_sid then
        set_sid_safe(state.best_sid)
    end
    
    -- Restore defense
    if was_defending then
        activate_defense(true)
    else
        finish_automatic_selection_after_settle("bridge-config")
    end
    trace("config-reevaluation-finished", { outcome = "smart-selection", aid = state.best_aid, sid = state.best_sid, elapsed = mp.get_time() - started_at })
    log_mpv_snapshot("bridge-config:after-reevaluation")
    finish_selection_run(run_id, "smart-selection", { aid = state.best_aid, sid = state.best_sid, elapsed = mp.get_time() - started_at })
end

local function log_bridge_diagnostic(json_data)
    if not json_data then return end
    local success, diagnostic = pcall(function() return utils.parse_json(json_data) end)
    if not success or type(diagnostic) ~= "table" then
        trace("bridge-diagnostic-rejected", { reason = "invalid-json", bytes = #json_data })
        return
    end
    trace("bridge-diagnostic", diagnostic)
end

local function update_original_language(json_data)
    if not json_data then return end
    local success, payload = pcall(function() return utils.parse_json(json_data) end)
    if not success or type(payload) ~= "table" or not payload.title_id then
        trace("original-language-rejected", { reason = "invalid-payload" })
        return
    end

    local title_id = payload.title_id
    local expanded = normalize_language(payload.original_language_expanded)
    if expanded ~= "" then
        state.original_languages[title_id] = expanded
    elseif payload.status == "found" or payload.status == "not-found" then
        state.original_languages[title_id] = nil
    end
    trace("original-language-updated", {
        title_id = title_id,
        status = payload.status,
        raw = payload.original_language_raw,
        primary = payload.original_language_primary,
        expanded = expanded ~= "" and expanded or nil,
        active_title_id = state.title_id,
    })

    if title_id ~= state.title_id then
        trace("original-language-apply-skipped", { reason = "inactive-title", title_id = title_id, active_title_id = state.title_id })
        return
    end
    if not state.file_active or not config.match_audio_to_video or expanded == "" then
        trace("original-language-apply-skipped", {
            reason = not state.file_active and "file-inactive" or
                (not config.match_audio_to_video and "setting-disabled" or "language-unavailable"),
            title_id = title_id,
        })
        return
    end
    if state.user_audio_selected_for_file then
        trace("original-language-apply-skipped", { reason = "manual-audio-choice", title_id = title_id })
        return
    end

    local track_list = mp.get_property_native("track-list") or {}
    local stored_aid = check_stored_preference(track_list)
    if stored_aid then
        trace("original-language-apply-skipped", { reason = "saved-audio-preference", title_id = title_id, aid = stored_aid })
        return
    end

    local run_id = begin_selection_run("original-language", { title_id = title_id, original_language = expanded })
    local previous_phase = state.selection_phase
    state.selection_phase = "automatic"
    local selected_aid = select_audio_by_original_language(track_list)
    if selected_aid and not track_ids_equal(selected_aid, mp.get_property("aid")) then
        state.best_aid = selected_aid
        set_aid_safe(selected_aid)
        activate_defense()
        finish_selection_run(run_id, "original-language-selected", { aid = selected_aid })
    else
        state.selection_phase = previous_phase
        finish_selection_run(run_id, selected_aid and "already-selected" or "no-match", { aid = selected_aid })
    end
end

mp.register_script_message("track-selector-config", update_config)
mp.register_script_message("track-selector-diagnostic", log_bridge_diagnostic)
mp.register_script_message("track-selector-language", update_original_language)

log_info("Smart Track Selector initialized (v1.7.0) - Dynamic Config Enabled")
trace("initialized", { persistence_file = PERSISTENCE_FILE })
