/** Pure USDT.D basket / scale / snap helpers. No network. */

export interface DominancePoint {
  time: number;
  value: number;
}

export interface BasketRow {
  time: number;
  basketTotal: number;
  usdtMcap: number;
}

export const BASKET_COIN_IDS = [
  'bitcoin',
  'ethereum',
  'tether',
  'ripple',
  'binancecoin',
  'solana',
  'usd-coin',
] as const;

export const PIN_RELATIVE_TOLERANCE = 0.15;

export function utcDayOpenSec(msOrSec: number): number {
  const ms = msOrSec > 1e12 ? msOrSec : msOrSec * 1000;
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
}

export function snapMarketChartToUtcDays(points: Array<[number, number]>): DominancePoint[] {
  const byDay = new Map<number, number>();
  for (const pair of points) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const t = Number(pair[0]);
    const v = Number(pair[1]);
    if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
    byDay.set(utcDayOpenSec(t), v);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, value]) => ({ time, value }));
}

/** CoinGecko daily points are snapshots stamped at 00:00 UTC. A snapshot stamped D 00:00 is the CLOSE of day D-1. */
export const SNAPSHOT_TOLERANCE_SEC = 600;

/**
 * Convert CoinGecko daily snapshots into bar-day closes (bar time = UTC day open).
 * - keeps only points stamped within SNAPSHOT_TOLERANCE_SEC after a UTC midnight (drops the live "now" point CoinGecko appends),
 * - shifts back one day: snapshot at D+1 00:00 = close of bar D (validated vs TradingView USDT.D: RSI14 corr 0.998).
 * Because only past midnights exist, the still-forming day can never appear.
 */
export function snapshotsToBarDays(points: Array<[number, number]>): DominancePoint[] {
  const byDay = new Map<number, number>();
  for (const pair of points) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const tSec = Number(pair[0]) > 1e12 ? Number(pair[0]) / 1000 : Number(pair[0]);
    const v = Number(pair[1]);
    if (!Number.isFinite(tSec) || !Number.isFinite(v)) continue;
    const open = utcDayOpenSec(tSec * 1000);
    if (tSec - open > SNAPSHOT_TOLERANCE_SEC) continue;
    byDay.set(open - 86400, v);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, value]) => ({ time, value }));
}

export function dropFormingUtcDay(
  series: DominancePoint[],
  nowSec: number = Date.now() / 1000,
): DominancePoint[] {
  const todayOpen = utcDayOpenSec(nowSec * 1000);
  return series.filter((p) => p.time < todayOpen);
}

/**
 * Align the 7 market-cap series by UTC day. Keep only days present in all series.
 */
export function mergeBasketByUtcDay(
  seriesById: Record<string, Array<[number, number]>>,
  ids: readonly string[] = BASKET_COIN_IDS,
): BasketRow[] {
  const maps = ids.map((id) => {
    const snapped = snapshotsToBarDays(seriesById[id] || []);
    return new Map(snapped.map((p) => [p.time, p.value]));
  });
  if (!maps.length) return [];
  let days = [...maps[0].keys()];
  for (let i = 1; i < maps.length; i++) {
    const m = maps[i];
    days = days.filter((d) => m.has(d));
  }
  days.sort((a, b) => a - b);
  const tetherIdx = ids.indexOf('tether');
  const out: BasketRow[] = [];
  for (const time of days) {
    let basketTotal = 0;
    let ok = true;
    for (const m of maps) {
      const v = m.get(time);
      if (v == null || !Number.isFinite(v)) {
        ok = false;
        break;
      }
      basketTotal += v;
    }
    if (!ok) continue;
    const usdtMcap = tetherIdx >= 0 ? maps[tetherIdx].get(time) : undefined;
    if (usdtMcap == null) continue;
    out.push({ time, basketTotal, usdtMcap });
  }
  return out;
}

