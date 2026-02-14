import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { usePageViewTracking } from '@/hooks/useAnalytics';
import { VideoSequencePlayer } from '@/components/trading/VideoSequencePlayer';
import { CryptoNavigation } from '@/components/CryptoNavigation';
import bearTecLogoNew from '@assets/beartec logo_1763645889028.png';
import { CleanWatchlist } from '@/components/watchlist/CleanWatchlist';
import { OscillatorsPanel } from '@/components/indicators/OscillatorsPanel';
import { CVDTable } from '@/components/indicators/volume/CVDTable';

// Binance API kline structure
type BinanceKline = [number, string, string, string, string, string, number, string, number, string, string, string];

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CVDDataItem {
  time: string;
  timestamp: number;
  delta: number;
  cumDelta: number;
  isBull: boolean;
  volume: number;
}

export default function CryptoIndicatorsClean() {
  usePageViewTracking('Crypto Indicators');
  
  // Video player state
  const [targetMarketState, setTargetMarketState] = useState<'bullish' | 'bearish'>('bearish');
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // State for oscillators and CVD data
  const [candles, setCandles] = useState<Candle[]>([]);
  const [deltaHistory, setDeltaHistory] = useState<CVDDataItem[]>([]);

  // Simulate market state change for demo
  useEffect(() => {
    const timer = setTimeout(() => {
      setTargetMarketState('bullish');
      setIsInitialLoad(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  // Fetch candle data for oscillators
  useEffect(() => {
    const fetchCandles = async () => {
      try {
        // Default symbol and timeframe - in a real implementation, these would come from selected state
        const symbol = 'XRPUSDT';
        const timeframe = '1h';
        
        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=500`
        );
        
        if (!response.ok) {
          console.error(`Failed to fetch candles: ${response.status} ${response.statusText}`);
          return;
        }
        
        const klines = await response.json();
        const candleData: Candle[] = klines.map((kline: BinanceKline) => ({
          time: Math.floor(kline[0] / 1000),
          open: parseFloat(kline[1]),
          high: parseFloat(kline[2]),
          low: parseFloat(kline[3]),
          close: parseFloat(kline[4]),
          volume: parseFloat(kline[5]),
        }));
        
        setCandles(candleData);
        
        // Generate mock CVD data from candles for demo
        // In production, this would come from an actual CVD data source
        let cumDelta = 0;
        const cvdData: CVDDataItem[] = candleData.map((candle) => {
          const delta = (Math.random() - 0.5) * candle.volume * 0.1;
          cumDelta += delta;
          
          return {
            time: new Date(candle.time * 1000).toLocaleTimeString(),
            timestamp: candle.time,
            delta,
            cumDelta,
            isBull: delta > 0,
            volume: candle.volume,
          };
        });
        
        setDeltaHistory(cvdData);
      } catch (error) {
        console.error('Failed to fetch candle data:', error);
      }
    };
    
    fetchCandles();
    const interval = setInterval(fetchCandles, 10000); // Update every 10s
    
    return () => clearInterval(interval);
  }, []); // Empty dependency array - only run on mount and then on interval

  return (
    <>
      <Helmet>
        <title>Crypto Indicators - BearTec Engineering</title>
        <meta name="description" content="Professional crypto trading indicators and analysis" />
      </Helmet>

      {/* Main Content */}
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white">
        
        {/* Container for all content */}
        <div className="max-w-7xl mx-auto px-4 py-6 pb-32">
          
          {/* 1. LOGO - Top */}
          <div className="mb-8">
            <img 
              src={bearTecLogoNew} 
              alt="BearTec Logo" 
              className="h-20 w-auto"
            />
          </div>

          {/* 2. ANIMATION - Centered with proper spacing */}
          <div className="flex justify-center mb-12">
            <div className="relative" style={{ height: '240px', width: '100%', maxWidth: '800px' }}>
              <VideoSequencePlayer
                targetMarketState={targetMarketState}
                isInitialLoad={isInitialLoad}
                onInitialComplete={() => setIsInitialLoad(false)}
              />
            </div>
          </div>

          {/* 3 & 4. WATCHLIST (Search + Table + Timeframe + Chart) */}
          <CleanWatchlist />

          {/* 5. OSCILLATORS SECTION */}
          {candles.length > 0 && (
            <div className="mt-6 bg-slate-900 border border-slate-700 rounded-lg p-4">
              <OscillatorsPanel candles={candles} />
            </div>
          )}

          {/* 6. CVD TABLE SECTION */}
          {deltaHistory.length > 0 && (
            <div className="mt-6 bg-slate-900 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-lg font-semibold text-white">📈 Delta vs CVD</h4>
              </div>
              <CVDTable 
                data={deltaHistory}
                useMultiExchange={false}
                tableLimit={20}
              />
            </div>
          )}
        </div>

        {/* Shared Bottom Navigation */}
        <CryptoNavigation showWallet={true} />
      </div>
    </>
  );
}
