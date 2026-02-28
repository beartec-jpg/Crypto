import { useEffect, useRef, useMemo } from 'react';
import { IChartApi, LineSeries, ISeriesApi } from 'lightweight-charts';
import { calculatePeriodicVWAP, calculateRollingVWAP } from '@/lib/calculations/vwapCalculations';
import type { CandleData } from '@/types/chart.types';

interface VWAPRendererProps {
  chart: IChartApi | null;
  candles: CandleData[];
  showSession: boolean;
  showDaily: boolean;
  showWeekly: boolean;
  showMonthly: boolean;
  showRolling: boolean;
  rollingPeriod: number;
}

type VWAPKey = 'session' | 'daily' | 'weekly' | 'monthly' | 'rolling';

const VWAP_CONFIGS: Array<{
  key: VWAPKey;
  color: string;
  title: string;
}> = [
  { key: 'session', color: '#a78bfa', title: 'Session VWAP' },
  { key: 'daily',   color: '#fb923c', title: 'Daily VWAP' },
  { key: 'weekly',  color: '#10b981', title: 'Weekly VWAP' },
  { key: 'monthly', color: '#3b82f6', title: 'Monthly VWAP' },
  { key: 'rolling', color: '#ec4899', title: 'Rolling VWAP' },
];

export function VWAPRenderer({
  chart,
  candles,
  showSession,
  showDaily,
  showWeekly,
  showMonthly,
  showRolling,
  rollingPeriod,
}: VWAPRendererProps) {
  const seriesRefs = useRef<Partial<Record<VWAPKey, ISeriesApi<'Line'>>>>({});

  const dailyData   = useMemo(() => (showSession || showDaily)  ? calculatePeriodicVWAP(candles, 'daily',   true) : [], [candles, showSession, showDaily]);
  const weeklyData  = useMemo(() => showWeekly  ? calculatePeriodicVWAP(candles, 'weekly',  true) : [], [candles, showWeekly]);
  const monthlyData = useMemo(() => showMonthly ? calculatePeriodicVWAP(candles, 'monthly', true) : [], [candles, showMonthly]);
  const rollingData = useMemo(() => showRolling ? calculateRollingVWAP(candles, rollingPeriod)    : [], [candles, showRolling, rollingPeriod]);

  useEffect(() => {
    if (!chart) return;

    const shows: Record<VWAPKey, boolean> = {
      session: showSession,
      daily:   showDaily,
      weekly:  showWeekly,
      monthly: showMonthly,
      rolling: showRolling,
    };

    const dataMap: Record<VWAPKey, { time: any; value: number }[]> = {
      session: dailyData.map(d => ({ time: d.time as any, value: d.value })),
      daily:   dailyData.map(d => ({ time: d.time as any, value: d.value })),
      weekly:  weeklyData.map(d => ({ time: d.time as any, value: d.value })),
      monthly: monthlyData.map(d => ({ time: d.time as any, value: d.value })),
      rolling: rollingData.map(d => ({ time: d.time as any, value: d.value })),
    };

    for (const cfg of VWAP_CONFIGS) {
      const show = shows[cfg.key];
      const data = dataMap[cfg.key];
      const title = cfg.key === 'rolling' ? `rVWAP(${rollingPeriod})` : cfg.title;

      if (show && data.length > 0) {
        if (!seriesRefs.current[cfg.key]) {
          try {
            seriesRefs.current[cfg.key] = chart.addSeries(LineSeries, {
              color: cfg.color,
              lineWidth: 2,
              priceLineVisible: false,
              lastValueVisible: true,
              title,
            });
          } catch {
            continue;
          }
        }
        try {
          seriesRefs.current[cfg.key]!.setData(data);
          seriesRefs.current[cfg.key]!.applyOptions({ title });
        } catch {
          // series may be disposed
        }
      } else if (!show && seriesRefs.current[cfg.key]) {
        try {
          chart.removeSeries(seriesRefs.current[cfg.key]!);
        } catch {
          // series may already be disposed
        }
        delete seriesRefs.current[cfg.key];
      }
    }
  }, [chart, showSession, showDaily, showWeekly, showMonthly, showRolling, rollingPeriod, dailyData, weeklyData, monthlyData, rollingData]);

  // Cleanup all series on unmount
  useEffect(() => {
    return () => {
      if (!chart) return;
      for (const key of Object.keys(seriesRefs.current) as VWAPKey[]) {
        try {
          chart.removeSeries(seriesRefs.current[key]!);
        } catch {
          // ignore
        }
      }
      seriesRefs.current = {};
    };
  }, [chart]);

  return null;
}
