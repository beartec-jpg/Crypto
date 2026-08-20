/**
 * Pure market-structure helpers for the standalone LTF desk.
 * Binance klines + indicators / SMC slices for tool payloads.
 */

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

function volumeProfile(bars: Bar[]): { poc: number; vah: number; val: number } {
  const recent = bars.slice(-100);
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

function pickZones(zones: SmcZone[], keep: number): SmcZone[] {
  const ranked = [...zones].sort((a, b) => {
    if (a.mitigated !== b.mitigated) return a.mitigated ? 1 : -1;
    return b.atrMultiple - a.atrMultiple;
  });
  return ranked.slice(0, keep).map(roundZone);
}

function detectFvgs(bars: Bar[], atrVal: number, price: number): { bullish: SmcZone[]; bearish: SmcZone[] } {
  const bullish: SmcZone[] = [];
  const bearish: SmcZone[] = [];
  const recent = bars.slice(-80);
  const minWidth = atrVal > 0 ? atrVal * 0.25 : 0;
  for (let i = 2; i < recent.length; i++) {
    const a = recent[i - 2];
    const impulse = recent[i - 1];
    const c = recent[i];
    if (c.low > a.high) {
      const width = c.low - a.high;
      if (width < minWidth) continue;
      const originSwing = Math.min(a.low, impulse.low);
      bullish.push({
        low: a.high,
        high: c.low,
        originSwing,
        impulseExtreme: impulse.low,
        width,
        atrMultiple: atrVal > 0 ? width / atrVal : 0,
        mitigated: price < a.high,
        suggestedStop: originSwing,
      });
    }
    if (c.high < a.low) {
      const width = a.low - c.high;
      if (width < minWidth) continue;
      const originSwing = Math.max(a.high, impulse.high);
      bearish.push({
        low: c.high,
        high: a.low,
        originSwing,
        impulseExtreme: impulse.high,
        width,
        atrMultiple: atrVal > 0 ? width / atrVal : 0,
        mitigated: price > a.low,
        suggestedStop: originSwing,
      });
    }
  }
  return { bullish: pickZones(bullish, 8), bearish: pickZones(bearish, 8) };
}

function detectObs(bars: Bar[], atrVal: number, price: number): { bullish: SmcZone[]; bearish: SmcZone[] } {
  const bullish: SmcZone[] = [];
  const bearish: SmcZone[] = [];
  const recent = bars.slice(-60);
  const minRange = atrVal > 0 ? atrVal * 0.35 : 0;
  for (let i = 1; i < recent.length - 1; i++) {
    const b = recent[i];
    const body = Math.abs(b.close - b.open);
    const range = b.high - b.low || 1e-9;
    if (body / range < 0.35) continue;
    if (range < minRange) continue;
    if (b.close > b.open && recent[i + 1].close > b.high) {
      const originSwing = b.low;
      bullish.push({
        low: b.low,
        high: Math.max(b.open, b.close),
        originSwing,
        impulseExtreme: b.low,
        width: range,
        atrMultiple: atrVal > 0 ? range / atrVal : 0,
        mitigated: price < b.low,
        suggestedStop: originSwing,
      });
    }
    if (b.close < b.open && recent[i + 1].close < b.low) {
      const originSwing = b.high;
      bearish.push({
        low: Math.min(b.open, b.close),
        high: b.high,
        originSwing,
        impulseExtreme: b.high,
        width: range,
        atrMultiple: atrVal > 0 ? range / atrVal : 0,
        mitigated: price > b.high,
        suggestedStop: originSwing,
      });
    }
  }
  return { bullish: pickZones(bullish, 6), bearish: pickZones(bearish, 6) };
}

function swings(bars: Bar[], lookback = 3): { highs: number[]; lows: number[] } {
  const recent = bars.slice(-80);
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = lookback; i < recent.length - lookback; i++) {
    const w = recent.slice(i - lookback, i + lookback + 1);
    if (recent[i].high === Math.max(...w.map((b) => b.high))) highs.push(recent[i].high);
    if (recent[i].low === Math.min(...w.map((b) => b.low))) lows.push(recent[i].low);
  }
  return { highs: highs.slice(-6), lows: lows.slice(-6) };
}

function bosChoch(bars: Bar[], lookback = 3): { bos: string; choch: string } {
  const s = swings(bars, lookback);
  const price = bars[bars.length - 1]?.close || 0;
  let bos = 'none';
  let choch = 'none';
  const lastHigh = s.highs[s.highs.length - 1];
  const lastLow = s.lows[s.lows.length - 1];
  if (lastHigh && price > lastHigh) bos = 'bullish';
  if (lastLow && price < lastLow) bos = 'bearish';
  if (s.highs.length >= 2 && s.highs[s.highs.length - 1] < s.highs[s.highs.length - 2]) choch = 'bearish';
  if (s.lows.length >= 2 && s.lows[s.lows.length - 1] > s.lows[s.lows.length - 2]) choch = 'bullish';
  return { bos, choch };
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
  const swingLookback = tf === '5m' || tf === '3m' || tf === '1m' ? 5 : 3;
  const fvg = detectFvgs(bars, atrVal, price);
  const ob = detectObs(bars, atrVal, price);
  const sw = swings(bars, swingLookback);
  const bc = bosChoch(bars, swingLookback);
  return {
    timeframe: tf,
    price,
    atr: Number(atrVal.toFixed(6)),
    minStopAtrMultiple: 0.5,
    stopNote:
      'Default SL = originSwing (pivot that created the FVG/OB). Do not park SL a tick beyond the gap. Skip if suggestedStop is closer than 0.5×ATR.',
    bos: bc.bos,
    choch: bc.choch,
    swingHighs: sw.highs.map((n) => Number(n.toFixed(6))),
    swingLows: sw.lows.map((n) => Number(n.toFixed(6))),
    bullishFVGs: fvg.bullish,
    bearishFVGs: fvg.bearish,
    bullishOBs: ob.bullish,
    bearishOBs: ob.bearish,
  };
}

export function volumeProfilePayload(bars: Bar[], tf: string) {
  const vp = volumeProfile(bars);
  const last = bars[bars.length - 1];
  return {
    timeframe: tf,
    price: last?.close ?? 0,
    poc: Number(vp.poc.toFixed(6)),
    vah: Number(vp.vah.toFixed(6)),
    val: Number(vp.val.toFixed(6)),
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
