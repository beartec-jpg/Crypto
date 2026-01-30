import { useEffect, useRef } from 'react';
import { IChartApi, LineSeries, ISeriesApi } from 'lightweight-charts';

interface VWAPOverlayProps {
  chart: IChartApi | null;
  vwapData: any[];
  show: boolean;
}

export function VWAPOverlay({ chart, vwapData, show }: VWAPOverlayProps) {
  const vwapBandsUpperRef = useRef<ISeriesApi<'Line'> | null>(null);
  const vwapBandsLowerRef = useRef<ISeriesApi<'Line'> | null>(null);

  useEffect(() => {
    if (!chart || vwapData.length === 0) return;
    
    if (show) {
      if (vwapData.length > 0) {
        if (!vwapBandsUpperRef.current) {
          try {
            vwapBandsUpperRef.current = chart.addSeries(LineSeries, {
              color: '#3b82f6',
              lineWidth: 1,
              lineStyle: 2,
              priceLineVisible: false,
              lastValueVisible: true,
              title: 'VWAP Upper',
            });
          } catch (e) {
            return;
          }
        }
        
        if (!vwapBandsLowerRef.current) {
          try {
            vwapBandsLowerRef.current = chart.addSeries(LineSeries, {
              color: '#3b82f6',
              lineWidth: 1,
              lineStyle: 2,
              priceLineVisible: false,
              lastValueVisible: true,
              title: 'VWAP Lower',
            });
          } catch (e) {
            return;
          }
        }
        
        const upperData = vwapData.map(b => ({ time: b.time as any, value: b.upper }));
        const lowerData = vwapData.map(b => ({ time: b.time as any, value: b.lower }));
        
        try {
          vwapBandsUpperRef.current.setData(upperData);
          vwapBandsLowerRef.current.setData(lowerData);
        } catch (e) {}
      }
    }
    
    return () => {
      if (vwapBandsUpperRef.current) {
        try {
          chart.removeSeries(vwapBandsUpperRef.current);
        } catch (e) {}
        vwapBandsUpperRef.current = null;
      }
      if (vwapBandsLowerRef.current) {
        try {
          chart.removeSeries(vwapBandsLowerRef.current);
        } catch (e) {}
        vwapBandsLowerRef.current = null;
      }
    };
  }, [chart, vwapData, show]);
  
  return null;
}
