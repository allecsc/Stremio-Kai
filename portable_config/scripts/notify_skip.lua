-- notify_skip.lua
-- Simplified intro/outro skipping with chapter priority and silence detection fallback
-- Removed autochapters dependency and streamlined to two-mode system

package.path = package.path .. ';portable_config/scripts/?.lua;'

local mp = require 'mp'
local options = require 'mp.options'

local opts = {
    auto_skip = false,
    skip_categories = "opening;ending;preview;recap",
    blackdetect_notify_args = "d=0.1:pic_th=0.90:pix_th=0.15",
    blackdetect_skip_args = "d=0.5:pic_th=0.80:pix_th=0.20",
    silencedetect_notify_args = "n=-30dB:d=0.5",
    silencedetect_skip_args = "n=-30dB:d=1.0",
    show_notification = true,
    notification_duration = 15,
    skip_window = 1,
    max_skip_duration = 300,
    opening_patterns = "^OP$|^OP[0-9]+$|^Opening|Opening$|^Intro|Intro$|^Introduction$|^Theme Song$|^Main Theme$|^Title Sequence$|^Cold Open$|^Teaser$",
    ending_patterns = "^ED$|^ED[0-9]+$|^Ending|Ending$|^Outro|Outro$|^End Credits$|^Credits$|^Closing|Closing$|^Epilogue$|^End Theme$|^Closing Theme$",
    preview_patterns = "Preview|Next Episode|^Next Time|^Coming Up|^Next Week|^Trailer$",
    recap_patterns = "^Recap$|^Previously|Previously$|^Last Time|Last Time$|^Summary$|^Story So Far$"
}
options.read_options(opts, "notify_skip")

-- State management
local state = {
    mode = "none", -- "chapter" or "silence"
    silence_active = false,
    blackframe_skip_active = false,
    skip_start_time = 0,
    intro_skipped = false,
    
    detection = {
        notification_active = false,
        skipping_active = false
    },

    ui = {
        overlay = nil,
        overlay_timer = nil,
        skip_suppression_timer = nil
    },

    observers = {
        blackdetect_notify = nil,
        silencedetect_notify = nil,
        silencedetect_skip = nil,
        blackdetect_skip = nil
    },

    cache = {
        skippable_chapters = nil
    }
}

-- Constants
local max_speed = 100
local normal_speed = 1
local skip_suppresion_duration = 2
local intro_threshold = 60

-- Utility functions
function set_time(time) mp.set_property_number('time-pos', time) end
function get_time() return mp.get_property_native('time-pos') or 0 end
function set_speed(speed) mp.set_property('speed', speed) end
function set_pause(state) mp.set_property_bool('pause', state) end
function set_mute(state) mp.set_property_bool('mute', state) end

-- Chapter detection functions
function matches_chapter_pattern(title, category)
    local pattern_string = opts[category .. '_patterns']
    if not title or not pattern_string then return false end
    for pattern in string.gmatch(pattern_string, "([^|]+)") do
        if string.match(title, pattern) then return true end
    end
    return false
end

function calculate_chapter_duration(chapters, index)
    if index < #chapters then
        return chapters[index + 1].time - chapters[index].time
    else
        local duration = mp.get_property_native("duration")
        if duration then return duration - chapters[index].time end
    end
    return 0
end

