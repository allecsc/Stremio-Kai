--[[
    hacky port of mpv balance property to lavfi pan

    unlike mpv it should also change the volume to
    the surround and back lateral channels

    might be broken with "6.1" channel layout, since it can use
    either back or surround laterals


    input.conf default bindings:

    )       script-binding  balance-to-left
    =       script-binding  balance-to-right
    ?       script-binding  reset-balance

    <key>   script-message <script-name> <value between -1.0 and 1.0>

    # 'balance-to-left' is equivalent to "script-message <script-name> -0.1"
    # 'balance-to-right' is equivalent to "script-message <script-name> 0.1"

--]]

options = require 'mp.options'

local opts = {
    forcelayout = "",
        -- if empty, will use the same layout as the original audio
    left  = 0.5,
    right = 0.5
}

options.read_options(opts)

local left = opts.left
local right = opts.right

local function add_left_channel(left_ch_name, right_ch_name)
    return string.format("%s=%.1f*%s+%.1f*%s",
        left_ch_name,
        math.max(0,math.min(1,left*2)), left_ch_name,
        math.max(0,math.min(1,(right-0.5)*2)), right_ch_name)
end

local function add_right_channel(left_ch_name, right_ch_name)
    return string.format("%s=%.1f*%s+%.1f*%s",
        right_ch_name,
        math.max(0,math.min(1,(left-0.5)*2)), left_ch_name,
        math.max(0,math.min(1,right*2)), right_ch_name)
end

local function update_filter()
    local graph = {}
    local channels =
        opts.forcelayout ~= "" and opts.forcelayout or
        mp.get_property('audio-params/hr-channels', 'stereo')
    if channels == "mono" then
        return
    end

    graph[1] = add_left_channel('FL', 'FR')
    graph[2] = add_right_channel('FL', 'FR')

    if channels == "3.0" or
        channels == "3.0(back)" or
        channels == "3.1" or
        channels == "5.0" or
        channels == "5.0(side)" or
        channels == "4.1" or
        channels == "5.1" or
        channels == "5.1(side)" or
        channels == "6.0" or
        channels == "6.0(front)" or
        channels == "hexagonal" or
        channels == "6.1" or
        channels == "7.0" or
        channels == "7.0(front)" or
        channels == "7.1" or
        channels == "7.1(wide)" or
        channels == "7.1(side-side)" or
        channels == "octagonal" then
        graph[#graph+1] = 'FC=FC'
    end

    if channels == "2.1" or
        channels == "3.1" or
        channels == "4.1" or
        channels == "5.1" or
        channels == "5.1(side)" or
        channels == "6.1" or
        channels == "6.1(front)" or
        channels == "7.1" or
        channels == "7.1(wide)" or
        channels == "7.1(side-side)" then
        graph[#graph+1] = 'LFE=LFE'
    end

    if channels == "3.0(back)" or
        channels == "4.0" or
        channels == "4.1" or
        channels == "6.0" or
        channels == "hexagonal" or
        channels == "6.1" or
        channels == "6.1(back)" or
        channels == "octagonal" then
        graph[#graph+1] = 'BC=BC'
    end

    if channels == "quad" or
        channels == "5.0" or
        channels == "5.1" or
        channels == "hexagonal" or
        channels == "6.1(back)" or
        channels == "7.0" or
        channels == "7.1" or
        channels == "7.1(wide)" or
        channels == "octagonal" then
        graph[#graph+1] = add_left_channel('BL', 'BR')
        graph[#graph+1] = add_right_channel('BL', 'BR')
    end

    if channels == "quad(side)" or
        channels == "5.0(side)" or
        channels == "5.1(side)" or
        channels == "hexagonal" or
        channels == "6.0" or
        channels == "6.0(front)" or
        channels == "6.1" or
        channels == "6.1(front)" or
        channels == "7.0" or
        channels == "7.0(front)" or
        channels == "7.1" or
        channels == "7.1(wide-side)" or
        channels == "octagonal" then
        graph[#graph+1] = add_left_channel('SL', 'SR')
        graph[#graph+1] = add_right_channel('SL', 'SR')
    end

    if channels == "6.0(front)" or
        channels == "6.1(front)" or
        channels == "7.0(front)" or
        channels == "7.1(wide)" or
        channels == "7.1(wide-side)" then
        graph[#graph+1] = add_left_channel('FLC', 'FRC')
        graph[#graph+1] = add_right_channel('FLC', 'FRC')
    end

    mp.command(string.format('no-osd af add @balance:lavfi=[pan=%s|%s]',
        channels, table.concat(graph, "|")))

    mp.commandv('show-text',
        string.format('Audio Balance (pan): Left: %.0f%% Right: %.0f%%',
            left*100, right*100))
end

local function change_balance(val)
    val = tonumber(val)
    if not val or (val > 1 or val < -1) then
        mp.msg.warn("Parameter should be a number between -1.0 and 1.0 (was "..val..")")
        return
    end
    left  = math.max(0,math.min(1,left + val * -1))
    right = math.max(0,math.min(1,right + val))
    update_filter()
end

mp.register_script_message(mp.get_script_name(), change_balance)

-- shift+9 and shift+0 in Portuguese layout
mp.add_key_binding(";", 'balance-to-left', function() change_balance(-0.05); end, { repeatable = true })
mp.add_key_binding("\\", 'balance-to-right', function() change_balance(0.05); end, { repeatable = true })

mp.add_key_binding("'", 'balance-reset', function()
    mp.command('no-osd af del @balance')
    left = 0.5
    right = 0.5
end)
