import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sparkline, linkify, marketDot, formatQuote } from '../scripts/ticker.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/ticker.mjs', import.meta.url));

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const BLINK = '\x1b[5m';

const NOW = 1_750_000_000_000; // fixed clock for deterministic assertions

function quoteFixture(overrides = {}) {
  return {
    price: 110,
    prevClose: 100,
    closes: [100, 105, 110],
    currency: 'USD',
    regStart: null,
    regEnd: null,
    ts: NOW,
    ...overrides,
  };
}

const POSITION = { index: 0, total: 1, sparkPoints: 8, hyperlink: false };

test('sparkline: empty input gives empty string', () => {
  assert.equal(sparkline([], 8), '');
});

test('sparkline: flat series renders mid-height bars', () => {
  assert.equal(sparkline([5, 5, 5], 8), '▄▄▄');
});

test('sparkline: rising series spans lowest to highest bar', () => {
  assert.equal(sparkline([1, 2, 3, 4, 5, 6, 7, 8], 8), '▁▂▃▄▅▆▇█');
});

test('sparkline: long series is downsampled to the requested width', () => {
  const closes = Array.from({ length: 100 }, (_, i) => i);
  assert.equal([...sparkline(closes, 8)].length, 8);
});

test('sparkline: never wider than the data', () => {
  assert.equal([...sparkline([1, 2], 8)].length, 2);
});

test('linkify: disabled returns text untouched', () => {
  assert.equal(linkify('AAPL', 'AAPL', false), 'AAPL');
});

test('linkify: wraps text in an OSC 8 link to the Yahoo quote page', () => {
  const out = linkify('AAPL', 'AAPL', true);
  assert.equal(out, '\x1b]8;;https://finance.yahoo.com/quote/AAPL\x1b\\AAPL\x1b]8;;\x1b\\');
});

test('linkify: URL-encodes index symbols like ^GSPC', () => {
  assert.ok(linkify('^GSPC', '^GSPC', true).includes('/quote/%5EGSPC'));
});

test('marketDot: green and blinking during regular trading hours', () => {
  const open = quoteFixture({ regStart: NOW / 1000 - 60, regEnd: NOW / 1000 + 60 });
  const dot = marketDot(open, NOW);
  assert.ok(dot.includes(GREEN));
  assert.ok(dot.includes(BLINK));
});

test('marketDot: steady red outside trading hours', () => {
  const closed = quoteFixture({ regStart: NOW / 1000 - 7200, regEnd: NOW / 1000 - 3600 });
  const dot = marketDot(closed, NOW);
  assert.ok(dot.includes(RED));
  assert.ok(!dot.includes(BLINK));
});

test('marketDot: red when there is no quote at all', () => {
  assert.ok(marketDot(null, NOW).includes(RED));
});

test('marketDot: pulses bright/dim across 5-second refresh windows', () => {
  const open = quoteFixture({ regStart: NOW / 1000 - 60, regEnd: NOW / 1000 + 60 });
  const a = marketDot(open, NOW);
  const b = marketDot(open, NOW + 5000);
  assert.notEqual(a, b);
});

test('formatQuote: missing quote renders a dimmed placeholder', () => {
  const out = formatQuote('NVDA', null, POSITION, NOW);
  assert.ok(out.includes('NVDA'));
  assert.ok(out.includes('—'));
});

test('formatQuote: gain shows green up-arrow percentage', () => {
  const out = formatQuote('NVDA', quoteFixture(), POSITION, NOW);
  assert.ok(out.includes('$110.00'));
  assert.ok(out.includes(`${GREEN}▲10.00%`));
});

test('formatQuote: loss shows red down-arrow percentage', () => {
  const out = formatQuote('NVDA', quoteFixture({ price: 90 }), POSITION, NOW);
  assert.ok(out.includes(`${RED}▼10.00%`));
});

test('formatQuote: non-USD currency uses its own sign', () => {
  const out = formatQuote('TEVA.TA', quoteFixture({ currency: 'ILS' }), POSITION, NOW);
  assert.ok(out.includes('₪110.00'));
});

test('formatQuote: sub-dollar prices get four decimals', () => {
  const out = formatQuote('PENNY', quoteFixture({ price: 0.1234, prevClose: 0.1 }), POSITION, NOW);
  assert.ok(out.includes('$0.1234'));
});

test('formatQuote: rotation counter only with multiple symbols', () => {
  const multi = formatQuote('NVDA', quoteFixture(), { ...POSITION, index: 1, total: 3 }, NOW);
  assert.ok(multi.includes('2/3'));
  const single = formatQuote('NVDA', quoteFixture(), POSITION, NOW);
  assert.ok(!single.includes('1/1'));
});

test('formatQuote: quotes older than 15 minutes are marked cached', () => {
  const out = formatQuote('NVDA', quoteFixture({ ts: NOW - 16 * 60 * 1000 }), POSITION, NOW);
  assert.ok(out.includes('(cached)'));
});

test('formatQuote: hyperlink option wraps the symbol', () => {
  const out = formatQuote('NVDA', quoteFixture(), { ...POSITION, hyperlink: true }, NOW);
  assert.ok(out.includes('finance.yahoo.com/quote/NVDA'));
});

// End-to-end: run the real script with a pre-warmed cache so no network is needed.
test('integration: full script renders ticker and session info from stdin', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'ticker-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const configPath = join(dir, 'config.json');
  const cachePath = join(dir, 'cache.json');
  writeFileSync(configPath, JSON.stringify({ symbols: ['TEST'], hyperlink: false }));
  writeFileSync(
    cachePath,
    JSON.stringify({ TEST: quoteFixture({ price: 123.45, prevClose: 120, ts: Date.now() }) }),
  );

  const env = { ...process.env, STOCK_TICKER_CONFIG: configPath, STOCK_TICKER_CACHE: cachePath };
  const session = { model: { display_name: 'TestModel' }, context_window: { used_percentage: 50 } };
  const res = spawnSync(process.execPath, [SCRIPT], { input: JSON.stringify(session), env, encoding: 'utf8' });

  assert.equal(res.status, 0, res.stderr);
  assert.ok(res.stdout.includes('TEST'));
  assert.ok(res.stdout.includes('$123.45'));
  assert.ok(res.stdout.includes('▲2.88%'));
  assert.ok(res.stdout.includes('TestModel'));
  assert.ok(res.stdout.includes('50% ctx'));
  assert.ok(res.stdout.includes(`${RED}●`)); // regStart/regEnd null -> closed

  // Garbage stdin must not crash; it just drops the session segment.
  const garbage = spawnSync(process.execPath, [SCRIPT], { input: 'not json', env, encoding: 'utf8' });
  assert.equal(garbage.status, 0, garbage.stderr);
  assert.ok(garbage.stdout.includes('TEST'));
  assert.ok(!garbage.stdout.includes('TestModel'));
});
