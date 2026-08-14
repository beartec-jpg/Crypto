/**
 * OI / funding for desk tools.
 * Cascade: Coinalyze → CoinGlass → Binance USDT-M public (no key).
 */

export interface InstitutionalSnapshot {
  symbol: string;
  source: string;
  openInterest?: { current: number; deltaPct?: number; trend?: string };
  fundingRate?: { rate: number; bias: string };
  longShortRatio?: number;
  unavailable?: boolean;
  reason?: string;
  asOf: string;
}

const cache = new Map<string, { at: number; data: InstitutionalSnapshot }>();
const TTL_MS = 90_000;

function baseAsset(symbol: string): string {
  return symbol.toUpperCase().replace(/USDT$|USDC$|USD$|BUSD$/i, '');
}

function fundingBias(rate: number): string {
  if (rate > 0.0001) return 'longs_pay';
  if (rate < -0.0001) return 'shorts_pay';
  return 'neutral';
}

async function fromBinance(symbol: string): Promise<InstitutionalSnapshot | null> {
  const sym = symbol.toUpperCase().replace(/[-_/]/g, '');
  try {
    const [premRes, oiRes] = await Promise.all([
      fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${sym}`, {
        signal: AbortSignal.timeout(8_000),
      }),
      fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${sym}`, {
        signal: AbortSignal.timeout(8_000),
      }),
    ]);
    if (!premRes.ok && !oiRes.ok) return null;
    const prem = premRes.ok ? await premRes.json() : {};
    const oi = oiRes.ok ? await oiRes.json() : {};
    const rate = Number(prem.lastFundingRate ?? prem.r ?? 0);
    const oiVal = Number(oi.openInterest ?? 0);
    return {
      symbol: sym,
      source: 'binance-fapi',
      openInterest: oiVal ? { current: oiVal, trend: 'n/a' } : undefined,
      fundingRate: { rate, bias: fundingBias(rate) },
      asOf: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function fromCoinglass(symbol: string): Promise<InstitutionalSnapshot | null> {
  const key = (process.env.COINGLASS_API_KEY || '').trim();
  if (!key) return null;
  const base = baseAsset(symbol);
  try {
    const headers = { accept: 'application/json', 'CG-API-KEY': key };
    const [oiRes, frRes] = await Promise.all([
      fetch(
        `https://open-api-v4.coinglass.com/api/futures/open-interest/history?exchange=Binance&symbol=${base}&interval=1h&limit=24`,
        { headers, signal: AbortSignal.timeout(10_000) },
      ),
      fetch(
        `https://open-api-v4.coinglass.com/api/futures/funding-rate/history?exchange=Binance&symbol=${base}&interval=8h&limit=12`,
        { headers, signal: AbortSignal.timeout(10_000) },
      ),
    ]);
    let oiCurrent = 0;
    let oiDeltaPct = 0;
    let oiTrend = 'neutral';
    if (oiRes.ok) {
      const j = await oiRes.json();
      const rows = Array.isArray(j?.data) ? j.data : [];
      if (rows.length) {
        const last = rows[rows.length - 1];
        const prev = rows[rows.length - 2] || last;
        oiCurrent = Number(last.close ?? last.c ?? last.openInterest ?? 0);
        const prevV = Number(prev.close ?? prev.c ?? prev.openInterest ?? oiCurrent);
        if (prevV > 0) oiDeltaPct = ((oiCurrent - prevV) / prevV) * 100;
        oiTrend = oiCurrent >= prevV ? 'rising' : 'falling';
      }
    }
    let rate = 0;
    if (frRes.ok) {
      const j = await frRes.json();
      const rows = Array.isArray(j?.data) ? j.data : [];
      if (rows.length) {
        const last = rows[rows.length - 1];
        rate = Number(last.close ?? last.c ?? last.fundingRate ?? last.rate ?? 0);
      }
    }
    if (!oiCurrent && !rate) return null;
    return {
      symbol: symbol.toUpperCase(),
      source: 'coinglass',
      openInterest: oiCurrent
        ? { current: oiCurrent, deltaPct: Number(oiDeltaPct.toFixed(3)), trend: oiTrend }
        : undefined,
      fundingRate: { rate, bias: fundingBias(rate) },
      asOf: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function fromCoinalyze(symbol: string): Promise<InstitutionalSnapshot | null> {
  const key = (process.env.COINALYZE_API_KEY || '').trim();
  if (!key) return null;
  const sym = `${symbol.toUpperCase().replace(/[-_/]/g, '')}_PERP.A`;
  try {
    const to = Math.floor(Date.now() / 1000);
    const from = to - 2 * 24 * 3600;
    const headers = { Accept: 'application/json', api_key: key };
    const [oiRes, frRes] = await Promise.all([
      fetch(
        `https://api.coinalyze.net/v1/open-interest-history?symbols=${sym}&interval=1hour&from=${from}&to=${to}`,
        { headers, signal: AbortSignal.timeout(10_000) },
      ),
      fetch(
        `https://api.coinalyze.net/v1/funding-rate-history?symbols=${sym}&interval=8hour&from=${from}&to=${to}`,
        { headers, signal: AbortSignal.timeout(10_000) },
      ),
    ]);
    let oiCurrent = 0;
    let oiDeltaPct = 0;
    let oiTrend = 'neutral';
    if (oiRes.ok) {
      const j = await oiRes.json();
      const hist = j?.[0]?.history || [];
      if (hist.length) {
        const last = hist[hist.length - 1];
        const prev = hist[hist.length - 2] || last;
        oiCurrent = Number(last.c ?? last.o ?? 0);
        const prevV = Number(prev.c ?? prev.o ?? oiCurrent);
        if (prevV > 0) oiDeltaPct = ((oiCurrent - prevV) / prevV) * 100;
        oiTrend = oiCurrent >= prevV ? 'rising' : 'falling';
      }
    }
    let rate = 0;
    if (frRes.ok) {
      const j = await frRes.json();
      const hist = j?.[0]?.history || [];
      if (hist.length) rate = Number(hist[hist.length - 1].c ?? hist[hist.length - 1].v ?? 0);
    }
    if (!oiCurrent && !rate) return null;
    return {
      symbol: symbol.toUpperCase(),
      source: 'coinalyze',
      openInterest: oiCurrent
        ? { current: oiCurrent, deltaPct: Number(oiDeltaPct.toFixed(3)), trend: oiTrend }
        : undefined,
      fundingRate: { rate, bias: fundingBias(rate) },
      asOf: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function getInstitutional(symbol: string): Promise<InstitutionalSnapshot> {
  const sym = symbol.toUpperCase().replace(/[-_/]/g, '');
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const chain = [fromCoinalyze, fromCoinglass, fromBinance];
  for (const fn of chain) {
    const data = await fn(sym);
    if (data) {
      cache.set(sym, { at: Date.now(), data });
      return data;
    }
  }
  const empty: InstitutionalSnapshot = {
    symbol: sym,
    source: 'none',
    unavailable: true,
    reason: 'No Coinalyze/Coinglass key and Binance fapi failed',
    asOf: new Date().toISOString(),
  };
  cache.set(sym, { at: Date.now(), data: empty });
  return empty;
}
