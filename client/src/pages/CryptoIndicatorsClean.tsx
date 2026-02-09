import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'wouter';
import { Activity, TrendingUp, Bell, Wallet } from 'lucide-react';
import { usePageViewTracking } from '@/hooks/useAnalytics';
import { CryptoNavigation } from '@/components/CryptoNavigation';
import { VideoSequencePlayer } from '@/components/trading/VideoSequencePlayer';
import bearTecLogoNew from '@assets/beartec logo_1763645889028.png';
import aiButtonVideo from '@assets/grok_video_2025-11-20-02-22-16_1763605488674.mp4';

export default function CryptoIndicatorsClean() {
  usePageViewTracking('Crypto Indicators');
  const [, setLocation] = useLocation();
  
  // Video player state - simplified for now
  const [targetMarketState, setTargetMarketState] = useState<'bullish' | 'bearish'>('bearish');
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Simulate market state change for demo (remove later when you add real logic)
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

      {/* Navigation */}
      <CryptoNavigation />

      {/* Main Content */}
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white">
        <div className="container mx-auto px-4 pt-24 pb-12">
          
          {/* Header with Logo and Bull/Bear Animation */}
          <div className="relative flex flex-col items-center mb-8">
            {/* BearTec Logo - Centered on mobile, left on desktop */}
            <div className="mb-4 md:absolute md:left-0 md:top-0 md:mb-0">
              <img 
                src={bearTecLogoNew} 
                alt="BearTec Logo" 
                className="h-[100px] md:h-[140px] w-auto object-contain"
              />
            </div>
            
            {/* Dynamic Market Status Animation - Top Center */}
            <VideoSequencePlayer
              targetMarketState={targetMarketState}
              isInitialLoad={isInitialLoad}
              onInitialComplete={() => setIsInitialLoad(false)}
            />
          </div>

          {/* Spacer */}
          <div className="h-8"></div>

          {/* Mobile-Friendly Dashboard Buttons */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {/* Indicators Button */}
            <button
              onClick={() => setLocation('/crypto/indicators')}
              className="bg-gradient-to-br from-blue-600 to-blue-800 hover:from-blue-500 hover:to-blue-700 rounded-lg p-6 flex flex-col items-center justify-center gap-3 transition-all duration-200 shadow-lg hover:shadow-blue-500/50 hover:scale-105"
            >
              <Activity className="w-8 h-8" />
              <span className="font-semibold">Indicators</span>
            </button>

            {/* Training Button */}
            <button
              onClick={() => setLocation('/crypto/training')}
              className="bg-gradient-to-br from-purple-600 to-purple-800 hover:from-purple-500 hover:to-purple-700 rounded-lg p-6 flex flex-col items-center justify-center gap-3 transition-all duration-200 shadow-lg hover:shadow-purple-500/50 hover:scale-105"
            >
              <TrendingUp className="w-8 h-8" />
              <span className="font-semibold">Training</span>
            </button>

            {/* Alerts Button */}
            <button
              onClick={() => setLocation('/crypto/alerts')}
              className="bg-gradient-to-br from-amber-600 to-amber-800 hover:from-amber-500 hover:to-amber-700 rounded-lg p-6 flex flex-col items-center justify-center gap-3 transition-all duration-200 shadow-lg hover:shadow-amber-500/50 hover:scale-105"
            >
              <Bell className="w-8 h-8" />
              <span className="font-semibold">Alerts</span>
            </button>

            {/* Wallet Button (NEW) */}
            <button
              onClick={() => setLocation('/crypto/wallet')}
              className="bg-gradient-to-br from-green-600 to-green-800 hover:from-green-500 hover:to-green-700 rounded-lg p-6 flex flex-col items-center justify-center gap-3 transition-all duration-200 shadow-lg hover:shadow-green-500/50 hover:scale-105"
            >
              <Wallet className="w-8 h-8" />
              <span className="font-semibold">Wallet</span>
            </button>
          </div>

          {/* Placeholder for future content */}
          <div className="bg-slate-900/50 rounded-lg border border-blue-500/20 p-8 text-center">
            <p className="text-2xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-600 text-transparent bg-clip-text">
              Clean Slate
            </p>
            <p className="text-gray-400">
              Chart and indicators will be added back here incrementally
            </p>
          </div>

        </div>

        {/* AI Analysis Button - Bottom Fixed */}
        <div className="fixed bottom-6 right-6 z-50">
          <button
            onClick={() => setLocation('/crypto/ai')}
            className="relative group"
            aria-label="AI Market Analysis"
          >
            {/* Animated Video Background */}
            <video
              src={aiButtonVideo}
              autoPlay
              loop
              muted
              playsInline
              className="w-20 h-20 rounded-full object-cover shadow-2xl shadow-purple-500/50 group-hover:scale-110 transition-transform duration-200"
            />
            
            {/* Glow Effect on Hover */}
            <div className="absolute inset-0 rounded-full bg-purple-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            
            {/* Tooltip */}
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
