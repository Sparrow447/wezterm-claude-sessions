-- wezterm.lua
--
-- Entry point. Everything you'd normally want to change is in the `settings`
-- table right below. The actual work happens in the files under modules/,
-- one feature per file. To turn a feature off, comment out its require line
-- at the bottom of this file.
--
-- Install: copy this whole folder to ~/.config/wezterm/ (so this file ends up
-- at ~/.config/wezterm/wezterm.lua and the modules at ~/.config/wezterm/modules/).

local wezterm = require("wezterm")

-- Let `require("modules.x")` find files next to this one, wherever it lives.
package.path = wezterm.config_dir .. "/?.lua;" .. package.path

local home = wezterm.home_dir

local settings = {
  -- Looks ------------------------------------------------------------------
  color_scheme = "Dracula",       -- any built-in scheme name works
  opacity = 0.7,                  -- 1.0 = solid, lower = more see-through
  blur = true,                    -- frosted glass (Acrylic on Windows, blur on macOS)
  font = "JetBrainsMono Nerd Font",
  font_size = 13.0,

  -- Keys -------------------------------------------------------------------
  -- Leader works like tmux: press Ctrl+a, let go, then press the next key.
  leader = { key = "a", mods = "CTRL", timeout_milliseconds = 1000 },

  -- Sessionizer (Leader+f) -------------------------------------------------
  -- Folders whose sub-folders show up in the project picker.
  project_roots = {
    home .. "/projects",
    home .. "/dev",
    home .. "/source/repos",
    home .. "/.config",
  },

  -- Claude Code panel (Leader+d) -------------------------------------------
  claude = {
    -- Where install.js put hook.js / dash.js. Change it if you moved them.
    -- Can also be set with the CLAUDE_DASHBOARD_DIR environment variable.
    dashboard_dir = os.getenv("CLAUDE_DASHBOARD_DIR") or (home .. "/.claude/dashboard"),
    panel_width = 0.3,            -- share of the tab the panel takes
    panel_side = "Right",         -- "Right" or "Left"
  },
}

local config = wezterm.config_builder()
config.keys = {}            -- modules add their own shortcuts to this list
config.mouse_bindings = {}

-- Features. Order doesn't matter much, except that status_bar should come
-- after anything that adds a segment to it (like claude).
require("modules.appearance").apply(config, settings)
require("modules.shell").apply(config, settings)
require("modules.keys").apply(config, settings)
require("modules.clipboard").apply(config, settings)
require("modules.sessionizer").apply(config, settings)
require("modules.claude").apply(config, settings)
require("modules.status_bar").apply(config, settings)

return config
