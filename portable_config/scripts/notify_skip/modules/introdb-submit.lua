--[[
  @name IntroDB Submit Module
  @description Mark intro/recap/outro in the player and submit them to IntroDB
  @version 1.0

  Two front ends share one set of marks:
    - Keyboard (input.conf / web key forwarder): mark start -> mark end ->
      on-screen confirmation -> confirm key -> POST.
    - Player panel (webmods/UI/introdb-submit-panel.js): sends "introdb-ui"
      actions; the panel's Submit button is the confirmation.
  The type defaults to Outro when the start is in the last 30% of the file and
  Intro otherwise; choosing a type explicitly overrides that.

  State for the panel is published in user-data/kai/introdb-ui on every change.

  The API key never passes through mpv: mpv writes every command, property set
  and subprocess stdin_data to LOG.txt. Instead, introdb_helper.py publishes a
  Diffie-Hellman public value (user-data/kai/introdb-pubkey), mpv-bridge.js
  seals the key against it, and only public values reach this module. The
  helper unseals the key inside Python at submit time.
--]]

local mp = require 'mp'
local utils = require 'mp.utils'
local config = require('modules/config')
local content = require('modules/content-detection')
local state = require('modules/state')

local M = {}

local PUBKEY_PROPERTY = "user-data/kai/introdb-pubkey"
local UI_STATE_PROPERTY = "user-data/kai/introdb-ui"
local VALIDATE_PROPERTY = "user-data/kai/introdb-validate"
local CONFIRM_TIMEOUT = 15
local KEY_DEBOUNCE = 0.3   -- same action from both input.conf and the web forwarder
local PREVIEW_PREROLL = 3  -- seconds before a mark when previewing it

local SEGMENT_TYPES = { "intro", "recap", "outro" }
local SEGMENT_NAMES = { intro = "Intro", recap = "Recap", outro = "Outro" }

-- Local sanity limits (seconds). IntroDB enforces the exact rules; intro allows
-- up to 300s for Arabic titles, so the server makes the final call on 180-300s.
local DURATION_LIMITS = {
    intro = { 5, 300 },
    recap = { 5, 480 },
    outro = { 5, 900 },
}

-- Start marks past this fraction of the file default to Outro, earlier ones to Intro
local OUTRO_ZONE = 0.7

-- Wired up by main.lua via M.init()
local python_exe, helper_path, state_path, history_path
local on_submitted = nil

-- Successful submissions from this install, keyed "imdb|season|episode" then by
-- segment type: { start_sec, end_sec, status, submitted_at }. IntroDB's API
-- can't list a user's submissions, so this file is the only record.
local history = {}

local submit_cfg = { enabled = false, page_pub = nil, sealed = nil }

local marks = {
    type_index = 1,
    type_explicit = false,   -- set when the user picks a type
    start_sec = nil,
    end_sec = nil,
    episode_key = nil,
    by_keyboard = false,     -- started with the mark-start key (pauses auto-skip)
}

local panel_open = false

local pending_confirm = nil   -- keyboard confirmation: { timer }
local submitting = false
local last_action = {}
local message = { text = nil, kind = "info", seq = 0 }

-- After a successful submit the panel closes when playback resumes (or after
-- CLOSE_DELAY if it was already playing). Any further panel action cancels it.
local CLOSE_DELAY = 3
local close = { pending = false, seq = 0, timer = nil }
local ui_action_active = false   -- true while handling a panel action (no OSD)

--============================================================================--
--                               HELPERS                                      --
--============================================================================--

local function fmt_time(sec)
    local m = math.floor(sec / 60)
    return string.format("%d:%04.1f", m, sec - m * 60)
end

local function current_type()
    return SEGMENT_TYPES[marks.type_index]
end

local function episode_key()
    return string.format("%s|%s|%s", tostring(content.get_imdb_id()),
        tostring(content.get_season()), tostring(content.get_episode()))
end

-- Find the key bound to a script-binding so prompts match the user's input.conf
local function key_for(binding_name)
    local target = "script-binding notify_skip/" .. binding_name
    for _, b in ipairs(mp.get_property_native("input-bindings", {})) do
        if b.cmd == target and b.priority >= 0 then return b.key end
    end
    return "(unbound)"
end

local function current_time()
    return mp.get_property_native("time-pos")
end

