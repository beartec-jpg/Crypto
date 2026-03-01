import { useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { usePageViewTracking } from '@/hooks/useAnalytics';
import { VideoSequencePlayer } from '@/components/trading/VideoSequencePlayer';
import { CryptoNavigation } from '@/components/CryptoNavigation';
import bearTecLogoNew from '@assets/beartec logo_1763645889028.png';
import { CleanWatchlist } from '@/components/watchlist/CleanWatchlist';
import { IndicatorsSection } from '@/components/indicators/IndicatorsSection';
import { useMarketStateDemo } from '@/hooks/useMarketStateDemo';
import { useIndicatorsData } from '@/hooks/useIndicatorsData';
import { useLocation } from 'wouter';

// Default symbol and timeframe for demo
const DEFAULT_SYMBOL = 'XRPUSDT';
const DEFAULT_TIMEFRAME = '1h';

export default function CryptoIndicatorsClean() {
  usePageViewTracking('Crypto Indicators');
  
  const [, navigate] = useLocation();
  
  // Video player demo state
  const { targetMarketState, isInitialLoad, setIsInitialLoad } = useMarketStateDemo();

  // Fetch candle and CVD data
  // TODO: Connect to watchlist selection state
  const { candles, cvdData, externalMetrics } = useIndicatorsData({
    symbol: DEFAULT_SYMBOL,
    timeframe: DEFAULT_TIMEFRAME,
  });

  // Handler to expand chart to fullscreen - navigate to chart page
  const handleExpandChart = useCallback((context: { 
    symbol: string; 
    timeframe: string; 
    watchlist: string[] 
  }) => {
    console.log('📊 Navigating to chart page with context:', context);
    
    // Save watchlist to localStorage so ChartPage can access it
    localStorage.setItem('watchlistTickers', JSON.stringify(context.watchlist));
    
    // Navigate to chart page with URL params (client-side navigation)
    navigate(`/chart?symbol=${context.symbol}&timeframe=${context.timeframe}`);
  }, [navigate]);

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
            
            {/* Logo */}
            <div className="mb-8">
              <img 
                src={bearTecLogoNew} 
                alt="BearTec Logo" 
                className="h-20 w-auto"
              />
            </div>

            {/* Video Animation */}
            <div className="flex justify-center mb-12">
              <div className="relative" style={{ height: '240px', width: '100%', maxWidth: '800px' }}>
                <VideoSequencePlayer
                  targetMarketState={targetMarketState}
                  isInitialLoad={isInitialLoad}
                  onInitialComplete={() => setIsInitialLoad(false)}
                />
              </div>
            </div>

          {/* Watchlist Section */}
          <CleanWatchlist onExpandChart={handleExpandChart} />

          {/* Indicators Section (Oscillators + CVD) */}
          <IndicatorsSection candles={candles} cvdData={cvdData} externalMetrics={externalMetrics} />
          </div>

          {/* Bottom Navigation */}
          <CryptoNavigation showWallet={true} />
        </div>
    </>
  );
}
