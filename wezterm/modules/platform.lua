-- modules/platform.lua
--
-- Small helpers so the rest of the config can ask "am I on Windows?" without
-- repeating the check.

local wezterm = require("wezterm")

local M = {}

M.is_windows = wezterm.target_triple:find("windows") ~= nil
M.is_mac = wezterm.target_triple:find("darwin") ~= nil

-- True if a file exists and can be opened.
function M.exists(path)
  local f = io.open(path, "r")
  if f then f:close() return true end
  return false
end

return M
