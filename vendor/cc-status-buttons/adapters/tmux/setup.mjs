#!/usr/bin/env node
// Wire clickable cc-status-buttons into a running tmux server.
//
//   node setup.mjs setup     enable mouse, add the button segment to
//                            status-right, bind MouseDown1Status -> press
//   node setup.mjs teardown  remove the binding and the segment
//   node setup.mjs segment   print the status-right segment (for manual use)
//
// The click is handled entirely by tmux: a click on a button's range fires
// MouseDown1Status, tmux passes #{mouse_status_range} to press.mjs, which
// dispatches the button's command. No browser, no daemon, no token.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ensureRegistry, writeRegistry, readRegistry } from '../../src/registry.mjs';

const PRESS = fileURLToPath(new URL('./press.mjs', import.meta.url));
const NODE = process.execPath;
const MARKER_START = '#[range=user|';

function tmux(args) {
  return execFileSync('tmux', args, { encoding: 'utf8' }).trim();
}

// Build the status-right segment: each button icon wrapped in a clickable range.
function segment(reg) {
  const btns = Object.values(reg.buttons ?? {});
  if (!btns.length) return '';
  return btns.map((b) => `#[range=user|${b.tmuxRange}]${b.icon}#[norange]`).join(' ');
}

function currentStatusRight() {
  try {
    return tmux(['show-options', '-gv', 'status-right']);
  } catch {
    return '';
  }
}

// Our segment, if present, always sits at the end after a separator we own.
const SEP = ' #[fg=default]';
function stripOurs(sr) {
  const i = sr.indexOf(SEP + MARKER_START);
  return i === -1 ? sr : sr.slice(0, i);
}

const action = process.argv[2] ?? 'setup';
const reg = action === 'teardown' ? readRegistry() ?? {} : ensureRegistry();

if (action === 'segment') {
  process.stdout.write(segment(reg));
  process.exit(0);
}

try {
  tmux(['display-message', '-p', '#{version}']); // probe: are we talking to a server?
} catch {
  console.error('No tmux server reachable. Start tmux (and run this inside it) first.');
  process.exit(1);
}

if (action === 'teardown') {
  try {
    tmux(['unbind-key', '-n', 'MouseDown1Status']);
  } catch {}
  tmux(['set-option', '-g', 'status-right', stripOurs(currentStatusRight())]);
  if (reg.transports) {
    reg.transports.tmux = false;
    writeRegistry(reg);
  }
  console.log('tmux buttons removed (mouse setting left as-is).');
  process.exit(0);
}

// setup
const seg = segment(reg);
if (!seg) {
  console.error('No buttons registered yet — run your status line once, then re-run setup.');
  process.exit(1);
}

tmux(['set-option', '-g', 'mouse', 'on']);
tmux(['set-option', '-g', 'status-right', stripOurs(currentStatusRight()) + SEP + seg]);

// Click a button range -> press.mjs; click anything else -> default behaviour.
const then = `run-shell "${NODE} '${PRESS}' #{mouse_status_range}"`;
tmux([
  'bind-key',
  '-n',
  'MouseDown1Status',
  'if-shell',
  '-F',
  '#{m:b*,#{mouse_status_range}}',
  then,
  'select-window -t=',
]);

reg.transports.tmux = true;
writeRegistry(reg);

console.log('tmux buttons wired up:');
console.log(`  buttons: ${Object.keys(reg.buttons).join(', ')}`);
console.log('  click a button in the status bar (bottom-right) to press it.');
console.log('  run "node setup.mjs teardown" to remove.');
