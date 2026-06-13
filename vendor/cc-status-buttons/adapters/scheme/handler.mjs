#!/usr/bin/env node
// ccbtn:// URI handler — invoked by the OS (or a terminal's open-uri hook)
// with the clicked URI as argv[2]: ccbtn://press/<id>?t=<token>
//
// Validates the token against the registry and dispatches. Silent: no
// browser, no window.

import { readRegistry } from '../../src/registry.mjs';
import { dispatch } from '../../src/dispatch.mjs';

const raw = process.argv[2] ?? '';
let url;
try {
  url = new URL(raw);
} catch {
  process.exit(1);
}
if (url.protocol !== 'ccbtn:') process.exit(1);

// ccbtn://press/<id> parses with host='press' and pathname='/<id>'.
const id = url.host === 'press' ? url.pathname.replace(/^\//, '') : null;
const reg = readRegistry();
if (!id || !reg || url.searchParams.get('t') !== reg.token) process.exit(1);

process.exit(dispatch(reg, id) ? 0 : 1);
