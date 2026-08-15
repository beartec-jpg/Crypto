/**
 * Volume EMA Overlay (v1)
 *
 * Maps per-candle volume relative to its EMA onto the price scale:
 *   r     = volume / EMA(volume, period)
 *   logR  = log2(r)                    // 0 when volume == EMA
 *   offset = clamp(logR, ±clampSigmas) * k * ATR
 *   plot  = mid + offset               // mid = (high+low)/2
 *
 * At normal volume the line sits at candle mid; volume spikes push it
 * above the body, dry volume pulls it below.
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
  /** Clamped log2(ratio) in [-clampSigmas, +clampSigmas]. */
  logRatio: number;
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
}

export const DEFAULT_VOLUME_EMA_OPTIONS = {
  volumeEmaPeriod: 20,
  atrPeriod: 14,
  k: 1,
  clampSigmas: 4,
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

  // First ATR at candle index `period` (uses TR for bars 1..period)
  let atr = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period] = atr;

  for (let i = period; i < tr.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    out[i + 1] = atr;
  }
  return out;
}

function regimeFromLog(logRatio: number, eps = 1e-9): VolumeEmaRegime {
  if (logRatio > eps) return 'elevated';
  if (logRatio < -eps) return 'dry';
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

  if (!candles.length || k <= 0 || clampSigmas <= 0) return [];

  const volumes = candles.map((c) => (Number.isFinite(c.volume) && c.volume > 0 ? c.volume : 0));
  const volEma = emaSeries(volumes, volumeEmaPeriod);
  const atr = atrSeries(candles, atrPeriod);

  const points: VolumeEmaPoint[] = [];

  for (let i = 0; i < candles.length; i++) {
    const emaVol = volEma[i];
    const atrVal = atr[i];
    if (emaVol == null || atrVal == null) continue;
    if (!(emaVol > 0) || !(atrVal > 0)) continue;

    const c = candles[i];
    const vol = volumes[i];
    // Floor volume so log2 never hits -Infinity on zero-volume bars
    const ratio = Math.max(vol, Number.EPSILON) / emaVol;
    const rawLog = Math.log2(ratio);
    const logRatio = Math.max(-clampSigmas, Math.min(clampSigmas, rawLog));
    const mid = (c.high + c.low) / 2;
    const value = mid + logRatio * k * atrVal;

    if (!Number.isFinite(value)) continue;

    points.push({
      time: c.time,
      value,
      ratio,
      logRatio,
      mid,
      atr: atrVal,
      regime: regimeFromLog(logRatio),
    });
  }

  return points;
}
