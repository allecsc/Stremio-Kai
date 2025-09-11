-- profile-manager.lua
-- Final version: Waits for both track-list and video-params to be fully available.

local function log(str)
    mp.msg.info("[profile-manager] " .. str)
end

local profile_applied_for_this_file = false

function select_and_apply_profile()
        -- Guard clause: Only run this logic once per loaded file.
    if profile_applied_for_this_file then return end

    -- 1. Gather all necessary data from mpv
    local track_list = mp.get_property_native('track-list')
    local video_params = mp.get_property_native('video-params')

    -- 2. Comprehensive Data Validation
    -- Abort if either property, or the necessary sub-properties, are missing.
    -- This is the key check that waits for all data.
-- UPDATED: Stricter data validation.
    -- It now requires the 'primaries' field to exist before proceeding.
    -- This forces the script to wait for the full color metadata to be parsed.
    if not track_list or #track_list == 0 or not video_params or not video_params.h or not video_params.primaries then
        return
    end
    
    log("--- Starting Profile Evaluation (All data is now available) ---")

    local height = video_params.h
    -- Handle cases where color info might still be nil, defaulting to non-HDR values.
    local primaries = video_params.primaries or "unknown"
    local gamma = video_params.gamma or "unknown"
    local dv_profile = video_params['dv-profile']
    -- NEW: Get the interlaced flag
    local is_interlaced = video_params.interlaced or false

    log("Video Height: " .. tostring(height))
    log("Color Primaries: " .. tostring(primaries))
    log("Gamma/TRC: " .. tostring(gamma))
    log("Dolby Vision Profile: " .. tostring(dv_profile))
    -- NEW: Log the interlaced status
    log("Interlaced: " .. tostring(is_interlaced))

    -- 3. Determine if Asian language audio exists
    local is_asian_lang = false
    local asian_langs = {
        ja = true, jpn = true, jap = true, jp = true, -- Japanese
        zh = true, zho = true, chi = true, cmn = true, yue = true, -- Chinese
        ko = true, kor = true -- Korean
    }
    for _, track in ipairs(track_list) do
        if track.type == 'audio' and asian_langs[track.lang] then
            is_asian_lang = true
            log("Asian language audio track found (lang: " .. track.lang .. ").")
            break
        end
    end
    if not is_asian_lang then log("No Asian language audio track found.") end
    
    -- 4. Determine if content is HDR
    local is_hdr = (primaries == "bt.2020" or gamma == "smpte2084" or gamma == "arib-std-b67" or dv_profile ~= nil)
    log("HDR Detected: " .. tostring(is_hdr))

    -- 5. The Decision Tree
    local final_profile = nil

    if is_asian_lang then
        if is_hdr then
            final_profile = "anime-hdr"
        -- UPDATED: The condition for 'anime-old' is now more specific
        elseif height <= 576 or is_interlaced then
            final_profile = "anime-old"
        else -- height >= 720
            final_profile = "anime-sdr"
        end
    else -- Not Asian language
        if is_hdr then
            final_profile = "hdr"
        else
            final_profile = "sdr"
        end
    end

    -- 6. Apply the chosen profile
    if final_profile then
        log("--- FINAL DECISION: Applying profile '" .. final_profile .. "' ---")
        mp.commandv("apply-profile", final_profile)
        profile_applied_for_this_file = true
    else
        log("--- No profile matched. Using defaults. ---")
        profile_applied_for_this_file = true
    end
end

-- This is a more robust trigger than 'file-loaded'. It runs whenever
-- the track list changes, which is a reliable sign that the file's
-- headers have been parsed. It will trigger multiple times, but our
-- 'profile_applied_for_this_file' guard prevents the logic from
-- running more than once.

-- Create two observers. The function will be called when either property changes,
-- but the validation check inside ensures it only proceeds when BOTH are ready.

mp.observe_property('track-list', 'native', select_and_apply_profile)
mp.observe_property('video-params', 'native', select_and_apply_profile)

-- Reset the flag when a new file is loaded.
mp.register_event('start-file', function()
    mp.commandv("af", "clr", "") -- Clear all audio filters from the previous file
    profile_applied_for_this_file = false
    log("New file loaded. AF chain cleared & Profile manager reset.")
end)