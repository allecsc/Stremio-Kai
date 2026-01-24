--[[
  @name Filter Engine Module
  @description FFmpeg filter management for silence/blackframe detection
  @version 3.1
--]]

local mp = require 'mp'
local config = require('modules/config')
local state = require('modules/state')
local utils = require('modules/utils')
local windows = require('modules/window-calculator')
local content = require('modules/content-detection')
local chapters = require('modules/chapter-detection')

local M = {}

-- Forward declaration for notification module (will be set by main.lua)
M.notification = nil
    
-- CONSTANTS
-- Audio filters managed (disabled) during skip to prevent CPU overload
-- NOTE: Labels in MPV property do NOT have the '@' prefix used in commandv
local MANAGED_FILTERS = {"NIGHT", "CINEMA", "ANIME"}

--============================================================================--
--                           HELPER FUNCTIONS                                  --
--============================================================================--

-- Debug logging helper
local function debug_log(msg)
    if config.CONSTANTS.DEBUG_MODE then mp.msg.info(msg) end
end

-- Check if we have any HIGH confidence chapters (cached result)
local function has_high_confidence_chapters()
    return state.chapter_cache.has_high_confidence == true
end

--============================================================================--
--                           FILTER MANAGEMENT                                --
--============================================================================--

-- Initialize a filter if not already present
local function init_filter(property, label, name, params)
    local filters = mp.get_property_native(property) or {}
    local exists = false
    for _, f in ipairs(filters) do
        if f.label == label then
            exists = true
            break
        end
    end
    if not exists then
        local filter_string = "@" .. label .. ":" .. name
        if params and params.graph then
            filter_string = filter_string .. "=[" .. params.graph .. "]"
        end
        -- Prepend filters to ensure they run on the source stream (before processing)
        mp.commandv(property, "pre", filter_string)
    end
end

-- Set filter enabled/disabled state
function M.set_filter_state(property, label, is_enabled)
    local filters = mp.get_property_native(property) or {}
    for i = #filters, 1, -1 do
        if filters[i].label == label then
            if filters[i].enabled ~= is_enabled then
                filters[i].enabled = is_enabled
                mp.set_property_native(property, filters)
            end
            return
        end
    end
end

-- Initialize unified filters (used for both notification and exit detection)
function M.init_filters()
    init_filter('vf', 'blackdetect', 'lavfi', { graph = 'format=yuv420p,blackdetect=' .. config.opts.blackdetect_args })
    init_filter('af', 'silencedetect', 'lavfi', { graph = 'silencedetect=' .. config.opts.silencedetect_args })
    
    -- Disable by default, OR enable if notification is already active (scheduled start)
    local initial_state = state.detection_state.notification_active or false
    M.set_filter_state('vf', 'blackdetect', initial_state)
    M.set_filter_state('af', 'silencedetect', initial_state)
    
    mp.msg.info("Unified detection filters initialized")
end

-- Reset black detection tracking
function M.reset_black_detection()
    state.filter_tracking.last_black_start = nil
end

--============================================================================--
--                          UNIFIED FILTER TRIGGER                            --
--============================================================================--

-- Unified filter trigger (handles both notification and exit detection)
function M.unified_filter_trigger(name, value, source)
    -- During fast-forward skip, route to exit detection logic
    if state.skip_state.silence_active or state.skip_state.blackframe_skip_active then
        M.handle_exit_detection(value, source)
        return
    end
    
    -- Otherwise, route to notification logic
    M.handle_notification_detection(value, source)
end

--============================================================================--
--                        NOTIFICATION DETECTION                              --
--============================================================================--