local function set_type(seg)
    for i, name in ipairs(SEGMENT_TYPES) do
        if name == seg then marks.type_index = i end
    end
end

local function marks_current()
    return marks.start_sec ~= nil and marks.episode_key == episode_key()
end

-- Returns an error string, or nil when submissions are possible right now
local function availability_error()
    if not submit_cfg.enabled then
        return "submissions are off (Settings > Player > Enable IntroDB Submissions)"
    end
    if not submit_cfg.sealed then
        return "no API key set (Settings > Player > IntroDB API Key)"
    end
    if not content.is_series() then
        return "submissions are for series episodes only"
    end
    local imdb = content.get_imdb_id()
    local season, episode = tonumber(content.get_season()), tonumber(content.get_episode())
    if type(imdb) ~= "string" or not imdb:match("^tt%d+$") or not season or not episode
        or season < 1 or episode < 1 then
        return "episode info missing (IMDb ID, season, episode)"
    end
    return nil
end

-- Check the current marks. Returns nil, err or a request { label, body, duration }.
local function build_request()
    if not marks_current() then return nil, "mark the start first" end
    if not marks.end_sec then return nil, "mark the end" end
    local seg = current_type()
    local name = SEGMENT_NAMES[seg]
    local duration = marks.end_sec - marks.start_sec
    if duration <= 0 then
        return nil, string.format("end (%s) must be after start (%s)",
            fmt_time(marks.end_sec), fmt_time(marks.start_sec))
    end
    local limits = DURATION_LIMITS[seg]
    if duration < limits[1] or duration > limits[2] then
        local range = seg == "intro" and "5-180s long (300s for Arabic titles)"
            or string.format("%d-%ds long", limits[1], limits[2])
        return nil, string.format("%s must be %s, marked %.1fs", name, range, duration)
    end
    local season, episode = tonumber(content.get_season()), tonumber(content.get_episode())
    return {
        label = string.format("%s %s-%s S%dE%d", name, fmt_time(marks.start_sec),
            fmt_time(marks.end_sec), season, episode),
        duration = duration,
        body = utils.format_json({
            imdb_id = content.get_imdb_id(),
            segment_type = seg,
            season = season,
            episode = episode,
            start_sec = math.floor(marks.start_sec * 1000 + 0.5) / 1000,
            end_sec = math.floor(marks.end_sec * 1000 + 0.5) / 1000,
        }),
    }
end

local function load_history()
    local f = history_path and io.open(history_path, "r")
    if not f then return end
    local data = utils.parse_json(f:read("*a") or "")
    f:close()
    if type(data) == "table" then history = data end
end

local function record_submission(body_json, status)
    local body = utils.parse_json(body_json)
    if type(body) ~= "table" then return end
    local key = string.format("%s|%d|%d", tostring(body.imdb_id), tonumber(body.season), tonumber(body.episode))
    history[key] = history[key] or {}
    history[key][body.segment_type] = {
        start_sec = body.start_sec,
        end_sec = body.end_sec,
        status = status,
        submitted_at = os.time(),
    }
    local f = history_path and io.open(history_path, "w")
    if not f then
        mp.msg.warn("IntroDB: could not save submission history")
        return
    end
    f:write(utils.format_json(history))
    f:close()
end

-- This episode's entries from the history, for the panel
local function episode_history()
    local season, episode = tonumber(content.get_season()), tonumber(content.get_episode())
    if not season or not episode then return {} end
    return history[string.format("%s|%d|%d", tostring(content.get_imdb_id()), season, episode)] or {}
end

-- What IntroDB currently has for this episode (fetched by main.lua for skipping)
local function live_segments()
    local segments = state.chapter_cache.introdb_segments
    local live = {}
    if type(segments) ~= "table" then return live end
    for _, seg in ipairs(SEGMENT_TYPES) do
        local s = segments[seg]
        if type(s) == "table" and s.start_sec and s.end_sec and s.end_sec > s.start_sec then
            live[seg] = {
                start_sec = s.start_sec,
                end_sec = s.end_sec,
                submission_count = s.submission_count or 0,
            }
        end
    end
    return live
end

