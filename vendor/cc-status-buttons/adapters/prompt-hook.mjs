#!/usr/bin/env node
// Claude Code UserPromptSubmit hook: typing a button's sentinel (e.g. '>>')
// as a prompt presses that button instead of going to the model.
//
// Wire it up in ~/.claude/settings.json (or ship it from a plugin's
// hooks/hooks.json):
//   { "hooks": { "UserPromptSubmit": [ { "hooks": [
//     { "type": "command", "command": "node \"/abs/path/adapters/prompt-hook.mjs\"" }
//   ] } ] } }

import { readRegistry } from '../src/registry.mjs';
import { dispatch } from '../src/dispatch.mjs';

let input = '';
for await (const chunk of process.stdin) input += chunk;

let prompt = '';
try {
  prompt = String(JSON.parse(input).prompt ?? '').trim();
} catch {
  process.exit(0);
}
if (!prompt) process.exit(0);

const reg = readRegistry();
if (!reg?.buttons) process.exit(0);

const entry = Object.entries(reg.buttons).find(([, b]) => b.sentinel && b.sentinel === prompt);
if (!entry) process.exit(0); // normal prompt — pass through untouched

const [id, btn] = entry;
dispatch(reg, id);
console.log(JSON.stringify({ decision: 'block', reason: `${btn.icon ?? '•'} pressed: ${id}` }));
