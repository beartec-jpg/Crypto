import { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ColorType, LineStyle, LineSeries, HistogramSeries, type Time } from 'lightweight-charts';
import type { CandleData } from '@/types/chart.types';
import { DraggableToolbar } from '@/components/draggable/DraggableToolbar';
import { X } from 'lucide-react';
import { TideZonePanel } from '@/components/indicators/oscillators/TideZonePanel';
import { calculateTideZone } from '@/lib/indicators/tideZone';
import { applyMainChartVisibleRange, readMainChartVisibleRange } from '@/lib/chart/syncOscillatorTimeScale';

// Height of the mobile navigation bar at the bottom of the screen
const MOBILE_NAV_HEIGHT = 65; // px

interface FullscreenOscillatorPanelProps {
  isVisible: boolean;
  onClose: () => void;
  candles: CandleData[];
  mainChartRef: React.RefObject<IChartApi | null>;
  // Oscillator settings
  rsiPeriod: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  stochRSIPeriod: number;
  cciPeriod: number;
  williamsRPeriod: number;
  // Calculation functions passed from parent
  calculateRSI: (candles: CandleData[], period: number) => any[];
  calculateMACD: (candles: CandleData[], fast: number, slow: number, signal: number) => any;
  calculateStochRSI: (candles: CandleData[], period: number) => any[];
  calculateCCI: (candles: CandleData[], period: number) => any[];
  calculateWilliamsR: (candles: CandleData[], period: number) => any[];
}

