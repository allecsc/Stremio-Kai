--[[
  @name State Module
  @description Centralized state management for notify_skip
  @version 3.1
--]]

local M = {}

-- Skip mode and timing state
M.skip_state = {
    mode = "none",                  -- "hybrid" or "none"
    intro_skipped = false,          -- Has intro been skipped this session?
    skip_start_time = 0,            -- When current skip started
    silence_active = false,         -- Is silence-based skip in progress?
    blackframe_skip_active = false, -- Is blackframe skip in progress?
    is_seeking = false,             -- Is user currently seeking?
    seek_timeout = nil,             -- Timer for seek stabilization
    skip_timeout_timer = nil,       -- Timer for fallback skip if no exit found
    awaiting_confirmation = false,  -- Waiting for second Tab to confirm skip?
    confirmation_timer = nil,       -- Timer for confirmation timeout (5s)
}

-- Detection subsystem state
M.detection_state = {
    notification_active = false,    -- Are notification filters running?
    skipping_active = false,        -- Are skip detection filters running?
    _duration_logged = false,       -- Has duration been logged (debug)
    filter_init_suppression = false, -- Suppress notifications during filter init
    filter_init_timer = nil,        -- Timer for filter init suppression
}

-- UI state
M.ui_state = {
    overlay_timer = nil,            -- Timer for auto-hiding overlay
    notification_cooldown_timer = nil,  -- Timer for anti-spam cooldown after notification
    chapter_debounce_timer = nil,   -- Timer for debouncing chapter entry notifications
}

-- Filter observers (MPV property observers)
M.filter_observers = {
    blackdetect = nil,
    silencedetect = nil,
}

-- Chapter cache
M.chapter_cache = {
    skippable_chapters = nil,       -- Chapters with auto-notify from chapter start
    evaluated_chapters = nil,       -- All chapters with confidence levels (hybrid mode)
    has_high_confidence = false,    -- Cached: any HIGH confidence chapters exist?
}

-- Filter event tracking (for deduplication)
M.filter_tracking = {
    last_black_start = nil,
    detected_skip_end = nil,
    last_processed_silence_start = nil,
    last_processed_black_start = nil,
    -- Exit clustering (dwell window)
    exit_candidate = nil,           -- Current best exit candidate time
    exit_candidate_time = nil,      -- Video time when candidate was set
    exit_dwell_timer = nil,         -- Timer for dwell window
    disabled_filters = {},          -- Stack of filters disabled during skip
}

-- Content metadata (received from mpv-bridge.js)
M.content_state = {
    content_type = nil,  -- "movie" or "series" or nil (unknown)
    imdb_id = nil,
    _setup_pending = nil,  -- Flag for deferred setup
}

-- Reset all state (except content_state which is managed by bridge)
function M.reset_all()
    -- Reset skip_state
    M.skip_state.mode = "none"
    M.skip_state.intro_skipped = false
    M.skip_state.skip_start_time = 0
    M.skip_state.silence_active = false
    M.skip_state.blackframe_skip_active = false
    M.skip_state.is_seeking = false
    M.skip_state.awaiting_confirmation = false
    
    -- Clear confirmation timer if active
    if M.skip_state.confirmation_timer then
        M.skip_state.confirmation_timer:kill()
        M.skip_state.confirmation_timer = nil
    end
    
    -- Clear seek timeout if active
    if M.skip_state.seek_timeout then
        M.skip_state.seek_timeout:kill()
        M.skip_state.seek_timeout = nil
    end
    
    -- Clear skip timeout timer if active
    if M.skip_state.skip_timeout_timer then
        M.skip_state.skip_timeout_timer:kill()
        M.skip_state.skip_timeout_timer = nil
    end
    
    -- Reset detection_state
    M.detection_state.notification_active = false
    M.detection_state.skipping_active = false
    M.detection_state._duration_logged = false
    M.detection_state.filter_init_suppression = false
    if M.detection_state.filter_init_timer then
        M.detection_state.filter_init_timer:kill()
        M.detection_state.filter_init_timer = nil
    end
    
    -- Clear UI timers
    if M.ui_state.overlay_timer then
        M.ui_state.overlay_timer:kill()
        M.ui_state.overlay_timer = nil
    end
    if M.ui_state.notification_cooldown_timer then
        M.ui_state.notification_cooldown_timer:kill()
        M.ui_state.notification_cooldown_timer = nil
    end
    if M.ui_state.chapter_debounce_timer then
        M.ui_state.chapter_debounce_timer:kill()
        M.ui_state.chapter_debounce_timer = nil
    end
    
    -- Reset caches
    M.chapter_cache.skippable_chapters = nil
    M.chapter_cache.evaluated_chapters = nil
    M.chapter_cache.has_high_confidence = false
    
    -- Reset filter tracking
    M.filter_tracking.last_black_start = nil
    M.filter_tracking.detected_skip_end = nil
    M.filter_tracking.last_processed_silence_start = nil
    M.filter_tracking.last_processed_black_start = nil
    -- Reset exit dwell state
    if M.filter_tracking.exit_dwell_timer then
        M.filter_tracking.exit_dwell_timer:kill()
    end
    M.filter_tracking.exit_candidate = nil
    M.filter_tracking.exit_candidate_time = nil
    M.filter_tracking.exit_dwell_timer = nil
    
    -- NOTE: We don't reset content_state here because content-metadata can arrive 
    -- BEFORE file-loaded, and we don't want to wipe that data.
    -- content_state is managed solely by the content-metadata handler.
end

-- Reset filter tracking only (used after substantial intro skip)
function M.reset_filter_tracking()
    M.filter_tracking.last_black_start = nil
    M.filter_tracking.detected_skip_end = nil
    M.filter_tracking.last_processed_silence_start = nil
    M.filter_tracking.last_processed_black_start = nil
    -- Reset exit dwell state
    if M.filter_tracking.exit_dwell_timer then
        M.filter_tracking.exit_dwell_timer:kill()
    end
    M.filter_tracking.exit_candidate = nil
    M.filter_tracking.exit_candidate_time = nil
    M.filter_tracking.exit_dwell_timer = nil
end

return M
