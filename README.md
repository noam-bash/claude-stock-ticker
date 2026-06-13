# stock-ticker — a live stock ticker for the Claude Code status line

Replaces the bottom status bar with a rotating mini stock ticker — price, daily change, and an intraday sparkline — while keeping your model and context usage in view:

```
● NVDA $204.87 ▲2.22% ▂▃▃▅▄▆▇ 2/4 ▶  │  Fable 5 · 34% ctx
```

The leading dot shows market status for the displayed symbol's exchange: blinking green while the market is open for regular trading, steady red otherwise (pre/post-market, weekends, holidays). The blink is two layers: the ANSI blink attribute gives sub-second flashing in terminals that animate it (Windows Terminal does), and the dot also alternates bright/dim on every status line render as a fallback pulse — set `refreshInterval: 1` for the smoothest effect.

**Next symbol on demand — platform dependent.** The `▶` next-symbol button is powered by [cc-status-buttons](https://github.com/noam-bash/cc-status-buttons) (vendored under `vendor/`), which picks the best click transport for your environment:

- **Linux/macOS**: the trailing `▶` is a clickable button (Ctrl/Cmd+click) that advances the rotation forward, wrapping around — silent `ccbtn://` / `vscode://` clicks where available, otherwise a localhost button bus. Typing `>>` as a prompt also works: a `UserPromptSubmit` hook intercepts it before it reaches the model (no tokens spent) and bumps the rotation.
- **Windows**: every click route is janky (http links steal focus to the browser; Windows Terminal won't silently execute custom schemes), so the button framework's `none` transport is forced — the `▶` renders as an inactive rotation indicator and the prompt sentinel is dropped. The rotation is timer-driven; to force an advance, bump the `offset` field in `%TEMP%\claude-stock-ticker-state.json` or ask Claude via `/ticker next`.

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

The `▶` button is registered with the vendored [cc-status-buttons](https://github.com/noam-bash/cc-status-buttons) framework, whose press handler runs `scripts/next-symbol.mjs` to bump a rotation offset the ticker adds to its wall-clock index. The framework owns the click transport (silent custom-scheme / VS Code URI where available, a token-gated localhost bus elsewhere, or the decorative `none` transport on Windows) and the `>>` prompt sentinel. The symbol advances on the next status line refresh (≤ `refreshInterval` seconds). The button only renders with 2+ symbols, and `"nextButton": false` removes it entirely.

## Tests

```
node --test
```

Zero-dependency suite using Node's built-in `node:test` — unit tests for the sparkline, market dot, hyperlink, and quote formatting, plus end-to-end runs of the script against a pre-warmed cache (no network): active button on non-Windows, decorative button on Windows, `next-symbol` offset bump, and the vendored prompt-hook sentinel press. The `STOCK_TICKER_CONFIG` / `STOCK_TICKER_CACHE` / `STOCK_TICKER_STATE` and `CC_STATUS_BUTTONS_*` env vars let tests point at temporary files instead of your real config.

## Disclaimer

Quotes are delayed and unofficial — this is terminal candy, not trading infrastructure.
