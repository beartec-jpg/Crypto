import type { CoinglassRange } from '@/types/liquidityHeatmap';

/**
 * Maps a chart interval string to the most appropriate Coinglass range.
 * The goal is to show liquidation data that's relevant to what's visible on the chart.
 */
export function mapChartIntervalToRange(interval: string): CoinglassRange {
  // Normalize interval to lowercase
  const normalized = interval.toLowerCase();

  // Extract number and unit
  const match = normalized.match(/^(\d+)([mhdw]?)$/);
  if (!match) return '7d'; // fallback

  const value = parseInt(match[1], 10);
  const unit = match[2] || 'm'; // default to minutes if no unit

  // Convert to minutes for easier comparison
  let minutes = value;
  switch (unit) {
    case 'h': minutes = value * 60; break;
    case 'd': minutes = value * 60 * 24; break;
    case 'w': minutes = value * 60 * 24 * 7; break;
  }

  // Map to appropriate range:
  // - Very short timeframes (1m-15m): Show 12h of liquidation data
  // - Short timeframes (30m-1h): Show 24h
  // - Medium timeframes (2h-4h): Show 3d
  // - Daily/sub-daily (6h-1d): Show 7d
  // - Multi-day/weekly (2d-1w): Show 30d
  // - Larger: Show 90d

  if (minutes <= 15) return '12h';    // 1m, 5m, 15m
  if (minutes <= 60) return '24h';    // 30m, 1h
  if (minutes <= 240) return '3d';    // 2h, 4h
  if (minutes <= 1440) return '7d';   // 6h, 8h, 12h, 1d
  if (minutes <= 10080) return '30d'; // 2d, 3d, 1w
  return '90d';                       // larger timeframes
}

/**
 * Get a human-readable short label for the range (e.g. "7D", "24H").
 */
export function getRangeLabel(range: CoinglassRange): string {
  const labels: Record<CoinglassRange, string> = {
    '12h': '12H',
    '24h': '24H',
    '3d': '3D',
    '7d': '7D',
    '30d': '30D',
    '90d': '90D',
    '180d': '180D',
    '1y': '1Y',
  };
  return labels[range];
}
