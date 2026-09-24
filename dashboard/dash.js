#!/usr/bin/env node
// dash.js - the Claude Code sessions panel that runs in a WezTerm side pane.
//
// Where the data comes from:
//   status / what it's doing  -> state/<session>.json, written by hook.js
//   tokens, model, your asks  -> Claude Code's own transcripts in ~/.claude/projects
//   plan limits, context size -> statusline/<session>.json, saved by statusline.js
//
// Keys: ↑↓ or j/k select · enter jump to pane · 1-9 jump · x close · a all/recent · q quit
//
// Try it without Claude running:  node dash.js --demo
// Print a single frame and exit:   node dash.js --frame 48 40
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { DASH_DIR, STATE_DIR, PROJECTS_DIR, describe, short } = require("./lib");
const { usageCostUSD, formatCost } = require("./pricing");
const config = require("./config");

const DEMO = process.argv.includes("--demo");
const REFRESH_MS = config.refreshMs || 1000;
const CONTEXT_LIMITS = config.contextLimits || [200_000, 1_000_000];
const DISMISSED_FILE = path.join(DASH_DIR, "dismissed.json");
// Copies of each session's status-line input (saved by the statusLine command
// in settings.json): real context window size, Claude Code's cost, plan limits.
const STATUSLINE_DIR = path.join(DASH_DIR, "statusline");
// "a" toggles between recent sessions and every session on disk (grouped by day last used).
const RECENT_HOURS = config.recentHours || 6;
let windowHours = RECENT_HOURS;
const showAll = () => windowHours === Infinity;
const winLabel = (h) => (h === Infinity ? "All" : "Recent");

// Day bucket for grouping: 0 = today, 1 = yesterday, ...
function dayIndex(ts) {
  const d = new Date(ts); d.setHours(0, 0, 0, 0);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((t - d) / 86400e3);
}
function dayLabel(ts) {
  const i = dayIndex(ts);
  if (i <= 0) return "Today";
  if (i === 1) return "Yesterday";
  if (i < 7) return "Last 7 days";
  if (i < 30) return "Last 30 days";
  return "Older";
}

// ---------------------------------------------------------------- palette
// Colors come from config.js. The background is left alone so the
// terminal's transparency shows through.
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(";");
const fg = (h) => `\x1b[38;2;${hex(h)}m`;
const P = config.colors;
const RESET = "\x1b[0m", BOLD = "\x1b[1m", ITALIC = "\x1b[3m";
const SPIN = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];
const STATUS = {
  waiting: { icon: "●", color: P.yellow, label: "needs you" },
  working: { icon: null, color: P.orange, label: "working" },
  error: { icon: "✕", color: P.red, label: "error" },
  done: { icon: "✓", color: P.green, label: "done" },
  idle: { icon: "○", color: P.faint, label: "idle" },
  stale: { icon: "◌", color: P.faint, label: "stale" },
  ended: { icon: "■", color: P.faint, label: "ended" },
};
const ORDER = ["waiting", "working", "error", "done", "idle", "stale", "ended"];

