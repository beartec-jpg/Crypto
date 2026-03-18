import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

// ── Shared types ───────────────────────────────────────────────────────────────

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

interface ForceOrder {
  side: 'Buy' | 'Sell';
  price: number;
  quantity: number;
  eventTime: Date;
  valueUsd: number;
}

type DepthEntry = [string, string];

// ── Pure scoring helpers (mirrored from predictive-profile.ts) ─────────────────

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }
function toN(v: unknown, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }

const RANGE_TO_PERCENT: Record<string, number> = {
  '24h': 0.04, '48h': 0.06, '7d': 0.08, '30d': 0.12, '90d': 0.18,
};

function buildPriceLevels(currentPrice: number, range: string, binCount = 48): PriceLevelScore[] {
  const pct = RANGE_TO_PERCENT[range] ?? 0.08;
  const minPrice = currentPrice * (1 - pct);
  const maxPrice = currentPrice * (1 + pct);
  const step = (maxPrice - minPrice) / Math.max(binCount - 1, 1);
  return Array.from({ length: binCount }, (_, i) => ({
    price: minPrice + step * i,
    longScore: 0, shortScore: 0,
    components: { oiLong: 0, oiShort: 0, orderbookLong: 0, orderbookShort: 0, liqFlowLong: 0, liqFlowShort: 0, buildupLong: 0, buildupShort: 0 },
  }));
}

function findClosestIndex(levels: PriceLevelScore[], target: number): number {
  let best = 0; let bestDiff = Infinity;
  for (let i = 0; i < levels.length; i++) {
    const d = Math.abs(levels[i].price - target);
    if (d < bestDiff) { bestDiff = d; best = i; }
  }
  return best;
}

function applyOI(levels: PriceLevelScore[], currentPrice: number, oiUsd: number, lsRatio: number) {
  if (!Number.isFinite(oiUsd) || oiUsd <= 0) return;
  const longCrowd = clamp((lsRatio - 1) * 0.5, -0.4, 0.8);
  const shortCrowd = clamp((1 - lsRatio) * 0.5, -0.4, 0.8);
  for (const lev of [10, 25, 50, 100]) {
    const longIdx = findClosestIndex(levels, currentPrice * (1 - 1 / lev));
    const shortIdx = findClosestIndex(levels, currentPrice * (1 + 1 / lev));
    const base = oiUsd * (lev / 100) * 0.0035;
    const lw = Math.max(base * (1 + longCrowd), 0);
    const sw = Math.max(base * (1 + shortCrowd), 0);
    levels[longIdx].components.oiLong += lw;
    levels[shortIdx].components.oiShort += sw;
    if (longIdx > 0) levels[longIdx - 1].components.oiLong += lw * 0.35;
    if (longIdx < levels.length - 1) levels[longIdx + 1].components.oiLong += lw * 0.35;
    if (shortIdx > 0) levels[shortIdx - 1].components.oiShort += sw * 0.35;
    if (shortIdx < levels.length - 1) levels[shortIdx + 1].components.oiShort += sw * 0.35;
  }
}

function applyOrderbook(levels: PriceLevelScore[], currentPrice: number, bids: DepthEntry[], asks: DepthEntry[]) {
  for (const [priceRaw, qtyRaw] of bids) {
    const price = toN(priceRaw); const qty = toN(qtyRaw);
    if (price <= 0 || qty <= 0) continue;
    const idx = findClosestIndex(levels, price);
    const dist = clamp(1 - Math.abs(price - currentPrice) / currentPrice, 0.2, 1);
    levels[idx].components.orderbookLong += price * qty * 0.35 * dist;
  }
  for (const [priceRaw, qtyRaw] of asks) {
    const price = toN(priceRaw); const qty = toN(qtyRaw);
    if (price <= 0 || qty <= 0) continue;
    const idx = findClosestIndex(levels, price);
    const dist = clamp(1 - Math.abs(price - currentPrice) / currentPrice, 0.2, 1);
    levels[idx].components.orderbookShort += price * qty * 0.35 * dist;
  }
}

const CACHE_WINDOW_MS = 10 * 60 * 1000;
const FLOW_HALFLIFE_MS = 3 * 60 * 1000;

