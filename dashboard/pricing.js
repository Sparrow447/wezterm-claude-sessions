// pricing.js - what a session would cost at API list prices.
//
// Prices are USD per million tokens. Cache writes cost 1.25x input for the
// 5-minute cache and 2x for the 1-hour cache; fast mode doubles everything.
// When a new model comes out, add a line to PRICES.
const fs = require("fs");
const path = require("path");
const https = require("https");
const { DASH_DIR } = require("./lib");
const config = require("./config");

// in = input, out = output, cr = cache read. Longest matching prefix wins.
const PRICES = [
  ["claude-opus-5-5", { in: 4, out: 20, cr: 0.2 }],
  ["claude-opus-5", { in: 5, out: 25, cr: 0.5 }],
  ["claude-opus-4-8", { in: 5, out: 25, cr: 0.5 }],
  ["claude-opus-4-7", { in: 5, out: 25, cr: 0.5 }],
  ["claude-opus-4-6", { in: 5, out: 25, cr: 0.5 }],
  ["claude-opus-4-5", { in: 5, out: 25, cr: 0.5 }],
  ["claude-opus-4", { in: 15, out: 75, cr: 1.5 }],
  ["claude-fable-5-1", { in: 10, out: 50, cr: 0.25 }],
  ["claude-fable-5", { in: 10, out: 50, cr: 1 }],
  ["claude-sonnet-5", { in: 2, out: 10, cr: 0.2 }],
  ["claude-sonnet-4", { in: 3, out: 15, cr: 0.3 }],
  ["claude-haiku-4-5", { in: 1, out: 5, cr: 0.1 }],
].sort((a, b) => b[0].length - a[0].length);

function priceFor(model) {
  if (!model) return null;
  const m = String(model).replace(/^(us\.|eu\.|global\.)?anthropic\./, "");
  for (const [k, v] of PRICES) if (m.startsWith(k)) return v;
  return null;
}

// Cost in USD of one API response's `usage` block.
function usageCostUSD(model, u) {
  const pr = priceFor(model);
  if (!pr || !u) return 0;
  const cw = u.cache_creation_input_tokens || 0;
  const cw1h = (u.cache_creation && u.cache_creation.ephemeral_1h_input_tokens) || 0;
  const cw5m = Math.max(0, cw - cw1h);
  let usd = ((u.input_tokens || 0) * pr.in + (u.output_tokens || 0) * pr.out +
    (u.cache_read_input_tokens || 0) * pr.cr + cw5m * pr.in * 1.25 + cw1h * pr.in * 2) / 1e6;
  if (u.speed === "fast") usd *= 2;
  return usd;
}

// ---- currency conversion (only used when config.currency isn't USD)
const CURRENCY = String(config.currency || "USD").toUpperCase();
const FX_FILE = path.join(DASH_DIR, "fx.json");
const FX_TTL = 12 * 3600e3;
let fx = null;
try { fx = JSON.parse(fs.readFileSync(FX_FILE, "utf8")); } catch {}
if (fx && fx.currency !== CURRENCY) fx = null; // currency changed in config
let fetching = false;

function refreshFx() {
  if (CURRENCY === "USD" || fetching || (fx && Date.now() - fx.at < FX_TTL)) return;
  fetching = true;
  https.get("https://open.er-api.com/v6/latest/USD", { timeout: 8000 }, (res) => {
    let body = "";
    res.on("data", (d) => (body += d));
    res.on("end", () => {
      fetching = false;
      try {
        const rate = JSON.parse(body).rates[CURRENCY];
        if (rate > 0) {
          fx = { currency: CURRENCY, rate, at: Date.now() };
          fs.writeFileSync(FX_FILE, JSON.stringify(fx));
        }
      } catch {}
    });
  }).on("error", () => { fetching = false; }).on("timeout", function () { this.destroy(); });
}

function money(amount, currency) {
  try {
    return new Intl.NumberFormat(config.locale, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

// Formats a USD amount in your currency. Falls back to USD until a rate arrives.
function formatCost(usd) {
  refreshFx();
  if (CURRENCY === "USD" || !fx) return money(usd, "USD");
  return money(usd * fx.rate, CURRENCY);
}

module.exports = { priceFor, usageCostUSD, formatCost };
