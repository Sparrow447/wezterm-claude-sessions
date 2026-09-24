# wezterm-claude-sessions

My WezTerm setup, with a live side panel that shows every [Claude Code](https://claude.com/claude-code) session I have running: which ones are working, which ones are waiting for me, what each one is doing, and how many tokens they've used.

Press **Ctrl+a** then **d** and the panel opens on the right of your tab. Each card is one Claude Code session: what you asked for, what it is doing right now, how full its context is, and roughly what it has cost. The box at the bottom shows your plan usage limits.

Tabs running Claude also get a status icon in their title, and the status bar keeps a count (`● 1  ✻ 2  ✓ 3`), so you can see at a glance when something needs you.

Want to see it before installing anything? Run `node dashboard/dash.js --demo` in any terminal.

## What's in here

```
wezterm/                  the WezTerm config, split into one file per feature
  wezterm.lua             start here: all the main settings are at the top
  modules/
    appearance.lua        colors, transparency, font, tab bar
    palette.lua           the Dracula colors used everywhere
    shell.lua             which shell new tabs open
    keys.lua              splits, tabs, pane movement, zoom
    clipboard.lua         Ctrl+C / Ctrl+V like a normal app, plus image paste
    sessionizer.lua       Leader+f: jump to a project folder as a workspace
    claude.lua            Leader+d panel, tab icons, status bar counts
    status_bar.lua        leader badge, git branch, workspace, clock

dashboard/                the Claude Code side (Node.js, no dependencies)
  hook.js                 Claude Code runs this on every event and it saves the session's status
  dash.js                 the panel itself
  statusline.js           saves plan limits / context size for the panel
  config.js               currency, colors, refresh rate
  pricing.js              API prices per model, used for the cost estimate
  demo.js                 made-up sessions for --demo

install.js                copies dashboard/ into place and sets up the hooks
```

## Install

You need [WezTerm](https://wezfurlong.org/wezterm/), [Node.js](https://nodejs.org/) 18+ and Claude Code. The font is [JetBrainsMono Nerd Font](https://www.nerdfonts.com/font-downloads). Any font works, but the icons look best with a Nerd Font.

```sh
git clone https://github.com/Sparrow447/wezterm-claude-sessions
cd wezterm-claude-sessions

# 1. Claude Code side: copies the scripts to ~/.claude/dashboard and adds
#    the hooks to ~/.claude/settings.json (it makes a backup first)
node install.js --dry-run   # optional: see what it would change
node install.js

# 2. WezTerm side: copy the config folder
#    macOS / Linux:
mkdir -p ~/.config/wezterm && cp -r wezterm/* ~/.config/wezterm/
#    Windows (PowerShell):
#    mkdir ~/.config/wezterm -Force; cp -r wezterm/* ~/.config/wezterm/
```

If you already have a `~/.wezterm.lua`, rename it to something like `~/.wezterm.lua.old`. WezTerm reads `~/.config/wezterm/wezterm.lua` first, so it would be ignored anyway, but renaming it makes it clear which config is in use.

Restart WezTerm, start a new Claude Code session, then press **Ctrl+a**, **d**.

**Only want the panel, not my whole config?** Copy `modules/claude.lua`, `modules/status_bar.lua` and `modules/palette.lua` into your own config folder and add these lines to your `wezterm.lua`:

```lua
package.path = wezterm.config_dir .. "/?.lua;" .. package.path
config.keys = config.keys or {}
require("modules.claude").apply(config, {
  claude = { dashboard_dir = wezterm.home_dir .. "/.claude/dashboard" },
})
require("modules.status_bar").apply(config, {})
```

## Customizing

Most things are in the `settings` table at the top of `wezterm/wezterm.lua`:

| Want to...                         | Change                                          |
|------------------------------------|-------------------------------------------------|
| Use a different color scheme       | `color_scheme`, then the colors in `palette.lua` |
| Make it solid / more see-through   | `opacity` (1.0 = solid)                          |
| Turn off the blur                  | `blur = false`                                   |
| Change the font                    | `font`, `font_size`                              |
| Use a different leader key         | `leader`                                         |
| Pick which folders Leader+f lists  | `project_roots`                                  |
| Make the panel wider / put it left | `claude.panel_width`, `claude.panel_side`        |

To **turn a feature off**, comment out its `require(...)` line at the bottom of `wezterm.lua`. To **add your own**, make a new file in `modules/` with an `apply(config, settings)` function and require it in the same place. Shortcuts go in `config.keys` with `table.insert`, and a status bar piece goes in with `require("modules.status_bar").add_segment(fn)`.

The panel's own settings live in `~/.claude/dashboard/config.js` (reinstalling won't overwrite it):

- `currency` / `locale`: show costs in `"EUR"`, `"NOK"`, `"GBP"` and so on. The exchange rate is fetched twice a day.
- `recentHours`: how far back the default view goes
- `colors`: match these to your terminal theme

The status icons and colors for tabs and the status bar are at the top of `modules/claude.lua`.

## Panel keys

| Key       | Does                                                      |
|-----------|-----------------------------------------------------------|
| ↑ ↓ / j k | select a session                                          |
| 1 – 9     | select that session and jump to its tab                   |
| Enter     | jump to the selected session's tab                        |
| x         | close the session's pane (asks first), or hide it from the list |
| a         | switch between recent sessions and all of them            |
| q         | close the panel                                           |

## Other shortcuts

Leader is **Ctrl+a**: press it, let go, then press the key.

| Keys                | Does                                  |
|---------------------|---------------------------------------|
| Leader, d           | toggle the Claude panel (also Ctrl+Shift+D) |
| Leader, f           | pick a project, open it as a workspace |
| Leader, s           | switch between open workspaces        |
| Leader, \| / -      | split side by side / top and bottom   |
| Leader, arrows      | move between panes                    |
| Leader, x           | close pane                            |
| Leader, e           | yazi file manager on the left         |
| Ctrl+t / Ctrl+w     | new tab / close tab                   |
| Ctrl+1 … 9          | go to tab                             |
| Ctrl+Shift+V        | paste a screenshot as an image path (Windows) |
| F11                 | fullscreen                            |

## How it works

Claude Code has [hooks](https://docs.claude.com/en/docs/claude-code/hooks): commands it runs when things happen (you send a prompt, it uses a tool, it needs permission, it finishes). `install.js` points all of them at `hook.js`, which writes a small JSON file per session into `~/.claude/dashboard/state/`, along with the WezTerm pane the session is running in.

`dash.js` reads those files every second. It also reads Claude Code's own transcripts in `~/.claude/projects` for token counts, the model and your prompts. On the WezTerm side, `claude.lua` reads the same state files for the tab icons and status bar counts.

Nothing leaves your machine. The one exception is the exchange rate lookup, and that only happens if you set a currency other than USD.

The cost shown is what the tokens would cost at API prices. If you're on a Claude subscription, that's not what you pay. It just gives a sense of scale.

## Notes

- Built and used daily on Windows 11. macOS and Linux should work (the paths and commands are cross-platform), but I haven't tested them as much.
- Opened a lot of sessions before installing? The panel still finds them from their transcripts. It just can't show live status until they're restarted with the hooks.

## License

MIT
