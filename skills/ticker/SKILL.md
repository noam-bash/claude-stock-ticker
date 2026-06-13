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

Next-symbol controls are platform dependent: on Linux/macOS the trailing `▶` is clickable and typing `>>` as a prompt advances via the plugin's `UserPromptSubmit` hook; on Windows the `▶` is an inactive indicator and the hook no-ops (use `/ticker next` instead).

For a truly direct click (no browser), run Claude Code inside tmux and run `node "<plugin-root>/vendor/cc-status-buttons/adapters/tmux/setup.mjs" setup` once — the `▶` becomes a clickable button in tmux's status bar that runs the advance command via `run-shell`. Inside `$TMUX` the framework's transport detection returns `tmux`, so the in-Claude-statusline `▶` renders as a plain indicator and the live button lives in the tmux bar.

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
  "hyperlink": true,
  "nextButton": true
}
```

- `symbols` — Yahoo Finance symbols, shown one at a time in rotation. Indices and crypto work too (`^GSPC`, `BTC-USD`).
- `rotateSeconds` — how long each symbol stays on screen.
- `cacheTtlSeconds` — quote cache lifetime; don't go below 30 to be polite to the API.
- `sparkPoints` — width of the intraday sparkline in characters.
- `showSession` — set `false` to hide the model/context segment.
- `hyperlink` — the symbol is an OSC 8 link to its Yahoo Finance page (Ctrl/Cmd+click). Set `false` if the user's terminal garbles the escapes; if links show but aren't clickable, suggest launching Claude Code with `FORCE_HYPERLINK=1`.
- `nextButton` — the trailing `▶`. On Linux/macOS it advances rotation via the vendored cc-status-buttons framework (silent scheme/VS Code transport where available, else a localhost bus); on Windows it renders inactive. Needs 2+ symbols; set `false` to hide it everywhere.

### Next symbol (`/ticker next`)

Increment the `offset` field (default 0) in the state file — `%TEMP%/claude-stock-ticker-state.json` (or `$TMPDIR`). This is the main manual-advance path on Windows.

On Linux/macOS users can also click `▶` or type `>>` as a prompt: the plugin's `UserPromptSubmit` hook (`hooks/hooks.json` → `vendor/cc-status-buttons/adapters/prompt-hook.mjs`) matches the registered sentinel, presses the button (running `scripts/next-symbol.mjs` to bump the offset), and blocks the prompt so it never reaches the model. On Windows the ticker registers the button without a sentinel, so the hook finds no match and passes the prompt through. The hook loads automatically with the plugin; hooks load at session start, so a new session is needed after install/uninstall.

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
