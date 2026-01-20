--[[
  @name Skip Toast
  @description OSD toast overlay for skip notifications in MPV
  @version 3.1
  @author allecsc
  
  @changelog
    v1.x - Original uosc-based element system
    v2.0 - Consolidated into single self-contained module
    v3.0 - Renamed to SkipToast, moved to modules/
    v3.1 - Dynamic hint text support (confirmation prompts)
  
  Usage:
    local skip_toast = require('modules/skip-toast')
    skip_toast:init(osd_overlay)
    skip_toast:update_display(width, height)
    skip_toast:set_message("Skip Intro", true, "Press Tab")
    skip_toast:hide()
--]]

local assdraw = require('mp.assdraw')

--============================================================================--
--                              UTILITIES                                     --
--============================================================================--

local function round(number) return math.floor(number + 0.5) end
local function clamp(min, value, max) return math.max(min, math.min(value, max)) end
local function opacity_to_alpha(opacity) return 255 - math.ceil(255 * opacity) end

--============================================================================--
--                           ASS DRAWING HELPERS                              --
--============================================================================--

local ass_mt = getmetatable(assdraw.ass_new())

-- Opacity tag generation
function ass_mt.opacity(self, opacity, fraction)
    fraction = fraction ~= nil and fraction or 1
    opacity = type(opacity) == 'table' and opacity or {main = opacity}
    local text = ''
    if opacity.main then
        text = text .. string.format('\\alpha&H%X&', opacity_to_alpha(opacity.main * fraction))
    end
    if opacity.primary then
        text = text .. string.format('\\1a&H%X&', opacity_to_alpha(opacity.primary * fraction))
    end
    if opacity.border then
        text = text .. string.format('\\3a&H%X&', opacity_to_alpha(opacity.border * fraction))
    end
    if opacity.shadow then
        text = text .. string.format('\\4a&H%X&', opacity_to_alpha(opacity.shadow * fraction))
    end
    if self == nil then
        return text
    elseif text ~= '' then
        self.text = self.text .. '{' .. text .. '}'
    end
end

-- Text rendering
function ass_mt:txt(x, y, align, value, opts)
    local border_size = opts.border or 0
    local shadow_size = opts.shadow or 0
    local tags = '\\pos(' .. x .. ',' .. y .. ')\\rDefault\\an' .. align .. '\\blur0'
    tags = tags .. '\\fn' .. (opts.font or 'mpv-osd')
    tags = tags .. '\\fs' .. opts.size
    if opts.bold then tags = tags .. '\\b1' end
    if opts.italic then tags = tags .. '\\i1' end
    tags = tags .. '\\bord' .. border_size
    tags = tags .. '\\shad' .. shadow_size
    if opts.shadow_x then tags = tags .. '\\xshad' .. opts.shadow_x end
    if opts.shadow_y then tags = tags .. '\\yshad' .. opts.shadow_y end
    tags = tags .. '\\1c&H' .. (opts.color or 'FFFFFF')
    if border_size > 0 then tags = tags .. '\\3c&H' .. (opts.border_color or '000000') end
    if shadow_size > 0 or opts.shadow_x or opts.shadow_y then 
        tags = tags .. '\\4c&H' .. (opts.shadow_color or '000000') 
    end
    if opts.opacity then tags = tags .. self.opacity(nil, opts.opacity) end
    if opts.clip then tags = tags .. opts.clip end
    self:new_event()
    self.text = self.text .. '{' .. tags .. '}' .. value
end

-- Rectangle rendering
function ass_mt:rect(ax, ay, bx, by, opts)
    opts = opts or {}
    local border_size = opts.border or 0
    local tags = '\\pos(0,0)\\rDefault\\an7\\blur0'
    tags = tags .. '\\bord' .. border_size
    tags = tags .. '\\1c&H' .. (opts.color or 'FFFFFF')
    if border_size > 0 then tags = tags .. '\\3c&H' .. (opts.border_color or '000000') end
    if opts.opacity then tags = tags .. self.opacity(nil, opts.opacity) end
    if opts.border_opacity and border_size > 0 then
        tags = tags .. string.format('\\3a&H%X&', opacity_to_alpha(opts.border_opacity))
    end
    if opts.clip then tags = tags .. opts.clip end
    self:new_event()
    self.text = self.text .. '{' .. tags .. '}'
    self:draw_start()
    if opts.radius and opts.radius > 0 then
        self:round_rect_cw(ax, ay, bx, by, opts.radius)
    else
        self:rect_cw(ax, ay, bx, by)
    end
    self:draw_stop()
