/**
 * @fileoverview SMT Pivot Renderer
 * Renders swing pivots detected from SMT divergence analysis on the chart
 */

import { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts';
import type { Pivot } from '@/lib/smc/pivots';

interface SMTPivotRendererProps {
  chart: IChartApi;
  candleSeries: ISeriesApi<SeriesType>;
  mainPivots: Pivot[];
  correlatedPivots?: Pivot[]; // Optional: to show both pivots
  enabled?: boolean;
  mainColor?: string;
  correlatedColor?: string;
}

/**
 * Render SMT pivots as shapes on the chart
 * Main pivots in blue, correlated pivots in orange
 */
export function renderSMTPivots({
  chart,
  candleSeries,
  mainPivots,
  correlatedPivots,
  enabled = true,
  mainColor = '#3b82f6',
  correlatedColor = '#f97316',
}: SMTPivotRendererProps): void {
  if (!enabled) return;

  const priceScale = candleSeries.priceScale();
  const timeScale = chart.timeScale();

  // Remove existing pivot shapes (optional: track by ID)
  // For now, we'll just add new ones (chart.addShape in newer versions)
  // If using older lightweight-charts, we need to use SeriesPrimitive or overlay

  // Render main pivots as markers
  renderPivotMarkers(mainPivots, mainColor, 'Main', candleSeries, timeScale, priceScale);

  if (correlatedPivots) {
    renderPivotMarkers(correlatedPivots, correlatedColor, 'Corr', candleSeries, timeScale, priceScale);
  }
}

function renderPivotMarkers(
  pivots: Pivot[],
  color: string,
  label: string,
  candleSeries: any,
  timeScale: any,
  priceScale: any,
): void {
  for (const pivot of pivots.slice(-4)) {
    // Only show recent pivots to avoid clutter
    const x = timeScale.timeToCoordinate(pivot.time as unknown as Time);
    if (x === null) continue;

    const y = priceScale.priceToCoordinate(pivot.value);

    if (y === null) continue;

    // Mark using a small circle or triangle
    // This would typically be done via SeriesPrimitive or custom overlay
    // For now, document the approach:
    // - Use SVG overlay or
    // - Use chart primitives (if available) or
    // - Use custom pane renderer

    // Log for debugging
    console.debug(`[SMT] Pivot ${pivot.isHigh ? 'HIGH' : 'LOW'} at ${pivot.value.toFixed(2)} (index ${pivot.index})`);
  }
}

/**
 * Create SMT divergence annotation
 * Shows text label for detected divergence
 */
export function createSMTAnnotation(
  divergenceType: 'bullish' | 'bearish' | null,
  score: number,
  correlatedSymbol: string,
): { text: string; color: string } | null {
  if (!divergenceType) return null;

  const icon = divergenceType === 'bullish' ? '▲' : '▼';
  const color = divergenceType === 'bullish' ? '#10b981' : '#ef4444';

  return {
    text: `${icon} ${divergenceType.toUpperCase()} SMT vs ${correlatedSymbol} (${score}/100)`,
    color,
  };
}
