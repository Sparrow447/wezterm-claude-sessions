// terminal.js - what the panel needs from the terminal it runs in:
// find the pane/session a Claude Code chat is in, jump to it, close it,
// and open a new tab to resume one. One adapter per terminal.
//
//   find(state, cb, { lastAct, strict })  -> cb({ id, title } | null)
//   focus(pane)  close(pane)  spawn(cwd, argv, cb)
//
// hook.js stores both WEZTERM_PANE and ITERM_SESSION_ID, so whichever
// terminal you're in, the panel can find your chats.
const { execFile } = require("child_process");

// Which terminal are we in? config.terminal ("wezterm" | "iterm") wins.
function detect(env = process.env, forced) {
  if (forced === "wezterm" || forced === "iterm") return forced;
  if (env.TERM_PROGRAM === "iTerm.app" || env.ITERM_SESSION_ID) return "iterm";
  return "wezterm";
}

// ITERM_SESSION_ID looks like "w0t1p0:6F2A...". The part after the colon is
// the session's unique id, which AppleScript and the Python API both use.
function itermUuid(id) {
  if (!id) return null;
  const s = String(id);
  return s.slice(s.indexOf(":") + 1) || null;
}

// Quote for sh: 'it'\''s' survives any folder name.
const shq = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

// ---------------------------------------------------------------- iTerm2
// Every script takes its inputs through argv, so nothing from a session file
// or a folder name is ever pasted into AppleScript source.
const EACH_SESSION = (body) => `on run argv
  set target to item 1 of argv
  tell application "iTerm2"
    repeat with w in windows
      repeat with t in tabs of w
        repeat with s in sessions of t
          if unique id of s is target then
            ${body}
          end if
        end repeat
      end repeat
    end repeat
  end tell
  return ""
end run`;

const AS_FIND = EACH_SESSION("return name of s");
const AS_FOCUS = EACH_SESSION(`select w
            tell t to select
            tell s to select
            activate
            return "ok"`);
const AS_CLOSE = EACH_SESSION(`tell s to close
            return "ok"`);
const AS_SPAWN = `on run argv
  tell application "iTerm2"
    if (count of windows) is 0 then
      set newTab to current tab of (create window with default profile)
    else
      tell current window to set newTab to (create tab with default profile)
    end if
    tell current session of newTab
      write text (item 1 of argv)
      return unique id
    end tell
  end tell
end run`;

function iterm(exec) {
  const osa = (script, args, cb = () => {}) =>
    exec("osascript", ["-e", script, ...args], (err, out) => cb(err, String(out || "").trim()));
  return {
    name: "iTerm2",
    find(state, cb) {
      const id = itermUuid(state && state.iterm_session);
      if (!id) return cb(null);
      osa(AS_FIND, [id], (err, title) => cb(!err && title ? { id, title } : null));
    },
    focus(p) { osa(AS_FOCUS, [p.id]); },
    close(p) { osa(AS_CLOSE, [p.id]); },
    spawn(cwd, argv, cb) {
      osa(AS_SPAWN, [`cd ${shq(cwd)} && ${argv.map(shq).join(" ")}`], (err, id) => cb(err, id ? { id } : null));
    },
  };
}

// ---------------------------------------------------------------- WezTerm
// WezTerm pane ids restart at 0 when WezTerm restarts, so only trust a stored
// pane id if the session was active after the current WezTerm process started.
function weztermStartTime(exec, cb) {
  const done = (err, out) => cb(err ? 0 : Date.parse(String(out).trim()) || 0);
  if (process.platform === "win32") {
    exec("powershell.exe", ["-NoProfile", "-Command",
      "(Get-Process wezterm-gui | Sort-Object StartTime | Select-Object -First 1).StartTime.ToString('o')"], done);
  } else {
    exec("sh", ["-c", 'ps -o lstart= -p "$(pgrep -o wezterm-gui)"'], done);
  }
}

function wezterm(exec, startedAt) {
  let started = startedAt || 0;
  if (startedAt == null) weztermStartTime(exec, (t) => { started = t; });
  const cli = (args, cb = () => {}) => exec("wezterm", ["cli", ...args], cb);
  return {
    name: "WezTerm",
    // strict: also give up when we don't know when WezTerm started (used before killing a pane).
    find(state, cb, { lastAct = 0, strict = false } = {}) {
      const id = state && state.wezterm_pane != null ? Number(state.wezterm_pane) : null;
      if (id == null) return cb(null);
      if (started ? lastAct <= started : strict) return cb(null);
      cli(["list", "--format", "json"], (err, out) => {
        let panes = [];
        try { panes = err ? [] : JSON.parse(out); } catch {}
        const p = panes.find((x) => x.pane_id === id);
        cb(p ? { id: p.pane_id, tab: p.tab_id, title: p.title } : null);
      });
    },
    focus(p) {
      cli(["activate-tab", "--tab-id", String(p.tab)], () => cli(["activate-pane", "--pane-id", String(p.id)]));
    },
    close(p) { cli(["kill-pane", "--pane-id", String(p.id)]); },
    spawn(cwd, argv, cb) {
      cli(["spawn", "--cwd", cwd, "--", ...argv], (err, out) => {
        const pane = String(out || "").trim();
        if (!err && pane) cli(["activate-pane", "--pane-id", pane]);
        cb(err);
      });
    },
  };
}

// opts.exec and opts.startedAt are for tests.
function create(kind, { exec = execFile, startedAt } = {}) {
  return kind === "iterm" ? iterm(exec) : wezterm(exec, startedAt);
}

module.exports = { detect, itermUuid, create };
