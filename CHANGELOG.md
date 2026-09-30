# Changelog

## 2026-09-30

### Added
- **iTerm2 support.** The panel works in iTerm2 too: Enter jumps to a chat's tab, `x` closes it and closed chats resume in a new tab, all through AppleScript. `node install.js --iterm` also installs an iTerm2 script with a panel toggle you bind to a key (`claude_toggle_panel`), a "Claude status" tab title with status icons, and a "Claude sessions" status bar component (`● 1  ✻ 2  ✓ 3`).
- `terminal` option in `config.js` to force `"wezterm"` or `"iterm"` if detection guesses wrong.
- Tests: `node --test tests/*.test.js` and `python3 -m unittest discover -s tests`.

### Changed
- The WezTerm-specific parts of `dash.js` moved into `dashboard/terminal.js`, behind a small adapter shared by both terminals.

## 2026-09-27

### Added
- **Resume closed chats.** Enter (or 1–9) on a session that isn't open anymore runs `claude --resume <id>` in a new tab, in the session's folder. Set `claudeCommand` in `config.js` to change what gets run.
- **Small panel layouts.** The panel now fits itself to its pane instead of spilling over:
  - under 40 rows, only the selected session shows a full card
  - under 30 rows, the usage box becomes a single line with cost and plan limits
  - under 14 rows or 26 columns, each session is one line
  - narrow panels get shorter labels, key help and reset times
  - the selected card shrinks until it fits, so it's always visible

### Fixed
- Closing or hiding a session with `x` no longer jumps you back to the top of the list. The selection moves to the next card and the list keeps its scroll position.
- Scrolling keeps its place: moving up and down only scrolls when the selected card would leave the view.
- A pane closed from the panel no longer comes back as "ended" for a few minutes when its SessionEnd hook fires.

## 2026-09-24

- First release: WezTerm config with a live Claude Code sessions panel.