-- Publish everything the panel renders. Only times and messages, never key material.
local function publish_state()
    local seg = current_type()
    local req, invalid = build_request()
    local current = marks_current()
    mp.set_property_native(UI_STATE_PROPERTY, {
        mine = episode_history(),
        live = live_segments(),
        unavailable = availability_error() or "",
        type = seg,
        type_explicit = marks.type_explicit,
        start_sec = current and marks.start_sec or -1,
        end_sec = current and marks.end_sec or -1,
        duration = req and req.duration or -1,
        min_len = DURATION_LIMITS[seg][1],
        max_len = DURATION_LIMITS[seg][2],
        ready = req ~= nil,
        invalid = (current and marks.end_sec) and (invalid or "") or "",
        label = req and req.label or "",
        submitting = submitting,
        message = message.text or "",
        message_kind = message.kind,
        message_seq = message.seq,
        close_seq = close.seq,
    })
end

local function cancel_close()
    close.pending = false
    if close.timer then close.timer:kill() end
    close.timer = nil
end

-- Tell the panel to close (it watches close_seq)
local function request_close()
    cancel_close()
    close.seq = close.seq + 1
    publish_state()
end

local function close_after_submit()
    cancel_close()
    close.pending = true
    if not mp.get_property_native("pause") then
        close.timer = mp.add_timeout(CLOSE_DELAY, request_close)
    end
end

-- Report a message: on-screen for keyboard actions, in the panel for all
local function show(text, seconds, kind)
    mp.msg.verbose("OSD: " .. text)
    message.text, message.kind, message.seq = text, kind or "info", message.seq + 1
    if not ui_action_active then
        mp.osd_message("IntroDB: " .. text, seconds or 4)
    end
    publish_state()
end

local function clear_confirm()
    if pending_confirm and pending_confirm.timer then pending_confirm.timer:kill() end
    pending_confirm = nil
end

local function clear_marks()
    marks.start_sec, marks.end_sec, marks.episode_key = nil, nil, nil
    marks.type_explicit = false
    marks.by_keyboard = false
    clear_confirm()
end

local function debounced(action)
    local now = mp.get_time()
    if last_action[action] and now - last_action[action] < KEY_DEBOUNCE then return true end
    last_action[action] = now
    return false
end

-- Set the start mark at time t, guessing the type unless it was chosen
local function set_start(t)
    clear_confirm()
    if not marks_current() then marks.end_sec = nil end
    marks.start_sec, marks.episode_key = t, episode_key()
    if not marks.type_explicit then
        local duration = mp.get_property_native("duration") or 0
        set_type((duration > 0 and t > duration * OUTRO_ZONE) and "outro" or "intro")
    end
end

--============================================================================--
--                              SUBMISSION                                    --
--============================================================================--

local function describe_error(status, data, raw)
    if type(data) == "table" and data.error then
        local msg = tostring(data.error)
        if data.reset_at then msg = msg .. " (resets " .. tostring(data.reset_at) .. ")" end
        return msg
    end
    if status == 401 then return "invalid API key" end
    if status == 429 then return "rate limited, try again in 5 minutes" end
    return "HTTP " .. tostring(status) .. ((raw and raw ~= "") and "" or " (empty response)")
end

local function handle_result(req, success, result, err)
    submitting = false
    ui_action_active = req.from_ui
    if not success or not result or not result.stdout or result.stdout == "" then
        mp.msg.warn("IntroDB: submit failed to run - " .. tostring(err or "no output"))
        show("submit failed (helper did not run)", 6, "error")
    else
        local res = utils.parse_json(result.stdout)
        local status = type(res) == "table" and tonumber(res.status) or nil
        if not status then
            mp.msg.warn("IntroDB: submit returned invalid output")
            show("submit failed (invalid helper output)", 6, "error")
        elseif status == 0 then
            mp.msg.warn("IntroDB: submit network error - " .. tostring(res.error))
            show("submit failed: " .. tostring(res.error), 6, "error")
        else
            local data = res.body and utils.parse_json(res.body) or nil
            if status >= 200 and status < 300 then
                local sub_status = type(data) == "table" and type(data.submission) == "table"
                    and data.submission.status or "received"
                mp.msg.info(string.format("IntroDB: submitted %s (HTTP %d, status=%s)",
                    req.label, status, tostring(sub_status)))
                record_submission(req.body, tostring(sub_status))
                clear_marks()
                show(string.format("%s submitted (%s). Thanks!", req.label, sub_status), 5, "success")
                close_after_submit()
                if on_submitted then on_submitted() end
            else
                local msg = describe_error(status, data, res.body)
                mp.msg.warn(string.format("IntroDB: submit rejected (HTTP %d): %s", status, msg))
                show(string.format("submit rejected (HTTP %d): %s", status, msg), 7, "error")
            end
        end
    end
    ui_action_active = false
