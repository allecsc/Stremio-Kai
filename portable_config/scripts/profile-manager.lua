-- profile-manager.lua
-- Version: 3.0 (Tiered Heuristic Logic)
-- This script automatically applies mpv profiles based on a multi-tiered analysis
-- of the media's metadata.

local opts = {
    -- Tier 2: General Episodic Check
    -- Any media with one of these languages AND a duration shorter than the threshold will be considered anime.
    asian_languages = {
        ja = true, jpn = true, jap = true, jp = true, -- Japanese
        zh = true, zho = true, chi = true, cmn = true, yue = true, -- Chinese
        ko = true, kor = true -- Korean
    },
    -- Duration threshold in seconds. Default is 2400 (40 minutes).
    duration_threshold_seconds = 2400,

    -- Tier 1: High-Confidence "Fingerprint" Check
    -- Keywords to look for in chapter titles (case-insensitive).
    anime_chapter_keywords = { "part a", "part b", "preview" },
    -- Keywords to look for in subtitle track titles (case-insensitive).
    -- Per your request, this checks for "signs" or "songs" separately.
    anime_sub_track_keywords = { "signs", "songs" }
}

-- SCRIPT-INTERNAL, DO NOT EDIT BELOW THIS LINE
local function log(str)
    mp.msg.info("[profile-manager] " .. str)
end

local profile_applied_for_this_file = false
local detection_reason = "None"

function select_and_apply_profile()
    if profile_applied_for_this_file then return end

    -- 1. Gather all necessary data from mpv
    local track_list = mp.get_property_native('track-list')
    local video_params = mp.get_property_native('video-params')
    local duration = mp.get_property_native('duration')
    local chapter_list = mp.get_property_native('chapter-list')
    local attachments = mp.get_property_native('attachments')

    -- 2. Data Validation: Abort if critical data is not yet available.
    if not track_list or #track_list == 0 or not video_params or not video_params.h or not duration then
        return
    end

    log("--- Starting Profile Evaluation (All data available) ---")
    local is_anime = false

    -- 3. The Decision Logic (Tiered Approach)

    -- TIER 1: High-Confidence "Fingerprint" Check
    -- If any of these are true, we can be very confident it's anime, regardless of duration.
    local tier1_triggers = {}

    -- Check 1.1: Anime-style chapter names
    if chapter_list and #chapter_list > 0 then
        for _, chapter in ipairs(chapter_list) do
            if chapter.title then
                local lower_title = chapter.title:lower()
                for _, keyword in ipairs(opts.anime_chapter_keywords) do
                    if lower_title:find(keyword, 1, true) then
                        is_anime = true
                        table.insert(tier1_triggers, "Chapter Title ('" .. chapter.title .. "')")
                        goto tier1_end -- exit the loop once found
                    end
                end
            end
        end
        ::tier1_end::
    end

    -- Check 1.2: Specific subtitle track names, format (ASS), or font attachments
    if not is_anime then
        local has_font_attachment = false
        if attachments and #attachments > 0 then
            for _, att in ipairs(attachments) do
                if att.mime_type and att.mime_type:find("font") then
                    has_font_attachment = true
                    is_anime = true
                    table.insert(tier1_triggers, "Embedded Fonts")
                    break
                end
            end
        end

        for _, track in ipairs(track_list) do
            if track.type == 'sub' then
                -- Check for ASS format
                if track.codec == 'ass' then
                    is_anime = true
                    table.insert(tier1_triggers, "ASS Subtitle Format")
                end
                -- Check for specific keywords in subtitle track title
                if track.title then
                    local lower_title = track.title:lower()
                    for _, keyword in ipairs(opts.anime_sub_track_keywords) do
                        if lower_title:find(keyword, 1, true) then
                            is_anime = true
                            table.insert(tier1_triggers, "Subtitle Title ('" .. track.title .. "')")
                        end
                    end
                end
            end
        end
    end

    if is_anime then
        detection_reason = "Tier 1 (" .. table.concat(unique(tier1_triggers), ", ") .. ")"
    end


    -- TIER 2: General Episodic Check (Fallback)
    -- This runs only if Tier 1 did not identify the content as anime.
    if not is_anime then
        local has_asian_audio = false
        for _, track in ipairs(track_list) do
            if track.type == 'audio' and opts.asian_languages[track.lang] then
                has_asian_audio = true
                break
            end
        end

        local is_short_duration = (duration < opts.duration_threshold_seconds)

        if has_asian_audio and is_short_duration then
            is_anime = true
            detection_reason = "Tier 2 (Asian Audio + Short Duration)"
        end
    end

    -- 4. Profile Selection
    local final_profile = nil
    local height = video_params.h
    local primaries = video_params.primaries or "unknown"
    local gamma = video_params.gamma or "unknown"
    local dv_profile = video_params['dv-profile']
    local is_interlaced = video_params.interlaced or false
    local is_hdr = (primaries == "bt.2020" or gamma == "smpte2084" or gamma == "arib-std-b67" or dv_profile ~= nil)

    if is_anime then
        if is_hdr then
            final_profile = "anime-hdr"
        elseif height <= 576 or is_interlaced then
            final_profile = "anime-old"
        else -- Standard SDR
            final_profile = "anime-sdr"
        end
    else
        detection_reason = "Default (No Anime Detected)"
        if is_hdr then
            final_profile = "hdr"
        else
            final_profile = "sdr"
        end
    end

    -- 5. Apply the chosen profile
    if final_profile then
        log("--- FINAL DECISION ---")
        log("Reason: " .. detection_reason)
        log("Applying profile '" .. final_profile .. "'")
        mp.commandv("apply-profile", final_profile)
    else
        log("--- No profile matched. Using defaults. ---")
    end
    profile_applied_for_this_file = true
end

-- Helper function to get unique values from a table
function unique(tbl)
    local set = {}
    local res = {}
    for _, v in ipairs(tbl) do
        if not set[v] then
            res[#res + 1] = v
            set[v] = true
        end
    end
    return res
end

-- Observe all properties that might be loaded asynchronously.
-- The main function will handle waiting for all of them to be ready.
mp.observe_property('track-list', 'native', select_and_apply_profile)
mp.observe_property('video-params', 'native', select_and_apply_profile)
mp.observe_property('duration', 'native', select_and_apply_profile)
mp.observe_property('chapter-list', 'native', select_and_apply_profile)
mp.observe_property('attachments', 'native', select_and_apply_profile)


-- Reset the flag when a new file is loaded.
mp.register_event('start-file', function()
    mp.commandv("af", "clr", "") -- Clear all audio filters from the previous file
    mp.commandv("vf", "clr", "") -- Clear all video filters from the previous file

    profile_applied_for_this_file = false
    detection_reason = "None"
    log("New file loaded. AF & VF chains cleared & Profile manager reset.")
end)