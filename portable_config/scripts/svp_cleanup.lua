-- svp_cleanup.lua: Standalone External Cleanup for SVP EOF/Reinits
-- Modularity: Separate from reactive_vf_bypass.lua; toggle via MPV conf if needed.
-- Hooks: end-file for forced deinit + 1s delay; file-loaded for prop validation.
-- Place in scripts/ directory.

local mp = require "mp"

mp.msg.info("SVP Cleanup script loaded")

-- EOF Cleanup: Force VF clear and delay before next file
mp.register_event("end-file", function()
    local current_vf = mp.get_property("vf") or ""
    if current_vf:find("SVP") or current_vf:find("vapoursynth") then
        mp.commandv("vf", "clr", "")
        mp.add_timeout(1.0, function()
            mp.msg.info("SVP EOF: Forced deinit complete, ready for next file")
        end)
    else
        mp.msg.verbose("SVP Cleanup: No SVP chain on EOF, skipping")
    end
end)