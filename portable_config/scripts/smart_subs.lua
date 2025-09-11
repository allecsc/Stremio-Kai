-- Intelligent Subtitle Selector for MPV
-- This script automatically selects the best subtitle track using a priority system.
-- Configuration is handled by an external 'smart_subs.conf' file.

local mp = require 'mp'
local options = require 'mp.options'

-- Define the default settings. These will be used if the .conf file is missing
-- or if an option is not specified.
local config = {
    preferred_langs = "en,eng",
    priority_keywords = "dialogue,full,complete",
    reject_keywords = "signs,songs,commentary"
}
options.read_options(config, "smart_subs")

-- Helper function to parse comma-separated strings into a simple array.
local function parse_list(str)
    local list = {}
    for item in string.gmatch(str, "([^,]+)") do
        table.insert(list, item:match("^%s*(.-)%s*$"):lower()) -- Trim whitespace and make lowercase
    end
    return list
end

-- Main function to select the best subtitle track.
function select_best_subtitle()
    -- Parse the settings from the config into usable tables
    local preferred_langs = parse_list(config.preferred_langs)
    local priority_keywords = parse_list(config.priority_keywords)
    local reject_keywords = parse_list(config.reject_keywords)

    local track_list = mp.get_property_native("track-list")
    if not track_list then return end

    local potential_tracks = {
        priority = {},
        normal = {}
    }

    mp.msg.info("Subtitle Selector: Analyzing tracks with priority logic...")

    -- Step 1: Categorize all available tracks
    for _, track in ipairs(track_list) do
        if track.type == "sub" then
            local lang_match = false
            for _, lang in ipairs(preferred_langs) do
                if track.lang and track.lang:match(lang) then
                    lang_match = true
                    break
                end
            end

            if lang_match then
                local title = track.title and track.title:lower() or ""
                local is_rejected = false
                local is_priority = false

                -- SKIP FORCED TRACKS ENTIRELY - this is the key fix
                if track.forced then
                    mp.msg.info("  - Skipping forced track #" .. track.id .. " ('" .. (track.title or "No Title") .. "')")
                else
                    -- Check if the track title contains any reject keywords
                    for _, keyword in ipairs(reject_keywords) do
                        if title:match(keyword) then
                            is_rejected = true
                            mp.msg.info("  - Rejecting track #" .. track.id .. " ('" .. (track.title or "No Title") .. "') due to keyword: " .. keyword)
                            break
                        end
                    end

                    if not is_rejected then
                        -- Check if the track title contains any priority keywords
                        for _, keyword in ipairs(priority_keywords) do
                            if title:match(keyword) then
                                is_priority = true
                                break
                            end
                        end

                        if is_priority then
                            table.insert(potential_tracks.priority, track)
                        else
                            table.insert(potential_tracks.normal, track)
                        end
                    end
                end
            end
        end
    end

    -- Step 2: Select the best track based on a clear hierarchy
    local best_track_id = nil
    if #potential_tracks.priority > 0 then
        best_track_id = potential_tracks.priority[1].id
        mp.msg.info("Subtitle Selector: Found a PRIORITY track.")
    elseif #potential_tracks.normal > 0 then
        best_track_id = potential_tracks.normal[1].id
        mp.msg.info("Subtitle Selector: No priority track found. Selecting a NORMAL track.")
    end

    -- Step 3: Apply the change
    if best_track_id then
        mp.set_property("sid", best_track_id)
        mp.msg.info("Subtitle Selector: Best track found. Activating subtitle track #" .. best_track_id)
    else
        mp.msg.info("Subtitle Selector: No suitable subtitle track found.")
    end

    -- Defend our subtitle choice from profile interference
    local function defend_subtitle_choice()
        if best_track_id then
            local current_sid = mp.get_property_number("sid")
            if current_sid ~= best_track_id then
                mp.set_property("sid", best_track_id)
                mp.msg.info("Subtitle Selector: Restored track #" .. best_track_id .. " (was overridden)")
            end
        end
    end

    -- Check periodically for the first few seconds
    for i = 1, 5 do
        mp.add_timeout(i * 0.5, defend_subtitle_choice)
    end
end

mp.register_event("file-loaded", select_best_subtitle)