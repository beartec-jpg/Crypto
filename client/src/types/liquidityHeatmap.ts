export type CoinglassRange = '12h' | '24h' | '3d' | '7d' | '30d' | '90d' | '180d' | '1y';
export type SidebarPosition = 'left' | 'right';

export interface LiquidityHeatmapSettings {
  enabled: boolean;

  // Data source
  exchange: string;              // Fixed: 'Aggregated'
  range: CoinglassRange;         // Coinglass range value - default: '7d'
  syncToChartTimeframe: boolean; // Auto-select range based on chart TF - default: true

  // Display
  showHeatmap: boolean;            // Show heatmap overlay - default: true
  showLiquidationLevels: boolean;  // Draw lines at key levels - default: true
  opacity: number;                 // Heatmap opacity 0-100 - default: 50
  showRangeIndicator: boolean;     // Show badge indicating current data range - default: true

  // Colors
  longLiquidationColor: string;   // Default: '#ef4444' (red)
  shortLiquidationColor: string;  // Default: '#22c55e' (green)

  // Behavior
  autoRefresh: boolean;    // Auto-refresh data - default: true
  refreshInterval: number; // Refresh interval in seconds - default: 60

  // Predictive scoring controls
  liqFlowWeight: number;   // Default: 0.2
  biasWeight: number;      // Default: 0.15

  // Pivot + volume + liquidation predictor controls
  usePivotVolumePrediction: boolean; // Enable confluence predictor mode - default: true
  pivotLookback: number;             // Pivot swing lookback candles - default: 5
  predictionMinConfidence: number;   // Minimum confidence threshold 0-100 - default: 40
  predictionTopNPoints: number;      // Number of top prediction points to keep - default: 15
  predictionPriceThresholdPct: number; // Price grouping threshold percent - default: 0.5
  autoTunePredictionByRange: boolean;  // Auto-adjust predictor sensitivity by effective range - default: true

  // Layout
  position: SidebarPosition; // Sidebar position: 'left' | 'right'. If both indicators share a side, they entwine.

  // Developer
  showDebugPanel: boolean; // Show debug/stats panel - default: false
}

export interface LiquidityLevel {
  price: number;
  liquidationValue: number; // USD value of liquidations at this level
  side: 'long' | 'short';
  score?: number;
  type?: 'primary' | 'secondary';
}

export interface LiquidationTargetLevel extends LiquidityLevel {
  score: number;
  type: 'primary' | 'secondary';
}

export interface LiquidityHeatmapData {
  levels: LiquidityLevel[];
  targetLevels?: LiquidationTargetLevel[];
  directionScore?: number;
  maxLongPrice: number;
  maxShortPrice: number;
  totalLongLiquidation: number;
  totalShortLiquidation: number;
  lastUpdated: number;
}

export const DEFAULT_LIQUIDITY_HEATMAP_SETTINGS: LiquidityHeatmapSettings = {
  enabled: false,
  exchange: 'Aggregated',
  range: '7d',
  syncToChartTimeframe: true,
  showHeatmap: true,
  showLiquidationLevels: true,
  opacity: 50,
  showRangeIndicator: true,
  longLiquidationColor: '#ef4444',
  shortLiquidationColor: '#22c55e',
  autoRefresh: true,
  refreshInterval: 60,
  liqFlowWeight: 0.2,
  biasWeight: 0.15,
  usePivotVolumePrediction: true,
  pivotLookback: 5,
  predictionMinConfidence: 40,
  predictionTopNPoints: 15,
  predictionPriceThresholdPct: 0.5,
  autoTunePredictionByRange: true,
  position: 'right',
  showDebugPanel: false,
};

export const COINGLASS_RANGES: { value: CoinglassRange; label: string }[] = [
  { value: '12h', label: '12 Hours' },
  { value: '24h', label: '24 Hours' },
  { value: '3d', label: '3 Days' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: '180d', label: '180 Days' },
  { value: '1y', label: '1 Year' },
];
