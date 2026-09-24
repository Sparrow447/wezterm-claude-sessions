-- modules/clipboard.lua
--
-- Copy/paste that behaves like a normal Windows app:
--   Ctrl+C        copies if something is selected, otherwise cancels as usual
--   Ctrl+V        pastes
--   Ctrl+Shift+V  pastes an IMAGE (Windows only, see below)

local wezterm = require("wezterm")
local act = wezterm.action
local platform = require("modules.platform")

local M = {}

-- Terminals can't paste pictures. This saves the clipboard image to a PNG
-- and types the file path instead, which Claude Code picks up as an image.
-- Great after Win+Shift+S.
local SAVE_CLIPBOARD_IMAGE = [==[
  Add-Type -AssemblyName System.Windows.Forms, System.Drawing
  $img = [System.Windows.Forms.Clipboard]::GetImage()
  if ($null -eq $img) { exit 1 }
  $dir = Join-Path $env:USERPROFILE '.cache\wezterm-clips'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $path = Join-Path $dir ('clip-{0}.png' -f (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
  $img.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  [Console]::Out.Write($path)
]==]

local function paste_image()
  return wezterm.action_callback(function(window, pane)
    local ok, stdout = wezterm.run_child_process({
      "powershell.exe", "-NoProfile", "-NonInteractive", "-STA", "-Command", SAVE_CLIPBOARD_IMAGE,
    })
    local path = ok and stdout and stdout:gsub("%s+$", "") or ""
    if path ~= "" then
      window:perform_action(act.SendString(path .. " "), pane)
    else
      window:toast_notification("WezTerm", "No image on the clipboard", nil, 3000)
    end
  end)
end

local function smart_copy()
  return wezterm.action_callback(function(window, pane)
    local sel = window:get_selection_text_for_pane(pane)
    if sel and sel ~= "" then
      window:perform_action(act.CopyTo("ClipboardAndPrimarySelection"), pane)
      window:perform_action(act.ClearSelection, pane)
    else
      window:perform_action(act.SendKey({ key = "c", mods = "CTRL" }), pane)
    end
  end)
end

function M.apply(config, settings)
  table.insert(config.keys, { key = "c", mods = "CTRL", action = smart_copy() })
  table.insert(config.keys, { key = "v", mods = "CTRL", action = act.PasteFrom("Clipboard") })
  if platform.is_windows then
    table.insert(config.keys, { key = "v", mods = "CTRL|SHIFT", action = paste_image() })
  end
end

return M
