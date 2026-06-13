// Make sure the bus is running: cheap ping, spawn detached on miss.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export async function ensureBus(reg) {
  const port = reg.port;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 250);
  try {
    await fetch(`http://127.0.0.1:${port}/ping`, { signal: ctrl.signal });
    return;
  } catch {
    // Not running yet.
  } finally {
    clearTimeout(timer);
  }
  const bus = fileURLToPath(new URL('./bus.mjs', import.meta.url));
  spawn(process.execPath, [bus, String(port)], { detached: true, stdio: 'ignore' }).unref();
}
