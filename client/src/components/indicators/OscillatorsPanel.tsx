import { useState } from 'react';
import { X } from 'lucide-react';

// Existing oscillator panel components
import { RSIPanel } from '@/components/indicators/oscillators/RSIPanel';
import { MACDPanel } from '@/components/indicators/oscillators/MACDPanel';
import { OBVPanel } from '@/components/indicators/oscillators/OBVPanel';
import { StochasticPanel } from '@/components/indicators/oscillators/StochasticPanel';
import { MFIPanel } from '@/components/indicators/oscillators/MFIPanel';
import { WilliamsRPanel } from '@/components/indicators/oscillators/WilliamsRPanel';
import { CCIPanel } from '@/components/indicators/oscillators/CCIPanel';
import { ADXPanel } from '@/components/indicators/oscillators/ADXPanel';
import { TideZonePanel } from '@/components/indicators/oscillators/TideZonePanel';

// Calculation functions
import { calculateRSI, calculateMACD } from '@/lib/indicators/momentum';
import { calculateOBV, calculateMFI } from '@/lib/indicators/volume';
import { 
  calculateStochasticRSI, 
  calculateWilliamsR, 
  calculateCCI, 
  calculateADX 
} from '@/lib/indicators';
import { calculateTideZone, tideZoneLabel } from '@/lib/indicators/tideZone';

// For divergence detection
import { detectDivergence } from '@/lib/calculations';
import { buildIndicatorCoach } from '@/lib/indicators/indicatorCoach';

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TimeValuePair {
  time: number;
  value: number;
}

interface MACDData {
  macd: TimeValuePair[];
  signal: TimeValuePair[];
  hist: Array<TimeValuePair & { color: string }>;
}

interface StochasticRSIData {
  time: number;
  k: number;
  d: number;
}

interface ADXData {
  time: number;
  adx: number;
  plusDI: number;
  minusDI: number;
}

interface OscillatorsPanelProps {
  candles: Candle[];
  activeOscillators?: string[];
  onActiveOscillatorsChange?: (oscillators: string[]) => void;
}

export const OSCILLATOR_OPTIONS = [
  { id: 'rsi', label: 'RSI' },
  { id: 'macd', label: 'MACD' },
  { id: 'obv', label: 'OBV' },
  { id: 'stochRSI', label: 'Stochastic RSI' },
  { id: 'mfi', label: 'MFI' },
  { id: 'williamsR', label: 'Williams %R' },
  { id: 'cci', label: 'CCI' },
  { id: 'adx', label: 'ADX' },
  { id: 'tideZone', label: 'Tide Zone' },
] as const;

// Divergence meter constants
const DIVERGENCE_MAX_STRENGTH = 3;
const DIVERGENCE_MAX_OFFSET_PERCENT = 45;
const DIVERGENCE_INDICATOR_RADIUS = 6;

/**
 * Standalone oscillators panel component
 * - Manages display of active oscillators (RSI and MACD by default)
 * - Calculates all oscillator data from candles prop
 * - Renders oscillator panels with close buttons
 * - Includes divergence detection for RSI, MACD, OBV
 */
