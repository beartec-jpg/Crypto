/**
 * Volume EMA / Delta overlay — two path modes (Tools lab)
 *
 * delta (default):
 *   signedVol  = ±volume × body-weight  (doji-softened)
 *   deltaAvg   = SMA(signedVol, lookback)
 *   volAvg     = SMA(volume, lookback)
 *   strength   = clamp(deltaAvg / volAvg, ±clampSigmas)
 *   offset     = strength * k * ATR  ± soft wickClearAtr bias
 *   plot       = mid + offset
 *
 * wick:
 *   magnitude  = clamp(max(0, log2(vol / EMA(vol))), 0, clampSigmas)
 *   pad        = (wickClearAtr + magnitude * k) * ATR
 *   buy  → high + pad · sell → low − pad · quiet → mid
 *
 * Optional:
 *   smoothPeriod > 1  → double-EMA the offset
 *   enforceWickClear  → re-clamp elevated bars past this candle's wick
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

export type VolumeEmaPathMode = 'delta' | 'wick';

export interface VolumeEmaOverlayOptions {
  /** EMA period for total volume baseline. */
  volumeEmaPeriod?: number;
  /** ATR period for pad scale. */
  atrPeriod?: number;
  /** How far strength pushes the path (× ATR). */
  k?: number;
  /** Extra ATR clearance / strong-flow bias. */
  wickClearAtr?: number;
  /** Force path past this candle's wick when elevated (wick mode or optional delta). */
  enforceWickClear?: boolean;
  /** Clamp |delta strength| or log2(ratio). */
  clampSigmas?: number;
  /** Rolling window for net signed volume (delta mode). */
  lookback?: number;
  /** Double-EMA on plotted offset. 1 = off. */
  smoothPeriod?: number;
  /** Doji softening floor on signed volume (0–1). */
  bodyWeightFloor?: number;
  /** 'delta' = net flow around mid. 'wick' = buy above high / sell below low. */
  pathMode?: VolumeEmaPathMode;
  /** Raw vol/EMA ratio that triggers a spike triangle. */
  spikeRatio?: number;
  /** Spike marker pad past wick, in ATR. */
  spikeOffsetAtr?: number;
}

/** Locked-in math defaults from live tuning (2026-08). */
export const DEFAULT_VOLUME_EMA_OPTIONS = {
  volumeEmaPeriod: 5,
  atrPeriod: 10,
  k: 6,
  wickClearAtr: 4,
  enforceWickClear: false,
  clampSigmas: 5.5,
  lookback: 10,
  smoothPeriod: 1,
  bodyWeightFloor: 0.35,
  pathMode: 'delta' as VolumeEmaPathMode,
  spikeRatio: 2,
  spikeOffsetAtr: 5,
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
export function signedVolume(candle: VolumeEmaCandle, bodyWeightFloor = 0.35): number {
  const vol = Number.isFinite(candle.volume) && candle.volume > 0 ? candle.volume : 0;
  if (vol <= 0) return 0;
  const open = Number.isFinite(candle.open) ? (candle.open as number) : candle.close;
  const range = Math.max(candle.high - candle.low, 0);
  const body = Math.abs(candle.close - open);
  const floor = Math.min(1, Math.max(0, bodyWeightFloor));
  const weight = range > 0 ? Math.min(1, Math.max(floor, body / range)) : 1;
  const sign = candle.close >= open ? 1 : -1;
  return sign * vol * weight;
}

/**
 * Wick-anchor raw offset from mid:
 * buy → (high - mid) + pad, sell → (low - mid) - pad, quiet → 0.
 */
export function rawOffsetFromMid(
  candle: VolumeEmaCandle,
  magnitude: number,
  direction: VolumeEmaSpikeDirection,
  atr: number,
  k: number,
  wickClearAtr: number,
): number {
  const mid = (candle.high + candle.low) / 2;
  if (!(magnitude > 0) || !(atr > 0)) return 0;
  const pad = padBeyondWick(magnitude, atr, k, wickClearAtr);
  if (direction === 'buy') return candle.high - mid + pad;
  return candle.low - mid - pad;
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
  const enforceWickClear = options.enforceWickClear ?? DEFAULT_VOLUME_EMA_OPTIONS.enforceWickClear;
  const clampSigmas = options.clampSigmas ?? DEFAULT_VOLUME_EMA_OPTIONS.clampSigmas;
  const lookback = Math.max(1, Math.floor(options.lookback ?? DEFAULT_VOLUME_EMA_OPTIONS.lookback));
  const smoothPeriod = Math.max(1, Math.floor(options.smoothPeriod ?? DEFAULT_VOLUME_EMA_OPTIONS.smoothPeriod));
  const bodyWeightFloor = options.bodyWeightFloor ?? DEFAULT_VOLUME_EMA_OPTIONS.bodyWeightFloor;
  const pathMode = options.pathMode ?? DEFAULT_VOLUME_EMA_OPTIONS.pathMode;
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
  const signed = candles.map((c) => signedVolume(c, bodyWeightFloor));
  const volEma = emaSeries(volumes, volumeEmaPeriod);
  const atr = atrSeries(candles, atrPeriod);
  const deltaAvg = rollingSma(signed, lookback);
  const volAvg = rollingSma(volumes, lookback);

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
    delta: number;
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
    const mid = (c.high + c.low) / 2;
    const direction = pressureDirection(c);
    const avgVol = volAvg[i];
    const d = deltaAvg[i];

    let rawOffset = 0;
    let logRatio = 0;
    let magnitude = 0;

    if (pathMode === 'wick') {
      magnitude = elevatedLogMagnitude(ratio, clampSigmas);
      logRatio = (direction === 'buy' ? 1 : -1) * magnitude;
      rawOffset = rawOffsetFromMid(c, magnitude, direction, atrVal, k, wickClearAtr);
    } else {
      if (!(avgVol > 0)) continue;
      let strength = d / avgVol;
      if (!Number.isFinite(strength)) strength = 0;
      strength = Math.max(-clampSigmas, Math.min(clampSigmas, strength));
      logRatio = strength;
      magnitude = Math.abs(strength);
      rawOffset = strength * k * atrVal;
      const bias = wickClearAtr * atrVal * softStrength(strength);
      if (strength > 0) rawOffset += bias;
      else if (strength < 0) rawOffset -= bias;
    }

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
      delta: d,
    });
  }

  if (raw.length === 0) return [];

  let offsets = raw.map((r) => r.rawOffset);
  if (smoothPeriod > 1) {
    offsets = emaDense(emaDense(offsets, smoothPeriod), smoothPeriod);
  }

  const points: VolumeEmaPoint[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    let offset = offsets[i];
    let value = r.mid + offset;

    if (enforceWickClear && r.magnitude > 0) {
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

    points.push({
      time: r.time,
      value,
      ratio: r.ratio,
      logRatio: r.logRatio,
      offset,
      mid: r.mid,
      atr: r.atr,
      regime: regimeFromOffset(offset),
      spike: r.ratio >= spikeRatio ? r.direction : null,
      delta: r.delta,
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
