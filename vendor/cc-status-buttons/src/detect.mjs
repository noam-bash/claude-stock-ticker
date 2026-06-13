// Pick the best click transport for the current environment.
//
// Order of preference: an explicitly forced transport, then silent transports
// where this machine has them registered (VS Code URI handler, ccbtn://
// scheme), then the universal http fallback.

export function detectTransport(reg, env = process.env, platform = undefined) {
  const plat = platform ?? env.CC_STATUS_BUTTONS_PLATFORM ?? process.platform;
  if (env.CC_STATUS_BUTTONS_TRANSPORT) return env.CC_STATUS_BUTTONS_TRANSPORT;

  const transports = reg?.transports ?? {};
  if (env.TERM_PROGRAM === 'vscode' && transports.vscode) return 'vscode';
  if ((env.WEZTERM_EXECUTABLE || env.KITTY_WINDOW_ID) && transports.scheme) return 'scheme';
  // Windows Terminal only opens http/https/file links, so schemes are out.
  if (env.WT_SESSION) return 'http';
  if ((plat === 'darwin' || plat === 'linux') && transports.scheme) return 'scheme';
  return 'http';
}
