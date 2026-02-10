import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { usePageViewTracking } from '@/hooks/useAnalytics';
import { VideoSequencePlayer } from '@/components/trading/VideoSequencePlayer';
// REMOVED: direct TickerSearch / TickerTable / useWatchlistState imports
// import { TickerSearch } from '@/components/TickerSearch';
// import { TickerTable } from '@/components/TickerTable';
// import { useWatchlistState } from '@/hooks/useWatchlistState';
import { CryptoNavigation } from '@/components/CryptoNavigation';
import bearTecLogoNew from '@assets/beartec logo_1763645889028.png';
import { CleanWatchlist } from '@/components/watchlist/CleanWatchlist';

export default function CryptoIndicatorsClean() {
  usePageViewTracking('Crypto Indicators');
  
  // Video player state
  const [targetMarketState, setTargetMarketState] = useState<'bullish' | 'bearish'>('bearish');
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // REMOVED: page-level watchlist state; moved into CleanWatchlist
  // const watchlist = useWatchlistState();
  // const [selectedSymbol, setSelectedSymbol] = useState('XRPUSDT');
  // const [tableTimeframe, setTableTimeframe] = useState('1h');

  // Simulate market state change for demo
  useEffect(() => {
    const timer = setTimeout(() => {
      setTargetMarketState('bullish');
      setIsInitialLoad(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

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

          {/* 3 & 4. WATCHLIST (Search + Table + Timeframe) */}
          <CleanWatchlist />
        </div>

        {/* Shared Bottom Navigation */}
        <CryptoNavigation showWallet={true} />
      </div>
    </>
  );
}
