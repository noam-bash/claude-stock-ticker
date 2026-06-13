// Turn button definitions into OSC 8 status line text.

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

export function pressUrl(reg, transport, id) {
  const t = reg.token;
  switch (transport) {
    case 'scheme':
      return `ccbtn://press/${id}?t=${t}`;
    case 'vscode':
      return `${reg.transports?.vscodeUri ?? 'vscode://noam-bash.cc-status-buttons'}/press/${id}?t=${t}`;
    default:
      return `http://127.0.0.1:${reg.port}/press/${id}?t=${t}`;
  }
}

export function renderButtons(reg, defs, { transport = 'http', pressedId = null, links = true } = {}) {
  return defs
    .map((d) => {
      // Recently pressed buttons render bold for one feedback window.
      const icon = pressedId === d.id ? `${BOLD}${d.icon}${RESET}` : `${DIM}${d.icon}${RESET}`;
      if (!links || transport === 'none') return icon;
      const url = pressUrl(reg, transport, d.id);
      return `\x1b]8;;${url}\x1b\\${icon}\x1b]8;;\x1b\\`;
    })
    .join(' ');
}
