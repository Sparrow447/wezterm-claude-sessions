#!/usr/bin/env python3
# claude_sessions.py - the iTerm2 side of the Claude Code dashboard.
# The iTerm2 twin of wezterm/modules/claude.lua:
#   * claude_toggle_panel opens/closes the sessions panel (dash.js) in a split.
#     Bind a key to it in Settings > Keys > Key Bindings > "Invoke Script Function":
#       claude_toggle_panel(session_id: id)
#     (Not a Ctrl key grabbed by this script: terminals send Ctrl+Shift+D as
#     plain Ctrl+D, so whenever the script isn't running it would quit Claude.)
#   * each session running Claude gets a status icon in its title
#     (pick "Claude status" under Profiles > General > Title)
#   * a "Claude sessions" status bar component shows  ● 1  ✻ 2  ✓ 3
#
# How it knows: Claude Code hooks run hook.js, which writes one small JSON
# file per session into <dashboard_dir>/state, including the iTerm2 session
# id. This script reads those files once a second.
#
# install.js copies this into ~/Library/Application Support/iTerm2/Scripts/AutoLaunch
# and writes its settings to ~/.claude/dashboard/iterm.json.
import asyncio
import json
import os
import shlex
import time

import iterm2

# Icons per status. Change them here and both titles and the status bar pick it up.
ICONS = {"working": "✻", "waiting": "●", "done": "✓", "error": "✕"}
COUNTER_ORDER = ("waiting", "working", "done")

# How long before a status is considered old news and hidden (seconds).
FORGET_WORKING_AFTER = 10 * 60
FORGET_DONE_AFTER = 6 * 3600

SETTINGS_FILE = os.path.expanduser("~/.claude/dashboard/iterm.json")
DEFAULTS = {
    "dashboard_dir": os.path.expanduser("~/.claude/dashboard"),
    "node": "node",
    "panel_width": 0.3,   # fraction of the tab
    "panel_side": "Right",  # or "Left"
}
STATUS_VAR = "user.claude_status"
PANEL_VAR = "user.claude_panel"
PANEL_TITLE = "Claude Sessions"  # dash.js sets this as its title


# ---------------------------------------------------------------- pure helpers
def load_settings(path=SETTINGS_FILE):
    try:
        with open(path) as f:
            return {**DEFAULTS, **json.load(f)}
    except (OSError, ValueError):
        return dict(DEFAULTS)


def panel_command(settings):
    dash = os.path.join(settings["dashboard_dir"], "dash.js")
    return f"{shlex.quote(settings['node'])} {shlex.quote(dash)}"


def _live_status(s, now):
    st = s.get("status")
    age = now - (s.get("updated_at") or 0) / 1000
    if st in (None, "ended", "idle"):
        return None
    if st in ("working", "error") and age > FORGET_WORKING_AFTER:
        return None
    if st == "done" and age > FORGET_DONE_AFTER:
        return None
    return st


def read_states(state_dir, now):
    """-> ({iterm session uuid: status}, {status: count})"""
    by_session, counts = {}, {}
    try:
        names = os.listdir(state_dir)
    except OSError:
        return by_session, counts
    for name in names:
        if not name.endswith(".json"):
            continue
        try:
            with open(os.path.join(state_dir, name)) as f:
                s = json.load(f)
        except (OSError, ValueError):
            continue
        st = _live_status(s, now) if isinstance(s, dict) else None
        if not st:
            continue
        counts[st] = counts.get(st, 0) + 1
        sid = s.get("iterm_session")
        if sid:
            by_session[str(sid).split(":", 1)[-1]] = st
    return by_session, counts


def counter_text(counts):
    return "  ".join(f"{ICONS[st]} {counts[st]}" for st in COUNTER_ORDER if counts.get(st))


def title_text(title, status):
    title = title or ""
    if not status:
        return title
    # Drop Claude Code's own spinner glyph ("✳ Fix bug" -> "Fix bug").
    parts = title.split(" ", 1)
    if len(parts) == 2 and parts[0] and not parts[0].isascii():
        title = parts[1]
    return f"{ICONS.get(status, '')} {title}"


