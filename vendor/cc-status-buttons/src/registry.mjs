// Persistent button registry: ~/.claude/status-buttons.json
//
// Holds the bus port, the per-install secret token (gates every press so a
// random webpage can't fetch() the localhost bus), the declared buttons, and
// which optional transports are registered on this machine.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const REGISTRY_PATH =
  process.env.CC_STATUS_BUTTONS_REGISTRY ?? join(homedir(), '.claude', 'status-buttons.json');

export const DEFAULT_PORT = 41999;

export function readRegistry() {
  try {
    return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  } catch {
    return null;
  }
}

export function writeRegistry(reg) {
  mkdirSync(dirname(REGISTRY_PATH), { recursive: true });
  writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2));
}

export function ensureRegistry() {
  const reg = readRegistry() ?? {};
  let changed = false;
  if (!reg.port) {
    reg.port = DEFAULT_PORT;
    changed = true;
  }
  if (!reg.token) {
    reg.token = randomBytes(16).toString('hex');
    changed = true;
  }
  if (!reg.buttons) {
    reg.buttons = {};
    changed = true;
  }
  if (!reg.transports) {
    reg.transports = {};
    changed = true;
  }
  if (changed) writeRegistry(reg);
  return reg;
}

// Idempotent upsert of button definitions; returns the current registry.
export function upsertButtons(defs) {
  const reg = ensureRegistry();
  let changed = false;
  for (const d of defs) {
    if (!/^[\w-]+$/.test(d.id)) throw new Error(`invalid button id: ${d.id}`);
    if (d.command && !Array.isArray(d.command)) {
      throw new Error(`button ${d.id}: command must be an array (exec form, no shell)`);
    }
    const entry = {
      icon: d.icon ?? '•',
      command: d.command ?? null,
      sentinel: d.sentinel ?? null,
    };
    if (JSON.stringify(reg.buttons[d.id]) !== JSON.stringify(entry)) {
      reg.buttons[d.id] = entry;
      changed = true;
    }
  }
  if (changed) writeRegistry(reg);
  return reg;
}