end

local function do_submit()
    clear_confirm()
    if submitting then
        show("a submission is already in progress", nil, "error")
        return
    end
    local err = availability_error()
    if err then show(err, nil, "error"); return end
    if marks.start_sec and marks.episode_key ~= episode_key() then
        clear_marks()
        show("episode changed, marks cleared", nil, "error")
        return
    end
    local req, invalid = build_request()
    if not req then show(invalid, 6, "error"); return end
    req.from_ui = ui_action_active

    submitting = true
    show("submitting " .. req.label .. "...", 10)
    mp.msg.info("IntroDB: submitting " .. req.label .. " to " .. config.opts.introdb_api_url)

    -- Every argument here is public: the sealed key is useless without the
    -- private exponent in the helper's state file.
    mp.command_native_async({
        name = "subprocess",
        args = { python_exe, "-I", helper_path, "submit", state_path,
                 config.opts.introdb_api_url .. "/submit",
                 submit_cfg.page_pub, submit_cfg.sealed, req.body },
        capture_stdout = true,
        capture_stderr = false,
        playback_only = false,
    }, function(success, result, e) handle_result(req, success, result, e) end)
end

--============================================================================--
--                            KEYBOARD ACTIONS                                --
--============================================================================--

function M.cycle_type()
    if debounced("cycle") then return end
    marks.type_index = marks.type_index % #SEGMENT_TYPES + 1
    marks.type_explicit = true
    -- Keep the start mark so the type can be fixed after marking; redo the end
    marks.end_sec = nil
    clear_confirm()
    local next_step = marks_current()
        and string.format("start %s kept. Mark end with %s", fmt_time(marks.start_sec), key_for("introdb-mark-end"))
        or string.format("Mark start with %s", key_for("introdb-mark-start"))
    show(string.format("segment type: %s. %s", SEGMENT_NAMES[current_type()], next_step))
end

function M.mark_start()
    if debounced("start") then return end
    local err = availability_error()
    if err then show(err, nil, "error"); return end
    local t = current_time()
    if not t then show("no playback position", nil, "error"); return end

    set_start(t)
    marks.end_sec = nil
    marks.by_keyboard = true
    show(string.format("%s start %s. Mark end with %s (%s changes type)",
        SEGMENT_NAMES[current_type()], fmt_time(t), key_for("introdb-mark-end"),
        key_for("introdb-cycle-type")))
end

function M.mark_end()
    if debounced("end") then return end
    local err = availability_error()
    if err then show(err, nil, "error"); return end
    if not marks_current() then
        show(string.format("mark the start first (%s)", key_for("introdb-mark-start")), nil, "error")
        return
    end
    local t = current_time()
    if not t then show("no playback position", nil, "error"); return end

    local previous_end = marks.end_sec
    marks.end_sec = t
    local req, invalid = build_request()
    if not req then
        marks.end_sec = previous_end
        show(invalid, 6, "error")
        return
    end

    clear_confirm()
    pending_confirm = {
        timer = mp.add_timeout(CONFIRM_TIMEOUT, function()
            pending_confirm = nil
            show("submission not confirmed, canceled")
        end),
    }
    show(string.format("submit %s (%.1fs)? Press %s to confirm",
        req.label, req.duration, key_for("introdb-submit")), CONFIRM_TIMEOUT)
end

function M.confirm()
    if debounced("submit") then return end
    if not pending_confirm then
        show(string.format("nothing to submit. Mark start (%s) and end (%s) first",
            key_for("introdb-mark-start"), key_for("introdb-mark-end")), nil, "error")
        return
    end
    do_submit()
end

-- Web key forwarder entry point (keys pressed while the WebView has focus)
local key_actions = {
    ["cycle-type"] = M.cycle_type,
    ["mark-start"] = M.mark_start,
    ["mark-end"] = M.mark_end,
    ["submit"] = M.confirm,
}

--============================================================================--
--                             PANEL ACTIONS                                  --
--============================================================================--

local function nudge(which, delta)
    if not marks_current() then return end
    local key = which == "start" and "start_sec" or "end_sec"
    if not marks[key] then return end
    local duration = mp.get_property_native("duration") or math.huge
    marks[key] = math.max(0, math.min(duration, marks[key] + delta))
    publish_state()
