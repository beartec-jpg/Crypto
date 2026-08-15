/**
 * Volume EMA overlay display + master toggle (Tools).
 * Math defaults live in lib/indicators/volumeEmaOverlay.ts.
 */

export type VolumeEmaLineStyle = 'solid' | 'dashed' | 'dotted';

export interface VolumeEmaSettings {
  /** Master Tools toggle. */
  enabled: boolean;
  /** Main path color. */
  color: string;
  lineWidth: number;
  lineStyle: VolumeEmaLineStyle;
  /** Curved path vs straight segments. */
  curved: boolean;
  /** Show 2× spike triangles. */
  showSpikes: boolean;
  buySpikeColor: string;
  sellSpikeColor: string;
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
};
