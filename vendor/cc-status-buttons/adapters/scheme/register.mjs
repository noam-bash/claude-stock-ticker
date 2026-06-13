#!/usr/bin/env node
// Register (or unregister) the ccbtn:// scheme handler for this OS, then
// flag the transport as available in the registry so detect() can pick it.
//
//   node register.mjs register
//   node register.mjs unregister
//
// Linux: ~/.local/share/applications/cc-status-buttons.desktop + xdg-mime.
// macOS: a minimal AppleScript app bundle with CFBundleURLTypes (untested on
//        CI; built on first run via osacompile).
// Windows: not supported — Windows Terminal only opens http/https/file links.
// WezTerm/kitty: registration is in the terminal config; this script prints
//        the snippet and flags the transport when asked.

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureRegistry, writeRegistry } from '../../src/registry.mjs';

const action = process.argv[2] ?? 'register';
const platform = process.env.CC_STATUS_BUTTONS_PLATFORM ?? process.platform;
const HANDLER = fileURLToPath(new URL('./handler.mjs', import.meta.url));

function setFlag(value) {
  const reg = ensureRegistry();
  reg.transports.scheme = value;
  writeRegistry(reg);
}

function wezKittySnippets() {
  console.log(`
For WezTerm, add to ~/.wezterm.lua:

  wezterm.on('open-uri', function(window, pane, uri)
    if uri:find('^ccbtn:') == 1 then
      wezterm.background_child_process({ '${process.execPath.replaceAll('\\', '/')}', '${HANDLER.replaceAll('\\', '/')}', uri })
      return false -- suppress the default browser
    end
  end)

For kitty, add to ~/.config/kitty/open-actions.conf:

  protocol ccbtn
  action launch --type=background ${process.execPath} ${HANDLER} \${URL}

Then re-run with: node register.mjs mark   (flags the transport as available)
`);
}

if (action === 'mark') {
  setFlag(true);
  console.log('scheme transport flagged as available.');
  process.exit(0);
}

if (platform === 'win32') {
  console.error('ccbtn:// is not clickable in Windows Terminal (http/https/file only) — nothing to register.');
  process.exit(1);
}

if (platform === 'linux') {
  const appsDir = join(homedir(), '.local', 'share', 'applications');
  const desktopPath = join(appsDir, 'cc-status-buttons.desktop');
  if (action === 'unregister') {
    rmSync(desktopPath, { force: true });
    setFlag(false);
    console.log('unregistered ccbtn:// handler.');
    process.exit(0);
  }
  mkdirSync(appsDir, { recursive: true });
  writeFileSync(
    desktopPath,
    `[Desktop Entry]
Type=Application
Name=CC Status Buttons
NoDisplay=true
Exec=${process.execPath} ${HANDLER} %u
MimeType=x-scheme-handler/ccbtn;
`,
  );
  try {
    execFileSync('xdg-mime', ['default', 'cc-status-buttons.desktop', 'x-scheme-handler/ccbtn']);
    execFileSync('update-desktop-database', [appsDir]);
  } catch {
    // Best effort; some distros pick up the .desktop file without these.
  }
  setFlag(true);
  console.log(`registered ccbtn:// → ${desktopPath}`);
  console.log('Note: whether terminal clicks reach xdg-open depends on your emulator;');
  wezKittySnippets();
  process.exit(0);
}

if (platform === 'darwin') {
  const appPath = join(homedir(), 'Applications', 'CCStatusButtons.app');
  if (action === 'unregister') {
    rmSync(appPath, { recursive: true, force: true });
    setFlag(false);
    console.log('unregistered (removed app bundle).');
    process.exit(0);
  }
  // Build a minimal AppleScript app whose open-location handler forwards the
  // URI to handler.mjs, then declare the ccbtn scheme in its Info.plist.
  const scriptSrc = `on open location theURL
  do shell script "${process.execPath} " & quoted form of "${HANDLER}" & " " & quoted form of theURL
end open location`;
  const tmpScript = join(homedir(), '.cc-status-buttons-handler.applescript');
  writeFileSync(tmpScript, scriptSrc);
  execFileSync('osacompile', ['-o', appPath, tmpScript]);
  const plist = join(appPath, 'Contents', 'Info.plist');
  let xml = readFileSync(plist, 'utf8');
  if (!xml.includes('CFBundleURLTypes')) {
    xml = xml.replace(
      '</dict>\n</plist>',
      `\t<key>CFBundleURLTypes</key>\n\t<array>\n\t\t<dict>\n\t\t\t<key>CFBundleURLName</key>\n\t\t\t<string>cc-status-buttons</string>\n\t\t\t<key>CFBundleURLSchemes</key>\n\t\t\t<array>\n\t\t\t\t<string>ccbtn</string>\n\t\t\t</array>\n\t\t</dict>\n\t</array>\n</dict>\n</plist>`,
    );
    writeFileSync(plist, xml);
  }
  try {
    execFileSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', appPath]);
  } catch {
    // Launch Services usually notices new bundles in ~/Applications on its own.
  }
  setFlag(true);
  console.log(`registered ccbtn:// → ${appPath}`);
  process.exit(0);
}

console.error(`unsupported platform: ${platform}`);
wezKittySnippets();
process.exit(1);
