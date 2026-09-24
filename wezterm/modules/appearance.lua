-- modules/appearance.lua
--
-- Colors, transparency, font, padding and the tab bar look.
-- Most knobs live in the settings table in wezterm.lua; the rest are here.

local wezterm = require("wezterm")
local c = require("modules.palette")
local platform = require("modules.platform")

local M = {}

function M.apply(config, settings)
  config.color_scheme = settings.color_scheme

  -- Keep the scheme's background, but borrow a few accents from the palette.
  config.colors = {
    cursor_bg = c.pink,
    cursor_fg = c.base,
    cursor_border = c.pink,
    selection_bg = c.surface,
    selection_fg = c.text,
    split = c.purple,          -- the line between split panes
    scrollbar_thumb = c.muted,
  }

  -- See-through window. If it looks solid black on Windows, the OpenGL
  -- front end below is usually the fix.
  config.window_background_opacity = settings.opacity
  if settings.blur then
    if platform.is_windows then
      config.win32_system_backdrop = "Acrylic"
    elseif platform.is_mac then
      config.macos_window_background_blur = 20
    end
  end
  if platform.is_windows then
    config.front_end = "OpenGL"
    config.prefer_egl = true
  end
  config.max_fps = 30        -- the blur is the expensive part; 30 is plenty
  config.animation_fps = 60

  -- Keep the normal title bar so you can drag / maximize / close as usual.
  -- Use "RESIZE" instead for a borderless window.
  config.window_decorations = "TITLE | RESIZE"
  config.window_close_confirmation = "NeverPrompt"
  config.window_padding = { left = 18, right = 15, top = 20, bottom = 5 }
  config.automatically_reload_config = true

  -- Font. Ligatures are off (calt/liga=0) so `->` and `!=` look like what you typed.
  config.font = wezterm.font_with_fallback({
    { family = settings.font, harfbuzz_features = { "calt=0", "liga=0" } },
    "Cascadia Code",
    "Symbols Nerd Font Mono",
  })
  config.font_size = settings.font_size
  config.line_height = 1.05
  config.adjust_window_size_when_changing_font_size = false

  -- Flat tab bar at the top, transparent so it blends with the window.
  config.use_fancy_tab_bar = false
  config.tab_bar_at_bottom = false
  config.hide_tab_bar_if_only_one_tab = false
  config.tab_max_width = 28
  config.colors.tab_bar = {
    background = "rgba(0,0,0,0)",
    active_tab = { bg_color = c.surface, fg_color = c.text },
    inactive_tab = { bg_color = "rgba(0,0,0,0)", fg_color = c.muted },
    inactive_tab_hover = { bg_color = c.surface, fg_color = c.text },
    new_tab = { bg_color = "rgba(0,0,0,0)", fg_color = c.muted },
    new_tab_hover = { bg_color = c.surface, fg_color = c.text },
  }
end

return M