export function FullscreenOscillatorPanel({
  isVisible,
  onClose,
  candles,
  mainChartRef,
  rsiPeriod,
  macdFast,
  macdSlow,
  macdSignal,
  stochRSIPeriod,
  cciPeriod,
  williamsRPeriod,
  calculateRSI,
  calculateMACD,
  calculateStochRSI,
  calculateCCI,
  calculateWilliamsR,
}: FullscreenOscillatorPanelProps) {
  const [showPicker, setShowPicker] = useState(false);
  
  // Independent oscillator toggles
  const [showRSI, setShowRSI] = useState(false);
  const [showMACD, setShowMACD] = useState(false);
  const [showStochRSI, setShowStochRSI] = useState(false);
  const [showCCI, setShowCCI] = useState(false);
  const [showWilliamsR, setShowWilliamsR] = useState(false);
  const [showTideZone, setShowTideZone] = useState(false);
  
  // Refs for oscillator charts
  const rsiRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);
  const stochRSIRef = useRef<HTMLDivElement>(null);
  const cciRef = useRef<HTMLDivElement>(null);
  const williamsRRef = useRef<HTMLDivElement>(null);
  
  // Map to store chart instances
  const chartsRef = useRef<Map<string, IChartApi>>(new Map());
  
  // Cleanup all charts on unmount
  useEffect(() => {
    return () => {
      chartsRef.current.forEach(chart => chart.remove());
      chartsRef.current.clear();
    };
  }, []);
  
  // Create RSI chart
  useEffect(() => {
    if (!showRSI || !rsiRef.current || candles.length === 0 || !isVisible) return;
    
    const chart = createChart(rsiRef.current, { 
      width: rsiRef.current.clientWidth, 
      height: 250, 
      layout: {
        background: { type: ColorType.Solid, color: '#1e293b' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#334155' },
        horzLines: { color: '#334155' },
      },
      timeScale: {
        borderColor: '#475569',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: '#475569',
      },
    });
    
    chartsRef.current.set('RSI', chart);

    const rsiData = calculateRSI(candles, rsiPeriod);
    const line = chart.addSeries(LineSeries, { 
      color: '#fbbf24',
      lineWidth: 2,
    });
    line.setData(rsiData);

    const upperBand = chart.addSeries(LineSeries, { 
      color: '#64748b', 
      lineWidth: 1, 
      lineStyle: LineStyle.Dashed 
    });
    upperBand.setData(candles.map(c => ({ time: c.time as Time, value: 70 })));

    const lowerBand = chart.addSeries(LineSeries, { 
      color: '#64748b', 
      lineWidth: 1, 
      lineStyle: LineStyle.Dashed 
    });
    lowerBand.setData(candles.map(c => ({ time: c.time as Time, value: 30 })));

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartsRef.current.delete('RSI');
    };
  }, [showRSI, candles, rsiPeriod, isVisible, calculateRSI]);

  // Create MACD chart
  useEffect(() => {
    if (!showMACD || !macdRef.current || candles.length === 0 || !isVisible) return;
    
    const chart = createChart(macdRef.current, { 
      width: macdRef.current.clientWidth, 
      height: 250, 
      layout: {
        background: { type: ColorType.Solid, color: '#1e293b' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#334155' },
        horzLines: { color: '#334155' },
      },
      timeScale: {
        borderColor: '#475569',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: '#475569',
      },
    });
    
    chartsRef.current.set('MACD', chart);

    const { macd, signal, histogram } = calculateMACD(candles, macdFast, macdSlow, macdSignal);
    
    const macdLine = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 2 });
    macdLine.setData(macd);

    const signalLine = chart.addSeries(LineSeries, { color: '#ef4444', lineWidth: 2 });
    signalLine.setData(signal);

    const histSeries = chart.addSeries(HistogramSeries, {
      color: '#10b981',
      priceFormat: { type: 'price', precision: 6, minMove: 0.000001 },
    });
    histSeries.setData(histogram.map((h: any) => ({
      ...h,
      color: h.value >= 0 ? '#10b981' : '#ef4444'
    })));

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartsRef.current.delete('MACD');
    };
  }, [showMACD, candles, macdFast, macdSlow, macdSignal, isVisible, calculateMACD]);

  // Create StochRSI chart
  useEffect(() => {
    if (!showStochRSI || !stochRSIRef.current || candles.length === 0 || !isVisible) return;
    
    const chart = createChart(stochRSIRef.current, { 
      width: stochRSIRef.current.clientWidth, 
      height: 250, 
      layout: {
        background: { type: ColorType.Solid, color: '#1e293b' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#334155' },
        horzLines: { color: '#334155' },
      },
      timeScale: {
        borderColor: '#475569',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: '#475569',
      },
    });
    
    chartsRef.current.set('StochRSI', chart);

    const stochData = calculateStochRSI(candles, stochRSIPeriod);
    const kLine = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 2 });
    kLine.setData(stochData);

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartsRef.current.delete('StochRSI');
    };
  }, [showStochRSI, candles, stochRSIPeriod, isVisible, calculateStochRSI]);

  // Create CCI chart
  useEffect(() => {
    if (!showCCI || !cciRef.current || candles.length === 0 || !isVisible) return;
    
    const chart = createChart(cciRef.current, { 
      width: cciRef.current.clientWidth, 
      height: 250, 
      layout: {
        background: { type: ColorType.Solid, color: '#1e293b' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#334155' },
        horzLines: { color: '#334155' },
      },
      timeScale: {
        borderColor: '#475569',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: '#475569',
      },
    });
    
    chartsRef.current.set('CCI', chart);

    const cciData = calculateCCI(candles, cciPeriod);
    const line = chart.addSeries(LineSeries, { color: '#8b5cf6', lineWidth: 2 });
    line.setData(cciData);

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartsRef.current.delete('CCI');
    };
  }, [showCCI, candles, cciPeriod, isVisible, calculateCCI]);

  // Create Williams %R chart
  useEffect(() => {
    if (!showWilliamsR || !williamsRRef.current || candles.length === 0 || !isVisible) return;
    
    const chart = createChart(williamsRRef.current, { 
      width: williamsRRef.current.clientWidth, 
      height: 250, 
      layout: {
        background: { type: ColorType.Solid, color: '#1e293b' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#334155' },
        horzLines: { color: '#334155' },
      },
      timeScale: {
        borderColor: '#475569',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: '#475569',
      },
    });
    
    chartsRef.current.set('WilliamsR', chart);

    const williamsData = calculateWilliamsR(candles, williamsRPeriod);
    const line = chart.addSeries(LineSeries, { color: '#ec4899', lineWidth: 2 });
    line.setData(williamsData);

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartsRef.current.delete('WilliamsR');
    };
  }, [showWilliamsR, candles, williamsRPeriod, isVisible, calculateWilliamsR]);

  // Sync time scale with main chart (logical first so rightOffset whitespace follows)
  useEffect(() => {
    if (!isVisible || !mainChartRef.current) return;

    const mainChart = mainChartRef.current;

    const handleVisibleRangeChange = () => {
      const range = readMainChartVisibleRange(mainChart);
      if (!range.time && !range.logical) return;

      chartsRef.current.forEach((oscChart) => {
        try {
          applyMainChartVisibleRange(oscChart, range);
        } catch {
          // Ignore errors if chart is being destroyed
        }
      });
    };

    handleVisibleRangeChange();
    const ts = mainChart.timeScale();
    ts.subscribeVisibleTimeRangeChange(handleVisibleRangeChange);
    ts.subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);

    return () => {
      try {
        ts.unsubscribeVisibleTimeRangeChange(handleVisibleRangeChange);
        ts.unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
      } catch {
        /* disposed */
      }
    };
  }, [isVisible, mainChartRef, showRSI, showMACD, showStochRSI, showCCI, showWilliamsR, showTideZone]);

  if (!isVisible) return null;

  const oscillators = [
    { id: 'rsi', name: 'RSI', enabled: showRSI, setter: setShowRSI },
    { id: 'macd', name: 'MACD', enabled: showMACD, setter: setShowMACD },
    { id: 'stochrsi', name: 'Stochastic RSI', enabled: showStochRSI, setter: setShowStochRSI },
    { id: 'cci', name: 'CCI', enabled: showCCI, setter: setShowCCI },
    { id: 'williamsr', name: 'Williams %R', enabled: showWilliamsR, setter: setShowWilliamsR },
    { id: 'tideZone', name: 'Tide Zone', enabled: showTideZone, setter: setShowTideZone },
  ];

  const hasAnyEnabled = showRSI || showMACD || showStochRSI || showCCI || showWilliamsR || showTideZone;

  return (
    <>
      {/* Oscillator Picker Dropdown */}
      {showPicker && (
        <DraggableToolbar
          storageKey="oscillator-picker-position"
          defaultPosition={() => ({
            x: typeof window !== 'undefined' ? window.innerWidth - 320 : 0,
            y: typeof window !== 'undefined' ? 100 : 0
          })}
          className="z-[999]"
        >
          <div className="bg-slate-800/95 backdrop-blur-sm border border-slate-700 rounded-lg rounded-t-none p-4 shadow-2xl min-w-[280px] max-h-[min(60dvh,calc(100dvh-8rem))] overflow-y-auto overscroll-contain">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-medium">Select Oscillators</h3>
              <button
                onClick={() => setShowPicker(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {oscillators.map(osc => (
              <button
                key={osc.id}
                onClick={() => {
                  console.log('🎯 Toggling oscillator:', osc.name, 'from', osc.enabled, 'to', !osc.enabled);
                  osc.setter(!osc.enabled);
                  setShowPicker(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded hover:bg-slate-700 transition-all text-left ${
                  osc.enabled ? 'bg-blue-500/30 text-blue-300' : 'text-gray-300'
                }`}
              >
                <span className="text-sm">{osc.name}</span>
                {osc.enabled && <span className="text-green-400">✓</span>}
              </button>
            ))}
          </div>
        </DraggableToolbar>
      )}

      {/* Fullscreen Oscillator Panel - Bottom panel above navigation */}
      <div 
        className="fixed left-0 right-0 bg-slate-900 border-t border-slate-700 overflow-y-auto"
        style={{ 
          bottom: MOBILE_NAV_HEIGHT, // Space for mobile navigation bar
          height: '30vh',
          minHeight: '250px',
          maxHeight: '40vh',
          zIndex: 50
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between bg-slate-800 px-3 py-2">
          <h3 className="text-white font-semibold text-sm">Oscillators</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPicker(!showPicker)}
              className="p-1 rounded hover:bg-slate-700 text-gray-400"
              title="Add Oscillator"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              onClick={() => {
                onClose();
                setShowRSI(false);
                setShowMACD(false);
                setShowStochRSI(false);
                setShowCCI(false);
                setShowWilliamsR(false);
                setShowTideZone(false);
                chartsRef.current.forEach(chart => chart.remove());
                chartsRef.current.clear();
              }}
              className="p-1 rounded hover:bg-red-600/20 text-red-400"
              title="Close Panel"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-3 overflow-y-auto" style={{ maxHeight: 'calc(30vh - 45px)' }}>
          {!hasAnyEnabled && (
            <div className="flex items-center justify-center h-[120px] text-gray-400 text-sm">
              Click + to add an oscillator
            </div>
          )}
          
          {showRSI && (
            <div className="bg-slate-800 rounded-lg p-2 mb-3">
              <div className="text-xs text-gray-400 mb-1 flex items-center justify-between">
                <span>RSI ({rsiPeriod})</span>
                <button
                  onClick={() => {
                    setShowRSI(false);
                    const chart = chartsRef.current.get('RSI');
                    if (chart) {
                      chart.remove();
                      chartsRef.current.delete('RSI');
                    }
                  }}
                  className="text-red-400 hover:text-red-300"
                >
                  ✕
                </button>
              </div>
              <div ref={rsiRef} className="w-full" />
            </div>
          )}
          
          {showMACD && (
            <div className="bg-slate-800 rounded-lg p-2 mb-3">
              <div className="text-xs text-gray-400 mb-1 flex items-center justify-between">
                <span>MACD</span>
                <button
                  onClick={() => {
                    setShowMACD(false);
                    const chart = chartsRef.current.get('MACD');
                    if (chart) {
                      chart.remove();
                      chartsRef.current.delete('MACD');
                    }
                  }}
                  className="text-red-400 hover:text-red-300"
                >
                  ✕
                </button>
              </div>
              <div ref={macdRef} className="w-full" />
            </div>
          )}
          
          {showStochRSI && (
            <div className="bg-slate-800 rounded-lg p-2 mb-3">
              <div className="text-xs text-gray-400 mb-1 flex items-center justify-between">
                <span>Stochastic RSI</span>
                <button
                  onClick={() => {
                    setShowStochRSI(false);
                    const chart = chartsRef.current.get('StochRSI');
                    if (chart) {
                      chart.remove();
                      chartsRef.current.delete('StochRSI');
                    }
                  }}
                  className="text-red-400 hover:text-red-300"
                >
                  ✕
                </button>
              </div>
              <div ref={stochRSIRef} className="w-full" />
            </div>
          )}
          
          {showCCI && (
            <div className="bg-slate-800 rounded-lg p-2 mb-3">
              <div className="text-xs text-gray-400 mb-1 flex items-center justify-between">
                <span>CCI ({cciPeriod})</span>
                <button
                  onClick={() => {
                    setShowCCI(false);
                    const chart = chartsRef.current.get('CCI');
                    if (chart) {
                      chart.remove();
                      chartsRef.current.delete('CCI');
                    }
                  }}
                  className="text-red-400 hover:text-red-300"
                >
                  ✕
                </button>
              </div>
              <div ref={cciRef} className="w-full" />
            </div>
          )}

          {/* Williams %R */}
          {showWilliamsR && (
            <div className="bg-slate-800 rounded-lg p-2 mb-3">
              <div className="text-xs text-gray-400 mb-1 flex items-center justify-between">
                <span>Williams %R ({williamsRPeriod})</span>
                <button
                  onClick={() => {
                    setShowWilliamsR(false);
                    const chart = chartsRef.current.get('WilliamsR');
                    if (chart) {
                      chart.remove();
                      chartsRef.current.delete('WilliamsR');
                    }
                  }}
                  className="text-red-400 hover:text-red-300"
                >
                  ✕
                </button>
              </div>
              <div ref={williamsRRef} className="w-full" />
            </div>
          )}

          {showTideZone && (
            <div className="bg-slate-800 rounded-lg p-2 mb-3">
              <div className="text-xs text-gray-400 mb-1 flex items-center justify-between">
                <span>Tide Zone</span>
                <button
                  onClick={() => setShowTideZone(false)}
                  className="text-red-400 hover:text-red-300"
                >
                  ✕
                </button>
              </div>
              <div className="w-full h-[180px]">
                <TideZonePanel data={calculateTideZone(candles)} candles={candles} />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
