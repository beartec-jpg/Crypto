/**
 * Tide Zone Score
 *
 * Built from a fresh warehouse scan (not the old combo/reclaim engines).
 * Across BTC/ETH/XRP/SOL/BNB/DOGE, 2019–2026:
 *   - same-bar RSI/stoch/MFI barely predict ATR-normalized forward returns
 *   - 4h RSI and 4h EMA50 distance do, every year, same sign (trend tide)
 *   - high local energy (ATR%/BB width) while the 4h tide is down is a bounce
 *   - taker/CVD slope confirms the tape
 *
 * Score is in [-100, +100].
 *   > +40  buy zone (follow the 4h tide)
 *   bounce buy when tide is low and energy is high
 *   < -40  sell zone (quiet or confirmed down tide)
 */

export interface TideZoneCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type TideZoneKind = 'follow_buy' | 'bounce_buy' | 'sell' | 'neutral';

export interface TideZonePoint {
  time: number;
  score: number;
  tide: number;
  energy: number;
  tape: number;
  kind: TideZoneKind;
}

const HTF_SECONDS = 4 * 3600;
const PCT_WIN = 200;
const TAPE_WIN = 12;
const BUY_FOLLOW = 40;
const SELL_ZONE = -40;

function medianDt(candles: TideZoneCandle[]): number {
  if (candles.length < 3) return 3600;
  const dts: number[] = [];
  const n = Math.min(candles.length, 80);
  for (let i = 1; i < n; i++) {
    const d = candles[i].time - candles[i - 1].time;
    if (d > 0) dts.push(d);
  }
  if (!dts.length) return 3600;
  dts.sort((a, b) => a - b);
  return dts[Math.floor(dts.length / 2)];
}

function ema(xs: number[], p: number): number[] {
  if (!xs.length) return [];
  const k = 2 / (p + 1);
  const out = [xs[0]];
  for (let i = 1; i < xs.length; i++) out.push(xs[i] * k + out[i - 1] * (1 - k));
  return out;
}

function rsi(closes: number[], p = 14): number[] {
  const n = closes.length;
  const out = new Array<number>(n).fill(NaN);
  if (n <= p) return out;
  let g = 0;
  let l = 0;
  for (let i = 1; i <= p; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) g += d;
    else l -= d;
  }
  g /= p;
  l /= p;
  out[p] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = p + 1; i < n; i++) {
    const d = closes[i] - closes[i - 1];
    g = (g * (p - 1) + Math.max(d, 0)) / p;
    l = (l * (p - 1) + Math.max(-d, 0)) / p;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

function atr(candles: TideZoneCandle[], p = 14): number[] {
  const n = candles.length;
  const tr: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < n; i++) {
    tr.push(
      Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close),
      ),
    );
  }
  const out = new Array<number>(n).fill(NaN);
  if (n < p) return out;
  let s = 0;
  for (let i = 0; i < p; i++) s += tr[i];
  s /= p;
  out[p - 1] = s;
  for (let i = p; i < n; i++) {
    s = (s * (p - 1) + tr[i]) / p;
    out[i] = s;
  }
  return out;
}

function bbWidth(closes: number[], p = 20): number[] {
  const n = closes.length;
  const out = new Array<number>(n).fill(NaN);
  for (let i = p - 1; i < n; i++) {
    let sum = 0;
    for (let j = i - p + 1; j <= i; j++) sum += closes[j];
    const m = sum / p;
    let var_ = 0;
    for (let j = i - p + 1; j <= i; j++) var_ += (closes[j] - m) ** 2;
    const sd = Math.sqrt(var_ / p);
    out[i] = m ? (4 * sd) / m : 0;
  }
  return out;
}

function rollingPct(xs: number[], win: number): number[] {
  const n = xs.length;
  const out = new Array<number>(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const v = xs[i];
    if (!Number.isFinite(v)) continue;
    const start = Math.max(0, i - win + 1);
    let count = 0;
    let below = 0;
    for (let j = start; j <= i; j++) {
      const x = xs[j];
      if (!Number.isFinite(x)) continue;
      count += 1;
      if (x <= v) below += 1;
    }
    if (count >= Math.max(20, Math.floor(win / 4))) out[i] = below / count;
  }
  return out;
}

interface HtfBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

