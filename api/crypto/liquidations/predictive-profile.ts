import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon as _neonConnect } from '@neondatabase/serverless';

interface PriceLevelScore {
  price: number;
  longScore: number;
  shortScore: number;
  components: {
    oiLong: number;
    oiShort: number;
    orderbookLong: number;
    orderbookShort: number;
    liqFlowLong: number;
    liqFlowShort: number;
    buildupLong: number;
    buildupShort: number;
  };
}

interface BinanceForceOrder {
  side: 'BUY' | 'SELL';
  price: string;
  avgPrice?: string;
  origQty: string;
  time: number;
}

interface BinanceDepth {
  bids: [string, string][];
  asks: [string, string][];
}

interface RealtimeLiquidationResponse {
  events?: Array<{
    symbol: string;
    side: 'BUY' | 'SELL';
    price: number;
    quantity: number;
    timestamp: number;
    exchange: 'binance' | 'bybit';
  }>;
  totalEvents?: number;
  recentCount?: number;
  exchangeStats?: {
    binance: number;
    bybit: number;
  };
  sourceDiagnostics?: Array<{
    source: 'binance' | 'bybit';
    ok: boolean;
    status: number | null;
    count: number;
    error?: string;
  }>;
}

interface RealtimeEventStats {
  events: BinanceForceOrder[];
  totalCount: number;
  binanceCount: number;
  bybitCount: number;
  sourceDiagnostics: Array<{
    source: 'binance' | 'bybit';
    ok: boolean;
    status: number | null;
    count: number;
    error?: string;
  }>;
}

interface ExtendedHistoryResponse {
  candles?: Array<{ open?: number; high?: number; low?: number; close?: number; volume?: number; time?: number }>;
}

interface OpenInterestResponse {
  current?: number | { value?: number };
  source?: string;
  history?: Array<{ timestamp?: number; value?: number }>;
}

interface FundingRateResponse {
  current?: number;
  rate?: number;
  source?: string;
  history?: Array<{ timestamp?: number; value?: number }>;
}

interface LongShortRatioResponse {
  ratio?: number;
  current?: { ratio?: number };
  source?: string;
  history?: Array<{ timestamp?: number; ratio?: number }>;
}

function pickHistoricalValue<T>(
  points: T[] | undefined,
  anchorTimeMs: number | null,
  getTimestamp: (point: T) => number,
  getValue: (point: T) => number,
): number {
  if (!Array.isArray(points) || points.length === 0 || !anchorTimeMs) return 0;
  let bestTs = -Infinity;
  let bestValue = 0;
  for (const point of points) {
    const ts = getTimestamp(point);
    if (!Number.isFinite(ts) || ts > anchorTimeMs || ts < bestTs) continue;
    bestTs = ts;
    bestValue = getValue(point);
  }
  return Number.isFinite(bestValue) ? bestValue : 0;
}

interface PredictiveLevel {
  price: number;
  liquidationValue: number;
  side: 'long' | 'short';
}

interface ScoringWeights {
  oi: number;
  orderbook: number;
  liqFlow: number;
  bias: number;
}

interface EndpointDiagnostic {
  endpoint: string;
  url: string;
  ok: boolean;
  status: number | null;
  ms: number;
  error?: string;
  dataPoints?: number;
  optional?: boolean;
}

interface RollingSnapshot {
  lastUpdated: number;
  forceOrders: BinanceForceOrder[];
  depth: BinanceDepth | null;
}

const rollingSnapshots = new Map<string, RollingSnapshot>();
const priceCache = new Map<string, { price: number; timestamp: number }>();
const lastSuccessfulPriceCache = new Map<string, { price: number; timestamp: number }>();
const binanceProbeCooldownUntil = new Map<string, number>();
const FORCE_ORDER_CACHE_WINDOW_MS = 10 * 60 * 1000;
const FLOW_HALFLIFE_MS = 3 * 60 * 1000;
const PRICE_CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
const SUCCESSFUL_PRICE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const BINANCE_PROBE_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

const COINGECKO_ID_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  XRP: 'ripple',
  SOL: 'solana',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  AVAX: 'avalanche-2',
  DOT: 'polkadot',
  LINK: 'chainlink',
  MATIC: 'matic-network',
  POL: 'matic-network',
  UNI: 'uniswap',
  LTC: 'litecoin',
  BCH: 'bitcoin-cash',
  ATOM: 'cosmos',
  FIL: 'filecoin',
  TRX: 'tron',
  ETC: 'ethereum-classic',
  XLM: 'stellar',
  NEAR: 'near',
  APT: 'aptos',
  OP: 'optimism',
  ARB: 'arbitrum',
  SUI: 'sui',
  INJ: 'injective-protocol',
  PEPE: 'pepe',
  WIF: 'dogwifhat',
  BONK: 'bonk',
  SHIB: 'shiba-inu',
};

const RANGE_TO_PERCENT: Record<string, number> = {
  '12h': 0.03,
  '24h': 0.04,
  '3d': 0.06,
  '7d': 0.08,
  '30d': 0.12,
  '90d': 0.18,
  '180d': 0.24,
  '1y': 0.3,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSymbol(input: string): string {
  const cleaned = input.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (!cleaned) return 'BTCUSDT';
  if (cleaned.endsWith('USDT')) return cleaned;
  return `${cleaned}USDT`;
}

async function safeFetchJson<T>(url: string, retries = 3): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) {
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
          continue;
        }
        return null;
      }
      return await response.json() as T;
    } catch {
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
        continue;
      }
      return null;
    }
  }
  return null;
}

function redactApiKey(url: string): string {
  return url
    .replace(/([?&]api_key=)[^&]*/gi, '$1REDACTED')
    .replace(/(CG-API-KEY=)[^&]*/gi, '$1REDACTED');
}

async function fetchTracked<T>(
  name: string,
  url: string,
  options?: { headers?: Record<string, string>; timeoutMs?: number },
): Promise<{ data: T | null; diag: EndpointDiagnostic }> {
  const safeUrl = redactApiKey(url);
  const start = Date.now();
  try {
    const fetchOptions: RequestInit = {
      signal: AbortSignal.timeout(options?.timeoutMs ?? 8000),
    };
    if (options?.headers) {
      fetchOptions.headers = options.headers;
    }
    const response = await fetch(url, fetchOptions);
    const ms = Date.now() - start;
    if (!response.ok) {
      return {
        data: null,
        diag: { endpoint: name, url: safeUrl, ok: false, status: response.status, ms },
      };
    }
    const data = await response.json() as T;
    return {
      data,
      diag: { endpoint: name, url: safeUrl, ok: true, status: response.status, ms },
    };
  } catch (e: any) {
    const ms = Date.now() - start;
    const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    return {
      data: null,
      diag: {
        endpoint: name,
        url: safeUrl,
        ok: false,
        status: null,
        ms,
        error: isTimeout ? 'timeout' : (e?.message || 'network_error'),
      },
    };
  }
}

async function trackFn<T>(
  diagnostics: EndpointDiagnostic[],
  endpoint: string,
  fn: () => Promise<T>,
  isOk: (v: T) => boolean = (v) => v !== null && v !== undefined,
  getCount?: (v: T) => number,
  optional = false,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - start;
    const ok = isOk(result);
    diagnostics.push({
      endpoint,
      url: endpoint,
      ok,
      status: ok ? 200 : null,
      ms,
      dataPoints: getCount ? getCount(result) : undefined,
      optional,
    });
    return result;
  } catch (e: any) {
    const ms = Date.now() - start;
    diagnostics.push({ endpoint, url: endpoint, ok: false, status: null, ms, error: e?.message || 'error', optional });
    return null as unknown as T;
  }
}

function isExchangeReachable(diagnostics: EndpointDiagnostic[]): boolean {
  return diagnostics.some(
    (d) => (d.endpoint.startsWith('bybit-') || d.endpoint.startsWith('binance-')) && d.ok,
  );
}

