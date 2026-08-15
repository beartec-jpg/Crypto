/**
 * Volume EMA Overlay (v1)
 *
 * Maps per-candle volume relative to its EMA onto the price scale, signed
 * by buy/sell pressure (candle close vs open).
 *
 * Quiet / average volume tracks candle mid.
 * Elevated volume is wick-anchored and pushed past the bar:
 *
 *   r         = volume / EMA(volume, period)
 *   magnitude = clamp(max(0, log2(r)), 0, clampSigmas)  // 0 at/avg, 1@2×, 2@4×
 *   pad       = (wickClearAtr + magnitude * k) * ATR     // distance *beyond* the wick
 *   buy  → plot target = high + pad
 *   sell → plot target = low  - pad
 *   quiet → mid
 *
 * Offset from mid is double-EMA smoothed for a clean path, then elevated bars
 * are re-clamped so the printed point still clears that bar's wick.
 *
 * Spike markers fire when raw ratio >= spikeRatio (default 2×).
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
   * Signed elevated log contribution used before offset smoothing:
   * sign * clamp(max(0, log2(ratio)), 0, clampSigmas).
   * 0 when volume is at or below average.
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
}

export interface VolumeEmaOverlayOptions {
  /** EMA period for volume. Default 20. */
  volumeEmaPeriod?: number;
  /** ATR period. Default 14. */
  atrPeriod?: number;
  /**
   * Extra distance *beyond the wick* per log2(vol ratio) unit, in ATRs.
   * 2× (mag=1) and 4× (mag=2) stack on top of wickClearAtr. Default 2.
   */
  k?: number;
  /**
   * Base clearance past the candle wick (high for buy / low for sell) in ATRs
   * whenever volume is elevated. Default 0.9.
   */
  wickClearAtr?: number;
  /** Clamp elevated log2(ratio) to this many "sigmas". Default 4. */
  clampSigmas?: number;
  /**
   * EMA period applied twice (double-smooth) to the raw offset so the path
   * is not jagged. 1 = none. Default 10.
   */
  smoothPeriod?: number;
  /**
   * Raw vol/EMA ratio that triggers a spike triangle. Default 2.
   */
  spikeRatio?: number;
  /**
   * How far past the wick to place spike triangles, in ATR multiples.
   * Default 0.85 so markers sit clear of the candle.
   */
  spikeOffsetAtr?: number;
}

export const DEFAULT_VOLUME_EMA_OPTIONS = {
  volumeEmaPeriod: 20,
  atrPeriod: 14,
  k: 2,
  wickClearAtr: 0.9,
  clampSigmas: 4,
  smoothPeriod: 10,
  spikeRatio: 2,
  spikeOffsetAtr: 0.85,
} as const;

/**
 * How far past the wick extremity (high/low) to place the path for a given
 * elevated magnitude. 0 when volume is not elevated.
 */
export function padBeyondWick(
  magnitude: number,
  atr: number,
  k: number,
  wickClearAtr: number,
): number {
  if (!(magnitude > 0) || !(atr > 0)) return 0;
  return (wickClearAtr + magnitude * k) * atr;
}

/**
 * Raw signed offset from mid so elevated buy clears above high and sell
 * clears below low.
 *
 * buy:  (high - mid) + pad  → value = high + pad
 * sell: (low  - mid) - pad  → value = low  - pad
 * quiet: 0                    → value = mid
 */
export function rawOffsetFromMid(
  candle: Pick<VolumeEmaCandle, 'high' | 'low'>,
  magnitude: number,
  direction: VolumeEmaSpikeDirection,
  atr: number,
  k: number,
  wickClearAtr: number,
): number {
  const mid = (candle.high + candle.low) / 2;
  if (!(magnitude > 0)) return 0;
  const pad = padBeyondWick(magnitude, atr, k, wickClearAtr);
  if (direction === 'buy') {
    return candle.high - mid + pad;
  }
  return candle.low - mid - pad;
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

/**
 * Dense EMA with expanding-mean warm-up so early bars still emit values.
 */
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
  if (offset > eps) return 'buy';
  if (offset < -eps) return 'sell';
  return 'neutral';
}

/** Bullish close → buy pressure; bearish → sell pressure. */
export function pressureDirection(candle: VolumeEmaCandle): VolumeEmaSpikeDirection {
  const open = Number.isFinite(candle.open) ? (candle.open as number) : candle.close;
  return candle.close >= open ? 'buy' : 'sell';
}