function resampleHtf(candles: TideZoneCandle[], factor: number): HtfBar[] {
  if (factor <= 1) {
    return candles.map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
  }
  const bucket = factor * medianDt(candles) || HTF_SECONDS;
  const out: HtfBar[] = [];
  let cur: HtfBar | null = null;
  let curKey = -1;
  for (const c of candles) {
    const key = Math.floor(c.time / bucket) * bucket;
    if (!cur || key !== curKey) {
      if (cur) out.push(cur);
      curKey = key;
      cur = { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close };
    } else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.time = c.time;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function lastLe<T extends { time: number }>(series: T[], t: number): T | undefined {
  let lo = 0;
  let hi = series.length - 1;
  let ans: T | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].time <= t) {
      ans = series[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

function kindOf(score: number, tide: number, energy: number): TideZoneKind {
  if (tide < 0.45 && energy > 0.65 && score > 15) return 'bounce_buy';
  if (score >= BUY_FOLLOW) return 'follow_buy';
  if (score <= SELL_ZONE) return 'sell';
  return 'neutral';
}

export function calculateTideZone(candles: TideZoneCandle[]): TideZonePoint[] {
  if (candles.length < 80) return [];
  const barSec = medianDt(candles);
  const factor = Math.max(1, Math.round(HTF_SECONDS / barSec));
  const closes = candles.map((c) => c.close);

  const htf = resampleHtf(candles, factor);
  const htfCloses = htf.map((c) => c.close);
  const htfRsi = rsi(htfCloses, 14);
  const htfEma50 = ema(htfCloses, 50);
  const htfRsiPct = rollingPct(htfRsi, 80);
  const htfDist = htf.map((c, i) => (htfEma50[i] ? c.close / htfEma50[i] - 1 : NaN));
  const htfDistPct = rollingPct(htfDist, 80);
  const htfSeries = htf.map((c, i) => ({
    time: c.time,
    rsiPct: htfRsiPct[i],
    distPct: htfDistPct[i],
  }));

  const a = atr(candles, 14);
  const atrPct = candles.map((c, i) => (a[i] && c.close ? a[i] / c.close : NaN));
  const bbw = bbWidth(closes, 20);
  const energyA = rollingPct(atrPct, PCT_WIN);
  const energyB = rollingPct(bbw, PCT_WIN);

  const signed: number[] = candles.map((c, i) => {
    if (i === 0) return 0;
    const dir = Math.sign(c.close - candles[i - 1].close);
    return dir * c.volume;
  });
  const cvdSlope: number[] = candles.map((_, i) => {
    if (i < TAPE_WIN) return NaN;
    let num = 0;
    let den = 0;
    for (let j = i - TAPE_WIN + 1; j <= i; j++) {
      num += signed[j];
      den += candles[j].volume;
    }
    return den ? num / den : 0;
  });
  const tapePct = rollingPct(cvdSlope, 100);

  const out: TideZonePoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    const h = lastLe(htfSeries, candles[i].time);
    const tideR = h && Number.isFinite(h.rsiPct) ? h.rsiPct : NaN;
    const tideE = h && Number.isFinite(h.distPct) ? h.distPct : NaN;
    const tide =
      Number.isFinite(tideR) && Number.isFinite(tideE)
        ? 0.6 * tideR + 0.4 * tideE
        : Number.isFinite(tideR)
          ? tideR
          : Number.isFinite(tideE)
            ? tideE
            : NaN;
    const eA = energyA[i];
    const eB = energyB[i];
    const energy =
      Number.isFinite(eA) && Number.isFinite(eB)
        ? 0.5 * eA + 0.5 * eB
        : Number.isFinite(eA)
          ? eA
          : eB;
    const tape = tapePct[i];
    if (!Number.isFinite(tide) || !Number.isFinite(energy) || !Number.isFinite(tape)) continue;

    const raw =
      0.55 * (2 * tide - 1) +
      0.35 * (2 * energy - 1) * (1 - tide) +
      0.25 * (2 * tape - 1);
    const score = 100 * Math.tanh(raw);
    out.push({
      time: candles[i].time,
      score,
      tide,
      energy,
      tape,
      kind: kindOf(score, tide, energy),
    });
  }
  return out;
}

export function tideZoneColor(kind: TideZoneKind, score: number): string {
  if (kind === 'follow_buy') return '#22c55e';
  if (kind === 'bounce_buy') return '#f59e0b';
  if (kind === 'sell') return '#ef4444';
  return score >= 0 ? '#64748b' : '#475569';
}

export function tideZoneLabel(kind: TideZoneKind): string {
  if (kind === 'follow_buy') return 'Buy zone — 4h tide up';
  if (kind === 'bounce_buy') return 'Buy zone — vol bounce vs down tide';
  if (kind === 'sell') return 'Sell zone — down tide';
  return 'No zone';
}
