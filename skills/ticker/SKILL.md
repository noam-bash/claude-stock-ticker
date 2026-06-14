---
name: ticker
description: Manage the stock ticker status line — install it, change the symbols or rotation speed, check its status, or uninstall it. Use when the user runs /ticker, asks to change which stocks the status line shows, or wants the ticker set up or removed.
---

# Stock Ticker Status Line

This plugin shows a rotating stock ticker in the Claude Code status line:

```
● NVDA $204.87 ▲2.22% ▂▃▃▅▄▆▇ 2/4  │  Fable 5 · 34% ctx
```

The leading dot blinks green while the displayed symbol's exchange is open for regular trading and sits steady red otherwise. Blinking comes from the ANSI blink attribute (sub-second, where the terminal animates it) plus a bright/dim flip on every render as a fallback pulse — `refreshInterval: 1` gives the smoothest effect. All symbols in the list refresh once per minute (controlled by `cacheTtlSeconds`).

Symbols rotate on a timer; there is no next-symbol button. To advance manually, use `/ticker next` (see below).

The status line script lives at `scripts/ticker.mjs` in the plugin root (two directories above this SKILL.md file). Resolve it to an **absolute path with forward slashes** before using it in any settings — the status line command runs through Git Bash on Windows, where backslashes are eaten as escape characters.

## User config

All user preferences live in `~/.claude/stock-ticker.json`:

```json
{
  "symbols": ["SPY", "NVDA", "AAPL", "TSLA"],
  "rotateSeconds": 10,
  "cacheTtlSeconds": 60,
  "sparkPoints": 8,
  "showSession": true,
  "hyperlink": true
}
```

- `symbols` — Yahoo Finance symbols, shown one at a time in rotation. Indices and crypto work too (`^GSPC`, `BTC-USD`).
- `rotateSeconds` — how long each symbol stays on screen.
- `cacheTtlSeconds` — quote cache lifetime; don't go below 30 to be polite to the API.
- `sparkPoints` — width of the intraday sparkline in characters.
- `showSession` — set `false` to hide the model/context segment.
- `hyperlink` — the symbol is an OSC 8 link to its Yahoo Finance page (Ctrl/Cmd+click). Set `false` if the user's terminal garbles the escapes; if links show but aren't clickable, suggest launching Claude Code with `FORCE_HYPERLINK=1`.
- `providers` — override the fallback chain order, e.g. `["yahoo","finnhub","coingecko"]`. Default: Yahoo (two hosts), then CoinGecko for known crypto symbols, then Finnhub if a key is set.
- `finnhubKey` — optional Finnhub API key (or set `FINNHUB_API_KEY` in the environment) to enable the Finnhub fallback.

### Doctor (`/ticker doctor`)

Run `node "<plugin-root>/scripts/ticker.mjs" --doctor` and show the output: it reports the config path, symbols, the resolved provider chain, which providers respond (with latency), a live sample quote, and a hyperlink-support hint. Use it to diagnose blank quotes or missing data.

### Next symbol (`/ticker next`)

Increment the `offset` field (default 0) in the state file — `%TEMP%/claude-stock-ticker-state.json` (or `$TMPDIR`). The ticker adds `offset` to its wall-clock rotation index, so this advances the displayed symbol on the next refresh.

Every key is optional; the script falls back to the defaults shown above.

## Actions

Parse the user's intent from their request or the arguments after `/ticker`:

### Install (`/ticker install` or first-time setup)

1. Resolve the absolute path to `scripts/ticker.mjs` in this plugin.
2. Read `~/.claude/settings.json`. If it already has a `statusLine`, save that object under the key `previousStatusLine` inside `~/.claude/stock-ticker.json` so uninstall can restore it.
3. Set (preserving all other settings):
   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "node \"<absolute/forward-slash/path>/scripts/ticker.mjs\"",
       "refreshInterval": 5
     }
   }
   ```
4. If `~/.claude/stock-ticker.json` doesn't exist, create it with the defaults above and ask the user which symbols they want.
5. Tell the user the change takes effect on the next status line refresh (or after restarting Claude Code).

### Set symbols (`/ticker set NVDA, SPY, BTC-USD` or "show me Apple and the S&P")

Update the `symbols` array in `~/.claude/stock-ticker.json`. Map company names to symbols (Apple → AAPL, S&P 500 → SPY or ^GSPC). Uppercase everything. Keep other config keys untouched.

### Adjust (`/ticker speed 5`, "rotate slower", "hide the session info")

Update the matching key in `~/.claude/stock-ticker.json`.

### Status (`/ticker status`)

Run the script once with empty stdin and show the user its output, plus the current config. If the output shows `—` for a symbol, the fetch failed — check network access and that the symbol is valid on Yahoo Finance.

### Uninstall (`/ticker uninstall` or `/ticker off`)

If `previousStatusLine` exists in `~/.claude/stock-ticker.json`, restore it as `statusLine` in `~/.claude/settings.json`; otherwise remove the `statusLine` key entirely. Leave `~/.claude/stock-ticker.json` in place so a reinstall keeps the user's symbols.