function find_skip_chapters()
    local chapters = mp.get_property_native("chapter-list")
    if not chapters or #chapters == 0 then return {} end

    local titled_skip_chapters = {}
    local positional_skip_chapters = {}
    local categories = {}
    for category in string.gmatch(opts.skip_categories, "([^;]+)") do
        categories[category:lower():gsub("%s+", "")] = true
    end

    for i = 1, #chapters do
        local chapter = chapters[i]
        local duration = calculate_chapter_duration(chapters, i)
        local has_titled_match = false

        -- Check duration limit and start time limit for intros
        if duration > 0 and duration <= opts.max_skip_duration then
            
            -- Check for titled chapters first
            for category_name, _ in pairs(categories) do
                if matches_chapter_pattern(chapter.title, category_name) then
                    table.insert(titled_skip_chapters, {
                        index = i, time = chapter.time, title = chapter.title,
                        category = category_name, duration = duration,
                    })
                    has_titled_match = true
                    break
                end
            end

            -- Check for positional chapters if no title match
            if not has_titled_match then
                if i <= 2 or i >= #chapters - 1 then
                    local positional_category = ""
                    if i <= math.ceil(#chapters / 2) then
                        -- Check start time limit for intro chapters
                        if chapter.time < opts.max_skip_duration then
                            if categories["opening"] then positional_category = "opening" end
                        end
                    else
                        if categories["ending"] then positional_category = "ending" end
                    end

                    if positional_category ~= "" then
                        table.insert(positional_skip_chapters, {
                            index = i, time = chapter.time, title = chapter.title or ("Chapter " .. i),
                            category = positional_category, duration = duration,
                        })
                    end
                end
            end
        end
    end

    -- Prioritize titled chapters over positional ones
    if #titled_skip_chapters > 0 then
        return titled_skip_chapters
    else
        return positional_skip_chapters
    end
end

-- Filter management functions
function init_filter(property, label, name, params)
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
        mp.commandv(property, "add", filter_string)
    end
end

function set_filter_state(property, label, is_enabled)
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

function init_notification_filters()
    init_filter('vf', 'blackdetect_notify', 'lavfi', { graph = 'blackdetect=' .. opts.blackdetect_notify_args })
    mp.msg.info("blackdetect_notify initialized")
    init_filter('af', 'silencedetect_notify', 'lavfi', { graph = 'silencedetect=' .. opts.silencedetect_notify_args })
    mp.msg.info("silencedetect_notify initialized")

end

function init_skipping_filters()
    init_filter('af', 'silencedetect_skip', 'lavfi', { graph = 'silencedetect=' .. opts.silencedetect_skip_args })
    mp.msg.info("silencedetect_skip initialized")
    init_filter('vf', 'blackdetect_skip', 'lavfi', { graph = 'blackdetect=' .. opts.blackdetect_skip_args })
    mp.msg.info("blackdetect_skip initialized")

end

-- Notification detection functions
function notification_trigger(name, value, source)
    if not state.detection.notification_active or not value or value == '{}' then return end
    if not string.match(value, 'lavfi%.black_start') and not string.match(value, 'lavfi%.silence_start') then return end

    -- NEW: Check if suppression is active OR intro already skipped
    if state.ui.skip_suppression_timer or state.intro_skipped then return end

    local current_time = get_time()
    local duration = mp.get_property_native("duration") or 0
    local message = ""

    -- Determine message based on time window
    if current_time <= opts.max_skip_duration then
        message = "Skip Opening"
    elseif duration > 0 and current_time >= (duration - opts.max_skip_duration) then
        message = "Skip Ending"
    end

    if message ~= "" then
        mp.msg.info("Notification trigger from '" .. source .. "' at " .. current_time .. "s")
        show_skip_overlay(message, nil, true)
        start_skip_suppression() -- Activate suppression after notification
    end
end

-- Skip detection functions for silence mode
function skip_detection_trigger(name, value, source)
    if not state.detection.skipping_active or not value or value == '{}' then return end
    
    local skip_time = nil

    if source == "blackframe" and string.match(value, 'lavfi%.black_start') then
        mp.msg.info("DEBUG blackdetect: " .. (value or "nil"))
        skip_time = tonumber(string.match(value, 'pts_time:(%d+%.?%d+)'))
    elseif source == "silence" then
        skip_time = tonumber(string.match(value, '%d+%.?%d+'))
    end
    
    if skip_time and skip_time > get_time() + 1 then
        mp.msg.info("Skip exit detected by " .. source .. " at " .. skip_time .. "s")
        
        -- NEW: Store the detected end time for duration calculation
        state.detected_skip_end = skip_time
        
        stop_silence_skip()
        set_time(skip_time)
    end
end

function start_silence_skip()
    if state.silence_active then return end
    
    state.skip_start_time = get_time()
    state.silence_active = true
    state.blackframe_skip_active = true
    state.detection.skipping_active = true
    
    -- Activate skip detection filters
    set_filter_state('af', 'silencedetect_skip', true)
    set_filter_state('vf', 'blackdetect_skip', true)
    
    -- Set up observers for skip detection
    state.observers.silencedetect_skip = function(n, v) skip_detection_trigger(n, v, "silence") end
    state.observers.blackdetect_skip = function(n, v) skip_detection_trigger(n, v, "blackframe") end
    
    mp.observe_property('af-metadata/silencedetect_skip', 'string', state.observers.silencedetect_skip)
    mp.observe_property('vf-metadata/blackdetect_skip', 'string', state.observers.blackdetect_skip)
    
    set_pause(false)
    set_mute(true)
    set_speed(max_speed)
    show_skip_overlay("▶▶ Fast Forward", 0, false)
    
    mp.msg.info("Silence skip started with dual detection")
end

function stop_silence_skip()
    if not state.silence_active and not state.blackframe_skip_active then return end
    
    -- NEW: Check if this was a substantial intro skip
    -- Use detected end time if available, otherwise fall back to current time
    local end_time = state.detected_skip_end or get_time()
    local skip_duration = end_time - state.skip_start_time
    
    mp.msg.info("DEBUG: skip_duration=" .. skip_duration .. "s, skip_start_time=" .. state.skip_start_time .. "s, max_skip_duration=" .. opts.max_skip_duration .. "s")
    mp.msg.info("DEBUG: skip_duration=" .. skip_duration .. "s, skip_start_time=" .. state.skip_start_time .. "s, end_time=" .. end_time .. "s")
    
    if skip_duration > intro_threshold and state.skip_start_time <= opts.max_skip_duration then
        state.intro_skipped = true
        mp.msg.info("Substantial intro skip detected (" .. skip_duration .. "s), blocking future intro notifications")
    end
    
    state.silence_active = false
    state.blackframe_skip_active = false
    state.detection.skipping_active = false
    
    -- Deactivate skip detection filters
    set_filter_state('af', 'silencedetect_skip', false)
    set_filter_state('vf', 'blackdetect_skip', false)
    
    -- Remove observers
    if state.observers.silencedetect_skip then
        mp.unobserve_property(state.observers.silencedetect_skip)
        state.observers.silencedetect_skip = nil
    end
    if state.observers.blackdetect_skip then
        mp.unobserve_property(state.observers.blackdetect_skip)
        state.observers.blackdetect_skip = nil
    end
    
    set_mute(false)
    set_speed(normal_speed)
    hide_skip_overlay()
    
    mp.msg.info("Silence skip stopped")
end

-- Notification filter management
function start_notification_filters()
    if state.detection.notification_active then return end
    state.detection.notification_active = true
    
    set_filter_state('vf', 'blackdetect_notify', true)
    set_filter_state('af', 'silencedetect_notify', true)

    state.observers.blackdetect_notify = function(n, v) notification_trigger(n, v, "blackdetect") end
    state.observers.silencedetect_notify = function(n, v) notification_trigger(n, v, "silencedetect") end
    
    mp.observe_property('vf-metadata/blackdetect_notify', 'string', state.observers.blackdetect_notify)
    mp.observe_property('af-metadata/silencedetect_notify', 'string', state.observers.silencedetect_notify)
    
    mp.msg.info("Notification detection filters started")
end

function stop_notification_filters()
    if not state.detection.notification_active then return end
    state.detection.notification_active = false
    
    set_filter_state('vf', 'blackdetect_notify', false)
    set_filter_state('af', 'silencedetect_notify', false)

    if state.observers.blackdetect_notify then
        mp.unobserve_property(state.observers.blackdetect_notify)
        state.observers.blackdetect_notify = nil
    end
    if state.observers.silencedetect_notify then
        mp.unobserve_property(state.observers.silencedetect_notify)
        state.observers.silencedetect_notify = nil
    end

    mp.msg.info("Notification detection filters stopped")
end

function update_notification_filters_state()
    local should_be_active = false
    local current_time = get_time()
    local duration = mp.get_property_native("duration") or 0
    
    -- Simplified check for time windows
    local in_intro_window = (current_time <= opts.max_skip_duration)
    local in_outro_window = (duration > 0 and current_time >= (duration - opts.max_skip_duration))
    
    if in_intro_window or in_outro_window then
        should_be_active = true
    end
    
    -- Apply the decision
    if should_be_active and not state.detection.notification_active then
        start_notification_filters()
    elseif not should_be_active and state.detection.notification_active then
        stop_notification_filters()
    end
end

-- Chapter skipping functions
function skip_to_chapter_end(chapter_index)
    local chapters = mp.get_property_native("chapter-list")
    if not chapters then return false end
    
    if chapter_index < #chapters then
        set_time(chapters[chapter_index + 1].time)
    else
        local duration = mp.get_property_native("duration")
        if duration then
            -- Prevent looping by stopping slightly before the end
            set_time(duration - 1)
        end
    end
    return true
end

-- UI/Notification functions
function hide_skip_overlay()
    if state.ui.overlay_timer then 
        state.ui.overlay_timer:kill() 
        state.ui.overlay_timer = nil 
    end
    if state.ui.overlay then 
        state.ui.overlay.data = "" 
        state.ui.overlay:update() 
    end
end

function show_skip_overlay(message, duration, is_prompt)
    if not opts.show_notification then return end
    hide_skip_overlay()
    if not state.ui.overlay then state.ui.overlay = mp.create_osd_overlay("ass-events") end
    
    is_prompt = is_prompt or false
    local display_duration = duration or opts.notification_duration

    local pos_overrides = "{\\an3\\marl0\\marr0\\marv0}"
    local box = pos_overrides .. "{\\1c&FFFFFF&\\alpha&H60&\\4c&H000000&\\shad1\\be6\\bord0\\}{\\p1}m 180 15 l 380 15 l 380 55 l 180 55{\\p0}"
    
    local text_format
    if is_prompt then
        text_format = pos_overrides .. "{\\fnNata Sans\\alpha&H00&\\c&H111111&\\4c&H000000&\\shad1\\be1\\bord0\\fs24\\b900}%s{\\alpha&H80&\\b0\\fs16} (Press Tab)\\N\\N\\N\\N\\N\\N"
    else
        text_format = pos_overrides .. "{\\fnNata Sans\\alpha&H00&\\c&H111111&\\4c&H000000&\\shad1\\be1\\bord0\\fs24\\b900}%s\\N\\N\\N\\N"
    end
    
    local text = string.format(text_format, message)
    state.ui.overlay.data = box .. text
    state.ui.overlay:update()

    if display_duration > 0 then
        state.ui.overlay_timer = mp.add_timeout(display_duration, hide_skip_overlay)
    end
end

function start_skip_suppression()
    if state.ui.skip_suppression_timer then
        state.ui.skip_suppression_timer:kill()
    end
    state.ui.skip_suppression_timer = mp.add_timeout(skip_suppresion_duration, function()
        state.ui.skip_suppression_timer = nil
    end)
end

-- Chapter entry notification
function notify_on_chapter_entry()
    if not opts.show_notification or state.mode ~= "chapter" then return end
    if state.ui.skip_suppression_timer then return end

    local current_chapter_idx = mp.get_property_native("chapter")
    local skip_chapters = state.cache.skippable_chapters or {}
    
    for _, chapter in ipairs(skip_chapters) do
        if current_chapter_idx ~= nil and chapter.index == current_chapter_idx + 1 then
            local category_display = chapter.category:gsub("^%l", string.upper)
            local message = "Skip " .. category_display
            
            show_skip_overlay(message, nil, true)
            start_skip_suppression()
            return
        end
    end
end

-- Main skip function
function perform_skip()
    start_skip_suppression() -- Start suppression immediately on key press
    hide_skip_overlay()
    
    local current_time = get_time()
    local duration = mp.get_property_native("duration") or 0
    
    if state.mode == "chapter" then
        local skip_chapters = state.cache.skippable_chapters or {}
        local current_chapter_idx = mp.get_property_native("chapter")
        
        -- Try to skip current chapter
        if current_chapter_idx ~= nil then
            for _, chapter in ipairs(skip_chapters) do
                if chapter.index == current_chapter_idx + 1 then
                    -- NEW: Check if this is an opening-category chapter
                    if matches_chapter_pattern(chapter.title, "opening") then
                        state.intro_skipped = true
                        mp.msg.info("Intro chapter skipped, blocking future intro notifications")
                    end
                    return skip_to_chapter_end(chapter.index)
                end
            end
        end
        
        -- Try to skip approaching chapter  
        for _, chapter in ipairs(skip_chapters) do
            if chapter.time > current_time and chapter.time <= current_time + opts.skip_window then
                -- NEW: Check if this is an opening-category chapter
                if matches_chapter_pattern(chapter.title, "opening") then
                    state.intro_skipped = true
                    mp.msg.info("Intro chapter skipped, blocking future intro notifications")
                end
                set_time(chapter.time)
                return skip_to_chapter_end(chapter.index)
            end
        end
        
        show_skip_overlay("✖ Nothing to skip", 2, false)
        return false
        
    elseif state.mode == "silence" then
        local in_intro = current_time <= opts.max_skip_duration and not state.intro_skipped  -- NEW: Add intro_skipped check
        local in_ending = duration > 0 and current_time >= duration - opts.max_skip_duration

        if not in_intro and not in_ending then
            show_skip_overlay("✖ Nothing to skip", 2, false)
            return false
        end
        
        if state.silence_active or state.blackframe_skip_active then
            stop_silence_skip()
            set_time(state.skip_start_time)
            show_skip_overlay("✓ Skip Cancelled", 2, false)
        else
        start_silence_skip()
        end
        return true
    end

    show_skip_overlay("✖ Nothing to skip", 2, false)
    return false
end

-- Chapter-based notification check
function check_chapter_notifications()
    if not opts.show_notification or state.mode ~= "chapter" then return end
    if state.ui.skip_suppression_timer or state.intro_skipped then return end  -- NEW: Add intro_skipped check

    local current_time = get_time()
    local skip_chapters = state.cache.skippable_chapters or {}
    
    for _, chapter in ipairs(skip_chapters) do
        local approaching = (chapter.time > current_time and chapter.time <= current_time + opts.skip_window)
        
        if approaching then
            local category_display = chapter.category:gsub("^%l", string.upper)
            local message = "Skip " .. category_display
            
            show_skip_overlay(message, nil, true)
            start_skip_suppression() -- Activate suppression after notification
            return
        end
    end
end

-- Main update function
function update_notifications_and_state()
    update_notification_filters_state()
    check_chapter_notifications()
end

-- Setup functions
function finalize_setup()    
    local has_any_chapters = #mp.get_property_native("chapter-list", {}) > 0
    if not has_any_chapters then
        state.mode = "silence"
        -- Initialize both notification and skipping filters for silence mode
        init_notification_filters()
        init_skipping_filters()
        mp.msg.info("No chapters found. Activating silence/black-frame fallback mode.")
        return
    end
    
    state.cache.skippable_chapters = find_skip_chapters()
    if #state.cache.skippable_chapters > 0 then
        state.mode = "chapter"
        -- Initialize only notification filters for chapter mode
        init_notification_filters()
        mp.msg.info("Found " .. #state.cache.skippable_chapters .. " skippable chapters. Chapter-based skipping enabled.")
    else
        state.mode = "silence"
        -- Initialize both notification and skipping filters since we're falling back to silence mode
        init_notification_filters()
        init_skipping_filters()
        mp.msg.info("Chapters found, but none are skippable. Falling back to silence mode.")
    end
end

function on_file_loaded()
    reset_script_state()
    -- Delay setup to ensure other scripts (like profile managers) run first
    mp.add_timeout(3.5, finalize_setup)
end

function reset_script_state()
    hide_skip_overlay()
    stop_notification_filters()
    if state.silence_active or state.blackframe_skip_active then 
        stop_silence_skip() 
    end
    
    if state.ui.skip_suppression_timer then
        state.ui.skip_suppression_timer:kill()
        state.ui.skip_suppression_timer = nil
    end
    
    state.mode = "none"
    state.silence_active = false
    state.blackframe_skip_active = false
    state.skip_start_time = 0
    state.intro_skipped = false
    state.detection.notification_active = false
    state.detection.skipping_active = false
    state.detection.intro_notified = false
    state.detection.outro_notified = false
    state.cache.skippable_chapters = nil
end

-- Event handlers
function on_time_change()
    if state.mode ~= "none" then
        update_notifications_and_state()
    end
end

function on_chapter_change()
    if state.mode ~= "none" then
        notify_on_chapter_entry()
    end
end

function on_seek()
    hide_skip_overlay()
    start_skip_suppression() -- Activate suppression on any seek

    -- NEW: Reset intro_skipped if seeking back before any substantial skip point
    if state.intro_skipped and get_time() < intro_threshold then  -- or use state.skip_start_time if available
        state.intro_skipped = false
        mp.msg.info("Seeked back to beginning, re-enabling intro skip")
    end
end

function on_shutdown()
    hide_skip_overlay()
    stop_notification_filters()
    if state.silence_active or state.blackframe_skip_active then 
        stop_silence_skip() 
    end
end

-- Register events and key bindings
mp.register_event("file-loaded", on_file_loaded)
mp.register_event("shutdown", on_shutdown)
mp.observe_property("time-pos", "number", on_time_change)
mp.observe_property("chapter", "number", on_chapter_change)
mp.register_event("seek", on_seek)
mp.add_key_binding('Tab', 'perform_skip', perform_skip)