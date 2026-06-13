#!/usr/bin/env node
// The button bus: one shared localhost daemon serving every registered
// button. GET /press/<id>?t=<token> dispatches the button's command.
//
// - Token-gated: browser JS on any webpage can fetch() localhost, so presses
//   without the per-install secret are rejected with 403.
// - Localhost-only bind; exits if the port is taken (another bus is running);
//   exits after 6 idle hours.

import { createServer } from 'node:http';
import { readRegistry } from './registry.mjs';
import { dispatch } from './dispatch.mjs';

const PORT = Number(process.argv[2]) || readRegistry()?.port || 41999;

const IDLE_MS = 6 * 60 * 60 * 1000;
let idleTimer = setTimeout(() => process.exit(0), IDLE_MS);

const server = createServer((req, res) => {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => process.exit(0), IDLE_MS);

  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/ping') {
    res.writeHead(204);
    res.end();
    return;
  }

  const match = url.pathname.match(/^\/press\/([\w-]+)$/);
  const reg = readRegistry();
  if (!match || !reg) {
    res.writeHead(404);
    res.end();
    return;
  }
  if (!reg.token || url.searchParams.get('t') !== reg.token) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (!dispatch(reg, match[1])) {
    res.writeHead(404);
    res.end();
    return;
  }

  if (url.searchParams.get('r') === 'page') {
    // Self-closing page variant for browsers that keep blank tabs on 204.
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(
      '<!doctype html><title>✓</title><script>window.close();setTimeout(window.close,50)</script>' +
        '<body style="font-family:system-ui;color:#888">pressed ✓</body>',
    );
    return;
  }
  res.writeHead(204, { 'Cache-Control': 'no-store' });
  res.end();
});

server.on('error', () => process.exit(0));
server.listen(PORT, '127.0.0.1');