async function fetchInternalAggregatedMetrics(
  req: VercelRequest,
  symbol: string,
  diagnostics: EndpointDiagnostic[],
  anchorTimeMs: number | null,
  visibleWindow?: { fromMs: number; toMs: number },
  chartInterval?: string,
): Promise<{
  price: number;
  openInterestUsd: number;
  longShortRatio: number;
  fundingRate: number;
  candles: Array<{ open?: number; high?: number; low?: number; close?: number; volume?: number; time?: number }>;
}> {
  const origin = getRequestOrigin(req);
  if (!origin) {
    diagnostics.push({
      endpoint: 'internal-origin',
      url: '',
      ok: false,
      status: null,
      ms: 0,
      error: 'missing_request_origin',
    });
    return { price: 0, openInterestUsd: 0, longShortRatio: 0, fundingRate: 0, candles: [] };
  }

  const historyTimeframe = chartInterval || '1m';
  const visibleDurationMs = visibleWindow && visibleWindow.toMs > visibleWindow.fromMs
    ? visibleWindow.toMs - visibleWindow.fromMs
    : 0;
  const intervalSeconds = intervalToSeconds(historyTimeframe);
  const historyLimit = clamp(
    visibleDurationMs > 0 ? Math.ceil(visibleDurationMs / (intervalSeconds * 1000)) + 12 : 300,
    60,
    1000,
  );
  const historyEndTime = visibleWindow?.toMs || anchorTimeMs || 0;
  const historyUrl = `${origin}/api/crypto/extended-history?symbol=${symbol}&timeframe=${encodeURIComponent(historyTimeframe)}&limit=${historyLimit}${historyEndTime ? `&endTime=${Math.floor(historyEndTime / 1000)}` : ''}`;

  const [historyR, oiR, fundingR, lsR] = await Promise.all([
    fetchTracked<ExtendedHistoryResponse>(
      'internal-extended-history',
      historyUrl,
      { timeoutMs: 12000 },
    ),
    fetchTracked<OpenInterestResponse>(
      'internal-open-interest',
      `${origin}/api/crypto/orderflow/open-interest?symbol=${symbol}&interval=1h`,
      { timeoutMs: 12000 },
    ),
    fetchTracked<FundingRateResponse>(
      'internal-funding-rate',
      `${origin}/api/crypto/orderflow/funding-rate?symbol=${symbol}&interval=1h`,
      { timeoutMs: 12000 },
    ),
    fetchTracked<LongShortRatioResponse>(
      'internal-long-short-ratio',
      `${origin}/api/crypto/orderflow/long-short-ratio?symbol=${symbol}&interval=1h`,
      { timeoutMs: 12000 },
    ),
  ]);

  diagnostics.push(historyR.diag, oiR.diag, fundingR.diag, lsR.diag);

  const candles = Array.isArray(historyR.data?.candles) ? historyR.data.candles : [];
  const filteredCandles = visibleWindow && visibleWindow.toMs > visibleWindow.fromMs
    ? candles.filter((point) => {
        const tsSec = Number(point.time || 0);
        if (!Number.isFinite(tsSec) || tsSec <= 0) return false;
        const tsMs = tsSec * 1000;
        return tsMs >= visibleWindow.fromMs && tsMs <= visibleWindow.toMs;
      })
    : candles;
  const historicalClose = anchorTimeMs
    ? pickHistoricalValue(
        candles,
        anchorTimeMs,
        (point) => Number(point.time || 0) * 1000,
        (point) => Number(point.close || 0),
      )
    : 0;
  const lastClose = historicalClose || Number(candles[candles.length - 1]?.close || 0);

  const historicalOi = pickHistoricalValue(
    oiR.data?.history,
    anchorTimeMs,
    (point) => Number(point.timestamp || 0),
    (point) => Number(point.value || 0),
  );
  const oiRaw = historicalOi || (typeof oiR.data?.current === 'number'
    ? oiR.data.current
    : Number((oiR.data?.current as { value?: number } | undefined)?.value || 0));

  const historicalRatio = pickHistoricalValue(
    lsR.data?.history,
    anchorTimeMs,
    (point) => Number(point.timestamp || 0),
    (point) => Number(point.ratio || 0),
  );
  const ratio = historicalRatio || Number(lsR.data?.ratio || lsR.data?.current?.ratio || 0);

  const historicalFunding = pickHistoricalValue(
    fundingR.data?.history,
    anchorTimeMs,
    (point) => Number(point.timestamp || 0),
    (point) => Number(point.value || 0),
  );
  const funding = historicalFunding || Number(fundingR.data?.rate || fundingR.data?.current || 0);

  return {
    price: Number.isFinite(lastClose) ? lastClose : 0,
    openInterestUsd: Number.isFinite(oiRaw) ? oiRaw : 0,
    longShortRatio: Number.isFinite(ratio) ? ratio : 0,
    fundingRate: Number.isFinite(funding) ? funding : 0,
    candles: filteredCandles,
  };
}

function setPriceCache(symbol: string, price: number): void {
  if (price > 0) {
    priceCache.set(symbol, { price, timestamp: Date.now() });
    lastSuccessfulPriceCache.set(symbol, { price, timestamp: Date.now() });
  }
}

function getPriceCacheOrNull(symbol: string): number | null {
  // Check recent cache (1 hour)
  const cached = priceCache.get(symbol);
  if (cached) {
    const age = Date.now() - cached.timestamp;
    if (age <= PRICE_CACHE_MAX_AGE_MS) {
      return cached.price;
    }
    priceCache.delete(symbol);
  }
  
  // Fall back to last successful price (24 hours)
  const lastSuccess = lastSuccessfulPriceCache.get(symbol);
  if (lastSuccess) {
    const age = Date.now() - lastSuccess.timestamp;
    if (age <= SUCCESSFUL_PRICE_CACHE_MAX_AGE_MS) {
      return lastSuccess.price;
    }
    lastSuccessfulPriceCache.delete(symbol);
  }
  
  return null;
}

function baseSymbol(symbol: string): string {
  return symbol.replace(/USDT$/, '').replace(/BUSD$/, '');
}

