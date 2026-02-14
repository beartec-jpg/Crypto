import { useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import { useSimpleChart } from '@/hooks/useSimpleChart';

interface ChartPreviewProps {
  symbol: string;
  timeframe: string;
  onExpand: () => void;
  chartContainerRef: React.RefObject<HTMLDivElement>;
  cvdData?: any[]; // Optional for future CVD integration
}

/**
 * Chart preview component
 * - Clean, borderless chart view with watchlist timeframe
 * - Horizontal scroll-only navigation (zoom disabled)
 * - Small expand button in top-right corner
 * - No UI clutter - just the chart
 */
export function ChartPreview({
  symbol,
  timeframe,
  onExpand,
  chartContainerRef,
}: ChartPreviewProps) {
  // State management for oscillators and CVD
  const [showOscillatorModal, setShowOscillatorModal] = useState(false);
  const [activeOscillators, setActiveOscillators] = useState<string[]>([]);
  const [showCVD, setShowCVD] = useState(false);

  // Use the simple chart hook for candlestick visualization
  useSimpleChart({
    containerRef: chartContainerRef,
    symbol,
    timeframe,
  });

  // Oscillator selector modal options and toggle logic
  const oscillatorOptions = [
    { id: 'rsi', name: 'RSI', icon: '📈' },
    { id: 'macd', name: 'MACD', icon: '📊' },
    { id: 'stochRSI', name: 'Stochastic RSI', icon: '🎯' },
    { id: 'obv', name: 'OBV', icon: '📉' },
    { id: 'mfi', name: 'MFI', icon: '💰' },
    { id: 'williamsR', name: 'Williams %R', icon: '🔄' },
    { id: 'cci', name: 'CCI', icon: '🌊' },
    { id: 'adx', name: 'ADX', icon: '💪' },
  ];

  const toggleOscillator = (id: string) => {
    setActiveOscillators(prev => 
      prev.includes(id) 
        ? prev.filter(o => o !== id)
        : [...prev, id]
    );
  };

  return (
    <>
      <div className="relative w-full h-[500px]">
        {/* Chart canvas - takes full space */}
        <div ref={chartContainerRef} className="absolute inset-0" />
        
        {/* Floating expand button - small, discreet, top-right corner */}
        <button
          onClick={onExpand}
          className="absolute top-2 right-2 z-10 p-2 rounded-md bg-slate-800/80 hover:bg-slate-700/90 text-slate-300 hover:text-white transition-all shadow-lg"
          title="Expand to fullscreen"
          aria-label="Expand chart to fullscreen"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {/* Control Buttons - Oscillators & CVD */}
      <div className="flex items-center justify-between mt-3 gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowOscillatorModal(true);
          }}
          className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          📊 Oscillators
        </button>
        
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowCVD(!showCVD);
          }}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            showCVD 
              ? 'bg-blue-600 text-white' 
              : 'bg-slate-700 hover:bg-slate-600 text-gray-300'
          }`}
        >
          📈 CVD Metrics
        </button>
      </div>

      {/* Active Oscillators Display */}
      {activeOscillators.length > 0 && (
        <div className="mt-4 space-y-3">
          {activeOscillators.map(oscId => (
            <div key={oscId} className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-white">
                  {oscillatorOptions.find(o => o.id === oscId)?.icon}{' '}
                  {oscillatorOptions.find(o => o.id === oscId)?.name}
                </h4>
                <button
                  onClick={() => toggleOscillator(oscId)}
                  className="text-gray-400 hover:text-red-400 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="h-32 bg-slate-900 rounded flex items-center justify-center text-gray-400 text-sm">
                {oscId.toUpperCase()} Chart Placeholder
                {/* TODO: Integrate actual oscillator chart from existing components */}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CVD Metrics Table */}
      {showCVD && (
        <div className="mt-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-white mb-3">📈 CVD Metrics</h4>
            <div className="text-gray-400 text-sm">
              CVD Table Component - Import from existing CVDTable
              {/* TODO: Import and render <CVDTable /> component here */}
            </div>
          </div>
        </div>
      )}

      {/* Oscillator Selector Modal */}
      {showOscillatorModal && (
        <div 
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setShowOscillatorModal(false)}
        >
          <div 
            className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Select Oscillators</h3>
              <button
                onClick={() => setShowOscillatorModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              {oscillatorOptions.map(osc => (
                <button
                  key={osc.id}
                  onClick={() => toggleOscillator(osc.id)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    activeOscillators.includes(osc.id)
                      ? 'bg-purple-600 text-white shadow-lg scale-105'
                      : 'bg-slate-800 text-gray-300 hover:bg-slate-700'
                  }`}
                >
                  <span>{osc.icon}</span>
                  <span>{osc.name}</span>
                </button>
              ))}
            </div>
            
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setActiveOscillators([])}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg"
              >
                Clear All
              </button>
              <button
                onClick={() => setShowOscillatorModal(false)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
