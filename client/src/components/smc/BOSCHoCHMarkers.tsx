import { useEffect, useRef } from 'react';
import { IChartApi, LineSeries, ISeriesApi } from 'lightweight-charts';
import type { BOS, CHoCH } from '@/types/smc.types';
import type { CandleData } from '@/types/chart.types';

interface BOSCHoCHMarkersProps {
  chart: IChartApi | null;
  bosEvents: BOS[];
  chochEvents: CHoCH[];
  showBOS: boolean;
  showCHoCH: boolean;
  candles: CandleData[];
}

export function BOSCHoCHMarkers({
  chart,
  bosEvents,
  chochEvents,
  showBOS,
  showCHoCH,
  candles
}: BOSCHoCHMarkersProps) {
  const bosSeriesRefs = useRef<Array<ISeriesApi<'Line'>>>([]);
  const chochSeriesRefs = useRef<Array<ISeriesApi<'Line'>>>([]);

  // Update BOS markers with horizontal lines
  useEffect(() => {
    if (!chart || candles.length === 0) {
      return;
    }

    // Extra safety check - ensure chart hasn't been disposed
    try {
      chart.timeScale();
    } catch (e) {
      return; // Chart is disposed, skip this update
    }

    // Remove old BOS lines with better error handling
    if (bosSeriesRefs.current.length > 0) {
      bosSeriesRefs.current.forEach(series => {
        try {
          if (series && chart) {
            chart.removeSeries(series);
          }
        } catch (e) {
          // Series already disposed, ignore
        }
      });
      bosSeriesRefs.current = [];
    }
    
    if (!showBOS) return;

    try {
      // Create a Set of CHoCH pivot points (CHoCH takes precedence)
      const chochPivots = new Set(
        chochEvents.map(c => `${c.swingTime}_${c.swingPrice.toFixed(4)}`)
      );
      
      // Filter out BOS that conflict with CHoCH at the same pivot point
      const filteredBos = bosEvents.filter(b => {
        const pivotKey = `${b.swingTime}_${b.swingPrice.toFixed(4)}`;
        return !chochPivots.has(pivotKey);
      });
      
      console.log(`🎯 Drawing ${filteredBos.length} BOS markers on chart (${bosEvents.length - filteredBos.length} filtered due to CHoCH conflict)`);
      
      // Add horizontal line series for each BOS point
      filteredBos.forEach((bosPoint, idx) => {
        try {
          const color = bosPoint.type === 'bullish' ? '#10b981' : '#ef4444';
          
          // All BOS use solid lines
          const bosSeries = chart.addSeries(LineSeries, {
            color,
            lineWidth: 2,
            lineStyle: 0, // Solid lines for all BOS
            priceLineVisible: false,
            lastValueVisible: false,
          });
          
          // Draw horizontal line from swing to break
          const lineData = [
            { time: bosPoint.swingTime as any, value: bosPoint.swingPrice },
            { time: bosPoint.breakTime as any, value: bosPoint.swingPrice },
          ];
          
          if (idx === 0) {
            const swingDate = new Date(bosPoint.swingTime * 1000);
            const breakDate = new Date(bosPoint.breakTime * 1000);
            const candlesBetween = (bosPoint.breakTime - bosPoint.swingTime) / 900; // 900 seconds = 15 min
            console.log('🔍 First BOS line:', {
              swingTime: swingDate.toLocaleString(),
              breakTime: breakDate.toLocaleString(),
              candlesBetween,
              price: bosPoint.swingPrice,
              type: bosPoint.type
            });
          }
          
          bosSeries.setData(lineData);
          
          bosSeriesRefs.current.push(bosSeries);
        } catch (lineErr) {
          console.error(`❌ Failed to draw BOS line ${idx}:`, lineErr, bosPoint);
        }
      });
    } catch (e) {
      console.error('Error updating BOS markers:', e);
    }
  }, [chart, candles, bosEvents, chochEvents, showBOS]);

  // Update CHoCH markers with horizontal lines
  useEffect(() => {
    if (!chart || candles.length === 0) {
      return;
    }

    // Extra safety check - ensure chart hasn't been disposed
    try {
      chart.timeScale();
    } catch (e) {
      return; // Chart is disposed, skip this update
    }

    // Remove old CHoCH lines with better error handling
    if (chochSeriesRefs.current.length > 0) {
      chochSeriesRefs.current.forEach(series => {
        try {
          if (series && chart) {
            chart.removeSeries(series);
          }
        } catch (e) {
          // Series already disposed, ignore
        }
      });
      chochSeriesRefs.current = [];
    }
    
    if (!showCHoCH) return;

    try {
      // Add horizontal line series for each CHoCH point
      chochEvents.forEach(chochPoint => {
        const color = chochPoint.type === 'bullish' ? '#eab308' : '#ec4899'; // Yellow for bullish, Pink for bearish
        
        // CHoCH always uses dashed lines
        const chochSeries = chart.addSeries(LineSeries, {
          color,
          lineWidth: 2,
          lineStyle: 2, // Dashed for CHoCH
          priceLineVisible: false,
          lastValueVisible: false,
        });
        
        // Draw horizontal line from swing to break
        chochSeries.setData([
          { time: chochPoint.swingTime as any, value: chochPoint.swingPrice },
          { time: chochPoint.breakTime as any, value: chochPoint.swingPrice },
        ]);
        
        chochSeriesRefs.current.push(chochSeries);
      });
    } catch (e) {
      console.error('Error updating CHoCH markers:', e);
    }
  }, [chart, candles, chochEvents, showCHoCH]);

  return null;
}
