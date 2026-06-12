# stock-ticker — a live stock ticker for the Claude Code status line

Replaces the bottom status bar with a rotating mini stock ticker — price, daily change, and an intraday sparkline — while keeping your model and context usage in view:

```
● NVDA $204.87 ▲2.22% ▂▃▃▅▄▆▇ 2/4 ▶  │  Fable 5 · 34% ctx
```

The leading dot shows market status for the displayed symbol's exchange: blinking green while the market is open for regular trading, steady red otherwise (pre/post-market, weekends, holidays). The trailing `▶` is a next-symbol button — Ctrl/Cmd+click it to advance the rotation manually (forward only, wraps around).

Quotes come from Yahoo Finance's public chart endpoint (no API key). All symbols in your list refresh once a minute (stale quotes are fetched in parallel on each status line tick), and the 60-second cache keeps the frequent refreshes from hammering the API. Symbols rotate every 10 seconds. Works with stocks, indices (`^GSPC`), and crypto (`BTC-USD`).

> Claude Code's spinner only supports static text (`spinnerVerbs`), so the status line is the surface for live data — it refreshes on a timer via `refreshInterval`.

## Requirements

- Node.js 18+ on your `PATH` (uses the built-in `fetch`)
- Claude Code with status line support

## Install

As a plugin:

```
/plugin marketplace add noam-bash/claude-stock-ticker
/plugin install stock-ticker
/ticker install
```

Or manually — add to `~/.claude/settings.json` (forward slashes matter on Windows):

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"C:/path/to/stock-ticker/scripts/ticker.mjs\"",
    "refreshInterval": 5
  }
}
```

## Configure

`~/.claude/stock-ticker.json` (all keys optional):

```json
{
  "symbols": ["SPY", "NVDA", "AAPL", "TSLA"],
  "rotateSeconds": 10,
  "cacheTtlSeconds": 60,
  "sparkPoints": 8,
  "showSession": true,
  "hyperlink": true,
  "nextButton": true,
  "nextPort": 41214
}
```

The symbol name is an [OSC 8 hyperlink](https://code.claude.com/docs/en/statusline) to its Yahoo Finance quote page — Ctrl+click (Cmd+click on macOS) opens it in your browser. Requires a terminal with hyperlink support; if your terminal supports them but they aren't clickable, launch Claude Code with `FORCE_HYPERLINK=1`. Set `"hyperlink": false` if the link escapes garble your display.

With the plugin installed, `/ticker` manages all of this conversationally: `/ticker set NVDA, BTC-USD`, `/ticker speed 5`, `/ticker status`, `/ticker uninstall`.

## How it works

`scripts/ticker.mjs` runs on every status line refresh. It picks the current symbol from the wall clock (`now / rotateSeconds mod symbols.length` — stateless rotation, no daemon), then fetches every symbol whose cached quote is older than `cacheTtlSeconds` in parallel from `query1.finance.yahoo.com/v8/finance/chart/<symbol>?range=1d&interval=15m` (2-second timeout each). Market open/closed for the dot comes from the `currentTradingPeriod.regular` window in the same response, so it respects each exchange's hours, weekends, and holidays. Fetch failures fall back to the cached quote (marked `(cached)` after 15 minutes), or a dimmed `SYM —` if there's nothing cached yet.

The `▶` button works through a tiny localhost-only HTTP listener (`scripts/next-listener.mjs`): the button is an OSC 8 link to `http://127.0.0.1:41214/next`, and each click bumps a rotation offset that the ticker adds to its wall-clock index. The ticker script auto-starts the listener when needed (a duplicate exits instantly if the port is taken), and the listener shuts itself down after 6 idle hours. Clicking opens a brief browser tab that closes itself where allowed; the symbol advances on the next status line refresh (≤ `refreshInterval` seconds). The button only renders with 2+ symbols, and `"nextButton": false` removes it entirely.

## Tests

```
node --test
```

Zero-dependency suite using Node's built-in `node:test` — unit tests for the sparkline, market dot, hyperlink, and quote formatting, plus an end-to-end run of the script against a pre-warmed cache (no network needed). The `STOCK_TICKER_CONFIG` / `STOCK_TICKER_CACHE` env vars let tests point the script at temporary files instead of your real config.

## Disclaimer

Quotes are delayed and unofficial — this is terminal candy, not trading infrastructure.
