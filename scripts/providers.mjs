// Quote providers with a common interface and a per-symbol fallback chain.
//
// Each provider is `async (symbol, opts) => quote | null`, where quote is:
//   { price, prevClose, closes[], currency, regStart, regEnd, ts, source,
//     dayHigh?, dayLow?, volume?, week52High?, week52Low? }
// Returning null means "I can't serve this symbol" — resolveQuote moves on.
//
// Default chain: Yahoo (two hosts) always; CoinGecko appended for known crypto
// symbols; Finnhub appended when an API key is present. Override entirely with
// config `providers: ["yahoo","finnhub",...]`.

const UA = 'Mozilla/5.0 (claude-code-stock-ticker)';

async function fetchJson(url, opts, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// --- Yahoo Finance (default; no key). Tries query1 then query2. ---
const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

export async function yahoo(symbol, { timeoutMs = 2000 } = {}) {
  for (const host of YAHOO_HOSTS) {
    const data = await fetchJson(
      `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=15m`,
      { headers: { 'User-Agent': UA } },
      timeoutMs,
    );
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    if (typeof meta?.regularMarketPrice !== 'number') continue;
    const closes = (result.indicators?.quote?.[0]?.close ?? []).filter((v) => v != null);
    const regular = meta.currentTradingPeriod?.regular;
    return {
      price: meta.regularMarketPrice,
      prevClose: meta.chartPreviousClose ?? meta.previousClose ?? null,
      closes,
      currency: meta.currency ?? 'USD',
      regStart: regular?.start ?? null,
      regEnd: regular?.end ?? null,
      dayHigh: meta.regularMarketDayHigh ?? null,
      dayLow: meta.regularMarketDayLow ?? null,
      volume: meta.regularMarketVolume ?? null,
      week52High: meta.fiftyTwoWeekHigh ?? null,
      week52Low: meta.fiftyTwoWeekLow ?? null,
      source: 'yahoo',
      ts: Date.now(),
    };
  }
  return null;
}

// --- CoinGecko (no key). Independent source for common crypto symbols. ---
const COINS = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple', DOGE: 'dogecoin',
  ADA: 'cardano', BNB: 'binancecoin', LTC: 'litecoin', DOT: 'polkadot', AVAX: 'avalanche-2',
  LINK: 'chainlink', MATIC: 'matic-network', TRX: 'tron', SHIB: 'shiba-inu', XLM: 'stellar',
};

export function isCrypto(symbol) {
  return /-USD$/i.test(symbol) && COINS[symbol.replace(/-USD$/i, '').toUpperCase()] != null;
}

export async function coingecko(symbol, { timeoutMs = 2000 } = {}) {
  const id = COINS[symbol.replace(/-USD$/i, '').toUpperCase()];
  if (!id) return null;
  const data = await fetchJson(
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`,
    {},
    timeoutMs,
  );
  const row = data?.[id];
  if (typeof row?.usd !== 'number') return null;
  const price = row.usd;
  const chg = typeof row.usd_24h_change === 'number' ? row.usd_24h_change : 0;
  const now = Math.floor(Date.now() / 1000);
  return {
    price,
    prevClose: price / (1 + chg / 100),
    closes: [],
    currency: 'USD',
    regStart: now - 60, // crypto trades 24/7 — always "open"
    regEnd: now + 86400,
    source: 'coingecko',
    ts: Date.now(),
  };
}

// --- Finnhub (optional; needs an API key). General stock fallback. ---
export async function finnhub(symbol, { timeoutMs = 2000, finnhubKey } = {}) {
  if (!finnhubKey) return null;
  const data = await fetchJson(
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(finnhubKey)}`,
    {},
    timeoutMs,
  );
  if (typeof data?.c !== 'number' || data.c === 0) return null;
  return {
    price: data.c,
    prevClose: typeof data.pc === 'number' ? data.pc : null,
    closes: [],
    currency: 'USD',
    dayHigh: data.h ?? null,
    dayLow: data.l ?? null,
    regStart: null,
    regEnd: null,
    source: 'finnhub',
    ts: Date.now(),
  };
}

const REGISTRY = { yahoo, coingecko, finnhub };

export function providerChain(symbol, opts = {}) {
  if (Array.isArray(opts.providers) && opts.providers.length) {
    return opts.providers.filter((n) => REGISTRY[n]);
  }
  const chain = ['yahoo'];
  if (isCrypto(symbol)) chain.push('coingecko');
  if (opts.finnhubKey) chain.push('finnhub');
  return chain;
}

// Try each provider in the chain until one returns a quote.
export async function resolveQuote(symbol, opts = {}) {
  for (const name of providerChain(symbol, opts)) {
    const q = await REGISTRY[name](symbol, opts);
    if (q) return q;
  }
  return null;
}

// For `/ticker doctor`: which providers respond, and how fast.
export async function probe(opts = {}) {
  const names = ['yahoo', ...(opts.finnhubKey ? ['finnhub'] : []), 'coingecko'];
  const results = [];
  for (const name of names) {
    const probeSymbol = name === 'coingecko' ? 'BTC-USD' : 'SPY';
    const start = Date.now();
    let ok = false;
    try {
      ok = !!(await REGISTRY[name](probeSymbol, opts));
    } catch {
      ok = false;
    }
    results.push({ name, ok, ms: Date.now() - start });
  }
  return results;
}
