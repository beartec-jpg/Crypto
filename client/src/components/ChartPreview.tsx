import { useState, useEffect } from 'react';
import { Maximize2, X } from 'lucide-react';
import { useSimpleChart } from '@/hooks/useSimpleChart';

// Existing oscillator panel components
import { RSIPanel } from '@/components/indicators/oscillators/RSIPanel';
import { MACDPanel } from '@/components/indicators/oscillators/MACDPanel';
import { OBVPanel } from '@/components/indicators/oscillators/OBVPanel';
import { StochasticPanel } from '@/components/indicators/oscillators/StochasticPanel';
import { MFIPanel } from '@/components/indicators/oscillators/MFIPanel';
import { WilliamsRPanel } from '@/components/indicators/oscillators/WilliamsRPanel';
import { CCIPanel } from '@/components/indicators/oscillators/CCIPanel';
import { ADXPanel } from '@/components/indicators/oscillators/ADXPanel';

// Calculation functions
import { calculateRSI, calculateMACD } from '@/lib/indicators/momentum';
import { calculateOBV, calculateMFI } from '@/lib/indicators/volume';
import { 
  calculateStochasticRSI, 
  calculateWilliamsR, 
  calculateCCI, 
  calculateADX 
} from '@/lib/indicators';

// For divergence detection
import { detectDivergence } from '@/lib/calculations';

interface CVDDataItem {
  time: string;
  date?: string;
  timestamp: number;
  delta: number;
  cumDelta: number;
  isBull: boolean;
  volume: number;
  exchanges?: number;
  bullishExchanges?: number;
  bearishExchanges?: number;
  confidence?: number;
  divergence?: boolean;
  highValueDivergence?: boolean;
  volumeMultiple?: number;
}

interface ChartPreviewProps {
  symbol: string;
  timeframe: string;
  onExpand: () => void;
  chartContainerRef: React.RefObject<HTMLDivElement>;
  cvdData?: CVDDataItem[]; // Optional for future CVD integration
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

  // Candle data and calculated oscillators
  const [candles, setCandles] = useState<any[]>([]);
  const [calculatedData, setCalculatedData] = useState<{
    rsi: any[];
    macd: any;
    obv: any[];
    stochRSI: any[];
    mfi: any[];
    williamsR: any[];
    cci: any[];
    adx: any[];
  }>({
    rsi: [],
    macd: { macd: [], signal: [], hist: [] },
    obv: [],
    stochRSI: [],
    mfi: [],
    williamsR: [],
    cci: [],
    adx: [],
  });

  // Use the simple chart hook for candlestick visualization
  useSimpleChart({
    containerRef: chartContainerRef,
    symbol,
    timeframe,
  });

  // Helper function to convert timeframe
  const convertTimeframe = (tf: string): string => {
    const map: Record<string, string> = {
      '1m': '1m', '5m': '5m', '15m': '15m',
      '1h': '1h', '4h': '4h', '1d': '1d',
    };
    return map[tf] || '1h';
  };