// ---------------------------------------------------------------- formatting
function num(n) {
  n = n || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + "k";
  return String(n);
}
function dur(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  return `${Math.floor(h / 24)}d`;
}
function ago(ts) {
  if (!ts) return "";
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.max(1, dayIndex(ts))}d ago`; // calendar days, matches the day headings
}
// Word-wrap text to at most maxLines lines of width w (last line gets "…").
function wrap(text, w, maxLines) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let cur = "";
  for (const word of words) {
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= w) cur += " " + word;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, Math.max(0, w - 1)) + "…";
  }
  return lines.map((l) => (l.length > w ? l.slice(0, w - 1) + "…" : l));
}

// One line from [text, color, style] parts, truncated to w, padded to w.
// right: optional [text, color] flushed to the right edge.
function row(parts, w, right) {
  const rw = right ? right[0].length + 1 : 0;
  const lim = Math.max(0, w - rw);
  let out = "", used = 0;
  for (const [t, c, style] of parts) {
    if (used >= lim) break;
    let txt = String(t);
    if (used + txt.length > lim) txt = txt.slice(0, Math.max(0, lim - used - 1)) + "…";
    out += (style || "") + fg(c || P.text) + txt + RESET;
    used += txt.length;
  }
  if (right && used + right[0].length <= w) {
    out += " ".repeat(w - used - right[0].length) + fg(right[1] || P.muted) + right[0] + RESET;
    used = w;
  }
  return out + " ".repeat(Math.max(0, w - used));
}

// Rounded box; rows are arrays of parts or {parts, right}.
function box(rows, W, color) {
  const bc = fg(color || P.border);
  const inner = W - 4;
  const out = [" " + bc + "╭" + "─".repeat(W - 4) + "╮" + RESET + " "];
  for (const r of rows) {
    const parts = Array.isArray(r) ? r : r.parts;
    const right = Array.isArray(r) ? null : r.right;
    out.push(" " + bc + "│" + RESET + row([[" ", P.text], ...parts], inner - 1, right) + " " + bc + "│" + RESET + " ");
  }
  out.push(" " + bc + "╰" + "─".repeat(W - 4) + "╯" + RESET + " ");
  return out;
}
function bar(frac, width, color) {
  const n = Math.max(0, Math.min(width, Math.round(frac * width)));
  return [["━".repeat(n), color], ["━".repeat(width - n), P.border]];
}

// ---------------------------------------------------------------- transcripts
const parsers = new Map(); // file -> parser state

function newParser() {
  return {
    offset: 0, mtime: 0, msgs: new Map(),
    inp: 0, out: 0, cr: 0, cw: 0, usd: 0, ctx: 0, calls: 0,
    model: "", effort: "", title: "", cwd: "", branch: "", turns: 0,
    firstAsk: "", lastAsk: "",
    lastTool: "", lastType: "", lastStop: "", outEvents: [],
  };
}

// The user's own words from a transcript user entry (skips tool results,
// slash-command wrappers, system reminders and interrupts).
function userText(o) {
  if (o.isMeta || o.isSidechain) return "";
  const c = o.message && o.message.content;
  let t = "";
  if (typeof c === "string") t = c;
  else if (Array.isArray(c)) {
    if (c.some((x) => x && x.type === "tool_result")) return "";
    t = c.filter((x) => x && x.type === "text").map((x) => x.text).join(" ");
  }
  t = t.trim();
  if (!t || t.startsWith("<") || t.startsWith("[Request interrupted") || t.startsWith("Caveat:")) return "";
  return t.replace(/\s+/g, " ");
}

function ingest(p, o) {
  if (o.type === "ai-title" && o.aiTitle) p.title = o.aiTitle;
  if (o.type === "custom-title" && o.customTitle) p.title = o.customTitle;
  if (o.cwd) p.cwd = o.cwd;
  if (o.gitBranch) p.branch = o.gitBranch;
  const ts = o.timestamp ? Date.parse(o.timestamp) : 0;

  if (o.type === "assistant" && o.message) {
    const m = o.message;
    if (m.model && !m.model.startsWith("<")) p.model = m.model;
    if (o.effort) p.effort = o.effort;
    const u = m.usage;
    if (u) {
      // Usage repeats on every content block of the same message: dedupe by id.
      const id = m.id || o.requestId || o.uuid;
      const cur = {
        i: u.input_tokens || 0, o: u.output_tokens || 0,
        cr: u.cache_read_input_tokens || 0, cw: u.cache_creation_input_tokens || 0,
        usd: usageCostUSD(m.model, u),
      };
      const prev = p.msgs.get(id);
      if (prev) { p.inp -= prev.i; p.out -= prev.o; p.cr -= prev.cr; p.cw -= prev.cw; p.usd -= prev.usd; }
      else p.calls++;
      p.msgs.set(id, cur);
      p.inp += cur.i; p.out += cur.o; p.cr += cur.cr; p.cw += cur.cw; p.usd += cur.usd;
      p.ctx = cur.i + cur.cr + cur.cw;
      const d = cur.o - (prev ? prev.o : 0);
      if (ts && d > 0) p.outEvents.push([ts, d]);
    }
    if (Array.isArray(m.content)) {
      for (const c of m.content) if (c.type === "tool_use") p.lastTool = describe(c.name, c.input);
    }
    if (m.stop_reason) p.lastStop = m.stop_reason;
    p.lastType = "assistant";
  } else if (o.type === "user" && o.message) {
    const c = o.message.content;
    const toolResult = Array.isArray(c) && c.some((x) => x && x.type === "tool_result");
    const text = userText(o);
    if (text) {
      p.turns++;
      if (!p.firstAsk) p.firstAsk = text;
      p.lastAsk = text;
    }
    p.lastType = toolResult ? "tool_result" : "user";
    if (!toolResult) p.lastStop = "";
  }
}

function parse(file) {
  let p = parsers.get(file);
  if (!p) parsers.set(file, (p = newParser()));
  let st;
  try { st = fs.statSync(file); } catch { return p; }
  if (st.size < p.offset) Object.assign(p, newParser()); // rewritten
  p.mtime = st.mtimeMs;
  if (st.size === p.offset) return p;
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const len = st.size - p.offset;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, p.offset);
    const nl = buf.lastIndexOf(10); // only consume complete lines
    if (nl >= 0) {
      p.offset += nl + 1;
      for (const l of buf.subarray(0, nl + 1).toString("utf8").split("\n")) {
        if (!l.trim()) continue;
        try { ingest(p, JSON.parse(l)); } catch {}
      }
    }
  } catch {} finally { if (fd !== undefined) fs.closeSync(fd); }
  const cutoff = Date.now() - 5 * 60e3;
  while (p.outEvents.length && p.outEvents[0][0] < cutoff) p.outEvents.shift();
  return p;
}

// Subagent transcripts live next to the session: <dir>/<sessionId>/subagents/*.jsonl
function subagentTotals(transcript, sid) {
  const t = { inp: 0, out: 0, cr: 0, cw: 0, usd: 0, n: 0 };
  const dir = path.join(path.dirname(transcript), sid, "subagents");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")); } catch { return t; }
  for (const f of files) {
    const p = parse(path.join(dir, f));
    t.inp += p.inp; t.out += p.out; t.cr += p.cr; t.cw += p.cw; t.usd += p.usd; t.n++;
  }
  return t;
}

// ---------------------------------------------------------------- discovery
function readJSON(f) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } }
let dismissed = readJSON(DISMISSED_FILE) || {}; // session id -> dismissed-at ms

function discover() {
  const now = Date.now();
  dismissed = readJSON(DISMISSED_FILE) || dismissed; // pick up edits made outside the panel
  const win = windowHours * 3600e3;
  const found = new Map();
  const skip = new Set();

  let files = [];
  try { files = fs.readdirSync(STATE_DIR).filter((f) => f.endsWith(".json")); } catch {}
  for (const f of files) {
    const s = readJSON(path.join(STATE_DIR, f));
    if (!s || !s.session_id) continue;
    if (s.status === "ended") {
      skip.add(s.session_id);
      const age = now - (s.ended_at || s.updated_at || 0);
      if (age > 24 * 3600e3) try { fs.unlinkSync(path.join(STATE_DIR, f)); } catch {}
      if (age > 5 * 60e3) continue;
    }
    found.set(s.session_id, { id: s.session_id, state: s, transcript: s.transcript_path });
  }

  // Sessions without hook state (started before hooks were installed).
  let projects = [];
  try { projects = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch {}
  for (const d of projects) {
    const dir = path.join(PROJECTS_DIR, d.name);
    let fl = [];
    try { fl = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")); } catch { continue; }
    for (const f of fl) {
      const id = f.slice(0, -6);
      const full = path.join(dir, f);
      if (skip.has(id)) continue;
      const cur = found.get(id);
      if (cur) { if (!cur.transcript) cur.transcript = full; continue; }
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      if (now - st.mtimeMs <= win) found.set(id, { id, state: null, transcript: full });
    }
  }

  const out = [];
  for (const s of found.values()) {
    const p = s.transcript ? parse(s.transcript) : newParser();
    const lastAct = Math.max(p.mtime || 0, (s.state && s.state.updated_at) || 0);
    if (now - lastAct > win && !(s.state && s.state.status === "waiting")) continue;
    if (dismissed[s.id] && lastAct <= dismissed[s.id] + 2000) continue; // hidden until it's active again
    s.p = p;
    s.sub = s.transcript ? subagentTotals(s.transcript, s.id) : { inp: 0, out: 0, cr: 0, cw: 0, usd: 0, n: 0 };
    s.lastAct = lastAct;
    s.status = resolveStatus(s.state, p, now);
    s.sl = readJSON(path.join(STATUSLINE_DIR, `${s.id}.json`));
    out.push(s);
  }
  // Newest day first; within a day, sessions needing attention first, then most recent.
  out.sort((a, b) => dayIndex(a.lastAct) - dayIndex(b.lastAct) ||
    ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || b.lastAct - a.lastAct);
  return out;
}

function resolveStatus(s, p, now) {
  if (s && s.status) {
    let st = s.status;
    const lastAct = Math.max(s.updated_at || 0, p.mtime || 0);
    if (st === "working" && now - lastAct > 10 * 60e3) st = "stale";
    // Transcript moved on after the hook said "done" (e.g. a missed hook).
    if ((st === "done" || st === "idle") && p.mtime > (s.updated_at || 0) + 5000 &&
        now - p.mtime < 60e3 && p.lastStop !== "end_turn") st = "working";
    return st;
  }
  const ended = p.lastType === "assistant" && p.lastStop === "end_turn";
  if (now - (p.mtime || 0) < 90e3) return ended ? "done" : "working";
  return ended ? "done" : "idle";
}

// ---------------------------------------------------------------- closing sessions
// WezTerm pane ids restart at 0 when WezTerm restarts, so only trust a stored
// pane id if the session was active after the current WezTerm process started.
// If we can't tell when WezTerm started, "x" just hides sessions instead.
let weztermStart = 0;
const onStart = (err, out) => { if (!err) weztermStart = Date.parse(String(out).trim()) || 0; };
if (DEMO) {
  // nothing to close in demo mode
} else if (process.platform === "win32") {
  execFile("powershell.exe", ["-NoProfile", "-Command",
    "(Get-Process wezterm-gui | Sort-Object StartTime | Select-Object -First 1).StartTime.ToString('o')"], onStart);
} else {
  execFile("sh", ["-c", 'ps -o lstart= -p "$(pgrep -o wezterm-gui)"'], onStart);
}

function listPanes(cb) {
  execFile("wezterm", ["cli", "list", "--format", "json"], (err, out) => {
    try { cb(err ? [] : JSON.parse(out)); } catch { cb([]); }
  });
}

function dismiss(s) {
  dismissed[s.id] = Date.now();
  try { fs.writeFileSync(DISMISSED_FILE, JSON.stringify(dismissed)); } catch {}
}

function markEnded(s) {
  const f = path.join(STATE_DIR, `${s.id}.json`);
  const st = readJSON(f);
  if (!st) return;
  st.status = "ended";
  st.activity = "Closed from panel";
  st.ended_at = st.updated_at = Date.now();
  try { fs.writeFileSync(f, JSON.stringify(st)); } catch {}
}

// Prepare a close: find the session's live pane (if any) and ask to confirm.
function requestClose(s) {
  const paneId = s.state && s.state.wezterm_pane != null ? Number(s.state.wezterm_pane) : null;
  const trusted = paneId != null && weztermStart && s.lastAct > weztermStart && s.status !== "ended";
  const label = short(s.p.title || s.p.firstAsk || "session", 28);
  if (!trusted) {
    confirm = { s, pane: null, text: `Hide "${label}" from the list?` };
    draw();
    return;
  }
  listPanes((panes) => {
    const pane = panes.find((p) => p.pane_id === paneId);
    confirm = pane
      ? { s, pane: paneId, text: `Close pane ${paneId} (${short(pane.title, 20)}) running "${label}"?` }
      : { s, pane: null, text: `Pane is gone. Hide "${label}"?` };
    draw();
  });
}

function doClose() {
  const c = confirm;
  confirm = null;
  if (!c) return;
  if (c.pane != null) {
    execFile("wezterm", ["cli", "kill-pane", "--pane-id", String(c.pane)], () => {});
    markEnded(c.s);
  }
  dismiss(c.s);
  flash = c.pane != null ? `Closed pane ${c.pane}` : "Hidden";
  flashAt = Date.now();
  refresh();
}

// ---------------------------------------------------------------- render
let tick = 0;
let sessions = [];
let selectedId = null;
let confirm = null; // { s, pane, text }
let flash = "", flashAt = 0;

function projectName(cwd) {
  if (!cwd) return "?";
  if (path.resolve(cwd).toLowerCase() === path.resolve(os.homedir()).toLowerCase()) return "home";
  return path.basename(cwd);
}
// claude-opus-5-5 -> "Opus 5.5", claude-haiku-4-5-20251001 -> "Haiku 4.5"
function modelName(m) {
  const mm = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?/.exec(m || "");
  if (!mm) return m ? m.replace(/^claude-/, "") : "—";
  return `${mm[1][0].toUpperCase()}${mm[1].slice(1)} ${mm[2]}${mm[3] ? "." + mm[3] : ""}`;
}
const EFFORT = { low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max" };

// Claude Code's own figure when known (it resets on resume, so never go below ours).
function sessionCost(s) {
  const cc = s.sl && s.sl.cost && s.sl.cost.total_cost_usd;
  return Math.max(s.p.usd + s.sub.usd, cc || 0);
}

// Plan usage limits from the most recently written status-line snapshot.
function planLimits() {
  if (DEMO) return require("./demo").limits();
  let best = null, bestM = 0;
  let files = [];
  try { files = fs.readdirSync(STATUSLINE_DIR).filter((f) => f.endsWith(".json")); } catch { return null; }
  for (const f of files) {
    const full = path.join(STATUSLINE_DIR, f);
    let m = 0;
    try { m = fs.statSync(full).mtimeMs; } catch { continue; }
    if (Date.now() - m > 14 * 86400e3) { try { fs.unlinkSync(full); } catch {} continue; }
    if (m > bestM) { const j = readJSON(full); if (j && j.rate_limits) { best = j.rate_limits; bestM = m; } }
  }
  return best;
}
function resetLabel(sec) {
  if (!sec) return "";
  const d = new Date(sec * 1000);
  const hm = d.toTimeString().slice(0, 5);
  return dayIndex(d.getTime()) === 0 ? `resets ${hm}` : `resets ${d.toLocaleDateString("en-GB", { weekday: "short" })} ${hm}`;
}
function limitRow(name, lim, W) {
  if (!lim || lim.used_percentage == null) return null;
  const expired = lim.resets_at && Date.now() / 1000 > lim.resets_at;
  const pct = expired ? 0 : Math.max(0, Math.min(100, Math.round(lim.used_percentage)));
  const label = ` ${String(pct).padStart(3)}%`;
  const reset = expired ? "reset" : resetLabel(lim.resets_at);
  const barW = Math.max(4, W - 8 - name.length - label.length - 18); // fixed room for the reset text keeps bars aligned
  const color = pct >= 85 ? P.red : pct >= 60 ? P.yellow : P.purple;
  return { parts: [[name, P.faint], ...bar(pct / 100, barW, color), [label, P.text, BOLD]], right: [reset, P.faint] };
}

function card(s, idx, W, selected) {
  const st = s.state || {};
  const p = s.p;
  const meta = STATUS[s.status] || STATUS.idle;
  const icon = meta.icon || SPIN[tick % SPIN.length];
  const now = Date.now();
  const live = s.status === "working" || s.status === "waiting";
  const full = live || selected;
  const tw = W - 8; // text width inside the box (after the 2-space indent)
  const rows = [];

  // Title + cost
  rows.push({ parts: [[icon + " ", meta.color, BOLD], [p.title || "Untitled session", P.text, BOLD]] });
  const when = live ? (st.turn_started_at ? dur(now - st.turn_started_at) : "") : (s.lastAct ? `last used ${ago(s.lastAct)}` : "");
  rows.push({
    parts: [["  " + projectName(st.cwd || p.cwd), P.purple], ["  ·  ", P.faint],
      ...(live || s.status === "error" ? [[meta.label, meta.color], [when ? `  ·  ${when}` : "", P.faint]] : [[when, P.faint]])],
    right: idx < 9 ? [`[${idx + 1}]`, P.faint] : null,
  });

  // Description: what you first asked for, and your latest ask
  const first = p.firstAsk || st.prompt || "";
  const last = p.lastAsk || st.prompt || "";
  if (first) {
    rows.push([]);
    for (const l of wrap(first, tw, full ? 2 : 1)) rows.push([["  ", P.text], [l, P.muted, ITALIC]]);
  }
  if (full && last && last !== first) {
    const lw = wrap(last, tw - 10, 2);
    rows.push([]);
    rows.push([["  Last ask ", P.faint], [lw[0], P.text]]);
    if (lw[1]) rows.push([["           ", P.text], [lw[1], P.text]]);
  }

  if (full) {
    // What it's doing
    let act;
    if (live || s.status === "error") {
      act = st.activity && st.activity !== "Thinking" ? st.activity : (st.activity ? "Thinking…" : p.lastTool || "Working…");
    } else if (s.status === "done") act = "Finished, waiting for you";
    else act = p.lastTool ? `Last: ${p.lastTool}` : "No recent activity";
    rows.push([]);
    rows.push([["  ▸ ", meta.color], [act, live ? P.text : P.muted]]);
    if (st.subagents) rows.push([["    ", P.text], [`${st.subagents} subagent${st.subagents > 1 ? "s" : ""} running`, P.orange]]);
    const rate = p.outEvents.filter(([t]) => t > now - 60e3).reduce((a, [, n]) => a + n, 0);
    if (rate > 0 && live) rows.push([["    ", P.text], [`${num(rate)} tokens/min`, P.pink]]);
    rows.push([]);

    // Context + tokens
    const size = s.sl && s.sl.context_window && s.sl.context_window.context_window_size;
    const limit = size || CONTEXT_LIMITS.find((l) => p.ctx <= l) || CONTEXT_LIMITS[CONTEXT_LIMITS.length - 1];
    const frac = p.ctx / limit;
    const label = ` ${num(p.ctx)}/${num(limit)}`;
    const barColor = frac > 0.85 ? P.red : frac > 0.6 ? P.yellow : P.purple;
    rows.push([["  ", P.text], ...bar(frac, Math.max(4, tw - label.length), barColor), [label, P.muted]]);
    rows.push([
      ["  out ", P.faint], [num(p.out + s.sub.out), P.muted],
      ["  in ", P.faint], [num(p.inp + p.cw + s.sub.inp + s.sub.cw), P.muted],
      ["  cache ", P.faint], [num(p.cr + s.sub.cr), P.muted],
    ]);
    const c = s.sl && s.sl.cost;
    if (c && (c.total_lines_added || c.total_lines_removed)) {
      rows.push([["  lines ", P.faint], [`+${c.total_lines_added || 0}`, P.green], [` −${c.total_lines_removed || 0}`, P.red]]);
    }
  }

  // Model line
  const m = [["  ", P.text], [modelName(p.model), P.pink, BOLD]];
  if (p.effort) m.push([" " + (EFFORT[p.effort] || p.effort), P.faint]);
  m.push([`  ·  ${p.turns} turn${p.turns === 1 ? "" : "s"}`, P.faint]);
  rows.push({ parts: m, right: [formatCost(sessionCost(s)), P.cyan] });

  const color = selected ? P.pink : live ? meta.color : null;
  return box(rows, W, color);
}

function draw() {
  const W = Math.max(30, process.stdout.columns || 48);
  const H = Math.max(10, process.stdout.rows || 40);
  const counts = {};
  const tot = { usd: 0, out: 0, inp: 0, cr: 0 };
  for (const s of sessions) {
    counts[s.status] = (counts[s.status] || 0) + 1;
    tot.usd += sessionCost(s);
    tot.out += s.p.out + s.sub.out;
    tot.inp += s.p.inp + s.p.cw + s.sub.inp + s.sub.cw;
    tot.cr += s.p.cr + s.sub.cr;
  }
  if (!sessions.find((s) => s.id === selectedId)) selectedId = sessions[0] ? sessions[0].id : null;
  const blank = " ".repeat(W);
  const out = [];

  // Header, like the tab bar: ✻ Claude ............ 6h · 18:39
  out.push(row([[" ✻ ", P.pink, BOLD], ["Claude", P.purple, BOLD], ["  sessions", P.faint]], W,
    [`${winLabel(windowHours)} · ${new Date().toTimeString().slice(0, 5)} `, showAll() ? P.purple : P.faint]));
  out.push(fg(P.border) + "─".repeat(W) + RESET);

  const sum = [[" ", P.text]];
  for (const k of ["waiting", "working", "done", "idle", "stale", "error"]) {
    if (!counts[k]) continue;
    const meta = STATUS[k];
    if (sum.length > 1) sum.push(["   ", P.text]);
    sum.push([`${meta.icon || "✻"} `, meta.color], [`${counts[k]} ${meta.label}`, P.muted]);
  }
  out.push(row(sum, W));
  out.push(blank);

  // Bottom: confirmation prompt, flash message, or key help
  let bottom;
  if (confirm) {
    bottom = box([
      ...wrap(confirm.text, W - 7, 2).map((l) => [[l, P.yellow, BOLD]]),
      [["y ", P.green, BOLD], ["yes   ", P.faint], ["n ", P.red, BOLD], ["no", P.faint]],
    ], W, P.yellow);
  } else {
    const help = [["↑↓ ", P.text], ["1-9 ", P.text], ["⏎ ", P.text], ["jump  ", P.faint], ["x ", P.text], ["close  ", P.faint],
      ["a ", P.text], [showAll() ? "recent  " : "all  ", P.faint], ["q ", P.text], ["quit", P.faint]];
    const usage = { parts: [["Usage", P.purple, BOLD], [showAll() ? "  all time" : `  last ${RECENT_HOURS}h`, P.faint]], right: ["≈ " + formatCost(tot.usd), P.cyan] };
    const tokens = [["out ", P.faint], [num(tot.out), P.muted], ["  in ", P.faint], [num(tot.inp), P.muted],
      ["  cache ", P.faint], [num(tot.cr), P.muted]];
    const msg = flash && Date.now() - flashAt < 3000 ? [[flash, P.green]] : help;
    const rl = planLimits();
    const limits = rl ? [limitRow("Session ", rl.five_hour, W), limitRow("Weekly  ", rl.seven_day, W)].filter(Boolean) : [];
    bottom = box([usage, ...limits, tokens, [], msg], W);
  }
  const room = H - bottom.length;

  if (!sessions.length) {
    const spark = ["╲   │   ╱", " ╲  │  ╱ ", "──  ✻  ──", " ╱  │  ╲ ", "╱   │   ╲"];
    const top = Math.max(out.length, Math.floor((room - spark.length - 2) / 2));
    while (out.length < top) out.push(blank);
    for (const l of spark) out.push(row([[" ".repeat(Math.floor((W - l.length) / 2)) + l, P.faint]], W));
    out.push(blank);
    const msg = showAll() ? "No sessions yet" : `No sessions in the last ${RECENT_HOURS}h`;
    out.push(row([[" ".repeat(Math.floor((W - msg.length) / 2)) + msg, P.faint]], W));
  } else {
    // Keep the selected card visible: start from it if it would not fit.
    // Each card carries its day heading when it starts a new day group.
    const cards = sessions.map((s, i) => {
      const c = card(s, i, W, s.id === selectedId);
      const label = dayLabel(s.lastAct);
      if (i > 0 && label === dayLabel(sessions[i - 1].lastAct)) return c;
      const head = row([[" " + label + " ", P.purple, BOLD], ["─".repeat(Math.max(0, W - label.length - 3)), P.border]], W);
      return i === 0 ? [head, ...c] : [" ".repeat(W), head, ...c];
    });
    const sel = Math.max(0, sessions.findIndex((s) => s.id === selectedId));
    let start = 0;
    const fits = (from, to) => cards.slice(from, to + 1).reduce((a, c) => a + c.length, 0) <= room - out.length;
    while (start < sel && !fits(start, sel)) start++;
    if (start > 0) out.push(row([[`  ↑ ${start} more`, P.faint]], W));
    let i = start;
    for (; i < cards.length; i++) {
      if (out.length + cards[i].length > room - (i < cards.length - 1 ? 1 : 0)) break;
      out.push(...cards[i]);
    }
    if (i < cards.length) out.push(row([[`  ↓ ${cards.length - i} more`, P.faint]], W));
  }
  while (out.length < room) out.push(blank);
  out.length = room;
  out.push(...bottom);
  process.stdout.write("\x1b[H" + out.join("\r\n"));
}

function refresh() {
  try { sessions = DEMO ? require("./demo").sessions() : discover(); } catch { sessions = []; }
  tick++;
  draw();
}

function move(delta) {
  if (!sessions.length) return;
  const i = Math.max(0, sessions.findIndex((s) => s.id === selectedId));
  selectedId = sessions[Math.min(sessions.length - 1, Math.max(0, i + delta))].id;
  draw();
}

function say(msg) {
  flash = msg;
  flashAt = Date.now();
  draw();
}

// Select a card and, if its session is still open in a WezTerm pane, switch
// to that tab and pane. Pane ids reset when WezTerm restarts, so we check the
// pane is really there before jumping.
function jump(s) {
  if (!s) return;
  selectedId = s.id;
  draw();
  if (DEMO) return;
  const pane = s.state && s.state.wezterm_pane;
  if (pane == null || s.status === "ended") return say("No open pane for this session");
  listPanes((panes) => {
    const p = panes.find((x) => x.pane_id === Number(pane));
    if (!p) return say("That session's pane is closed");
    execFile("wezterm", ["cli", "activate-tab", "--tab-id", String(p.tab_id)], () => {
      execFile("wezterm", ["cli", "activate-pane", "--pane-id", String(p.pane_id)], () => {});
    });
  });
}

// ---------------------------------------------------------------- main
if (process.argv.includes("--frame")) {
  // Print one rendered frame (for previewing): node dash.js --frame [cols] [rows]
  const i = process.argv.indexOf("--frame");
  Object.defineProperty(process.stdout, "columns", { value: Number(process.argv[i + 1]) || 48 });
  Object.defineProperty(process.stdout, "rows", { value: Number(process.argv[i + 2]) || 40 });
  sessions = DEMO ? require("./demo").sessions() : discover();
  draw();
  process.stdout.write("\n");
  process.exit(0);
}

function cleanup() {
  process.stdout.write(RESET + "\x1b[?25h\x1b[?1049l");
  process.exit(0);
}
process.title = "Claude Sessions"; // ConPTY drops OSC titles; this sets the console title WezTerm shows
process.stdout.write("\x1b]2;Claude Sessions\x07\x1b[?1049h\x1b[?25l");
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.setEncoding("utf8");
process.stdin.on("data", (k) => {
  if (confirm) {
    if (k === "y" || k === "Y") doClose();
    else if (k === "n" || k === "N" || k === "\x1b" || k === "q") { confirm = null; draw(); }
    return;
  }
  const sel = sessions.find((s) => s.id === selectedId);
  if (k === "q" || k === "\x03") cleanup();
  else if (k === "\x1b[A" || k === "k") move(-1);
  else if (k === "\x1b[B" || k === "j") move(1);
  else if (k === "\r") jump(sel);
  else if (k === "x" && sel && !DEMO) requestClose(sel);
  else if (k === "a") { windowHours = showAll() ? RECENT_HOURS : Infinity; refresh(); }
  else if (/^[1-9]$/.test(k)) jump(sessions[Number(k) - 1]);
});
process.stdout.on("resize", draw);
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
refresh();
setInterval(refresh, REFRESH_MS);
