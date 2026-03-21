import { useCallback, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { ChevronDown } from 'lucide-react';
import { usePageViewTracking } from '@/hooks/useAnalytics';
import { VideoSequencePlayer } from '@/components/trading/VideoSequencePlayer';
import { CryptoNavigation } from '@/components/CryptoNavigation';
import bearTecLogoNew from '@assets/beartec logo_1763645889028.png';
import { CleanWatchlist } from '@/components/watchlist/CleanWatchlist';
import { IndicatorsSection } from '@/components/indicators/IndicatorsSection';
import { OSCILLATOR_OPTIONS } from '@/components/indicators/OscillatorsPanel';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMarketStateDemo } from '@/hooks/useMarketStateDemo';
import { useIndicatorsData } from '@/hooks/useIndicatorsData';
import { useLocation } from 'wouter';

// Default symbol and timeframe for demo
const DEFAULT_SYMBOL = 'XRPUSDT';
const DEFAULT_TIMEFRAME = '1h';

export default function CryptoIndicatorsClean() {
  usePageViewTracking('Crypto Indicators');
  
  const [, navigate] = useLocation();
  const [selectedSymbol, setSelectedSymbol] = useState(DEFAULT_SYMBOL);
  const [selectedTimeframe, setSelectedTimeframe] = useState(DEFAULT_TIMEFRAME);
  const [activeOscillators, setActiveOscillators] = useState<string[]>(['rsi', 'macd']);
  
  // Video player demo state
  const { targetMarketState, isInitialLoad, setIsInitialLoad } = useMarketStateDemo();

  // Fetch candle and CVD data
  const { candles, cvdData, externalMetrics } = useIndicatorsData({
    symbol: selectedSymbol,
    timeframe: selectedTimeframe,
  });

  const handleSelectionChange = useCallback((context: {
    symbol: string;
    timeframe: string;
    watchlist: string[];
  }) => {
    setSelectedSymbol(context.symbol);
    setSelectedTimeframe(context.timeframe);
  }, []);

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

  const handleOscillatorToggle = useCallback((oscillatorId: string, checked: boolean) => {
    setActiveOscillators((previous) => {
      if (checked) {
        return previous.includes(oscillatorId) ? previous : [...previous, oscillatorId];
      }

      return previous.filter((id) => id !== oscillatorId);
    });
  }, []);

  const oscillatorSummary =
    activeOscillators.length === 0
      ? 'No oscillators selected'
      : activeOscillators.length <= 2
        ? activeOscillators
            .map((id) => OSCILLATOR_OPTIONS.find((option) => option.id === id)?.label ?? id)
            .join(', ')
        : `${activeOscillators.length} oscillators selected`;

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
          <CleanWatchlist onExpandChart={handleExpandChart} onSelectionChange={handleSelectionChange} />

          {/* Indicators Section (Oscillators + CVD) */}
          <div className="mb-4 flex items-center justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="border-slate-700 bg-slate-900/80 text-slate-100 hover:bg-slate-800"
                >
                  Oscillators: {oscillatorSummary}
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 border-slate-700 bg-slate-900 text-slate-100">
                <DropdownMenuLabel>Toggle oscillator panels</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-slate-700" />
                {OSCILLATOR_OPTIONS.map((oscillator) => (
                  <DropdownMenuCheckboxItem
                    key={oscillator.id}
                    checked={activeOscillators.includes(oscillator.id)}
                    onCheckedChange={(checked) => handleOscillatorToggle(oscillator.id, checked === true)}
                    className="focus:bg-slate-800"
                  >
                    {oscillator.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <IndicatorsSection
            candles={candles}
            cvdData={cvdData}
            externalMetrics={externalMetrics}
            symbol={selectedSymbol}
            showPatternBacktest={false}
            activeOscillators={activeOscillators}
            onActiveOscillatorsChange={setActiveOscillators}
          />
          </div>

          {/* Bottom Navigation */}
          <CryptoNavigation showWallet={true} />
        </div>
    </>
  );
}
