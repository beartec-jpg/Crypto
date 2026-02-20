/**
 * BOS (Break of Structure) and CHoCH (Change of Character) type definitions.
 */

export interface SwingPoint {
  id: string;
  type: 'high' | 'low';
  label: 'HH' | 'HL' | 'LH' | 'LL'; // Higher High, Higher Low, Lower High, Lower Low
  price: number;
  time: number;
  index: number;
  broken: boolean;
  brokenBy?: string; // ID of the structure break
}

export interface StructureBreak {
  id: string;
  type: 'bos' | 'choch';
  direction: 'bullish' | 'bearish';

  // The swing point that was broken
  brokenSwing: SwingPoint;
  brokenLevel: number;

  // The candle that caused the break
  breakTime: number;
  breakIndex: number;
  breakPrice: number; // Close price of break candle

  // Validation
  confirmed: boolean; // Candle CLOSED through level (not just wicked)
  swept: boolean;     // Just wicked through = potential liquidity grab

  // Integration with other SMC tools
  associatedOBId?: string;  // Order Block that caused this break
  associatedFVGId?: string; // FVG created during break
  createdOB: boolean;       // Did this break create a valid OB?
  createdFVG: boolean;      // Did this break create an FVG?

  // Display
  lineExtendRight: boolean;
}

export type TrendBias = 'bullish' | 'bearish' | 'neutral';

export interface BOSSettings {
  enabled: boolean;

  // Swing Detection
  swingLookback: number;  // 3-20, default 5
  requireClose: boolean;  // Must close through level, default true

  // Display
  showBOS: boolean;         // Show continuation breaks
  showCHoCH: boolean;       // Show reversal breaks
  showSwingPoints: boolean; // Mark HH/HL/LH/LL on chart
  showLabels: boolean;      // Show "BOS" / "CHoCH" text
  drawLines: boolean;       // Draw horizontal lines at levels
  extendLines: boolean;     // Extend lines to current candle

  // Filters
  maxAge: number;       // Max candles to show (50-500)
  hideSwept: boolean;   // Hide breaks that were just wicked

  // Colors
  bullishBOSColor: string;   // Default: #22c55e (green)
  bearishBOSColor: string;   // Default: #ef4444 (red)
  bullishCHoCHColor: string; // Default: #06b6d4 (cyan)
  bearishCHoCHColor: string; // Default: #f97316 (orange)
  swingHighColor: string;    // Default: #a855f7 (purple)
  swingLowColor: string;     // Default: #eab308 (yellow)

  // Integration
  linkToOB: boolean;  // Show which OB caused break
  linkToFVG: boolean; // Show which FVG was created
}

export const DEFAULT_BOS_SETTINGS: BOSSettings = {
  enabled: true,

  swingLookback: 5,
  requireClose: true,

  showBOS: true,
  showCHoCH: true,
  showSwingPoints: false,
  showLabels: true,
  drawLines: true,
  extendLines: true,

  maxAge: 200,
  hideSwept: false,

  bullishBOSColor: '#22c55e',
  bearishBOSColor: '#ef4444',
  bullishCHoCHColor: '#06b6d4',
  bearishCHoCHColor: '#f97316',
  swingHighColor: '#a855f7',
  swingLowColor: '#eab308',

  linkToOB: false,
  linkToFVG: false,
};
