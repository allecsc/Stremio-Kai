--[[
  @name Window Calculator Module
  @description Dynamic intro/outro window calculation based on content duration
  @version 3.1
--]]

local mp = require 'mp'
local config = require('modules/config')
local state = require('modules/state')

local M = {}

-- Get intro window duration (20% of content length for series, 0 for movies)
function M.get_intro_window()
    if state.content_state.content_type ~= "series" then return 0 end
    local duration = mp.get_property_native("duration") or 0
    return duration * config.CONSTANTS.INTRO_WINDOW_PERCENT
end

-- Get outro window duration (20% of content length for series, 0 for movies)
function M.get_outro_window()
    if state.content_state.content_type ~= "series" then return 0 end
    local duration = mp.get_property_native("duration") or 0
    return duration * config.CONSTANTS.OUTRO_WINDOW_PERCENT
end

-- Check if given time is in intro window
function M.in_intro_window(time)
    local intro_window = M.get_intro_window()
    if intro_window <= 0 then return false end
    return time <= intro_window and not state.skip_state.intro_skipped
end

-- Check if given time is in outro window
function M.in_outro_window(time, duration)
    local outro_window = M.get_outro_window()
    if outro_window <= 0 or not duration or duration <= 0 then return false end
    return time >= (duration - outro_window)
end

-- Check if currently in any detection window
function M.in_detection_window(time, duration)
    return M.in_intro_window(time) or M.in_outro_window(time, duration)
end

return M
