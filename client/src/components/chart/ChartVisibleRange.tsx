import { useEffect } from 'react';
import { IChartApi } from 'lightweight-charts';

interface ChartVisibleRangeProps {
  chart: IChartApi | null;
  onVisibleCandleCountChange: (count: number) => void;
}

export const ChartVisibleRange: React.FC<ChartVisibleRangeProps> = ({
  chart,
  onVisibleCandleCountChange
}) => {
  useEffect(() => {
    if (!chart) return;

    // Subscribe to visible range changes to update candle count
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) {
        const count = Math.round(range.to - range.from) + 1;
        onVisibleCandleCountChange(count);
      }
    });
    
    // Set initial visible candle count
    const initialRange = chart.timeScale().getVisibleLogicalRange();
    if (initialRange) {
      onVisibleCandleCountChange(Math.round(initialRange.to - initialRange.from) + 1);
    }
  }, [chart, onVisibleCandleCountChange]);

  return null;
};
