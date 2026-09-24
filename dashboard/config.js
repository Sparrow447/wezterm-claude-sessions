// config.js - your settings for the sessions panel.
//
// Edit this file after installing (~/.claude/dashboard/config.js).
// Re-running install.js will not overwrite it.

module.exports = {
  // Money is shown as the API list price of what your sessions used.
  // On a Claude subscription that's not your bill, just a sense of scale.
  // Any ISO currency code works ("USD", "EUR", "NOK", "GBP"...). For anything
  // other than USD the rate is fetched from open.er-api.com twice a day.
  currency: "USD",
  locale: "en-US", // number format, e.g. "nb-NO" gives "1 234,56 kr"

  // "Recent" view: sessions active in the last N hours. Press "a" in the
  // panel to flip to every session on disk.
  recentHours: 6,

  // How often the panel redraws, in milliseconds.
  refreshMs: 1000,

  // Context bar scale when Claude Code hasn't told us the window size yet.
  // A session past the first number is assumed to be on the second.
  contextLimits: [200_000, 1_000_000],

  // Colors (Dracula). Keep them in sync with wezterm/modules/palette.lua
  // if you want the panel to match your terminal.
  colors: {
    text: "#f8f8f2", muted: "#bcc2dc", faint: "#6272a4", border: "#44475a",
    purple: "#bd93f9", pink: "#ff79c6", cyan: "#8be9fd", green: "#50fa7b",
    yellow: "#f1fa8c", orange: "#ffb86c", red: "#ff5555",
  },
};
