/**
 * Volume EMA / Delta overlay — display + tunable math (Tools settings).
 */

export type VolumeEmaLineStyle = 'solid' | 'dashed' | 'dotted';
export type VolumeEmaPathMode = 'delta' | 'wick';

export interface VolumeEmaSettings {
  /** Master Tools toggle. */
  enabled: boolean;

  // —— Look
  color: string;
  /** Line opacity 0–100 (%). */
  opacity: number;
  lineWidth: number;
  lineStyle: VolumeEmaLineStyle;
  curved: boolean;
  showSpikes: boolean;
  buySpikeColor: string;
  sellSpikeColor: string;

  // —— Math (all live-tunable)
  /** 'delta' = net signed volume around mid. 'wick' = buy above high / sell below low. */
  pathMode: VolumeEmaPathMode;
  /** EMA period on total volume (baseline for ratio + spikes). */
  volumeEmaPeriod: number;
  /** ATR period for price offset scale. */
  atrPeriod: number;
  /** Path amplitude (× ATR). */
  k: number;
  /** Extra ATR clearance / strong-flow bias. */
  wickClearAtr: number;
  /** After computing offset, force path past this candle's wick when elevated. */
  enforceWickClear: boolean;
  /** Clamp |delta / avgVol| or log2(ratio) magnitude. */
  clampSigmas: number;
  /** Rolling window for net delta (delta mode). */
  lookback: number;
  /** Double-EMA smooth on the plotted offset (1 = off). */
  smoothPeriod: number;
  /** Doji softening floor on signed volume (0–1). */
  bodyWeightFloor: number;
  /** Absolute vol / EMA fires spike triangles. */
  spikeRatio: number;
  /** Spike marker pad past wick (ATR). */
  spikeOffsetAtr: number;
}

/**
 * Hidden / removed from the Tools panel — still used by the math.
 * Forced at calculate time so old stored values cannot leak back.
 */
export const LOCKED_VOLUME_EMA_MATH = {
  pathMode: 'delta' as VolumeEmaPathMode,
  volumeEmaPeriod: 5,
  atrPeriod: 10,
  enforceWickClear: false,
  clampSigmas: 5.5,
  smoothPeriod: 1,
  bodyWeightFloor: 0.35,
};

/** Locked-in defaults from live tuning (2026-08). */
export const DEFAULT_VOLUME_EMA_SETTINGS: VolumeEmaSettings = {
  enabled: false,
  color: '#22d3ee',
  opacity: 85,
  lineWidth: 1,
  lineStyle: 'dotted',
  curved: true,
  showSpikes: true,
  buySpikeColor: '#22c55e',
  sellSpikeColor: '#ef4444',
  pathMode: LOCKED_VOLUME_EMA_MATH.pathMode,
  volumeEmaPeriod: LOCKED_VOLUME_EMA_MATH.volumeEmaPeriod,
  atrPeriod: LOCKED_VOLUME_EMA_MATH.atrPeriod,
  k: 6,
  wickClearAtr: 4,
  enforceWickClear: LOCKED_VOLUME_EMA_MATH.enforceWickClear,
  clampSigmas: LOCKED_VOLUME_EMA_MATH.clampSigmas,
  lookback: 10,
  smoothPeriod: LOCKED_VOLUME_EMA_MATH.smoothPeriod,
  bodyWeightFloor: LOCKED_VOLUME_EMA_MATH.bodyWeightFloor,
  spikeRatio: 2,
  spikeOffsetAtr: 5,
};

/** Map UI settings → indicator math options. Hidden knobs stay locked. */
export function volumeEmaMathOptions(settings: VolumeEmaSettings) {
  return {
    ...LOCKED_VOLUME_EMA_MATH,
    k: settings.k,
    wickClearAtr: settings.wickClearAtr,
    lookback: settings.lookback,
    spikeRatio: settings.spikeRatio,
    spikeOffsetAtr: settings.spikeOffsetAtr,
  };
}

/**
 * Apply 0–100 opacity to a CSS color for lightweight-charts.
 */
export function colorWithOpacity(color: string, opacityPercent: number): string {
  const a = Math.min(1, Math.max(0, (Number.isFinite(opacityPercent) ? opacityPercent : 100) / 100));
  const c = (color || '#22d3ee').trim();

  if (c.startsWith('#')) {
    let hex = c.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map((ch) => ch + ch).join('');
    }
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if ([r, g, b].every((n) => Number.isFinite(n))) {
        return `rgba(${r}, ${g}, ${b}, ${a})`;
      }
    }
  }

  const rgbMatch = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${a})`;
  }

  return a >= 1 ? c : c;
}
