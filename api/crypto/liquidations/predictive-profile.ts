type VercelRequest = any;
type VercelResponse = any;
declare const process: { env: Record<string, string | undefined> };

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

interface RollingSnapshot {
  lastUpdated: number;
  forceOrders: BinanceForceOrder[];
  depth: BinanceDepth | null;
}

const rollingSnapshots = new Map<string, RollingSnapshot>();
const priceCache = new Map<string, { price: number; timestamp: number }>();
const FORCE_ORDER_CACHE_WINDOW_MS = 10 * 60 * 1000;
const FLOW_HALFLIFE_MS = 3 * 60 * 1000;
const PRICE_CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

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

async function safeFetchJson<T>(url: string, retries = 2): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
          continue;
        }
        return null;
      }
      return await response.json() as T;
    } catch {
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
        continue;
      }
      return null;
    }
  }
  return null;
}

function setPriceCache(symbol: string, price: number): void {
  if (price > 0) {
    priceCache.set(symbol, { price, timestamp: Date.now() });
  }
}

function getPriceCacheOrNull(symbol: string): number | null {
  const cached = priceCache.get(symbol);
  if (!cached) return null;
  const age = Date.now() - cached.timestamp;
  if (age > PRICE_CACHE_MAX_AGE_MS) {
    priceCache.delete(symbol);
    return null;
  }
  return cached.price;
}

