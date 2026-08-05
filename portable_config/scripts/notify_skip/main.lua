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

-- Track active skippable chapter key to debounce and control notifications
local active_skippable_chapter_key = nil

-- Display names for virtual chapter categories
local virtual_category_names = {
    opening = "Intro",
    ending  = "Outro",
    recap   = "Recap",
}

-- Path to python.exe: navigate from notify_skip/ up 3 dirs to Stremio Kai root.
-- Normalize backslashes first since Windows paths mix separators.
local normalized_script_dir = script_dir:gsub("\\", "/")
local stremio_root = normalized_script_dir:match("(.+/)[^/]+/[^/]+/[^/]+/$") or normalized_script_dir
local python_exe   = stremio_root .. "python.exe"

--============================================================================--
--                     INTRODB VIRTUAL CHAPTER LOGIC                          --
--============================================================================--

-- Synchronize native MPV chapter list with IntroDB segments
local function sync_native_chapters_from_introdb(segments)
    if not segments then return end
    local duration = mp.get_property_native("duration") or 0
    local intro = segments.intro
    local recap = segments.recap
    local outro = segments.outro

    local points = {}

    if recap and recap.start_sec and recap.end_sec and recap.end_sec > recap.start_sec then
        table.insert(points, { start_sec = recap.start_sec, end_sec = recap.end_sec, title = "Recap" })
    end

    if intro and intro.start_sec and intro.end_sec and intro.end_sec > intro.start_sec then
        table.insert(points, { start_sec = intro.start_sec, end_sec = intro.end_sec, title = "Intro" })
    end

    if outro and outro.start_sec and outro.end_sec and outro.end_sec > outro.start_sec then
        table.insert(points, { start_sec = outro.start_sec, end_sec = outro.end_sec, title = "Outro" })
    end

    table.sort(points, function(a, b) return a.start_sec < b.start_sec end)
    if #points == 0 then return end

    local native_list = {}

    -- Add Cold Open if first segment starts > 2.0s
    if points[1].start_sec > 2.0 then
        table.insert(native_list, { time = 0.0, title = "Cold Open" })
    end

    for i, pt in ipairs(points) do
        table.insert(native_list, { time = pt.start_sec, title = pt.title })

        local next_start = (i < #points) and points[i + 1].start_sec or duration
        if pt.end_sec > 0 and (next_start - pt.end_sec) > 5.0 then
            local main_title = "Main Episode"
            if i == #points and (duration - pt.end_sec) > 5.0 then
                main_title = "Epilogue"
            end
            table.insert(native_list, { time = pt.end_sec, title = main_title })
        end
    end

    if #native_list > 0 and native_list[1].time > 0 then
        table.insert(native_list, 1, { time = 0.0, title = "Cold Open" })
    end

    -- Clean up near-duplicate timestamps
    local cleaned = {}
    for _, item in ipairs(native_list) do
        if #cleaned == 0 or (item.time - cleaned[#cleaned].time) > 1.0 then
            table.insert(cleaned, item)
        end
    end

    if #cleaned > 0 then
        mp.set_property_native("chapter-list", cleaned)
        mp.msg.info(string.format("IntroDB: synced %d native MPV chapters", #cleaned))
    end
end

-- Name any unnamed embedded chapters in MPV's chapter list
local function update_unnamed_local_chapters(evaluated_chapters)
    local raw_chapters = mp.get_property_native("chapter-list")
    if not raw_chapters or #raw_chapters == 0 then return end

    local updated = false
    local eval_map = {}
    if evaluated_chapters then
        for _, eval in ipairs(evaluated_chapters) do
            eval_map[eval.index] = eval
        end
    end

    for i, ch in ipairs(raw_chapters) do
        local title = ch.title or ""
        if title == "" or title:find("^%s*$") or title:lower():find("unnamed") then
            local eval = eval_map[i]
            local new_title = nil
            if eval and eval.matched_category then
                local cat = eval.matched_category:lower()
                if cat == "opening" or cat == "intro" then new_title = "Intro"
                elseif cat == "ending" or cat == "outro" then new_title = "Outro"
                elseif cat == "recap" then new_title = "Recap"
                elseif cat == "logo" then new_title = "Logo"
                end
            elseif eval and eval.zone == "intro" then
                new_title = "Intro"
            elseif eval and eval.zone == "outro" then
                new_title = "Outro"
            else
                new_title = "Chapter " .. i
            end

            if new_title and new_title ~= ch.title then
                raw_chapters[i].title = new_title
                updated = true
            end
        end
    end

    if updated then
        mp.set_property_native("chapter-list", raw_chapters)
        mp.msg.info("NotifySkip: updated unnamed local chapter titles in MPV")
    end
end

-- Inject IntroDB segments as virtual chapters into skippable_chapters.
-- IntroDB takes priority: if any valid segments exist, local chapters are cleared
-- and replaced exclusively with IntroDB data. Local chapters are only used when
-- IntroDB has no data at all (fetch failed or returned empty).
local function inject_introdb_virtual_chapters()
    local segments = state.chapter_cache.introdb_segments
    if not segments then return end

    local duration = mp.get_property_native("duration") or 0
    local mapping = { intro = "opening", recap = "recap", outro = "ending" }

    -- Pre-check: verify at least one valid segment exists before clearing local chapters
    local has_valid = false
    for api_key, _ in pairs(mapping) do
        local seg = segments[api_key]
        if seg and seg.start_sec and seg.end_sec and seg.end_sec > seg.start_sec then
            has_valid = true
            break
        end
    end

    if not has_valid then
        mp.msg.info("IntroDB: no valid segments found, keeping local chapters")
        return
    end

    -- IntroDB has data — clear local chapters and use IntroDB exclusively
    state.chapter_cache.skippable_chapters = {}
    mp.msg.info("IntroDB: taking priority, local chapters cleared")

    local added = 0
    for api_key, category in pairs(mapping) do
        local seg = segments[api_key]
        if seg and seg.start_sec and seg.end_sec and seg.end_sec > seg.start_sec then
            -- Cap end to duration - 1 to prevent end-of-file loop
            local safe_end = seg.end_sec
            if duration > 0 and safe_end >= duration then
                safe_end = duration - 1
            end
            table.insert(state.chapter_cache.skippable_chapters, {
                index      = "introdb_" .. category,
                time       = seg.start_sec,
                category   = category,
                chapter_end = safe_end,
                is_virtual = true,
                confidence = "high",
            })
            added = added + 1
            mp.msg.info(string.format("IntroDB: injected %s segment (%.1fs -> %.1fs)",
                category, seg.start_sec, safe_end))
        end
    end

    mp.msg.info(string.format("IntroDB: %d segment(s) active", added))

    -- Sync native MPV chapters with IntroDB segments
    sync_native_chapters_from_introdb(segments)
end

-- Fetch IntroDB segments asynchronously via Python subprocess (no CORS restrictions).
local function fetch_introdb_segments(imdb_id, season, episode)
    if not imdb_id or not season or not episode then return end

    local python_code = string.format(
        "import urllib.request,sys\n" ..
        "try:\n" ..
        " r=urllib.request.urlopen('https://api.introdb.app/segments?imdb_id=%s&season=%d&episode=%d',timeout=8)\n" ..
        " sys.stdout.write(r.read().decode('utf-8'))\n" ..
        "except: sys.stdout.write('{}')",
        imdb_id, season, episode
    )

    mp.msg.info(string.format("IntroDB: fetching segments for %s S%dE%d", imdb_id, season, episode))

    mp.command_native_async({
        name = "subprocess",
        args = { python_exe, "-c", python_code },
        capture_stdout = true,
        capture_stderr = false,
        playback_only  = false,
    }, function(success, result, err)
        if not success or not result or not result.stdout or result.stdout == "" then
            mp.msg.warn("IntroDB: fetch failed - " .. (err or "no output"))
            return
        end

        local data = utils.parse_json(result.stdout)
        if not data or type(data) ~= "table" then
            mp.msg.warn("IntroDB: invalid JSON response")
            return
        end

        -- Only store if this response still matches current episode
        if content.get_imdb_id() ~= imdb_id or
           content.get_season() ~= season or
           content.get_episode() ~= episode then
            mp.msg.info("IntroDB: stale response discarded (episode changed)")
            return
        end

        state.chapter_cache.introdb_segments = data
        mp.msg.info(string.format("IntroDB: segments stored (intro=%s, recap=%s, outro=%s)",
            tostring(data.intro ~= nil), tostring(data.recap ~= nil), tostring(data.outro ~= nil)))

        -- Late-arrival injection: if finalize_setup already ran, inject now
        if state.skip_state.mode == "hybrid" then
            inject_introdb_virtual_chapters()
        end
    end)
end

-- Check skippable chapter boundaries and fire/clear skip notifications.
local function check_skippable_chapter_notifications(time)
    if not time or state.skip_state.mode == "none" or state.skip_state.is_seeking then return end
    local chapters = state.chapter_cache.skippable_chapters
    if not chapters then return end

    -- Find if we're inside any skippable chapter range
    local active = nil
    for _, ch in ipairs(chapters) do
        if ch.time and ch.chapter_end and time >= ch.time and time < ch.chapter_end then
            active = ch
            break
        end
    end

    local new_key = active and (active.index or (active.category .. "_" .. tostring(active.time))) or nil
    if new_key == active_skippable_chapter_key then return end  -- no state change

    active_skippable_chapter_key = new_key

    if active then
        local display = virtual_category_names[active.category] or
            active.category:gsub("^%l", string.upper)
        mp.msg.info(string.format("Skippable chapter notification: Skip %s", display))
        -- Pass duration = 0 so the notification stays visible as long as playhead is inside segment
        notification.show_skip_overlay("Skip " .. display, 0, true)
    else
        -- Exited skippable range: hide overlay
        notification.hide_skip_overlay()
    end
end

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
        if config.opts.enable_filter_notifications then
            filter_engine.start_filters() 
        end
        
        -- Still check for chapter entry (for common length chapters at file start)
        skip_executor.check_auto_skip()
        notification.notify_on_chapter_entry()
    elseif has_any_chapters then
        -- Chapters exist but none auto-notify - need filter detection
        mp.msg.info(string.format("Hybrid mode: %d chapters evaluated (none auto-notify, filter detection active)", 
            #state.chapter_cache.evaluated_chapters))
        if config.opts.enable_filter_notifications then
            filter_engine.start_filters() 
        end
    else
        -- No chapters at all - pure filter detection
        mp.msg.info("Hybrid mode: no chapters, pure filter detection")
        if config.opts.enable_filter_notifications then
            filter_engine.start_filters() 
        end
    end

    -- Update any unnamed embedded local chapters with clean names
    update_unnamed_local_chapters(all_evaluated)

    -- Inject IntroDB virtual chapters if segments already arrived (pre-emptive fetch)
    inject_introdb_virtual_chapters()
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
    active_skippable_chapter_key = nil
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
        check_skippable_chapter_notifications(time)
    end
end

local function on_chapter_change()
    if state.skip_state.mode ~= "none" then
        skip_executor.check_auto_skip()
        local current_time = mp.get_property_native("time-pos")
        check_skippable_chapter_notifications(current_time)
    end
end

local function on_seek()
    notification.hide_skip_overlay()
    active_skippable_chapter_key = nil
    notification.start_notification_cooldown()

    -- Set seeking flag to prevent corrupted filter metadata processing
    state.skip_state.is_seeking = true

    -- Clear any pending seek timeout
    if state.skip_state.seek_timeout then
        state.skip_state.seek_timeout:kill()
    end

    -- Re-enable notifications after seek settles
    state.skip_state.seek_timeout = mp.add_timeout(0.5, function()
        state.skip_state.is_seeking = false
        state.skip_state.seek_timeout = nil
        if config.CONSTANTS.DEBUG_MODE then mp.msg.info("Seek stabilization complete") end
        
        -- Check if current time is inside a skippable chapter after seek settles
        local current_time = mp.get_property_native("time-pos")
        check_skippable_chapter_notifications(current_time)
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

-- Allow the web overlay to trigger skip (mouse clicks can't reach mpv directly)
mp.register_script_message("perform-skip", skip_executor.perform_skip)

-- Handler for content metadata from mpv-bridge.js
mp.register_script_message("content-metadata", function(json)
    local data = utils.parse_json(json)
    if not data then return end

    -- Detect episode identity change (imdb_id + season + episode)
    local episode_changed = (
        content.get_imdb_id()  ~= data.imdb_id or
        content.get_season()   ~= data.season  or
        content.get_episode()  ~= data.episode
    )
    local type_changed = content.get_content_type() ~= data.content_type

    -- No-op if nothing changed
    if not episode_changed and not type_changed then return end

    -- Clear stale IntroDB segments when episode changes
    if episode_changed then
        state.chapter_cache.introdb_segments = nil
        active_skippable_chapter_key = nil
    end

    -- Store content metadata
    content.update_metadata(data.content_type, data.imdb_id, data.season, data.episode)

    mp.msg.info(string.format("Content metadata received: type=%s, id=%s, S%sE%s",
        data.content_type or "unknown", data.imdb_id or "unknown",
        tostring(data.season or "?"), tostring(data.episode or "?")))

    -- Fetch IntroDB segments for series (async, no-op on failure)
    if content.is_series() and data.imdb_id and data.season and data.episode then
        fetch_introdb_segments(data.imdb_id, data.season, data.episode)
    end

    -- If finalize_setup already ran but mode is still "none" (waiting for content type),
    -- trigger it now
    if state.skip_state.mode == "none" and content.is_series() and content.is_setup_pending() then
        content.set_setup_pending(false)
        mp.msg.info("Content type now available, running deferred setup")
        finalize_setup()
    end
end)

-- Handler for dynamic config updates (Web UI)
mp.register_script_message("notify-skip-config", function(json)
    local data = utils.parse_json(json)
    if not data then return end
    
    local changed = false
    if data.auto_skip ~= nil and config.opts.auto_skip ~= data.auto_skip then
        config.opts.auto_skip = data.auto_skip
        changed = true
    end
    if data.show_notification ~= nil and config.opts.show_notification ~= data.show_notification then
        config.opts.show_notification = data.show_notification
        changed = true
    end
    
    if changed then
        mp.msg.info("Updated config: auto_skip=" .. tostring(config.opts.auto_skip) .. 
                    ", show_notify=" .. tostring(config.opts.show_notification))
    end
end)

mp.msg.info("Notify Skip v3.2 loaded (modular architecture + IntroDB)")
