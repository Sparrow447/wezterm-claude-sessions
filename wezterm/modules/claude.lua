-- modules/claude.lua
--
-- The WezTerm side of the Claude Code dashboard:
--   * Leader+d (or Ctrl+Shift+D) opens/closes the sessions panel (dash.js)
--   * each tab running Claude gets a status icon in its title
--   * the status bar shows how many sessions need you / are working / are done
--
-- How it knows: Claude Code hooks run hook.js, which writes one small JSON
-- file per session into <dashboard_dir>/state. This module just reads those.

local wezterm = require("wezterm")
local c = require("modules.palette")
local status_bar = require("modules.status_bar")

local M = {}

-- Icons and colors per status. Change them here and both the tab titles
-- and the status bar pick it up.
M.icons = { working = "✻", waiting = "●", done = "✓", error = "✕" }
M.colors = { working = c.orange, waiting = c.yellow, done = c.green, error = c.red }

-- How long before a status is considered old news and hidden (seconds).
local FORGET_WORKING_AFTER = 10 * 60
local FORGET_DONE_AFTER = 6 * 3600

local state_dir
local cache = { panes = {}, counts = {}, t = 0 }

-- Read every session file, at most once per second.
local function refresh()
  local now = os.time()
  if now == cache.t then return end
  cache.t = now

  local panes, counts = {}, {}
  local ok, files = pcall(wezterm.read_dir, state_dir)
  for _, file in ipairs(ok and files or {}) do
    if file:sub(-5) == ".json" then
      local fh = io.open(file, "r")
      local body = fh and fh:read("*a")
      if fh then fh:close() end
      local okj, s = pcall(wezterm.json_parse, body or "")
      if okj and type(s) == "table" and s.status then
        local age = now - (s.updated_at or 0) / 1000
        local st = s.status
        if st == "ended" or st == "idle" then st = nil
        elseif (st == "working" or st == "error") and age > FORGET_WORKING_AFTER then st = nil
        elseif st == "done" and age > FORGET_DONE_AFTER then st = nil end
        if st then
          counts[st] = (counts[st] or 0) + 1
          if s.wezterm_pane then panes[tostring(s.wezterm_pane)] = st end
        end
      end
    end
  end
  cache.panes, cache.counts = panes, counts
end

-- Is this pane the dashboard? On Windows the pane title is just "node.exe",
-- so we remember the panes we opened and also look at the command line.
local panel_ids = {}
local function is_panel(pane)
  if panel_ids[pane:pane_id()] or pane:get_title() == "Claude Sessions" then return true end
  local ok, info = pcall(function() return pane:get_foreground_process_info() end)
  if ok and info and info.argv then
    for _, arg in ipairs(info.argv) do
      if arg:find("dash%.js") then return true end
    end
  end
  return false
end

local function toggle_panel(opts)
  return wezterm.action_callback(function(window, pane)
    for _, p in ipairs(window:active_tab():panes()) do
      if is_panel(p) then
        panel_ids[p:pane_id()] = nil
        p:send_text("q") -- dash.js quits on "q" and the pane closes with it
        return
      end
    end
    local panel = pane:split({
      direction = opts.panel_side or "Right",
      size = opts.panel_width or 0.3,
      args = { "node", opts.dashboard_dir .. "/dash.js" },
    })
    panel_ids[panel:pane_id()] = true
    pane:activate() -- keep typing where you were
  end)
end

-- Put the status icon in front of the tab title.
local function format_tab_title(tab, _, _, _, _, max_width)
  refresh()
  local title = tab.tab_title
  if not title or #title == 0 then title = tab.active_pane.title end
  local st = cache.panes[tostring(tab.active_pane.pane_id)]
  if st then title = title:gsub("^[\128-\255]+%s+", "") end -- drop Claude's own spinner glyph
  local room = max_width - (st and 5 or 2)
  if #title > room then title = wezterm.truncate_right(title, room - 1) .. "…" end
  if not st then return " " .. title .. " " end
  return {
    { Foreground = { Color = M.colors[st] } },
    { Text = " " .. M.icons[st] .. " " },
    "ResetAttributes",
    { Text = title .. " " },
  }
end

-- " ● 1  ✻ 2  ✓ 3 " in the status bar.
local function status_segment()
  refresh()
  local cells = {}
  for _, st in ipairs({ "waiting", "working", "done" }) do
    local n = cache.counts[st]
    if n then
      table.insert(cells, { Foreground = { Color = M.colors[st] } })
      table.insert(cells, { Text = " " .. M.icons[st] .. " " .. n .. " " })
    end
  end
  return cells
end

function M.apply(config, settings)
  local opts = settings.claude
  state_dir = opts.dashboard_dir .. "/state"

  table.insert(config.keys, { key = "d", mods = "LEADER", action = toggle_panel(opts) })
  table.insert(config.keys, { key = "D", mods = "CTRL|SHIFT", action = toggle_panel(opts) })
  wezterm.on("format-tab-title", format_tab_title)
  status_bar.add_segment(status_segment)
end

return M
