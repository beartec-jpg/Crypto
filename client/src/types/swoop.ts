/**
 * Swoop tool — predictive accumulation envelope from successive pivot slopes.
 */

export type SwoopState = 'idle' | 'armed' | 'slowing' | 'compressing' | 'release';

export type SwoopLineStyle = 'solid' | 'dashed' | 'dotted';

export interface SwoopSettings {
  enabled: boolean;
  swingLength: number;
  minLowerHighs: number;
  /** Ignore reversals smaller than this percent so large spikes aren't drowned in 5-bar chop. */
  minPivotPct: number;
  showFan: boolean;
  showHud: boolean;
  showPivotLabels: boolean;
  topColor: string;
  bottomColor: string;
  fanColor: string;
  lineWidth: number;
  lineStyle: SwoopLineStyle;
  flattenThreshold: number;
}

export const DEFAULT_SWOOP_SETTINGS: SwoopSettings = {
  enabled: false,
  swingLength: 12,
  minLowerHighs: 2,
  minPivotPct: 1,
  showFan: true,
  showHud: true,
  showPivotLabels: true,
  topColor: '#f87171',
  bottomColor: '#fb7185',
  fanColor: '#fbbf24',
  lineWidth: 2,
  lineStyle: 'solid',
  flattenThreshold: 0.0002,
};

export interface SwoopPoint {
  index: number;
  time: number;
  price: number;
}

export interface SwoopSegment {
  start: SwoopPoint;
  end: SwoopPoint;
  slope: number;
  lengthBars: number;
}

export interface SwoopSlopeBand {
  lo: number;
  mid: number;
  hi: number;
}

export interface SwoopFanRay {
  startTime: number;
  startPrice: number;
  endTime: number;
  endPrice: number;
  /** mid = last-leg angle (base). lo/hi = the single acceleration edge. */
  kind: 'lo' | 'mid' | 'hi';
  side: 'top' | 'bottom';
}

export interface SwoopDrawSegment {
  startTime: number;
  startPrice: number;
  endTime: number;
  endPrice: number;
  color: string;
  lineWidth: number;
  lineStyle: SwoopLineStyle;
  role: 'top' | 'bottom' | 'live-top' | 'live-bottom' | 'fan' | 'zigzag';
}

export interface SwoopPivotLabel {
  time: number;
  price: number;
  text: string;
  kind: 'high' | 'low';
}

export interface SwoopResult {
  state: SwoopState;
  armed: boolean;
  highs: SwoopPoint[];
  lows: SwoopPoint[];
  topSegments: SwoopSegment[];
  bottomSegments: SwoopSegment[];
  liveTopSlope: number | null;
  liveBottomSlope: number | null;
  expectedTopBand: SwoopSlopeBand | null;
  expectedBottomBand: SwoopSlopeBand | null;
  gap: number | null;
  armGap: number | null;
  compression: number | null;
  prevGapBars: number;
  projectBars: number;
  fan: SwoopFanRay[];
  drawSegments: SwoopDrawSegment[];
  labels: SwoopPivotLabel[];
  label: string;
}