function applyLiqFlow(levels: PriceLevelScore[], orders: ForceOrder[], nowMs: number) {
  for (const o of orders) {
    if (o.price <= 0 || o.quantity <= 0) continue;
    const ageMs = nowMs - o.eventTime.getTime();
    if (ageMs < 0 || ageMs > CACHE_WINDOW_MS) continue;
    const decay = Math.max(0.1, Math.pow(0.5, ageMs / FLOW_HALFLIFE_MS));
    const usd = o.price * o.quantity * decay;
    const idx = findClosestIndex(levels, o.price);
    if (o.side === 'Sell') levels[idx].components.liqFlowLong += usd;
    else levels[idx].components.liqFlowShort += usd;
  }
}

function maxComp(levels: PriceLevelScore[], get: (l: PriceLevelScore) => number) {
  return levels.reduce((m, l) => Math.max(m, get(l)), 0);
}

function computeScores(
  levels: PriceLevelScore[],
  oiUsd: number,
  fundingRate: number,
  lsRatio: number,
  weights: ScoringWeights,
): PredictiveLevel[] {
  const maxOiL = maxComp(levels, l => l.components.oiLong);
  const maxOiS = maxComp(levels, l => l.components.oiShort);
  const maxBkL = maxComp(levels, l => l.components.orderbookLong);
  const maxBkS = maxComp(levels, l => l.components.orderbookShort);
  const maxFlL = maxComp(levels, l => l.components.liqFlowLong);
  const maxFlS = maxComp(levels, l => l.components.liqFlowShort);
  const maxBuL = maxComp(levels, l => l.components.buildupLong);
  const maxBuS = maxComp(levels, l => l.components.buildupShort);

  const lsBias = clamp((lsRatio - 1) * 0.7, -0.45, 0.45);
  const fBias = clamp(fundingRate * 120, -0.35, 0.35);
  const longBias = clamp(0.5 + Math.max(0, lsBias + fBias), 0.25, 0.95);
  const shortBias = clamp(0.5 + Math.max(0, -(lsBias + fBias)), 0.25, 0.95);
  const scaleBase = Math.max(oiUsd * 0.01, 750000);

  const out: PredictiveLevel[] = [];
  for (const l of levels) {
    const oiLn = maxOiL > 0 ? l.components.oiLong / maxOiL : 0;
    const oiSn = maxOiS > 0 ? l.components.oiShort / maxOiS : 0;
    const bkLn = maxBkL > 0 ? l.components.orderbookLong / maxBkL : 0;
    const bkSn = maxBkS > 0 ? l.components.orderbookShort / maxBkS : 0;
    const flLn = maxFlL > 0 ? l.components.liqFlowLong / maxFlL : 0;
    const flSn = maxFlS > 0 ? l.components.liqFlowShort / maxFlS : 0;
    const buLn = maxBuL > 0 ? l.components.buildupLong / maxBuL : 0;
    const buSn = maxBuS > 0 ? l.components.buildupShort / maxBuS : 0;

    const longScore =
      oiLn * weights.oi +
      (bkLn * 0.45 + buLn * 0.55) * weights.orderbook +
      flLn * weights.liqFlow +
      longBias * weights.bias;

    const shortScore =
      oiSn * weights.oi +
      (bkSn * 0.45 + buSn * 0.55) * weights.orderbook +
      flSn * weights.liqFlow +
      shortBias * weights.bias;

    if (longScore > 0.01) out.push({ price: Number(l.price.toFixed(4)), liquidationValue: longScore * scaleBase, side: 'long' });
    if (shortScore > 0.01) out.push({ price: Number(l.price.toFixed(4)), liquidationValue: shortScore * scaleBase, side: 'short' });
  }
  return out;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RANGES = ['24h', '48h', '7d', '30d', '90d'] as const;
const CHART_INTERVALS = ['1h', '4h', '1d'] as const;

/** How long a pre-computed profile remains valid. Set to 5 min so that the
 *  2-min cron always produces a fresh result before the previous expires. */
const PROFILE_TTL_MS = 5 * 60 * 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'DATABASE_URL not configured' });
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    // 1. Read enabled symbols
    const trackedRows = await sql`
      SELECT symbol FROM liq_tracked_symbols WHERE enabled = TRUE ORDER BY priority DESC
    `;
    const symbols: string[] = trackedRows.map((r: any) => r.symbol as string);
    if (symbols.length === 0) {
      return res.status(200).json({ ok: true, message: 'No tracked symbols', computed: 0 });
    }

    const defaultWeights: ScoringWeights = { oi: 0.4, orderbook: 0.25, liqFlow: 0.2, bias: 0.15 };
    let totalComputed = 0;
    const nowMs = Date.now();

    for (const symbol of symbols) {
      // 2. Fetch latest snapshot for this symbol
      const snapshots = await sql`
        SELECT * FROM liq_market_snapshots
        WHERE symbol = ${symbol}
        ORDER BY snapshot_time DESC
        LIMIT 1
      `;
      const snap = snapshots[0];
      if (!snap) {
        console.warn(`[compute-profiles] No snapshot for ${symbol}, skipping`);
        continue;
      }

      const currentPrice = toN(snap.price);
      if (currentPrice <= 0) continue;

      const oiUsd = toN(snap.open_interest_usd);
      const fundingRate = toN(snap.funding_rate);
      const lsRatio = toN(snap.long_short_ratio, 1);
      const depthBids: DepthEntry[] = Array.isArray(snap.depth_bids) ? snap.depth_bids : [];
      const depthAsks: DepthEntry[] = Array.isArray(snap.depth_asks) ? snap.depth_asks : [];

      // 3. Fetch recent liquidation events for liqFlow component
      const orderRows = await sql`
        SELECT side, price, quantity, event_time, value_usd
        FROM liq_force_orders
        WHERE symbol = ${symbol}
          AND event_time > NOW() - INTERVAL '10 minutes'
        ORDER BY event_time DESC
        LIMIT 600
      `;      const orders: ForceOrder[] = orderRows.map((r: any) => ({
        side: r.side as 'Buy' | 'Sell',
        price: toN(r.price),
        quantity: toN(r.quantity),
        eventTime: new Date(r.event_time),
        valueUsd: toN(r.value_usd),
      }));

      // 4. Compute profile for each range × interval combination
      for (const range of RANGES) {
        for (const chartInterval of CHART_INTERVALS) {
          const levels = buildPriceLevels(currentPrice, range);

          applyOI(levels, currentPrice, oiUsd, lsRatio);
          applyLiqFlow(levels, orders, nowMs);
          applyOrderbook(levels, currentPrice, depthBids, depthAsks);

          const predictiveLevels = computeScores(levels, oiUsd, fundingRate, lsRatio, defaultWeights);

          const metaJson = {
            symbol,
            range,
            chartInterval,
            currentPrice,
            openInterestUsd: oiUsd,
            fundingRate,
            longShortRatio: lsRatio,
            forceOrderCount: orders.length,
            depthBidLevels: depthBids.length,
            depthAskLevels: depthAsks.length,
            source: 'bybit-db',
            computedAt: new Date().toISOString(),
          };

          const expiresAt = new Date(nowMs + PROFILE_TTL_MS);

          await sql`
            INSERT INTO liq_computed_profiles
              (symbol, range, chart_interval, levels_json, meta_json, computed_at, expires_at)
            VALUES (
              ${symbol},
              ${range},
              ${chartInterval},
              ${JSON.stringify(predictiveLevels)},
              ${JSON.stringify(metaJson)},
              NOW(),
              ${expiresAt.toISOString()}
            )
            ON CONFLICT (symbol, range, chart_interval)
            DO UPDATE SET
              levels_json = EXCLUDED.levels_json,
              meta_json   = EXCLUDED.meta_json,
              computed_at = EXCLUDED.computed_at,
              expires_at  = EXCLUDED.expires_at
          `;
          totalComputed++;
        }
      }
    }

    return res.status(200).json({
      ok: true,
      symbols: symbols.length,
      computed: totalComputed,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[compute-profiles] Error:', error);
    return res.status(500).json({ error: error?.message || 'Internal error' });
  }
}