function baseSymbol(symbol: string): string {
  return symbol.replace(/USDT$/, '').replace(/BUSD$/, '');
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
): Promise<BinanceForceOrder[]> {
  const origin = getRequestOrigin(req);
  if (!origin) return [];

  const url = `${origin}/api/crypto/liquidations/realtime?symbol=${symbol}&limit=300&exchange=all`;
  const data = await safeFetchJson<RealtimeLiquidationResponse>(url);
  if (!data?.events || !Array.isArray(data.events)) return [];

  return data.events
    .filter((e) => Number.isFinite(e.price) && Number.isFinite(e.quantity) && Number.isFinite(e.timestamp))
    .map(toForceOrderFromRealtimeEvent);
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

function buildPriceLevels(currentPrice: number, range: string, binCount = 48): PriceLevelScore[] {
  const rangePct = RANGE_TO_PERCENT[range] ?? RANGE_TO_PERCENT['7d'];
  const minPrice = currentPrice * (1 - rangePct);
  const maxPrice = currentPrice * (1 + rangePct);
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
      },
    });
  }

  return levels;
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

    const longScore =
      oiLongNorm * weights.oi +
      bookLongNorm * weights.orderbook +
      flowLongNorm * weights.liqFlow +
      longBias * weights.bias;

    const shortScore =
      oiShortNorm * weights.oi +
      bookShortNorm * weights.orderbook +
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
    const now = Date.now();
    const cacheKey = buildCacheKey(symbol, range);
    const cachedSnapshot = rollingSnapshots.get(cacheKey);

    const weights = normalizeWeights({
      oi: parseWeight(req.query.oiWeight, 0.4),
      orderbook: parseWeight(req.query.orderbookWeight, 0.25),
      liqFlow: parseWeight(req.query.liqFlowWeight, 0.2),
      bias: parseWeight(req.query.biasWeight, 0.15),
    });

    const [priceData, oiData, ratioData, fundingData, forceOrders, depthData, realtimeOrders] = await Promise.all([
      safeFetchJson<{ price: string }>(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`),
      safeFetchJson<{ openInterest: string }>(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`),
      safeFetchJson<Array<{ longShortRatio: string }>>(
        `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`
      ),
      safeFetchJson<{ lastFundingRate: string }>(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`),
      safeFetchJson<BinanceForceOrder[]>(`https://fapi.binance.com/fapi/v1/allForceOrders?symbol=${symbol}&limit=200`),
      safeFetchJson<BinanceDepth>(`https://fapi.binance.com/fapi/v1/depth?symbol=${symbol}&limit=100`),
      fetchRealtimeLiquidationEvents(req, symbol),
    ]);

    let currentPrice = toNumber(priceData?.price, 0);
    // Fallback to price cache if fetch failed
    if (currentPrice <= 0) {
      const cachedPrice = getPriceCacheOrNull(symbol);
      if (cachedPrice) {
        currentPrice = cachedPrice;
      } else {
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
            note: 'price_unavailable',
          },
        });
      }
    }

    const openInterestQty = toNumber(oiData?.openInterest, 0);
    let openInterestUsd = openInterestQty * currentPrice;
    let longShortRatio = toNumber(ratioData?.[0]?.longShortRatio, 1);
    let fundingRate = toNumber(fundingData?.lastFundingRate, 0);

    const [coinalyzeOiUsd, coinalyzeLs, coinalyzeFunding, coinglassOiUsd, coinglassLs, coinglassFunding, coinalyzeMap] = await Promise.all([
      fetchCoinalyzeOpenInterestUsd(symbol, currentPrice),
      fetchCoinalyzeLongShortRatio(symbol),
      fetchCoinalyzeFundingRate(symbol),
      fetchCoinglassOpenInterestUsd(symbol),
      fetchCoinglassLongShortRatio(symbol),
      fetchCoinglassFundingRate(symbol),
      fetchCoinalyzeLiquidationMap(symbol),
    ]);

    if (openInterestUsd <= 0) {
      openInterestUsd = coinalyzeOiUsd > 0 ? coinalyzeOiUsd : coinglassOiUsd;
    } else if (coinalyzeOiUsd > 0 || coinglassOiUsd > 0) {
      const fallbackOi = coinalyzeOiUsd > 0 ? coinalyzeOiUsd : coinglassOiUsd;
      openInterestUsd = openInterestUsd * 0.7 + fallbackOi * 0.3;
    }

    if (longShortRatio <= 0 || !Number.isFinite(longShortRatio)) {
      longShortRatio = coinalyzeLs > 0 ? coinalyzeLs : coinglassLs;
    } else {
      const fallbackLs = coinalyzeLs > 0 ? coinalyzeLs : coinglassLs;
      if (fallbackLs > 0) longShortRatio = longShortRatio * 0.7 + fallbackLs * 0.3;
    }

    if (!Number.isFinite(fundingRate) || fundingRate === 0) {
      fundingRate = coinalyzeFunding !== 0 ? coinalyzeFunding : coinglassFunding;
    } else {
      const fallbackFunding = coinalyzeFunding !== 0 ? coinalyzeFunding : coinglassFunding;
      if (fallbackFunding !== 0) fundingRate = fundingRate * 0.7 + fallbackFunding * 0.3;
    }

    const recentForceOrders = mergeRecentForceOrders(
      now,
      [
        ...(Array.isArray(forceOrders) ? forceOrders : []),
        ...(Array.isArray(realtimeOrders) ? realtimeOrders : []),
      ],
      cachedSnapshot?.forceOrders || [],
    );

    const effectiveDepth = depthData || cachedSnapshot?.depth || null;

    rollingSnapshots.set(cacheKey, {
      lastUpdated: now,
      forceOrders: recentForceOrders,
      depth: effectiveDepth,
    });

    if (rollingSnapshots.size > 30) {
      const staleBefore = now - FORCE_ORDER_CACHE_WINDOW_MS;
      for (const [key, snapshot] of rollingSnapshots.entries()) {
        if (snapshot.lastUpdated < staleBefore) {
          rollingSnapshots.delete(key);
        }
      }
    }

    const levels = buildPriceLevels(currentPrice, range, 48);

    applyOpenInterestComponent(levels, currentPrice, openInterestUsd, longShortRatio);
    applyLiqFlowComponent(levels, recentForceOrders, now);
    applyPredictedMapComponent(levels, currentPrice, coinalyzeMap);
    applyOrderbookComponent(levels, currentPrice, effectiveDepth);

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
          forceOrderCount: Array.isArray(forceOrders) ? forceOrders.length : 0,
          realtimeOrderCount: Array.isArray(realtimeOrders) ? realtimeOrders.length : 0,
          mergedForceOrderCount: recentForceOrders.length,
          depthBidLevels: effectiveDepth?.bids?.length || 0,
          depthAskLevels: effectiveDepth?.asks?.length || 0,
          coinalyzeMapLevels: coinalyzeMap.length,
          coinalyzeOiUsd,
          coinglassOiUsd,
          coinalyzeLs,
          coinglassLs,
          coinalyzeFunding,
          coinglassFunding,
          cacheWarm: Boolean(cachedSnapshot),
        },
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
      },
      error: error?.message || 'Failed to build predictive profile',
    });
  }
}