end

local function preview(which)
    local t = which == "start" and marks.start_sec or marks.end_sec
    if not t or not marks_current() then return end
    mp.commandv("seek", tostring(math.max(0, t - PREVIEW_PREROLL)), "absolute+exact")
    mp.set_property_native("pause", false)
end

-- Validate a typed timecode (seconds) against the file length
local function typed_time(arg)
    local t = tonumber(arg)
    local duration = mp.get_property_native("duration")
    if not t or t < 0 or (duration and t > duration) then
        show(string.format("time must be between 0:00.0 and %s", duration and fmt_time(duration) or "the end"),
            nil, "error")
        return nil
    end
    return t
end

local panel_actions = {
    ["set-type"] = function(seg)
        if not SEGMENT_NAMES[seg] then return end
        set_type(seg)
        marks.type_explicit = true
        publish_state()
    end,
    ["mark-start"] = function()
        local t = current_time()
        if not t then show("no playback position", nil, "error"); return end
        set_start(t)
        if marks.end_sec and marks.end_sec <= t then marks.end_sec = nil end
        publish_state()
    end,
    ["mark-end"] = function()
        if not marks_current() then show("mark the start first", nil, "error"); return end
        local t = current_time()
        if not t then show("no playback position", nil, "error"); return end
        marks.end_sec = t
        publish_state()
    end,
    ["set-start"] = function(arg)
        local t = typed_time(arg)
        if not t then return end
        set_start(t)
        if marks.end_sec and marks.end_sec <= t then marks.end_sec = nil end
        publish_state()
    end,
    ["set-end"] = function(arg)
        if not marks_current() then show("set the start first", nil, "error"); return end
        local t = typed_time(arg)
        if not t then return end
        marks.end_sec = t
        publish_state()
    end,
    -- Outros usually run to the last frame
    ["end-of-video"] = function()
        if not marks_current() then show("set the start first", nil, "error"); return end
        local duration = mp.get_property_native("duration")
        if not duration then show("video length unknown", nil, "error"); return end
        marks.end_sec = duration
        publish_state()
    end,
    ["nudge-start"] = function(delta) nudge("start", tonumber(delta) or 0) end,
    ["nudge-end"] = function(delta) nudge("end", tonumber(delta) or 0) end,
    ["preview-start"] = function() preview("start") end,
    ["preview-end"] = function() preview("end") end,
    ["submit"] = do_submit,
    ["clear"] = function()
        clear_marks()
        message.text = nil
        publish_state()
    end,
    -- Load saved times back into the marks: "mine:intro" (this install's
    -- submission) or "live:intro" (what IntroDB has now)
    ["load"] = function(arg)
        local source, seg = tostring(arg):match("^(%a+):(%a+)$")
        local entries = source == "mine" and episode_history() or source == "live" and live_segments() or {}
        local entry = entries[seg or ""]
        if not entry or not SEGMENT_NAMES[seg] then return end
        clear_confirm()
        set_type(seg)
        marks.type_explicit = true
        marks.start_sec, marks.end_sec, marks.episode_key = entry.start_sec, entry.end_sec, episode_key()
        publish_state()
    end,
    ["refresh"] = publish_state,
    -- Panel opened: with no marks in progress, pick Intro or Outro from how
    -- far into the video we are (same cutoff as the start-mark guess)
    ["open"] = function()
        panel_open = true
        if not marks_current() then
            local t = current_time()
            local duration = mp.get_property_native("duration") or 0
            if t and duration > 0 then
                set_type(t > duration * OUTRO_ZONE and "outro" or "intro")
                marks.type_explicit = false
            end
        end
        publish_state()
    end,
    ["close"] = function()
        panel_open = false
    end,
}

local function on_panel_action(action, arg)
    local fn = panel_actions[action]
    if not fn then return end
    local err = action ~= "refresh" and action ~= "clear" and action ~= "open" and action ~= "close"
        and availability_error()
    -- A new action replaces the previous result message (e.g. last "submitted")
    -- and means the user is still working, so it cancels a pending auto-close
    if action ~= "refresh" then
        message.text = nil
        cancel_close()
    end
    ui_action_active = true
    if err then show(err, nil, "error") else fn(arg) end
    ui_action_active = false
end

--============================================================================--
--                          CONFIG & LIFECYCLE                                --
--============================================================================--

