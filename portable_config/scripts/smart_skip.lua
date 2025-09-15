-- smart-skip.lua
-- Unified intro/outro skipping with chapter priority and silence detection fallback
-- Enhanced with custom OSD overlay for skip notifications

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
    -- MODIFIED: Added a new, lenient time limit specifically for the first chapter.
    max_intro_chapter_duration = 300,
    opening_patterns = "^OP$|^OP[0-9]+$|^Opening|Opening$|^Intro|Intro$|^Introduction$|^Theme Song$|^Main Theme$|^Title Sequence$|^Cold Open$|^Teaser$|^Prologue$",
    ending_patterns = "^ED$|^ED[0-9]+$|^Ending|Ending$|^Outro|Outro$|^End Credits$|^Credits$|^Closing|Closing$|^Epilogue$|^End Theme$|^Closing Theme$",
    preview_patterns = "Preview|Next Episode|^Next Time|^Coming Up|^Next Week|^Trailer$"
}

-- State variables
local skip_mode = "none" -- "chapter" or "silence" or "none"
local silence_active = false
local skip_start_time = 0

-- State variables for the custom OSD overlay
local skip_overlay = nil
local skip_overlay_timer = nil


-- Speed constants
local MAX_SPEED = 100
local NORMAL_SPEED = 1

function read_options()
    options.read_options(opts, "smart_skip")
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

function find_skip_chapters()
    local chapters = mp.get_property_native("chapter-list")
    if not chapters or #chapters == 0 then return {} end
    
    local skip_chapters = {}
    local categories = {}
    
    -- Parse enabled categories from the config
    for category in string.gmatch(opts.skip_categories, "([^;]+)") do
        categories[category:lower():gsub("%s+", "")] = true
    end
    
    -- Single loop through ALL chapters
    for i = 1, #chapters do
        local chapter = chapters[i]
        local duration = calculate_chapter_duration(chapters, i)
        local is_skippable = false
        local matched_category = ""

        -- Check if the chapter's duration is within the allowed limits
        local duration_limit = (i == 1) and opts.max_intro_chapter_duration or opts.max_skip_duration
        if duration > 0 and duration <= duration_limit then

            -- Hybrid Logic: First check if the chapter is titled
            if not is_untitled_chapter(chapter.title) then
                -- HIGH CONFIDENCE: Titled chapter. Match against all patterns, regardless of position.
                for category_name, _ in pairs(categories) do
                    if matches_chapter_pattern(chapter.title, category_name) then
                        is_skippable = true
                        matched_category = category_name
                        break -- Match found, no need to check other categories
        end
    end
            else
                -- MEDIUM CONFIDENCE: Untitled chapter. Check position.
                if i <= 2 or i >= #chapters - 1 then
                    -- Heuristic: If it's in the first half, guess "opening". If second half, guess "ending".
                    if i <= math.ceil(#chapters / 2) then
                        if categories["opening"] then
                            is_skippable = true
                            matched_category = "opening"
                        end
                    else
                        if categories["ending"] then
                            is_skippable = true
                            matched_category = "ending"
        end
    end
                end
            end
        end
        
        -- If the chapter was flagged as skippable, add it to the final list
        if is_skippable then
            table.insert(skip_chapters, {
                index = i,
                time = chapter.time,
                title = chapter.title or ("Chapter " .. i),
                category = matched_category,
                duration = duration,
                is_titled = not is_untitled_chapter(chapter.title)
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
            set_time(duration - 1) -- 1 second before end
        end
        mp.osd_message("Skipped to end", 2)
    end
    
    return true
end

-- FINAL: Notification functions using vector drawing for the box.
function hide_skip_overlay()
    if skip_overlay_timer then
        skip_overlay_timer:kill()
        skip_overlay_timer = nil
    end
    if skip_overlay then
        skip_overlay.data = ""
        skip_overlay:update()
    end
end

function show_skip_overlay(message)
    if not opts.show_notification then return end

    hide_skip_overlay()

    if not skip_overlay then
        skip_overlay = mp.create_osd_overlay("ass-events")
    end

    -- This string combines vector drawing for the box and standard text rendering.
    -- It is split into two parts for clarity.
    
    -- Part 1: The Box.
    -- Uses your proven vector drawing method. Anchored bottom-right.
    -- The drawing commands (m, l) are relative to the anchor point.
    -- A 380x63 box is drawn from the anchor point leftwards and upwards.
    local box_drawing = "{\\an3\\1c&FFFFFF&\\alpha&H60&\\4c&H000000&\\shad1\\be6\\bord0\\}{\\p1}m 180 15 l 380 15 l 380 55 l 180 55{\\p0}"

    -- Part 2: The Text.
    -- Also anchored bottom-right. A margin is created by adding a newline `\\N`
    -- and spaces to physically push the text away from the corner.
    local text_drawing = string.format("{\\fnNata Sans\\alpha&H00&\\c&H111111&\\4c&H000000&\\shad1\\be1\\bord0\\fs24\\b900}%s{\\alpha&H80&\\b0\\fs16} (Press Tab)\\N\\N\\N\\N\\N\\N", message)

    -- The two strings are concatenated. The text will appear over the box.
    local ass_string = box_drawing .. text_drawing
    
    skip_overlay.data = ass_string
    skip_overlay:update()

    skip_overlay_timer = mp.add_timeout(opts.notification_duration, function()
        hide_skip_overlay()
    end)
end

-- Main skip function
function perform_skip()
    read_options()
    local current_time = get_time()
    
    if skip_mode == "chapter" then
        hide_skip_overlay() -- Hide notification on explicit skip
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
            show_skip_overlay("Skip " .. category_name)
            return
        end
    end
    
    hide_skip_overlay()
end

-- Event handlers
function on_file_loaded()
    read_options()
    skip_mode = "none"
    hide_skip_overlay()
    
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

-- Cleanup function
function on_shutdown()
    hide_skip_overlay()
end

-- Initialize
read_options()

-- Register events
mp.register_event("file-loaded", on_file_loaded)
mp.register_event("shutdown", on_shutdown)
mp.observe_property("chapter", "number", on_chapter_change)
mp.register_event("seek", on_seek)
mp.add_key_binding('Tab', 'smart-skip', perform_skip)
