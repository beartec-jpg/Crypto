import { useEffect, useState, useCallback } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { Time } from 'lightweight-charts';
import type { DivergencePoint } from '@/types/chart.types';
import { getDivergenceBadgeColor } from '@/lib/calculations/divergenceCalculations';

interface BadgePosition {
  point: DivergencePoint;
  x: number;
  y: number;
}

/** Pixels above the price to position bearish (top) badges */
const BEARISH_BADGE_OFFSET = 28;
/** Pixels below the price to position bullish (bottom) badges */
const BULLISH_BADGE_OFFSET = 10;

interface DivergenceRendererProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  divergencePoints: DivergencePoint[];
  onBadgeClick: (point: DivergencePoint) => void;
}

export function DivergenceRenderer({
  chart,
  candleSeries,
  divergencePoints,
  onBadgeClick,
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
        const bgColor = getDivergenceBadgeColor(pos.point.count);
        const emoji = pos.point.type === 'bullish' ? '🐂' : '🐻';

        return (
          <button
            key={`${pos.point.time}-${pos.point.type}-${i}`}
            className={`absolute z-20 ${bgColor} text-white px-1.5 py-0.5 rounded-full text-xs font-bold cursor-pointer hover:opacity-90 transition-opacity flex items-center gap-0.5`}
            style={{
              left: pos.x,
              top: pos.y,
              transform: 'translateX(-50%)',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onBadgeClick(pos.point);
            }}
            title={`${pos.point.type === 'bullish' ? 'Bullish' : 'Bearish'} divergence – ${pos.point.count}/7 indicators`}
          >
            <span>{emoji}</span>
            <span>{pos.point.count}</span>
          </button>
        );
      })}
    </>
  );
}