  // Fetch candle data and calculate oscillators
  useEffect(() => {
    const fetchAndCalculate = async () => {
      try {
        const binanceTimeframe = convertTimeframe(timeframe);
        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${binanceTimeframe}&limit=500`
        );
        
        if (!response.ok) return;
        
        const klines = await response.json();
        const candleData = klines.map((k: any) => ({
          time: Math.floor(k[0] / 1000),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }));
        
        setCandles(candleData);
        
        // Calculate all oscillators
        setCalculatedData({
          rsi: calculateRSI(candleData, 14),
          macd: calculateMACD(candleData, 12, 26, 9),
          obv: calculateOBV(candleData),
          stochRSI: calculateStochasticRSI(candleData, 14),
          mfi: calculateMFI(candleData, 14),
          williamsR: calculateWilliamsR(candleData, 14),
          cci: calculateCCI(candleData, 20),
          adx: calculateADX(candleData, 14),
        });
      } catch (error) {
        console.error('Failed to calculate oscillators:', error);
      }
    };
    
    fetchAndCalculate();
    const interval = setInterval(fetchAndCalculate, 10000); // Update every 10s
    
    return () => clearInterval(interval);
  }, [symbol, timeframe]);

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

  // Divergence detection (copied from OscillatorContainer.tsx)
  const getOscillatorDivergence = (indicator: string): { strength: number; type: string } => {
    if (candles.length < 50) return { strength: 0, type: 'none' };
    
    const priceData = candles.map(c => c.close);
    
    switch (indicator) {
      case 'rsi': {
        const rsiValues = calculatedData.rsi.map(d => d.value);
        if (rsiValues.length === 0) return { strength: 0, type: 'none' };
        const strength = detectDivergence(priceData.slice(-rsiValues.length), rsiValues);
        return {
          strength: Math.max(-3, Math.min(3, strength)),
          type: strength > 0 ? 'bullish' : strength < 0 ? 'bearish' : 'none'
        };
      }
      case 'macd': {
        const histValues = calculatedData.macd.hist.map((d: any) => d.value);
        if (histValues.length === 0) return { strength: 0, type: 'none' };
        const strength = detectDivergence(priceData.slice(-histValues.length), histValues);
        return {
          strength: Math.max(-3, Math.min(3, strength)),
          type: strength > 0 ? 'bullish' : strength < 0 ? 'bearish' : 'none'
        };
      }
      case 'obv': {
        const obvValues = calculatedData.obv.map(d => d.value);
        if (obvValues.length === 0) return { strength: 0, type: 'none' };
        const strength = detectDivergence(priceData.slice(-obvValues.length), obvValues);
        return {
          strength: Math.max(-3, Math.min(3, strength)),
          type: strength > 0 ? 'bullish' : strength < 0 ? 'bearish' : 'none'
        };
      }
      default:
        return { strength: 0, type: 'none' };
    }
  };

  // Synopsis generation (copied from CryptoIndicators.tsx getIndicatorReport)
  const getIndicatorReport = (indicator: string): { text: string; color: string } => {
    if (candles.length < 20) return { text: '', color: '' };
    
    switch (indicator) {
      case 'rsi': {
        const lastRSI = calculatedData.rsi[calculatedData.rsi.length - 1]?.value;
        if (!lastRSI) return { text: '', color: '' };
        if (lastRSI >= 70) return { text: `Overbought (${lastRSI.toFixed(0)})`, color: 'text-red-400' };
        if (lastRSI <= 30) return { text: `Oversold (${lastRSI.toFixed(0)})`, color: 'text-green-400' };
        return { text: `Neutral (${lastRSI.toFixed(0)})`, color: 'text-gray-400' };
      }
      case 'macd': {
        const lastMACD = calculatedData.macd.macd[calculatedData.macd.macd.length - 1]?.value;
        const lastSignal = calculatedData.macd.signal[calculatedData.macd.signal.length - 1]?.value;
        const prevMACD = calculatedData.macd.macd[calculatedData.macd.macd.length - 2]?.value;
        const prevSignal = calculatedData.macd.signal[calculatedData.macd.signal.length - 2]?.value;
        
        if (!lastMACD || !lastSignal) return { text: '', color: '' };
        if (prevMACD < prevSignal && lastMACD > lastSignal) return { text: 'Bullish Cross', color: 'text-green-400' };
        if (prevMACD > prevSignal && lastMACD < lastSignal) return { text: 'Bearish Cross', color: 'text-red-400' };
        if (lastMACD > lastSignal) return { text: 'Bullish', color: 'text-green-400' };
        return { text: 'Bearish', color: 'text-red-400' };
      }
      case 'obv': {
        const recent = calculatedData.obv.slice(-5).map(d => d.value);
        if (recent.length < 5) return { text: '', color: '' };
        const trend = recent[recent.length - 1] - recent[0];
        if (trend > 0) return { text: 'Rising', color: 'text-green-400' };
        if (trend < 0) return { text: 'Falling', color: 'text-red-400' };
        return { text: 'Flat', color: 'text-gray-400' };
      }
      case 'stochRSI': {
        const lastK = calculatedData.stochRSI[calculatedData.stochRSI.length - 1]?.k;
        if (!lastK) return { text: '', color: '' };
        if (lastK >= 80) return { text: `Overbought (${lastK.toFixed(0)})`, color: 'text-red-400' };
        if (lastK <= 20) return { text: `Oversold (${lastK.toFixed(0)})`, color: 'text-green-400' };
        return { text: `Neutral (${lastK.toFixed(0)})`, color: 'text-gray-400' };
      }
      case 'mfi': {
        const lastMFI = calculatedData.mfi[calculatedData.mfi.length - 1]?.value;
        if (!lastMFI) return { text: '', color: '' };
        if (lastMFI >= 80) return { text: `Overbought (${lastMFI.toFixed(0)})`, color: 'text-red-400' };
        if (lastMFI <= 20) return { text: `Oversold (${lastMFI.toFixed(0)})`, color: 'text-green-400' };
        return { text: `Neutral (${lastMFI.toFixed(0)})`, color: 'text-gray-400' };
      }
      case 'williamsR': {
        const lastWR = calculatedData.williamsR[calculatedData.williamsR.length - 1]?.value;
        if (!lastWR) return { text: '', color: '' };
        if (lastWR >= -20) return { text: `Overbought (${lastWR.toFixed(0)})`, color: 'text-red-400' };
        if (lastWR <= -80) return { text: `Oversold (${lastWR.toFixed(0)})`, color: 'text-green-400' };
        return { text: `Neutral (${lastWR.toFixed(0)})`, color: 'text-gray-400' };
      }
      case 'cci': {
        const lastCCI = calculatedData.cci[calculatedData.cci.length - 1]?.value;
        if (!lastCCI) return { text: '', color: '' };
        if (lastCCI >= 100) return { text: `Overbought (${lastCCI.toFixed(0)})`, color: 'text-red-400' };
        if (lastCCI <= -100) return { text: `Oversold (${lastCCI.toFixed(0)})`, color: 'text-green-400' };
        return { text: `Neutral (${lastCCI.toFixed(0)})`, color: 'text-gray-400' };
      }
      case 'adx': {
        const lastADX = calculatedData.adx[calculatedData.adx.length - 1];
        if (!lastADX) return { text: '', color: '' };
        if (lastADX.adx >= 40) return { text: `Strong Trend (${lastADX.adx.toFixed(0)})`, color: 'text-blue-400' };
        if (lastADX.adx >= 25) return { text: `Trending (${lastADX.adx.toFixed(0)})`, color: 'text-cyan-400' };
        return { text: `Weak Trend (${lastADX.adx.toFixed(0)})`, color: 'text-gray-400' };
      }
      default:
        return { text: '', color: '' };
    }
  };

  // Divergence Meter component (copied from OscillatorContainer.tsx)
  const DivergenceMeter = ({ indicator }: { indicator: string }) => {
    const { strength, type } = getOscillatorDivergence(indicator);
    return (
      <div className="mt-2 pt-2 border-t border-slate-600">
        <div className="flex items-center gap-2">
          <span className="text-sm">🐻‍❄️</span>
          <div className="flex-1 h-2 bg-slate-700 rounded-full relative overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-px h-full bg-slate-500" />
            </div>
            <div 
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-white shadow transition-all duration-500"
              style={{
                left: `calc(50% + ${(strength / 3) * 45}% - 6px)`,
                background: strength === 0 
                  ? '#3b82f6' 
                  : strength > 0 
                    ? `linear-gradient(to right, #3b82f6, ${strength === 1 ? '#86efac' : strength === 2 ? '#4ade80' : '#22c55e'})`
                    : `linear-gradient(to left, #3b82f6, ${strength === -1 ? '#fca5a5' : strength === -2 ? '#f87171' : '#ef4444'})`,
              }}
            />
          </div>
          <span className="text-sm">🐂</span>
          {type !== 'none' && (
            <span className={`text-xs font-medium ${type === 'bullish' ? 'text-green-400' : 'text-red-400'}`}>
              {type === 'bullish' ? '▲' : '▼'}{Math.abs(strength)}
            </span>
          )}
        </div>
      </div>
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
      {activeOscillators.length > 0 && candles.length > 0 && (
        <div className="mt-4 space-y-3">
          {activeOscillators.includes('rsi') && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-white">📈 RSI</h4>
                  {(() => {
                    const report = getIndicatorReport('rsi');
                    return report.text && (
                      <p className={`text-xs ${report.color}`}>{report.text}</p>
                    );
                  })()}
                </div>
                <button
                  onClick={() => toggleOscillator('rsi')}
                  className="text-gray-400 hover:text-red-400 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <RSIPanel 
                data={calculatedData.rsi} 
                period={14} 
                candles={candles}
              />
              <DivergenceMeter indicator="rsi" />
            </div>
          )}

          {activeOscillators.includes('macd') && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-white">📊 MACD</h4>
                  {(() => {
                    const report = getIndicatorReport('macd');
                    return report.text && (
                      <p className={`text-xs ${report.color}`}>{report.text}</p>
                    );
                  })()}
                </div>
                <button
                  onClick={() => toggleOscillator('macd')}
                  className="text-gray-400 hover:text-red-400 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <MACDPanel
                macdData={calculatedData.macd.macd}
                signalData={calculatedData.macd.signal}
                histogramData={calculatedData.macd.hist}
                fastPeriod={12}
                slowPeriod={26}
                signalPeriod={9}
              />
              <DivergenceMeter indicator="macd" />
            </div>
          )}

          {activeOscillators.includes('obv') && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-white">📉 OBV</h4>
                  {(() => {
                    const report = getIndicatorReport('obv');
                    return report.text && (
                      <p className={`text-xs ${report.color}`}>{report.text}</p>
                    );
                  })()}
                </div>
                <button
                  onClick={() => toggleOscillator('obv')}
                  className="text-gray-400 hover:text-red-400 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <OBVPanel data={calculatedData.obv} />
              <DivergenceMeter indicator="obv" />
            </div>
          )}

          {activeOscillators.includes('stochRSI') && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-white">🎯 Stochastic RSI</h4>
                  {(() => {
                    const report = getIndicatorReport('stochRSI');
                    return report.text && (
                      <p className={`text-xs ${report.color}`}>{report.text}</p>
                    );
                  })()}
                </div>
                <button
                  onClick={() => toggleOscillator('stochRSI')}
                  className="text-gray-400 hover:text-red-400 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <StochasticPanel
                data={calculatedData.stochRSI}
                period={14}
                candles={candles}
              />
            </div>
          )}

          {activeOscillators.includes('mfi') && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-white">💰 MFI</h4>
                  {(() => {
                    const report = getIndicatorReport('mfi');
                    return report.text && (
                      <p className={`text-xs ${report.color}`}>{report.text}</p>
                    );
                  })()}
                </div>
                <button
                  onClick={() => toggleOscillator('mfi')}
                  className="text-gray-400 hover:text-red-400 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <MFIPanel data={calculatedData.mfi} period={14} />
            </div>
          )}

