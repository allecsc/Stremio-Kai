--[[
  @name Chapter Detection Module
  @description Chapter parsing and pattern matching for skip detection
  @version 4.1
  
  Hybrid mode architecture:
  - Evaluates chapters at file load with confidence levels
  - Provides skip target lookup for filter events
  - Min length (30s) filters title cards, max length (200s) filters content
--]]

local mp = require 'mp'
local config = require('modules/config')


local M = {}

-- Dependency injection
M.windows = nil

-- Cached skip categories (parsed once, reused everywhere)
local cached_categories = nil

-- Get skip categories (parses once, caches result)
function M.get_skip_categories()
    if cached_categories then return cached_categories end
    cached_categories = {}
    for category in string.gmatch(config.opts.skip_categories, "([^;]+)") do
        cached_categories[category:lower():gsub("%s+", "")] = true
    end
    return cached_categories
end

-- Check if a chapter title matches a category pattern
function M.matches_chapter_pattern(title, category)
    local pattern_string = config.opts[category .. '_patterns']
    if not title or not pattern_string then return false end
    for pattern in string.gmatch(pattern_string, "([^|]+)") do
        if string.match(title, pattern) then return true end
    end
    return false
end

-- Get chapter end time
function M.get_chapter_end(chapters, index)
    if index < #chapters then
        return chapters[index + 1].time
    else
        return mp.get_property_native("duration") or 0
    end
end

-- Calculate duration of a chapter
function M.calculate_chapter_duration(chapters, index)
    local chapter_end = M.get_chapter_end(chapters, index)
    return chapter_end - chapters[index].time
end

-- Check if chapter is in intro or outro time window
function M.is_in_time_window(chapter_start, chapter_end)
    if not M.windows then return false end
    local duration = mp.get_property_native("duration") or 0
    local intro_window = M.windows.get_intro_window()
    local outro_window = M.windows.get_outro_window()
    
    -- Chapter is in intro window if it starts in first 20%
    local in_intro = intro_window > 0 and chapter_start <= intro_window
    -- Chapter is in outro window if it ends in last 20%
    local in_outro = outro_window > 0 and duration > 0 and chapter_end >= (duration - outro_window)
    
    return in_intro or in_outro, in_intro and "intro" or (in_outro and "outro" or nil)
end

--============================================================================--
--                    CHAPTER EVALUATION (at file load)                       --
--============================================================================--

