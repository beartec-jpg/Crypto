import { IChartApi } from 'lightweight-charts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RSIPanel } from './oscillators/RSIPanel';
import { MACDPanel } from './oscillators/MACDPanel';
import { StochasticPanel } from './oscillators/StochasticPanel';
import { OBVPanel } from './oscillators/OBVPanel';
import { MFIPanel } from './oscillators/MFIPanel';
import { WilliamsRPanel } from './oscillators/WilliamsRPanel';
import { CCIPanel } from './oscillators/CCIPanel';
import { ADXPanel } from './oscillators/ADXPanel';
import { calculateRSI, calculateMACD } from '@/lib/indicators/momentum';
import { 
  calculateStochasticRSI, 
  calculateWilliamsR, 
  calculateCCI, 
  calculateADX 
} from '@/lib/indicators';
import { calculateOBV, calculateMFI } from '@/lib/indicators/volume';

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface IndicatorConfig {
  show: boolean;
  period?: number;
  fast?: number;
  slow?: number;
  signal?: number;
}

interface Indicators {
  rsi: IndicatorConfig & { period: number };
  stochRSI: IndicatorConfig & { period: number };
  macd: IndicatorConfig & { fast: number; slow: number; signal: number };
  obv: IndicatorConfig;
  williamsR: IndicatorConfig & { period: number };
  mfi: IndicatorConfig & { period: number };
  cci: IndicatorConfig & { period: number };
  adx: IndicatorConfig & { period: number };
  syncOscillatorScale: boolean;
}

interface OscillatorContainerProps {
  indicators: Indicators;
  candles: CandleData[];
  onOscillatorChartCreated: (name: string, chart: IChartApi) => void;
  getMainChartVisibleRange: () => any;
  isPaidTier: boolean;
  getIndicatorReport?: (indicator: string) => { color: string; text: string } | null;
  getOscillatorDivergence: (indicator: string) => { strength: number; type: string };
}

