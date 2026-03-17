export interface LiquidityHeatmapSettings {
  enabled: boolean;

  // Data source
  exchange: string;       // Default: 'Binance'
  lookbackDays: number;   // Default: 7 (max for Hobbyist tier)

  // Display
  showHeatmap: boolean;            // Show heatmap overlay - default: true
  showLiquidationLevels: boolean;  // Draw lines at key levels - default: true
  opacity: number;                 // Heatmap opacity 0-100 - default: 50

  // Colors
  longLiquidationColor: string;   // Default: '#ef4444' (red)
  shortLiquidationColor: string;  // Default: '#22c55e' (green)

  // Behavior
  autoRefresh: boolean;    // Auto-refresh data - default: true
  refreshInterval: number; // Refresh interval in seconds - default: 60
}

export interface LiquidityLevel {
  price: number;
  liquidationValue: number; // USD value of liquidations at this level
  side: 'long' | 'short';
}

export interface LiquidityHeatmapData {
  levels: LiquidityLevel[];
  maxLongPrice: number;
  maxShortPrice: number;
  totalLongLiquidation: number;
  totalShortLiquidation: number;
  lastUpdated: number;
}

export const DEFAULT_LIQUIDITY_HEATMAP_SETTINGS: LiquidityHeatmapSettings = {
  enabled: false,
  exchange: 'Binance',
  lookbackDays: 7,
  showHeatmap: true,
  showLiquidationLevels: true,
  opacity: 50,
  longLiquidationColor: '#ef4444',
  shortLiquidationColor: '#22c55e',
  autoRefresh: true,
  refreshInterval: 60,
};
