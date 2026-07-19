/**
 * Drawing-related type definitions
 * Extracted from CryptoSandbox.tsx for reusability and maintainability
 */

export type DrawingTool = 
  | 'trendline' 
  | 'horizontal' 
  | 'channel' 
  | 'fibretracement' 
  | 'trendfib' 
  | 'label' 
  | 'impulse' 
  | 'abc' 
  | 'wxy' 
  | 'abcde' 
  | 'wxyxz' 
  | 'hchannel' 
  | 'schannel' 
  | 'elliottwave' 
  | null;

/**
 * Limited DrawingTool type for ChartFullscreenPage
 * Subset of DrawingTool with simplified tool names
 */
export type ChartDrawingTool = 
  | 'trendline' 
  | 'horizontal' 
  | 'vertical'
  | 'text'
  | 'number_label'
  | 'free_draw'
  | 'rectangle' 
  | 'fib_retracement' 
  | 'trend_fib' 
  | 'channel'
  | 'elliott_wave'
  | null;

export type FreeDrawMode = 'free' | 'line_assisted' | 'curve_assisted';

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export type TrendlineMode = 'magnet' | 'free' | null;

export type FibLevel = { 
  ratio: number; 
  visible: boolean; 
  showLabel: boolean;
  color?: string;
};

export type FibLabelPosition = 
  | 'top-left' 
  | 'top-center' 
  | 'top-right' 
  | 'bottom-left' 
  | 'bottom-center' 
  | 'bottom-right';

export type FibExtendDirection = 'none' | 'left' | 'right' | 'both';

export interface TrendlineData {
  id: string;
  p1: { time: number; price: number };
  p2: { time: number; price: number };
  color: string;
  opacity: number;
  lineStyle: LineStyle;
  thickness: number;
  extendLeft: boolean;
  extendRight: boolean;
  label?: { 
    text: string; 
    positions: ('top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right')[] 
  };
  createdAtZoomScale?: number;
}

export interface HorizontalLineData {
  id: string;
  price: number;
  color: string;
  opacity: number;
  lineStyle: LineStyle;
  thickness: number;
  label?: { 
    text: string; 
    positions: ('left' | 'center' | 'right')[] 
  };
  createdAtZoomScale?: number;
}

export interface ChannelData {
  id: string;
  p1: { time: number; price: number };
  p2: { time: number; price: number };
  width: number;
  color: string;
  opacity: number;
  lineStyle: LineStyle;
  thickness: number;
  internalLines: { percent: number; visible: boolean; label: string }[];
  internalLineStyle: LineStyle;
  internalLineColor: string;
  showExternalLines: boolean;
  createdAtZoomScale?: number;
}

export interface HorizontalChannelData {
  id: string;
  x1: number;
  x2: number;
  topPrice: number;
  bottomPrice: number;
  color: string;
  fillColor?: string;
  fillOpacity?: number;
  opacity: number;
  lineStyle: LineStyle;
  thickness: number;
  topLineColor: string;
  topLineThickness: number;
  topLineStyle: LineStyle;
  topLabel?: string;
  bottomLineColor: string;
  bottomLineThickness: number;
  bottomLineStyle: LineStyle;
  bottomLabel?: string;
  internalLines: { 
    percent: number; 
    visible: boolean; 
    color: string; 
    style: LineStyle; 
    label?: string; 
    bgColor?: string 
  }[];
  label?: { text: string; value?: string };
  showLabelLeft?: boolean;
  showLabelCenter?: boolean;
  showLabelRight?: boolean;
  isFavorite?: boolean;
  extendLeft?: boolean;
  extendRight?: boolean;
  createdAtZoomScale?: number;
}

export interface SlopedChannelData {
  id: string;
  topLine: { 
    p1: { time: number; price: number }; 
    p2: { time: number; price: number } 
  };
  bottomLine: { 
    p1: { time: number; price: number }; 
    p2: { time: number; price: number } 
  };
  color: string;
  fillColor?: string;
  fillOpacity?: number;
  opacity: number;
  lineStyle: LineStyle;
  thickness: number;
  topLineColor: string;
  topLineThickness: number;
  topLineStyle: LineStyle;
  topLabel?: string;
  bottomLineColor: string;
  bottomLineThickness: number;
  bottomLineStyle: LineStyle;
  bottomLabel?: string;
  internalLines: { 
    percent: number; 
    visible: boolean; 
    color: string; 
    style: LineStyle; 
    label?: string; 
    bgColor?: string 
  }[];
  label?: { text: string; value?: string };
  showLabelLeft?: boolean;
  showLabelCenter?: boolean;
  showLabelRight?: boolean;
  isFavorite?: boolean;
  extendLeft?: boolean;
  extendRight?: boolean;
  createdAtZoomScale?: number;
}

export interface TextLabelData {
  id: string;
  x: number;
  y: number;
  time: number;
  price: number;
  text: string;
  color: string;
  opacity: number;
  backgroundColor: string;
  fontSize: number;
  createdAtZoomScale?: number;
}

export interface FibRetracementData {
  id: string;
  anchor1: { time: number; price: number };
  anchor2: { time: number; price: number };
  color: string;
  opacity: number;
  lineStyle: LineStyle;
  thickness: number;
  labelPosition: FibLabelPosition;
  showPrices: boolean;
  showExtensions: boolean;
  extendDirection: FibExtendDirection;
  levels: FibLevel[];
  createdAtZoomScale?: number;
}