-- Handler for introdb-submit-config from mpv-bridge.js: { enabled, page_pub, sealed }
local function on_config(json)
    local data = utils.parse_json(json or "")
    if type(data) ~= "table" then return end
    submit_cfg.enabled = data.enabled == true
    local ok = type(data.page_pub) == "string" and data.page_pub:match("^%x+$")
        and type(data.sealed) == "string" and data.sealed:match("^%x+$")
    submit_cfg.page_pub = ok and data.page_pub or nil
    submit_cfg.sealed = ok and data.sealed or nil
    if not submit_cfg.enabled then clear_marks() end
    mp.msg.info(string.format("IntroDB: submit config enabled=%s, key=%s",
        tostring(submit_cfg.enabled), submit_cfg.sealed and "set" or "missing"))
    publish_state()
end

-- Handler for introdb-validate from mpv-bridge.js: { id, page_pub, sealed } for a
-- key typed in Settings. The answer goes to VALIDATE_PROPERTY as
-- { id, result = "valid" | "invalid" | "unknown", error }.
local function on_validate(json)
    local data = utils.parse_json(json or "")
    if type(data) ~= "table" or type(data.id) ~= "string" or not data.id:match("^[%w_]+$") then return end
    local function reply(result, err)
        mp.set_property_native(VALIDATE_PROPERTY, { id = data.id, result = result, error = err or "" })
    end
    if type(data.page_pub) ~= "string" or not data.page_pub:match("^%x+$")
        or type(data.sealed) ~= "string" or not data.sealed:match("^%x+$") then
        reply("unknown", "invalid validation request")
        return
    end

    mp.command_native_async({
        name = "subprocess",
        args = { python_exe, "-I", helper_path, "validate", state_path,
                 config.opts.introdb_api_url .. "/submit", data.page_pub, data.sealed },
        capture_stdout = true,
        capture_stderr = false,
        playback_only = false,
    }, function(success, result)
        local res = success and result and utils.parse_json(result.stdout or "") or nil
        if type(res) ~= "table" or type(res.result) ~= "string" then
            reply("unknown", "key check failed to run")
            return
        end
        mp.msg.info("IntroDB: API key check result=" .. res.result)
        reply(res.result, res.error)
    end)
end

local function publish_pubkey()
    mp.command_native_async({
        name = "subprocess",
        args = { python_exe, "-I", helper_path, "pubkey", state_path },
        capture_stdout = true,
        capture_stderr = false,
        playback_only = false,
    }, function(success, result)
        local data = success and result and utils.parse_json(result.stdout or "") or nil
        if type(data) == "table" and type(data.pub) == "string" then
            mp.set_property(PUBKEY_PROPERTY, data.pub)
            mp.msg.info("IntroDB: key-exchange public value published")
        else
            mp.msg.warn("IntroDB: could not create key-exchange value; submissions unavailable")
        end
    end)
end

-- True while the user is marking times (panel open, or a keyboard marking in
-- progress), so skip-executor holds off auto-skip until they're done
function M.is_marking()
    return panel_open or (marks.by_keyboard and marks_current())
end

-- Called by main.lua when IntroDB segments arrive, so the panel shows them
function M.refresh()
    publish_state()
end

-- Clear marks when the file or episode changes
function M.reset()
    clear_marks()
    cancel_close()
    message.text = nil
    publish_state()
end

function M.init(opts)
    python_exe = opts.python_exe
    helper_path = opts.helper_path
    state_path = opts.state_path
    history_path = opts.history_path
    on_submitted = opts.on_submitted
    load_history()

    mp.add_key_binding(nil, "introdb-cycle-type", M.cycle_type)
    mp.add_key_binding(nil, "introdb-mark-start", M.mark_start)
    mp.add_key_binding(nil, "introdb-mark-end", M.mark_end)
    mp.add_key_binding(nil, "introdb-submit", M.confirm)

    mp.register_script_message("introdb-submit-config", on_config)
    mp.register_script_message("introdb-key", function(action)
        local fn = key_actions[action]
        if fn then fn() end
    end)
    mp.register_script_message("introdb-ui", on_panel_action)
    mp.register_script_message("introdb-validate", on_validate)
    mp.observe_property("pause", "bool", function(_, paused)
        if paused == false and close.pending then request_close() end
    end)

    publish_state()
    publish_pubkey()
end

return M
