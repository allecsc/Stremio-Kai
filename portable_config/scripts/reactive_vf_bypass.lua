--[[
  @name Reactive VF Bypass
  @description Temporarily disables heavy video filters (SVP/Vapoursynth) during seeks
               to improve UI responsiveness and prevent hangs on lower-end hardware
  @version 1.2
  @author allecsc (Refactored for Dedicated SVP Mode)
  
  @changelog
    v1.2 - Refactored to "Directed Mode": hardcoded target (@SVP or vapoursynth)
           Switched from remove/add to enable/disable toggle (Warm Standby)
           Added inter-script communication to ignore specific seeks
    v1.1 - Added get_vf()/fmt_vf() helpers, configurable restore_delay
    v1.0 - Initial implementation with seek debouncing and state validation
  
  Behavioral Flow:
    1. On file load:   Detects SVP filter (by label/name) in VF chain, stores it
    2. On seek:        Disables SVP filter (toggle), starts restore timer
    3. On timer fire:  Enables SVP filter (toggle) after delay
    4. On VF change:   Updates stored filter identifier if externally modified
    5. On pause/resume: Validates state consistency
--]]
-- luacheck: read globals mp

local mp = require "mp"

-- State variables
local stored_vf = ""
local vf_detected = false
local is_restoring = false
local restore_timer = nil
local script_cleared_vf = false
local paused = false
local expected_state = "normal"  -- Track script phases: "normal", "cleared_for_seek", "restoring"
local last_seek_time = 0  -- For debouncing rapid seek events to prevent infinite loops
local DEBOUNCE_THRESHOLD = 0.2  -- Ignore seeks within 200ms of previous (prevents loop during pause+seek)

-- Configuration (Hardcoded for performance)
local TARGET_LABEL = "SVP"
local TARGET_NAME = "vapoursynth"
local RESTORE_DELAY = 1.0

-- Helper: Get normalized VF property
local function get_vf()
    local v = mp.get_property("vf")
    if not v or v == "NONE" then return "" end
    return tostring(v)
end

-- Helper: Format VF value for logging
local function fmt_vf(val)
    return (val ~= "" and val or "<empty>")
end

mp.msg.info("Reactive VF Bypass script loaded (Dedicated Mode)")

-- Helper: Check if a single filter entry matches our target
local function is_target_filter(filter)
    if not filter then return false end
    -- Check exact match first
    if (filter.label == TARGET_LABEL) or (filter.name == TARGET_NAME) then
        return true
    end
    -- Check substring match (safe find)
    if filter.label and type(filter.label) == "string" and filter.label:find(TARGET_LABEL, 1, true) then
        return true
    end
    if filter.name and type(filter.name) == "string" and filter.name:find(TARGET_NAME, 1, true) then
        return true
    end
    return false
end

