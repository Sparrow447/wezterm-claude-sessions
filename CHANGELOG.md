# Changelog

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
