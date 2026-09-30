# Run with: python3 -m unittest discover -s tests
# Covers the parts of iterm/claude_sessions.py that don't need iTerm2 running.
import importlib.util
import json
import os
import sys
import tempfile
import time
import types
import unittest

# The script imports iterm2 at the top; a stub is enough for the pure helpers.
sys.modules.setdefault("iterm2", types.ModuleType("iterm2"))
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location(
    "claude_sessions", os.path.join(HERE, "..", "iterm", "claude_sessions.py"))
cs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cs)


def write_state(d, name, **fields):
    with open(os.path.join(d, name + ".json"), "w") as f:
        json.dump(fields, f)


class ReadStatesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = self.tmp.name
        self.now = time.time()

    def tearDown(self):
        self.tmp.cleanup()

    def ms(self, seconds_ago):
        return (self.now - seconds_ago) * 1000

    def test_maps_iterm_sessions_and_counts(self):
        write_state(self.dir, "a", status="working", updated_at=self.ms(5),
                    iterm_session="w0t0p0:UUID-A")
        write_state(self.dir, "b", status="waiting", updated_at=self.ms(5),
                    iterm_session="w0t1p0:UUID-B")
        write_state(self.dir, "c", status="done", updated_at=self.ms(5),
                    wezterm_pane=3)
        by_session, counts = cs.read_states(self.dir, self.now)
        self.assertEqual(by_session, {"UUID-A": "working", "UUID-B": "waiting"})
        self.assertEqual(counts, {"working": 1, "waiting": 1, "done": 1})

    def test_forgets_old_and_ended_sessions(self):
        write_state(self.dir, "old", status="working", updated_at=self.ms(11 * 60))
        write_state(self.dir, "stale", status="done", updated_at=self.ms(7 * 3600))
        write_state(self.dir, "ended", status="ended", updated_at=self.ms(1))
        write_state(self.dir, "idle", status="idle", updated_at=self.ms(1))
        self.assertEqual(cs.read_states(self.dir, self.now), ({}, {}))

    def test_skips_broken_files_and_missing_dir(self):
        with open(os.path.join(self.dir, "bad.json"), "w") as f:
            f.write("{not json")
        self.assertEqual(cs.read_states(self.dir, self.now), ({}, {}))
        self.assertEqual(cs.read_states(os.path.join(self.dir, "nope"), self.now), ({}, {}))


class FormattingTest(unittest.TestCase):
    def test_counter_text_in_fixed_order(self):
        self.assertEqual(cs.counter_text({"done": 3, "waiting": 1, "working": 2}),
                         "● 1  ✻ 2  ✓ 3")
        self.assertEqual(cs.counter_text({}), "")

    def test_title_gets_icon_and_loses_claudes_spinner(self):
        self.assertEqual(cs.title_text("✳ Fix login bug", "waiting"), "● Fix login bug")
        self.assertEqual(cs.title_text("zsh", ""), "zsh")
        self.assertEqual(cs.title_text(None, "done"), "✓ ")


class SettingsTest(unittest.TestCase):
    def test_defaults_when_file_missing(self):
        s = cs.load_settings("/nonexistent/iterm.json")
        self.assertEqual(s["panel_side"], "Right")
        self.assertAlmostEqual(s["panel_width"], 0.3)
        self.assertTrue(s["dashboard_dir"].endswith(os.path.join(".claude", "dashboard")))

    def test_file_overrides_defaults(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump({"node": "/opt/homebrew/bin/node", "panel_side": "Left"}, f)
        try:
            s = cs.load_settings(f.name)
            self.assertEqual(s["node"], "/opt/homebrew/bin/node")
            self.assertEqual(s["panel_side"], "Left")
            self.assertAlmostEqual(s["panel_width"], 0.3)
        finally:
            os.unlink(f.name)

    def test_panel_command_quotes_paths(self):
        cmd = cs.panel_command({"node": "/usr/local/bin/node", "dashboard_dir": "/Users/me/my dash"})
        self.assertEqual(cmd, "/usr/local/bin/node '/Users/me/my dash/dash.js'")


if __name__ == "__main__":
    unittest.main()
