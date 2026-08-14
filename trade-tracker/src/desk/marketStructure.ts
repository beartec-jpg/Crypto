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

function atr(bars: Bar[], period = 14): number {
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

function detectFvgs(bars: Bar[]): { bullish: Array<{ low: number; high: number }>; bearish: Array<{ low: number; high: number }> } {
  const bullish: Array<{ low: number; high: number }> = [];
  const bearish: Array<{ low: number; high: number }> = [];
  const recent = bars.slice(-80);
  for (let i = 2; i < recent.length; i++) {
    const a = recent[i - 2];
    const c = recent[i];
    if (c.low > a.high) bullish.push({ low: a.high, high: c.low });
    if (c.high < a.low) bearish.push({ low: c.high, high: a.low });
  }
  return { bullish: bullish.slice(-8), bearish: bearish.slice(-8) };
}

function detectObs(bars: Bar[]): { bullish: Array<{ low: number; high: number }>; bearish: Array<{ low: number; high: number }> } {
  const bullish: Array<{ low: number; high: number }> = [];
  const bearish: Array<{ low: number; high: number }> = [];
  const recent = bars.slice(-60);
  for (let i = 1; i < recent.length - 1; i++) {
    const b = recent[i];
    const body = Math.abs(b.close - b.open);
    const range = b.high - b.low || 1e-9;
    if (body / range < 0.35) continue;
    if (b.close > b.open && recent[i + 1].close > b.high) {
      bullish.push({ low: b.low, high: Math.max(b.open, b.close) });
    }
    if (b.close < b.open && recent[i + 1].close < b.low) {
      bearish.push({ low: Math.min(b.open, b.close), high: b.high });
    }
  }
  return { bullish: bullish.slice(-6), bearish: bearish.slice(-6) };
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

function bosChoch(bars: Bar[]): { bos: string; choch: string } {
  const s = swings(bars, 3);
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
  const fvg = detectFvgs(bars);
  const ob = detectObs(bars);
  const sw = swings(bars);
  const bc = bosChoch(bars);
  const price = bars[bars.length - 1]?.close ?? 0;
  const fmt = (z: { low: number; high: number }) => ({
    low: Number(z.low.toFixed(6)),
    high: Number(z.high.toFixed(6)),
  });
  return {
    timeframe: tf,
    price,
    bos: bc.bos,
    choch: bc.choch,
    swingHighs: sw.highs.map((n) => Number(n.toFixed(6))),
    swingLows: sw.lows.map((n) => Number(n.toFixed(6))),
    bullishFVGs: fvg.bullish.map(fmt),
    bearishFVGs: fvg.bearish.map(fmt),
    bullishOBs: ob.bullish.map(fmt),
    bearishOBs: ob.bearish.map(fmt),
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
