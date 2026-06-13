#!/usr/bin/env node
// Button command for the ▶ next-symbol button: bumps the ticker's rotation
// offset in its state file. Invoked by cc-status-buttons (bus / scheme /
// vscode / prompt) on press. Kept separate from the framework's own state so
// the ticker owns its rotation.

import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const STATE_PATH = process.env.STOCK_TICKER_STATE ?? join(tmpdir(), 'claude-stock-ticker-state.json');

let state = {};
try {
  state = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
} catch {
  // Missing or corrupt state starts over at offset 0.
}
state.offset = (Number(state.offset) || 0) + 1;
try {
  writeFileSync(STATE_PATH, JSON.stringify(state));
} catch {
  // Non-fatal; the press is simply lost.
}