-- Notification detection handler
function M.handle_notification_detection(value, source)
    if config.CONSTANTS.DEBUG_MODE then
        mp.msg.info("=== NOTIFICATION DEBUG ===")
        mp.msg.info(string.format("notification_active=%s suppression=%s intro_skipped=%s seeking=%s",
            tostring(state.detection_state.notification_active),
            tostring(state.ui_state.notification_cooldown_timer ~= nil),
            tostring(state.skip_state.intro_skipped),
            tostring(state.skip_state.is_seeking)))
        mp.msg.info(string.format("source=%s type=%s value=%s", source, type(value), tostring(value) or "nil"))
    end

    -- HIGH-CONFIDENCE FILES ONLY: Skip filter notifications when we have pattern-matched chapters
    -- MEDIUM confidence (untitled) chapters still use filter detection
    if has_high_confidence_chapters() then
        debug_log("BLOCKED: HIGH confidence chapters - filter notifications disabled")
        return
    end
    
    -- BLOCK during seeks to prevent corrupted metadata
    if state.skip_state.is_seeking or mp.get_property_native("seeking") then
        debug_log("BLOCKED: currently seeking")
        return
    end
    
    -- BLOCK during filter init to ignore FFmpeg startup noise
    if state.detection_state.filter_init_suppression then
        debug_log("BLOCKED: filter init suppression active")
        return
    end

    -- Check for empty or missing value (handle both nil, empty string, and empty table)
    local is_empty = not value or value == '' or (type(value) == 'table' and next(value) == nil)
    if not state.detection_state.notification_active or is_empty then
        debug_log("BLOCKED: detection not active or no value")
        return
    end
    if not string.match(value, 'lavfi%.black_start') and not string.match(value, 'lavfi%.silence_start') then
        debug_log("BLOCKED: not a relevant event")
        return
    end

    -- Check if notification cooldown is active OR intro already skipped
    if state.ui_state.notification_cooldown_timer or state.skip_state.intro_skipped then
        debug_log("BLOCKED: cooldown or intro_skipped")
        return
    end

    -- Parse event data using reusable table
    utils.parse_event_data(value)

    -- Prevent duplicate event processing
    local should_process = false
    if source == "blackdetect" then
        local black_start = utils.event_data['lavfi.black_start']
        if black_start and black_start ~= state.filter_tracking.last_processed_black_start then
            state.filter_tracking.last_processed_black_start = black_start
            should_process = true
            debug_log("NEW black event: " .. black_start)
        end
    elseif source == "silencedetect" then
        local silence_start = utils.event_data['lavfi.silence_start']
        if silence_start and silence_start ~= state.filter_tracking.last_processed_silence_start then
            state.filter_tracking.last_processed_silence_start = silence_start
            should_process = true
            debug_log("NEW silence event: " .. silence_start)
        end
    end

    if not should_process then
        debug_log("BLOCKED: duplicate event")
        return
    end

    if source == "silencedetect" then
        local silence_duration = utils.event_data['lavfi.silence_duration']
        if silence_duration then
            local duration = tonumber(silence_duration)
            if duration and duration < 0.5 then
                debug_log("BLOCKED: silence too short (" .. duration .. "s)")
                return
            end
        end
    end

    local current_time = utils.get_time()
    local duration = mp.get_property_native("duration") or 0
    local message = ""
    local in_window = false

    -- Determine message based on dynamic time windows
    local intro_window = windows.get_intro_window()
    local outro_window = windows.get_outro_window()
    
    if intro_window > 0 and current_time <= intro_window then
        message = "Skip Intro"
        in_window = true
    elseif outro_window > 0 and duration > 0 and current_time >= (duration - outro_window) then
        message = "Skip Outro"
        in_window = true
    end
    
    -- HYBRID MODE: If outside window, check for nearby chapter end
    -- Filter event + nearby chapter end = higher confidence, auto-notify
    if not in_window then
        local nearby = chapters.get_nearby_chapter_end(current_time)
        if nearby and state.chapter_cache.evaluated_chapters then
            local eval = state.chapter_cache.evaluated_chapters[nearby.index]
            
            if eval then
                -- Validate against chapter evaluation cache (Single Source of Truth)
                -- Only notify if this chapter was actually evaluated as a valid target (Intro/Outro/High Conf)
                -- We explicitly reject "none" confidence (mid-movie) or "low" confidence without zone
                local is_valid = false
                
                if eval.confidence == "high" then
                    is_valid = true
                elseif eval.zone == "intro" or eval.zone == "outro" then
                    is_valid = true
                elseif eval.matched_category == "ending" then
                    is_valid = true
                end
                
                if is_valid then
                    -- Determine message from the evaluation data, not arbitrary time
                    if eval.matched_category == "ending" or eval.matched_category == "preview" or eval.zone == "outro" then
                        message = "Skip Outro"
                    else
                        message = "Skip Intro"
                    end
                    
                    debug_log(string.format("Hybrid mode: filter event + verified chapter end at %.1fs (conf=%s, type=%s)", 
                        nearby.chapter_end, eval.confidence, message))
                else
                    debug_log(string.format("Hybrid mode: ignored filtered event near chapter #%d (conf=%s, zone=%s)",
                        nearby.index, eval.confidence or "none", eval.zone or "nil"))
                end
            end
        end
    end

    if message ~= "" and M.notification then
        mp.msg.info(string.format("Notification: %s (from %s at %.1fs)", message, source, current_time))
        M.notification.show_skip_overlay(message, config.opts.filters_notification_duration, true)
        M.notification.start_notification_cooldown()
    end
