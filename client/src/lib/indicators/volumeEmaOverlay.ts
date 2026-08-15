/**
 * Volume EMA / Delta overlay
 *
 * Path (smooth — does NOT flip candle-to-candle):
 *   signedVol  = +volume on bullish bar, −volume on bearish (close vs open)
 *   deltaAvg   = SMA(signedVol, lookback)   // longer lookback = smoother
 *   volAvg     = SMA(volume, lookback)        // same window for scale
 *   strength   = clamp(deltaAvg / volAvg, ±clampSigmas)
 *   offset     = strength * k * ATR  ± soft wick bias
 *   plot       = mid + offset
 *
 * Lookback is the main smoothness control:
 *   2–3  → very reactive (swings hard)
 *   10–14 → medium
 *   20–40 → much smoother (averages over more candles)
 *
 * Spike markers (separate): total vol / EMA(vol) ≥ spikeRatio → triangle.
 */

export interface VolumeEmaCandle {
  time: number;
  open?: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type VolumeEmaRegime = 'buy' | 'sell' | 'neutral';

export type VolumeEmaSpikeDirection = 'buy' | 'sell';

export interface VolumeEmaSpike {
  time: number;
  direction: VolumeEmaSpikeDirection;
  /** vol / EMA(vol) at the spike bar */
  ratio: number;
  /** Price level for the marker (offset clear of the candle body/wick) */
  markerPrice: number;
}

export interface VolumeEmaPoint {
  time: number;
  value: number;
  /** Volume / EMA(vol). 1 = at average. */
  ratio: number;
  /**
   * Signed delta strength after smooth + clamp (in "avg volume" units).
   * + = net buy, − = net sell. Also stored as logRatio for label/compat.
   */
  logRatio: number;
  /** Smoothed price offset from mid (what is actually plotted). */
  offset: number;
  mid: number;
  atr: number;
  /** Pressure regime from the smoothed offset. */
  regime: VolumeEmaRegime;
  /** Set when raw ratio meets the spike threshold. */
  spike: VolumeEmaSpikeDirection | null;
  /** Smoothed signed volume (delta EMA), raw units. */
  delta?: number;
}

export interface VolumeEmaOverlayOptions {
  /** EMA period for total volume baseline. Default 20. */
  volumeEmaPeriod?: number;
  /** ATR period for pad scale. Default 14. */
  atrPeriod?: number;
  /**
   * How far strength pushes the path (offset = strength * k * ATR).
   * Default 1.25.
   */
  k?: number;
  /**
   * Extra ATR bias away from mid when |delta strength| is high
   * (soft, continuous — not a per-candle wick hard clamp). Default 0.35.
   */
  wickClearAtr?: number;
  /** Clamp |delta strength| (avg-volume units). Default 3. */
  clampSigmas?: number;
  /**
   * Lookback length in candles for the rolling average of signed volume.
   * Primary smoothness control: 2–3 whippy, 20+ smooth. Default 20.
   * `smoothPeriod` is a legacy alias for lookback.
   */
  lookback?: number;
  /** @deprecated Use lookback. */
  smoothPeriod?: number;
  /** Raw vol/EMA ratio that triggers a spike triangle. Default 2. */
  spikeRatio?: number;
  /** Spike marker pad past wick, in ATR. Default 0.85. */
  spikeOffsetAtr?: number;
}

/** Locked-in math defaults from live tuning (2026-08). */
export const DEFAULT_VOLUME_EMA_OPTIONS = {
  volumeEmaPeriod: 5,
  atrPeriod: 10,
  k: 2.7,
  wickClearAtr: 2,
  clampSigmas: 5.5,
  lookback: 52,
  spikeRatio: 3,
  spikeOffsetAtr: 3,
} as const;

/**
 * Simple rolling average over the last `period` values (inclusive of i).
 * Shorter period → more swing; longer → smoother path.
 */
export function rollingSma(values: number[], period: number): number[] {
  const n = values.length;
  const out = new Array<number>(n);
  if (n === 0) return out;
  const p = Math.max(1, Math.floor(period));
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += values[i];
    if (i >= p) sum -= values[i - p];
    const count = i + 1 < p ? i + 1 : p;
    out[i] = sum / count;
  }
  return out;
}

function emaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period || period < 1) return out;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;

  const mult = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    prev = (values[i] - prev) * mult + prev;
    out[i] = prev;
  }
  return out;
}

