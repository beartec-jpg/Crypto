import { useEffect, useState, useCallback } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { Time } from 'lightweight-charts';
import type { DivergencePoint } from '@/types/chart.types';
import { getDivergenceBadgeColor } from '@/lib/calculations/divergenceCalculations';
import { DIVERGENCE_OSCILLATOR_COUNT } from '@/lib/calculations/divergenceCalculations';
import type { DivergenceSettings } from '@/hooks/useDivergenceSettings';

interface BadgePosition {
  point: DivergencePoint;
  x: number;
  y: number;
}

/** Pixels above the price to position bearish (top) badges */
const BEARISH_BADGE_OFFSET = 28;
/** Pixels below the price to position bullish (bottom) badges */
const BULLISH_BADGE_OFFSET = 10;

const TOTAL_INDICATORS = DIVERGENCE_OSCILLATOR_COUNT;

interface DivergenceRendererProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  divergencePoints: DivergencePoint[];
  onBadgeClick: (point: DivergencePoint) => void;
  settings: DivergenceSettings;
}

export function DivergenceRenderer({
  chart,
  candleSeries,
  divergencePoints,
  onBadgeClick,
  settings,
}: DivergenceRendererProps) {
  const [positions, setPositions] = useState<BadgePosition[]>([]);

  const updatePositions = useCallback(() => {
    if (!chart || !candleSeries) {
      setPositions([]);
      return;
    }

    const newPositions: BadgePosition[] = [];
    for (const point of divergencePoints) {
      const x = chart.timeScale().timeToCoordinate(point.time as Time);
      const y = candleSeries.priceToCoordinate(point.price);
      if (x !== null && y !== null) {
        // Position bearish badges above the candle, bullish below
        const offsetY = point.type === 'bearish' ? y - BEARISH_BADGE_OFFSET : y + BULLISH_BADGE_OFFSET;
        newPositions.push({ point, x, y: offsetY });
      }
    }
    setPositions(newPositions);
  }, [chart, candleSeries, divergencePoints]);

  // Subscribe to chart pan/zoom to reposition badges
  useEffect(() => {
    if (!chart) return;
    chart.timeScale().subscribeVisibleTimeRangeChange(updatePositions);
    updatePositions();
    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(updatePositions);
    };
  }, [chart, updatePositions]);

  // Recompute positions when divergence points change
  useEffect(() => {
    updatePositions();
  }, [divergencePoints, updatePositions]);

  return (
    <>
      {positions.map((pos, i) => {
        const bgColor = settings.showColors
          ? getDivergenceBadgeColor(pos.point.count)
          : 'bg-gray-600';
        const emoji = settings.showEmoji
          ? (pos.point.type === 'bullish' ? '🐂' : '🐻')
          : '';
        const displayValue = settings.displayFormat === 'percentage'
          ? `${Math.round((pos.point.count / TOTAL_INDICATORS) * 100)}%`
          : pos.point.count.toString();

        // SMT indicator shows when multi-asset divergence is present
        const hasSMT = pos.point.smtScore !== undefined && pos.point.smtScore > 0;
        const smtIndicator = hasSMT ? '⭐' : '';

        // MTF cascade indicator
        const hasCascade = (pos.point.mtfCascadeLevel ?? 0) >= 2;
        const cascadeLabel = hasCascade
          ? `${pos.point.mtfCascadeLevel}-TF ×${pos.point.mtfCascadeBonus?.toFixed(2)}`
          : '';

        // Build tooltip with full divergence info
        const tooltipParts = [
          `${pos.point.type === 'bullish' ? 'Bullish' : 'Bearish'} divergence`,
          `${pos.point.count}/7 indicators`,
        ];
        if ((pos.point.mtfActiveTimeframes?.length ?? 0) > 0) {
          tooltipParts.push(`Active TFs: ${pos.point.mtfActiveTimeframes?.length}`);
        }
        if (hasCascade) {
          tooltipParts.push(`MTF Cascade: ${cascadeLabel} (${(pos.point.mtfActiveTimeframes ?? []).join(', ')})`);
        }
        if (hasSMT) {
          tooltipParts.push(`SMT: ${pos.point.smtScore}/100 (${pos.point.correlationSymbol})`);
          if (pos.point.smtConfidence !== undefined) {
            tooltipParts.push(`Confidence: ${pos.point.smtConfidence}/100`);
          }
        }
        const tooltip = tooltipParts.join(' • ');

        return (
          <button
            key={`${pos.point.time}-${pos.point.type}-${i}`}
            className={`absolute z-20 ${bgColor} text-white px-1.5 py-0.5 rounded-full text-xs font-bold cursor-pointer hover:opacity-90 transition-opacity flex items-center gap-0.5 ${
              hasCascade && hasSMT
                ? 'ring-2 ring-yellow-300 outline outline-2 outline-purple-400'
                : hasCascade
                  ? 'ring-2 ring-purple-400'
                  : hasSMT
                    ? 'ring-2 ring-yellow-300'
                    : ''
            }`}
            style={{
              left: pos.x,
              top: pos.y,
              transform: 'translateX(-50%)',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onBadgeClick(pos.point);
            }}
            title={tooltip}
          >
            {emoji && <span>{emoji}</span>}
            <span>{displayValue}</span>
            {smtIndicator && <span>{smtIndicator}</span>}
            {hasCascade && <span className="text-purple-200">⚡</span>}
          </button>
        );
      })}
    </>
  );
}
