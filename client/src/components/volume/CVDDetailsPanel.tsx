import { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface CVDData {
  time: string;
  timestamp: number;
  delta: number;
  cumDelta: number;
  isBull: boolean;
  volume: number;
}

interface CVDDetailsPanelProps {
  data: CVDData[];
  className?: string;
}

/**
 * CVD Details Panel - displays a simplified CVD analysis summary
 * Created for Phase 4G-11 as a reusable component for displaying CVD metrics
 * 
 * This is different from CVDTable - it shows a summary overview rather than the full table
 */
export function CVDDetailsPanel({ data, className = '' }: CVDDetailsPanelProps) {
  const analysis = useMemo(() => {
    if (data.length === 0) {
      return {
        latestCVD: 0,
        buyVolume: 0,
        sellVolume: 0,
        totalVolume: 0,
        buyPercent: 0,
        sellPercent: 0,
        trend: 'neutral' as 'bullish' | 'bearish' | 'neutral'
      };
    }

    const latestCVD = data[data.length - 1]?.cumDelta || 0;
    const buyVolume = data.reduce((sum, item) => item.delta > 0 ? sum + item.volume : sum, 0);
    const sellVolume = data.reduce((sum, item) => item.delta < 0 ? sum + item.volume : sum, 0);
    const totalVolume = buyVolume + sellVolume;
    const buyPercent = totalVolume > 0 ? (buyVolume / totalVolume) * 100 : 0;
    const sellPercent = totalVolume > 0 ? (sellVolume / totalVolume) * 100 : 0;
    
    // Determine trend based on recent CVD movement
    const recentData = data.slice(-10);
    const cvdChange = recentData.length > 1 
      ? recentData[recentData.length - 1].cumDelta - recentData[0].cumDelta 
      : 0;
    const trend = cvdChange > 0 ? 'bullish' : cvdChange < 0 ? 'bearish' : 'neutral';

    return {
      latestCVD,
      buyVolume,
      sellVolume,
      totalVolume,
      buyPercent,
      sellPercent,
      trend
    };
  }, [data]);

  const formatVolume = (volume: number): string => {
    if (volume >= 1e9) return `${(volume / 1e9).toFixed(2)}B`;
    if (volume >= 1e6) return `${(volume / 1e6).toFixed(2)}M`;
    if (volume >= 1e3) return `${(volume / 1e3).toFixed(2)}K`;
    return volume.toFixed(2);
  };

  return (
    <div className={`bg-slate-900 rounded-lg p-4 space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <span>📊</span>
          CVD Analysis
        </h3>
        <div className="flex items-center gap-1 text-xs">
          {analysis.trend === 'bullish' ? (
            <span className="text-green-400 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Bullish
            </span>
          ) : analysis.trend === 'bearish' ? (
            <span className="text-red-400 flex items-center gap-1">
              <TrendingDown className="h-3 w-3" />
              Bearish
            </span>
          ) : (
            <span className="text-gray-400">Neutral</span>
          )}
        </div>
      </div>

      {/* Current CVD */}
      <div className="bg-slate-800 p-3 rounded">
        <div className="text-xs text-gray-400 mb-1">Cumulative Volume Delta</div>
        <div className={`text-2xl font-bold ${analysis.latestCVD >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {analysis.latestCVD >= 0 ? '+' : ''}{formatVolume(analysis.latestCVD)}
        </div>
      </div>

      {/* Volume Distribution */}
      <div className="space-y-2">
        <div className="text-xs text-gray-400">Volume Distribution</div>
        
        {/* Visual bar */}
        <div className="flex gap-1 h-6 rounded overflow-hidden">
          {analysis.buyPercent > 0 && (
            <div
              className="bg-green-600 flex items-center justify-center text-[10px] font-medium text-white"
              style={{ width: `${analysis.buyPercent}%` }}
            >
              {analysis.buyPercent > 15 && `${analysis.buyPercent.toFixed(0)}%`}
            </div>
          )}
          {analysis.sellPercent > 0 && (
            <div
              className="bg-red-600 flex items-center justify-center text-[10px] font-medium text-white"
              style={{ width: `${analysis.sellPercent}%` }}
            >
              {analysis.sellPercent > 15 && `${analysis.sellPercent.toFixed(0)}%`}
            </div>
          )}
        </div>

        {/* Volume values */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-slate-800 p-2 rounded">
            <div className="text-gray-400">Buy Volume</div>
            <div className="text-green-400 font-medium">
              {formatVolume(analysis.buyVolume)}
            </div>
          </div>
          <div className="bg-slate-800 p-2 rounded">
            <div className="text-gray-400">Sell Volume</div>
            <div className="text-red-400 font-medium">
              {formatVolume(analysis.sellVolume)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
