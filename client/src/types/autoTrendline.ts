/**
 * Auto Trendline tool — independent Macro / Mid / LTF layers.
 */

export type AutoTrendlineTierId = 'macro' | 'mid' | 'ltf';

export type AutoTrendlineLineStyle = 'solid' | 'dashed' | 'dotted';

export interface AutoTrendlineTierSettings {
  /** Layer on/off (independent of other tiers). */
  enabled: boolean;
  /** Support (below price) stroke. */
  supportColor: string;
  /** Resistance (above price) stroke. */
  resistanceColor: string;
  lineWidth: number;
  lineStyle: AutoTrendlineLineStyle;
  /** Extend the segment to the right edge of the chart. */
  extendRight: boolean;
}

export interface AutoTrendlineSettings {
  /** Master Tools toggle. */
  enabled: boolean;
  macro: AutoTrendlineTierSettings;
  mid: AutoTrendlineTierSettings;
  ltf: AutoTrendlineTierSettings;
}

export const DEFAULT_AUTO_TRENDLINE_TIER: Record<AutoTrendlineTierId, AutoTrendlineTierSettings> = {
  macro: {
    enabled: true,
    supportColor: '#22c55e',
    resistanceColor: '#ef4444',
    lineWidth: 2,
    lineStyle: 'solid',
    extendRight: true,
  },
  mid: {
    enabled: true,
    supportColor: '#4ade80',
    resistanceColor: '#f87171',
    lineWidth: 2,
    lineStyle: 'dashed',
    extendRight: true,
  },
  ltf: {
    enabled: true,
    supportColor: '#86efac',
    resistanceColor: '#fca5a5',
    lineWidth: 1,
    lineStyle: 'dotted',
    extendRight: false,
  },
};

export const DEFAULT_AUTO_TRENDLINE_SETTINGS: AutoTrendlineSettings = {
  enabled: false,
  macro: { ...DEFAULT_AUTO_TRENDLINE_TIER.macro },
  mid: { ...DEFAULT_AUTO_TRENDLINE_TIER.mid },
  ltf: { ...DEFAULT_AUTO_TRENDLINE_TIER.ltf },
};

export type AutoTrendlineKind = 'support' | 'resistance';

export interface AutoTrendlineSegment {
  tier: AutoTrendlineTierId;
  kind: AutoTrendlineKind;
  /** Chart time of first touch (wick). */
  startTime: number;
  startPrice: number;
  /** Chart time of last touch (wick). */
  endTime: number;
  endPrice: number;
  /** Linear model in bar-index space: price = slope * index + intercept */
  slope: number;
  intercept: number;
  touches: number;
  spanBars: number;
  /** Style snapshot applied at render. */
  color: string;
  lineWidth: number;
  lineStyle: AutoTrendlineLineStyle;
  extendRight: boolean;
}

export interface AutoTrendlineResult {
  lines: AutoTrendlineSegment[];
}
