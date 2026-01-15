import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useAdaptiveTimeframe } from '@/hooks/useAdaptiveTimeframe';
import type { TimeframeInterval } from '@/types/timeframes';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { CryptoNavigation } from '@/components/CryptoNavigation';
import { usePageViewTracking } from '@/hooks/useAnalytics';
import { useCryptoAuth } from '@/hooks/useCryptoAuth';
import { RefreshCw } from 'lucide-react';

const INTERVALS = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '4h', value: '4h' },
  { label: '1d', value: '1d' },
];

const SYMBOLS = [
  { label: 'XRPUSDT', value: 'XRPUSDT' },
  { label: 'BTCUSDT', value: 'BTCUSDT' },
  { label: 'ETHUSDT', value: 'ETHUSDT' },
  { label: 'SOLUSDT', value: 'SOLUSDT' },
];

export default function CryptoSandbox() {
  const { isAuthenticated, isLoading: authLoading } = useCryptoAuth();
  usePageViewTracking('crypto-sandbox');

  // State declarations
  const [symbol, setSymbol] = useState<string>('XRPUSDT');
  const [interval, setInterval] = useState<TimeframeInterval>('1h');
  const [data, setData] = useState<any[]>([]);
  const [innerWidth, setInnerWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1000);
  const [loading, setLoading] = useState(false);

  // Window resize handler
  useEffect(() => {
    const handleResize = () => {
      setInnerWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Adaptive timeframe hook - CORRECTLY placed inside component after all state
  const adaptiveTimeframe = useAdaptiveTimeframe({
    symbol: symbol || 'XRPUSDT',
    baseTimeframe: interval as TimeframeInterval,
    visibleCandleCount: data?.length || 100,
    chartWidth: innerWidth || 1000,
    zoomScale: 1,
    onTimeframeChange: (newTf, oldTf) => {
      console.log(`📊 Timeframe switched: ${oldTf} → ${newTf}`);
      setInterval(newTf);
    }
  });

  // Fetch candle data
  const fetchCandles = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/crypto/candles?symbol=${symbol}&interval=${interval}&limit=500`
      );
      if (response.ok) {
        const candles = await response.json();
        setData(candles);
      }
    } catch (error) {
      console.error('Error fetching candles:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch data on mount and when symbol/interval changes
  useEffect(() => {
    fetchCandles();
  }, [symbol, interval]);

  return (
    <>
      <Helmet>
        <title>Crypto Sandbox | BearTec</title>
        <meta name="description" content="Test and experiment with crypto features" />
      </Helmet>

      <CryptoNavigation />

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 pt-16">
        <div className="container mx-auto p-4 space-y-4">
          <Card className="bg-slate-800/50 border-purple-500/20">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-white flex items-center gap-2">
                🔬 Crypto Sandbox
                <span className="text-sm font-normal text-purple-400">
                  Testing & Development Environment
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Controls */}
              <div className="flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-sm text-purple-400 block mb-2">Symbol</label>
                  <Select value={symbol} onValueChange={setSymbol}>
                    <SelectTrigger className="bg-slate-700 border-purple-500/30 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SYMBOLS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex-1 min-w-[200px]">
                  <label className="text-sm text-purple-400 block mb-2">Interval</label>
                  <Select value={interval} onValueChange={(v) => setInterval(v as TimeframeInterval)}>
                    <SelectTrigger className="bg-slate-700 border-purple-500/30 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERVALS.map((i) => (
                        <SelectItem key={i.value} value={i.value}>
                          {i.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={fetchCandles}
                  disabled={loading}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>

              {/* Adaptive Timeframe Status */}
              <div className="bg-slate-700/50 rounded-lg p-4 border border-purple-500/20">
                <h3 className="text-lg font-semibold text-purple-400 mb-2">
                  Adaptive Timeframe Status
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-purple-400">Current TF:</span>
                    <span className="ml-2 text-white font-mono">
                      {adaptiveTimeframe.currentTimeframe}
                    </span>
                  </div>
                  <div>
                    <span className="text-purple-400">Adaptive Mode:</span>
                    <span className="ml-2 text-white">
                      {adaptiveTimeframe.isAdaptiveMode ? '✅ Enabled' : '❌ Disabled'}
                    </span>
                  </div>
                  <div>
                    <span className="text-purple-400">Transitioning:</span>
                    <span className="ml-2 text-white">
                      {adaptiveTimeframe.isTransitioning ? '🔄 Yes' : '✓ No'}
                    </span>
                  </div>
                  <div>
                    <span className="text-purple-400">Candles:</span>
                    <span className="ml-2 text-white font-mono">
                      {data.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Data Display */}
              <div className="bg-slate-700/50 rounded-lg p-4 border border-purple-500/20">
                <h3 className="text-lg font-semibold text-purple-400 mb-2">
                  Chart Data ({symbol} - {interval})
                </h3>
                {loading ? (
                  <div className="text-center py-8 text-purple-400">
                    Loading candles...
                  </div>
                ) : data.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm text-white">
                      Loaded {data.length} candles for {symbol} on {interval} timeframe
                    </p>
                    <div className="max-h-[400px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-slate-800">
                          <tr className="text-purple-400">
                            <th className="p-2 text-left">Time</th>
                            <th className="p-2 text-right">Open</th>
                            <th className="p-2 text-right">High</th>
                            <th className="p-2 text-right">Low</th>
                            <th className="p-2 text-right">Close</th>
                            <th className="p-2 text-right">Volume</th>
                          </tr>
                        </thead>
                        <tbody className="text-white">
                          {data.slice(0, 50).map((candle, idx) => (
                            <tr key={idx} className="border-b border-purple-500/10">
                              <td className="p-2">
                                {new Date(candle.time * 1000).toLocaleString()}
                              </td>
                              <td className="p-2 text-right font-mono">{candle.open}</td>
                              <td className="p-2 text-right font-mono">{candle.high}</td>
                              <td className="p-2 text-right font-mono">{candle.low}</td>
                              <td className="p-2 text-right font-mono">{candle.close}</td>
                              <td className="p-2 text-right font-mono">{candle.volume}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <p className="text-center py-8 text-purple-400">
                    No data available
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}