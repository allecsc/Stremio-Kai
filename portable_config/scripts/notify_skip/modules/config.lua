--[[
  @name Config Module
  @description Centralized configuration and constants for notify_skip
  @version 3.1
--]]

local options = require 'mp.options'

local M = {}

-- User-configurable options
M.opts = {
    auto_skip = false,
    skip_categories = "opening;ending;preview;recap;logo",
    -- Unified filter args (used for both notification and exit detection)
    blackdetect_args = "d=0.3:pix_th=0.01:pic_th=0.98",
    silencedetect_args = "n=-45dB:d=0.4",
    show_notification = true,
    notification_duration = 30,
    filters_notification_duration = 5,
    min_skip_duration = 10,
    intro_length_check = 200,

    logo_patterns = "Logo|Studio|Production",
    opening_patterns = "^OP$|^OP%d+$|Opening|Intro|Introduction|Theme Song|Main Theme|Title Sequence|Cold Open|Teaser",
    ending_patterns = "^ED$|^ED%d+$|Ending|Outro|End Credits|Credits|Closing|Epilogue|End Theme|Closing Theme",
    preview_patterns = "Preview|Next Episode|Next Time|Coming Up|Next Week|^Trailer$",
    recap_patterns = "^Recap$|Previously|Last Time|^Summary$|Story So Far"
}

-- Read user options from config file
options.read_options(M.opts, "notify_skip")

-- Constants
M.CONSTANTS = {
    -- Debug
    DEBUG_MODE = false,           -- Set to true to enable verbose filter event logging
    
    -- Speed control
    MAX_SPEED = 100,              -- Fast-forward speed during skip
    NORMAL_SPEED = 1,             -- Normal playback speed
    
    -- Timing
    NOTIFICATION_COOLDOWN = 5,    -- Seconds to block notifications after showing one
    INTRO_THRESHOLD = 60,         -- Seconds from start to consider as "intro zone"
    SEEK_STABILIZATION_DELAY = 0.5, -- Seconds to wait after seek before notifications
    CHAPTER_DEBOUNCE_DELAY = 0.5, -- Seconds to debounce chapter entry notifications
    COMMON_INTRO_LENGTH = 110,    -- Chapters ≤110s are likely pure intros (no cold open)
    MIN_INTRO_LENGTH = 30,        -- Chapters must be ≥30s to avoid title cards
    PREVIEW_MAX_LENGTH = 30,      -- Preview chapters typically 25-30s
    CONFIRMATION_TIMEOUT = 5,     -- Seconds to wait for second Tab to confirm skip
    FILE_START_THRESHOLD = 5,     -- Seconds from file start for intro heuristic
    
    -- Dynamic window percentages (series only)
    INTRO_WINDOW_PERCENT = 0.20,  -- 20% of duration for intro window
    OUTRO_WINDOW_PERCENT = 0.20,  -- 20% of duration for outro window
    
    -- Timeout safeguard for skip search
    SKIP_SEARCH_TIMEOUT = 180,    -- Max seconds to search for exit before fallback
    SKIP_FALLBACK_DURATION = 90,  -- Skip this far if no exit found within timeout
}

return M
