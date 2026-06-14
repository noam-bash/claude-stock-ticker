import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sparkline, linkify, marketDot, formatQuote, pickIndex, writeJsonAtomic, readJson, pctChange, compactItem, renderCompact, renderPortfolio } from '../scripts/ticker.mjs';
import { yahoo, coingecko, finnhub, isCrypto, providerChain, resolveQuote } from '../scripts/providers.mjs';

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

test('linkify: wraps text in an OSC 8 link to the given URL', () => {
  const out = linkify('AAPL', 'https://finance.yahoo.com/quote/AAPL', true);
  assert.equal(out, '\x1b]8;;https://finance.yahoo.com/quote/AAPL\x1b\\AAPL\x1b]8;;\x1b\\');
});

test('formatQuote: URL-encodes index symbols like ^GSPC in the link', () => {
  const out = formatQuote('^GSPC', quoteFixture(), { ...POSITION, hyperlink: true }, NOW);
  assert.ok(out.includes('/quote/%5EGSPC'));
});

test('pickIndex: rotates with the wall clock', () => {
  const i0 = pickIndex(0, 10, 0, 4);
  const i1 = pickIndex(10_000, 10, 0, 4);
  assert.equal(i0, 0);
  assert.equal(i1, 1);
});

test('pickIndex: manual offset advances and wraps', () => {
  assert.equal(pickIndex(0, 10, 1, 4), 1);
  assert.equal(pickIndex(0, 10, 4, 4), 0);
  assert.equal(pickIndex(30_000, 10, 2, 4), 1); // (3 + 2) % 4
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

test('marketDot: pulses bright/dim across half-second windows', () => {
  const open = quoteFixture({ regStart: NOW / 1000 - 60, regEnd: NOW / 1000 + 60 });
  const a = marketDot(open, NOW);
  const b = marketDot(open, NOW + 500);
  assert.notEqual(a, b);
  assert.equal(a, marketDot(open, NOW + 1000)); // full period returns to the same frame
});

test('marketDot: explicit frame parameter drives the pulse', () => {
  const open = quoteFixture({ regStart: NOW / 1000 - 60, regEnd: NOW / 1000 + 60 });
  assert.notEqual(marketDot(open, NOW, true), marketDot(open, NOW, false));
  // Closed market ignores the frame: steady red either way.
  const closed = quoteFixture({ regStart: 0, regEnd: 1 });
  assert.equal(marketDot(closed, NOW, true), marketDot(closed, NOW, false));
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

// The ticker rotates purely on a timer — there is no next-symbol button of any
// kind, on any OS/terminal.
test('integration: no button is rendered (no ▶ or click transport)', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'ticker-nobtn-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const configPath = join(dir, 'config.json');
  const cachePath = join(dir, 'cache.json');
  writeFileSync(configPath, JSON.stringify({ symbols: ['AAA', 'BBB'], showSession: false }));
  writeFileSync(
    cachePath,
    JSON.stringify({ AAA: quoteFixture({ ts: Date.now() }), BBB: quoteFixture({ ts: Date.now() }) }),
  );
  const env = { ...process.env, STOCK_TICKER_CONFIG: configPath, STOCK_TICKER_CACHE: cachePath };

  const res = spawnSync(process.execPath, [SCRIPT], { input: '{}', env, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.ok(/AAA|BBB/.test(res.stdout));
  assert.ok(!res.stdout.includes('▶'));
  assert.ok(!res.stdout.includes('ccbtn://'));
  assert.ok(!res.stdout.includes('127.0.0.1'));
});

// Blank/whitespace-only symbols must not survive into an empty list (which
// rendered a bold "undefined" linking to /quote/undefined).
test('integration: whitespace-only symbols fall back to defaults, never "undefined"', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'ticker-blank-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const configPath = join(dir, 'config.json');
  writeFileSync(configPath, JSON.stringify({ symbols: ['  ', ''], showSession: false }));
  const env = { ...process.env, STOCK_TICKER_CONFIG: configPath, STOCK_TICKER_CACHE: join(dir, 'cache.json') };

  const res = spawnSync(process.execPath, [SCRIPT], { input: '{}', env, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.ok(!res.stdout.toLowerCase().includes('undefined'));
  assert.ok(!res.stdout.includes('quote/undefined'));
});

// --- Providers (all mocked, no network) ---
function withFetch(fn, run) {
  const real = globalThis.fetch;
  globalThis.fetch = fn;
  return Promise.resolve(run()).finally(() => {
    globalThis.fetch = real;
  });
}

const YAHOO_OK = {
  ok: true,
  json: async () => ({
    chart: {
      result: [
        {
          meta: {
            regularMarketPrice: 123.45,
            chartPreviousClose: 120,
            currency: 'USD',
            currentTradingPeriod: { regular: { start: 1000, end: 2000 } },
            regularMarketDayHigh: 125,
            regularMarketDayLow: 119,
            regularMarketVolume: 9000,
            fiftyTwoWeekHigh: 200,
            fiftyTwoWeekLow: 80,
          },
          indicators: { quote: [{ close: [100, null, 110] }] },
        },
      ],
    },
  }),
};

test('yahoo: parses a chart response with enriched fields', () =>
  withFetch(async () => YAHOO_OK, async () => {
    const q = await yahoo('TEST');
    assert.equal(q.price, 123.45);
    assert.equal(q.prevClose, 120);
    assert.deepEqual(q.closes, [100, 110]);
    assert.equal(q.currency, 'USD');
    assert.equal(q.regStart, 1000);
    assert.equal(q.dayHigh, 125);
    assert.equal(q.volume, 9000);
    assert.equal(q.week52High, 200);
    assert.equal(q.source, 'yahoo');
  }));

test('yahoo: null on non-ok or missing price', () =>
  withFetch(async () => ({ ok: false, json: async () => ({}) }), async () => {
    assert.equal(await yahoo('TEST'), null);
  }));

test('coingecko: maps crypto symbol and derives prevClose from 24h change', () =>
  withFetch(async () => ({ ok: true, json: async () => ({ bitcoin: { usd: 110, usd_24h_change: 10 } }) }), async () => {
    const q = await coingecko('BTC-USD');
    assert.equal(q.price, 110);
    assert.ok(Math.abs(q.prevClose - 100) < 1e-9); // 110 / 1.10
    assert.equal(q.source, 'coingecko');
    assert.ok(q.regStart < Date.now() / 1000 && q.regEnd > Date.now() / 1000); // 24/7 open
    assert.equal(await coingecko('AAPL'), null); // not a known coin
  }));

test('finnhub: needs a key, parses c/pc', async () => {
  assert.equal(await finnhub('AAPL', {}), null); // no key
  await withFetch(async () => ({ ok: true, json: async () => ({ c: 50, pc: 48, h: 51, l: 47 }) }), async () => {
    const q = await finnhub('AAPL', { finnhubKey: 'k' });
    assert.equal(q.price, 50);
    assert.equal(q.prevClose, 48);
    assert.equal(q.source, 'finnhub');
  });
});

test('isCrypto + providerChain: defaults and overrides', () => {
  assert.equal(isCrypto('BTC-USD'), true);
  assert.equal(isCrypto('AAPL'), false);
  assert.equal(isCrypto('FOO-USD'), false); // unknown coin
  assert.deepEqual(providerChain('AAPL', {}), ['yahoo']);
  assert.deepEqual(providerChain('BTC-USD', {}), ['yahoo', 'coingecko']);
  assert.deepEqual(providerChain('AAPL', { finnhubKey: 'k' }), ['yahoo', 'finnhub']);
  assert.deepEqual(providerChain('AAPL', { providers: ['finnhub', 'yahoo', 'bogus'] }), ['finnhub', 'yahoo']);
});

test('resolveQuote: falls through to the next provider when the first is down', () => {
  let calls = 0;
  return withFetch(
    async (url) => {
      calls++;
      // Yahoo (both hosts) fails; coingecko succeeds.
      if (String(url).includes('finance.yahoo.com')) return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => ({ bitcoin: { usd: 200, usd_24h_change: 0 } }) };
    },
    async () => {
      const q = await resolveQuote('BTC-USD', {});
      assert.equal(q.source, 'coingecko');
      assert.equal(q.price, 200);
      assert.ok(calls >= 2); // tried yahoo host(s) then coingecko
    },
  );
});

// --- v0.8: layouts, opt-in fields, alerts ---
test('formatQuote: opt-in fields append only when enabled and present', () => {
  const q = quoteFixture({ dayLow: 90, dayHigh: 130, volume: 9_000_000, week52Low: 50, week52High: 200 });
  const base = formatQuote('AAA', q, { hyperlink: false });
  assert.ok(!base.includes('V9.0M') && !base.includes('52w'));
  const full = formatQuote('AAA', q, {
    hyperlink: false,
    fields: { volume: true, dayRange: true, week52: true },
  });
  assert.ok(full.includes('V9.0M'));
  assert.ok(full.includes('90.00–130.00'));
  assert.ok(full.includes('52w 50.00–200.00'));
});

test('formatQuote: alertPercent bolds the change and adds a marker on big moves', () => {
  const big = formatQuote('AAA', quoteFixture({ price: 110, prevClose: 100 }), { hyperlink: false, alertPercent: 5 });
  assert.ok(big.includes('!'));
  assert.ok(big.includes('\x1b[1m')); // bold somewhere in the change
  const small = formatQuote('AAA', quoteFixture({ price: 101, prevClose: 100 }), { hyperlink: false, alertPercent: 5 });
  assert.ok(!small.includes('!'));
});

test('pctChange: derives daily percent, null without prevClose', () => {
  assert.ok(Math.abs(pctChange({ price: 110, prevClose: 100 }) - 10) < 1e-9);
  assert.equal(pctChange({ price: 110, prevClose: 0 }), null);
});

test('renderCompact: one tile per symbol, dim placeholder when missing', () => {
  const cache = { AAA: quoteFixture({ price: 110, prevClose: 100 }), BBB: quoteFixture({ price: 90, prevClose: 100 }) };
  const out = renderCompact(['AAA', 'BBB', 'CCC'], cache);
  assert.ok(out.includes('AAA') && out.includes('▲10.00%'));
  assert.ok(out.includes('BBB') && out.includes('▼10.00%'));
  assert.ok(out.includes('CCC —')); // missing quote
  assert.ok(!out.includes('\x1b]8;;')); // compact has no links
});

test('renderPortfolio: totals value and day P/L from holdings', () => {
  const cache = {
    AAA: quoteFixture({ price: 110, prevClose: 100 }), // +10/share
    BBB: quoteFixture({ price: 50, prevClose: 52 }), //   -2/share
  };
  // 10*110 + 4*50 = 1100 + 200 = 1300 value; dayPL = 10*10 + 4*(-2) = 100 - 8 = 92
  const out = renderPortfolio({ aaa: 10, BBB: { qty: 4 } }, cache);
  assert.ok(out.includes('Port'));
  assert.ok(out.includes('$1,300'));
  assert.ok(out.includes('▲$92'));
  assert.equal(renderPortfolio({ ZZZ: 5 }, cache), `\x1b[2mPort —\x1b[0m`); // none held
});

test('writeJsonAtomic: writes via temp+rename and leaves no temp behind', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'ticker-atomic-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const p = join(dir, 'state.json');
  assert.equal(writeJsonAtomic(p, { offset: 3 }), true);
  assert.deepEqual(readJson(p), { offset: 3 });
  const leftover = readdirSync(dir).filter((f) => f.endsWith('.tmp'));
  assert.equal(leftover.length, 0);
});
