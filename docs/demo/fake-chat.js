#!/usr/bin/env node
// fake-chat.js - prints a made-up Claude Code conversation for screenshots.
//
// Run it inside WezTerm and it also opens the panel next to it in demo mode:
//   node docs/demo/fake-chat.js
// Press q to quit.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const rgb = (h) => `\x1b[38;2;${[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(";")}m`;
const R = "\x1b[0m", B = "\x1b[1m", DIM = rgb("#6272a4");
const WHITE = rgb("#f8f8f2"), GREEN = rgb("#50fa7b"), RED = rgb("#ff5555"), ORANGE = rgb("#d97757");
const GREY = rgb("#bcc2dc"), PURPLE = rgb("#bd93f9"), YELLOW = rgb("#f1fa8c");
const ADD = "\x1b[48;2;30;70;40m", DEL = "\x1b[48;2;80;30;35m";

// A rounded box whose rows are padded to the same width (ANSI codes don't count).
const visible = (t) => t.replace(/[[0-9;]*m/g, "").length;
function box(rows, width, color) {
  const out = [` ${color}╭${"─".repeat(width)}╮${R}`];
  for (const r of rows) out.push(` ${color}│${R} ${r}${" ".repeat(Math.max(0, width - 1 - visible(r)))}${color}│${R}`);
  out.push(` ${color}╰${"─".repeat(width)}╯${R}`);
  return out;
}

const lines = [
  ``,
  `${ORANGE}✻${R} ${B}Claude Code${R}  ${DIM}~/projects/weather-app${R}`,
  ``,
  `${DIM}>${R} ${GREY}Add an hourly forecast view to the weather app, with a small temperature graph${R}`,
  ``,
  `${WHITE}●${R} I'll check how the daily view is built first, then add an hourly one next to it.`,
  ``,
  `${GREEN}●${R} ${B}Read${R}(src/views/DailyForecast.tsx)`,
  `  ${DIM}⎿  Read 84 lines${R}`,
  ``,
  `${GREEN}●${R} ${B}Search${R}(pattern: "fetchForecast", path: "src")`,
  `  ${DIM}⎿  Found 3 files${R}`,
  ``,
  `${GREEN}●${R} ${B}Update${R}(src/api/forecast.ts)`,
  `  ${DIM}⎿  Updated src/api/forecast.ts with 3 additions and 1 removal${R}`,
  `      ${DIM}40${R}   export async function fetchForecast(city: string) {`,
  `      ${DIM}41${R} ${DEL}${RED}-${R}${DEL}   const res = await fetch(\`\${BASE}/daily?q=\${city}\`)                 ${R}`,
  `      ${DIM}41${R} ${ADD}${GREEN}+${R}${ADD} export async function fetchForecast(city: string, mode: Mode) {    ${R}`,
  `      ${DIM}42${R} ${ADD}${GREEN}+${R}${ADD}   const res = await fetch(\`\${BASE}/\${mode}?q=\${city}\`)               ${R}`,
  ``,
  `${GREEN}●${R} ${B}Write${R}(src/views/HourlyForecast.tsx)`,
  `  ${DIM}⎿  Wrote 96 lines to src/views/HourlyForecast.tsx${R}`,
  ``,
  `${WHITE}●${R} Done. Here's what changed:`,
  `  - New ${PURPLE}HourlyForecast${R} component with a 24-hour temperature line`,
  `  - ${PURPLE}fetchForecast()${R} takes ${YELLOW}"daily"${R} or ${YELLOW}"hourly"${R}`,
  `  - A toggle in the header switches between the two views`,
  ``,
  `${DIM}>${R} ${GREY}looks good, can you run the tests before we commit?${R}`,
  ``,
  `${ORANGE}●${R} ${B}Bash${R}(npm test)`,
  ``,
  ...box([
    `${B}Bash command${R}`, "",
    "  npm test",
    `  ${DIM}Run the test suite${R}`, "",
    "Do you want to proceed?",
    `${PURPLE}❯ 1. Yes${R}`,
    "  2. Yes, and don't ask again for npm test",
    "  3. No, and tell Claude what to do differently",
  ], 53, ORANGE),
];

// Redraw from the top whenever the pane changes size.
const paint = () => process.stdout.write("\x1b[2J\x1b[3J\x1b[H\x1b[?25l" + lines.join("\r\n"));
paint();
process.stdout.on("resize", paint);

// Fake session state so the tab icons and status bar counts have something
// to show. Only written when CLAUDE_DASHBOARD_DIR points somewhere (the
// screenshot script sets it to a temp folder), never to your real state.
function fakeState(pane, status, cwd) {
  const dir = process.env.CLAUDE_DASHBOARD_DIR;
  if (!dir) return;
  const stateDir = path.join(dir, "state");
  fs.mkdirSync(stateDir, { recursive: true });
  const id = `demo-${pane}`;
  fs.writeFileSync(path.join(stateDir, `${id}.json`), JSON.stringify({
    session_id: id, status, cwd, wezterm_pane: String(pane), updated_at: Date.now(),
  }));
}

// Inside WezTerm: add two more fake tabs and open the panel in demo mode.
if (process.env.WEZTERM_PANE && !process.argv.includes("--no-panel")) {
  const me = process.env.WEZTERM_PANE;
  const dash = path.join(__dirname, "..", "..", "dashboard", "dash.js");
  const idle = ["node", "-e", "setInterval(() => {}, 1e6)"];
  const cli = (...args) => execFileSync("wezterm", ["cli", ...args]).toString().trim();
  try {
    cli("set-tab-title", "weather-app");
    fakeState(me, "waiting", "/home/you/projects/weather-app");
    for (const [title, status] of [["api-server", "working"], ["dotfiles", "done"]]) {
      const pane = cli("spawn", "--", ...idle);
      cli("set-tab-title", "--pane-id", pane, title);
      fakeState(pane, status, `/home/you/projects/${title}`);
    }
    cli("activate-pane", "--pane-id", me);
    cli("split-pane", "--right", "--percent", "34", "--", "node", dash, "--demo");
    cli("activate-pane", "--pane-id", me);
  } catch {}
}

if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.on("data", (k) => {
  if (k.toString() === "q" || k[0] === 3) {
    process.stdout.write("\x1b[?25h");
    process.exit(0);
  }
});
