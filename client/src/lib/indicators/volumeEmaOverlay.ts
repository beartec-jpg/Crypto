/**
 * Volume EMA Overlay (v1)
 *
 * Maps per-candle volume relative to its EMA onto the price scale:
 *   r      = volume / EMA(volume, period)
 *   logR   = clamp(log2(r), ±clampSigmas)
 *   offset = EMA(logR * k * ATR, smoothPeriod)   // smooths jagged vol noise
 *   plot   = mid + offset                        // mid = (high+low)/2
 *
 * At normal volume the line sits at candle mid; sustained volume spikes
 * push it above the body, dry volume pulls it below.
 */

export interface VolumeEmaCandle {
  time: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type VolumeEmaRegime = 'elevated' | 'dry' | 'neutral';

export interface VolumeEmaPoint {
  time: number;
  value: number;
  /** Volume / EMA(vol). 1 = at average. */
  ratio: number;
  /** Clamped log2(ratio) before offset smoothing. */
  logRatio: number;
  /** Smoothed price offset from mid (what is actually plotted). */
  offset: number;
  mid: number;
  atr: number;
  regime: VolumeEmaRegime;
}

export interface VolumeEmaOverlayOptions {
  /** EMA period for volume. Default 20. */
  volumeEmaPeriod?: number;
  /** ATR period. Default 14. */
  atrPeriod?: number;
  /** Amplitude multiplier (S = k * ATR). Default 1. */
  k?: number;
  /** Clamp log2(ratio) to ±this many "sigmas". Default 4. */
  clampSigmas?: number;
  /**
   * EMA period applied to the raw price offset so the path is not jagged.
   * 1 = no extra smoothing. Default 5.
   */
  smoothPeriod?: number;
}

export const DEFAULT_VOLUME_EMA_OPTIONS = {
  volumeEmaPeriod: 20,
  atrPeriod: 14,
  k: 1,
  clampSigmas: 4,
  smoothPeriod: 5,
} as const;

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

/**
 * EMA over a sparse series (nulls = not ready). Output stays null until
 * `period` consecutive finite samples have been seen from the first finite value.
 * For streaming indicator points we smooth only the dense raw-offset sequence.
 */
function emaDense(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  if (period <= 1) return values.slice();

  const out: number[] = [];
  if (values.length < period) {
    // Short seed: cumulative mean so we still emit from bar 0
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
    // Warm-up: expanding mean so early bars aren't dropped
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

/** Wilder-smoothed ATR aligned to candle indices (null until enough bars). */
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
  if (offset > eps) return 'elevated';
  if (offset < -eps) return 'dry';
  return 'neutral';
}

/**
 * Compute Volume EMA Overlay points for the main price scale.
 * Points are only emitted once both volume EMA and ATR are available.
 */
export function calculateVolumeEmaOverlay(
  candles: VolumeEmaCandle[],
  options: VolumeEmaOverlayOptions = {},
): VolumeEmaPoint[] {
  const volumeEmaPeriod = options.volumeEmaPeriod ?? DEFAULT_VOLUME_EMA_OPTIONS.volumeEmaPeriod;
  const atrPeriod = options.atrPeriod ?? DEFAULT_VOLUME_EMA_OPTIONS.atrPeriod;
  const k = options.k ?? DEFAULT_VOLUME_EMA_OPTIONS.k;
  const clampSigmas = options.clampSigmas ?? DEFAULT_VOLUME_EMA_OPTIONS.clampSigmas;
  const smoothPeriod = options.smoothPeriod ?? DEFAULT_VOLUME_EMA_OPTIONS.smoothPeriod;

  if (!candles.length || k <= 0 || clampSigmas <= 0 || smoothPeriod < 1) return [];

  const volumes = candles.map((c) => (Number.isFinite(c.volume) && c.volume > 0 ? c.volume : 0));
  const volEma = emaSeries(volumes, volumeEmaPeriod);
  const atr = atrSeries(candles, atrPeriod);

  type Raw = {
    time: number;
    mid: number;
    atr: number;
    ratio: number;
    logRatio: number;
    rawOffset: number;
  };

  const raw: Raw[] = [];

  for (let i = 0; i < candles.length; i++) {
    const emaVol = volEma[i];
    const atrVal = atr[i];
    if (emaVol == null || atrVal == null) continue;
    if (!(emaVol > 0) || !(atrVal > 0)) continue;

    const c = candles[i];
    const vol = volumes[i];
    const ratio = Math.max(vol, Number.EPSILON) / emaVol;
    const rawLog = Math.log2(ratio);
    const logRatio = Math.max(-clampSigmas, Math.min(clampSigmas, rawLog));
    const mid = (c.high + c.low) / 2;
    const rawOffset = logRatio * k * atrVal;

    if (!Number.isFinite(rawOffset) || !Number.isFinite(mid)) continue;

    raw.push({
      time: c.time,
      mid,
      atr: atrVal,
      ratio,
      logRatio,
      rawOffset,
    });
  }

  if (raw.length === 0) return [];

  const smoothOffsets = emaDense(
    raw.map((r) => r.rawOffset),
    smoothPeriod,
  );

  const points: VolumeEmaPoint[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const offset = smoothOffsets[i];
    const value = r.mid + offset;
    if (!Number.isFinite(value)) continue;

    points.push({
      time: r.time,
      value,
      ratio: r.ratio,
      logRatio: r.logRatio,
      offset,
      mid: r.mid,
      atr: r.atr,
      regime: regimeFromOffset(offset),
    });
  }

  return points;
}
