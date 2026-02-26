import { useState, useEffect } from 'react';
import type { IChartApi } from 'lightweight-charts';

export function useVisibleRange(
  chart: IChartApi | null
): { from: number; to: number } | null {
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);

  useEffect(() => {
    if (!chart) return;

    const updateRange = () => {
      const timeScale = chart.timeScale();
      const visibleRange = timeScale.getVisibleRange();

      if (!visibleRange) return;

      setRange({
        from: visibleRange.from as number,
        to: visibleRange.to as number,
      });
    };

    updateRange();
    chart.timeScale().subscribeVisibleTimeRangeChange(updateRange);

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(updateRange);
    };
  }, [chart]);

  return range;
}