def panel_action(panel_tab_id, current_tab_id):
    """One panel for all tabs: it already lists every session, so a second
    copy in another tab would just repeat it."""
    if panel_tab_id is None:
        return "open"
    return "close" if panel_tab_id == current_tab_id else "focus"


# ---------------------------------------------------------------- iTerm2 glue
async def is_panel(session):
    if session.name and PANEL_TITLE in session.name:
        return True
    return await session.async_get_variable(PANEL_VAR) == "1"


async def resize_panel(tab, main, panel, width):
    # iTerm2 has no "split at 30%", so ask for sizes in cells and relayout.
    total = main.grid_size.width + panel.grid_size.width
    want = max(20, int(total * width))
    panel.preferred_size = iterm2.Size(want, panel.grid_size.height)
    main.preferred_size = iterm2.Size(total - want, main.grid_size.height)
    await tab.async_update_layout()


async def find_panel(app):
    for window in app.terminal_windows:
        for tab in window.tabs:
            for s in tab.sessions:
                if await is_panel(s):
                    return s
    return None


async def toggle_panel(app, session_id, settings):
    session = app.get_session_by_id(session_id)
    if not session or not session.tab:
        return
    tab = session.tab
    panel = await find_panel(app)
    action = panel_action(panel.tab.tab_id if panel else None, tab.tab_id)
    if action == "close":
        await panel.async_send_text("q")  # dash.js quits on "q" and the pane closes with it
        return
    if action == "focus":
        await panel.async_activate()  # selects its tab and brings its window forward
        return
    profile = iterm2.LocalWriteOnlyProfile()
    profile.set_use_custom_command("Yes")
    profile.set_command(panel_command(settings))
    panel = await session.async_split_pane(
        vertical=True, before=settings["panel_side"] == "Left", profile_customizations=profile)
    await panel.async_set_variable(PANEL_VAR, "1")
    try:
        await resize_panel(tab, session, panel, float(settings["panel_width"]))
    except Exception as e:  # sizing is cosmetic; never lose the panel over it
        print(f"claude_sessions: couldn't size panel: {e}")
    await session.async_activate()  # keep typing where you were


async def sync_status_vars(app, state_dir):
    # Tag each session with its Claude status; the title provider reads it.
    shown = {}
    while True:
        by_session, _ = read_states(state_dir, time.time())
        for window in app.terminal_windows:
            for tab in window.tabs:
                for s in tab.sessions:
                    st = by_session.get(s.session_id, "")
                    if shown.get(s.session_id) != st:
                        shown[s.session_id] = st
                        await s.async_set_variable(STATUS_VAR, st)
        await asyncio.sleep(1)


async def main(connection):
    app = await iterm2.async_get_app(connection)
    settings = load_settings()
    state_dir = os.path.join(settings["dashboard_dir"], "state")

    @iterm2.TitleProviderRPC
    async def claude_title(auto_name=iterm2.Reference("autoName?"),
                           status=iterm2.Reference(STATUS_VAR + "?")):
        return title_text(auto_name, status)

    await claude_title.async_register(
        connection, display_name="Claude status",
        unique_identifier="com.github.sparrow447.claude-sessions.title")

    component = iterm2.StatusBarComponent(
        short_description="Claude sessions",
        detailed_description="Claude Code sessions that need you / are working / are done",
        knobs=[], exemplar="● 1  ✻ 2  ✓ 3", update_cadence=1,
        identifier="com.github.sparrow447.claude-sessions.counter")

    @iterm2.StatusBarRPC
    async def claude_counter(knobs):
        return counter_text(read_states(state_dir, time.time())[1])

    await component.async_register(connection, claude_counter)

    @iterm2.RPC
    async def claude_toggle_panel(session_id=iterm2.Reference("id")):
        await toggle_panel(app, session_id, settings)

    await claude_toggle_panel.async_register(connection)

    await sync_status_vars(app, state_dir)


if __name__ == "__main__":
    iterm2.run_forever(main)
