/**
 * Volume EMA / Delta overlay — display + tunable math (Tools settings).
 */

export type VolumeEmaLineStyle = 'solid' | 'dashed' | 'dotted';

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

  // —— Math (delta path + spikes)
  /** EMA period on total volume (baseline for ratio + strength scale). */
  volumeEmaPeriod: number;
  /** ATR period for price offset scale. */
  atrPeriod: number;
  /**
   * Path amplitude: offset ≈ strength × k × ATR.
   * Higher = stronger reaction to net delta.
   */
  k: number;
  /**
   * Soft extra ATR bias when |delta strength| is high (continuous, not flip).
   */
  wickClearAtr: number;
  /** Clamp |delta / avgVol| (e.g. 3 = ±3× average volume of net flow). */
  clampSigmas: number;
  /**
   * Lookback length in candles for the rolling average of delta volume.
   * Short (2–3) = very reactive; long (20–40) = much smoother.
   * Legacy field name: smoothPeriod (still merged on load).
   */
  lookback: number;
  /** Absolute vol / EMA fires spike triangles. */
  spikeRatio: number;
  /** Spike marker pad past wick (ATR). */
  spikeOffsetAtr: number;
}

export const DEFAULT_VOLUME_EMA_SETTINGS: VolumeEmaSettings = {
  enabled: false,
  color: '#22d3ee',
  opacity: 100,
  lineWidth: 2,
  lineStyle: 'solid',
  curved: true,
  showSpikes: true,
  buySpikeColor: '#22c55e',
  sellSpikeColor: '#ef4444',
  volumeEmaPeriod: 20,
  atrPeriod: 14,
  k: 1.25,
  wickClearAtr: 0.35,
  clampSigmas: 3,
  lookback: 20,
  spikeRatio: 2,
  spikeOffsetAtr: 0.85,
};

/** Map UI settings → indicator math options. */
export function volumeEmaMathOptions(settings: VolumeEmaSettings) {
  // Prefer lookback; fall back to legacy smoothPeriod if present on old saves
  const legacy = (settings as VolumeEmaSettings & { smoothPeriod?: number }).smoothPeriod;
  const lookback = settings.lookback ?? legacy ?? DEFAULT_VOLUME_EMA_SETTINGS.lookback;
  return {
    volumeEmaPeriod: settings.volumeEmaPeriod,
    atrPeriod: settings.atrPeriod,
    k: settings.k,
    wickClearAtr: settings.wickClearAtr,
    clampSigmas: settings.clampSigmas,
    lookback,
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
