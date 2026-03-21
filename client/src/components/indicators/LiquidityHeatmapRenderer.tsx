import { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { LiquidityHeatmapPrimitive } from '@/lib/chartPrimitives/LiquidityHeatmapPrimitive';
import type { CoinglassRange, LiquidityHeatmapData, LiquidityHeatmapSettings } from '@/types/liquidityHeatmap';
import type { PredictedLiquidityPoint, LiquidationZone } from '@/hooks/useLiquidityPivotAnalysis';

type StackSection = 'full' | 'top' | 'bottom';

interface LiquidityHeatmapRendererProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  data: LiquidityHeatmapData | null;
  settings: LiquidityHeatmapSettings;
  effectiveRange: CoinglassRange;
  stackSection?: StackSection;
  profileSide?: 'left' | 'right';
  profileWidthPercent?: number;
  liquidityPivotAnalysis?: {
    points: PredictedLiquidityPoint[];
    zones: LiquidationZone[];
    directionBias: 'long' | 'short' | 'neutral';
    confidence: number;
  };
}

export function LiquidityHeatmapRenderer({
  chart,
  candleSeries,
  data,
  settings,
  effectiveRange,
  stackSection = 'full',
  profileSide = 'right',
  profileWidthPercent = 22,
  liquidityPivotAnalysis,
}: LiquidityHeatmapRendererProps) {
  const primitiveRef = useRef<LiquidityHeatmapPrimitive | null>(null);

  // Create/destroy primitive when chart or series changes or when enabled toggled
  useEffect(() => {
    if (!chart || !candleSeries || !settings.enabled) return;

    const primitive = new LiquidityHeatmapPrimitive(
      data,
      settings,
      effectiveRange,
      stackSection,
      profileSide,
      profileWidthPercent,
      liquidityPivotAnalysis,
    );
    try {
      candleSeries.attachPrimitive(primitive);
      primitiveRef.current = primitive;
    } catch (e) {
      console.error('Failed to attach LiquidityHeatmap primitive:', e);
    }

    return () => {
      if (primitiveRef.current) {
        try {
          candleSeries.detachPrimitive(primitiveRef.current);
        } catch (e) {
          console.warn('Failed to detach LiquidityHeatmap primitive:', e);
        }
        primitiveRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, candleSeries, settings.enabled, stackSection, profileSide, profileWidthPercent]);

  // Update data and settings without recreating the primitive
  useEffect(() => {
    if (primitiveRef.current) {
      primitiveRef.current.update(
        data,
        settings,
        effectiveRange,
        stackSection,
        profileSide,
        profileWidthPercent,
        liquidityPivotAnalysis,
      );
    }
  }, [data, settings, effectiveRange, stackSection, profileSide, profileWidthPercent, liquidityPivotAnalysis]);

  return null;
}