/**
 * Elevated-only magnitude from volume ratio.
 * r ≤ 1 → 0 (track mid). r = 2 → 1, r = 4 → 2, clamped at clampSigmas.
 */
export function elevatedLogMagnitude(ratio: number, clampSigmas: number): number {
  if (!(ratio > 1) || !Number.isFinite(ratio)) return 0;
  const logR = Math.log2(ratio);
  if (!(logR > 0)) return 0;
  return Math.min(clampSigmas, logR);
}

/**
 * Marker price clear of the candle: below low for buy, above high for sell.
 */
export function spikeMarkerPrice(
  candle: VolumeEmaCandle,
  atr: number,
  direction: VolumeEmaSpikeDirection,
  offsetAtr: number,
): number {
  const range = Math.max(candle.high - candle.low, 0);
  // Prefer ATR-based pad; also clear at least half the bar range
  const pad = Math.max(atr * offsetAtr, range * 0.55, atr * 0.35);
  return direction === 'buy' ? candle.low - pad : candle.high + pad;
}

/**
 * Format the side-axis / legend reading, e.g. "Vol EMA 1.42×".
 */
export function formatVolumeEmaLabel(ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return 'Vol EMA';
  if (ratio >= 10) return `Vol EMA ${ratio.toFixed(1)}×`;
  return `Vol EMA ${ratio.toFixed(2)}×`;
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
  const wickClearAtr = options.wickClearAtr ?? DEFAULT_VOLUME_EMA_OPTIONS.wickClearAtr;
  const clampSigmas = options.clampSigmas ?? DEFAULT_VOLUME_EMA_OPTIONS.clampSigmas;
  const smoothPeriod = options.smoothPeriod ?? DEFAULT_VOLUME_EMA_OPTIONS.smoothPeriod;
  const spikeRatio = options.spikeRatio ?? DEFAULT_VOLUME_EMA_OPTIONS.spikeRatio;

  if (
    !candles.length ||
    k <= 0 ||
    wickClearAtr < 0 ||
    clampSigmas <= 0 ||
    smoothPeriod < 1 ||
    spikeRatio <= 0
  ) {
    return [];
  }

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
    candle: VolumeEmaCandle;
    magnitude: number;
    direction: VolumeEmaSpikeDirection;
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
    const magnitude = elevatedLogMagnitude(ratio, clampSigmas);
    const direction = pressureDirection(c);
    const sign = direction === 'buy' ? 1 : -1;
    const logRatio = sign * magnitude;
    const mid = (c.high + c.low) / 2;
    // Wick-anchored: buy above high, sell below low, quiet at mid
    const rawOffset = rawOffsetFromMid(c, magnitude, direction, atrVal, k, wickClearAtr);

    if (!Number.isFinite(rawOffset) || !Number.isFinite(mid)) continue;

    raw.push({
      time: c.time,
      mid,
      atr: atrVal,
      ratio,
      logRatio,
      rawOffset,
      candle: c,
      magnitude,
      direction,
    });
  }

  if (raw.length === 0) return [];

  // Double-EMA on the signed offset for a smooth path
  const once = emaDense(
    raw.map((r) => r.rawOffset),
    smoothPeriod,
  );
  const smoothOffsets = emaDense(once, smoothPeriod);

  const points: VolumeEmaPoint[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    let offset = smoothOffsets[i];
    let value = r.mid + offset;

    // Elevated bars: force the printed point past *this* candle's wick so
    // smoothing cannot pull a 2×/4× reading back inside the bar.
    if (r.magnitude > 0) {
      const pad = padBeyondWick(r.magnitude, r.atr, k, wickClearAtr);
      if (r.direction === 'buy') {
        const floor = r.candle.high + pad;
        if (value < floor) {
          value = floor;
          offset = value - r.mid;
        }
      } else {
        const ceiling = r.candle.low - pad;
        if (value > ceiling) {
          value = ceiling;
          offset = value - r.mid;
        }
      }
    }

    if (!Number.isFinite(value)) continue;

    const spike: VolumeEmaSpikeDirection | null =
      r.ratio >= spikeRatio ? r.direction : null;

    points.push({
      time: r.time,
      value,
      ratio: r.ratio,
      logRatio: r.logRatio,
      offset,
      mid: r.mid,
      atr: r.atr,
      regime: regimeFromOffset(offset),
      spike,
    });
  }

  return points;
}

/**
 * Build spike markers from overlay points + source candles.
 * Marker prices are offset away from wicks so they do not cover the candle.
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
