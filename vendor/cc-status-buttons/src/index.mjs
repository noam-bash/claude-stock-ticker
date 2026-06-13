// cc-status-buttons — clickable buttons for the Claude Code status line.
//
// Usage from a statusline script:
//
//   import { statusButtons } from 'cc-status-buttons';
//   const bar = await statusButtons([
//     { id: 'next', icon: '▶', command: ['node', '/abs/next.mjs'], sentinel: '>>' },
//   ]);
//   console.log(`my segment ${bar.render()}`);
//
// Buttons are upserted into the shared registry, the bus is started when the
// http transport is in play, and render() returns OSC 8 text with the right
// press URL for this environment.

import { upsertButtons } from './registry.mjs';
import { readState } from './state.mjs';
import { detectTransport } from './detect.mjs';
import { renderButtons } from './render.mjs';
import { ensureBus } from './ensure-bus.mjs';

export { dispatch } from './dispatch.mjs';
export { readRegistry, ensureRegistry, REGISTRY_PATH } from './registry.mjs';
export { detectTransport } from './detect.mjs';
export { renderButtons, pressUrl } from './render.mjs';

export async function statusButtons(defs, opts = {}) {
  const reg = upsertButtons(defs);
  const transport = opts.transport ?? detectTransport(reg);
  if (transport === 'http') await ensureBus(reg);

  const pressed = readState().pressed;
  const feedbackMs = opts.feedbackMs ?? 1500;
  const pressedId = pressed && Date.now() - pressed.ts < feedbackMs ? pressed.id : null;

  return {
    transport,
    registry: reg,
    render: () => renderButtons(reg, defs, { transport, pressedId, links: opts.links !== false }),
  };
}