/** Dense EMA with expanding-mean warm-up so early bars still emit. */
function emaDense(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  if (period <= 1) return values.slice();

  const out: number[] = [];
  if (values.length < period) {
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      out.push(sum / (i + 1));
    }
    return out;
  }

  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  for (let i = 0; i < period - 1; i++) {
    let s = 0;
    for (let j = 0; j <= i; j++) s += values[j];
    out.push(s / (i + 1));
  }
  out.push(prev);

  const mult = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    prev = (values[i] - prev) * mult + prev;
    out.push(prev);
  }
  return out;
}

/** Wilder ATR aligned to candle indices (null until ready). */
function atrSeries(candles: VolumeEmaCandle[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < period + 1 || period < 1) return out;

  const tr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    tr.push(
      Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)),
    );
  }

  let atr = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period] = atr;

  for (let i = period; i < tr.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    out[i + 1] = atr;
  }
  return out;
}

function regimeFromOffset(offset: number, eps = 1e-9): VolumeEmaRegime {
  if (offset > eps) return 'buy';
  if (offset < -eps) return 'sell';
  return 'neutral';
}

/** Bullish close → buy; bearish → sell. */
export function pressureDirection(candle: VolumeEmaCandle): VolumeEmaSpikeDirection {
  const open = Number.isFinite(candle.open) ? (candle.open as number) : candle.close;
  return candle.close >= open ? 'buy' : 'sell';
}

/**
 * Per-bar signed volume (delta contribution).
 * Body weight softens dojis so weak closes don't yank the path as hard.
 */
export function signedVolume(candle: VolumeEmaCandle): number {
  const vol = Number.isFinite(candle.volume) && candle.volume > 0 ? candle.volume : 0;
  if (vol <= 0) return 0;
  const open = Number.isFinite(candle.open) ? (candle.open as number) : candle.close;
  const range = Math.max(candle.high - candle.low, 0);
  const body = Math.abs(candle.close - open);
  // 0.35 floor so even small bodies contribute; full body ≈ 1
  const weight = range > 0 ? Math.min(1, Math.max(0.35, body / range)) : 1;
  const sign = candle.close >= open ? 1 : -1;
  return sign * vol * weight;
}

/** Soft 0..1 curve for |strength| (0 at 0, →1 as |s| grows). */
function softStrength(absStrength: number): number {
  if (!(absStrength > 0)) return 0;
  // 1 - exp(-x) saturates gently
  return 1 - Math.exp(-Math.abs(absStrength));
}

/**
 * Elevated-only magnitude from volume ratio (used for spike sizing helpers / tests).
 */
export function elevatedLogMagnitude(ratio: number, clampSigmas: number): number {
  if (!(ratio > 1) || !Number.isFinite(ratio)) return 0;
  const logR = Math.log2(ratio);
  if (!(logR > 0)) return 0;
  return Math.min(clampSigmas, logR);
}

/** Pad beyond wick for a given elevated magnitude (tests / markers helpers). */
export function padBeyondWick(
  magnitude: number,
  atr: number,
  k: number,
  wickClearAtr: number,
): number {
  if (!(magnitude > 0) || !(atr > 0)) return 0;
  return (wickClearAtr + magnitude * k) * atr;
}

export function spikeMarkerPrice(
  candle: VolumeEmaCandle,
  atr: number,
  direction: VolumeEmaSpikeDirection,
  offsetAtr: number,
): number {
  const range = Math.max(candle.high - candle.low, 0);
  const pad = Math.max(atr * offsetAtr, range * 0.55, atr * 0.35);
  return direction === 'buy' ? candle.low - pad : candle.high + pad;
}

/**
 * Label: prefer delta strength, fall back to vol ratio.
 */
export function formatVolumeEmaLabel(
  ratio: number | null | undefined,
  deltaStrength?: number | null,
): string {
  if (deltaStrength != null && Number.isFinite(deltaStrength)) {
    const sign = deltaStrength > 0 ? '+' : '';
    const d =
      Math.abs(deltaStrength) >= 10
        ? deltaStrength.toFixed(1)
        : deltaStrength.toFixed(2);
    if (ratio != null && Number.isFinite(ratio)) {
      const r = ratio >= 10 ? ratio.toFixed(1) : ratio.toFixed(2);
      return `Vol Δ ${sign}${d} · ${r}×`;
    }
    return `Vol Δ ${sign}${d}`;
  }
  if (ratio == null || !Number.isFinite(ratio)) return 'Vol EMA';
  if (ratio >= 10) return `Vol EMA ${ratio.toFixed(1)}×`;
  return `Vol EMA ${ratio.toFixed(2)}×`;
}

/**
 * Continuous delta-volume path + optional spike flags.
 */
