// Run with: node --test tests/
const test = require("node:test");
const assert = require("node:assert");
const { detect, itermUuid, create } = require("../dashboard/terminal");

test("detect picks iTerm2 from its env vars", () => {
  assert.strictEqual(detect({ TERM_PROGRAM: "iTerm.app" }), "iterm");
  assert.strictEqual(detect({ ITERM_SESSION_ID: "w0t0p0:ABC" }), "iterm");
});

test("detect defaults to WezTerm", () => {
  assert.strictEqual(detect({ WEZTERM_PANE: "3" }), "wezterm");
  assert.strictEqual(detect({}), "wezterm");
});

test("config can force a terminal", () => {
  assert.strictEqual(detect({ TERM_PROGRAM: "iTerm.app" }, "wezterm"), "wezterm");
  assert.strictEqual(detect({}, "iterm"), "iterm");
});

test("itermUuid strips the window/tab/pane prefix", () => {
  assert.strictEqual(itermUuid("w0t1p0:6F2A-11"), "6F2A-11");
  assert.strictEqual(itermUuid("6F2A-11"), "6F2A-11");
  assert.strictEqual(itermUuid(""), null);
  assert.strictEqual(itermUuid(undefined), null);
});

// A fake execFile that records calls and answers from a table.
function fakeExec(answers = {}) {
  const calls = [];
  const exec = (cmd, args, cb) => {
    calls.push([cmd, args]);
    const a = answers[args.slice(0, 2).join(" ")] || answers[cmd] || [null, ""];
    cb(a[0], a[1]);
  };
  return { exec, calls };
}

test("iterm adapter finds a session by its stored uuid", (_, done) => {
  const { exec, calls } = fakeExec({ osascript: [null, "claude — ~/code\n"] });
  const t = create("iterm", { exec });
  t.find({ iterm_session: "UUID-1" }, (p) => {
    assert.deepStrictEqual(p, { id: "UUID-1", title: "claude — ~/code" });
    const [cmd, args] = calls[0];
    assert.strictEqual(cmd, "osascript");
    assert.strictEqual(args[args.length - 1], "UUID-1"); // passed as argv, never spliced into the script
    done();
  });
});

test("iterm adapter returns null when the session is gone", (_, done) => {
  const { exec } = fakeExec({ osascript: [null, "\n"] });
  create("iterm", { exec }).find({ iterm_session: "UUID-1" }, (p) => {
    assert.strictEqual(p, null);
    done();
  });
});

test("iterm adapter ignores sessions with no stored uuid", (_, done) => {
  const { exec, calls } = fakeExec();
  create("iterm", { exec }).find({ wezterm_pane: 3 }, (p) => {
    assert.strictEqual(p, null);
    assert.strictEqual(calls.length, 0);
    done();
  });
});

test("iterm spawn passes cwd and command as separate args", (_, done) => {
  const { exec, calls } = fakeExec({ osascript: [null, "NEW-UUID\n"] });
  create("iterm", { exec }).spawn("/tmp/it's here", ["claude", "--resume", "abc"], (err) => {
    assert.ifError(err);
    const args = calls[0][1];
    assert.strictEqual(args[args.length - 1], "cd '/tmp/it'\\''s here' && 'claude' '--resume' 'abc'");
    done();
  });
});

test("wezterm adapter finds a pane from wezterm cli list", (_, done) => {
  const list = JSON.stringify([{ pane_id: 4, tab_id: 2, title: "claude" }]);
  const { exec } = fakeExec({ "cli list": [null, list] });
  const t = create("wezterm", { exec, startedAt: 1 });
  t.find({ wezterm_pane: 4 }, (p) => {
    assert.deepStrictEqual(p, { id: 4, tab: 2, title: "claude" });
    done();
  }, { lastAct: 10 });
});

test("wezterm adapter distrusts pane ids from before WezTerm started", (_, done) => {
  const { exec, calls } = fakeExec();
  create("wezterm", { exec, startedAt: 100 }).find({ wezterm_pane: 4 }, (p) => {
    assert.strictEqual(p, null);
    assert.strictEqual(calls.length, 0);
    done();
  }, { lastAct: 50 });
});

test("wezterm strict mode gives up when the start time is unknown", (_, done) => {
  const { exec } = fakeExec();
  create("wezterm", { exec, startedAt: 0 }).find({ wezterm_pane: 4 }, (p) => {
    assert.strictEqual(p, null);
    done();
  }, { lastAct: 50, strict: true });
});
