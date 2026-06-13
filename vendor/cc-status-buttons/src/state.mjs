// Runtime state (temp dir): last pressed button for render feedback.

import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const STATE_PATH =
  process.env.CC_STATUS_BUTTONS_STATE ?? join(tmpdir(), 'cc-status-buttons-state.json');

export function readState() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

export function writeState(patch) {
  const next = { ...readState(), ...patch };
  try {
    writeFileSync(STATE_PATH, JSON.stringify(next));
  } catch {
    // Non-fatal: feedback is best-effort.
  }
  return next;
}
