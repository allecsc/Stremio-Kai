-- smart-skip.lua
-- Unified intro/outro skipping with chapter priority and silence detection fallback

local mp = require 'mp'
local options = require 'mp.options'

-- MODIFIED: Patterns are now part of the opts table to be configurable.
-- The hardcoded defaults here are the "safe" patterns.
local opts = {
    auto_skip = false,
    skip_categories = "opening;ending;preview",
    quietness = -30,
    silence_duration = 0.5,
    show_notification = true,
    notification_duration = 15,
    skip_window = 3,
    max_skip_duration = 200,
    opening_patterns = "^OP$|^OP[0-9]+$|^Opening|Opening$|^Intro|Intro$|^Introduction$|^Theme Song$|^Main Theme$|^Title Sequence$|^Cold Open$|^Teaser$|^Prologue$",
    ending_patterns = "^ED$|^ED[0-9]+$|^Ending|Ending$|^Outro|Outro$|^End Credits$|^Credits$|^Closing|Closing$|^Epilogue$|^End Theme$|^Closing Theme$",
    preview_patterns = "Preview|Next Episode|^Next Time|^Coming Up|^Next Week|^Trailer$"
}

-- State variables
local skip_mode = "none" -- "chapter" or "silence" or "none"
local current_notification = nil
local silence_active = false
local skip_start_time = 0

-- Speed constants
local MAX_SPEED = 100
local NORMAL_SPEED = 1

function read_options()
    options.read_options(opts, "smart-skip")
end

-- Utility functions
function set_time(time)
    mp.set_property_number('time-pos', time)
end

function get_time()
    return mp.get_property_native('time-pos') or 0
end

function set_speed(speed)
    mp.set_property('speed', speed)
end

function set_pause(state)
    mp.set_property_bool('pause', state)
end

function set_mute(state)
    mp.set_property_bool('mute', state)
end

-- Chapter detection functions
function matches_chapter_pattern(title, category)
    -- MODIFIED: Get the pattern string dynamically from the opts table.
    local pattern_string = opts[category .. '_patterns']
    if not title or not pattern_string then return false end
    
    for pattern in string.gmatch(pattern_string, "([^|]+)") do
        if string.match(title, pattern) then
            return true
        end
    end
    return false
end

function calculate_chapter_duration(chapters, index)
    if index < #chapters then
        return chapters[index + 1].time - chapters[index].time
    else
        local duration = mp.get_property_native("duration")
        if duration then
            return duration - chapters[index].time
        end
    end
    return 0
end

function is_untitled_chapter(title)
    if not title or title == "" then return true end
    if string.match(title, "^Chapter %d+$") then return true end
    if string.match(title, "^%d+$") then return true end
    return false
end

