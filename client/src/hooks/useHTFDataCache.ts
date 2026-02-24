import { useState, useEffect, useRef } from 'react';
import { convertTimeframe } from '@/lib/utils/binance';

interface EMAConfig {
  timeframe: string;
  period: number;
  color?: string;
}

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface UseHTFDataCacheOptions {
  symbol: string;
  currentTimeframe: string;
  emaConfigs: EMAConfig[];
  enabled: boolean;
}

interface UseHTFDataCacheReturn {
  htfDataCache: React.MutableRefObject<Record<string, CandleData[]>>;
  isLoading: boolean;
}

export function useHTFDataCache({
  symbol,
  currentTimeframe,
  emaConfigs,
  enabled,
}: UseHTFDataCacheOptions): UseHTFDataCacheReturn {
  const [isLoading, setIsLoading] = useState(false);
  const htfDataCache = useRef<Record<string, CandleData[]>>({});
  const prevSymbolRef = useRef<string>(symbol);

  // Clear cache when symbol changes
  useEffect(() => {
    if (prevSymbolRef.current !== symbol) {
      htfDataCache.current = {};
      prevSymbolRef.current = symbol;
      console.log('[EMA HTF] Cache cleared due to symbol change');
    }
  }, [symbol]);

  // Clear cache when timeframe changes so the EMA series is reset and fitContent
  // doesn't zoom out to show the full HTF history on the new timeframe.
  useEffect(() => {
    htfDataCache.current = {};
    console.log('[EMA HTF] Cache cleared due to timeframe change');
  }, [currentTimeframe]);

  // Fetch higher timeframe data
  useEffect(() => {
    if (!enabled || !symbol) return;

    const fetchHTFData = async () => {
      const htfTimeframes = emaConfigs
        .filter(c => c.timeframe !== 'current' && c.timeframe !== currentTimeframe)
        .map(c => c.timeframe);
      
      const uniqueTimeframes = [...new Set(htfTimeframes)];
      if (uniqueTimeframes.length === 0) return;

      setIsLoading(true);
      
      for (const tf of uniqueTimeframes) {
        const cacheKey = `${symbol}_${tf}`;
        if (htfDataCache.current[cacheKey]) continue;
        
        try {
          const binanceInterval = convertTimeframe(tf);
          const response = await fetch(
            `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${binanceInterval}&limit=500`
          );
          
          if (response.ok) {
            const klines = await response.json();
            const transformedCandles = klines.map((kline: any[]) => ({
              time: Math.floor(kline[0] / 1000),
              open: parseFloat(kline[1]),
              high: parseFloat(kline[2]),
              low: parseFloat(kline[3]),
              close: parseFloat(kline[4]),
              volume: parseFloat(kline[5])
            }));
            htfDataCache.current[cacheKey] = transformedCandles;
            console.log(`[EMA HTF] Fetched ${tf} data for ${symbol}: ${transformedCandles.length} candles`);
          }
        } catch (e) {
          console.error(`[EMA HTF] Failed to fetch ${tf} data:`, e);
        }
      }
      
      setIsLoading(false);
    };
    
    fetchHTFData();
  }, [enabled, emaConfigs, symbol, currentTimeframe]);

  return { htfDataCache, isLoading };
}
