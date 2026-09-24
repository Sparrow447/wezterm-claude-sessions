#!/usr/bin/env node
// Claude Code hook -> writes live per-session state for the dashboard.
// Usage (from settings.json hooks): node hook.js <EventName>   (hook JSON on stdin)
// Never throws / never blocks Claude: always exits 0.
const fs = require("fs");
const path = require("path");

const { STATE_DIR, short, describe } = require("./lib");
const event = process.argv[2] || "";

function main(raw) {
  let h = {};
  try { h = JSON.parse(raw || "{}"); } catch { return; }
  const sid = h.session_id;
  if (!sid) return;

  fs.mkdirSync(STATE_DIR, { recursive: true });
  const file = path.join(STATE_DIR, `${sid}.json`);
  let s = {};
  try { s = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}

  const now = Date.now();
  s.session_id = sid;
  s.cwd = h.cwd || s.cwd;
  s.transcript_path = h.transcript_path || s.transcript_path;
  s.wezterm_pane = process.env.WEZTERM_PANE || s.wezterm_pane || null;
  s.started_at = s.started_at || now;
  s.updated_at = now;
  s.tool_count = s.tool_count || 0;
  s.subagents = s.subagents || 0;
  if (h.permission_mode) s.permission_mode = h.permission_mode;

  switch (event) {
    case "SessionStart":
      s.status = "idle";
      s.activity = `Session ${h.source || "started"}`;
      s.subagents = 0;
      break;
    case "UserPromptSubmit":
      s.status = "working";
      s.prompt = short(h.prompt, 140);
      s.activity = "Thinking";
      s.turn_started_at = now;
      break;
    case "PreToolUse":
      s.status = "working";
      s.activity = describe(h.tool_name, h.tool_input);
      s.last_tool = h.tool_name;
      s.tool_count++;
      break;
    case "PostToolUse":
    case "PostToolUseFailure":
      s.status = "working";
      s.activity = event === "PostToolUseFailure" ? `${h.tool_name} failed, thinking` : "Thinking";
      break;
    case "PermissionRequest":
      s.status = "waiting";
      s.activity = `Needs permission: ${describe(h.tool_name, h.tool_input)}`;
      break;
    case "Notification": {
      const msg = String(h.message || "");
      if (/permission|approve|needs your/i.test(msg) || h.notification_type === "permission_prompt") {
        s.status = "waiting";
        s.activity = short(msg, 90);
      } else if (s.status !== "working") {
        s.notice = short(msg, 90);
      }
      break;
    }
    case "SubagentStart":
      s.subagents++;
      break;
    case "SubagentStop":
      s.subagents = Math.max(0, s.subagents - 1);
      break;
    case "Stop":
      s.status = "done";
      s.activity = "Waiting for you";
      if (s.turn_started_at) s.last_turn_ms = now - s.turn_started_at;
      s.turn_started_at = null;
      break;
    case "StopFailure":
      s.status = "error";
      s.activity = short(h.error || h.message || "Turn failed (API error)", 90);
      s.turn_started_at = null;
      break;
    case "SessionEnd":
      s.status = "ended";
      s.activity = `Ended (${h.reason || "exit"})`;
      s.ended_at = now;
      break;
    default:
      break;
  }

  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s));
  fs.renameSync(tmp, file);
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("end", () => {
  try { main(buf); } catch {}
  process.exit(0);
});
setTimeout(() => process.exit(0), 3000).unref();
