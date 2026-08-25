/**
 * Pure market-structure helpers for the standalone LTF desk.
 * Binance klines + indicators / SMC slices for tool payloads.
 */

import {
  bosChochState,
  detectFvgZones,
  detectObZones,
  detectSwingPoints,
  swingLookbackForTf,
  zoneMitigatedByClose,
} from './smc/detect.js';

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function fetchBars(symbol: string, interval: string, limit = 300): Promise<Bar[]> {
  const sym = symbol.toUpperCase().replace(/[-_/]/g, '');
  const urls = [
    `https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`,
    `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`,
    `https://api.binance.us/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`,
  ];
  let lastErr: Error | null = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) {
        lastErr = new Error(`klines ${res.status}`);
        continue;
      }
      const data = (await res.json()) as unknown[];
      if (!Array.isArray(data) || !data.length) {
        lastErr = new Error('empty klines');
        continue;
      }
      return data.map((k: any) => ({
        time: Number(k[0]) / 1000,
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));
    } catch (e: any) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr || new Error(`Failed to fetch ${symbol} ${interval}`);
}

function ema(values: number[], period: number): number {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function rsi(bars: Bar[], period = 14): number {
  if (bars.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const d = bars[i].close - bars[i - 1].close;
    if (d >= 0) gains += d;
    else losses -= d;
  }
  const ag = gains / period;
  const al = losses / period;
  if (al === 0) return 100;
  const rs = ag / al;
  return 100 - 100 / (1 + rs);
}

function macdHist(bars: Bar[]): number {
  const closes = bars.map((b) => b.close);
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  return e12 - e26;
}

export function atr(bars: Bar[], period = 14): number {
  if (bars.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const p = bars[i - 1].close;
    const b = bars[i];
    trs.push(Math.max(b.high - b.low, Math.abs(b.high - p), Math.abs(b.low - p)));
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / (slice.length || 1);
}

function stoch(bars: Bar[], kPeriod = 14): { k: number; d: number } {
  if (bars.length < kPeriod) return { k: 50, d: 50 };
  const window = bars.slice(-kPeriod);
  const hi = Math.max(...window.map((b) => b.high));
  const lo = Math.min(...window.map((b) => b.low));
  const close = bars[bars.length - 1].close;
  const k = hi === lo ? 50 : ((close - lo) / (hi - lo)) * 100;
  return { k, d: k };
}

function vpLookback(tf?: string): number {
  if (tf === '4h') return 24; // ~4 days — 100 bars is stale after an expansion
  if (tf === '1h') return 48;
  if (tf === '15m') return 48;
  if (tf === '5m' || tf === '3m' || tf === '1m') return 40;
  return 100;
}

function volumeProfile(bars: Bar[], tf?: string): { poc: number; vah: number; val: number } {
  const recent = bars.slice(-vpLookback(tf));
  if (!recent.length) return { poc: 0, vah: 0, val: 0 };
  const lo = Math.min(...recent.map((b) => b.low));
  const hi = Math.max(...recent.map((b) => b.high));
  if (hi <= lo) return { poc: recent[recent.length - 1].close, vah: hi, val: lo };
  const bins = 40;
  const step = (hi - lo) / bins;
  const vol = new Array(bins).fill(0);
  for (const b of recent) {
    const mid = (b.high + b.low) / 2;
    let i = Math.floor((mid - lo) / step);
    if (i < 0) i = 0;
    if (i >= bins) i = bins - 1;
    vol[i] += b.volume;
  }
  let maxI = 0;
  for (let i = 1; i < bins; i++) if (vol[i] > vol[maxI]) maxI = i;
  const poc = lo + (maxI + 0.5) * step;
  const total = vol.reduce((a, b) => a + b, 0) || 1;
  let acc = vol[maxI];
  let L = maxI;
  let R = maxI;
  while (acc / total < 0.7 && (L > 0 || R < bins - 1)) {
    const left = L > 0 ? vol[L - 1] : -1;
    const right = R < bins - 1 ? vol[R + 1] : -1;
    if (right >= left && R < bins - 1) {
      R++;
      acc += vol[R];
    } else if (L > 0) {
      L--;
      acc += vol[L];
    } else break;
  }
  return { poc, val: lo + L * step, vah: lo + (R + 1) * step };
}

/** SMC zone with the pivot that created it (the structural stop). */
export interface SmcZone {
  low: number;
  high: number;
  /** Pivot that printed the displacement — default SL. */
  originSwing: number;
  /** Impulse candle extreme (FVG middle candle / OB candle). */
  impulseExtreme: number;
  width: number;
  atrMultiple: number;
  mitigated: boolean;
  suggestedStop: number;
}

function roundZone(z: SmcZone): SmcZone {
  const n = (v: number) => Number(v.toFixed(6));
  return {
    low: n(z.low),
    high: n(z.high),
    originSwing: n(z.originSwing),
    impulseExtreme: n(z.impulseExtreme),
    width: n(z.width),
    atrMultiple: Number(z.atrMultiple.toFixed(3)),
    mitigated: z.mitigated,
    suggestedStop: n(z.suggestedStop),
  };
}

function toToolZones(
  raw: ReturnType<typeof detectFvgZones>,
  price: number,
  keep: number,
): { bullish: SmcZone[]; bearish: SmcZone[] } {
  const asSmc = (z: (typeof raw)[0]): SmcZone =>
    roundZone({
      low: z.low,
      high: z.high,
      originSwing: z.originSwing,
      impulseExtreme: z.impulseExtreme,
      width: z.width,
      atrMultiple: z.atrMultiple,
      suggestedStop: z.suggestedStop,
      mitigated: zoneMitigatedByClose(z.direction, z.low, z.high, price),
    });
  const bullish = raw.filter((z) => z.direction === 'bullish').map(asSmc);
  const bearish = raw.filter((z) => z.direction === 'bearish').map(asSmc);
  const rank = (xs: SmcZone[]) =>
    [...xs]
      .sort((a, b) => {
        if (a.mitigated !== b.mitigated) return a.mitigated ? 1 : -1;
        return b.atrMultiple - a.atrMultiple;
      })
      .slice(0, keep);
  return { bullish: rank(bullish), bearish: rank(bearish) };
}

export function priceContext(bars: Bar[], tf: string) {
  const last = bars[bars.length - 1];
  const hi = Math.max(...bars.slice(-20).map((b) => b.high));
  const lo = Math.min(...bars.slice(-20).map((b) => b.low));
  return {
    timeframe: tf,
    price: last?.close ?? 0,
    atr: Number(atr(bars).toFixed(6)),
    range20: { high: hi, low: lo },
    lastBarTime: last?.time ?? 0,
  };
}

export function indicatorsPayload(bars: Bar[], tf: string) {
  const closes = bars.map((b) => b.close);
  const price = closes[closes.length - 1] || 0;
  const st = stoch(bars);
  return {
    timeframe: tf,
    price,
    rsi: Number(rsi(bars).toFixed(2)),
    macdHist: Number(macdHist(bars).toFixed(6)),
    stoch: { k: Number(st.k.toFixed(2)), d: Number(st.d.toFixed(2)) },
    atr: Number(atr(bars).toFixed(6)),
    ema20: Number(ema(closes, 20).toFixed(6)),
    ema50: Number(ema(closes, 50).toFixed(6)),
    ema200: Number(ema(closes, 200).toFixed(6)),
  };
}

export function smcPayload(bars: Bar[], tf: string) {
  const price = bars[bars.length - 1]?.close ?? 0;
  const atrVal = atr(bars);
  const swingLookback = swingLookbackForTf(tf);
  const fvg = toToolZones(detectFvgZones(bars.slice(-80), atrVal), price, 8);
  const ob = toToolZones(detectObZones(bars.slice(-60), atrVal), price, 6);
  const points = detectSwingPoints(bars.slice(-80), swingLookback);
  const highs = points.filter((p) => p.kind === 'high').map((p) => p.price).slice(-6);
  const lows = points.filter((p) => p.kind === 'low').map((p) => p.price).slice(-6);
  const bc = bosChochState(bars, swingLookback);
  return {
    timeframe: tf,
    price,
    atr: Number(atrVal.toFixed(6)),
    minStopAtrMultiple: 0.5,
    stopNote:
      'Default SL = originSwing (pivot that created the FVG/OB). Do not park SL a tick beyond the gap. Skip if suggestedStop is closer than 0.5×ATR.',
    bos: bc.bos,
    choch: bc.choch,
    swingHighs: highs.map((n) => Number(n.toFixed(6))),
    swingLows: lows.map((n) => Number(n.toFixed(6))),
    bullishFVGs: fvg.bullish,
    bearishFVGs: fvg.bearish,
    bullishOBs: ob.bullish,
    bearishOBs: ob.bearish,
  };
}

export function volumeProfilePayload(bars: Bar[], tf: string) {
  const vp = volumeProfile(bars, tf);
  const last = bars[bars.length - 1];
  return {
    timeframe: tf,
    price: last?.close ?? 0,
    poc: Number(vp.poc.toFixed(6)),
    vah: Number(vp.vah.toFixed(6)),
    val: Number(vp.val.toFixed(6)),
    barsUsed: vpLookback(tf),
  };
}

export function recentCandlesPayload(bars: Bar[], tf: string, n = 20) {
  const take = Math.min(Math.max(1, n), 50);
  const slice = bars.slice(-take);
  return {
    timeframe: tf,
    candles: slice.map((b) => ({
      t: b.time,
      o: Number(b.open.toFixed(6)),
      h: Number(b.high.toFixed(6)),
      l: Number(b.low.toFixed(6)),
      c: Number(b.close.toFixed(6)),
      v: Number(b.volume.toFixed(2)),
    })),
  };
}