export function calculateVolumeEmaOverlay(
  candles: VolumeEmaCandle[],
  options: VolumeEmaOverlayOptions = {},
): VolumeEmaPoint[] {
  const volumeEmaPeriod = options.volumeEmaPeriod ?? DEFAULT_VOLUME_EMA_OPTIONS.volumeEmaPeriod;
  const atrPeriod = options.atrPeriod ?? DEFAULT_VOLUME_EMA_OPTIONS.atrPeriod;
  const k = options.k ?? DEFAULT_VOLUME_EMA_OPTIONS.k;
  const wickClearAtr = options.wickClearAtr ?? DEFAULT_VOLUME_EMA_OPTIONS.wickClearAtr;
  const clampSigmas = options.clampSigmas ?? DEFAULT_VOLUME_EMA_OPTIONS.clampSigmas;
  // lookback = primary smoothness (legacy smoothPeriod still accepted)
  const lookback = Math.max(
    1,
    Math.floor(
      options.lookback ??
        options.smoothPeriod ??
        DEFAULT_VOLUME_EMA_OPTIONS.lookback,
    ),
  );
  const spikeRatio = options.spikeRatio ?? DEFAULT_VOLUME_EMA_OPTIONS.spikeRatio;

  if (
    !candles.length ||
    k <= 0 ||
    wickClearAtr < 0 ||
    clampSigmas <= 0 ||
    lookback < 1 ||
    spikeRatio <= 0
  ) {
    return [];
  }

  const volumes = candles.map((c) => (Number.isFinite(c.volume) && c.volume > 0 ? c.volume : 0));
  const signed = candles.map((c) => signedVolume(c));
  // Spike ratio still uses a stable volume EMA baseline
  const volEma = emaSeries(volumes, volumeEmaPeriod);
  const atr = atrSeries(candles, atrPeriod);

  // Rolling SMA over lookback: 2–3 = whippy, 20–40 = much smoother
  const deltaAvg = rollingSma(signed, lookback);
  const volAvg = rollingSma(volumes, lookback);

  const points: VolumeEmaPoint[] = [];

  for (let i = 0; i < candles.length; i++) {
    const emaVol = volEma[i];
    const atrVal = atr[i];
    const avgVol = volAvg[i];
    if (emaVol == null || atrVal == null) continue;
    if (!(emaVol > 0) || !(atrVal > 0) || !(avgVol > 0)) continue;

    const c = candles[i];
    const vol = volumes[i];
    const ratio = Math.max(vol, Number.EPSILON) / emaVol;
    const mid = (c.high + c.low) / 2;
    const d = deltaAvg[i];

    // strength in units of lookback-avg volume: +1 ≈ net +1× avg vol of buy
    let strength = d / avgVol;
    if (!Number.isFinite(strength)) strength = 0;
    strength = Math.max(-clampSigmas, Math.min(clampSigmas, strength));

    // Continuous offset around mid (no buy/sell hard flip)
    let offset = strength * k * atrVal;
    // Soft extra push when flow is strong (still continuous)
    const bias = wickClearAtr * atrVal * softStrength(strength);
    if (strength > 0) offset += bias;
    else if (strength < 0) offset -= bias;

    const value = mid + offset;
    if (!Number.isFinite(value)) continue;

    const direction = pressureDirection(c);
    const spike: VolumeEmaSpikeDirection | null =
      ratio >= spikeRatio ? direction : null;

    points.push({
      time: c.time,
      value,
      ratio,
      logRatio: strength,
      offset,
      mid,
      atr: atrVal,
      regime: regimeFromOffset(offset),
      spike,
      delta: d,
    });
  }

  return points;
}

/**
 * Build spike markers from overlay points + source candles.
 */
export function buildVolumeEmaSpikes(
  candles: VolumeEmaCandle[],
  points: VolumeEmaPoint[],
  options: VolumeEmaOverlayOptions = {},
): VolumeEmaSpike[] {
  const offsetAtr = options.spikeOffsetAtr ?? DEFAULT_VOLUME_EMA_OPTIONS.spikeOffsetAtr;
  const byTime = new Map(candles.map((c) => [c.time, c]));
  const spikes: VolumeEmaSpike[] = [];

  for (const p of points) {
    if (!p.spike) continue;
    const c = byTime.get(p.time);
    if (!c) continue;
    const markerPrice = spikeMarkerPrice(c, p.atr, p.spike, offsetAtr);
    if (!Number.isFinite(markerPrice)) continue;
    spikes.push({
      time: p.time,
      direction: p.spike,
      ratio: p.ratio,
      markerPrice,
    });
  }

  return spikes;
}
