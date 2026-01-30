import { useEffect } from 'react';
import { IChartApi, LineSeries, ISeriesApi } from 'lightweight-charts';
import { SupertrendValue } from '@/lib/indicators';

interface SupertrendOverlayProps {
  chart: IChartApi | null;
  supertrendData: SupertrendValue[];
  show: boolean;
}

export function SupertrendOverlay({ chart, supertrendData, show }: SupertrendOverlayProps) {
  useEffect(() => {
    if (!chart || supertrendData.length === 0) return;
    
    let supertrendSeries: ISeriesApi<'Line'> | null = null;
    
    if (show) {
      if (supertrendData.length > 0) {
        try {
          supertrendSeries = chart.addSeries(LineSeries, {
            lineWidth: 3,
            priceLineVisible: false,
            lastValueVisible: true,
            title: 'Supertrend',
          });
        } catch (e) {
          return;
        }
        
        const chartData = supertrendData.map(st => ({
          time: st.time as any,
          value: st.supertrend,
          color: st.direction === 'bullish' ? '#10b981' : '#ef4444'
        }));
        
        try {
          supertrendSeries.setData(chartData);
        } catch (e) {}
      }
    }
    
    return () => {
      if (supertrendSeries) {
        try {
          chart.removeSeries(supertrendSeries);
        } catch (e) {}
      }
    };
  }, [chart, supertrendData, show]);
  
  return null;
}
