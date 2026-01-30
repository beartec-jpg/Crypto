import { useEffect, useRef } from 'react';
import { IChartApi, LineSeries, ISeriesApi } from 'lightweight-charts';

interface SessionVWAPOverlayProps {
  chart: IChartApi | null;
  asiaVWAP: any[];
  londonVWAP: any[];
  nyVWAP: any[];
  show: boolean;
}

export function SessionVWAPOverlay({ chart, asiaVWAP, londonVWAP, nyVWAP, show }: SessionVWAPOverlayProps) {
  const sessionVWAPAsiaRef = useRef<ISeriesApi<'Line'> | null>(null);
  const sessionVWAPLondonRef = useRef<ISeriesApi<'Line'> | null>(null);
  const sessionVWAPNYRef = useRef<ISeriesApi<'Line'> | null>(null);

  useEffect(() => {
    if (!chart) return;
    
    if (show) {
      if (asiaVWAP.length > 0 && !sessionVWAPAsiaRef.current) {
        try {
          sessionVWAPAsiaRef.current = chart.addSeries(LineSeries, {
            color: '#f59e0b',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            title: 'Asia VWAP',
          });
          const data = asiaVWAP.map(d => ({ time: d.time as any, value: d.value }));
          sessionVWAPAsiaRef.current.setData(data);
        } catch (e) {}
      }
      
      if (londonVWAP.length > 0 && !sessionVWAPLondonRef.current) {
        try {
          sessionVWAPLondonRef.current = chart.addSeries(LineSeries, {
            color: '#3b82f6',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            title: 'London VWAP',
          });
          const data = londonVWAP.map(d => ({ time: d.time as any, value: d.value }));
          sessionVWAPLondonRef.current.setData(data);
        } catch (e) {}
      }
      
      if (nyVWAP.length > 0 && !sessionVWAPNYRef.current) {
        try {
          sessionVWAPNYRef.current = chart.addSeries(LineSeries, {
            color: '#10b981',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            title: 'NY VWAP',
          });
          const data = nyVWAP.map(d => ({ time: d.time as any, value: d.value }));
          sessionVWAPNYRef.current.setData(data);
        } catch (e) {}
      }
    }
    
    return () => {
      [sessionVWAPAsiaRef, sessionVWAPLondonRef, sessionVWAPNYRef].forEach(ref => {
        if (ref.current) {
          try {
            chart.removeSeries(ref.current);
          } catch (e) {}
          ref.current = null;
        }
      });
    };
  }, [chart, asiaVWAP, londonVWAP, nyVWAP, show]);
  
  return null;
}