export function OscillatorContainer({
  indicators,
  candles,
  onOscillatorChartCreated,
  getMainChartVisibleRange,
  isPaidTier,
  getIndicatorReport,
  getOscillatorDivergence,
}: OscillatorContainerProps) {
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

  const TrendStrengthMeter = () => {
    const adxData = calculateADX(candles, indicators.adx.period);
    const lastADX = adxData[adxData.length - 1];
    
    if (!lastADX) {
      return (
        <div className="mt-2 pt-2 border-t border-slate-600">
          <div className="flex items-center gap-2 text-gray-500 text-xs">No data</div>
        </div>
      );
    }
    
    const isBullish = lastADX.plusDI > lastADX.minusDI;
    let strengthValue = 0;
    if (lastADX.adx >= 40) strengthValue = 3;
    else if (lastADX.adx >= 25) strengthValue = 2;
    else if (lastADX.adx >= 15) strengthValue = 1;
    
    const signedStrength = isBullish ? strengthValue : -strengthValue;
    
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
                left: `calc(50% + ${(signedStrength / 3) * 45}% - 6px)`,
                background: signedStrength === 0 
                  ? '#3b82f6' 
                  : signedStrength > 0 
                    ? `linear-gradient(to right, #3b82f6, ${strengthValue === 1 ? '#86efac' : strengthValue === 2 ? '#4ade80' : '#22c55e'})`
                    : `linear-gradient(to left, #3b82f6, ${strengthValue === 1 ? '#fca5a5' : strengthValue === 2 ? '#f87171' : '#ef4444'})`,
              }}
            />
          </div>
          <span className="text-sm">🐂</span>
          {strengthValue > 0 && (
            <span className={`text-xs font-medium ${isBullish ? 'text-green-400' : 'text-red-400'}`}>
              {isBullish ? '▲' : '▼'}{strengthValue}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      {indicators.rsi.show && (() => {
        const report = isPaidTier && getIndicatorReport ? getIndicatorReport('RSI') : null;
        const rsiData = calculateRSI(candles, indicators.rsi.period);
        return (
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-sm">RSI ({indicators.rsi.period})</CardTitle>
                {report && <span className={`text-xs font-medium ${report.color}`}>{report.text}</span>}
              </div>
            </CardHeader>
            <CardContent>
              <RSIPanel 
                data={rsiData}
                period={indicators.rsi.period}
                candles={candles}
                onChartCreated={(chart) => onOscillatorChartCreated('RSI', chart)}
                syncWithMainChart={indicators.syncOscillatorScale}
                mainChartVisibleRange={getMainChartVisibleRange()}
              />
              <DivergenceMeter indicator="RSI" />
            </CardContent>
          </Card>
        );
      })()}
      
      {indicators.stochRSI.show && (() => {
        const report = isPaidTier && getIndicatorReport ? getIndicatorReport('StochRSI') : null;
        const stochData = calculateStochasticRSI(candles, indicators.stochRSI.period);
        return (
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-sm">Stochastic RSI ({indicators.stochRSI.period})</CardTitle>
                {report && <span className={`text-xs font-medium ${report.color}`}>{report.text}</span>}
              </div>
            </CardHeader>
            <CardContent>
              <StochasticPanel 
                data={stochData}
                period={indicators.stochRSI.period}
                candles={candles}
                onChartCreated={(chart) => onOscillatorChartCreated('StochRSI', chart)}
                syncWithMainChart={indicators.syncOscillatorScale}
                mainChartVisibleRange={getMainChartVisibleRange()}
              />
              <DivergenceMeter indicator="StochRSI" />
            </CardContent>
          </Card>
        );
      })()}
      
      {indicators.macd.show && (() => {
        const report = isPaidTier && getIndicatorReport ? getIndicatorReport('MACD') : null;
        const { macd, signal, hist } = calculateMACD(candles, indicators.macd.fast, indicators.macd.slow, indicators.macd.signal);
        return (
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-sm">MACD ({indicators.macd.fast}, {indicators.macd.slow}, {indicators.macd.signal})</CardTitle>
                {report && <span className={`text-xs font-medium ${report.color}`}>{report.text}</span>}
              </div>
            </CardHeader>
            <CardContent>
              <MACDPanel 
                macdData={macd}
                signalData={signal}
                histogramData={hist}
                fastPeriod={indicators.macd.fast}
                slowPeriod={indicators.macd.slow}
                signalPeriod={indicators.macd.signal}
                onChartCreated={(chart) => onOscillatorChartCreated('MACD', chart)}
                syncWithMainChart={indicators.syncOscillatorScale}
                mainChartVisibleRange={getMainChartVisibleRange()}
              />
              <DivergenceMeter indicator="MACD" />
            </CardContent>
          </Card>
        );
      })()}
      
      {indicators.obv.show && (() => {
        const report = isPaidTier && getIndicatorReport ? getIndicatorReport('OBV') : null;
        const obvData = calculateOBV(candles);
        return (
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-sm">On-Balance Volume</CardTitle>
                {report && <span className={`text-xs font-medium ${report.color}`}>{report.text}</span>}
              </div>
            </CardHeader>
            <CardContent>
              <OBVPanel 
                data={obvData}
                onChartCreated={(chart) => onOscillatorChartCreated('OBV', chart)}
                syncWithMainChart={indicators.syncOscillatorScale}
                mainChartVisibleRange={getMainChartVisibleRange()}
              />
              <DivergenceMeter indicator="OBV" />
            </CardContent>
          </Card>
        );
      })()}
      
      {indicators.williamsR.show && (() => {
        const report = isPaidTier && getIndicatorReport ? getIndicatorReport('WilliamsR') : null;
        const williamsRData = calculateWilliamsR(candles, indicators.williamsR.period);
        return (
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-sm">Williams %R ({indicators.williamsR.period})</CardTitle>
                {report && <span className={`text-xs font-medium ${report.color}`}>{report.text}</span>}
              </div>
            </CardHeader>
            <CardContent>
              <WilliamsRPanel 
                data={williamsRData}
                period={indicators.williamsR.period}
                candles={candles}
                onChartCreated={(chart) => onOscillatorChartCreated('WilliamsR', chart)}
                syncWithMainChart={indicators.syncOscillatorScale}
                mainChartVisibleRange={getMainChartVisibleRange()}
              />
              <DivergenceMeter indicator="WilliamsR" />
            </CardContent>
          </Card>
        );
      })()}
      
      {indicators.mfi.show && (() => {
        const report = isPaidTier && getIndicatorReport ? getIndicatorReport('MFI') : null;
        const mfiData = calculateMFI(candles, indicators.mfi.period);
        return (
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-sm">Money Flow Index ({indicators.mfi.period})</CardTitle>
                {report && <span className={`text-xs font-medium ${report.color}`}>{report.text}</span>}
              </div>
            </CardHeader>
            <CardContent>
              <MFIPanel 
                data={mfiData}
                period={indicators.mfi.period}
                candles={candles}
                onChartCreated={(chart) => onOscillatorChartCreated('MFI', chart)}
                syncWithMainChart={indicators.syncOscillatorScale}
                mainChartVisibleRange={getMainChartVisibleRange()}
              />
              <DivergenceMeter indicator="MFI" />
            </CardContent>
          </Card>
        );
      })()}
      
      {indicators.cci.show && (() => {
        const report = isPaidTier && getIndicatorReport ? getIndicatorReport('CCI') : null;
        const cciData = calculateCCI(candles, indicators.cci.period);
        return (
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-sm">CCI ({indicators.cci.period})</CardTitle>
                {report && <span className={`text-xs font-medium ${report.color}`}>{report.text}</span>}
              </div>
            </CardHeader>
            <CardContent>
              <CCIPanel 
                data={cciData}
                period={indicators.cci.period}
                candles={candles}
                onChartCreated={(chart) => onOscillatorChartCreated('CCI', chart)}
                syncWithMainChart={indicators.syncOscillatorScale}
                mainChartVisibleRange={getMainChartVisibleRange()}
              />
              <DivergenceMeter indicator="CCI" />
            </CardContent>
          </Card>
        );
      })()}
      
      {indicators.adx.show && (() => {
        const report = isPaidTier && getIndicatorReport ? getIndicatorReport('ADX') : null;
        const adxData = calculateADX(candles, indicators.adx.period);
        return (
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-sm">ADX ({indicators.adx.period})</CardTitle>
                {report && <span className={`text-xs font-medium ${report.color}`}>{report.text}</span>}
              </div>
            </CardHeader>
            <CardContent>
              <ADXPanel 
                data={adxData}
                period={indicators.adx.period}
                candles={candles}
                onChartCreated={(chart) => onOscillatorChartCreated('ADX', chart)}
                syncWithMainChart={indicators.syncOscillatorScale}
                mainChartVisibleRange={getMainChartVisibleRange()}
              />
              <TrendStrengthMeter />
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
