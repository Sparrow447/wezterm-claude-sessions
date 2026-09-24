// demo.js - made-up sessions for `node dash.js --demo`.
//
// Handy for screenshots, or to see what the panel looks like before you've
// run Claude Code with the hooks installed. None of this is real data.

const MIN = 60e3;

function parser(o) {
  return {
    inp: 0, out: 0, cr: 0, cw: 0, usd: 0, ctx: 0, calls: 0, turns: 1,
    model: "claude-opus-5-5", effort: "high", title: "", cwd: "", branch: "main",
    firstAsk: "", lastAsk: "", lastTool: "", lastType: "assistant", lastStop: "",
    outEvents: [], mtime: Date.now(),
    ...o,
  };
}

function session(id, status, state, p, extra = {}) {
  const now = Date.now();
  return {
    id, status,
    state: { session_id: id, status, updated_at: now, ...state },
    p: parser(p),
    sub: { inp: 0, out: 0, cr: 0, cw: 0, usd: 0, n: 0 },
    lastAct: state.lastAct || now,
    sl: null,
    ...extra,
  };
}

function sessions() {
  const now = Date.now();
  return [
    session("demo-1", "waiting", {
      cwd: "/home/you/projects/weather-app",
      activity: "Needs permission: Bash: Run the test suite",
      turn_started_at: now - 4 * MIN - 12e3,
    }, {
      title: "Add hourly forecast view",
      firstAsk: "Add an hourly forecast view to the weather app, with a small temperature graph",
      lastAsk: "looks good, can you run the tests before we commit?",
      turns: 6, out: 18400, inp: 2100, cw: 41000, cr: 380000, ctx: 64000, usd: 0.84,
    }),
    session("demo-2", "working", {
      cwd: "/home/you/projects/api-server",
      activity: "Editing auth.ts",
      turn_started_at: now - 1 * MIN - 40e3,
      subagents: 1,
    }, {
      title: "Fix login token refresh",
      firstAsk: "Users get logged out after an hour even though they're active. Find out why",
      lastAsk: "yes, go with the refresh-on-401 approach",
      turns: 4, out: 9200, inp: 1500, cw: 38000, cr: 210000, ctx: 121000, usd: 0.61,
      outEvents: [[now - 20e3, 1400], [now - 5e3, 900]],
      model: "claude-sonnet-5",
    }),
    session("demo-3", "done", {
      cwd: "/home/you/dotfiles", lastAct: now - 22 * MIN,
    }, {
      title: "Modular WezTerm config",
      firstAsk: "Split my wezterm.lua into modules and add comments on how to customize it",
      lastAsk: "perfect, push it to github",
      turns: 9, out: 31000, inp: 3300, cw: 52000, cr: 910000, ctx: 88000, usd: 1.37,
      mtime: now - 22 * MIN,
    }),
    session("demo-4", "idle", {
      cwd: "/home/you/projects/blog", lastAct: now - 3 * 60 * MIN,
    }, {
      title: "Write post about terminal setup",
      firstAsk: "Draft a short blog post about my terminal setup",
      turns: 3, out: 6400, inp: 900, cw: 20000, cr: 90000, ctx: 30000, usd: 0.22,
      model: "claude-haiku-4-5", effort: "", mtime: now - 3 * 60 * MIN,
    }),
  ];
}

function limits() {
  const now = Math.floor(Date.now() / 1000);
  return {
    five_hour: { used_percentage: 42, resets_at: now + 2 * 3600 + 17 * 60 },
    seven_day: { used_percentage: 18, resets_at: now + 4 * 86400 },
  };
}

module.exports = { sessions, limits };
