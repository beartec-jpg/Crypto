/**
 * Volume EMA overlay — display + tunable math (Tools settings).
 * Math defaults mirror DEFAULT_VOLUME_EMA_OPTIONS in the indicator module.
 */

export type VolumeEmaLineStyle = 'solid' | 'dashed' | 'dotted';

export interface VolumeEmaSettings {
  /** Master Tools toggle. */
  enabled: boolean;

  // —— Look
  color: string;
  lineWidth: number;
  lineStyle: VolumeEmaLineStyle;
  curved: boolean;
  showSpikes: boolean;
  buySpikeColor: string;
  sellSpikeColor: string;

  // —— Math (play with these, then lock in defaults later)
  /** EMA period on volume. */
  volumeEmaPeriod: number;
  /** ATR period for pad scale. */
  atrPeriod: number;
  /**
   * Extra distance beyond the wick per log2(vol ratio) unit (in ATRs).
   * Higher = more push past candles on 2×/4× volume.
   */
  k: number;
  /**
   * Base clearance past high (buy) / low (sell) in ATRs when elevated.
   */
  wickClearAtr: number;
  /** Cap on log2(ratio) magnitude (e.g. 4 ≈ 16× vol). */
  clampSigmas: number;
  /** Double-EMA smooth period on the path (higher = less jagged). */
  smoothPeriod: number;
  /** Vol/EMA ratio that fires spike triangles. */
  spikeRatio: number;
  /** Extra ATR pad for spike marker placement past the wick. */
  spikeOffsetAtr: number;
}

export const DEFAULT_VOLUME_EMA_SETTINGS: VolumeEmaSettings = {
  enabled: false,
  color: '#22d3ee',
  lineWidth: 2,
  lineStyle: 'solid',
  curved: true,
  showSpikes: true,
  buySpikeColor: '#22c55e',
  sellSpikeColor: '#ef4444',
  volumeEmaPeriod: 20,
  atrPeriod: 14,
  k: 2,
  wickClearAtr: 0.9,
  clampSigmas: 4,
  smoothPeriod: 10,
  spikeRatio: 2,
  spikeOffsetAtr: 0.85,
};

/** Map UI settings → indicator math options. */
export function volumeEmaMathOptions(settings: VolumeEmaSettings) {
  return {
    volumeEmaPeriod: settings.volumeEmaPeriod,
    atrPeriod: settings.atrPeriod,
    k: settings.k,
    wickClearAtr: settings.wickClearAtr,
    clampSigmas: settings.clampSigmas,
    smoothPeriod: settings.smoothPeriod,
    spikeRatio: settings.spikeRatio,
    spikeOffsetAtr: settings.spikeOffsetAtr,
  };
}