export interface TrendFibExtensionData {
  id: string;
  p1: { time: number; price: number };
  p2: { time: number; price: number };
  p3: { time: number; price: number };
  color: string;
  opacity: number;
  lineStyle: LineStyle;
  thickness: number;
  labelPosition: FibLabelPosition;
  showPrices: boolean;
  showExtensions: boolean;
  extendDirection: FibExtendDirection;
  levels: FibLevel[];
  createdAtZoomScale?: number;
}

export interface DrawingState {
  trendlines: TrendlineData[];
  horizontals: HorizontalLineData[];
  channels: ChannelData[];
  hchannels: HorizontalChannelData[];
  schannels: SlopedChannelData[];
  fibs: FibRetracementData[];
  trendfibs: TrendFibExtensionData[];
  labels: TextLabelData[];
}

export type SelectionCandidate = { 
  id: string; 
  type: 'trendline' | 'horizontal' | 'channel' | 'hchannel' | 'schannel' | 'fib' | 'trendfib' | 'label' 
};

/**
 * Generic Drawing interface used in ChartFullscreenPage
 * Provides a flexible structure for all drawing types
 */
export interface Drawing {
  id: string;
  type: string;
  /** The timeframe this drawing was originally created on (e.g. '4h', '1d'). */
  timeframe?: string;
  points: { time: number; price: number; snapType?: 'high' | 'low' | 'none'; label?: string; isMidAir?: boolean }[];
  style: {
    color: string;
    lineWidth: number;
    opacity?: number;
    lineStyle?: 'solid' | 'dashed' | 'dotted';
    internalLineStyle?: 'solid' | 'dashed' | 'dotted';
    extendLeft?: boolean;
    extendRight?: boolean;
    /** When true, fib lines extend to the current (latest) candle's x position */
    autoTrack?: boolean;
    labelPosition?: 'left' | 'right';
    hiddenLevels?: number[];
    customLabels?: Record<number | string, string>;
    customValues?: Record<number, number>;
    label?: string;
    autoColor?: boolean;
    hideLabels?: boolean;
    levelColors?: Record<number, string>;
    boundaryColors?: Record<string, string>;
    fillOpacity?: number;
    text?: string;
    fontSize?: number;
    fontWeight?: 'normal' | 'bold';
    backgroundColor?: string;
    showBackground?: boolean;
    __openColorPicker?: string | null;
    /** For elliott_wave drawings: the wave type degree label (e.g. "W1", "C") */
    waveType?: string;
    /** For elliott_wave drawings: degree name e.g. "Minor", "Minute" */
    degreeLabel?: string;
    /** For elliott_wave drawings: the specific wave being labeled e.g. "3", "iii" */
    waveLabel?: string;
    /** Whether to show the label (used by rectangle, trendline, horizontal) */
    showLabel?: boolean;
    /** Label text color (independent of drawing color) */
    labelColor?: string;
    /** Label text size preset */
    labelSize?: 'sm' | 'md' | 'lg';
    /** For elliott_wave drawings: font size of the label */
    /** For elliott_wave drawings: color of impulse waves */
    impulseColor?: string;
    /** For elliott_wave drawings: color of corrective/zigzag waves */
    zigzagColor?: string;
    showPointLabels?: boolean;
    /** For elliott_wave drawings: whether to display future wave prediction fibonacci levels */
    showFuturePredictions?: boolean;
    /** For elliott_wave drawings: custom overrides for individual point labels keyed by point index */
    customPointLabels?: Record<number, string>;
    /** For elliott_wave drawings: indices of points whose labels should be hidden */
    hiddenPointLabels?: number[];
    /** For free_draw drawings: the drawing sub-mode used to capture/render the stroke */
    drawSubMode?: 'free' | 'line_assisted' | 'curve_assisted';
  };
}

// ── Elliott Wave Predictive Tool Types ────────────────────────────────────────

/** Wave type identifiers for the predictive Elliott Wave tool */
export type WaveType = 'W1' | 'W2' | 'W3' | 'W4' | 'W5' | 'A' | 'B' | 'C' | 'W' | 'X' | 'Y';

/** Sub-pattern options for specific wave types */
export type SubPattern =
  | 'impulse'
  | 'leading_diagonal'
  | 'ending_diagonal'
  | 'zigzag'
  | 'flat'
  | 'expanded_flat'
  | 'triangle'
  | 'running_flat';

/**
 * Default style properties for drawings
 */
export interface DrawingDefaults {
  opacity?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  internalLineStyle?: 'solid' | 'dashed' | 'dotted';
  extendLeft?: boolean;
  extendRight?: boolean;
  /** When true, fib lines extend to the current (latest) candle's x position */
  autoTrack?: boolean;
  labelPosition?: 'left' | 'right';
  hiddenLevels?: number[];
  customLabels?: Record<number | string, string>;
  customValues?: Record<number, number>;
  label?: string;
  autoColor?: boolean;
  hideLabels?: boolean;
  levelColors?: Record<number, string>;
  boundaryColors?: Record<string, string>;
  fillOpacity?: number;
  text?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  backgroundColor?: string;
  showBackground?: boolean;
}
