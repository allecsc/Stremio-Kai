--[[
  @name Content Detection Module
  @description Handles content type detection (movie/series) from mpv-bridge.js
  @version 3.1
--]]

local state = require('modules/state')

local M = {}

-- Check if skip functionality should be enabled
function M.is_skip_enabled()
    return state.content_state.content_type == "series"
end

-- Get current content type
function M.get_content_type()
    return state.content_state.content_type
end

-- Get current IMDb ID
function M.get_imdb_id()
    return state.content_state.imdb_id
end

-- Check if content is a movie
function M.is_movie()
    return state.content_state.content_type == "movie"
end

-- Check if content is a series
function M.is_series()
    return state.content_state.content_type == "series"
end

-- Check if setup is pending (waiting for content metadata)
function M.is_setup_pending()
    return state.content_state._setup_pending == true
end

-- Set setup pending flag
function M.set_setup_pending(pending)
    state.content_state._setup_pending = pending
end

-- Update content metadata (called from message handler)
function M.update_metadata(content_type, imdb_id)
    state.content_state.content_type = content_type
    state.content_state.imdb_id = imdb_id
end

return M