async function fetchPriceFromMultipleSources(symbol: string, diagnostics: EndpointDiagnostic[]): Promise<number> {
  const base = baseSymbol(symbol);
  const now = Date.now();
  const cooldown = binanceProbeCooldownUntil.get(symbol) || 0;
  const skipBinance = now < cooldown;

  let hadBinanceSuccess = false;
  let hadBinanceAttemptFailure = false;

  // 1. Bybit linear ticker (primary — almost never geo-blocked)
  {
    const url = `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`;
    const { data, diag } = await fetchTracked<{
      result?: { list?: Array<{ lastPrice?: string; markPrice?: string; indexPrice?: string }> };
    }>('bybit-ticker', url);
    diag.optional = true;
    diagnostics.push(diag);
    const ticker = data?.result?.list?.[0];
    const bybitLast = toNumber(ticker?.lastPrice, 0);
    if (bybitLast > 0) { setPriceCache(symbol, bybitLast); return bybitLast; }
    const bybitMark = toNumber(ticker?.markPrice, 0);
    if (bybitMark > 0) { setPriceCache(symbol, bybitMark); return bybitMark; }
    const bybitIndex = toNumber(ticker?.indexPrice, 0);
    if (bybitIndex > 0) { setPriceCache(symbol, bybitIndex); return bybitIndex; }
  }

  // 2. Binance Futures ticker (optional fallback)
  if (!skipBinance) {
    const url = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`;
    const { data, diag } = await fetchTracked<{ price: string }>('binance-futures-price', url);
    diag.optional = true;
    diagnostics.push(diag);
    if (data?.price) {
      const price = toNumber(data.price, 0);
      if (price > 0) { hadBinanceSuccess = true; setPriceCache(symbol, price); return price; }
    }
    hadBinanceAttemptFailure = true;
  }

  // 3. Binance Spot ticker
  if (!skipBinance) {
    const url = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`;
    const { data, diag } = await fetchTracked<{ price: string }>('binance-spot-price', url);
    diag.optional = true;
    diagnostics.push(diag);
    if (data?.price) {
      const price = toNumber(data.price, 0);
      if (price > 0) { hadBinanceSuccess = true; setPriceCache(symbol, price); return price; }
    }
    hadBinanceAttemptFailure = true;
  }

  // 4. Binance Premium/Mark price
  if (!skipBinance) {
    const url = `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`;
    const { data, diag } = await fetchTracked<{ markPrice?: string; indexPrice?: string }>('binance-mark-price', url);
    diag.optional = true;
    diagnostics.push(diag);
    const markPrice = toNumber(data?.markPrice, 0);
    if (markPrice > 0) { hadBinanceSuccess = true; setPriceCache(symbol, markPrice); return markPrice; }
    const indexPrice = toNumber(data?.indexPrice, 0);
    if (indexPrice > 0) { hadBinanceSuccess = true; setPriceCache(symbol, indexPrice); return indexPrice; }
    hadBinanceAttemptFailure = true;
  }

  // 5. Binance Spot Klines (public endpoint, less geo-blocked than ticker)
  if (!skipBinance) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=1`;
    const { data, diag } = await fetchTracked<number[][]>('binance-spot-klines', url);
    diag.optional = true;
    diagnostics.push(diag);
    const klineClose = toNumber(data?.[0]?.[4], 0); // index 4 = close price
    if (klineClose > 0) { hadBinanceSuccess = true; setPriceCache(symbol, klineClose); return klineClose; }
    hadBinanceAttemptFailure = true;
  }

  if (skipBinance) {
    diagnostics.push({
      endpoint: 'binance-price-probes-skipped',
      url: '',
      ok: true,
      status: null,
      ms: 0,
      optional: true,
      error: 'cooldown_active',
    });
  }

  // 6. CoinGecko (free public API, no geo restrictions, no API key required)
  {
    const geckoId = COINGECKO_ID_MAP[base.toUpperCase()];
    if (geckoId) {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`;
      const { data, diag } = await fetchTracked<Record<string, { usd: number }>>('coingecko-price', url);
      diag.optional = false;
      diagnostics.push(diag);
      const geckoPrice = toNumber(data?.[geckoId]?.usd, 0);
      if (geckoPrice > 0) { setPriceCache(symbol, geckoPrice); return geckoPrice; }
    } else {
      diagnostics.push({
        endpoint: 'coingecko-price',
        url: '',
        ok: false,
        status: null,
        ms: 0,
        error: `no_coingecko_id_for_${base}`,
        optional: false,
      });
    }
  }

  // 7. Cache fallback (up to 24 hours)
  const cached = getPriceCacheOrNull(symbol);
  if (cached) {
    diagnostics.push({ endpoint: 'price-cache', url: '', ok: true, status: null, ms: 0, dataPoints: 1, optional: false });
    return cached;
  }

  if (!hadBinanceSuccess && hadBinanceAttemptFailure) {
    binanceProbeCooldownUntil.set(symbol, now + BINANCE_PROBE_COOLDOWN_MS);
  }

  diagnostics.push({ endpoint: 'price-cache', url: '', ok: false, status: null, ms: 0, error: 'cache_cold', optional: false });
  return 0;
}

function parseWeight(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed, 0, 1);
}

function normalizeWeights(weights: ScoringWeights): ScoringWeights {
  const total = weights.oi + weights.orderbook + weights.liqFlow + weights.bias;
  if (total <= 0) {
    return { oi: 0.4, orderbook: 0.25, liqFlow: 0.2, bias: 0.15 };
  }
  return {
    oi: weights.oi / total,
    orderbook: weights.orderbook / total,
    liqFlow: weights.liqFlow / total,
    bias: weights.bias / total,
  };
}

function buildCacheKey(symbol: string, range: string): string {
  return `${symbol}:${range}`;
}

function normalizeForceOrder(order: BinanceForceOrder): BinanceForceOrder {
  return {
    side: order.side,
    price: String(order.price),
    avgPrice: order.avgPrice ? String(order.avgPrice) : undefined,
    origQty: String(order.origQty),
    time: toNumber(order.time, 0),
  };
}

function mergeRecentForceOrders(
  now: number,
  freshOrders: BinanceForceOrder[],
  cachedOrders: BinanceForceOrder[],
): BinanceForceOrder[] {
  const all = [...freshOrders.map(normalizeForceOrder), ...cachedOrders.map(normalizeForceOrder)];
  const deduped = new Map<string, BinanceForceOrder>();

  for (const order of all) {
    if (!order.time) continue;
    const age = now - order.time;
    if (age < 0 || age > FORCE_ORDER_CACHE_WINDOW_MS) continue;
    const key = `${order.time}:${order.side}:${order.price}:${order.origQty}`;
    deduped.set(key, order);
  }

  return Array.from(deduped.values())
    .sort((a, b) => b.time - a.time)
    .slice(0, 600);
}

function getRequestOrigin(req: VercelRequest): string | null {
  const host = req?.headers?.host;
  if (!host || typeof host !== 'string') return null;
  const protoHeader = req?.headers?.['x-forwarded-proto'];
  const proto = typeof protoHeader === 'string' ? protoHeader : 'https';
  return `${proto}://${host}`;
}

function toForceOrderFromRealtimeEvent(event: {
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  timestamp: number;
}): BinanceForceOrder {
  return {
    side: event.side,
    price: String(event.price),
    avgPrice: String(event.price),
    origQty: String(event.quantity),
    time: event.timestamp,
  };
}

async function fetchRealtimeLiquidationEvents(
  req: VercelRequest,
  symbol: string,
): Promise<RealtimeEventStats> {
  const origin = getRequestOrigin(req);
  if (!origin) return { events: [], totalCount: 0, binanceCount: 0, bybitCount: 0, sourceDiagnostics: [] };

  const url = `${origin}/api/crypto/liquidations/realtime?symbol=${symbol}&limit=300&exchange=all`;
  const data = await safeFetchJson<RealtimeLiquidationResponse>(url);
  if (!data?.events || !Array.isArray(data.events)) {
    return { events: [], totalCount: 0, binanceCount: 0, bybitCount: 0, sourceDiagnostics: [] };
  }

  const events = data.events
    .filter((e) => Number.isFinite(e.price) && Number.isFinite(e.quantity) && Number.isFinite(e.timestamp))
    .map(toForceOrderFromRealtimeEvent);

  const binanceCount = data.exchangeStats?.binance || 0;
  const bybitCount = data.exchangeStats?.bybit || 0;

  return {
    events,
    totalCount: data.totalEvents || events.length,
    binanceCount,
    bybitCount,
    sourceDiagnostics: Array.isArray(data.sourceDiagnostics) ? data.sourceDiagnostics : [],
  };
}

function findClosestIndex(levels: PriceLevelScore[], targetPrice: number): number {
  let bestIndex = 0;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (let i = 0; i < levels.length; i++) {
    const diff = Math.abs(levels[i].price - targetPrice);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }

  return bestIndex;
}

async function fetchCoinalyzeOpenInterestUsd(symbol: string, currentPrice: number): Promise<number> {
  const key = process.env.COINALYZE_API_KEY;
  if (!key || currentPrice <= 0) return 0;

  const coinalyzeSymbol = `${symbol}_PERP.A`;
  const to = Math.floor(Date.now() / 1000);
  const from = to - (48 * 60 * 60);
  const url = `https://api.coinalyze.net/v1/open-interest-history?symbols=${coinalyzeSymbol}&interval=4hour&from=${from}&to=${to}`;

  const data = await safeFetchJson<any[]>(url + `&api_key=${key}`);
  const latest = data?.[0]?.history?.[data?.[0]?.history?.length - 1];
  const oiValue = toNumber(latest?.c ?? latest?.v ?? latest?.value, 0);
  return oiValue * currentPrice;
}

