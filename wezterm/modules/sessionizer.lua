-- modules/sessionizer.lua
--
-- Leader+f: fuzzy-pick a project folder and open it as its own workspace
-- (or switch to it if it's already open). Which folders show up is set by
-- `project_roots` in wezterm.lua. Every direct sub-folder of those is listed.

local wezterm = require("wezterm")
local act = wezterm.action

local M = {}

-- read_dir only works on folders, so a successful call means "is a folder".
local function is_dir(path)
  return (pcall(wezterm.read_dir, path))
end

local function list_projects(roots)
  local choices, seen = {}, {}
  for _, root in ipairs(roots) do
    local ok, entries = pcall(wezterm.read_dir, root)
    if ok then
      for _, path in ipairs(entries) do
        local name = path:match("([^/\\]+)$") or path
        if not seen[path] and name:sub(1, 1) ~= "." and is_dir(path) then
          seen[path] = true
          table.insert(choices, { id = path, label = name })
        end
      end
    end
  end
  table.sort(choices, function(a, b) return a.label:lower() < b.label:lower() end)
  return choices
end

local function sessionizer(roots)
  return wezterm.action_callback(function(window, pane)
    local choices = list_projects(roots)
    if #choices == 0 then
      window:toast_notification("Sessionizer",
        "No project folders found. Check project_roots in wezterm.lua.", nil, 4000)
      return
    end
    window:perform_action(act.InputSelector({
      title = "Pick a project",
      choices = choices,
      fuzzy = true,
      action = wezterm.action_callback(function(win, p, id, label)
        if id then
          win:perform_action(act.SwitchToWorkspace({ name = label, spawn = { cwd = id } }), p)
        end
      end),
    }), pane)
  end)
end

function M.apply(config, settings)
  table.insert(config.keys, { key = "f", mods = "LEADER", action = sessionizer(settings.project_roots) })
end

return M