end

--============================================================================--
--                           EXIT DETECTION                                   --
--============================================================================--

-- Exit detection handler (during fast-forward skip)
-- Uses 10s dwell window to cluster nearby exit events and pick the latest one
function M.handle_exit_detection(value, source)
    if not state.detection_state.skipping_active or not value or value == '{}' then return end
    
    local current_time = utils.get_time()
    local skip_time = nil
    
    -- Parse event data using reusable table
    utils.parse_event_data(value)

    if source == "blackdetect" then
        if config.CONSTANTS.DEBUG_MODE then mp.msg.info(string.format("EXIT DETECTION - BLACKDETECT: %s", value or "nil")) end
    
        -- Check for black_end - this marks the end of intro/outro
        -- IMPORTANT: Also validate black_start > skip_start_time to avoid using stale data
        local black_start = tonumber(utils.event_data['lavfi.black_start'])
        local black_end = tonumber(utils.event_data['lavfi.black_end'])
        
        if black_end and black_start and black_start > state.skip_state.skip_start_time then
            if black_end > black_start then
                skip_time = black_end
                
                -- Check minimum duration
                local potential_duration = skip_time - state.skip_state.skip_start_time
                if potential_duration < config.opts.min_skip_duration then
                    if config.CONSTANTS.DEBUG_MODE then mp.msg.info(string.format("Ignoring short skip: %.1fs", potential_duration)) end
                    state.skip_state.skip_start_time = skip_time
                    return
                end

                -- DWELL WINDOW: Instead of stopping immediately, mark as candidate
                mp.msg.info(string.format("Exit candidate found (black_end): %.1fs", skip_time))
                M.set_exit_candidate(skip_time)
                return
            end
        end
    
        -- Track black_start for fallback logic
        if utils.event_data['lavfi.black_start'] then
            state.filter_tracking.last_black_start = tonumber(utils.event_data['lavfi.black_start'])
        end
        
    elseif source == "silencedetect" then
        if config.CONSTANTS.DEBUG_MODE then mp.msg.info(string.format("EXIT DETECTION - SILENCEDETECT: %s", value or "nil")) end
        
        -- Only use silence if we haven't seen black detection
        if not state.filter_tracking.last_black_start then
            if utils.event_data['lavfi.silence_start'] then
                local silence_start = tonumber(utils.event_data['lavfi.silence_start'])
                if silence_start > current_time + 1 then
                    skip_time = silence_start
                    
                    -- Check minimum duration
                    local potential_duration = skip_time - state.skip_state.skip_start_time
                    if potential_duration < config.opts.min_skip_duration then
                        if config.CONSTANTS.DEBUG_MODE then mp.msg.info(string.format("Ignoring short skip: %.1fs", potential_duration)) end
                        state.skip_state.skip_start_time = skip_time
                        return
                    end

                    -- DWELL WINDOW: Instead of stopping immediately, mark as candidate
                    mp.msg.info(string.format("Exit candidate found (silence): %.1fs", skip_time))
                    M.set_exit_candidate(skip_time)
                    return
                end
            end
        end
    end
