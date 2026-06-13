// Shared press dispatcher used by every transport (bus, scheme handler,
// prompt hook, VS Code extension reimplements it standalone).

import { spawn } from 'node:child_process';
import { writeState } from './state.mjs';

export function dispatch(reg, id) {
  const btn = reg?.buttons?.[id];
  if (!btn) return false;
  writeState({ pressed: { id, ts: Date.now() } });
  if (Array.isArray(btn.command) && btn.command.length) {
    try {
      const [cmd, ...args] = btn.command;
      // Exec form, no shell: registry contents never reach a shell parser.
      spawn(cmd, args, { detached: true, stdio: 'ignore', shell: false }).unref();
    } catch {
      return false;
    }
  }
  return true;
}
