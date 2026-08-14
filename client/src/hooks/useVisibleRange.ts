import { useState, useEffect } from 'react';
import type { IChartApi } from 'lightweight-charts';

export interface VisibleChartRange {
  from: number;
  to: number;
  fromIndex: number;
  toIndex: number;
}

export function useVisibleRange(
  chart: IChartApi | null,
  ready = true,
): VisibleChartRange | null {
  const [range, setRange] = useState<VisibleChartRange | null>(null);

  useEffect(() => {
    if (!chart || !ready) return;

    const timeScale = chart.timeScale();

    const updateRange = () => {
      const timeRange = timeScale.getVisibleRange();
      const logical = timeScale.getVisibleLogicalRange();

      if (!logical && !timeRange) return;

      setRange({
        from: Number(timeRange?.from ?? 0),
        to: Number(timeRange?.to ?? 0),
        fromIndex: logical ? logical.from : 0,
        toIndex: logical ? logical.to : 0,
      });
    };

    updateRange();
    timeScale.subscribeVisibleTimeRangeChange(updateRange);
    timeScale.subscribeVisibleLogicalRangeChange(updateRange);

    return () => {
      timeScale.unsubscribeVisibleTimeRangeChange(updateRange);
      timeScale.unsubscribeVisibleLogicalRangeChange(updateRange);
    };
  }, [chart, ready]);

  return range;
}
