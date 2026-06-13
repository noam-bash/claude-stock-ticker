# stock-ticker — a live stock ticker for the Claude Code status line

Replaces the bottom status bar with a rotating mini stock ticker — price, daily change, and an intraday sparkline — while keeping your model and context usage in view:

```
● NVDA $204.87 ▲2.22% ▂▃▃▅▄▆▇ 2/4 ▶  │  Fable 5 · 34% ctx
```

The leading dot shows market status for the displayed symbol's exchange: blinking green while the market is open for regular trading, steady red otherwise (pre/post-market, weekends, holidays). The blink is two layers: the ANSI blink attribute gives sub-second flashing in terminals that animate it (Windows Terminal does), and the dot also alternates bright/dim on every status line render as a fallback pulse — set `refreshInterval: 1` for the smoothest effect.

**Next symbol — tmux only.** The trailing `▶` always renders as a plain symbol in Claude Code's status line; there is deliberately **no inline click mechanism** (no localhost bus, no `ccbtn://` scheme, no `vscode://`, no `>>` prompt sentinel) on any OS or terminal. A status line is one-way text — the browser/daemon dances those transports require aren't worth it.

The one place a status-line button can run a command on click *directly* is **tmux**, which owns its own status bar and mouse events. Run Claude Code inside tmux and, once, wire it up via the vendored [cc-status-buttons](https://github.com/noam-bash/cc-status-buttons):

```
node "<plugin-root>/vendor/cc-status-buttons/adapters/tmux/setup.mjs" setup     # teardown to remove
```

This puts the `▶` into tmux's `status-right` as a clickable region; a click runs `scripts/next-symbol.mjs` via `run-shell` — no browser, no daemon, no token. (Render the ticker once first so the button is registered; needs tmux 3.3+.) Everywhere else the `▶` is a decorative indicator; rotation is timer-driven, and you can always force an advance by bumping the `offset` field in `%TEMP%`/`$TMPDIR`'s `claude-stock-ticker-state.json` or asking Claude via `/ticker next`.

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
  "nextButton": true
}
```

The symbol name is an [OSC 8 hyperlink](https://code.claude.com/docs/en/statusline) to its Yahoo Finance quote page — Ctrl+click (Cmd+click on macOS) opens it in your browser. Requires a terminal with hyperlink support; if your terminal supports them but they aren't clickable, launch Claude Code with `FORCE_HYPERLINK=1`. Set `"hyperlink": false` if the link escapes garble your display.

With the plugin installed, `/ticker` manages all of this conversationally: `/ticker set NVDA, BTC-USD`, `/ticker speed 5`, `/ticker status`, `/ticker uninstall`.

## How it works

`scripts/ticker.mjs` runs on every status line refresh. It picks the current symbol from the wall clock (`now / rotateSeconds mod symbols.length` — stateless rotation, no daemon), then fetches every symbol whose cached quote is older than `cacheTtlSeconds` in parallel from `query1.finance.yahoo.com/v8/finance/chart/<symbol>?range=1d&interval=15m` (2-second timeout each). Market open/closed for the dot comes from the `currentTradingPeriod.regular` window in the same response, so it respects each exchange's hours, weekends, and holidays. Fetch failures fall back to the cached quote (marked `(cached)` after 15 minutes), or a dimmed `SYM —` if there's nothing cached yet.

The `▶` is registered with the vendored [cc-status-buttons](https://github.com/noam-bash/cc-status-buttons) framework using its `none` transport, so it renders as a plain symbol with no inline click handler. Registration still records the button's command (`scripts/next-symbol.mjs`, which bumps a rotation offset the ticker adds to its wall-clock index) and a short tmux range token, so `tmux-setup` can surface it as a clickable button in tmux's status bar. A press advances the symbol on the next status line refresh (≤ `refreshInterval` seconds). The button only renders with 2+ symbols, and `"nextButton": false` removes it entirely.

## Tests

```
node --test
```

Zero-dependency suite using Node's built-in `node:test` — unit tests for the sparkline, market dot, hyperlink, and quote formatting, plus end-to-end runs of the script against a pre-warmed cache (no network): active button on non-Windows, decorative button on Windows, `next-symbol` offset bump, and the vendored prompt-hook sentinel press. The `STOCK_TICKER_CONFIG` / `STOCK_TICKER_CACHE` / `STOCK_TICKER_STATE` and `CC_STATUS_BUTTONS_*` env vars let tests point at temporary files instead of your real config.

## Disclaimer

Quotes are delayed and unofficial — this is terminal candy, not trading infrastructure.
