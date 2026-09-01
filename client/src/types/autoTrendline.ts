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

/**
 * confirmed = drawn between two pivots.
 * continuation = extension at the last pivot-line angle (base).
 * acceleration = fan edge from the measured (or %-change) Δangle of prior legs.
 */
export type AutoTrendlineRole = 'confirmed' | 'continuation' | 'acceleration';

export type AutoTrendlineChainLabel = 'HH' | 'LH' | 'HL' | 'LL';

export interface AutoTrendlineSegment {
  tier: AutoTrendlineTierId;
  kind: AutoTrendlineKind;
  /** Chart time of first pivot (or projection origin). */
  startTime: number;
  startPrice: number;
  /** Chart time of last pivot, or projected next-touch time. */
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
  /** confirmed pivot-to-pivot vs fan ray from the last pivot. */
  role: AutoTrendlineRole;
  /** Structure label of the chain this segment belongs to. */
  chainLabel?: AutoTrendlineChainLabel;
}

export interface AutoTrendlineResult {
  lines: AutoTrendlineSegment[];
}
