--[[
  @name Skip Executor Module
  @description Skip execution logic for both chapter and silence modes
  @version 3.1
--]]

local mp = require 'mp'
local config = require('modules/config')
local state = require('modules/state')
local utils = require('modules/utils')
local windows = require('modules/window-calculator')
local chapters = require('modules/chapter-detection')
local content = require('modules/content-detection')

local M = {}

-- Forward declarations (will be set by main.lua)
M.filter_engine = nil
M.notification = nil

--============================================================================--
--                          HELPER FUNCTIONS                                   --
--============================================================================--

-- Show confirmation prompt and set up timeout
local function show_confirmation_prompt(log_message)
    state.skip_state.awaiting_confirmation = true
    
    if M.notification then
        M.notification.show_skip_overlay("Skip?", config.CONSTANTS.CONFIRMATION_TIMEOUT, true, "Press TAB to confirm")
    end
    
    state.skip_state.confirmation_timer = mp.add_timeout(config.CONSTANTS.CONFIRMATION_TIMEOUT, function()
        state.skip_state.awaiting_confirmation = false
        state.skip_state.confirmation_timer = nil
        if M.notification then
            M.notification.hide_skip_overlay()
        end
    end)
    
    mp.msg.info(log_message)
end

-- Clear confirmation state and timers
local function clear_confirmation()
    state.skip_state.awaiting_confirmation = false
    if state.skip_state.confirmation_timer then
        state.skip_state.confirmation_timer:kill()
        state.skip_state.confirmation_timer = nil
    end
    
    if M.notification then
        M.notification.start_notification_cooldown()
        M.notification.hide_skip_overlay()
    end
end

--============================================================================--
--                          CHAPTER SKIP                                      --
--============================================================================--

-- Skip to the end of a chapter
function M.skip_to_chapter_end(chapter_index)
    local chapter_list = mp.get_property_native("chapter-list")
    if not chapter_list then return false end
    
    if chapter_index < #chapter_list then
        utils.set_time(chapter_list[chapter_index + 1].time)
    else
        local duration = mp.get_property_native("duration")
        if duration then
            -- Prevent looping by stopping slightly before the end
            utils.set_time(duration - 1)
        end
    end
    return true
end

--============================================================================--
--                          SKIP TARGET SELECTION                              --
--============================================================================--

-- Get smart skip target: chapter end if available, otherwise filter detection
-- Also returns is_skippable_chapter to indicate if current chapter is marked for skip
function M.get_skip_target()
    local current_time = utils.get_time()
    local max_length = config.opts.intro_length_check or 200
    
    -- Check if current chapter is skippable (pattern-matched or heuristic-matched)
    local is_skippable = chapters.is_current_chapter_skippable()
    
    -- Check for nearby chapter end within valid distance
    local nearby = chapters.get_nearby_chapter_end(current_time, max_length)
    if nearby then
        return {
            type = "chapter_end",
            target_time = nearby.chapter_end,
            chapter_index = nearby.index,
            remaining = nearby.remaining,
            is_skippable_chapter = is_skippable
        }
    end
    
    -- No chapter end available, use filter detection
    return {
        type = "filter_detection",
        is_skippable_chapter = false
    }
end

-- Main skip function (dispatcher) - HYBRID MODE
function M.perform_skip()
    -- Completely silent for movies - Tab does nothing
    if content.is_movie() then
        return false
    end
    
    if config.CONSTANTS.DEBUG_MODE then
        mp.msg.info(string.format("perform_skip: mode=%s intro_skipped=%s awaiting_confirm=%s", 
            state.skip_state.mode, tostring(state.skip_state.intro_skipped),
            tostring(state.skip_state.awaiting_confirmation)))
    end

    -- If FF skip is active, handle toggle/cancel
    if state.skip_state.silence_active or state.skip_state.blackframe_skip_active then
        if M.filter_engine then
            M.filter_engine.stop_silence_skip()
        end
        -- Resume from current position with micro-seek to force audio resync
        utils.set_time(utils.get_time())
        if M.notification then
            M.notification.show_skip_overlay("Skip Cancelled", 2, false)
        end
        return true
    end
    
    -- Get smart skip target
    local skip_target = M.get_skip_target()
    
    -- Determine if confirmation is needed
    -- Skip directly only if user is in a skippable chapter OR already confirmed OR notification is active
    local needs_confirmation = not skip_target.is_skippable_chapter
    
    -- If notification is already showing (and not just the confirmation prompt), treat as confirmed
    if state.ui_state.overlay_timer and not state.skip_state.awaiting_confirmation then
        needs_confirmation = false
        if config.CONSTANTS.DEBUG_MODE then 
            mp.msg.info("Overlay active, treating as confirmation") 
        end
    end
    
    if skip_target.type == "chapter_end" then
        if needs_confirmation and not state.skip_state.awaiting_confirmation then
            -- In non-skippable chapter: require confirmation first
            show_confirmation_prompt("In non-skippable chapter, awaiting skip confirmation")
            return false
        end
        
        -- Either skippable chapter OR confirmed: execute skip
        clear_confirmation()
        
        local current_time = utils.get_time()
        local duration = mp.get_property_native("duration") or 0
        
        -- Record skip start time for seek-back detection
        state.skip_state.skip_start_time = current_time
        
        -- Determine if this is intro or outro based on position
        if current_time < duration / 2 then
            state.skip_state.intro_skipped = true
        end
        
        mp.msg.info(string.format("Hybrid skip: direct to chapter end %.1fs (remaining: %.1fs)", 
            skip_target.target_time, skip_target.remaining))
        utils.set_time(skip_target.target_time)
        return true
        
    else
        -- No chapter target: FF + filter detection needs confirmation
        if state.skip_state.awaiting_confirmation then
            -- Second Tab within 5s: confirmed, execute skip
            clear_confirmation()
            
            mp.msg.info("Skip confirmed, starting FF + filter detection")
            if M.filter_engine then
                M.filter_engine.start_silence_skip()
            end
            return true
        else
            -- First Tab: show confirmation prompt
            show_confirmation_prompt("No chapter target, awaiting skip confirmation")
            return false
        end
    end
end

--============================================================================--
--                          AUTO-SKIP                                         --
--============================================================================--

-- Check for auto-skip on chapter entry (only for high confidence chapters)
function M.check_auto_skip()
    if not config.opts.auto_skip then return end
    
    local current_chapter_idx = mp.get_property_native("chapter")
    local skip_chapters = state.chapter_cache.skippable_chapters or {}
    
    for _, chapter in ipairs(skip_chapters) do
        if current_chapter_idx ~= nil and chapter.index == current_chapter_idx + 1 then
            -- Only auto-skip high confidence (pattern matched) chapters
            if chapter.confidence == "high" then
                mp.msg.info("Auto-skipping high-confidence chapter: " .. (chapter.title or "untitled"))
                
                if chapter.category == "opening" then
                    state.skip_state.intro_skipped = true
                end
                
                -- Skip to chapter end
                if chapter.chapter_end then
                    utils.set_time(chapter.chapter_end)
                else
                    M.skip_to_chapter_end(chapter.index)
                end
                return
            end
        end
    end
end

return M
