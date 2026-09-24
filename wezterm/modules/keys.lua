-- modules/keys.lua
--
-- General shortcuts: splits, pane movement, tabs, zoom, fullscreen.
-- Feature-specific keys (Claude panel, sessionizer, clipboard) live in their
-- own modules, next to the code they trigger.
--
-- "LEADER" means: press the leader (Ctrl+a by default), release, then the key.

local wezterm = require("wezterm")
local act = wezterm.action

local M = {}

function M.apply(config, settings)
  config.leader = settings.leader

  local keys = {
    -- Splits
    { key = "|", mods = "LEADER|SHIFT", action = act.SplitHorizontal({ domain = "CurrentPaneDomain" }) },
    { key = "-", mods = "LEADER", action = act.SplitVertical({ domain = "CurrentPaneDomain" }) },
    { key = "x", mods = "LEADER", action = act.CloseCurrentPane({ confirm = true }) },

    -- Move between panes
    { key = "LeftArrow", mods = "LEADER", action = act.ActivatePaneDirection("Left") },
    { key = "RightArrow", mods = "LEADER", action = act.ActivatePaneDirection("Right") },
    { key = "UpArrow", mods = "LEADER", action = act.ActivatePaneDirection("Up") },
    { key = "DownArrow", mods = "LEADER", action = act.ActivatePaneDirection("Down") },

    -- Tabs
    { key = "t", mods = "CTRL", action = act.SpawnTab("CurrentPaneDomain") },
    { key = "w", mods = "CTRL", action = act.CloseCurrentTab({ confirm = false }) },
    { key = "c", mods = "LEADER", action = act.SpawnTab("CurrentPaneDomain") },
    { key = "n", mods = "LEADER", action = act.ActivateTabRelative(1) },
    { key = "p", mods = "LEADER", action = act.ActivateTabRelative(-1) },

    -- Workspaces you already have open
    { key = "s", mods = "LEADER", action = act.ShowLauncherArgs({ flags = "WORKSPACES|FUZZY" }) },
    { key = "Space", mods = "LEADER", action = act.ShowLauncher },

    -- File manager on the left (needs yazi installed; delete this if you don't use it)
    { key = "e", mods = "LEADER", action = act.SplitPane({
      direction = "Left", size = { Percent = 30 }, command = { args = { "yazi" } },
    }) },

    -- Font size
    { key = "=", mods = "CTRL", action = act.IncreaseFontSize },
    { key = "-", mods = "CTRL", action = act.DecreaseFontSize },
    { key = "0", mods = "CTRL", action = act.ResetFontSize },

    -- Fullscreen
    { key = "F11", mods = "NONE", action = act.ToggleFullScreen },
    { key = "Enter", mods = "ALT", action = act.ToggleFullScreen },
  }

  -- Ctrl+1 .. Ctrl+9 jumps straight to that tab
  for i = 1, 9 do
    table.insert(keys, { key = tostring(i), mods = "CTRL", action = act.ActivateTab(i - 1) })
  end

  for _, k in ipairs(keys) do table.insert(config.keys, k) end

  -- Ctrl+Shift + drag moves the window (handy with a borderless window)
  table.insert(config.mouse_bindings, {
    event = { Drag = { streak = 1, button = "Left" } },
    mods = "CTRL|SHIFT",
    action = act.StartWindowDrag,
  })
end

return M
