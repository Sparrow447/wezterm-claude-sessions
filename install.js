#!/usr/bin/env node
// install.js - sets up the Claude Code side of things.
//
//   1. copies dashboard/ to ~/.claude/dashboard (your config.js is kept)
//   2. adds the hooks to ~/.claude/settings.json (a backup is saved first)
//   3. hooks up the status line so the panel can show plan limits
//
// Run it again any time to update; it won't add anything twice.
// The WezTerm config is a separate copy step, see the README.
//
//   node install.js             install
//   node install.js --dry-run   show what would change, touch nothing

const fs = require("fs");
const path = require("path");
const os = require("os");

const DRY = process.argv.includes("--dry-run");
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
console.log("\nDone. Restart any running Claude Code sessions so they pick up the hooks.");
