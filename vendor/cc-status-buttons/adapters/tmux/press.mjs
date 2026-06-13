#!/usr/bin/env node
// tmux press dispatcher. Bound to MouseDown1Status, invoked with the clicked
// element's #{mouse_status_range} token as argv[2]. Finds the button whose
// tmuxRange matches and dispatches it — no browser, no daemon, no token URL.

import { readRegistry } from '../../src/registry.mjs';
import { dispatch } from '../../src/dispatch.mjs';

const token = process.argv[2] ?? '';
const reg = readRegistry();
if (!reg?.buttons) process.exit(0);

const entry = Object.entries(reg.buttons).find(([, b]) => b.tmuxRange === token);
if (!entry) process.exit(0); // not one of our button ranges — ignore

process.exit(dispatch(reg, entry[0]) ? 0 : 1);
