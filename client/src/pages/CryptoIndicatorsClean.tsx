import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'wouter';
import { GraduationCap, BarChart3, Sparkles, TrendingUp, CreditCard, UserCircle, Crown, Wallet } from 'lucide-react';
import { usePageViewTracking } from '@/hooks/useAnalytics';
import { VideoSequencePlayer } from '@/components/trading/VideoSequencePlayer';
import { TickerSearch } from '@/components/TickerSearch';
import { TickerTable } from '@/components/TickerTable';
import { useWatchlistState } from '@/hooks/useWatchlistState';
import bearTecLogoNew from '@assets/beartec logo_1763645889028.png';
import aiButtonVideo from '@assets/grok_video_2025-11-20-02-22-16_1763605488674.mp4';

export default function CryptoIndicatorsClean() {
  usePageViewTracking('Crypto Indicators');
  const [, setLocation] = useLocation();
  
  // Video player state
  const [targetMarketState, setTargetMarketState] = useState<'bullish' | 'bearish'>('bearish');
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Watchlist state management
  const watchlist = useWatchlistState();
  const [selectedSymbol, setSelectedSymbol] = useState('XRPUSDT');
  const [tableTimeframe, setTableTimeframe] = useState('1h');

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
        <div className="max-w-7xl mx-auto px-4 pt-8 pb-32">
          
          {/* Logo - Top Left */}
          <div className="mb-8">
            <img 
              src={bearTecLogoNew} 
              alt="BearTec Logo" 
              className="h-24 w-auto"
            />
          </div>

          {/* Animation - Centered */}
          <div className="flex justify-center mb-12">
            <VideoSequencePlayer
              targetMarketState={targetMarketState}
              isInitialLoad={isInitialLoad}
              onInitialComplete={() => setIsInitialLoad(false)}
            />
          </div>

          {/* Search Bar - Centered */}
          <div className="max-w-2xl mx-auto mb-8">
            <TickerSearch 
              onAddTicker={(ticker) => watchlist.handleAddTicker(ticker, setSelectedSymbol)}
              existingTickers={watchlist.watchlistTickers}
            />
          </div>

          {/* Watchlist Table - Full Width */}
          <div className="w-full">
            <TickerTable
              tickers={watchlist.watchlistTickers}
              onRemoveTicker={(ticker) => watchlist.handleRemoveTicker(ticker, selectedSymbol, setSelectedSymbol)}
              onSelectTicker={setSelectedSymbol}
              selectedTicker={selectedSymbol}
              timeframe={tableTimeframe}
              onTimeframeChange={setTableTimeframe}
            />
          </div>

        </div>

        {/* Bottom Navigation Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-800 z-40">
          <div className="max-w-7xl mx-auto px-2">
            <div className="grid grid-cols-4 md:grid-cols-8 gap-1 py-2">
              
              {/* Training */}
              <button
                onClick={() => setLocation('/crypto/training')}
                className="flex flex-col items-center justify-center gap-1 p-3 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <GraduationCap className="w-6 h-6 text-gray-400" />
                <span className="text-xs text-gray-400 font-medium">Training</span>
              </button>

              {/* Charts - Active */}
              <button
                onClick={() => setLocation('/cryptoindicators')}
                className="flex flex-col items-center justify-center gap-1 p-3 rounded-lg bg-blue-600 transition-colors"
              >
                <BarChart3 className="w-6 h-6 text-white" />
                <span className="text-xs text-white font-medium">Charts</span>
              </button>

              {/* AI */}
              <button
                onClick={() => setLocation('/cryptoai')}
                className="flex flex-col items-center justify-center gap-1 p-3 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <Sparkles className="w-6 h-6 text-gray-400" />
                <span className="text-xs text-gray-400 font-medium">AI</span>
              </button>

              {/* Waves */}
              <button
                onClick={() => setLocation('/cryptoelliottwave')}
                className="flex flex-col items-center justify-center gap-1 p-3 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <TrendingUp className="w-6 h-6 text-gray-400" />
                <span className="text-xs text-gray-400 font-medium">Waves</span>
              </button>

              {/* Plans */}
              <button
                onClick={() => setLocation('/crypto/subscribe')}
                className="flex flex-col items-center justify-center gap-1 p-3 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <CreditCard className="w-6 h-6 text-gray-400" />
                <span className="text-xs text-gray-400 font-medium">Plans</span>
              </button>

              {/* Account */}
              <button
                onClick={() => setLocation('/crypto/account')}
                className="flex flex-col items-center justify-center gap-1 p-3 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <UserCircle className="w-6 h-6 text-gray-400" />
                <span className="text-xs text-gray-400 font-medium">Account</span>
              </button>

              {/* Elite */}
              <button
                onClick={() => setLocation('/crypto/subscribe')}
                className="flex flex-col items-center justify-center gap-1 p-3 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <Crown className="w-6 h-6 text-purple-400" />
                <span className="text-xs text-purple-400 font-medium">Elite</span>
              </button>

              {/* Wallet */}
              <button
                onClick={() => setLocation('/wallet')}
                className="flex flex-col items-center justify-center gap-1 p-3 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <Wallet className="w-6 h-6 text-green-400" />
                <span className="text-xs text-green-400 font-medium">Wallet</span>
              </button>

            </div>
          </div>
        </div>

        {/* AI Button - Bottom Right */}
        <div className="fixed bottom-20 right-6 z-50">
          <button
            onClick={() => setLocation('/cryptoai')}
            className="relative group"
            aria-label="AI Market Analysis"
          >
            <video
              src={aiButtonVideo}
              autoPlay
              loop
              muted
              playsInline
              className="w-20 h-20 rounded-full object-cover shadow-2xl shadow-purple-500/50 group-hover:scale-110 transition-transform duration-200"
            />
            <div className="absolute inset-0 rounded-full bg-purple-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="absolute bottom-full right-0 mb-2 px-3 py-1 bg-slate-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
              AI Market Analysis
              <div className="absolute top-full right-4 w-2 h-2 bg-slate-900 transform rotate-45 -mt-1"></div>
            </div>
          </button>
        </div>
      </div>
    </>
  );
}
