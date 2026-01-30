import { useEffect, useRef } from 'react';
import { IChartApi, LineSeries } from 'lightweight-charts';
import type { MAConfig } from '@/types/chart.types';

interface MovingAveragesProps {
  chart: IChartApi | null;
  maConfigs: MAConfig[];
  show: boolean;
  candles: any[];
  calculateEMA: (closes: number[], period: number) => number[];
  emaHTFDataCache: React.MutableRefObject<Record<string, any[]>>;
  symbol: string;
  interval: string;
}

export function MovingAverages({
  chart,
  maConfigs,
  show,
  candles,
  calculateEMA,
  emaHTFDataCache,
  symbol,
  interval
}: MovingAveragesProps) {
  const emaSeriesRefs = useRef<Record<string, any>>({});

  // Format MA label helper
  const formatMALabel = (period: number, timeframe: string): string => {
    if (timeframe === 'current') return `${period}`;
    // Map timeframe to short code: '1d' -> 'D', '1w' -> 'W', '4h' -> 'h4', etc.
    const tfMap: Record<string, string> = {
      '1m': 'm1', '3m': 'm3', '5m': 'm5', '15m': 'm15', '30m': 'm30',
      '1h': 'h1', '2h': 'h2', '4h': 'h4', '6h': 'h6', '8h': 'h8', '12h': 'h12',
      '1d': 'D', '3d': '3D', '1w': 'W', '1M': 'M'
    };
    const suffix = tfMap[timeframe] || timeframe;
    return `${period}${suffix}`;
  };

  useEffect(() => {
    if (!chart || candles.length === 0) return;

    const refs = emaSeriesRefs.current;

    // Remove old EMA series that are no longer in configs
    const currentIds = new Set(maConfigs.map(c => c.id));
    Object.keys(refs).forEach(key => {
      if (!currentIds.has(key) && refs[key]) {
        try { chart.removeSeries(refs[key]!); } catch (e) {}
        delete refs[key];
      }
    });

    if (!show) {
      // Remove all EMA series when disabled
      Object.keys(refs).forEach(key => {
        if (refs[key]) {
          try { chart.removeSeries(refs[key]!); } catch (e) {}
          delete refs[key];
        }
      });
      return;
    }

    // Render each EMA config
    for (const config of maConfigs) {
      let emaData: { time: any; value: number }[] = [];
      
      // Determine which data source to use
      const isCurrentTimeframe = config.timeframe === 'current' || config.timeframe === interval;
      
      if (isCurrentTimeframe) {
        // Use current chart candles
        const closes = candles.map(c => c.close);
        const emaValues = calculateEMA(closes, config.period);
        emaData = candles.map((c, i) => ({
          time: c.time as any,
          value: emaValues[i]
        })).filter(d => d.value !== undefined);
      } else {
        // Use higher timeframe data and map to current chart
        const cacheKey = `${symbol}_${config.timeframe}`;
        const htfCandles = emaHTFDataCache.current[cacheKey];
        
        if (htfCandles && htfCandles.length > 0) {
          const htfCloses = htfCandles.map(c => c.close);
          const htfEmaValues = calculateEMA(htfCloses, config.period);
          
          // Map higher TF EMA values to current chart timeframe
          // Each HTF candle's EMA value applies to all current TF candles within its time range
          const htfEmaMap: { time: number; value: number }[] = htfCandles.map((c, i) => ({
            time: c.time,
            value: htfEmaValues[i]
          })).filter(d => d.value !== undefined);
          
          // For each current candle, find the corresponding HTF EMA value
          emaData = candles.map(c => {
            // Find the most recent HTF EMA value that's <= current candle time
            let htfValue: number | undefined;
            for (let i = htfEmaMap.length - 1; i >= 0; i--) {
              if (htfEmaMap[i].time <= c.time) {
                htfValue = htfEmaMap[i].value;
                break;
              }
            }
            return {
              time: c.time as any,
              value: htfValue!
            };
          }).filter(d => d.value !== undefined);
        }
      }

      // Format label: 21, 100D, 21W, 100h4, etc.
      const label = formatMALabel(config.period, config.timeframe);

      if (!refs[config.id]) {
        try {
          refs[config.id] = chart.addSeries(LineSeries, {
            color: config.color,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            title: label,
          });
        } catch (e) { continue; }
      } else {
        // Update title if config changed
        try {
          refs[config.id]!.applyOptions({ title: label });
        } catch (e) {}
      }
      
      if (emaData.length > 0) {
        try {
          refs[config.id]!.setData(emaData);
        } catch (e) {}
      }
    }
  }, [chart, candles, show, maConfigs, calculateEMA, symbol, interval]);

  return null;
}
