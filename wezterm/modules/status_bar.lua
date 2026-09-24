-- modules/status_bar.lua
--
-- The right side of the tab bar, left to right:
--   LEADER badge (while Ctrl+a is held) · extra segments · git branch · workspace · clock
--
-- Other modules can add their own piece with status_bar.add_segment(fn).
-- fn gets (window, pane) and returns a list of wezterm.format() cells.
-- The claude module uses this for its session counts.

local wezterm = require("wezterm")
local c = require("modules.palette")

local M = {}
local extra = {}

function M.add_segment(fn)
  table.insert(extra, fn)
end

-- The pane's working directory as a plain path (or nil).
local function pane_cwd(pane)
  local uri = pane and pane:get_current_working_dir()
  if not uri then return nil end
  local path
  if type(uri) == "userdata" then
    path = uri.file_path                             -- newer WezTerm
  else
    path = tostring(uri):gsub("^file://[^/]*", "")   -- older WezTerm
  end
  if not path then return nil end
  path = path:gsub("^/([A-Za-z]:)", "%1")            -- /C:/foo -> C:/foo
  return (path:gsub("[/\\]+$", ""))
end

-- Current git branch, cached for 3 seconds per folder so we don't run git
-- on every redraw.
local git_cache = {}
local function git_branch(pane)
  local cwd = pane_cwd(pane)
  if not cwd then return nil end
  local now = os.time()
  local hit = git_cache[cwd]
  if hit and now - hit.t < 3 then return hit.branch end

  local branch
  local ok, out = wezterm.run_child_process({ "git", "-C", cwd, "rev-parse", "--abbrev-ref", "HEAD" })
  if ok and out then
    branch = out:gsub("%s+$", "")
    if branch == "HEAD" then -- detached HEAD: show the short hash instead
      local ok2, sha = wezterm.run_child_process({ "git", "-C", cwd, "rev-parse", "--short", "HEAD" })
      branch = ok2 and ("@" .. sha:gsub("%s+$", "")) or nil
    elseif branch == "" then
      branch = nil
    end
  end
  git_cache[cwd] = { branch = branch, t = now }
  return branch
end

local function badge(cells, text, bg)
  table.insert(cells, { Foreground = { Color = c.base } })
  table.insert(cells, { Background = { Color = bg } })
  table.insert(cells, { Text = "  " .. text .. "  " })
  table.insert(cells, "ResetAttributes")
end

local function update(window, pane)
  local cells = {}

  if window:leader_is_active() then
    badge(cells, "LEADER", c.yellow)
  elseif window:active_key_table() then
    badge(cells, window:active_key_table():upper(), c.cyan) -- copy_mode, search_mode...
  end

  for _, fn in ipairs(extra) do
    local ok, seg = pcall(fn, window, pane)
    if ok and seg then
      for _, cell in ipairs(seg) do table.insert(cells, cell) end
    end
  end

  local branch = git_branch(pane)
  if branch then
    table.insert(cells, { Foreground = { Color = c.green } })
    table.insert(cells, { Text = "   " .. branch .. "  " })
  end

  table.insert(cells, { Foreground = { Color = c.purple } })
  table.insert(cells, { Text = " " .. window:active_workspace() .. "  " })
  table.insert(cells, { Foreground = { Color = c.muted } })
  table.insert(cells, { Text = "│ " .. wezterm.strftime("%a %b %-d  %H:%M") .. "  " })

  window:set_right_status(wezterm.format(cells))
end

function M.apply(config, settings)
  wezterm.on("update-status", update)
end

return M