end

--============================================================================--
--                            SKIP TOAST                                       --
--============================================================================--

local SkipToast = {
    -- State
    message = "",
    is_prompt = false,
    hint_text = "Press Tab",
    visible = false,
    
    -- Coordinates
    ax = 0, ay = 0, bx = 0, by = 0,
    scale = 1,
    
    -- Display info
    display = {width = 1920, height = 1080, initialized = false},
    
    -- OSD overlay
    osd = nil,
}

function SkipToast:init(osd_overlay)
    self.osd = osd_overlay
end

function SkipToast:update_display(width, height)
    self.display.width = width
    self.display.height = height
    self.display.initialized = true
    self:update_dimensions()
end

function SkipToast:update_dimensions()
    if not self.display.initialized then return end

    local base_height = 1080
    self.scale = self.display.height / base_height

    -- Netflix-style positioning: bottom right
    local margin = 80 * self.scale
    local button_width = 200 * self.scale
    local button_height = 60 * self.scale

    self.ax = self.display.width - button_width - margin
    self.ay = self.display.height - button_height - margin - (80 * self.scale)
    self.bx = self.display.width - margin
    self.by = self.display.height - margin - (80 * self.scale)
end

function SkipToast:set_message(message, is_prompt, hint_text)
    self.message = message or ""
    self.is_prompt = is_prompt or false
    self.hint_text = hint_text or "Press Tab"
    self.visible = self.message ~= ""
    self:update_dimensions()
    self:render()
end

function SkipToast:hide()
    self.message = ""
    self.visible = false
    if self.osd then
        self.osd.data = ""
        self.osd:update()
    end
end

function SkipToast:render()
    if not self.visible or not self.osd then return end

    local ass = assdraw.ass_new()

    -- Colors
    local bg_color = '000000'
    local border_color = 'f55b7b'  -- Purple accent (BGR)
    local text_color = 'FFFFFF'
    local shadow_color = '000000'

    -- Subtle outer glow
    ass:rect(self.ax - 2 * self.scale, self.ay - 2 * self.scale,
             self.bx + 2 * self.scale, self.by + 2 * self.scale, {
        color = border_color,
        opacity = 0.12,
        border = 0,
        radius = 14 * self.scale,
    })

    -- Main background
    ass:rect(self.ax, self.ay, self.bx, self.by, {
        color = bg_color,
        opacity = 0.85,
        border = 1 * self.scale,
        border_color = border_color,
        border_opacity = 0.35,
        radius = 12 * self.scale,
    })

    -- Text styling
    local font_size = 36 * self.scale
    local x = round((self.ax + self.bx) / 2)
    local y = round((self.ay + self.by) / 2)

    -- Main text
    ass:txt(x, y, 5, self.message, {
        size = font_size,
        color = text_color,
        opacity = 0.9,
        bold = true,
        shadow_y = 2 * self.scale,
        shadow_color = shadow_color,
    })

    -- "(Press Tab)" hint
    if self.is_prompt then
        local tab_font_size = font_size * 0.5
        local tab_y = y + (font_size * 0.55)

        ass:txt(x, tab_y, 5, self.hint_text, {
            size = tab_font_size,
            color = text_color,
            opacity = 0.5,
            bold = false,
            shadow_y = 1.5 * self.scale,
            shadow_color = shadow_color,
        })
    end

    self.osd.res_x = self.display.width
    self.osd.res_y = self.display.height
    self.osd.data = ass.text
    self.osd.z = 2000
    self.osd:update()
end

return SkipToast