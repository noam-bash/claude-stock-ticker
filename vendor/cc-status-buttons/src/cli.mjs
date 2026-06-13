#!/usr/bin/env node
// CLI: npx cc-status-buttons <command>
//
//   status                 show registry, transport detection, bus liveness
//   press <id>             press a button from the shell (no token needed —
//                          you already have file access)
//   bus                    run the bus in the foreground
//   register-scheme        register the ccbtn:// handler for this OS
//   unregister-scheme      remove the ccbtn:// handler registration

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readRegistry, ensureRegistry, REGISTRY_PATH } from './registry.mjs';
import { dispatch } from './dispatch.mjs';
import { detectTransport } from './detect.mjs';

// Don't crash when piped to a closed reader (e.g. `... | head`).
process.stdout.on('error', (e) => {
  if (e.code === 'EPIPE') process.exit(0);
});

const [cmd, arg] = process.argv.slice(2);

async function busAlive(port) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 300);
  try {
    await fetch(`http://127.0.0.1:${port}/ping`, { signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

switch (cmd) {
  case 'status': {
    const reg = ensureRegistry();
    console.log(`registry: ${REGISTRY_PATH}`);
    console.log(`port: ${reg.port}`);
    console.log(`transport (detected): ${detectTransport(reg)}`);
    console.log(`transports registered: ${JSON.stringify(reg.transports)}`);
    console.log(`bus alive: ${await busAlive(reg.port)}`);
    console.log(`buttons: ${Object.keys(reg.buttons).join(', ') || '(none)'}`);
    break;
  }
  case 'press': {
    const reg = readRegistry();
    if (!arg || !dispatch(reg, arg)) {
      console.error(`unknown button: ${arg ?? '(missing id)'}`);
      process.exit(1);
    }
    console.log(`pressed: ${arg}`);
    break;
  }
  case 'bus': {
    const bus = fileURLToPath(new URL('./bus.mjs', import.meta.url));
    const reg = ensureRegistry();
    spawnSync(process.execPath, [bus, String(reg.port)], { stdio: 'inherit' });
    break;
  }
  case 'register-scheme':
  case 'unregister-scheme': {
    const script = fileURLToPath(new URL('../adapters/scheme/register.mjs', import.meta.url));
    const res = spawnSync(process.execPath, [script, cmd === 'register-scheme' ? 'register' : 'unregister'], {
      stdio: 'inherit',
    });
    process.exit(res.status ?? 0);
    break;
  }
  case 'tmux-setup':
  case 'tmux-teardown': {
    const script = fileURLToPath(new URL('../adapters/tmux/setup.mjs', import.meta.url));
    const res = spawnSync(process.execPath, [script, cmd === 'tmux-setup' ? 'setup' : 'teardown'], {
      stdio: 'inherit',
    });
    process.exit(res.status ?? 0);
    break;
  }
  default:
    console.log(
      'usage: cc-status-buttons <status|press <id>|bus|register-scheme|unregister-scheme|tmux-setup|tmux-teardown>',
    );
    process.exit(cmd ? 1 : 0);
}