async function fetchCoinalyzeLongShortRatio(symbol: string): Promise<number> {
  const key = process.env.COINALYZE_API_KEY;
  if (!key) return 1;

  const coinalyzeSymbol = `${symbol}_PERP.A`;
  const to = Math.floor(Date.now() / 1000);
  const from = to - (48 * 60 * 60);
  const url = `https://api.coinalyze.net/v1/long-short-ratio-history?symbols=${coinalyzeSymbol}&interval=4hour&from=${from}&to=${to}`;

  const data = await safeFetchJson<any[]>(url + `&api_key=${key}`);
  const latest = data?.[0]?.history?.[data?.[0]?.history?.length - 1];
  const longRate = toNumber(latest?.longRate ?? latest?.l, 0.5);
  const shortRate = toNumber(latest?.shortRate ?? latest?.s, 0.5);
  return shortRate > 0 ? longRate / shortRate : 1;
}

async function fetchCoinalyzeFundingRate(symbol: string): Promise<number> {
  const key = process.env.COINALYZE_API_KEY;
  if (!key) return 0;

  const coinalyzeSymbol = `${symbol}_PERP.A`;
  const to = Math.floor(Date.now() / 1000);
  const from = to - (48 * 60 * 60);
  const url = `https://api.coinalyze.net/v1/funding-rate-history?symbols=${coinalyzeSymbol}&interval=4hour&from=${from}&to=${to}`;

  const data = await safeFetchJson<any[]>(url + `&api_key=${key}`);
  const latest = data?.[0]?.history?.[data?.[0]?.history?.length - 1];
  return toNumber(latest?.v ?? latest?.value ?? latest?.fundingRate, 0);
}

async function fetchCoinglassLongShortRatio(symbol: string): Promise<number> {
  const key = process.env.COINGLASS_API_KEY;
  if (!key) return 1;

  const url = `https://open-api-v4.coinglass.com/api/futures/global-long-short-account-ratio/history?exchange=Binance&symbol=${baseSymbol(symbol)}&interval=4h&limit=10`;
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'CG-API-KEY': key },
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return 1;
    const json = await response.json();
    const latest = json?.data?.[json?.data?.length - 1];
    const longRate = toNumber(latest?.longRate, 0.5);
    const shortRate = toNumber(latest?.shortRate, 0.5);
    return shortRate > 0 ? longRate / shortRate : 1;
  } catch {
    return 1;
  }
}

async function fetchCoinglassFundingRate(symbol: string): Promise<number> {
  const key = process.env.COINGLASS_API_KEY;
  if (!key) return 0;

  const url = `https://open-api-v4.coinglass.com/api/futures/funding-rate/history?exchange=Binance&symbol=${baseSymbol(symbol)}&interval=8h&limit=10`;
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'CG-API-KEY': key },
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return 0;
    const json = await response.json();
    const latest = json?.data?.[json?.data?.length - 1];
    return toNumber(latest?.fundingRate ?? latest?.rate, 0);
  } catch {
    return 0;
  }
}

async function fetchCoinglassOpenInterestUsd(symbol: string): Promise<number> {
  const key = process.env.COINGLASS_API_KEY;
  if (!key) return 0;

  const url = `https://open-api-v4.coinglass.com/api/futures/open-interest/history?exchange=Binance&symbol=${baseSymbol(symbol)}&interval=4h&limit=10`;
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'CG-API-KEY': key },
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return 0;
    const json = await response.json();
    const latest = json?.data?.[json?.data?.length - 1];
    return toNumber(latest?.close ?? latest?.open ?? latest?.value, 0);
  } catch {
    return 0;
  }
}

async function fetchCoinglassLiquidationHistoryCount(symbol: string): Promise<number> {
  const key = process.env.COINGLASS_API_KEY;
  if (!key) return 0;

  const url = `https://open-api-v4.coinglass.com/api/futures/liquidation/history?exchange=Binance&symbol=${baseSymbol(symbol)}&interval=4h&limit=30`;
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'CG-API-KEY': key },
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return 0;
    const json = await response.json();
    const rows = Array.isArray(json?.data) ? json.data : [];
    return rows.filter((row: any) =>
      toNumber(row?.long_liquidation_usd ?? row?.longLiquidationUsd, 0) > 0
      || toNumber(row?.short_liquidation_usd ?? row?.shortLiquidationUsd, 0) > 0,
    ).length;
  } catch {
    return 0;
  }
}

function applyPredictedMapComponent(
  levels: PriceLevelScore[],
  currentPrice: number,
  mapLevels: Array<{ price: number; value: number }>,
) {
  for (const mapLevel of mapLevels) {
    if (mapLevel.price <= 0 || mapLevel.value <= 0) continue;
    const index = findClosestIndex(levels, mapLevel.price);
    const weight = mapLevel.value * 0.15;
    if (mapLevel.price < currentPrice) {
      levels[index].components.liqFlowLong += weight;
    } else {
      levels[index].components.liqFlowShort += weight;
    }
  }
}

async function fetchCoinalyzeLiquidationMap(symbol: string): Promise<Array<{ price: number; value: number }>> {
  const key = process.env.COINALYZE_API_KEY;
  if (!key) return [];

  const base = symbol.replace('USDT', '');
  const url = `https://api.coinalyze.net/v1/liquidation-map?symbols=${base}_USDT.A&api_key=${key}`;
  const data = await safeFetchJson<any[]>(url);
  const levels = data?.[0]?.levels;
  if (!Array.isArray(levels)) return [];
  return levels
    .map((l: any) => ({ price: toNumber(l.price), value: toNumber(l.liquidation_value) }))
    .filter((l: { price: number; value: number }) => l.price > 0 && l.value > 0)
    .slice(0, 200);
}

async function fetchCoinalyzeLiquidationHistoryCount(symbol: string): Promise<number> {
  const key = process.env.COINALYZE_API_KEY;
  if (!key) return 0;

  const coinalyzeSymbol = `${symbol}_PERP.A`;
  const to = Math.floor(Date.now() / 1000);
  const from = to - (48 * 60 * 60);
  const url = `https://api.coinalyze.net/v1/liquidation-history?symbols=${coinalyzeSymbol}&interval=4hour&from=${from}&to=${to}`;

  const data = await safeFetchJson<any[]>(url + `&api_key=${key}`);
  const history = data?.[0]?.history;
  if (!Array.isArray(history)) return 0;

  // Count only points with actual liquidation activity.
  return history.filter((p: any) => toNumber(p?.l, 0) > 0 || toNumber(p?.s, 0) > 0).length;
}

function buildPriceLevels(
  currentPrice: number,
  range: string,
  binCount = 48,
  visibleBounds?: { min: number; max: number } | null,
): PriceLevelScore[] {
  const rangePct = RANGE_TO_PERCENT[range] ?? RANGE_TO_PERCENT['7d'];
  const minPrice = visibleBounds && Number.isFinite(visibleBounds.min)
    ? visibleBounds.min
    : currentPrice * (1 - rangePct);
  const maxPrice = visibleBounds && Number.isFinite(visibleBounds.max)
    ? visibleBounds.max
    : currentPrice * (1 + rangePct);
  const step = (maxPrice - minPrice) / Math.max(binCount - 1, 1);

  const levels: PriceLevelScore[] = [];
  for (let i = 0; i < binCount; i++) {
    levels.push({
      price: minPrice + step * i,
      longScore: 0,
      shortScore: 0,
      components: {
        oiLong: 0,
        oiShort: 0,
        orderbookLong: 0,
        orderbookShort: 0,
        liqFlowLong: 0,
        liqFlowShort: 0,
        buildupLong: 0,
        buildupShort: 0,
      },
    });
  }

  return levels;
}