-- Position-first approach: check position, then use titles for confidence
function find_skip_chapters()
    local chapters = mp.get_property_native("chapter-list")
    if not chapters or #chapters == 0 then return {} end
    
    local skip_chapters = {}
    local categories = {}
    
    -- Parse enabled categories
    for category in string.gmatch(opts.skip_categories, "([^;]+)") do
        categories[category:lower():gsub("%s+", "")] = true
    end
    
    -- Position-based candidates
    local candidates = {}
    
    -- First 2 chapters as potential openings
    for i = 1, math.min(2, #chapters) do
        local duration = calculate_chapter_duration(chapters, i)
        if duration > 0 and duration <= opts.max_skip_duration then
            table.insert(candidates, {
                index = i,
                time = chapters[i].time,
                title = chapters[i].title,
                duration = duration,
                potential_category = "opening"
            })
        end
    end
    
    -- Last 2 chapters as potential endings (avoid overlap with first 2)
    local start_idx = math.max(#chapters - 1, 3)
    for i = start_idx, #chapters do
        local duration = calculate_chapter_duration(chapters, i)
        if duration > 0 and duration <= opts.max_skip_duration then
            table.insert(candidates, {
                index = i,
                time = chapters[i].time,
                title = chapters[i].title,
                duration = duration,
                potential_category = "ending"
            })
        end
    end
    
    -- Evaluate candidates based on title confidence
    for _, candidate in ipairs(candidates) do
        local should_skip = false
        local final_category = candidate.potential_category
        local is_titled = false
        
        -- High confidence: titled chapters matching our patterns
        if candidate.title and candidate.title ~= "" then
            for category, _ in pairs(categories) do
                if matches_chapter_pattern(candidate.title, category) then
                    should_skip = true
                    final_category = category
                    is_titled = true
                    break
                end
            end
        end
        
        -- Medium confidence: untitled chapters in correct positions
        if not should_skip and is_untitled_chapter(candidate.title) then
            should_skip = true
            is_titled = false
        end
        
        -- Add to skip list if qualified
        if should_skip then
            table.insert(skip_chapters, {
                index = candidate.index,
                time = candidate.time,
                title = candidate.title or ("Chapter " .. candidate.index),
                category = final_category,
                duration = candidate.duration,
                is_titled = is_titled
            })
        end
    end
    
    return skip_chapters
end

-- Silence detection functions
function init_audio_filter()
    local af_table = mp.get_property_native('af') or {}
    af_table[#af_table + 1] = {
        enabled = false,
        label = 'silencedetect',
        name = 'lavfi',
        params = { graph = 'silencedetect=noise=' .. opts.quietness .. 'dB:d=' .. opts.silence_duration }
    }
    mp.set_property_native('af', af_table)
end

function set_audio_filter(state)
    local af_table = mp.get_property_native('af') or {}
    for i = #af_table, 1, -1 do
        if af_table[i].label == 'silencedetect' then
            af_table[i].enabled = state
            mp.set_property_native('af', af_table)
            break
        end
    end
end

function silence_trigger(name, value)
    if not silence_active or not value or value == '{}' then return end
    
    local skip_time = tonumber(string.match(value, '%d+%.?%d+'))
    local curr_time = get_time()
    
    if skip_time and skip_time > curr_time + 1 then
        stop_silence_skip()
        set_time(skip_time)
        mp.osd_message("Skipped to silence end", 2)
    end
end

function start_silence_skip()
    skip_start_time = get_time()
    silence_active = true
    set_audio_filter(true)
    mp.observe_property('af-metadata/silencedetect', 'string', silence_trigger)
    set_pause(false)
    set_mute(true)
    set_speed(MAX_SPEED)
    mp.osd_message("Fast-forwarding to silence...", 1)
end

function stop_silence_skip()
    silence_active = false
    set_audio_filter(false)
    mp.unobserve_property(silence_trigger)
    set_mute(false)
    set_speed(NORMAL_SPEED)
end

-- Chapter skipping functions
function skip_to_chapter_end(chapter_index)
    local chapters = mp.get_property_native("chapter-list")
    if not chapters then return false end
    
    -- Find next chapter or end of file
    if chapter_index < #chapters then
        set_time(chapters[chapter_index + 1].time)
        mp.osd_message("Skipped " .. chapters[chapter_index].title, 2)
    else
        -- Last chapter, skip to end
        local duration = mp.get_property_native("duration")
        if duration then
            set_time(duration - 1) -- 5 seconds before end
        end
        mp.osd_message("Skipped to end", 2)
    end
    
    return true
end

-- Notification functions
function show_skip_notification(message)
    if not opts.show_notification then return end
    
    if current_notification then
        mp.cancel_timer(current_notification)
    end
    
    mp.osd_message(message .. " (Press Tab to skip)", opts.notification_duration)
    
    current_notification = mp.add_timeout(opts.notification_duration, function()
        current_notification = nil
    end)
end

function hide_notification()
    if current_notification then
        mp.cancel_timer(current_notification)
        current_notification = nil
        mp.osd_message("", 0)
    end
end

-- Main skip function
function perform_skip()
    read_options()
    local current_time = get_time()
    
    if skip_mode == "chapter" then
        local skip_chapters = find_skip_chapters()
        local current_chapter = mp.get_property_native("chapter")
        
        -- Check if currently in a skippable chapter
        if current_chapter ~= nil then
            for _, chapter in ipairs(skip_chapters) do
                if chapter.index == current_chapter + 1 then
                    return skip_to_chapter_end(chapter.index)
                end
            end
        end
        
        -- Check if a skippable chapter is coming up within the skip window
        for _, chapter in ipairs(skip_chapters) do
            if chapter.time > current_time and 
               chapter.time <= current_time + opts.skip_window then
                set_time(chapter.time)
                return skip_to_chapter_end(chapter.index)
            end
        end
        
        mp.osd_message("No skippable content here", 1)
        return false
        
    elseif skip_mode == "silence" then
        if silence_active then
            stop_silence_skip()
            set_time(skip_start_time)
            mp.osd_message("Skip cancelled", 1)
        else
            start_silence_skip()
        end
        return true
    end
    
    mp.osd_message("Nothing to skip", 1)
    return false
end

-- Check if we should show notification
function check_notification()
    if not opts.show_notification or skip_mode ~= "chapter" then return end
    
    local current_time = get_time()
    local current_chapter = mp.get_property_native("chapter")
    local skip_chapters = find_skip_chapters()
    
    -- Check if in skippable chapter or approaching one
    for _, chapter in ipairs(skip_chapters) do
        if (current_chapter ~= nil and chapter.index == current_chapter + 1) or
           (chapter.time > current_time and chapter.time <= current_time + opts.skip_window) then
            local category_name = chapter.category:gsub("^%l", string.upper)
            show_skip_notification("Skip " .. category_name)
            return
        end
    end
    
    hide_notification()
end

-- Event handlers
function on_file_loaded()
    read_options()
    skip_mode = "none"
    hide_notification()
    
    if silence_active then
        stop_silence_skip()
    end
    
    local skip_chapters = find_skip_chapters()
    if #skip_chapters > 0 then
        skip_mode = "chapter"
        mp.msg.info("Chapter-based skipping enabled. Found " .. #skip_chapters .. " skip chapters.")
    else
        skip_mode = "silence"
        init_audio_filter()
        mp.msg.info("Silence-based skipping enabled.")
    end
end

function on_chapter_change(_, current_chapter)
    read_options()
    check_notification()
    
    -- Auto-skip only for titled chapters (safety)
    if opts.auto_skip and skip_mode == "chapter" and current_chapter ~= nil then
        local skip_chapters = find_skip_chapters()
        for _, chapter in ipairs(skip_chapters) do
            if chapter.index == current_chapter + 1 and chapter.is_titled then
                mp.add_timeout(0.5, function()
                    skip_to_chapter_end(chapter.index)
                end)
                break
            end
        end
    end
end

function on_seek()
    check_notification()
end

-- Initialize
read_options()

-- Register events
mp.register_event("file-loaded", on_file_loaded)
mp.observe_property("chapter", "number", on_chapter_change)
mp.register_event("seek", on_seek)
mp.add_key_binding('Tab', 'smart-skip', perform_skip)