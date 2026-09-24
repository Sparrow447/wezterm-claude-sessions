-- modules/shell.lua
--
-- Which shell new tabs open, plus a few terminal behaviour defaults.

local platform = require("modules.platform")

local M = {}

function M.apply(config, settings)
  config.scrollback_lines = 10000
  config.audible_bell = "Disabled"
  config.default_cursor_style = "BlinkingBar"

  -- On Windows, prefer PowerShell 7 and fall back to the built-in one.
  -- On macOS/Linux WezTerm already uses your login shell, so nothing to do.
  if platform.is_windows then
    local pwsh = (os.getenv("ProgramFiles") or "C:/Program Files") .. "/PowerShell/7/pwsh.exe"
    if platform.exists(pwsh) then
      config.default_prog = { "pwsh.exe", "-NoLogo" }
    else
      config.default_prog = { "powershell.exe", "-NoLogo" }
    end
  end

  -- Want something else? For example WSL:
  -- config.default_prog = { "wsl.exe", "~" }
end

return M
