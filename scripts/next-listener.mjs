#!/usr/bin/env node
// Tiny localhost listener backing the status line's ▶ next-symbol button.
//
// The status line is plain text, so the only clickable affordance is an OSC 8
// hyperlink. The ▶ button links to http://127.0.0.1:<port>/next, which this
// process serves: each hit bumps the rotation offset in the shared state file,
// and the ticker script picks it up on its next refresh. ticker.mjs spawns
// this on demand; a second copy exits immediately when the port is taken.

import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.argv[2]) || 41214;
const STATE_PATH = process.env.STOCK_TICKER_STATE ?? join(tmpdir(), 'claude-stock-ticker-state.json');

// Exit after 6 idle hours so we don't outlive the workday.
const IDLE_MS = 6 * 60 * 60 * 1000;
let idleTimer = setTimeout(() => process.exit(0), IDLE_MS);

const server = createServer((req, res) => {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => process.exit(0), IDLE_MS);

  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/ping') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (path === '/next') {
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
      // Non-fatal; the click is simply lost.
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      '<!doctype html><title>Next symbol</title><script>window.close()</script>' +
        '<body style="font-family:system-ui">Next symbol ✓ — you can close this tab.</body>',
    );
    return;
  }
  res.writeHead(404);
  res.end();
});

server.on('error', () => process.exit(0)); // port taken: another instance is already serving
server.listen(PORT, '127.0.0.1');
