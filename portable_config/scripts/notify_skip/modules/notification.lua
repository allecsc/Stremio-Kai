--[[
  @name Notification Module
  @description UI notifications and cooldown management
  @version 3.1
--]]

local mp = require 'mp'
local config = require('modules/config')
local state = require('modules/state')

local M = {}

-- Forward declaration for skip button (will be set by main.lua)
M.skip_button = nil

-- Category display names (module-level constant)
local category_names = {
    opening = "Intro",
    ending = "Outro",
}

--============================================================================--
--                           UI CONTROL                                       --
--============================================================================--

-- Hide the skip overlay
function M.hide_skip_overlay()
    if state.ui_state.overlay_timer then
        state.ui_state.overlay_timer:kill()
        state.ui_state.overlay_timer = nil
    end
    -- Hide the interactive button
    if M.skip_button then
        M.skip_button:hide()
    end
end

-- Show the skip overlay
function M.show_skip_overlay(message, duration, is_prompt, hint_text)
    if not config.opts.show_notification then return end
    M.hide_skip_overlay()

    is_prompt = is_prompt or false
    local display_duration = duration or config.opts.notification_duration

    -- Show the interactive button
    if M.skip_button then
        M.skip_button:set_message(message, is_prompt, hint_text)
    end

    if display_duration > 0 then
        state.ui_state.overlay_timer = mp.add_timeout(display_duration, M.hide_skip_overlay)
    end
end

--============================================================================--
--                          COOLDOWN MANAGEMENT                               --
--============================================================================--

-- Start notification cooldown
function M.start_notification_cooldown()
    if state.ui_state.notification_cooldown_timer then
        state.ui_state.notification_cooldown_timer:kill()
    end
    state.ui_state.notification_cooldown_timer = mp.add_timeout(config.CONSTANTS.NOTIFICATION_COOLDOWN, function()
        state.ui_state.notification_cooldown_timer = nil
    end)
end

--============================================================================--
--                        CHAPTER NOTIFICATIONS                               --
--============================================================================--

-- Chapter entry notification (debounced)
-- NOTE: Unlike filter notifications, chapter entry doesn't spam - fires once per chapter change
-- So we always show if the chapter is skippable, regardless of intro_skipped flag
function M.notify_on_chapter_entry()
    if not config.opts.show_notification or state.skip_state.mode == "none" then return end
    
    -- Debounce: skip if triggered too recently
    if state.ui_state.chapter_debounce_timer then return end

    local current_chapter_idx = mp.get_property_native("chapter")
    local skip_chapters = state.chapter_cache.skippable_chapters or {}
    
    for _, chapter in ipairs(skip_chapters) do
        if current_chapter_idx ~= nil and chapter.index == current_chapter_idx + 1 then
            -- Map category names for display
            local display = category_names[chapter.category] or chapter.category:gsub("^%l", string.upper)
            local message = "Skip " .. display
            
            mp.msg.info(string.format("Chapter notification: %s", message))
            M.show_skip_overlay(message, nil, true)
            M.start_notification_cooldown()
            
            -- Set debounce timer
            state.ui_state.chapter_debounce_timer = mp.add_timeout(config.CONSTANTS.CHAPTER_DEBOUNCE_DELAY, function()
                state.ui_state.chapter_debounce_timer = nil
            end)
            return
        end
    end
end

return M