          {activeOscillators.includes('williamsR') && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-white">🔄 Williams %R</h4>
                  {(() => {
                    const report = getIndicatorReport('williamsR');
                    return report.text && (
                      <p className={`text-xs ${report.color}`}>{report.text}</p>
                    );
                  })()}
                </div>
                <button
                  onClick={() => toggleOscillator('williamsR')}
                  className="text-gray-400 hover:text-red-400 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <WilliamsRPanel data={calculatedData.williamsR} period={14} />
            </div>
          )}

          {activeOscillators.includes('cci') && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-white">🌊 CCI</h4>
                  {(() => {
                    const report = getIndicatorReport('cci');
                    return report.text && (
                      <p className={`text-xs ${report.color}`}>{report.text}</p>
                    );
                  })()}
                </div>
                <button
                  onClick={() => toggleOscillator('cci')}
                  className="text-gray-400 hover:text-red-400 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <CCIPanel data={calculatedData.cci} period={20} />
            </div>
          )}

          {activeOscillators.includes('adx') && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-white">💪 ADX</h4>
                  {(() => {
                    const report = getIndicatorReport('adx');
                    return report.text && (
                      <p className={`text-xs ${report.color}`}>{report.text}</p>
                    );
                  })()}
                </div>
                <button
                  onClick={() => toggleOscillator('adx')}
                  className="text-gray-400 hover:text-red-400 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ADXPanel 
                adxData={calculatedData.adx.map((d: any) => ({ time: d.time, value: d.adx }))}
                plusDIData={calculatedData.adx.map((d: any) => ({ time: d.time, value: d.plusDI }))}
                minusDIData={calculatedData.adx.map((d: any) => ({ time: d.time, value: d.minusDI }))}
                period={14}
              />
            </div>
          )}
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
