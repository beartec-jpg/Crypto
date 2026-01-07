// Drawing-related types for CryptoSandbox component

// Line styles
export type LineStyle = 'solid' | 'dashed' | 'dotted';

// Drawing tools
export type DrawingTool = 'trendline' | 'horizontal' | 'channel' | 'fibretracement' | 'trendfib' | 'label' | 'impulse' | 'abc' | 'wxy' | 'abcde' | 'wxyxz' | 'hchannel' | 'schannel' | 'elliottwave' | null;

// Trendline modes
export type TrendlineMode = 'magnet' | 'free' | null;

// Fibonacci types
export type FibLevel = { ratio: number; visible: boolean; showLabel: boolean };
export type FibLabelPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
export type FibExtendDirection = 'none' | 'left' | 'right' | 'both';

// Trendline data interface
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
  label?: { text: string; positions: ('top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right')[] };
  createdAtZoomScale?: number; // Zoom level when trendline was created for dynamic visibility
}

// Horizontal line data interface
export interface HorizontalLineData {
  id: string;
  price: number;
  color: string;
  opacity: number;
  lineStyle: LineStyle;
  thickness: number;
  label?: { text: string; positions: ('left' | 'center' | 'right')[] };
  createdAtZoomScale?: number; // Zoom level when horizontal line was created for dynamic visibility
}

// Channel data interface (legacy - kept for backward compatibility)
export interface ChannelData {
  id: string;
  p1: { time: number; price: number };
  p2: { time: number; price: number };
  width: number; // Distance in price units
  color: string;
  opacity: number;
  lineStyle: LineStyle;
  thickness: number;
  internalLines: { percent: number; visible: boolean; label: string }[];
  internalLineStyle: LineStyle;
  internalLineColor: string;
  showExternalLines: boolean;
  createdAtZoomScale?: number; // Zoom level when channel was created for dynamic visibility
}

// Horizontal Channel data interface (2-click mode)
export interface HorizontalChannelData {
  id: string;
  x1: number; // First click x position (time)
  x2: number; // Second click x position (time)
  topPrice: number; // Top external line price
  bottomPrice: number; // Bottom external line price
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
  internalLines: { percent: number; visible: boolean; color: string; style: LineStyle; label?: string; bgColor?: string }[]; // 25, 50, 75%
  label?: { text: string; value?: string };
  showLabelLeft?: boolean;
  showLabelCenter?: boolean;
  showLabelRight?: boolean;
  isFavorite?: boolean;
  extendLeft?: boolean;
  extendRight?: boolean;
  createdAtZoomScale?: number; // Zoom level when channel was created for dynamic visibility
}

// Sloped Channel data interface (3-click mode)
export interface SlopedChannelData {
  id: string;
  // First two clicks define external lines and height
  topLine: { p1: { time: number; price: number }; p2: { time: number; price: number } };
  bottomLine: { p1: { time: number; price: number }; p2: { time: number; price: number } };
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
  internalLines: { percent: number; visible: boolean; color: string; style: LineStyle; label?: string; bgColor?: string }[]; // 25, 50, 75%
  label?: { text: string; value?: string };
  showLabelLeft?: boolean;
  showLabelCenter?: boolean;
  showLabelRight?: boolean;
  isFavorite?: boolean;
  extendLeft?: boolean;
  extendRight?: boolean;
  createdAtZoomScale?: number; // Zoom level when channel was created for dynamic visibility
}

// Text label data interface
export interface TextLabelData {
  id: string;
  x: number; // screen x (updated on pan/zoom)
  y: number; // screen y
  time: number; // anchor time for repositioning
  price: number; // anchor price
  text: string;
  color: string;
  opacity: number;
  backgroundColor: string;
  fontSize: number;
  createdAtZoomScale?: number; // zoom scale (k) when label was created - for dynamic visibility
}

// Fibonacci Retracement data interface
export interface FibRetracementData {
  id: string;
  anchor1: { time: number; price: number }; // Lower price anchor (0%)
  anchor2: { time: number; price: number }; // Higher price anchor (100%)
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

// Trend-Based Fibonacci Extension data interface (3-click)
export interface TrendFibExtensionData {
  id: string;
  p1: { time: number; price: number }; // Start of impulse move
  p2: { time: number; price: number }; // End of impulse move
  p3: { time: number; price: number }; // End of retracement (projection base)
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

// Label bounds and constrained label types (from labelUtils)
export interface LabelBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ConstrainedLabel {
  x: number;
  y: number;
  anchor: string;
}
