import { useAdaptiveTimeframe } from '@/hooks/useAdaptiveTimeframe';
import type { TimeframeInterval } from '@/types/timeframes';

const adaptiveTimeframe = useAdaptiveTimeframe({
  symbol: symbol || 'XRPUSDT',
  baseTimeframe: interval as TimeframeInterval,
  visibleCandleCount: data?.length || 100,
  chartWidth: innerWidth || 1000,
  zoomScale: 1,
  onTimeframeChange: (newTf, oldTf) => {
    console.log(`📊 Timeframe switched: ${oldTf} → ${newTf}`);
    setInterval(newTf);
  }
});