-- Evaluate all chapters and return with confidence levels
-- This implements the complete decision tree from DISCUSSION_PLAN.md #2
function M.evaluate_chapters()
    local chapters = mp.get_property_native("chapter-list")
    if not chapters or #chapters == 0 then return {} end
    
    local evaluated_chapters = {}
    local categories = M.get_skip_categories()
    local max_length = config.opts.intro_length_check or 200
    local common_length = config.CONSTANTS.COMMON_INTRO_LENGTH or 110
    local min_intro = config.CONSTANTS.MIN_INTRO_LENGTH or 30
    local preview_max = config.CONSTANTS.PREVIEW_MAX_LENGTH or 30
    
    -- PRE-SCAN: Check for HIGH confidence (pattern-matched) chapters
    -- This determines whether CASE 2 heuristics should auto-notify
    local has_high_intro = false
    local has_high_outro = false
    for _, ch in ipairs(chapters) do
        for category_name, _ in pairs(categories) do
            if M.matches_chapter_pattern(ch.title, category_name) then
                if category_name == "opening" or category_name == "recap" then
                    has_high_intro = true
                elseif category_name == "ending" or category_name == "preview" then
                    has_high_outro = true
                end
            end
        end
    end
    
    for i = 1, #chapters do
        local chapter = chapters[i]
        local chapter_start = chapter.time
        local chapter_end = M.get_chapter_end(chapters, i)
        local chapter_length = chapter_end - chapter_start
        local in_window, zone = M.is_in_time_window(chapter_start, chapter_end)
        
        -- Check for pattern match
        local matched_category = nil
        for category_name, _ in pairs(categories) do
            if M.matches_chapter_pattern(chapter.title, category_name) then
                matched_category = category_name
                break
            end
        end
        
        local eval = {
            index = i,
            chapter_start = chapter_start,
            chapter_end = chapter_end,
            chapter_length = chapter_length,
            title = chapter.title,
            pattern_matched = matched_category ~= nil,
            matched_category = matched_category,
            in_time_window = in_window,
            zone = zone,  -- "intro" or "outro" or nil
            confidence = nil,  -- "high", "medium", "low", "none"
            use_chapter_notification = false,  -- should auto-notify from chapter start?
        }
        
        -- Apply decision tree (from DISCUSSION_PLAN.md #2)
        if matched_category then
            -- CASE 1: Pattern matched
            if chapter_length <= max_length then
                -- HIGH confidence: auto-notify from chapter start
                eval.confidence = "high"
                eval.use_chapter_notification = true
            else
                -- Composite chapter: too long, filter detection needed
                eval.confidence = "medium"
                eval.use_chapter_notification = false
            end
        else
            -- CASE 2: Untitled or titled but not pattern-matched
            local is_common_length = chapter_length <= common_length
            local is_min_length = chapter_length >= min_intro
            local is_last_chapter = (i == #chapters)
            local is_preview_length = chapter_length <= preview_max
            
            if chapter_length <= max_length then
                if in_window then
                    if zone == "intro" and is_common_length and is_min_length and not has_high_intro then
                        -- INTRO CANDIDATE: Collect for post-processing selection
                        -- We don't decide yet. We collect all valid candidates in the window.
                        eval.confidence = "medium" 
                        eval.intro_candidate = true
                    elseif zone == "outro" and not has_high_outro then
                        -- OUTRO CANDIDATE: Will be resolved in post-processing
                        eval.confidence = "medium"
                        eval.use_chapter_notification = false
                        eval.outro_candidate = is_common_length and not is_preview_length
                        eval.preview_candidate = is_last_chapter and is_preview_length
                    else
                        -- Not matching heuristics, or HIGH confidence exists
                        eval.confidence = "medium"
                        eval.use_chapter_notification = false
                    end
                else
                    -- LOW confidence: no auto-notify, but chapter end is usable
                    eval.confidence = "low"
                    eval.use_chapter_notification = false
                end
            else
                -- Too long chapter
                if in_window then
                    -- Filter detection, chapter end usable if remaining valid
                    eval.confidence = "low"
                    eval.use_chapter_notification = false
                else
                    -- No auto-notify, filter events can still use chapter end
                    eval.confidence = "none"
                    eval.use_chapter_notification = false
                end
            end
        end
        
        -- Debug: Log chapter evaluation details
        if config.CONSTANTS.DEBUG_MODE then
            local reason = ""
            if eval.pattern_matched then
                reason = string.format("pattern='%s' length=%.0fs", eval.matched_category, chapter_length)
            elseif eval.intro_candidate then
                 reason = string.format("intro_candidate length=%.0fs", chapter_length)
            elseif in_window then
                reason = string.format("in_window length=%.0fs start=%.1fs", chapter_length, chapter_start)
            else
                reason = string.format("length=%.0fs start=%.1fs window=%s", chapter_length, chapter_start, tostring(in_window))
            end
            mp.msg.info(string.format("Chapter #%d '%s': %s conf=%s auto=%s (%s)",
                i, chapter.title or "untitled", eval.zone or "mid", 
                eval.confidence or "none", tostring(eval.use_chapter_notification), reason))
        end
        
        table.insert(evaluated_chapters, eval)
    end
    
    -- POST-PROCESSING: Select Best Intro Candidate (Smart Selection)
    -- Only runs if no HIGH confidence intro exists
    if not has_high_intro then
        local candidates = {}
        for idx, eval in ipairs(evaluated_chapters) do
            if eval.intro_candidate then
                table.insert(candidates, eval)
            end
        end

        if #candidates == 1 then
            -- Single candidate, automatic winner
            candidates[1].use_chapter_notification = true
        elseif #candidates > 1 then
            -- Multiple candidates: Score them
            local best_score = 9999
            local winner = nil
            
            -- Target strict 90s (most common OP length) or fallback to common config
            local target_length = 90 
            
            for _, cand in ipairs(candidates) do
                local score = math.abs(cand.chapter_length - target_length)
                
                if score < best_score then
                    best_score = score
                    winner = cand
                elseif math.abs(score - best_score) <= 5 then
                     -- TIE-BREAKER: Scores are within 5s of each other
                     -- Prefer the LATER chapter (Higher Index)
                     -- Logic: Ch 1 (90s) vs Ch 2 (90s) -> Ch 1 is Prologue, Ch 2 is Intro.
                     if winner and cand.index > winner.index then
                         winner = cand
                         best_score = score -- Update score to new winner
                     end
                end
            end
            
            if winner then
                winner.use_chapter_notification = true
                if config.CONSTANTS.DEBUG_MODE then
                    mp.msg.info(string.format("Smart Intro Selection: Chapter #%d won (Length: %.0fs, Score: %.1f)", 
                        winner.index, winner.chapter_length, best_score))
                end
            end
        end
    end
    
    -- POST-PROCESSING: Resolve outro/preview candidates
    -- Only runs when no HIGH confidence outro exists
    if not has_high_outro then
        local outro_count = 0
        local outro_idx = nil
        local preview_idx = nil
        
        for idx, eval in ipairs(evaluated_chapters) do
            if eval.outro_candidate then
                outro_count = outro_count + 1
                outro_idx = idx
            end
            if eval.preview_candidate then
                preview_idx = idx
            end
        end
        
        -- Apply decision tree
        if outro_count == 1 and not preview_idx then
            -- Single outro candidate, no preview
            evaluated_chapters[outro_idx].use_chapter_notification = true
            evaluated_chapters[outro_idx].matched_category = "ending"
        elseif outro_count == 1 and preview_idx then
            -- Outro + Preview both detected
            evaluated_chapters[outro_idx].use_chapter_notification = true
            evaluated_chapters[outro_idx].matched_category = "ending"
            evaluated_chapters[preview_idx].use_chapter_notification = true
            evaluated_chapters[preview_idx].matched_category = "preview"
        elseif outro_count == 0 and preview_idx then
            -- Preview only
            evaluated_chapters[preview_idx].use_chapter_notification = true
            evaluated_chapters[preview_idx].matched_category = "ending"  -- Label as "Skip Outro"
        end
        -- else: 0 or 2+ outro candidates -> fallback to filters (no action)
    end
    
    return evaluated_chapters
end

--============================================================================--
--                    SKIP TARGET LOOKUP (at skip time)                       --
--============================================================================--

-- Find nearby chapter end within valid distance from current position
-- Returns chapter info if found, nil otherwise
function M.get_nearby_chapter_end(current_time, max_distance)
    local chapters = mp.get_property_native("chapter-list")
    if not chapters or #chapters == 0 then return nil end
    
    max_distance = max_distance or config.opts.intro_length_check or 200
    
    for i = 1, #chapters do
        local chapter_end = M.get_chapter_end(chapters, i)
        local remaining = chapter_end - current_time
        
        -- Chapter end is ahead of us and within valid distance
        if remaining > 0 and remaining <= max_distance then
            return {
                index = i,
                chapter_end = chapter_end,
                remaining = remaining,
                title = chapters[i].title
            }
        end
    end
    
    return nil
end

-- Get current chapter info
function M.get_current_chapter()
    local chapters = mp.get_property_native("chapter-list")
    local current_idx = mp.get_property_native("chapter")
    
    if not chapters or not current_idx or current_idx < 0 then return nil end
    
    -- MPV chapter index is 0-based
    local i = current_idx + 1
    if i > #chapters then return nil end
    
    return {
        index = i,
        chapter_start = chapters[i].time,
        chapter_end = M.get_chapter_end(chapters, i),
        title = chapters[i].title
    }
end

-- Check if current chapter is skippable (has use_chapter_notification=true)
function M.is_current_chapter_skippable()
    local state = require('modules/state')
    local current_idx = mp.get_property_native("chapter")
    if current_idx == nil or current_idx < 0 then return false end
    
    -- MPV chapter index is 0-based, our evaluated_chapters uses 1-based
    local chapter_index = current_idx + 1
    
    local evaluated = state.chapter_cache.evaluated_chapters
    if not evaluated then return false end
    
    for _, ch in ipairs(evaluated) do
        if ch.index == chapter_index then
            return ch.use_chapter_notification == true
        end
    end
    
    return false
end

-- Clear the category cache (for testing/reset)
function M.clear_cache()
    cached_categories = nil
end

return M
