import { useEffect, useRef } from 'react';
import { IChartApi, HistogramSeries, LineSeries, ISeriesApi } from 'lightweight-charts';
import type { CandleData } from '@/types/chart.types';

interface OrderBlockOverlayProps {
  chart: IChartApi | null;
  orderBlocks: any[];
  show: boolean;
  candles: CandleData[];
}

export function OrderBlockOverlay({
  chart,
  orderBlocks,
  show,
  candles
}: OrderBlockOverlayProps) {
  const orderBlocksRefs = useRef<Array<{ upper: ISeriesApi<'Line'>; lower: ISeriesApi<'Line'>; fill: ISeriesApi<'Histogram'> }>>([]);

  useEffect(() => {
    if (!chart || candles.length === 0) return;
    
    // Clear previous order blocks
    orderBlocksRefs.current.forEach(ob => {
      try {
        if (ob.upper) chart.removeSeries(ob.upper);
        if (ob.lower) chart.removeSeries(ob.lower);
        if (ob.fill) chart.removeSeries(ob.fill);
      } catch (e) {}
    });
    orderBlocksRefs.current = [];
    
    if (show) {
      const lastTime = candles[candles.length - 1].time;
      
      // Render each order block as a shaded box like FVG
      // Show fresh blocks with full opacity, mitigated with reduced opacity
      for (const ob of orderBlocks.slice(-20)) { // Show last 20 blocks
        try {
          // Fresh blocks have higher opacity, mitigated blocks have lower
          const opacity = ob.mitigated ? 0.1 : 0.25;
          const borderOpacity = ob.mitigated ? 0.4 : 1;
          const color = ob.type === 'bullish' 
            ? `rgba(16, 185, 129, ${opacity})` 
            : `rgba(239, 68, 68, ${opacity})`;
          const borderColor = ob.type === 'bullish' 
            ? `rgba(16, 185, 129, ${borderOpacity})` 
            : `rgba(239, 68, 68, ${borderOpacity})`;
          
          // Find candles from OB time to current time
          const obIdx = candles.findIndex(c => c.time === ob.time);
          const candlesInRange = candles.slice(obIdx);
          
          // Create histogram series to fill the block area
          const fillSeries = chart.addSeries(HistogramSeries, {
            color,
            priceFormat: {
              type: 'price',
            },
            priceLineVisible: false,
            lastValueVisible: false,
            base: ob.low,
          });
          
          // Create border lines
          const lowerBorder = chart.addSeries(LineSeries, {
            color: borderColor,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          
          const upperBorder = chart.addSeries(LineSeries, {
            color: borderColor,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          
          // Fill the block with histogram bars
          const histogramData = candlesInRange.map(c => ({
            time: c.time as any,
            value: ob.high,
            color
          }));
          
          // Create border data extending to current time
          const borderData = [
            { time: ob.time as any, value: 0 },
            { time: lastTime as any, value: 0 },
          ];
          
          const lowerData = borderData.map(d => ({ ...d, value: ob.low }));
          const upperData = borderData.map(d => ({ ...d, value: ob.high }));
          
          fillSeries.setData(histogramData);
          lowerBorder.setData(lowerData);
          upperBorder.setData(upperData);
          
          orderBlocksRefs.current.push({ upper: upperBorder, lower: lowerBorder, fill: fillSeries });
        } catch (e) {}
      }
    }
  }, [chart, candles, orderBlocks, show]);

  return null;
}
