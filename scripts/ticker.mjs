#!/usr/bin/env node
// Claude Code status line: rotating stock ticker with intraday sparkline.
//
// Reads session JSON from stdin (provided by Claude Code), symbol config from
// ~/.claude/stock-ticker.json, and quotes from Yahoo Finance's public chart
// endpoint. Quotes are cached in the OS temp dir so frequent status line
// refreshes don't hammer the API.
//
// STOCK_TICKER_CONFIG / STOCK_TICKER_CACHE env vars override the file paths
// (used by the test suite to run hermetically).

import { readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CONFIG_PATH = process.env.STOCK_TICKER_CONFIG ?? join(homedir(), '.claude', 'stock-ticker.json');
const CACHE_PATH = process.env.STOCK_TICKER_CACHE ?? join(tmpdir(), 'claude-stock-ticker-cache.json');

export const DEFAULTS = {
  symbols: ['SPY', 'NVDA', 'AAPL', 'TSLA'],
  rotateSeconds: 10,
  cacheTtlSeconds: 60,
  sparkPoints: 8,
  showSession: true,
  hyperlink: true,
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const BLINK = '\x1b[5m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£', ILS: '₪', JPY: '¥' };

export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export async function readStdin() {
  if (process.stdin.isTTY) return {};
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function fetchQuote(symbol) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2000);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=15m`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (claude-code-stock-ticker)' },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const meta = result?.meta;
    if (typeof meta?.regularMarketPrice !== 'number') return null;
    const closes = (result.indicators?.quote?.[0]?.close ?? []).filter((v) => v != null);
    const regular = meta.currentTradingPeriod?.regular;
    return {
      price: meta.regularMarketPrice,
      prevClose: meta.chartPreviousClose ?? meta.previousClose ?? null,
      closes,
      currency: meta.currency ?? 'USD',
      regStart: regular?.start ?? null,
      regEnd: regular?.end ?? null,
      ts: Date.now(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function sparkline(closes, points) {
  if (!closes.length) return '';
  const bars = '▁▂▃▄▅▆▇█';
  const n = Math.min(points, closes.length);
  const per = closes.length / n;
  const buckets = [];
  for (let i = 0; i < n; i++) {
    const start = Math.floor(i * per);
    const end = Math.max(Math.floor((i + 1) * per), start + 1);
    const slice = closes.slice(start, end);
    buckets.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  const min = Math.min(...buckets);
  const max = Math.max(...buckets);
  if (max - min < 1e-9) return bars[3].repeat(buckets.length);
  return buckets
    .map((v) => bars[Math.round(((v - min) / (max - min)) * (bars.length - 1))])
    .join('');
}

// OSC 8 hyperlink — clickable in supporting terminals, invisible elsewhere.
export function linkify(text, symbol, enabled) {
  if (!enabled) return text;
  const url = `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`;
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

export function marketDot(quote, nowMs = Date.now()) {
  const nowSec = nowMs / 1000;
  const open =
    quote?.regStart != null && quote?.regEnd != null && nowSec >= quote.regStart && nowSec < quote.regEnd;
  if (open) {
    // SGR blink where the terminal supports it; the bright/dim toggle keyed to
    // the refresh clock makes it pulse visibly everywhere else.
    const bright = Math.floor(nowMs / 5000) % 2 === 0;
    return `${BLINK}${GREEN}${bright ? '' : DIM}●${RESET}`;
  }
  return `${RED}●${RESET}`;
}

export function formatQuote(symbol, quote, position, nowMs = Date.now()) {
  const name = linkify(`${BOLD}${symbol}${RESET}`, symbol, position.hyperlink);
  if (!quote) return `${DIM}${name} —${RESET}`;

  const cur = CURRENCY_SYMBOLS[quote.currency] ?? `${quote.currency} `;
  const price = quote.price >= 1 ? quote.price.toFixed(2) : quote.price.toFixed(4);

  let pct = '';
  if (quote.prevClose) {
    const chg = ((quote.price - quote.prevClose) / quote.prevClose) * 100;
    const color = chg >= 0 ? GREEN : RED;
    const arrow = chg >= 0 ? '▲' : '▼';
    pct = ` ${color}${arrow}${Math.abs(chg).toFixed(2)}%${RESET}`;
  }

  const spark = sparkline(quote.closes ?? [], position.sparkPoints);
  // Older than 15 min means the fetch has been failing and we're showing leftovers.
  const stale = nowMs - quote.ts > 15 * 60 * 1000;

  let out = `${name} ${cur}${price}${pct}`;
  if (spark) out += ` ${DIM}${spark}${RESET}`;
  if (stale) out += ` ${DIM}(cached)${RESET}`;
  if (position.total > 1) out += ` ${DIM}${position.index + 1}/${position.total}${RESET}`;
  return out;
}

export async function main() {
  const config = { ...DEFAULTS, ...(readJson(CONFIG_PATH) ?? {}) };
  const symbols = (Array.isArray(config.symbols) && config.symbols.length ? config.symbols : DEFAULTS.symbols)
    .map((s) => String(s).trim().toUpperCase())
    .filter(Boolean);

  const session = await readStdin();

  const rotateSeconds = Math.max(Number(config.rotateSeconds) || DEFAULTS.rotateSeconds, 1);
  const index = Math.floor(Date.now() / 1000 / rotateSeconds) % symbols.length;
  const symbol = symbols[index];

  const cache = readJson(CACHE_PATH) ?? {};
  const ttlMs = Math.max(Number(config.cacheTtlSeconds) || DEFAULTS.cacheTtlSeconds, 5) * 1000;
  const stale = symbols.filter((s) => !cache[s] || Date.now() - cache[s].ts >= ttlMs);
  if (stale.length) {
    const fetched = await Promise.all(stale.map(fetchQuote));
    let updated = false;
    stale.forEach((s, i) => {
      if (fetched[i]) {
        cache[s] = fetched[i];
        updated = true;
      }
    });
    if (updated) {
      try {
        writeFileSync(CACHE_PATH, JSON.stringify(cache));
      } catch {
        // Cache write failures are non-fatal; we just refetch next time.
      }
    }
  }
  const quote = cache[symbol];

  const left = formatQuote(symbol, quote, {
    index,
    total: symbols.length,
    sparkPoints: Math.max(Number(config.sparkPoints) || DEFAULTS.sparkPoints, 2),
    hyperlink: config.hyperlink !== false,
  });

  let right = '';
  if (config.showSession !== false) {
    const parts = [];
    if (session?.model?.display_name) parts.push(session.model.display_name);
    const ctx = session?.context_window?.used_percentage;
    if (typeof ctx === 'number') parts.push(`${Math.round(ctx)}% ctx`);
    right = parts.join(` ${DIM}·${RESET} `);
  }

  const line = `${marketDot(quote)} ${left}`;
  console.log(right ? `${line}  ${DIM}│${RESET}  ${right}` : line);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
