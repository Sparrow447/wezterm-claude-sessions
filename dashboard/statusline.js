#!/usr/bin/env node
// statusline.js - Claude Code status line that also feeds the panel.
//
// Claude Code pipes a JSON blob to the status line command every few seconds.
// It holds things the transcripts don't: your plan's usage limits, the real
// context window size and Claude Code's own cost figure. We save a copy to
// statusline/<session>.json so dash.js can show them.
//
//   node statusline.js              save it, then print a simple status line
//   node statusline.js --save-only  save it and print nothing (install.js uses
//                                   this when you already have a status line)
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "statusline");

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("end", () => {
  let j = {};
  try { j = JSON.parse(buf); } catch {}
  if (j.session_id) {
    try {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(path.join(DIR, `${j.session_id}.json`), buf);
    } catch {}
  }
  if (process.argv.includes("--save-only")) return;

  // A plain status line: model · folder · context used · cost
  const parts = [];
  if (j.model && j.model.display_name) parts.push(j.model.display_name);
  const cwd = (j.workspace && j.workspace.current_dir) || j.cwd;
  if (cwd) parts.push(path.basename(cwd));
  const cw = j.context_window;
  if (cw && cw.used_percentage != null) parts.push(`ctx ${Math.round(cw.used_percentage)}%`);
  if (j.cost && j.cost.total_cost_usd != null) parts.push(`$${j.cost.total_cost_usd.toFixed(2)}`);
  process.stdout.write(parts.join(" · "));
});
