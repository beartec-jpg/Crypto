import { useEffect, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, TrendingUp, TrendingDown, Activity, Layers, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface LiquidationEvent {
  symbol: string;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  timestamp: number;
  exchange: 'binance' | 'bybit';
}

interface HeatmapData {
  price: number;
  longs: number;
  shorts: number;
  totalVolume: number;
  netSide: 'long' | 'short';
  exchanges: string[];
}

interface RealtimeLiquidationData {
  symbol: string;
  exchange: string;
  timestamp: number;
  events: LiquidationEvent[];
  heatmap: HeatmapData[];
  totalEvents: number;
  recentCount: number;
  exchangeStats: {
    binance: number;
    bybit: number;
  };
}

interface PredictedLiquidationData {
  symbol: string;
  interval: string;
  source: string;
  timestamp: number;
  priceList: number[];
  liquidationMatrix: number[][];
}

interface LiquidationChartProps {
  symbol: string;
  currentPrice?: number;
}

export function LiquidationChart({ symbol, currentPrice }: LiquidationChartProps) {
  const { toast } = useToast();
  const [limit, setLimit] = useState<100 | 200 | 500>(200);
  const [exchange, setExchange] = useState<'all' | 'binance' | 'bybit'>('all');
  const [showPredicted, setShowPredicted] = useState(true);
  const [predictedInterval, setPredictedInterval] = useState<'4h' | '12h' | '24h'>('4h');
  const [spikeAlerts, setSpikeAlerts] = useState<string[]>([]);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const lastAlertTimeRef = useRef<number>(0);

  const { data: realtimeData, isLoading: realtimeLoading, error: realtimeError } = useQuery<RealtimeLiquidationData>({
    queryKey: [`/api/crypto/liquidations/realtime?symbol=${symbol}&limit=${limit}&exchange=${exchange}`],
    refetchInterval: 10 * 1000,
    enabled: !!symbol
  });

  const { data: predictedData } = useQuery<PredictedLiquidationData>({
    queryKey: [`/api/crypto/liquidations/predicted?symbol=${symbol}&interval=${predictedInterval}`],
    refetchInterval: 5 * 60 * 1000,
    enabled: !!symbol && showPredicted
  });

  const totalLongs = realtimeData?.events.filter(e => e.side === 'SELL').reduce((sum, e) => sum + e.quantity, 0) || 0;
  const totalShorts = realtimeData?.events.filter(e => e.side === 'BUY').reduce((sum, e) => sum + e.quantity, 0) || 0;
  const totalVolume = totalLongs + totalShorts;

  const longsPercentage = totalVolume > 0 ? (totalLongs / totalVolume) * 100 : 50;
  const shortsPercentage = totalVolume > 0 ? (totalShorts / totalVolume) * 100 : 50;

  const mostRecentLiquidation = realtimeData?.events[realtimeData.events.length - 1];
  const timeSinceLastLiquidation = mostRecentLiquidation 
    ? Math.floor((Date.now() - mostRecentLiquidation.timestamp) / 1000)
    : null;

  // Calculate max volumes for color scaling
  const maxVolume = Math.max(...(realtimeData?.heatmap.map(h => h.totalVolume) || [1]));

  // Process predicted liquidation data for overlay
  const predictedZones = predictedData?.priceList?.map((price, idx) => {
    const rowData = predictedData.liquidationMatrix[idx] || [];
    const totalPredicted = rowData.reduce((sum, val) => sum + (val || 0), 0);
    return {
      price,
      volume: totalPredicted,
      intensity: totalPredicted
    };
  }).filter(z => z.volume > 0) || [];

  const maxPredictedVolume = Math.max(...(predictedZones.map(z => z.volume) || [1]));

  // Find confluence zones (where actual liquidations happened in predicted zones)
  const confluenceZones = realtimeData?.heatmap.filter(actual => {
    return predictedZones.some(predicted => 
      Math.abs(predicted.price - actual.price) / actual.price < 0.02 // Within 2%
    );
  }) || [];

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Spike detection - alert when large liquidations hit predicted zones
  useEffect(() => {
    if (!realtimeData || !predictedZones.length || !showPredicted) return;

    const now = Date.now();
    // Only check every 30 seconds to avoid spam
    if (now - lastAlertTimeRef.current < 30000) return;

    // Check recent events (last 60 seconds)
    const recentEvents = realtimeData.events.filter(e => 
      now - e.timestamp < 60000
    );

    // Aggregate volume by price level in predicted zones
    const spikeZones = new Map<number, number>();
    
    recentEvents.forEach(event => {
      const matchedPredicted = predictedZones.find(p => 
        Math.abs(p.price - event.price) / event.price < 0.02
      );
      
      if (matchedPredicted && event.quantity > 50) { // Significant liquidation
        const key = Math.round(event.price);
        spikeZones.set(key, (spikeZones.get(key) || 0) + event.quantity);
      }
    });

    // Alert on large spikes
    const alerts: string[] = [];
    spikeZones.forEach((volume, price) => {
      if (volume > 200) { // Large volume threshold
        alerts.push(`$${price.toFixed(2)}`);
      }
    });

    if (alerts.length > 0) {
      lastAlertTimeRef.current = now;
      setSpikeAlerts(alerts);
      
      // Show toast notification
      toast({
        title: "🚨 Liquidation Spike Detected!",
        description: `Heavy liquidations at predicted zones: ${alerts.join(', ')}`,
        variant: "destructive",
      });

      // Browser notification (if permitted)
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Liquidation Spike Alert', {
          body: `Heavy liquidations hitting predicted zones at ${alerts.join(', ')}`,
          icon: '/favicon.ico',
        });
      }
    }
  }, [realtimeData, predictedZones, showPredicted, toast]);

  return (
    <Card className="bg-[#1a1a1a] border-[#2a2e39] p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div>
          <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#00c4b4]" />
            Liquidation Tracker
          </h3>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            Real-time + predicted liquidation levels • Multi-exchange
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={() => setLimit(100)}
            className={`text-xs ${
              limit === 100
                ? 'bg-[#00c4b4] text-black hover:bg-[#00a89c]'
                : 'bg-[#2a2e39] text-gray-400 hover:bg-[#3a3e49]'
            }`}
            data-testid="limit-100"
          >
            100
          </Button>
          <Button
            onClick={() => setLimit(200)}
            className={`text-xs ${
              limit === 200
                ? 'bg-[#00c4b4] text-black hover:bg-[#00a89c]'
                : 'bg-[#2a2e39] text-gray-400 hover:bg-[#3a3e49]'
            }`}
            data-testid="limit-200"
          >
            200
          </Button>
          <Button
            onClick={() => setLimit(500)}
            className={`text-xs ${
              limit === 500
                ? 'bg-[#00c4b4] text-black hover:bg-[#00a89c]'
                : 'bg-[#2a2e39] text-gray-400 hover:bg-[#3a3e49]'
            }`}
            data-testid="limit-500"
          >
            500
          </Button>
        </div>
      </div>

      {/* Exchange Selector */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <Button
          onClick={() => setExchange('all')}
          className={`text-xs ${
            exchange === 'all'
              ? 'bg-purple-600 text-white hover:bg-purple-700'
              : 'bg-[#2a2e39] text-gray-400 hover:bg-[#3a3e49]'
          }`}
          data-testid="exchange-all"
        >
          All Exchanges
        </Button>
        <Button
          onClick={() => setExchange('binance')}
          className={`text-xs ${
            exchange === 'binance'
              ? 'bg-yellow-600 text-white hover:bg-yellow-700'
              : 'bg-[#2a2e39] text-gray-400 hover:bg-[#3a3e49]'
          }`}
          data-testid="exchange-binance"
        >
          Binance ({realtimeData?.exchangeStats.binance || 0})
        </Button>
        <Button
          onClick={() => setExchange('bybit')}
          className={`text-xs ${
            exchange === 'bybit'
              ? 'bg-orange-600 text-white hover:bg-orange-700'
              : 'bg-[#2a2e39] text-gray-400 hover:bg-[#3a3e49]'
          }`}
          data-testid="exchange-bybit"
        >
          Bybit ({realtimeData?.exchangeStats.bybit || 0})
        </Button>

        <div className="ml-auto flex gap-2">
          <Button
            onClick={() => setShowPredicted(!showPredicted)}
            className={`text-xs flex items-center gap-1 ${
              showPredicted
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-[#2a2e39] text-gray-400 hover:bg-[#3a3e49]'
            }`}
            data-testid="toggle-predicted"
          >
            <Layers className="w-3 h-3" />
            Predicted Zones
          </Button>
        </div>
      </div>

      {showPredicted && (
        <div className="flex gap-2 mb-4">
          <span className="text-xs text-gray-400 self-center">Predicted Interval:</span>
          <Button
            onClick={() => setPredictedInterval('4h')}
            className={`text-xs ${
              predictedInterval === '4h'
                ? 'bg-blue-600 text-white'
                : 'bg-[#2a2e39] text-gray-400 hover:bg-[#3a3e49]'
            }`}
          >
            4h
          </Button>
          <Button
            onClick={() => setPredictedInterval('12h')}
            className={`text-xs ${
              predictedInterval === '12h'
                ? 'bg-blue-600 text-white'
                : 'bg-[#2a2e39] text-gray-400 hover:bg-[#3a3e49]'
            }`}
          >
            12h
          </Button>
          <Button
            onClick={() => setPredictedInterval('24h')}
            className={`text-xs ${
              predictedInterval === '24h'
                ? 'bg-blue-600 text-white'
                : 'bg-[#2a2e39] text-gray-400 hover:bg-[#3a3e49]'
            }`}
          >
            24h
          </Button>
        </div>
      )}

      {realtimeLoading && (
        <div className="flex items-center justify-center h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-[#00c4b4]" />
        </div>
      )}

      {realtimeError && (
        <div className="flex flex-col items-center justify-center h-[400px] text-red-400">
          <p>Failed to load liquidation data</p>
          <p className="text-sm text-gray-500 mt-2">{(realtimeError as Error).message}</p>
        </div>
      )}

      {!realtimeLoading && !realtimeError && realtimeData && (
        <>
          {/* Live Status */}
          {timeSinceLastLiquidation !== null && (
            <div className="mb-4 p-3 bg-green-900/20 border border-green-600/30 rounded-lg">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <p className="text-sm text-green-200">
                  <span className="font-semibold">Live Stream Active</span> • Last liquidation{' '}
                  <span className="font-mono">{timeSinceLastLiquidation}s</span> ago
                  {mostRecentLiquidation && (
                    <span>
                      {' '}• {mostRecentLiquidation.exchange.toUpperCase()} •{' '}
                      {mostRecentLiquidation.side === 'SELL' ? 'Long' : 'Short'} @ ${mostRecentLiquidation.price.toFixed(2)}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Confluence Detection */}
          {confluenceZones.length > 0 && showPredicted && (
            <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-600/30 rounded-lg">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-yellow-500" />
                <p className="text-sm text-yellow-200">
                  <span className="font-semibold">⚠️ Confluence Detected!</span> {confluenceZones.length} actual liquidation{confluenceZones.length > 1 ? 's' : ''} in predicted zones
                </p>
              </div>
            </div>
          )}

          {/* Spike Alerts */}
          {spikeAlerts.length > 0 && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-600/50 rounded-lg animate-pulse">
              <div className="flex items-center gap-2 flex-wrap">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <p className="text-sm text-red-200">
                  <span className="font-bold">🚨 LIQUIDATION SPIKE DETECTED!</span> Heavy volume at: {spikeAlerts.join(', ')}
                </p>
              </div>
            </div>
          )}

          {/* Long vs Short Ratio */}
          <div className="mb-4 p-4 bg-[#0e0e0e] rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-[#ff3b69]" />
                <span className="text-sm font-semibold text-[#ff3b69]">Longs Liquidated</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[#00c4b4]">Shorts Liquidated</span>
                <TrendingUp className="w-4 h-4 text-[#00c4b4]" />
              </div>
            </div>
            
            <div className="relative h-6 bg-[#1a1a1a] rounded-full overflow-hidden mb-2">
              <div
                className="absolute left-0 top-0 h-full bg-[#ff3b69] transition-all duration-500"
                style={{ width: `${longsPercentage}%` }}
              ></div>
              <div
                className="absolute right-0 top-0 h-full bg-[#00c4b4] transition-all duration-500"
                style={{ width: `${shortsPercentage}%` }}
              ></div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">{longsPercentage.toFixed(1)}%</span>
              <span className="text-gray-400">{shortsPercentage.toFixed(1)}%</span>
            </div>
          </div>

          {/* Heatmap Visualization - Price Levels on Y-axis */}
          <div ref={chartContainerRef} className="w-full mb-4 bg-[#0e0e0e] rounded-lg p-4">
            <div className="text-sm font-semibold text-gray-300 mb-3">Liquidation Heatmap (Price Levels)</div>
            
            <div className="space-y-1">
              {realtimeData.heatmap.slice().reverse().map((level, idx) => {
                const volumeRatio = level.totalVolume / maxVolume;
                const isConfluence = confluenceZones.some(c => c.price === level.price);
                
                // Check if predicted zone exists at this price
                const predictedAtPrice = predictedZones.find(p => 
                  Math.abs(p.price - level.price) / level.price < 0.02
                );
                const predictedRatio = predictedAtPrice ? predictedAtPrice.volume / maxPredictedVolume : 0;

                return (
                  <div key={idx} className="flex items-center gap-2">
                    {/* Price Level */}
                    <div className="w-20 text-xs font-mono text-gray-400 text-right">
                      ${level.price.toFixed(2)}
                    </div>

                    {/* Predicted Zone Overlay (if enabled) */}
                    <div className="flex-1 relative h-6">
                      {showPredicted && predictedAtPrice && (
                        <div
                          className="absolute left-0 top-0 h-full bg-blue-600/20 border border-blue-500/30 rounded"
                          style={{ width: `${Math.max(10, predictedRatio * 100)}%` }}
                        />
                      )}

                      {/* Actual Liquidations */}
                      <div className="relative h-full flex gap-0.5">
                        {/* Longs */}
                        <div
                          className={`h-full rounded-l transition-all ${
                            isConfluence ? 'bg-yellow-500' : 'bg-[#ff3b69]'
                          }`}
                          style={{ 
                            width: `${(level.longs / level.totalVolume) * volumeRatio * 100}%`,
                            minWidth: level.longs > 0 ? '2px' : '0'
                          }}
                          title={`Longs: ${level.longs.toFixed(2)}`}
                        />
                        
                        {/* Shorts */}
                        <div
                          className={`h-full rounded-r transition-all ${
                            isConfluence ? 'bg-yellow-300' : 'bg-[#00c4b4]'
                          }`}
                          style={{ 
                            width: `${(level.shorts / level.totalVolume) * volumeRatio * 100}%`,
                            minWidth: level.shorts > 0 ? '2px' : '0'
                          }}
                          title={`Shorts: ${level.shorts.toFixed(2)}`}
                        />
                      </div>
                    </div>

                    {/* Volume */}
                    <div className="w-16 text-xs font-mono text-gray-500 text-right">
                      {level.totalVolume.toFixed(1)}
                    </div>

                    {/* Exchange badges */}
                    <div className="w-12 flex gap-1">
                      {level.exchanges.includes('binance') && (
                        <div className="w-2 h-2 rounded-full bg-yellow-500" title="Binance" />
                      )}
                      {level.exchanges.includes('bybit') && (
                        <div className="w-2 h-2 rounded-full bg-orange-500" title="Bybit" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-[#ff3b69]"></div>
              <span className="text-gray-400">Longs Liquidated</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-[#00c4b4]"></div>
              <span className="text-gray-400">Shorts Liquidated</span>
            </div>
            {showPredicted && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-blue-600/30 border border-blue-500"></div>
                <span className="text-gray-400">Predicted Zone</span>
              </div>
            )}
            {confluenceZones.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-yellow-500"></div>
                <span className="text-gray-400">Confluence</span>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
            <div className="bg-[#0e0e0e] p-3 rounded-lg">
              <div className="text-xs text-gray-400">Total Events</div>
              <div className="text-lg font-bold text-white">{realtimeData.totalEvents}</div>
            </div>
            <div className="bg-[#0e0e0e] p-3 rounded-lg">
              <div className="text-xs text-gray-400">Showing</div>
              <div className="text-lg font-bold text-[#00c4b4]">{realtimeData.recentCount}</div>
            </div>
            <div className="bg-[#0e0e0e] p-3 rounded-lg">
              <div className="text-xs text-gray-400">Total Volume</div>
              <div className="text-lg font-bold text-white">{totalVolume.toFixed(2)}</div>
            </div>
            <div className="bg-[#0e0e0e] p-3 rounded-lg">
              <div className="text-xs text-gray-400">Price Levels</div>
              <div className="text-lg font-bold text-purple-400">{realtimeData.heatmap.length}</div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
