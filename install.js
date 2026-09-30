#!/usr/bin/env node
// install.js - sets up the Claude Code side of things.
//
//   1. copies dashboard/ to ~/.claude/dashboard (your config.js is kept)
//   2. adds the hooks to ~/.claude/settings.json (a backup is saved first)
//   3. hooks up the status line so the panel can show plan limits
//
//   4. with --iterm: installs the iTerm2 script (panel toggle, tab icons,
//      status bar counter) into iTerm2's AutoLaunch folder
//
// Run it again any time to update; it won't add anything twice.
// The WezTerm config is a separate copy step, see the README.
//
//   node install.js             install
//   node install.js --iterm     install, plus the iTerm2 script (macOS)
//   node install.js --dry-run   show what would change, touch nothing

const fs = require("fs");
const path = require("path");
const os = require("os");

const DRY = process.argv.includes("--dry-run");
const ITERM = process.argv.includes("--iterm");
const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const DEST = path.join(CLAUDE_DIR, "dashboard");
const SETTINGS = path.join(CLAUDE_DIR, "settings.json");
const SRC = path.join(__dirname, "dashboard");

// Every Claude Code event the panel listens to.
const EVENTS = [
  "SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PostToolUse",
  "PostToolUseFailure", "PermissionRequest", "Notification", "Stop", "StopFailure",
  "SubagentStart", "SubagentStop",
];

const log = (msg) => console.log((DRY ? "[dry run] " : "") + msg);
const slash = (p) => p.replace(/\\/g, "/"); // forward slashes work everywhere, even in Git Bash

// 1. Copy the scripts ---------------------------------------------------------
if (!DRY) fs.mkdirSync(DEST, { recursive: true });
for (const f of fs.readdirSync(SRC)) {
  const to = path.join(DEST, f);
  if (f === "config.js" && fs.existsSync(to)) { log(`kept your ${slash(to)}`); continue; }
  if (!DRY) fs.copyFileSync(path.join(SRC, f), to);
  log(`copied ${f}`);
}

// 2. Hooks -----------------------------------------------------------------
let settings = {};
if (fs.existsSync(SETTINGS)) {
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
  } catch (e) {
    console.error(`Couldn't parse ${SETTINGS}: ${e.message}\nFix it and run this again.`);
    process.exit(1);
  }
}
const hookScript = slash(path.join(DEST, "hook.js"));
const isOurs = (h) => JSON.stringify(h).includes("dashboard/hook.js") || JSON.stringify(h).includes("dashboard\\\\hook.js");

settings.hooks = settings.hooks || {};
let added = 0;
for (const ev of EVENTS) {
  const groups = (settings.hooks[ev] = settings.hooks[ev] || []);
  if (groups.some((g) => (g.hooks || []).some(isOurs))) continue;
  groups.push({
    hooks: [{ type: "command", command: "node", args: [hookScript, ev], async: true, timeout: 5 }],
  });
  added++;
}
log(added ? `added ${added} hooks` : "hooks already there");

// 3. Status line -------------------------------------------------------------
const statusScript = slash(path.join(DEST, "statusline.js"));
const current = settings.statusLine && settings.statusLine.command;
if (current && current.includes("statusline.js")) {
  log("status line already set up");
} else if (current) {
  // You already have a status line (ccstatusline, claude-hud...). Keep it and
  // quietly save a copy of the input for the panel before handing it over.
  settings.statusLine.command =
    `input=$(cat); printf '%s' "$input" | node "${statusScript}" --save-only; ` +
    `printf '%s' "$input" | { ${current}; }`;
  log("wrapped your existing status line so the panel can read it too");
} else {
  settings.statusLine = { type: "command", command: `node "${statusScript}"` };
  log("set status line");
}

if (!DRY) {
  if (fs.existsSync(SETTINGS)) {
    const backup = `${SETTINGS}.bak-${Date.now()}`;
    fs.copyFileSync(SETTINGS, backup);
    log(`backed up settings to ${slash(backup)}`);
  }
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + "\n");
}
log(`updated ${slash(SETTINGS)}`);

// 4. iTerm2 ------------------------------------------------------------------
if (ITERM) installIterm();

function installIterm() {
  if (process.platform !== "darwin") {
    console.error("--iterm: iTerm2 is macOS only, skipping.");
    return;
  }
  const autoLaunch = path.join(os.homedir(), "Library", "Application Support", "iTerm2", "Scripts", "AutoLaunch");
  const script = path.join(autoLaunch, "claude_sessions.py");
  if (!DRY) fs.mkdirSync(autoLaunch, { recursive: true });
  if (!DRY) fs.copyFileSync(path.join(__dirname, "iterm", "claude_sessions.py"), script);
  log(`copied claude_sessions.py to ${slash(autoLaunch)}`);

  // iTerm2 starts the panel without your shell's PATH, so remember where node is.
  // Your edits to iterm.json (panel_width, panel_side...) are kept.
  const itermJson = path.join(DEST, "iterm.json");
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(itermJson, "utf8")); } catch {}
  const out = { dashboard_dir: DEST, node: stableNode(), panel_width: 0.3, panel_side: "Right", ...prev };
  if (!DRY) fs.writeFileSync(itermJson, JSON.stringify(out, null, 2) + "\n");
  log(`wrote ${slash(itermJson)}`);
  console.log(
    "\niTerm2: enable Settings > General > Magic > Python API, then Scripts > AutoLaunch > claude_sessions.py" +
    "\n(iTerm2 offers to download its Python runtime the first time)." +
    "\nThen bind a key: Settings > Keys > Key Bindings > + > Invoke Script Function > claude_toggle_panel(session_id: id)");
}

// The first node on PATH, as written (/opt/homebrew/bin/node), not
// process.execPath, which resolves to a versioned Cellar folder that
// disappears on the next `brew upgrade`.
function stableNode() {
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    const p = path.join(dir, "node");
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch {}
  }
  return process.execPath;
}
console.log("\nDone. Restart any running Claude Code sessions so they pick up the hooks.");
