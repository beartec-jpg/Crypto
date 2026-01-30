import { useEffect, useRef } from 'react';
import { IChartApi, HistogramSeries, LineSeries, ISeriesApi } from 'lightweight-charts';
import type { FVG } from '@/types/smc.types';
import type { CandleData } from '@/types/chart.types';

interface FVGOverlayProps {
  chart: IChartApi | null;
  fvgs: FVG[];
  show: boolean;
  candles: CandleData[];
  activeTradeFVGTimes: Set<number>;
  isActiveFVG: (fvg: FVG, candles: CandleData[]) => boolean;
  getFVGFillTime: (fvg: FVG, candles: CandleData[]) => number | null;
  showHighValueOnly: boolean;
}

export function FVGOverlay({
  chart,
  fvgs,
  show,
  candles,
  activeTradeFVGTimes,
  isActiveFVG,
  getFVGFillTime,
  showHighValueOnly
}: FVGOverlayProps) {
  const fvgSeriesRefs = useRef<Array<{ upper: ISeriesApi<'Line'>; lower: ISeriesApi<'Line'>; fill: ISeriesApi<'Histogram'>; fvg: FVG }>>([]);

  useEffect(() => {
    if (!chart || candles.length === 0) return;

    const refs = fvgSeriesRefs.current;
    if (refs.length > 0) {
      refs.forEach(fl => {
        try {
          if (chart && fl.upper) chart.removeSeries(fl.upper);
        } catch (e) {
          // Series might already be removed
        }
        try {
          if (chart && fl.lower) chart.removeSeries(fl.lower);
        } catch (e) {
          // Series might already be removed
        }
        try {
          if (chart && fl.fill) chart.removeSeries(fl.fill);
        } catch (e) {
          // Series might already be removed
        }
      });
    }
    fvgSeriesRefs.current = [];
    
    if (!show) return;

    const lastTime = candles[candles.length - 1].time;

    fvgs.forEach(fvg => {
      const hasActiveTrade = activeTradeFVGTimes.has(fvg.time);
      
      // Only show FVG if it has an active trade OR if it's still valid (not filled)
      const shouldShow = hasActiveTrade || isActiveFVG(fvg, candles);
      
      if (shouldShow) {
        // Skip non-high-value FVGs if filter is enabled (but always show traded FVGs)
        if (!hasActiveTrade && showHighValueOnly && !fvg.isHighValue) {
          return;
        }

        // Use YELLOW for FVGs with active trades, normal colors otherwise
        let color: string;
        let borderColor: string;
        
        if (hasActiveTrade) {
          // Yellow for active trade FVGs
          color = 'rgba(234, 179, 8, 0.3)'; // Yellow with transparency
          borderColor = '#eab308'; // Solid yellow
        } else {
          // Normal colors based on type and value
          const isHighValue = fvg.isHighValue;
          color = fvg.type === 'bullish' 
            ? (isHighValue ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.12)')
            : (isHighValue ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.12)');
          borderColor = fvg.type === 'bullish' 
            ? (isHighValue ? '#10b981' : '#10b98180')
            : (isHighValue ? '#ef4444' : '#ef444480');
        }
        
        // Find all candles from FVG time to fill time (or current time if not filled)
        const fvgIdx = candles.findIndex(c => c.time === fvg.time);
        const fillTime = getFVGFillTime(fvg, candles);
        const endTime = fillTime || lastTime;
        const endIdx = candles.findIndex(c => c.time === endTime);
        const candlesInRange = candles.slice(fvgIdx, endIdx + 1);
        
        // Create histogram series to fill the gap area
        const fillSeries = chart.addSeries(HistogramSeries, {
          color,
          priceFormat: {
            type: 'price',
          },
          priceLineVisible: false,
          lastValueVisible: false,
          base: fvg.lower,
        });
        
        // Create border lines
        const lowerBorder = chart.addSeries(LineSeries, {
          color: borderColor,
          lineWidth: 2, // Thicker borders for better visibility
          priceLineVisible: false,
          lastValueVisible: false,
        });
        
        const upperBorder = chart.addSeries(LineSeries, {
          color: borderColor,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        
        // Fill the gap with histogram bars for each time point
        const gapHeight = fvg.upper - fvg.lower;
        const histogramData = candlesInRange.map(c => ({
          time: c.time as any,
          value: fvg.upper, // Draw from base (fvg.lower) to fvg.upper
          color
        }));
        
        try {
          fillSeries.setData(histogramData);
          
          // Add border lines (stop at fill time if filled)
          lowerBorder.setData([
            { time: fvg.time as any, value: fvg.lower },
            { time: endTime as any, value: fvg.lower },
          ]);
          upperBorder.setData([
            { time: fvg.time as any, value: fvg.upper },
            { time: endTime as any, value: fvg.upper },
          ]);
          
          fvgSeriesRefs.current.push({ upper: upperBorder, lower: lowerBorder, fill: fillSeries, fvg });
        } catch (e) {
          // Series might be disposed
        }
      }
    });
  }, [chart, candles, fvgs, show, activeTradeFVGTimes, isActiveFVG, getFVGFillTime, showHighValueOnly]);

  return null;
}