export function OscillatorsPanel({
  candles,
  activeOscillators: controlledOscillators,
  onActiveOscillatorsChange,
}: OscillatorsPanelProps) {
  // Show RSI and MACD by default
  const [internalOscillators, setInternalOscillators] = useState<string[]>(['rsi', 'macd']);
  const activeOscillators = controlledOscillators ?? internalOscillators;

  // Calculate all oscillators from candles
  const calculatedData = {
    rsi: candles.length > 0 ? calculateRSI(candles, 14) : [],
    macd: candles.length > 0 ? calculateMACD(candles, 12, 26, 9) : { macd: [], signal: [], hist: [] },
    obv: candles.length > 0 ? calculateOBV(candles) : [],
    stochRSI: candles.length > 0 ? calculateStochasticRSI(candles, 14) : [],
    mfi: candles.length > 0 ? calculateMFI(candles, 14) : [],
    williamsR: candles.length > 0 ? calculateWilliamsR(candles, 14) : [],
    cci: candles.length > 0 ? calculateCCI(candles, 20) : [],
    adx: candles.length > 0 ? calculateADX(candles, 14) : [],
    tideZone: candles.length > 0 ? calculateTideZone(candles) : [],
  };

  const toggleOscillator = (id: string) => {
    const nextOscillators = activeOscillators.includes(id)
      ? activeOscillators.filter((oscillatorId) => oscillatorId !== id)
      : [...activeOscillators, id];

    if (onActiveOscillatorsChange) {
      onActiveOscillatorsChange(nextOscillators);
      return;
    }

    setInternalOscillators(nextOscillators);
  };

  // Divergence vs price — only oscillators traders actually use for this
  const getOscillatorDivergence = (indicator: string): { strength: number; type: string } => {
    if (candles.length < 50) return { strength: 0, type: 'none' };

    const priceData = candles.map((c) => c.close);
    const none = { strength: 0, type: 'none' };
    const wrap = (values: number[]) => {
      if (!values.length) return none;
      const strength = Math.max(-3, Math.min(3, detectDivergence(priceData.slice(-values.length), values)));
      return {
        strength,
        type: strength > 0 ? 'bullish' : strength < 0 ? 'bearish' : 'none',
      };
    };

    switch (String(indicator).toLowerCase().replace(/[^a-z]/g, '')) {
      case 'rsi':
        return wrap(calculatedData.rsi.map((d) => d.value));
      case 'macd':
        return wrap(calculatedData.macd.hist.map((d) => d.value));
      case 'obv':
        return wrap(calculatedData.obv.map((d) => d.value));
      case 'stochrsi':
        return wrap(calculatedData.stochRSI.map((d) => d.k));
      case 'mfi':
        return wrap(calculatedData.mfi.map((d) => d.value));
      case 'williamsr':
        return wrap(calculatedData.williamsR.map((d) => d.value));
      case 'cci':
        return wrap(calculatedData.cci.map((d) => d.value));
      default:
        return none;
    }
  };

  const getCoach = (indicator: string) => {
    const div = getOscillatorDivergence(indicator);
    const values: Record<string, number | undefined> = {};
    const id = String(indicator).toLowerCase().replace(/[^a-z]/g, '');
    switch (id) {
      case 'rsi': {
        const series = calculatedData.rsi;
        const recent = series.slice(-5).map((d) => d.value);
        values.value = series[series.length - 1]?.value;
        values.slope = recent.length >= 2 ? recent[recent.length - 1] - recent[0] : 0;
        break;
      }
      case 'stochrsi': {
        const series = calculatedData.stochRSI;
        const recent = series.slice(-5).map((d) => d.k);
        values.k = series[series.length - 1]?.k;
        values.slope = recent.length >= 2 ? recent[recent.length - 1] - recent[0] : 0;
        break;
      }
      case 'macd': {
        const { macd, signal, hist } = calculatedData.macd;
        const lastMACD = macd[macd.length - 1]?.value;
        const lastSignal = signal[signal.length - 1]?.value;
        const prevMACD = macd[macd.length - 2]?.value;
        const prevSignal = signal[signal.length - 2]?.value;
        values.macd = lastMACD;
        values.signal = lastSignal;
        values.hist = hist[hist.length - 1]?.value;
        if (lastMACD != null && lastSignal != null && prevMACD != null && prevSignal != null) {
          values.crossedUp = prevMACD < prevSignal && lastMACD > lastSignal ? 1 : 0;
          values.crossedDown = prevMACD > prevSignal && lastMACD < lastSignal ? 1 : 0;
        }
        break;
      }
      case 'obv': {
        const recent = calculatedData.obv.slice(-5).map((d) => d.value);
        values.slope = recent.length >= 2 ? recent[recent.length - 1] - recent[0] : 0;
        break;
      }
      case 'mfi': {
        const series = calculatedData.mfi;
        const recent = series.slice(-5).map((d) => d.value);
        values.value = series[series.length - 1]?.value;
        values.slope = recent.length >= 2 ? recent[recent.length - 1] - recent[0] : 0;
        break;
      }
      case 'williamsr': {
        const series = calculatedData.williamsR;
        const recent = series.slice(-5).map((d) => d.value);
        values.value = series[series.length - 1]?.value;
        values.slope = recent.length >= 2 ? recent[recent.length - 1] - recent[0] : 0;
        break;
      }
      case 'cci': {
        const series = calculatedData.cci;
        const recent = series.slice(-5).map((d) => d.value);
        values.value = series[series.length - 1]?.value;
        values.slope = recent.length >= 2 ? recent[recent.length - 1] - recent[0] : 0;
        break;
      }
      case 'adx': {
        const lastADX = calculatedData.adx[calculatedData.adx.length - 1];
        const recent = calculatedData.adx.slice(-5).map((d) => d.adx);
        values.adx = lastADX?.adx;
        values.plusDI = lastADX?.plusDI;
        values.minusDI = lastADX?.minusDI;
        values.slope = recent.length >= 2 ? recent[recent.length - 1] - recent[0] : 0;
        break;
      }
      case 'tidezone': {
        const last = calculatedData.tideZone[calculatedData.tideZone.length - 1];
        if (!last) return null;
        values.value = last.score;
        values.tide = last.tide;
        values.energy = last.energy;
        values.tape = last.tape;
        return {
          headline: tideZoneLabel(last.kind),
          color:
            last.kind === 'follow_buy'
              ? 'text-emerald-400'
              : last.kind === 'bounce_buy'
                ? 'text-amber-400'
                : last.kind === 'sell'
                  ? 'text-red-400'
                  : 'text-slate-400',
          text: `Tide ${(last.tide * 100).toFixed(0)} · Energy ${(last.energy * 100).toFixed(0)} · Tape ${(last.tape * 100).toFixed(0)}`,
          meaning: tideZoneLabel(last.kind),
          lookFor: 'Green = 4h tide follow. Amber = vol bounce against a down tide. Red = sell zone.',
        };
      }
      default:
        return null;
    }
    return buildIndicatorCoach({
      indicator: id,
      candles,
      divergence: id === 'adx' ? { strength: 0, type: 'none' } : div,
      values,
    });
  };

  const CoachReadout = ({ indicator }: { indicator: string }) => {
    const coach = getCoach(indicator);
    if (!coach) return null;
    return (
      <div className="mt-2 pt-2 border-t border-slate-700/80 space-y-1.5">
        <div className={`text-[11px] font-semibold ${coach.color}`}>{coach.headline}</div>
        <p className="text-[12px] leading-relaxed text-slate-200">{coach.meaning}</p>
        <p className="text-[11px] leading-relaxed text-slate-400">
          <span className="text-slate-500 font-medium">What it means / what to watch: </span>
          {coach.lookFor}
        </p>
      </div>
    );
  };

  // Divergence Meter component
  const DivergenceMeter = ({ indicator }: { indicator: string }) => {
    const { strength, type } = getOscillatorDivergence(indicator);
    return (
      <div className="mt-2 pt-2 border-t border-slate-600">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-slate-500 w-7 shrink-0">Div</span>
          <span className="text-sm">🐻‍❄️</span>
          <div className="flex-1 h-2 bg-slate-700 rounded-full relative overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-px h-full bg-slate-500" />
            </div>
            <div 
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-white shadow transition-all duration-500"
              style={{
                left: `calc(50% + ${(strength / DIVERGENCE_MAX_STRENGTH) * DIVERGENCE_MAX_OFFSET_PERCENT}% - ${DIVERGENCE_INDICATOR_RADIUS}px)`,
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
      {/* Active Oscillators Display */}
      {activeOscillators.length > 0 && candles.length > 0 && (
        <div className="space-y-3">
          {activeOscillators.includes('rsi') && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-white">📈 RSI</h4>
                  {(() => {
                    const coach = getCoach('rsi');
                    return coach ? <p className={`text-xs ${coach.color}`}>{coach.headline}</p> : null;
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
              <CoachReadout indicator="rsi" />
            </div>
          )}

          {activeOscillators.includes('macd') && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-white">📊 MACD</h4>
                  {(() => {
                    const coach = getCoach('macd');
                    return coach ? <p className={`text-xs ${coach.color}`}>{coach.headline}</p> : null;
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
              <CoachReadout indicator="macd" />
            </div>
          )}

          {activeOscillators.includes('obv') && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-white">📉 OBV</h4>
                  {(() => {
                    const coach = getCoach('obv');
                    return coach ? <p className={`text-xs ${coach.color}`}>{coach.headline}</p> : null;
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
              <CoachReadout indicator="obv" />
            </div>
          )}

          {activeOscillators.includes('stochRSI') && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-white">🎯 Stochastic RSI</h4>
                  {(() => {
                    const coach = getCoach('stochRSI');
                    return coach ? <p className={`text-xs ${coach.color}`}>{coach.headline}</p> : null;
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
              <DivergenceMeter indicator="stochRSI" />
              <CoachReadout indicator="stochRSI" />
            </div>
          )}

          {activeOscillators.includes('mfi') && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-white">💰 MFI</h4>
                  {(() => {
                    const coach = getCoach('mfi');
                    return coach ? <p className={`text-xs ${coach.color}`}>{coach.headline}</p> : null;
                  })()}
                </div>
                <button
                  onClick={() => toggleOscillator('mfi')}
                  className="text-gray-400 hover:text-red-400 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <MFIPanel data={calculatedData.mfi} period={14} candles={candles} />
              <DivergenceMeter indicator="mfi" />
              <CoachReadout indicator="mfi" />
            </div>
          )}

          {activeOscillators.includes('williamsR') && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-white">🔄 Williams %R</h4>
                  {(() => {
                    const coach = getCoach('williamsR');
                    return coach ? <p className={`text-xs ${coach.color}`}>{coach.headline}</p> : null;
                  })()}
                </div>
                <button
                  onClick={() => toggleOscillator('williamsR')}
                  className="text-gray-400 hover:text-red-400 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <WilliamsRPanel data={calculatedData.williamsR} period={14} candles={candles} />
              <DivergenceMeter indicator="williamsR" />
              <CoachReadout indicator="williamsR" />
            </div>
          )}

          {activeOscillators.includes('cci') && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-white">🌊 CCI</h4>
                  {(() => {
                    const coach = getCoach('cci');
                    return coach ? <p className={`text-xs ${coach.color}`}>{coach.headline}</p> : null;
                  })()}
                </div>
                <button
                  onClick={() => toggleOscillator('cci')}
                  className="text-gray-400 hover:text-red-400 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <CCIPanel data={calculatedData.cci} period={20} candles={candles} />
              <DivergenceMeter indicator="cci" />
              <CoachReadout indicator="cci" />
            </div>
          )}

          {activeOscillators.includes('adx') && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-white">💪 ADX</h4>
                  {(() => {
                    const coach = getCoach('adx');
                    return coach ? <p className={`text-xs ${coach.color}`}>{coach.headline}</p> : null;
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
                data={calculatedData.adx}
                period={14}
                candles={candles}
              />
              <CoachReadout indicator="adx" />
            </div>
          )}

          {activeOscillators.includes('tideZone') && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-white">🌊 Tide Zone</h4>
                  {(() => {
                    const coach = getCoach('tideZone');
                    return coach ? <p className={`text-xs ${coach.color}`}>{coach.headline}</p> : null;
                  })()}
                </div>
                <button
                  onClick={() => toggleOscillator('tideZone')}
                  className="text-gray-400 hover:text-red-400 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="h-[220px]">
                <TideZonePanel data={calculatedData.tideZone} candles={candles} />
              </div>
            </div>
          )}
        </div>
      )}

      {activeOscillators.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-700 bg-slate-800/50 px-4 py-6 text-center text-sm text-slate-400">
          Select one or more oscillators from the dropdown to display them here.
        </div>
      )}
    </>
  );
}