end

-- Set or update exit candidate with dwell window
-- Uses FIXED window: Timer starts at FIRST event and does not extend.
-- We always pick the LATEST event found within that 5s window.
local DWELL_WINDOW = 5  -- seconds of video time to wait from FIRST candidate

function M.set_exit_candidate(candidate_time)
    -- Initialize on first candidate
    if not state.filter_tracking.exit_candidate_time then
        state.filter_tracking.exit_candidate_time = utils.get_time()
        -- Set initial candidate
        state.filter_tracking.exit_candidate = candidate_time
        mp.msg.info(string.format("Exit candidate found: %.1fs (starting %ds fixed dwell)", candidate_time, DWELL_WINDOW))
        
        -- Start dwell timer
        state.filter_tracking.exit_dwell_timer = mp.add_periodic_timer(0.1, function()
            local current_pos = utils.get_time()
            local first_candidate_pos = state.filter_tracking.exit_candidate_time
            
            -- Check elapsed video time against FIXED start time
            if first_candidate_pos and (current_pos - first_candidate_pos) >= DWELL_WINDOW then
                -- Dwell expired, finalize at the BEST (latest) candidate found so far
                local final_exit = state.filter_tracking.exit_candidate
                
                mp.msg.info(string.format("Exit finalized after %.1fs fixed dwell: %.1fs", DWELL_WINDOW, final_exit))
                
                -- Clean up timer
                state.filter_tracking.exit_dwell_timer:kill()
                state.filter_tracking.exit_dwell_timer = nil
                
                -- Execute the skip
                state.filter_tracking.detected_skip_end = final_exit
                M.stop_silence_skip()
                utils.set_time(final_exit)
            end
        end)
        return
    end

    -- For subsequent candidates, check if we are still within the Dwell Window
    -- This MUST be done synchronously because 90x speed causes massive overshoot between timer ticks
    local first_candidate_pos = state.filter_tracking.exit_candidate_time
    if first_candidate_pos and (candidate_time - first_candidate_pos) > DWELL_WINDOW then
        -- Overshoot detected!
        -- The player speed (90x) pushed us way past the window before the timer could fire.
        -- We must REJECT this new candidate (it belongs to the next scene/segment)
        -- and force-finalize the previous valid candidate immediately.
        local final_exit = state.filter_tracking.exit_candidate
        
        mp.msg.info(string.format("Overshoot detected! New candidate %.1fs is outside dwell window (%.1fs). Forcing skip to %.1fs", 
            candidate_time, DWELL_WINDOW, final_exit))
            
        if state.filter_tracking.exit_dwell_timer then
            state.filter_tracking.exit_dwell_timer:kill()
            state.filter_tracking.exit_dwell_timer = nil
        end
        
        state.filter_tracking.detected_skip_end = final_exit
        M.stop_silence_skip()
        utils.set_time(final_exit)
        return
    end

    -- If inside window, assume this is a refinement (e.g. silence ending slightly later)
    local previous = state.filter_tracking.exit_candidate
    state.filter_tracking.exit_candidate = candidate_time
    mp.msg.info(string.format("Exit candidate updated: %.1fs -> %.1fs", previous, candidate_time))
end

--============================================================================--
--                          SILENCE SKIP CONTROL                              --
--============================================================================--

