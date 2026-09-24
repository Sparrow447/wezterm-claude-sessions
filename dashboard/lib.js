// lib.js - paths and small helpers shared by hook.js and dash.js.
const path = require("path");
const os = require("os");

// Everything lives next to these scripts (normally ~/.claude/dashboard).
const DASH_DIR = __dirname;
const STATE_DIR = path.join(DASH_DIR, "state");
const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects"); // Claude Code's transcripts

// Collapse whitespace and cut to n characters.
function short(s, n = 90) {
  s = String(s ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function base(p) {
  return p ? path.basename(String(p)) : "";
}

// Turn a tool call into a short line like "Editing app.js".
// Add a case here if you want nicer text for a tool you use a lot.
function describe(tool, input = {}) {
  input = input || {};
  switch (tool) {
    case "Bash":
    case "PowerShell":
      return `${tool}: ${short(input.description || input.command, 70)}`;
    case "Read":
      return `Reading ${base(input.file_path)}`;
    case "Edit":
    case "MultiEdit":
      return `Editing ${base(input.file_path)}`;
    case "Write":
      return `Writing ${base(input.file_path)}`;
    case "NotebookEdit":
      return `Editing ${base(input.notebook_path)}`;
    case "Grep":
      return `Searching "${short(input.pattern, 40)}"`;
    case "Glob":
      return `Finding ${short(input.pattern, 50)}`;
    case "WebFetch":
      return `Fetching ${short(input.url, 60)}`;
    case "WebSearch":
      return `Web search "${short(input.query, 50)}"`;
    case "Agent":
    case "Task":
      return `Subagent: ${short(input.description || input.subagent_type, 60)}`;
    case "Skill":
      return `Skill ${short(input.skill, 50)}`;
    case "TodoWrite":
      return "Updating todo list";
    default:
      if (tool && tool.startsWith("mcp__")) {
        const parts = tool.split("__");
        return `MCP ${parts[1] || ""}: ${parts.slice(2).join("__")}`;
      }
      return tool || "Working";
  }
}

module.exports = { DASH_DIR, STATE_DIR, PROJECTS_DIR, short, base, describe };
