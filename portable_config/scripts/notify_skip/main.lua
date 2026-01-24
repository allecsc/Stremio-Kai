--[[
  @name Notify Skip
  @description Chapter-based skip notifications with filter detection fallback
  @version 3.1
  @author allecsc
  
  @changelog
    v1.x - Initial implementations (uosc, silence/blackframe detection)
    v2.x - Progressive improvements:
         - Consolidated UI, performance optimizations, state management
         - Filter consolidation, content type detection, dynamic windows
         - Timeout safeguards, filter reset fixes, cleanup refactors
    v3.0 - MAJOR: Modular architecture refactor
         - Split monolith into 10 focused modules
         - main.lua is now purely an orchestrator
    v3.1 - Hybrid mode implementation
         - Chapter confidence levels (HIGH/MEDIUM/LOW/NONE)
         - CASE 2 heuristics for untitled chapters
         - Skip confirmation system for uncertain skips
         - DRY refactor: extracted helper functions
         - Consolidated pattern matching (simplified regex)
  
  @requires
    - modules/skip-toast.lua (OSD toast overlay)
    - script-opts/notify_skip.conf (optional)
  
  Architecture:
    HYBRID MODE: Chapters provide skip targets, filters detect boundaries
    - HIGH confidence: Pattern-matched chapters (OP, ED, etc.) → instant skip
    - MEDIUM confidence: Heuristic-matched or in-window → filter notification
    - LOW/NONE: No auto-notify, chapter end still usable for manual skip
--]]

-- Set up package paths
local script_dir = debug.getinfo(1, 'S').source:match('@(.*/)') or './'
package.path = script_dir .. '?.lua;' .. script_dir .. 'modules/?.lua;' .. package.path

-- Required MPV modules
local mp = require 'mp'
local utils = require 'mp.utils'

-- Load our modules
local config = require('modules/config')
local state = require('modules/state')
local app_utils = require('modules/utils')
local content = require('modules/content-detection')
local windows = require('modules/window-calculator')
local chapters = require('modules/chapter-detection')
local filter_engine = require('modules/filter-engine')
local notification = require('modules/notification')
local skip_executor = require('modules/skip-executor')

-- Load skip toast overlay
local skip_toast = require('modules/skip-toast')

-- Create OSD overlay and initialize toast
local osd = mp.create_osd_overlay('ass-events')
skip_toast:init(osd)

-- Wire up module dependencies
notification.skip_button = skip_toast
filter_engine.notification = notification
skip_executor.filter_engine = filter_engine
skip_executor.notification = notification

--============================================================================--
--                          LIFECYCLE FUNCTIONS                               --
--============================================================================--

