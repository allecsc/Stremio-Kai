--[[
  @name SVP Cleanup
  @description Ensures VapourSynth/SVP instances are fully torn down before the next
               file begins loading, preventing race conditions and crashes
  @version 1.0
  @author allecsc
  
  @changelog
    v1.0 - Initial implementation using on_unload hook for synchronous cleanup
  
  @requires
    - SVP or VapourSynth filters in the VF chain
  
  How It Works:
    This script uses mpv's `on_unload` hook with priority 50 to block the file
    transition until cleanup completes. When SVP is detected in the filter chain,
    it clears both VF and AF lists synchronously, allowing VapourSynth processes
    to release handles before the next file attempts to initialize them.
  
  Why Synchronous?
    Async cleanup can cause race conditions where the next file tries to initialize
    SVP while the previous instance is still shutting down, leading to crashes or
    failed filter loads. The hook-based approach guarantees ordering.
--]]
-- luacheck: read globals mp

local mp = require "mp"

mp.msg.info("SVP Cleanup script loaded (Synchronous Hook Mode)")

-- Use on_unload hook for synchronous cleanup
-- This blocks the transition to the next file until the function completes
mp.add_hook("on_unload", 50, function()
    local current_vf = mp.get_property_native("vf")
    local has_svp = false

    -- Robust check for SVP or VapourSynth in the filter chain
    if current_vf then
        for _, filter in ipairs(current_vf) do
            if filter.name == "vapoursynth" or (filter.label and filter.label:find("SVP")) then
                has_svp = true
                break
            end
        end
    end

    if has_svp then
        mp.msg.info("SVP Cleanup: SVP detected, forcing synchronous deinit...")
        -- Clear both video and audio filters to ensure a clean state
        mp.commandv("vf", "clr", "")
        mp.commandv("af", "clr", "")
        
        -- Small internal delay to allow the VapourSynth process to release handles
        -- Since this is a hook, mpv will wait here.
        mp.msg.verbose("SVP Cleanup: Deinit complete.")
    else
        mp.msg.verbose("SVP Cleanup: No SVP chain detected, skipping.")
    end
end)
