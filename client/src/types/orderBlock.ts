/**
 * Order Block (OB) type definitions for the professional OB detection system.
 */

export interface OrderBlock {
  id: string;
  type: 'bullish' | 'bearish';

  // Full OB zone (entire candle)
  top: number;              // Candle high
  bottom: number;           // Candle low

  // Effective zone boundaries (adjusted for partial mitigation)
  effectiveTop: number;     // Starts same as top, shrinks as mitigation occurs
  effectiveBottom: number;  // Starts same as bottom, shrinks as mitigation occurs

  // Extreme OB zone (wick only - more precise entry)
  extremeTop: number;       // For bullish: open, For bearish: high
  extremeBottom: number;    // For bullish: low, For bearish: close

  // Timing
  time: number;             // Candle timestamp
  formationIndex: number;   // Index when formed
  age: number;              // Candles since formation

  // Validation
  causedFVG: boolean;       // Did it create an FVG?
  causedBOS: boolean;       // Did it break structure?
  displacementStrength: number; // How strong was the move (%)

  // Mitigation tracking
  mitigated: boolean;       // Has price returned?
  mitigationPercent: number; // How much was filled (0-100)
  mitigationTime?: number;  // When it was mitigated

  // Sweep tracking (wick-through without close-through)
  swept?: boolean;          // Was the zone wicked through but closed back inside?
  sweepTime?: number;       // Timestamp of the sweep candle
  sweepPrice?: number;      // Wick extreme that swept through the zone
  sweepIndex?: number;      // Candle index of the sweep

  // Confluence
  hasFVGConfluence: boolean; // Overlaps with an FVG?
  confluenceFVGId?: string;  // ID of overlapping FVG

  // Volume
  volume: number;           // Volume of OB candle
  volumeRatio: number;      // Compared to average
}

export interface OrderBlockSettings {
  enabled: boolean;

  // Detection Criteria
  minDisplacementCandles: number;  // 1-5, default 3
  requireFVG: boolean;             // Must create FVG to be valid
  requireBOS: boolean;             // Must break structure
  minDisplacementPercent: number;  // Min move % after OB

  // Display Options
  showBullish: boolean;
  showBearish: boolean;
  showMitigated: boolean;
  showExtremeOB: boolean;          // Show wick-only zone
  showLabels: boolean;             // Show "OB" label
  extendRight: boolean;            // Extend to current candle

  // Filters
  maxAge: number;                  // Max candles old
  minBodyPercent: number;          // OB candle min body % (30-70)

  // Confluence
  highlightFVGConfluence: boolean; // Highlight OB+FVG overlap
  confluenceColor: string;         // Color for confluence zones

  // Colors
  bullishColor: string;
  bearishColor: string;
  bullishExtremeColor: string;
  bearishExtremeColor: string;
  mitigatedColor: string;

  // Opacity
  zoneOpacity: number;             // 0.1-0.5
  extremeOpacity: number;          // 0.3-0.7
}

export const DEFAULT_OB_SETTINGS: OrderBlockSettings = {
  enabled: true,

  minDisplacementCandles: 3,
  requireFVG: false,
  requireBOS: false,
  minDisplacementPercent: 1.0,

  showBullish: true,
  showBearish: true,
  showMitigated: false,
  showExtremeOB: true,
  showLabels: false,
  extendRight: true,

  maxAge: 200,
  minBodyPercent: 40,

  highlightFVGConfluence: true,
  confluenceColor: '#f59e0b',

  bullishColor: '#22c55e',
  bearishColor: '#ef4444',
  bullishExtremeColor: '#16a34a',
  bearishExtremeColor: '#dc2626',
  mitigatedColor: '#6b7280',

  zoneOpacity: 0.15,
  extremeOpacity: 0.35,
};