-- Cancel any pending restore operation (don't reset is_restoring here - let timer handle it)
local function cancel_pending_restore(reason)
    if restore_timer then
        restore_timer:kill()
        restore_timer = nil
    end
    script_cleared_vf = false
    mp.msg.verbose("Pending restore cancelled: " .. (reason or "unknown"))
end

-- Reset all state
local function reset_state(reason)
    stored_vf = ""
    vf_detected = false
    cancel_pending_restore("state reset")
    mp.msg.verbose("VF bypass state reset: " .. (reason or "unknown"))
end

-- Context-specific validation functions

-- Validate before seek: Ensure current VF matches stored before clearing (skip strict check if paused)
local function validate_before_seek()
    local current_vf = mp.get_property_native("vf") or {}
    
    mp.msg.verbose("[SEEK PHASE] Validating before seek:")
    if paused then mp.msg.verbose("  (Paused - skipping strict match)") end
    
    if stored_vf == "" then
        mp.msg.verbose("[SEEK PHASE] No stored VF, nothing to validate")
        return true
    end
    
    if paused then return true end
    
    -- Check if ANY enabled filter matches our target
    local current_svp = nil
    for _, filter in ipairs(current_vf) do
        if filter.enabled and is_target_filter(filter) then
            current_svp = filter.label or filter.name
            break
        end
    end
    
    -- Logic: If we stored "SVP" and we see "SVP", we're good.
    if current_svp then
        mp.msg.verbose("[SEEK PHASE] Validation passed: SVP filter present")
        return true
    else
        mp.msg.verbose("[SEEK PHASE] Validation failed: SVP filter missing before seek")
        return false
    end
end

-- Validate before restore: Check if stored VF is still valid (unchanged since clear), ignore current emptiness
local function validate_before_restore()
    local current_vf = mp.get_property_native("vf") or {}
    
    mp.msg.verbose("[RESTORE PHASE] Validating before restore")
    
    if stored_vf == "" then return false end
    
    -- Check if SVP filter is ALREADY back (and enabled)
    for _, filter in ipairs(current_vf) do
        if filter.enabled and is_target_filter(filter) then
            mp.msg.verbose("[RESTORE PHASE] Validation passed: SVP filter already enabled (no need to restore)")
            return false
        end
    end
    
    return true
end

-- Validate on resume from pause: Detect external changes during pause and react (Step 4: Distinguish script vs external actions)
local function validate_on_resume()
    local current_vf = mp.get_property_native("vf") or {}
    
    mp.msg.verbose("[RESUME PHASE] Validating on resume")
    
    if stored_vf == "" then return true end
    
    -- Check current state
    local svp_present = false
    local svp_enabled = false
    
    for _, filter in ipairs(current_vf) do
        if is_target_filter(filter) then
            svp_present = true
            svp_enabled = filter.enabled
            break
        end
    end
    
    if svp_enabled then
        mp.msg.verbose("[RESUME PHASE] Validation passed: SVP enabled")
        return true
    end
    
    -- Mismatch: Check if this is a script action vs true external change
    if not svp_enabled then
        -- SVP filter disabled or missing
        if expected_state == "cleared_for_seek" or script_cleared_vf then
            mp.msg.verbose("[RESUME PHASE] Expected disabled SVP due to script action during pause")
            return true  -- Script's own action, let timer restore
        else
            mp.msg.info("[RESUME PHASE] External SVP disable/removal detected during pause, resetting state")
            reset_state("external change during pause")
            return false
        end
    end
    
    return true
end

-- Handle file loading
mp.register_event("file-loaded", function()
    reset_state("file loaded")
    
    -- Check if initial VF contains SVP
    local current_vf = mp.get_property_native("vf") or {}
    for _, filter in ipairs(current_vf) do
        if filter.enabled and is_target_filter(filter) then
            stored_vf = filter.label or filter.name
            vf_detected = true
            mp.msg.info("Initial SVP filter detected: " .. stored_vf)
            break
        end
    end
end)

mp.register_event("end-file", function()
    reset_state("file ended")
end)

-- Track pause state and validate on resume
mp.observe_property("pause", "bool", function(_, val)
    local was_paused = paused
    paused = not not val
    
    if was_paused and not paused then
        -- Resuming from pause - validate our stored state
        mp.msg.verbose("Resumed from pause - validating stored VF")
        validate_on_resume()
    end
end)

-- Monitor VF changes
mp.observe_property("vf", "native", function(_, value)
    local current_vf = value or {}
    
    -- Check for our target filter in the new chain
    local svp_found = false
    local svp_enabled = false
    local found_name = ""
    
    for _, filter in ipairs(current_vf) do
        if is_target_filter(filter) then
            svp_found = true
            svp_enabled = filter.enabled
            found_name = filter.label or filter.name
            break
        end
    end
    
    -- If this change happened while we expect script control, validate it
    if script_cleared_vf or (is_restoring and expected_state == "cleared_for_seek") then
        if script_cleared_vf then
            if not svp_enabled then
                mp.msg.verbose("[CLEAR PHASE] SVP disabled as expected")
            else
                mp.msg.info("[CLEAR PHASE] Unexpected: SVP re-enabled during clear phase")
                -- External re-enable? Update state
                stored_vf = found_name
                vf_detected = true
            end
        end
        return
    end
    
    -- External VF change tracking
    if svp_found and svp_enabled then
        if found_name ~= stored_vf then
            stored_vf = found_name
            vf_detected = true
            mp.msg.info("External SVP filter change detected: " .. stored_vf)
        end
    elseif stored_vf ~= "" and not svp_enabled then
        -- SVP was tracked but is now disabled/gone
        -- Only consider it "removed" if it's actually GONE or DISABLED externally
        if not svp_found then
             mp.msg.info("SVP filter removed externally, clearing stored VF")
             reset_state("external SVP removal")
        end
    end
end)

-- Flag to ignore the next seek (external request)
local ignore_next_seek = false

mp.register_script_message("bypass-ignore-seek", function()
    ignore_next_seek = true
    mp.msg.verbose("Received request to ignore next seek")
end)

-- Handle seek events
mp.register_event("seek", function()
    -- Check for ignore flag (one-shot)
    if ignore_next_seek then
        ignore_next_seek = false
        mp.msg.info("Ignoring seek event (requested by external script)")
        return
    end

    local current_time = mp.get_time()
    
    -- Debounce: Ignore rapid successive seeks to prevent infinite loops
    if current_time - last_seek_time < DEBOUNCE_THRESHOLD then
        mp.msg.verbose("[SEEK PHASE] Seek debounced - too soon after previous (" .. string.format("%.3f", current_time - last_seek_time) .. "s)")
        return
    end
    last_seek_time = current_time
    
    -- Only act if we have an SVP chain stored
    if not vf_detected or stored_vf == "" then
        mp.msg.verbose("Seek ignored - no SVP chain stored")
        return
    end
    
    -- Ensure is_restoring is true for the timer (set BEFORE check to catch rapid seeks)
    local was_restoring = is_restoring
    is_restoring = true

    -- If already restoring, just restart the timer (handle multiple seeks)
    if was_restoring then
        mp.msg.verbose("[SEEK PHASE] Multiple seek detected - restarting restore timer")
        cancel_pending_restore("multiple seek - restarting timer")
    end
    
    -- Check if SVP filter is currently active - only disable if it's enabled
    local current_vf = mp.get_property_native("vf") or {}
    local svp_entry = nil
    
    -- Find the SVP filter in the chain (Matched by Label or Name)
    for _, filter in ipairs(current_vf) do
        if filter.enabled then -- Only care if it's currently enabled
            if is_target_filter(filter) then
                svp_entry = filter
                break
            end
        end
    end
    
    if svp_entry then
        -- Validate before clearing (skip if paused)
        if expected_state == "normal" and not paused then
            if not validate_before_seek() then
                mp.msg.info("[SEEK PHASE] Pre-seek validation failed, aborting seek optimization")
                is_restoring = was_restoring -- Revert state
                return
            end
        elseif paused then
            mp.msg.verbose("[SEEK PHASE] Seek during pause detected - skipping strict validation, proceeding with clear")
        end
        
        mp.msg.verbose("[SEEK PHASE] Seek detected - temporarily disabling SVP chain for performance" .. (paused and " (while paused)" or ""))
        expected_state = "cleared_for_seek"
        script_cleared_vf = true
        
        -- TOGGLE LOGIC: Disable the filter instead of removing it
        svp_entry.enabled = false
        mp.set_property_native("vf", current_vf)
        
        stored_vf = svp_entry.label or svp_entry.name -- Track what we disabled
        vf_detected = true
        
        mp.msg.info("[SEEK PHASE] Disabled SVP filter: " .. stored_vf)
    else
        mp.msg.verbose("[SEEK PHASE] Already disabled or no need to disable, just restarting timer")
    end
    
    -- Create/restart timer for this seek
    restore_timer = mp.add_timeout(RESTORE_DELAY, function()
        restore_timer = nil
        script_cleared_vf = false
        
        mp.msg.verbose("[RESTORE PHASE] Timer fired - debug state: is_restoring=" .. tostring(is_restoring) .. ", stored_vf='" .. fmt_vf(stored_vf) .. "', expected_state=" .. expected_state .. ", paused=" .. tostring(paused))
        
        -- Always attempt restore if we have stored VF (timer only set during seek)
        if stored_vf ~= "" then
            -- Find the filter again to re-enable it
            local restore_vf_chain = mp.get_property_native("vf") or {}
            local target_filter = nil
            
            for _, filter in ipairs(restore_vf_chain) do
                -- Search for our disabled filter (Label or Name)
                if is_target_filter(filter) then
                    target_filter = filter
                    break
                end
            end

            if target_filter then
                mp.msg.verbose("[RESTORE PHASE] Restoring SVP chain after seek")
                -- TOGGLE LOGIC: Enable the filter
                target_filter.enabled = true
                mp.set_property_native("vf", restore_vf_chain)
                
                mp.msg.info("[RESTORE PHASE] Re-enabled SVP filter: " .. (target_filter.label or target_filter.name))
                
                -- MICRO-SEEK LOGIC: Force A/V resync after SVP re-enable
                ignore_next_seek = true -- Engage guard for OUR seek
                mp.commandv("seek", "0", "relative+exact")
                mp.msg.info("[RESTORE PHASE] Performed guarded micro-seek for A/V sync")
                
                expected_state = "normal"
            else
                mp.msg.info("[RESTORE PHASE] Target filter not found or gone, skipping restore")
                expected_state = "normal"
            end
            is_restoring = false
        else
            mp.msg.verbose("[RESTORE PHASE] Restore skipped - no stored VF")
            expected_state = "normal"
            is_restoring = false
        end
    end)
end)
