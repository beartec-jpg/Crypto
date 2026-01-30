import { useEffect, useRef } from 'react';
import { IChartApi, LineSeries, ISeriesApi } from 'lightweight-charts';

interface ParabolicSAROverlayProps {
  chart: IChartApi | null;
  psarData: any[];
  show: boolean;
}

export function ParabolicSAROverlay({ chart, psarData, show }: ParabolicSAROverlayProps) {
  const parabolicSARRef = useRef<ISeriesApi<'Line'> | null>(null);

  useEffect(() => {
    if (!chart || psarData.length === 0) return;
    
    if (show) {
      if (psarData.length > 0 && !parabolicSARRef.current) {
        try {
          parabolicSARRef.current = chart.addSeries(LineSeries, {
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: true,
            title: 'Parabolic SAR',
          });
          
          const chartData = psarData.map(s => ({
            time: s.time as any,
            value: s.sar,
            color: s.isLong ? '#10b981' : '#ef4444'
          }));
          
          parabolicSARRef.current.setData(chartData);
        } catch (e) {}
      }
    }
    
    return () => {
      if (parabolicSARRef.current) {
        try {
          chart.removeSeries(parabolicSARRef.current);
        } catch (e) {}
        parabolicSARRef.current = null;
      }
    };
  }, [chart, psarData, show]);
  
  return null;
}