function intervalToSeconds(interval: string): number {
  const mapping: Record<string, number> = {
    '1m': 60,
    '3m': 180,
    '5m': 300,
    '15m': 900,
    '30m': 1800,
    '1h': 3600,
    '2h': 7200,
    '4h': 14400,
    '6h': 21600,
    '12h': 43200,
    '1d': 86400,
    '1w': 604800,
  };
  return mapping[interval] || 3600;
}

function applyBuildupComponent(
  levels: PriceLevelScore[],
  candles: Array<{ open?: number; high?: number; low?: number; close?: number; volume?: number; time?: number }>,
  currentPrice: number,
) {
  if (!Array.isArray(candles) || candles.length === 0) return;

  for (const candle of candles) {
    const low = toNumber(candle.low, 0);
    const high = toNumber(candle.high, 0);
    const open = toNumber(candle.open, 0);
    const close = toNumber(candle.close, 0);
    const volume = toNumber(candle.volume, 0);
    if (low <= 0 || high <= low || volume <= 0) continue;

    const candleRange = high - low;
    const directionalBias = close >= open ? 0.55 : 0.45;

    for (const level of levels) {
      const halfStep = levels.length > 1 ? Math.abs(levels[1].price - levels[0].price) * 0.5 : currentPrice * 0.002;
      const bandLow = level.price - halfStep;
      const bandHigh = level.price + halfStep;
      const overlap = Math.min(high, bandHigh) - Math.max(low, bandLow);
      if (overlap <= 0) continue;

      const weight = overlap / candleRange;
      const notional = level.price * volume * weight;
      if (level.price < currentPrice) {
        level.components.buildupLong += notional * (1 - directionalBias * 0.35);
      } else {
        level.components.buildupShort += notional * (directionalBias + 0.1);
      }
    }
  }
}

function applyOpenInterestComponent(
  levels: PriceLevelScore[],
  currentPrice: number,
  openInterestUsd: number,
  longShortRatio: number,
) {
  if (!Number.isFinite(openInterestUsd) || openInterestUsd <= 0) return;

  const leverageBands = [10, 25, 50, 100];
  const longCrowdedness = clamp((longShortRatio - 1) * 0.5, -0.4, 0.8);
  const shortCrowdedness = clamp((1 - longShortRatio) * 0.5, -0.4, 0.8);

  for (const leverage of leverageBands) {
    const longLiqPrice = currentPrice * (1 - 1 / leverage);
    const shortLiqPrice = currentPrice * (1 + 1 / leverage);

    const longIndex = findClosestIndex(levels, longLiqPrice);
    const shortIndex = findClosestIndex(levels, shortLiqPrice);

    const baseWeight = openInterestUsd * (leverage / 100) * 0.0035;
    const longWeight = baseWeight * (1 + longCrowdedness);
    const shortWeight = baseWeight * (1 + shortCrowdedness);

    levels[longIndex].components.oiLong += Math.max(longWeight, 0);
    levels[shortIndex].components.oiShort += Math.max(shortWeight, 0);

    if (longIndex > 0) levels[longIndex - 1].components.oiLong += Math.max(longWeight * 0.35, 0);
    if (longIndex < levels.length - 1) levels[longIndex + 1].components.oiLong += Math.max(longWeight * 0.35, 0);
    if (shortIndex > 0) levels[shortIndex - 1].components.oiShort += Math.max(shortWeight * 0.35, 0);
    if (shortIndex < levels.length - 1) levels[shortIndex + 1].components.oiShort += Math.max(shortWeight * 0.35, 0);
  }
}

function applyLiqFlowComponent(levels: PriceLevelScore[], forceOrders: BinanceForceOrder[], nowMs: number) {
  for (const order of forceOrders) {
    const price = toNumber(order.avgPrice, toNumber(order.price));
    const qty = toNumber(order.origQty);
    if (price <= 0 || qty <= 0) continue;

    const ageMs = nowMs - toNumber(order.time, nowMs);
    if (ageMs < 0 || ageMs > FORCE_ORDER_CACHE_WINDOW_MS) continue;

    const decay = Math.max(0.1, Math.pow(0.5, ageMs / FLOW_HALFLIFE_MS));

    const usdNotional = price * qty * decay;
    const index = findClosestIndex(levels, price);

    if (order.side === 'SELL') {
      levels[index].components.liqFlowLong += usdNotional;
    } else {
      levels[index].components.liqFlowShort += usdNotional;
    }
  }
}

function applyOrderbookComponent(levels: PriceLevelScore[], currentPrice: number, depth: BinanceDepth | null) {
  if (!depth) return;

  for (const [priceRaw, qtyRaw] of depth.bids ?? []) {
    const price = toNumber(priceRaw);
    const qty = toNumber(qtyRaw);
    if (price <= 0 || qty <= 0) continue;

    const usdNotional = price * qty;
    const index = findClosestIndex(levels, price);
    const distancePenalty = clamp(1 - Math.abs(price - currentPrice) / currentPrice, 0.2, 1);

    // Bids below market often map to downside stop clusters if broken.
    levels[index].components.orderbookLong += usdNotional * 0.35 * distancePenalty;
  }

  for (const [priceRaw, qtyRaw] of depth.asks ?? []) {
    const price = toNumber(priceRaw);
    const qty = toNumber(qtyRaw);
    if (price <= 0 || qty <= 0) continue;

    const usdNotional = price * qty;
    const index = findClosestIndex(levels, price);
    const distancePenalty = clamp(1 - Math.abs(price - currentPrice) / currentPrice, 0.2, 1);

    // Asks above market often map to upside squeeze clusters.
    levels[index].components.orderbookShort += usdNotional * 0.35 * distancePenalty;
  }
}

function maxComponent(levels: PriceLevelScore[], getter: (level: PriceLevelScore) => number): number {
  return levels.reduce((max, level) => Math.max(max, getter(level)), 0);
}