local function finalize_setup()
    -- Wire up chapter detection with windows module
    chapters.windows = windows
    
    -- Evaluate chapters once, then extract skippable subset
    local all_evaluated = chapters.evaluate_chapters()
    state.chapter_cache.evaluated_chapters = all_evaluated
    
    -- Filter for chapters that should auto-notify (use_chapter_notification = true)
    local skippable = {}
    for _, eval in ipairs(all_evaluated) do
        if eval.use_chapter_notification then
            table.insert(skippable, {
                index = eval.index,
                time = eval.chapter_start,
                title = eval.title,
                category = eval.matched_category or (eval.zone == "intro" and "opening" or "ending"),
                duration = eval.chapter_length,
                confidence = eval.confidence,
                chapter_end = eval.chapter_end,
            })
        end
    end
    state.chapter_cache.skippable_chapters = skippable
    
    local has_skippable = #state.chapter_cache.skippable_chapters > 0
    local has_any_chapters = #mp.get_property_native("chapter-list", {}) > 0
    
    -- HYBRID MODE: Always use "hybrid" mode - filters for detection, chapters for targets
    state.skip_state.mode = "hybrid"
    
    -- Always initialize filters (they start disabled), but DELAY them to allow video chain to stabilize
    mp.add_timeout(2.5, function() 
        filter_engine.init_filters() 
    end) 
    
    -- Check if we have HIGH confidence chapters (pattern-matched) and cache result
    local has_high_confidence = false
    for _, chapter in ipairs(state.chapter_cache.skippable_chapters) do
        if chapter.confidence == "high" then
            has_high_confidence = true
            break
        end
    end
    state.chapter_cache.has_high_confidence = has_high_confidence
    
    if has_high_confidence then
        -- HIGH-CONFIDENCE: Don't start filters, only chapter entry triggers notifications
        -- Filters will be enabled on-demand for FF exit detection during skip
        mp.msg.info(string.format("Hybrid mode: HIGH confidence - %d chapters with auto-notify (filters on-demand only)", 
            #state.chapter_cache.skippable_chapters))
        
        -- Initial check for current chapter
        skip_executor.check_auto_skip()
        notification.notify_on_chapter_entry()
    elseif has_skippable then
        -- MEDIUM confidence chapters (untitled but valid) - need filter detection for notification
        mp.msg.info(string.format("Hybrid mode: MEDIUM confidence - %d chapters, filter detection active", 
            #state.chapter_cache.skippable_chapters))
            filter_engine.start_filters() 
        
        -- Still check for chapter entry (for common length chapters at file start)
        skip_executor.check_auto_skip()
        notification.notify_on_chapter_entry()
    elseif has_any_chapters then
        -- Chapters exist but none auto-notify - need filter detection
        mp.msg.info(string.format("Hybrid mode: %d chapters evaluated (none auto-notify, filter detection active)", 
            #state.chapter_cache.evaluated_chapters))
            filter_engine.start_filters() 
    else
        -- No chapters at all - pure filter detection
        mp.msg.info("Hybrid mode: no chapters, pure filter detection")
            filter_engine.start_filters() 
    end
end

local function on_file_loaded()
    -- Log separator for easier debugging
    local filename = mp.get_property("filename") or "unknown"
    mp.msg.info("══════════════════════════════════════════════════════════════")
    mp.msg.info("FILE START: " .. filename)
    mp.msg.info("══════════════════════════════════════════════════════════════")
    
    notification.hide_skip_overlay()
    filter_engine.stop_filters()
    if state.skip_state.silence_active or state.skip_state.blackframe_skip_active then
        filter_engine.stop_silence_skip()
    end
    state.reset_all()
    
    -- Wait a short time for content-metadata to arrive, then run setup
    mp.add_timeout(1.0, function()
        if content.is_movie() then
            mp.msg.info("Movie detected - skip detection disabled")
            return
        elseif content.is_series() then
            local duration = mp.get_property_native("duration") or 0
            local intro_win = duration * config.CONSTANTS.INTRO_WINDOW_PERCENT
            local outro_win = duration * config.CONSTANTS.OUTRO_WINDOW_PERCENT
            mp.msg.info(string.format("Series detected - windows: intro=%.0fs, outro=%.0fs", 
                intro_win, outro_win))
            finalize_setup()
        else
            -- Content type not yet known, set pending flag for deferred setup
            content.set_setup_pending(true)
            mp.msg.info("Content type unknown, waiting for metadata...")
        end
    end)
end

local function on_shutdown()
    -- Log separator for end of file
    local filename = mp.get_property("filename") or "unknown"
    mp.msg.info("══════════════════════════════════════════════════════════════")
    mp.msg.info("FILE END: " .. filename)
    mp.msg.info("══════════════════════════════════════════════════════════════")
    
    notification.hide_skip_overlay()
    filter_engine.stop_filters()
    if state.skip_state.silence_active or state.skip_state.blackframe_skip_active then 
        filter_engine.stop_silence_skip() 
    end
end

--============================================================================--
--                          EVENT HANDLERS                                    --
--============================================================================--

local function on_time_change(_, time)
    if state.skip_state.mode ~= "none" then
        filter_engine.update_notification_filters_state()
    end
end

local function on_chapter_change()
    if state.skip_state.mode ~= "none" then
        skip_executor.check_auto_skip()
        notification.notify_on_chapter_entry()
    end
end

local function on_seek()
    notification.hide_skip_overlay()
    notification.start_notification_cooldown()

    -- Set seeking flag to prevent corrupted filter metadata processing
    state.skip_state.is_seeking = true

    -- Clear any pending seek timeout
    if state.skip_state.seek_timeout then
        state.skip_state.seek_timeout:kill()
    end

    -- Re-enable notifications after seek settles
    -- Re-enable notifications after seek settles
    state.skip_state.seek_timeout = mp.add_timeout(0.5, function()
        state.skip_state.is_seeking = false
        state.skip_state.seek_timeout = nil
        if config.CONSTANTS.DEBUG_MODE then mp.msg.info("Seek stabilization complete") end
        
        -- Always check for chapter entry after seek settles
        -- This ensures notification appears if we seek INTO a skippable chapter
        notification.notify_on_chapter_entry()
    end)

    -- Reset intro_skipped if seeking back before skip point
    -- NOTE: This only affects FILTER notifications (which check intro_skipped)
    -- Chapter notifications always show regardless of this flag
    if state.skip_state.intro_skipped and app_utils.get_time() < state.skip_state.skip_start_time then
        state.skip_state.intro_skipped = false
        state.reset_filter_tracking()
        mp.msg.info("Seeked back before skip point, re-enabling filter notifications")
    end
end

local function update_display_dimensions()
    local real_width, real_height = mp.get_osd_size()
    if real_width <= 0 then return end
    skip_toast:update_display(real_width, real_height)
end

--============================================================================--
--                      EVENT REGISTRATION                                    --
--============================================================================--

-- Register MPV events
mp.register_event("file-loaded", on_file_loaded)
mp.register_event("shutdown", on_shutdown)
mp.register_event("seek", on_seek)

-- Register property observers
mp.observe_property("time-pos", "number", on_time_change)
mp.observe_property("chapter", "number", on_chapter_change)
mp.observe_property('osd-dimensions', 'native', update_display_dimensions)

-- Register key binding
mp.add_key_binding('Tab', 'perform_skip', skip_executor.perform_skip)

-- Handler for content metadata from mpv-bridge.js
mp.register_script_message("content-metadata", function(json)
    local data = utils.parse_json(json)
    if not data then return end
    
    -- Store content metadata
    content.update_metadata(data.content_type, data.imdb_id)
    
    mp.msg.info(string.format("Content metadata received: type=%s, id=%s", 
        data.content_type or "unknown", data.imdb_id or "unknown"))
    
    -- If finalize_setup already ran but mode is still "none" (waiting for content type),
    -- trigger it now
    if state.skip_state.mode == "none" and content.is_series() and content.is_setup_pending() then
        content.set_setup_pending(false)
        mp.msg.info("Content type now available, running deferred setup")
        finalize_setup()
    end
end)

mp.msg.info("Notify Skip v3.1 loaded (modular architecture)")
