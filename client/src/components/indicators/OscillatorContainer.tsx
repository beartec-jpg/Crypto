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
  // Early return if no candle data available
  if (!candles || candles.length === 0) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="flex items-center justify-center h-48">
            <p className="text-gray-400 text-sm">Loading candle data...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

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
    // Safety check: ensure candles array has data
    if (!candles || candles.length === 0) {
      return (
        <div className="mt-2 pt-2 border-t border-slate-600">
          <div className="flex items-center gap-2 text-gray-500 text-xs">Loading...</div>
        </div>
      );
    }
    
    const adxData = calculateADX(candles, indicators.adx.period);
    const lastADX = adxData && adxData.length > 0 ? adxData[adxData.length - 1] : null;
    
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
        try {
          const report = isPaidTier && getIndicatorReport ? getIndicatorReport('RSI') : null;
          const rsiData = calculateRSI(candles, indicators.rsi.period);
          
          // Safety check: ensure RSI data was calculated
          if (!rsiData || rsiData.length === 0) {
            return (
              <Card key="rsi-card" className="bg-slate-800 border-slate-700">
                <CardHeader className="pb-1">
                  <CardTitle className="text-white text-sm">RSI ({indicators.rsi.period})</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center h-48">
                  <p className="text-gray-400 text-sm">Calculating RSI...</p>
                </CardContent>
              </Card>
            );
          }
          
          return (
            <Card key="rsi-card" className="bg-slate-800 border-slate-700">
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
        } catch (error) {
          console.error('Error calculating RSI:', error);
          return (
            <Card key="rsi-card-error" className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-1">
                <CardTitle className="text-white text-sm">RSI ({indicators.rsi.period})</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center h-48">
                <p className="text-red-400 text-sm">Error loading RSI</p>
              </CardContent>
            </Card>
          );
        }
      })()}
      
      {indicators.stochRSI.show && (() => {
        try {
          const report = isPaidTier && getIndicatorReport ? getIndicatorReport('StochRSI') : null;
          const stochData = calculateStochasticRSI(candles, indicators.stochRSI.period);
          
          if (!stochData || stochData.length === 0) {
            return (
              <Card key="stoch-card" className="bg-slate-800 border-slate-700">
                <CardHeader className="pb-1">
                  <CardTitle className="text-white text-sm">Stochastic RSI ({indicators.stochRSI.period})</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center h-48">
                  <p className="text-gray-400 text-sm">Calculating Stochastic RSI...</p>
                </CardContent>
              </Card>
            );
          }
          
          return (
            <Card key="stoch-card" className="bg-slate-800 border-slate-700">
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
        } catch (error) {
          console.error('Error calculating Stochastic RSI:', error);
          return (
            <Card key="stoch-card-error" className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-1">
                <CardTitle className="text-white text-sm">Stochastic RSI ({indicators.stochRSI.period})</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center h-48">
                <p className="text-red-400 text-sm">Error loading Stochastic RSI</p>
              </CardContent>
            </Card>
          );
        }
      })()}
      
      {indicators.macd.show && (() => {
        try {
          const report = isPaidTier && getIndicatorReport ? getIndicatorReport('MACD') : null;
          const { macd, signal, hist } = calculateMACD(candles, indicators.macd.fast, indicators.macd.slow, indicators.macd.signal);
          
          if (!macd || macd.length === 0 || !signal || !hist) {
            return (
              <Card key="macd-card" className="bg-slate-800 border-slate-700">
                <CardHeader className="pb-1">
                  <CardTitle className="text-white text-sm">MACD ({indicators.macd.fast}, {indicators.macd.slow}, {indicators.macd.signal})</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center h-48">
                  <p className="text-gray-400 text-sm">Calculating MACD...</p>
                </CardContent>
              </Card>
            );
          }
          
          return (
            <Card key="macd-card" className="bg-slate-800 border-slate-700">
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
        } catch (error) {
          console.error('Error calculating MACD:', error);
          return (
            <Card key="macd-card-error" className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-1">
                <CardTitle className="text-white text-sm">MACD ({indicators.macd.fast}, {indicators.macd.slow}, {indicators.macd.signal})</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center h-48">
                <p className="text-red-400 text-sm">Error loading MACD</p>
              </CardContent>
            </Card>
          );
        }
      })()}
      
      {indicators.obv.show && (() => {
        try {
          const report = isPaidTier && getIndicatorReport ? getIndicatorReport('OBV') : null;
          const obvData = calculateOBV(candles);
          
          if (!obvData || obvData.length === 0) {
            return (
              <Card key="obv-card" className="bg-slate-800 border-slate-700">
                <CardHeader className="pb-1">
                  <CardTitle className="text-white text-sm">On-Balance Volume</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center h-48">
                  <p className="text-gray-400 text-sm">Calculating OBV...</p>
                </CardContent>
              </Card>
            );
          }
          
          return (
            <Card key="obv-card" className="bg-slate-800 border-slate-700">
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
        } catch (error) {
          console.error('Error calculating OBV:', error);
          return (
            <Card key="obv-card-error" className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-1">
                <CardTitle className="text-white text-sm">On-Balance Volume</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center h-48">
                <p className="text-red-400 text-sm">Error loading OBV</p>
              </CardContent>
            </Card>
          );
        }
      })()}
      
      {indicators.williamsR.show && (() => {
        try {
          const report = isPaidTier && getIndicatorReport ? getIndicatorReport('WilliamsR') : null;
          const williamsRData = calculateWilliamsR(candles, indicators.williamsR.period);
          
          console.log('[OscillatorContainer] Williams %R data calculated:', williamsRData?.length || 0, 'points');
          
          if (!williamsRData || williamsRData.length === 0) {
            console.warn('[OscillatorContainer] Williams %R calculation returned empty array');
            return (
              <Card key="williamsr-card" className="bg-slate-800 border-slate-700">
                <CardHeader className="pb-1">
                  <CardTitle className="text-white text-sm">Williams %R ({indicators.williamsR.period})</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center h-48">
                  <p className="text-gray-400 text-sm">Calculating Williams %R...</p>
                </CardContent>
              </Card>
            );
          }
          
          return (
            <Card key="williamsr-card" className="bg-slate-800 border-slate-700">
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
        } catch (error) {
          console.error('Error calculating Williams %R:', error);
          return (
            <Card key="williamsr-card-error" className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-1">
                <CardTitle className="text-white text-sm">Williams %R ({indicators.williamsR.period})</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center h-48">
                <p className="text-red-400 text-sm">Error loading Williams %R</p>
              </CardContent>
            </Card>
          );
        }
      })()}
      
      {indicators.mfi.show && (() => {
        try {
          const report = isPaidTier && getIndicatorReport ? getIndicatorReport('MFI') : null;
          const mfiData = calculateMFI(candles, indicators.mfi.period);
          
          console.log('[OscillatorContainer] MFI data calculated:', mfiData?.length || 0, 'points');
          
          if (!mfiData || mfiData.length === 0) {
            console.warn('[OscillatorContainer] MFI calculation returned empty array');
            return (
              <Card key="mfi-card" className="bg-slate-800 border-slate-700">
                <CardHeader className="pb-1">
                  <CardTitle className="text-white text-sm">Money Flow Index ({indicators.mfi.period})</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center h-48">
                  <p className="text-gray-400 text-sm">Calculating MFI...</p>
                </CardContent>
              </Card>
            );
          }
          
          return (
            <Card key="mfi-card" className="bg-slate-800 border-slate-700">
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
        } catch (error) {
          console.error('Error calculating MFI:', error);
          return (
            <Card key="mfi-card-error" className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-1">
                <CardTitle className="text-white text-sm">Money Flow Index ({indicators.mfi.period})</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center h-48">
                <p className="text-red-400 text-sm">Error loading MFI</p>
              </CardContent>
            </Card>
          );
        }
      })()}
      
      {indicators.cci.show && (() => {
        try {
          const report = isPaidTier && getIndicatorReport ? getIndicatorReport('CCI') : null;
          const cciData = calculateCCI(candles, indicators.cci.period);
          
          console.log('[OscillatorContainer] CCI data calculated:', cciData?.length || 0, 'points');
          
          if (!cciData || cciData.length === 0) {
            console.warn('[OscillatorContainer] CCI calculation returned empty array');
            return (
              <Card key="cci-card" className="bg-slate-800 border-slate-700">
                <CardHeader className="pb-1">
                  <CardTitle className="text-white text-sm">CCI ({indicators.cci.period})</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center h-48">
                  <p className="text-gray-400 text-sm">Calculating CCI...</p>
                </CardContent>
              </Card>
            );
          }
          
          return (
            <Card key="cci-card" className="bg-slate-800 border-slate-700">
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
        } catch (error) {
          console.error('Error calculating CCI:', error);
          return (
            <Card key="cci-card-error" className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-1">
                <CardTitle className="text-white text-sm">CCI ({indicators.cci.period})</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center h-48">
                <p className="text-red-400 text-sm">Error loading CCI</p>
              </CardContent>
            </Card>
          );
        }
      })()}
      
      {indicators.adx.show && (() => {
        try {
          const report = isPaidTier && getIndicatorReport ? getIndicatorReport('ADX') : null;
          const adxData = calculateADX(candles, indicators.adx.period);
          
          if (!adxData || adxData.length === 0) {
            return (
              <Card key="adx-card" className="bg-slate-800 border-slate-700">
                <CardHeader className="pb-1">
                  <CardTitle className="text-white text-sm">ADX ({indicators.adx.period})</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center h-48">
                  <p className="text-gray-400 text-sm">Calculating ADX...</p>
                </CardContent>
              </Card>
            );
          }
          
          return (
            <Card key="adx-card" className="bg-slate-800 border-slate-700">
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
        } catch (error) {
          console.error('Error calculating ADX:', error);
          return (
            <Card key="adx-card-error" className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-1">
                <CardTitle className="text-white text-sm">ADX ({indicators.adx.period})</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center h-48">
                <p className="text-red-400 text-sm">Error loading ADX</p>
              </CardContent>
            </Card>
          );
        }
      })()}
    </div>
  );
}