function computeScores(
  levels: PriceLevelScore[],
  openInterestUsd: number,
  fundingRate: number,
  longShortRatio: number,
  weights: ScoringWeights,
): PredictiveLevel[] {
  const maxOiLong = maxComponent(levels, l => l.components.oiLong);
  const maxOiShort = maxComponent(levels, l => l.components.oiShort);
  const maxBookLong = maxComponent(levels, l => l.components.orderbookLong);
  const maxBookShort = maxComponent(levels, l => l.components.orderbookShort);
  const maxFlowLong = maxComponent(levels, l => l.components.liqFlowLong);
  const maxFlowShort = maxComponent(levels, l => l.components.liqFlowShort);
  const maxBuildupLong = maxComponent(levels, l => l.components.buildupLong);
  const maxBuildupShort = maxComponent(levels, l => l.components.buildupShort);

  const lsBias = clamp((longShortRatio - 1) * 0.7, -0.45, 0.45);
  const fundingBias = clamp(fundingRate * 120, -0.35, 0.35);
  const longBias = clamp(0.5 + Math.max(0, lsBias + fundingBias), 0.25, 0.95);
  const shortBias = clamp(0.5 + Math.max(0, -(lsBias + fundingBias)), 0.25, 0.95);

  const scaleBase = Math.max(openInterestUsd * 0.01, 750000);

  const output: PredictiveLevel[] = [];

  for (const level of levels) {
    const oiLongNorm = maxOiLong > 0 ? level.components.oiLong / maxOiLong : 0;
    const oiShortNorm = maxOiShort > 0 ? level.components.oiShort / maxOiShort : 0;
    const bookLongNorm = maxBookLong > 0 ? level.components.orderbookLong / maxBookLong : 0;
    const bookShortNorm = maxBookShort > 0 ? level.components.orderbookShort / maxBookShort : 0;
    const flowLongNorm = maxFlowLong > 0 ? level.components.liqFlowLong / maxFlowLong : 0;
    const flowShortNorm = maxFlowShort > 0 ? level.components.liqFlowShort / maxFlowShort : 0;
    const buildupLongNorm = maxBuildupLong > 0 ? level.components.buildupLong / maxBuildupLong : 0;
    const buildupShortNorm = maxBuildupShort > 0 ? level.components.buildupShort / maxBuildupShort : 0;

    const longScore =
      oiLongNorm * weights.oi +
      ((bookLongNorm * 0.45) + (buildupLongNorm * 0.55)) * weights.orderbook +
      flowLongNorm * weights.liqFlow +
      longBias * weights.bias;

    const shortScore =
      oiShortNorm * weights.oi +
      ((bookShortNorm * 0.45) + (buildupShortNorm * 0.55)) * weights.orderbook +
      flowShortNorm * weights.liqFlow +
      shortBias * weights.bias;

    level.longScore = longScore;
    level.shortScore = shortScore;

    if (longScore > 0.01) {
      output.push({
        price: Number(level.price.toFixed(4)),
        liquidationValue: longScore * scaleBase,
        side: 'long',
      });
    }

    if (shortScore > 0.01) {
      output.push({
        price: Number(level.price.toFixed(4)),
        liquidationValue: shortScore * scaleBase,
        side: 'short',
      });
    }
  }

  return output;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=20');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const symbol = normalizeSymbol(String(req.query.symbol || 'BTCUSDT'));
    const range = String(req.query.range || '7d');
    const anchorTimeMs = toNumber(req.query.anchorTime, 0) > 0 ? toNumber(req.query.anchorTime, 0) * 1000 : null;
    const visibleFromTimeMs = toNumber(req.query.visibleFromTime, 0) > 0 ? toNumber(req.query.visibleFromTime, 0) * 1000 : 0;
    const visibleToTimeMs = toNumber(req.query.visibleToTime, 0) > 0 ? toNumber(req.query.visibleToTime, 0) * 1000 : 0;
    const visibleTimeWindow = visibleToTimeMs > visibleFromTimeMs
      ? { fromMs: visibleFromTimeMs, toMs: visibleToTimeMs }
      : undefined;
    const chartInterval = String(req.query.chartInterval || '1m');
    const visibleMinPrice = toNumber(req.query.visibleMinPrice, 0);
    const visibleMaxPrice = toNumber(req.query.visibleMaxPrice, 0);
    const visibleBounds = visibleMaxPrice > visibleMinPrice && visibleMinPrice > 0
      ? { min: visibleMinPrice, max: visibleMaxPrice }
      : null;
    const now = Date.now();
    const cacheKey = buildCacheKey(symbol, range);
    const cachedSnapshot = rollingSnapshots.get(cacheKey);

    // ── DB cache check: return pre-computed profile if fresh (<3 min old) ──────
    // Only use DB cache when anchorTime is not set (live mode), as historical
    // anchor requests require precise per-candle computation.
    if (!anchorTimeMs && process.env.DATABASE_URL) {
      try {
        const dbSql = _neonConnect(process.env.DATABASE_URL);
        // Normalize chart_interval for DB cache: cron pre-computes profiles for '1h', '4h', '1d' only.
        // Any finer interval (e.g. '5m', '15m', '30m') is served from the '1h' pre-computed profile,
        // which is a reasonable approximation for the live computation fallback that follows.
        const dbInterval = ['4h', '1d'].includes(chartInterval) ? chartInterval : '1h';
        const cached = await dbSql`
          SELECT levels_json, meta_json, computed_at, expires_at
          FROM liq_computed_profiles
          WHERE symbol = ${symbol}
            AND range = ${range}
            AND chart_interval = ${dbInterval}
            AND expires_at > NOW()
          LIMIT 1
        `;
        if (cached.length > 0 && Array.isArray(cached[0].levels_json) && cached[0].levels_json.length > 0) {
          const profile = cached[0];
          const meta = profile.meta_json || {};
          return res.status(200).json({
            code: '0',
            data: {
              levels: profile.levels_json,
              maxLongPrice: 0,
              maxShortPrice: 0,
              totalLongLiquidation: 0,
              totalShortLiquidation: 0,
              lastUpdated: new Date(profile.computed_at).getTime(),
            },
            meta: {
              symbol,
              range,
              source: 'db-cache',
              weights: { oi: 0.4, orderbook: 0.25, liqFlow: 0.2, bias: 0.15 },
              inputs: {
                currentPrice: meta.currentPrice || 0,
                openInterestUsd: meta.openInterestUsd || 0,
                longShortRatio: meta.longShortRatio || 1,
                fundingRate: meta.fundingRate || 0,
                forceOrderCount: meta.forceOrderCount || 0,
                realtimeOrderCount: meta.forceOrderCount || 0,
                mergedForceOrderCount: meta.forceOrderCount || 0,
                depthBidLevels: meta.depthBidLevels || 0,
                depthAskLevels: meta.depthAskLevels || 0,
                coinalyzeMapLevels: 0,
                cacheWarm: true,
                visibleWindowCandleCount: 0,
                chartInterval,
              },
              diagnostics: [{ endpoint: 'db-cache-hit', url: '', ok: true, status: 200, ms: 0, dataPoints: profile.levels_json.length }],
            },
          });
        }
      } catch (dbErr: any) {
        // DB cache miss is non-fatal — fall through to live computation
        console.warn('[predictive-profile] DB cache lookup failed:', dbErr?.message);
      }
    }
    // ── End DB cache check ─────────────────────────────────────────────────────

    const weights = normalizeWeights({
      oi: parseWeight(req.query.oiWeight, 0.4),
      orderbook: parseWeight(req.query.orderbookWeight, 0.25),
      liqFlow: parseWeight(req.query.liqFlowWeight, 0.2),
      bias: parseWeight(req.query.biasWeight, 0.15),
    });

    // Fetch price first with retries, as it's critical
    const diagnostics: EndpointDiagnostic[] = [];

    // Report API key configuration
    const hasCoinalyzeKey = Boolean(process.env.COINALYZE_API_KEY);
    const hasCoinglassKey = Boolean(process.env.COINGLASS_API_KEY);
    if (!hasCoinalyzeKey) {
      diagnostics.push({ endpoint: 'coinalyze-config', url: '', ok: false, status: null, ms: 0, error: 'COINALYZE_API_KEY_not_configured', optional: true });
    }
    if (!hasCoinglassKey) {
      diagnostics.push({ endpoint: 'coinglass-config', url: '', ok: false, status: null, ms: 0, error: 'COINGLASS_API_KEY_not_configured', optional: true });
    }

    const internalMetrics = await fetchInternalAggregatedMetrics(
      req,
      symbol,
      diagnostics,
      anchorTimeMs,
      visibleTimeWindow,
      chartInterval,
    );
    let currentPrice = internalMetrics.price > 0
      ? internalMetrics.price
      : await fetchPriceFromMultipleSources(symbol, diagnostics);

    const canUseExchangeSuite = isExchangeReachable(diagnostics);
    const needsBinanceSuite = !(
      internalMetrics.openInterestUsd > 0
      && internalMetrics.longShortRatio > 0
      && Number.isFinite(internalMetrics.fundingRate)
    );

    let oiData: { openInterest: string } | null = null;
    let ratioData: Array<{ longShortRatio: string }> | null = null;
    let fundingData: { lastFundingRate: string } | null = null;
    let depthData: BinanceDepth | null = null;

    if (canUseExchangeSuite && needsBinanceSuite) {
      // Bybit-first suite: OI, funding, depth from Bybit; fall back to Binance if Bybit fails
      const [bybitOiResult, bybitFundingResult, bybitDepthResult, bybitRatioResult] = await Promise.all([
        fetchTracked<{ result?: { list?: Array<{ openInterest?: string }> } }>(
          'bybit-oi',
          `https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${symbol}&intervalTime=5min&limit=1`,
        ),
        fetchTracked<{ result?: { list?: Array<{ fundingRate?: string }> } }>(
          'bybit-funding',
          `https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${symbol}&limit=1`,
        ),
        fetchTracked<{ result?: { b?: [string, string][]; a?: [string, string][] } }>(
          'bybit-depth',
          `https://api.bybit.com/v5/market/orderbook?category=linear&symbol=${symbol}&limit=100`,
        ),
        fetchTracked<{ result?: { list?: Array<{ buyRatio?: string; sellRatio?: string }> } }>(
          'bybit-ls-ratio',
          `https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=${symbol}&period=1d&limit=1`,
        ),
      ]);

      diagnostics.push(bybitOiResult.diag, bybitFundingResult.diag, bybitDepthResult.diag, bybitRatioResult.diag);

      // Map Bybit OI response → internal format
      const bybitOiValue = toNumber(bybitOiResult.data?.result?.list?.[0]?.openInterest, 0);
      if (bybitOiValue > 0) {
        oiData = { openInterest: String(bybitOiValue) };
      }

      // Map Bybit funding rate
      const bybitFundingRate = toNumber(bybitFundingResult.data?.result?.list?.[0]?.fundingRate, 0);
      if (bybitFundingRate !== 0) {
        fundingData = { lastFundingRate: String(bybitFundingRate) };
      }

      // Map Bybit orderbook (b=bids, a=asks) → BinanceDepth format
      if (bybitDepthResult.data?.result) {
        depthData = {
          bids: bybitDepthResult.data.result.b ?? [],
          asks: bybitDepthResult.data.result.a ?? [],
        };
        if (bybitDepthResult.diag.ok) bybitDepthResult.diag.dataPoints = depthData.bids.length;
      }

      // Map Bybit long-short ratio
      const bybitBuyRatio = toNumber(bybitRatioResult.data?.result?.list?.[0]?.buyRatio, 0);
      const bybitSellRatio = toNumber(bybitRatioResult.data?.result?.list?.[0]?.sellRatio, 0);
      if (bybitBuyRatio > 0 && bybitSellRatio > 0) {
        ratioData = [{ longShortRatio: String(bybitSellRatio > 0 ? bybitBuyRatio / bybitSellRatio : 1) }];
        if (bybitRatioResult.diag.ok) bybitRatioResult.diag.dataPoints = 1;
      }

      // Binance fallbacks for any missing data
      const needsBinanceOi = !oiData;
      const needsBinanceFunding = !fundingData;
      const needsBinanceDepth = !depthData;
      const needsBinanceRatio = !ratioData;
      const needsAnyBinanceFallback = needsBinanceOi || needsBinanceFunding || needsBinanceDepth || needsBinanceRatio;

      if (needsAnyBinanceFallback) {
        const binanceFallbacks = await Promise.all([
          needsBinanceOi ? fetchTracked<{ openInterest: string }>(
            'binance-oi',
            `https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`,
          ) : null,
          needsBinanceRatio ? fetchTracked<Array<{ longShortRatio: string }>>(
            'binance-ls-ratio',
            `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`,
          ) : null,
          needsBinanceFunding ? fetchTracked<{ lastFundingRate: string }>(
            'binance-funding',
            `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`,
          ) : null,
          needsBinanceDepth ? fetchTracked<BinanceDepth>(
            'binance-depth',
            `https://fapi.binance.com/fapi/v1/depth?symbol=${symbol}&limit=100`,
          ) : null,
        ]);

        const [binanceOiResult, binanceRatioResult, binanceFundingResult, binanceDepthResult] = binanceFallbacks;

        if (binanceOiResult) {
          diagnostics.push(binanceOiResult.diag);
          if (binanceOiResult.data) oiData = binanceOiResult.data;
        }
        if (binanceRatioResult) {
          diagnostics.push(binanceRatioResult.diag);
          if (binanceRatioResult.data) {
            ratioData = binanceRatioResult.data;
            if (binanceRatioResult.diag.ok) binanceRatioResult.diag.dataPoints = Array.isArray(binanceRatioResult.data) ? binanceRatioResult.data.length : 0;
          }
        }
        if (binanceFundingResult) {
          diagnostics.push(binanceFundingResult.diag);
          if (binanceFundingResult.data) fundingData = binanceFundingResult.data;
        }
        if (binanceDepthResult) {
          diagnostics.push(binanceDepthResult.diag);
          if (binanceDepthResult.data) {
            depthData = binanceDepthResult.data;
            if (binanceDepthResult.diag.ok) binanceDepthResult.diag.dataPoints = binanceDepthResult.data?.bids?.length ?? 0;
          }
        }
      }
    } else {
      diagnostics.push({
        endpoint: 'exchange-suite-skipped',
        url: '',
        ok: true,
        status: null,
        ms: 0,
        optional: true,
        error: needsBinanceSuite ? 'exchange_unreachable_using_fallbacks' : 'internal_aggregated_endpoints_used',
      });
    }
    const realtimeStats = await trackFn(
      diagnostics,
      'realtime-liquidations',
      () => fetchRealtimeLiquidationEvents(req, symbol),
      (v) => v.totalCount > 0,
      (v) => v.totalCount,
      true,
    );

    const realtimeOrders = realtimeStats?.events || [];
    if (Array.isArray(realtimeStats?.sourceDiagnostics)) {
      for (const srcDiag of realtimeStats.sourceDiagnostics) {
        diagnostics.push({
          endpoint: `realtime-${srcDiag.source}`,
          url: `realtime-${srcDiag.source}`,
          ok: srcDiag.ok,
          status: srcDiag.status,
          ms: 0,
          dataPoints: srcDiag.count,
          optional: true,
          error: srcDiag.error,
        });
      }
    }

    const openInterestQty = toNumber(oiData?.openInterest, 0);
    let openInterestUsd = internalMetrics.openInterestUsd > 0
      ? internalMetrics.openInterestUsd
      : openInterestQty * currentPrice;
    let longShortRatio = internalMetrics.longShortRatio > 0
      ? internalMetrics.longShortRatio
      : toNumber((ratioData as any)?.[0]?.longShortRatio, 1);
    let fundingRate = Number.isFinite(internalMetrics.fundingRate) && internalMetrics.fundingRate !== 0
      ? internalMetrics.fundingRate
      : toNumber((fundingData as any)?.lastFundingRate, 0);

    const [coinalyzeOiUsd, coinalyzeLs, coinalyzeFunding, coinglassOiUsd, coinglassLs, coinglassFunding, coinalyzeMap, coinalyzeLiqHistoryCount, coinglassLiqHistoryCount] = await Promise.all([
      trackFn(diagnostics, 'coinalyze-oi', () => fetchCoinalyzeOpenInterestUsd(symbol, Math.max(currentPrice, 1)), (v) => (v as number) > 0, undefined, true),
      trackFn(diagnostics, 'coinalyze-ls-ratio', () => fetchCoinalyzeLongShortRatio(symbol), (v) => (v as number) > 0 && (v as number) !== 1, undefined, true),
      trackFn(diagnostics, 'coinalyze-funding', () => fetchCoinalyzeFundingRate(symbol), (v) => (v as number) !== 0, undefined, true),
      trackFn(diagnostics, 'coinglass-oi', () => fetchCoinglassOpenInterestUsd(symbol), (v) => (v as number) > 0, undefined, true),
      trackFn(diagnostics, 'coinglass-ls-ratio', () => fetchCoinglassLongShortRatio(symbol), (v) => (v as number) > 0 && (v as number) !== 1, undefined, true),
      trackFn(diagnostics, 'coinglass-funding', () => fetchCoinglassFundingRate(symbol), (v) => (v as number) !== 0, undefined, true),
      trackFn(
        diagnostics,
        'coinalyze-liq-map',
        () => fetchCoinalyzeLiquidationMap(symbol),
        (v) => Array.isArray(v) && v.length > 0,
        (v) => Array.isArray(v) ? v.length : 0,
        true,
      ),
      trackFn(
        diagnostics,
        'coinalyze-liq-history',
        () => fetchCoinalyzeLiquidationHistoryCount(symbol),
        (v) => (v as number) > 0,
        (v) => Number(v) || 0,
        true,
      ),
      trackFn(
        diagnostics,
        'coinglass-liq-history',
        () => fetchCoinglassLiquidationHistoryCount(symbol),
        (v) => (v as number) > 0,
        (v) => Number(v) || 0,
        true,
      ),
    ]);

    const coinalyzeFallbackCount = Math.max(
      Number(coinalyzeLiqHistoryCount) || 0,
      Array.isArray(coinalyzeMap) ? coinalyzeMap.length : 0,
    );
    const coinglassFallbackCount = Number(coinglassLiqHistoryCount) || 0;
    const effectiveRealtimeCount = realtimeStats?.totalCount || 0;
    const effectiveBinanceCount = realtimeStats?.binanceCount || 0;
    const keyedFallbackCount = Math.max(coinalyzeFallbackCount, coinglassFallbackCount);
    const effectiveSourceCount = effectiveRealtimeCount > 0
      ? effectiveRealtimeCount
      : keyedFallbackCount;

    // If price is still 0, try to estimate from Coinalyze map median
    if (currentPrice <= 0 && Array.isArray(coinalyzeMap) && coinalyzeMap.length > 0) {
      const prices = coinalyzeMap.map((l: { price: number; value: number }) => l.price).filter((p: number) => p > 0).sort((a: number, b: number) => a - b);
      if (prices.length > 0) {
        currentPrice = prices[Math.floor(prices.length / 2)];
        diagnostics.push({ endpoint: 'price-from-map', url: '', ok: true, status: null, ms: 0, dataPoints: 1 });
      }
    }

    // If price is still 0 after all fallbacks, return with diagnostics but no levels
    if (currentPrice <= 0) {
      return res.status(200).json({
        code: '1',
        data: {
          levels: [],
          maxLongPrice: 0,
          maxShortPrice: 0,
          totalLongLiquidation: 0,
          totalShortLiquidation: 0,
          lastUpdated: Date.now(),
        },
        meta: {
          symbol,
          range,
          source: 'predictive-binance',
          note: 'price_unavailable_and_no_cache',
          diagnostics,
        },
      });
    }

    if (openInterestUsd <= 0) {
      openInterestUsd = (coinalyzeOiUsd as number) > 0 ? (coinalyzeOiUsd as number) : (coinglassOiUsd as number);
    } else if ((coinalyzeOiUsd as number) > 0 || (coinglassOiUsd as number) > 0) {
      const fallbackOi = (coinalyzeOiUsd as number) > 0 ? (coinalyzeOiUsd as number) : (coinglassOiUsd as number);
      openInterestUsd = openInterestUsd * 0.7 + fallbackOi * 0.3;
    }

    if (longShortRatio <= 0 || !Number.isFinite(longShortRatio)) {
      longShortRatio = (coinalyzeLs as number) > 0 ? (coinalyzeLs as number) : (coinglassLs as number);
    } else {
      const fallbackLs = (coinalyzeLs as number) > 0 ? (coinalyzeLs as number) : (coinglassLs as number);
      if (fallbackLs > 0) longShortRatio = longShortRatio * 0.7 + fallbackLs * 0.3;
    }

    if (!Number.isFinite(fundingRate) || fundingRate === 0) {
      fundingRate = (coinalyzeFunding as number) !== 0 ? (coinalyzeFunding as number) : (coinglassFunding as number);
    } else {
      const fallbackFunding = (coinalyzeFunding as number) !== 0 ? (coinalyzeFunding as number) : (coinglassFunding as number);
      if (fallbackFunding !== 0) fundingRate = fundingRate * 0.7 + fallbackFunding * 0.3;
    }

    const recentForceOrders = mergeRecentForceOrders(
      now,
      Array.isArray(realtimeOrders) ? realtimeOrders : [],
      cachedSnapshot?.forceOrders || [],
    );

    const effectiveDepth = depthData || cachedSnapshot?.depth || null;

    // Only persist non-empty data to avoid cache-poisoning with empty arrays
    if (recentForceOrders.length > 0 || effectiveDepth !== null) {
      rollingSnapshots.set(cacheKey, {
        lastUpdated: now,
        forceOrders: recentForceOrders,
        depth: effectiveDepth,
      });
    }

    if (rollingSnapshots.size > 30) {
      const staleBefore = now - FORCE_ORDER_CACHE_WINDOW_MS;
      for (const [key, snapshot] of rollingSnapshots.entries()) {
        if (snapshot.lastUpdated < staleBefore) {
          rollingSnapshots.delete(key);
        }
      }
    }

    const levels = buildPriceLevels(currentPrice, range, 48, visibleBounds);

    applyOpenInterestComponent(levels, currentPrice, openInterestUsd, longShortRatio);
    applyLiqFlowComponent(levels, recentForceOrders, now);
    applyPredictedMapComponent(levels, currentPrice, coinalyzeMap);
    applyOrderbookComponent(levels, currentPrice, effectiveDepth);
    applyBuildupComponent(levels, internalMetrics.candles, currentPrice);

    const predictiveLevels = computeScores(levels, openInterestUsd, fundingRate, longShortRatio, weights);

    // Update price cache for fallback
    setPriceCache(symbol, currentPrice);

    let totalLongLiquidation = 0;
    let totalShortLiquidation = 0;
    let maxLongPrice = 0;
    let maxShortPrice = 0;
    let maxLongValue = 0;
    let maxShortValue = 0;

    for (const level of predictiveLevels) {
      if (level.side === 'long') {
        totalLongLiquidation += level.liquidationValue;
        if (level.liquidationValue > maxLongValue) {
          maxLongValue = level.liquidationValue;
          maxLongPrice = level.price;
        }
      } else {
        totalShortLiquidation += level.liquidationValue;
        if (level.liquidationValue > maxShortValue) {
          maxShortValue = level.liquidationValue;
          maxShortPrice = level.price;
        }
      }
    }

    return res.status(200).json({
      code: '0',
      data: {
        levels: predictiveLevels,
        maxLongPrice,
        maxShortPrice,
        totalLongLiquidation,
        totalShortLiquidation,
        lastUpdated: Date.now(),
      },
      meta: {
        symbol,
        range,
        source: 'predictive-blended',
        weights,
        inputs: {
          currentPrice,
          openInterestUsd,
          longShortRatio,
          fundingRate,
          forceOrderCount: effectiveBinanceCount > 0 ? effectiveBinanceCount : keyedFallbackCount,
          realtimeOrderCount: effectiveSourceCount,
          mergedForceOrderCount: recentForceOrders.length > 0 ? recentForceOrders.length : effectiveSourceCount,
          depthBidLevels: effectiveDepth?.bids?.length || 0,
          depthAskLevels: effectiveDepth?.asks?.length || 0,
          coinalyzeMapLevels: Array.isArray(coinalyzeMap) ? coinalyzeMap.length : 0,
          coinalyzeOiUsd,
          coinglassOiUsd,
          coinalyzeLs,
          coinglassLs,
          coinalyzeFunding,
          coinglassFunding,
          cacheWarm: Boolean(cachedSnapshot),
          visibleWindowCandleCount: internalMetrics.candles.length,
          chartInterval,
        },
        diagnostics,
      },
    });
  } catch (error: any) {
    return res.status(200).json({
      code: '1',
      data: {
        levels: [],
        maxLongPrice: 0,
        maxShortPrice: 0,
        totalLongLiquidation: 0,
        totalShortLiquidation: 0,
        lastUpdated: Date.now(),
      },
      meta: {
        source: 'predictive-binance',
        diagnostics: [],
      },
      error: error?.message || 'Failed to build predictive profile',
    });
  }
}