export function buildProxyDominance(
  rows: BasketRow[],
  globalTotalNow: number,
  exactUsdtDominanceNow: number,
): DominancePoint[] {
  if (!rows.length || !(globalTotalNow > 0)) return [];
  const basketNow = rows[rows.length - 1].basketTotal;
  if (!(basketNow > 0)) return [];
  const raw = rows.map((r) => {
    const totalProxy = (r.basketTotal * globalTotalNow) / basketNow;
    const value = totalProxy > 0 ? (r.usdtMcap / totalProxy) * 100 : 0;
    return { time: r.time, value };
  });
  const proxyNow = raw[raw.length - 1].value;
  if (!(proxyNow > 0) || !Number.isFinite(exactUsdtDominanceNow)) return raw;
  const rel = Math.abs(proxyNow - exactUsdtDominanceNow) / Math.max(Math.abs(exactUsdtDominanceNow), 1e-9);
  if (rel >= PIN_RELATIVE_TOLERANCE) return raw;
  const scale = exactUsdtDominanceNow / proxyNow;
  return raw.map((p) => ({ time: p.time, value: p.value * scale }));
}

export function joinByUtcDay(
  a: DominancePoint[],
  b: DominancePoint[],
): Array<{ time: number; a: number; b: number }> {
  const bMap = new Map(b.map((p) => [p.time, p.value]));
  const out: Array<{ time: number; a: number; b: number }> = [];
  for (const p of a) {
    const bv = bMap.get(p.time);
    if (bv == null) continue;
    out.push({ time: p.time, a: p.value, b: bv });
  }
  return out;
}

export function exactDominanceFromCaps(
  usdtMcaps: DominancePoint[],
  totalMcaps: DominancePoint[],
): DominancePoint[] {
  return joinByUtcDay(usdtMcaps, totalMcaps).map((r) => ({
    time: r.time,
    value: r.b > 0 ? (r.a / r.b) * 100 : 0,
  }));
}

export const HISTORY_SCALE_WINDOW_DAYS = 30;

/** Expand a contiguous daily array into points (bar time = UTC day open). */
export function historyToPoints(startSec: number, values: readonly number[], stepSec = 86400): DominancePoint[] {
  return values.map((value, i) => ({ time: startSec + i * stepSec, value }));
}

/**
 * Prepend a long static history to the live series. Live wins on overlap: history is only used for
 * bars strictly before the first live bar. The history is multiplied by one constant (median
 * live/history ratio over the first HISTORY_SCALE_WINDOW_DAYS overlapping days) so the join is
 * continuous. A constant factor does not change RSI, EMA-distance % or %B.
 * With no usable overlap (or a wild ratio) the history is not used at all: never splice two
 * unrelated levels.
 */
export function mergeHistoryWithLive(
  history: DominancePoint[],
  live: DominancePoint[],
): { series: DominancePoint[]; prepended: number } {
  if (!live.length) return { series: live, prepended: 0 };
  const firstLive = live[0].time;
  const older = history.filter((p) => p.time < firstLive && Number.isFinite(p.value));
  if (!older.length) return { series: live, prepended: 0 };
  const hMap = new Map(history.map((p) => [p.time, p.value]));
  const ratios: number[] = [];
  for (const p of live) {
    if (ratios.length >= HISTORY_SCALE_WINDOW_DAYS) break;
    const h = hMap.get(p.time);
    if (h != null && h > 0 && p.value > 0) ratios.push(p.value / h);
  }
  if (!ratios.length) return { series: live, prepended: 0 };
  ratios.sort((a, b) => a - b);
  const mid = Math.floor(ratios.length / 2);
  const scale = ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
  // Sanity: the proxy tracks live within ~15%; a wild ratio means the two series are not the same thing.
  if (!(scale > 0.5 && scale < 2)) return { series: live, prepended: 0 };
  const scaled = older.map((p) => ({ time: p.time, value: p.value * scale }));
  return { series: [...scaled, ...live], prepended: scaled.length };
}
