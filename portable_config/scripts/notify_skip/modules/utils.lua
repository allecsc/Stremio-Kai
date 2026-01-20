--[[
  @name Utils Module
  @description Shared utility functions for notify_skip
  @version 3.1
--]]

local mp = require 'mp'

local M = {}

-- MPV property wrappers
function M.set_time(time) 
    mp.set_property_number('time-pos', time) 
end

function M.get_time() 
    return mp.get_property_native('time-pos') or 0 
end

function M.set_speed(speed) 
    mp.set_property('speed', speed) 
end

function M.set_pause(state) 
    mp.set_property_bool('pause', state) 
end

function M.set_mute(state) 
    mp.set_property_bool('mute', state) 
end

-- Reusable event data table (avoids creating new table on each event)
M.event_data = {}

-- Parse JSON-like metadata into reusable table
function M.parse_event_data(value)
    -- Clear previous data
    for k in pairs(M.event_data) do M.event_data[k] = nil end
    -- Parse new data
    if value then
        for key, val in string.gmatch(value, '"([^"]+)":"([^"]*)"') do
            M.event_data[key] = val
        end
    end
    return M.event_data
end

return M
