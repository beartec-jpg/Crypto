import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Loader2, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';

interface OrderflowSignal {
  time: string;
  priceAction: 'rising' | 'declining' | 'neutral';
  oiDelta: number;
  oiChange: string;
  cvd: number;
  cvdTrend: 'positive' | 'negative' | 'neutral';
  fundingRate: number;
  fundingBias: 'bullish' | 'bearish' | 'neutral';
  lsRatio: number;
  signal: string;
  signalType: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell' | 'warning';
  strength: number;
  confidence: number;
}

interface ProfessionalOrderflowTableProps {
  symbol: string;
  interval: string;
  className?: string;
}

interface OrderflowData {
  error?: string;
  cvd?: { history: Array<{ timestamp: number; value: number }> };
  openInterest?: { history: Array<{ timestamp: number; value: number }> };
  fundingRate?: { history: Array<{ timestamp: number; value: number }> };
  longShortRatio?: { current: any };
}

export function ProfessionalOrderflowTable({ symbol, interval, className }: ProfessionalOrderflowTableProps) {
  const { data, isLoading, error } = useQuery<OrderflowData>({
    queryKey: [`/api/crypto/orderflow/professional/${symbol}/${interval}`],
    refetchInterval: 60000, // Refresh every minute
  });

  // Debug logging
  if (error) {
    console.error('❌ Professional Orderflow Table Error:', error);
  }
  if (data) {
    console.log('📊 Professional Orderflow Data:', data);
  }

  const generateSignal = (): OrderflowSignal | null => {
    if (!data || data.error) {
      console.warn('⚠️ No signal generated:', { hasData: !!data, error: data?.error });
      return null;
    }

    // Helper to extract value from various API response formats
    const extractValue = (item: any): number | null => {
      if (item == null) return null;
      
      // Handle normalized {timestamp, value} format from backend
      if (typeof item === 'object' && 'value' in item) {
        return item.value;
      }
      
      // Handle Coinalyze array format [timestamp, value]
      if (Array.isArray(item)) {
        return item.length >= 2 ? item[1] : null;
      }
      
      // Handle object with various property names (for current values and legacy formats)
      if (typeof item === 'object') {
        return item.v ?? 
               item.fr ?? 
               item.fundingRate ?? 
               item.oi ?? 
               item.openInterest ?? 
               item.longShortRatio ?? 
               item.ratio ?? 
               null;
      }
      
      // Handle raw number
      if (typeof item === 'number') return item;
      
      return null;
    };

    // Get history arrays for delta calculations
    // Backend now returns normalized {timestamp, value} objects pre-sorted chronologically
    // Still sort client-side as a safety measure
    const cvdHistory = (data.cvd?.history || [])
      .slice()
      .sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0));
    
    const oiHistory = (data.openInterest?.history || [])
      .slice()
      .sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0));
    
    const fundingHistory = (data.fundingRate?.history || [])
      .slice()
      .sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0));

    // Extract current and previous values using null checks (not falsy - to allow zero values)
    const cvdValue = cvdHistory.length > 0 ? extractValue(cvdHistory[cvdHistory.length - 1]) : null;
    const cvdPrevious = cvdHistory.length > 1 ? extractValue(cvdHistory[cvdHistory.length - 2]) : null;
    
    const oiValue = oiHistory.length > 0 ? extractValue(oiHistory[oiHistory.length - 1]) : null;
    const oiPrevious = oiHistory.length > 1 ? extractValue(oiHistory[oiHistory.length - 2]) : null;
    
    const fundingValue = fundingHistory.length > 0 ? extractValue(fundingHistory[fundingHistory.length - 1]) : null;
    
    const lsRatioCurrent = data.longShortRatio?.current;
    const lsRatioValue = extractValue(lsRatioCurrent) ?? 1.0;

    // Require at least OI and Funding to generate signals (CVD is optional)
    // Some symbols may not have CVD data available from Coinalyze
    if (oiValue == null || fundingValue == null) {
      return null;
    }

    // Check if we have sufficient historical data for delta calculations
    const hasHistoricalData = oiHistory.length >= 2 && fundingHistory.length >= 2;

    // Calculate real CVD delta (change from previous point)
    // CVD might not be available for all symbols, so handle null gracefully
    const cvdDelta = cvdValue != null && cvdPrevious != null ? (cvdValue - cvdPrevious) : (cvdValue ?? 0);
    const cvdTrend = cvdDelta > 0 ? 'positive' : cvdDelta < 0 ? 'negative' : 'neutral';
    
    // Calculate real OI delta (change from previous point)
    // On first load, OI delta will be 0 until we have historical data
    const oiDelta = oiPrevious != null ? (oiValue - oiPrevious) : 0;
    const oiChange = oiDelta > 0 ? '+rising' : oiDelta < 0 ? '-declining' : hasHistoricalData ? 'flat' : 'building...';
    
    // Determine funding bias
    const fundingBias = fundingValue > 0.01 ? 'bullish' : fundingValue < -0.01 ? 'bearish' : 'neutral';

    // Generate signal based on comprehensive confluence logic
    let signal = 'NEUTRAL';
    let signalType: OrderflowSignal['signalType'] = 'neutral';
    let strength = 50;
    let confidence = 50;

    // If CVD is available, use it for stronger signals
    const hasCVD = cvdValue != null;
    
    if (!hasHistoricalData) {
      // On first load - use single-point heuristics based on funding rate bias
      if (fundingValue < -0.02) {
        signal = 'BUILDING DATA (Bullish Bias)';
        signalType = 'buy';
        strength = 55;
        confidence = 40; // Lower confidence without historical context
      } else if (fundingValue > 0.02) {
        signal = 'BUILDING DATA (Bearish Bias)';
        signalType = 'sell';
        strength = 55;
        confidence = 40;
      } else {
        signal = 'BUILDING DATA';
        signalType = 'neutral';
        strength = 50;
        confidence = 30;
      }
    } else if (hasCVD) {
      // Strong Buy: Positive CVD delta + Rising OI delta + Neutral/Negative Funding
      if (cvdDelta > 0 && oiDelta > 0 && fundingValue <= 0.01) {
        signal = 'STRONG BUY';
        signalType = 'strong-buy';
        strength = 95;
        confidence = 90;
      }
      // Buy: Positive CVD delta
      else if (cvdDelta > 0) {
        signal = 'BUY';
        signalType = 'buy';
        strength = 75;
        confidence = 70;
      }
      // Strong Sell: Negative CVD delta + Rising OI delta + Neutral Funding
      else if (cvdDelta < 0 && oiDelta > 0 && Math.abs(fundingValue) < 0.01) {
        signal = 'STRONG SELL';
        signalType = 'strong-sell';
        strength = 90;
        confidence = 85;
      }
      // Sell: Negative CVD delta
      else if (cvdDelta < 0) {
        signal = 'SELL';
        signalType = 'sell';
        strength = 70;
        confidence = 65;
      }
    } else {
      // CVD not available - use OI and Funding for signals (lower confidence)
      // Buy: Rising OI + Negative Funding (accumulation phase)
      if (oiDelta > 0 && fundingValue < -0.01) {
        signal = 'BUY (No CVD)';
        signalType = 'buy';
        strength = 60;
        confidence = 50;
      }
      // Sell: Rising OI + Positive Funding (distribution phase)
      else if (oiDelta > 0 && fundingValue > 0.01) {
        signal = 'SELL (No CVD)';
        signalType = 'sell';
        strength = 60;
        confidence = 50;
      }
    }
    
    // Warning: High funding (overleveraged) - works regardless of CVD availability
    if (Math.abs(fundingValue) > 0.05) {
      signal = 'OVERLEVERAGED';
      signalType = 'warning';
      strength = 60;
      confidence = 55;
    }

    // Adjust confidence based on L/S ratio extremes
    if (lsRatioValue > 2.0 || lsRatioValue < 0.5) {
      confidence -= 10; // Extreme ratios reduce confidence
    }

    // Boost confidence when CVD and OI deltas align (only if CVD is available)
    if (hasCVD && ((cvdDelta > 0 && oiDelta > 0) || (cvdDelta < 0 && oiDelta < 0))) {
      confidence += 5;
    }

    return {
      time: new Date().toLocaleTimeString(),
      priceAction: 'neutral',
      oiDelta,
      oiChange,
      cvd: cvdValue ?? 0,
      cvdTrend,
      fundingRate: fundingValue,
      fundingBias,
      lsRatio: lsRatioValue,
      signal,
      signalType,
      strength,
      confidence: Math.min(100, confidence) // Cap at 100%
    };
  };

  const currentSignal = generateSignal();

  const getSignalColor = (type: OrderflowSignal['signalType']) => {
    switch (type) {
      case 'strong-buy': return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'buy': return 'bg-green-500/10 text-green-300 border-green-500/30';
      case 'neutral': return 'bg-gray-500/10 text-gray-300 border-gray-500/30';
      case 'sell': return 'bg-red-500/10 text-red-300 border-red-500/30';
      case 'strong-sell': return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'warning': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      default: return 'bg-gray-500/10 text-gray-300 border-gray-500/30';
    }
  };

  const getSignalIcon = (type: OrderflowSignal['signalType']) => {
    switch (type) {
      case 'strong-buy':
      case 'buy':
        return <TrendingUp className="w-4 h-4" />;
      case 'strong-sell':
      case 'sell':
        return <TrendingDown className="w-4 h-4" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <Card className={`p-6 bg-[#0d0d0d] border-slate-700 ${className}`}>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <span className="ml-3 text-slate-400">Loading professional orderflow data...</span>
        </div>
      </Card>
    );
  }

  if (error || !currentSignal) {
    return (
      <Card className={`p-6 bg-[#0d0d0d] border-slate-700 ${className}`}>
        <div className="text-center py-8">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
          <p className="text-slate-400">Unable to load orderflow data</p>
          <p className="text-slate-500 text-sm mt-2">
            {error ? `API Error: ${error instanceof Error ? error.message : 'Unknown error'}` : 'Insufficient data - waiting for history to build'}
          </p>
          {data && !currentSignal && (
            <details className="mt-4 text-left text-xs text-slate-600">
              <summary className="cursor-pointer hover:text-slate-400">Debug Info</summary>
              <pre className="mt-2 p-2 bg-slate-900 rounded overflow-auto max-h-40">
                {JSON.stringify({
                  hasCVD: !!data.cvd,
                  hasOI: !!data.openInterest,
                  hasFunding: !!data.fundingRate,
                  cvdHistoryLength: data.cvd?.history?.length || 0,
                  oiHistoryLength: data.openInterest?.history?.length || 0,
                  fundingHistoryLength: data.fundingRate?.history?.length || 0
                }, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className={`bg-[#0d0d0d] border-slate-700 overflow-hidden ${className}`} data-testid="card-professional-orderflow">
      {/* Header */}
      <div className="bg-[#1a1a1a] px-6 py-4 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white font-mono" data-testid="text-orderflow-title">
              Professional Orderflow Analysis
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              {symbol} · {interval} · Real-time market structure
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Live
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#1a1a1a] border-b border-slate-700">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Time</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">OI Delta</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">CVD</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Funding</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">L/S Ratio</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">Signal</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Strength</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-800 hover:bg-slate-900/30 transition-colors" data-testid="row-orderflow-signal">
              {/* Time */}
              <td className="px-4 py-4 text-sm text-slate-300 font-mono" data-testid="text-signal-time">
                {currentSignal.time}
              </td>

              {/* OI Delta */}
              <td className={`px-4 py-4 text-right font-mono text-sm font-semibold ${
                currentSignal.oiDelta > 0 ? 'text-green-400' : 'text-red-400'
              }`} data-testid="text-oi-delta">
                {currentSignal.oiChange}
              </td>

              {/* CVD */}
              <td className={`px-4 py-4 text-right font-mono text-sm font-semibold ${
                currentSignal.cvdTrend === 'positive' ? 'text-green-400' : 
                currentSignal.cvdTrend === 'negative' ? 'text-red-400' : 'text-slate-400'
              }`} data-testid="text-cvd">
                {currentSignal.cvd != null ? (
                  currentSignal.cvdTrend === 'positive' ? `+${Math.abs(currentSignal.cvd).toFixed(0)}` :
                  currentSignal.cvdTrend === 'negative' ? `-${Math.abs(currentSignal.cvd).toFixed(0)}` :
                  currentSignal.cvd.toFixed(0)
                ) : 'N/A'}
              </td>

              {/* Funding Rate */}
              <td className={`px-4 py-4 text-right font-mono text-sm font-semibold ${
                currentSignal.fundingRate > 0.01 ? 'text-green-400' : 
                currentSignal.fundingRate < -0.01 ? 'text-red-400' : 'text-slate-400'
              }`} data-testid="text-funding-rate">
                {(currentSignal.fundingRate * 100).toFixed(3)}%
              </td>

              {/* L/S Ratio */}
              <td className={`px-4 py-4 text-right font-mono text-sm font-semibold ${
                currentSignal.lsRatio > 1 ? 'text-green-400' : 
                currentSignal.lsRatio < 1 ? 'text-red-400' : 'text-slate-400'
              }`} data-testid="text-ls-ratio">
                {currentSignal.lsRatio.toFixed(2)}
              </td>

              {/* Signal Badge */}
              <td className="px-4 py-4" data-testid="badge-signal">
                <div className="flex items-center justify-center">
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border font-semibold text-xs uppercase tracking-wide ${getSignalColor(currentSignal.signalType)}`}>
                    {getSignalIcon(currentSignal.signalType)}
                    {currentSignal.signal}
                  </div>
                </div>
              </td>

              {/* Strength Bar */}
              <td className="px-4 py-4" data-testid="bar-signal-strength">
                <div className="flex items-center justify-end gap-3">
                  <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        currentSignal.signalType === 'strong-buy' || currentSignal.signalType === 'buy'
                          ? 'bg-gradient-to-r from-green-600 to-green-400'
                          : currentSignal.signalType === 'strong-sell' || currentSignal.signalType === 'sell'
                          ? 'bg-gradient-to-r from-red-600 to-red-400'
                          : currentSignal.signalType === 'warning'
                          ? 'bg-gradient-to-r from-yellow-600 to-yellow-400'
                          : 'bg-gradient-to-r from-gray-600 to-gray-400'
                      }`}
                      style={{ width: `${currentSignal.strength}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono text-slate-400 min-w-[3rem] text-right">
                    {currentSignal.strength}%
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer with metadata */}
      <div className="bg-[#1a1a1a] px-6 py-3 border-t border-slate-700">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4 text-slate-500">
            <span>Confidence: <span className="text-slate-400 font-semibold">{currentSignal.confidence}%</span></span>
            <span>•</span>
            <span>Sources: Coinalyze + Coinglass</span>
          </div>
          <div className="text-slate-500">
            Updated: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>
    </Card>
  );
}