-- Start silence-based skip (fast-forward mode)
function M.start_silence_skip()
    if state.skip_state.silence_active then return end

    M.reset_black_detection() -- Reset state before starting
    
    state.skip_state.skip_start_time = utils.get_time()
    state.skip_state.silence_active = true
    state.skip_state.blackframe_skip_active = true
    state.detection_state.skipping_active = true
    
    -- Enable filters for exit detection
    M.set_filter_state('vf', 'blackdetect', true)
    M.set_filter_state('af', 'silencedetect', true)
    
    -- Set up observers on-demand if not already set up
    -- (For high-confidence chaptered files, start_filters() wasn't called)
    if not state.filter_observers.blackdetect then
        state.filter_observers.blackdetect = function(n, v) M.unified_filter_trigger(n, v, "blackdetect") end
        mp.observe_property('vf-metadata/blackdetect', 'string', state.filter_observers.blackdetect)
    end
    if not state.filter_observers.silencedetect then
        state.filter_observers.silencedetect = function(n, v) M.unified_filter_trigger(n, v, "silencedetect") end
        mp.observe_property('af-metadata/silencedetect', 'string', state.filter_observers.silencedetect)
    end
    
    utils.set_pause(false)
    utils.set_mute(true)
    
    -- Optimize MPV properties for max speed skip
    -- 1. Enable frame drops during seeking/skipping (critical for high speed)
    mp.set_property("hr-seek-framedrop", "yes")
    -- 2. Minimize video queue to prevent buffer bloat/stalling (runtime workaround for vd-queue-enable)
    -- Store original value to restore later (default in Anime profile is 35)
    state.filter_tracking.original_vd_queue = mp.get_property("vd-queue-max-samples")
    mp.set_property("vd-queue-max-samples", "1")
    
    utils.set_speed(config.CONSTANTS.MAX_SPEED)
    
    if M.notification then
        M.notification.show_skip_overlay("Fast Forward", 0, false)
    end
    
    -- Timeout safeguard: use position-based tracking instead of real-time timer
    -- This ensures we actually scan 180s of video content, regardless of buffering/network
    state.skip_state.skip_timeout_timer = mp.add_periodic_timer(0.5, function()
        local current_pos = utils.get_time()
        local video_elapsed = current_pos - state.skip_state.skip_start_time
        
        if video_elapsed >= config.CONSTANTS.SKIP_SEARCH_TIMEOUT then
            if state.skip_state.silence_active or state.skip_state.blackframe_skip_active then
                -- No exit found after scanning 180s of content, use fallback jump
                local fallback_position = state.skip_state.skip_start_time + config.CONSTANTS.SKIP_FALLBACK_DURATION
                state.filter_tracking.detected_skip_end = fallback_position
                
                mp.msg.info(string.format("Skip timeout: no exit found after %.0fs of content, jumping to fallback (%.1fs)",
                    video_elapsed, fallback_position))
                
                utils.set_time(fallback_position)
                M.stop_silence_skip()
            end
        end
    end)
    
    -- Disable heavy audio filters to prevent pipeline stall at 90x speed
    -- We target the specific labels used by profile-manager
    state.filter_tracking.disabled_filters = {} 
    
    local active_filters = mp.get_property_native("af") or {}
    
    if type(active_filters) == "table" then
        for _, af_entry in ipairs(active_filters) do
            -- Only disable if currently enabled
            if af_entry.enabled then
                 for _, target_label in ipairs(MANAGED_FILTERS) do
                    if af_entry.label == target_label then
                        -- Use internal helper to toggle "enabled" flag safely
                        M.set_filter_state("af", target_label, false)
                        table.insert(state.filter_tracking.disabled_filters, target_label)
                        if config.CONSTANTS.DEBUG_MODE then mp.msg.info("Disabled AF during skip: " .. target_label) end
                    end
                 end
            end
        end
    end

    mp.msg.info("Silence skip started")
end

-- Stop silence-based skip
function M.stop_silence_skip()
    if not state.skip_state.silence_active and not state.skip_state.blackframe_skip_active then return end
    
    -- Cancel timeout safeguard timer (exit was found or skip was cancelled)
    if state.skip_state.skip_timeout_timer then
        state.skip_state.skip_timeout_timer:kill()
        state.skip_state.skip_timeout_timer = nil
    end
    
    -- Cancel exit dwell timer
    if state.filter_tracking.exit_dwell_timer then
        state.filter_tracking.exit_dwell_timer:kill()
        state.filter_tracking.exit_dwell_timer = nil
    end
    state.filter_tracking.exit_candidate = nil
    state.filter_tracking.exit_candidate_time = nil
    
    -- Check if this was a substantial intro skip
    local end_time = state.filter_tracking.detected_skip_end or utils.get_time()
    local skip_duration = end_time - state.skip_state.skip_start_time
    
    if config.CONSTANTS.DEBUG_MODE then
        mp.msg.info(string.format("Skip duration: %.1fs (start=%.1f, end=%.1f)", 
            skip_duration, state.skip_state.skip_start_time, end_time))
    end
    
    -- Check if this was a substantial intro skip (skip started in intro zone)
    local intro_window = windows.get_intro_window()
    if skip_duration > config.CONSTANTS.MIN_INTRO_LENGTH and intro_window > 0 and state.skip_state.skip_start_time <= intro_window then
        state.skip_state.intro_skipped = true
        mp.msg.info(string.format("Substantial intro skip (%.1fs), blocking future notifications", skip_duration))
        
        -- Immediately disable filters to reset FFmpeg state and clear stale metadata
        M.stop_filters()
        
        -- Reset filter tracking for clean slate when entering outro window
        state.reset_filter_tracking()
    end
    
    state.skip_state.silence_active = false
    state.skip_state.blackframe_skip_active = false
    state.detection_state.skipping_active = false
    
    utils.set_mute(false)
    utils.set_speed(config.CONSTANTS.NORMAL_SPEED)
    
    -- Restore disabled audio filters
    if state.filter_tracking.disabled_filters then
        for _, label in ipairs(state.filter_tracking.disabled_filters) do
            -- Restore enabled state using internal helper
            M.set_filter_state("af", label, true)
            if config.CONSTANTS.DEBUG_MODE then mp.msg.info("Restored AF after skip: " .. label) end
        end
        state.filter_tracking.disabled_filters = {} -- Clear the stack
    end
    
    -- Restore MPV properties
    mp.set_property("hr-seek-framedrop", "no") -- Default for Anime profile is "no"
    if state.filter_tracking.original_vd_queue then
        mp.set_property("vd-queue-max-samples", state.filter_tracking.original_vd_queue)
        state.filter_tracking.original_vd_queue = nil
    else
        -- Fallback default if read failed
        mp.set_property("vd-queue-max-samples", "35") 
    end
    
    -- For HIGH-CONFIDENCE chaptered files only, disable filters AND remove observers after FF skip
    -- MEDIUM confidence (untitled) chapters keep filters active for detection
    if has_high_confidence_chapters() then
        -- Disable filter processing
        M.set_filter_state('vf', 'blackdetect', false)
        M.set_filter_state('af', 'silencedetect', false)
        
        -- Remove observers to prevent stale metadata callbacks
        if state.filter_observers.blackdetect then
            mp.unobserve_property(state.filter_observers.blackdetect)
            state.filter_observers.blackdetect = nil
        end
        if state.filter_observers.silencedetect then
            mp.unobserve_property(state.filter_observers.silencedetect)
            state.filter_observers.silencedetect = nil
        end
        
        mp.msg.info("Filters disabled after FF skip (HIGH-confidence mode)")
    end
    
    if M.notification then
        M.notification.hide_skip_overlay()
    end
    
    mp.msg.info("Silence skip stopped")
end

--============================================================================--
--                        FILTER STATE MANAGEMENT                             --
--============================================================================--

-- Start notification filters
function M.start_filters()
    if state.detection_state.notification_active then return end
    state.detection_state.notification_active = true
    
    -- Enable filter init suppression to ignore FFmpeg init noise
    state.detection_state.filter_init_suppression = true
    if state.detection_state.filter_init_timer then
        state.detection_state.filter_init_timer:kill()
    end
    state.detection_state.filter_init_timer = mp.add_timeout(0.5, function()
        state.detection_state.filter_init_suppression = false
        state.detection_state.filter_init_timer = nil
        if config.CONSTANTS.DEBUG_MODE then mp.msg.info("Filter init suppression ended") end
    end)
    
    -- Enable unified filters
    M.set_filter_state('vf', 'blackdetect', true)
    M.set_filter_state('af', 'silencedetect', true)

    -- Set up observers pointing to unified trigger
    state.filter_observers.blackdetect = function(n, v) M.unified_filter_trigger(n, v, "blackdetect") end
    state.filter_observers.silencedetect = function(n, v) M.unified_filter_trigger(n, v, "silencedetect") end
    
    mp.observe_property('vf-metadata/blackdetect', 'string', state.filter_observers.blackdetect)
    mp.observe_property('af-metadata/silencedetect', 'string', state.filter_observers.silencedetect)
    
    mp.msg.info("Detection filters started")
end

-- Stop notification filters
function M.stop_filters()
    if not state.detection_state.notification_active then return end
    state.detection_state.notification_active = false
    
    -- Disable unified filters
    M.set_filter_state('vf', 'blackdetect', false)
    M.set_filter_state('af', 'silencedetect', false)

    -- Remove observers
    if state.filter_observers.blackdetect then
        mp.unobserve_property(state.filter_observers.blackdetect)
        state.filter_observers.blackdetect = nil
    end
    if state.filter_observers.silencedetect then
        mp.unobserve_property(state.filter_observers.silencedetect)
        state.filter_observers.silencedetect = nil
    end
    
    -- Cleanup filter init suppression
    state.detection_state.filter_init_suppression = false
    if state.detection_state.filter_init_timer then
        state.detection_state.filter_init_timer:kill()
        state.detection_state.filter_init_timer = nil
    end

    mp.msg.info("Detection filters stopped")
end

-- Update filter state based on current playback position
-- NOTE: Filters are always-on for series. This function now only:
-- 1. Ensures filters are started for series
-- 2. Stops filters for movies
-- 3. Resets state when entering outro window
function M.update_notification_filters_state()
    -- Skip detection disabled for movies
    if not content.is_skip_enabled() then
        if state.detection_state.notification_active then
            M.stop_filters()
        end
        return
    end
    
    -- Only skip auto-start for HIGH-confidence chaptered files
    -- MEDIUM confidence (untitled) chapters need filter detection
    if not state.detection_state.notification_active and not has_high_confidence_chapters() then
        M.start_filters()
    end
    
    local current_time = utils.get_time()
    local duration = mp.get_property_native("duration") or 0
    
    -- Dynamic window calculation (20% intro, 20% outro)
    local intro_window = windows.get_intro_window()
    local outro_window = windows.get_outro_window()
    
    -- Debug: Log when duration first becomes available
    if config.CONSTANTS.DEBUG_MODE and intro_window > 0 and not state.detection_state._duration_logged then
        state.detection_state._duration_logged = true
        mp.msg.info(string.format("Duration available: %.0fs, intro_window=%.0fs, outro_window=%.0fs", 
            duration, intro_window, outro_window))
    end
    
    -- Check if in outro window
    local in_outro_window = (outro_window > 0 and duration > 0 and current_time >= (duration - outro_window))
    
    -- Reset state when entering outro window to allow outro notifications
    if in_outro_window and state.skip_state.intro_skipped then
        state.skip_state.intro_skipped = false
        -- Also clear cooldown timer so new events can trigger
        if state.ui_state.notification_cooldown_timer then
            state.ui_state.notification_cooldown_timer:kill()
            state.ui_state.notification_cooldown_timer = nil
        end
        -- Reset filter tracking so stale intro events don't block outro
        state.filter_tracking.last_processed_black_start = nil
        state.filter_tracking.last_processed_silence_start = nil
        mp.msg.info("Entered outro window, reset state to allow outro notifications")
    end
    
    -- NOTE: Filters stay on. Auto-notification gating happens in handle_notification_detection()
end

return M
