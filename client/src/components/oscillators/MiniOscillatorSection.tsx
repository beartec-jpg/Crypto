import type { OscillatorData } from '@/hooks/useOscillatorData';
import type { ScoringInput } from '@/lib/tradingSystemScoring';
import type { SystemEvaluation } from '@/types/systemScoring';

const VOLUME_UP_COLOR = '#26a69a';

interface MiniOscillatorSectionProps {
  miniOscillators: Set<string>;
  oscillatorData: OscillatorData;
  onCycleMode: (id: string) => void;
  smartMoneyPanelData?: {
    scoringInput: ScoringInput | null;
    evaluation: SystemEvaluation | null;
  };
}

// Helper to get RSI status
function getRSIStatus(value: number): { label: string; color: string } {
  if (value >= 70) return { label: 'Overbought', color: 'text-red-400' };
  if (value <= 30) return { label: 'Oversold', color: 'text-green-400' };
  if (value > 50) return { label: 'Bullish', color: 'text-green-400' };
  return { label: 'Bearish', color: 'text-red-400' };
}

// Helper to get MACD status
function getMACDStatus(macd: number, signal: number): { label: string; color: string } {
  if (macd > signal) return { label: 'Bullish', color: 'text-green-400' };
  return { label: 'Bearish', color: 'text-red-400' };
}

// Helper to get Volume status (compared to average)
function getVolumeStatus(current: number, data: { value: number }[]): { label: string; color: string; icon: 'up' | 'down' } {
  if (data.length < 20) return { label: 'Normal', color: 'text-slate-400', icon: 'up' };
  const avg = data.slice(-20).reduce((sum, d) => sum + d.value, 0) / 20;
  if (current > avg * 1.5) return { label: 'High', color: 'text-green-400', icon: 'up' };
  if (current < avg * 0.5) return { label: 'Low', color: 'text-red-400', icon: 'down' };
  return { label: 'Normal', color: 'text-slate-400', icon: 'up' };
}

// Helper to get StochRSI status
function getStochRSIStatus(k: number, d: number): { label: string; value: string; color: string; zone: string } {
  const direction = k > d ? '↑' : '↓';
  if (k <= 20) return { label: 'StochRSI', value: `${k.toFixed(0)} ${direction}`, color: 'text-green-400', zone: 'OS' };
  if (k >= 80) return { label: 'StochRSI', value: `${k.toFixed(0)} ${direction}`, color: 'text-red-400', zone: 'OB' };
  return { label: 'StochRSI', value: `${k.toFixed(0)} ${direction}`, color: 'text-yellow-400', zone: 'NEU' };
}

// Helper to get Williams %R status
function getWilliamsRStatus(value: number): { label: string; value: string; color: string; zone: string } {
  if (value <= -80) return { label: 'W%R', value: `${value.toFixed(0)}`, color: 'text-green-400', zone: 'OS' };
  if (value >= -20) return { label: 'W%R', value: `${value.toFixed(0)}`, color: 'text-red-400', zone: 'OB' };
  return { label: 'W%R', value: `${value.toFixed(0)}`, color: 'text-yellow-400', zone: 'NEU' };
}

// Helper to get CCI status
function getCCIStatus(value: number): { label: string; value: string; color: string; zone: string } {
  const sign = value >= 0 ? '+' : '';
  if (value <= -100) return { label: 'CCI', value: `${sign}${value.toFixed(0)}`, color: 'text-green-400', zone: 'OS' };
  if (value >= 100) return { label: 'CCI', value: `${sign}${value.toFixed(0)}`, color: 'text-red-400', zone: 'OB' };
  return { label: 'CCI', value: `${sign}${value.toFixed(0)}`, color: 'text-yellow-400', zone: 'NEU' };
}

// Helper to get ADX status
function getADXStatus(adx: number, plusDI: number, minusDI: number): { label: string; value: string; color: string; zone: string } {
  const direction = plusDI > minusDI ? '↑' : '↓';
  if (adx < 20) return { label: 'ADX', value: `${adx.toFixed(0)} ${direction}`, color: 'text-yellow-400', zone: 'Weak' };
  if (adx <= 40) return { label: 'ADX', value: `${adx.toFixed(0)} ${direction}`, color: 'text-green-400', zone: 'Strong' };
  return { label: 'ADX', value: `${adx.toFixed(0)} ${direction}`, color: 'text-blue-400', zone: 'V.Strong' };
}

// Helper to get OBV status
function getOBVStatus(current: number, previous: number, priceUp: boolean): { label: string; value: string; color: string; zone: string } {
  const obvUp = current > previous;
  if (obvUp && priceUp) return { label: 'OBV', value: '↑', color: 'text-green-400', zone: 'Acc' };
  if (!obvUp && !priceUp) return { label: 'OBV', value: '↓', color: 'text-red-400', zone: 'Dist' };
  return { label: 'OBV', value: obvUp ? '↑' : '↓', color: 'text-yellow-400', zone: 'Div' };
}

// Helper to get MFI status
function getMFIStatus(value: number): { label: string; value: string; color: string; zone: string } {
  if (value <= 20) return { label: 'MFI', value: `${value.toFixed(0)}`, color: 'text-green-400', zone: 'OS' };
  if (value >= 80) return { label: 'MFI', value: `${value.toFixed(0)}`, color: 'text-red-400', zone: 'OB' };
  return { label: 'MFI', value: `${value.toFixed(0)}`, color: 'text-yellow-400', zone: 'NEU' };
}

function getCMFStatus(value: number): { label: string; value: string; color: string; zone: string } {
  if (value > 0.1) return { label: 'CMF', value: value.toFixed(2), color: 'text-green-400', zone: 'Buy' };
  if (value < -0.1) return { label: 'CMF', value: value.toFixed(2), color: 'text-red-400', zone: 'Sell' };
  return { label: 'CMF', value: value.toFixed(2), color: 'text-yellow-400', zone: 'NEU' };
}

function getWaddahStatus(value: number, explosion: number): { label: string; value: string; color: string; zone: string } {
  const isExplosive = Math.abs(value) > explosion;
  if (value > 0) return { label: 'WAE', value: value.toFixed(2), color: 'text-green-400', zone: isExplosive ? 'BOOM' : 'Bull' };
  if (value < 0) return { label: 'WAE', value: value.toFixed(2), color: 'text-red-400', zone: isExplosive ? 'BOOM' : 'Bear' };
  return { label: 'WAE', value: value.toFixed(2), color: 'text-yellow-400', zone: 'Flat' };
}

function getTSIStatus(tsi: number, signal: number): { label: string; value: string; color: string; zone: string } {
  if (tsi > signal) return { label: 'TSI', value: tsi.toFixed(1), color: 'text-green-400', zone: 'Bull' };
  if (tsi < signal) return { label: 'TSI', value: tsi.toFixed(1), color: 'text-red-400', zone: 'Bear' };
  return { label: 'TSI', value: tsi.toFixed(1), color: 'text-yellow-400', zone: 'NEU' };
}

function getKlingerStatus(klinger: number, signal: number): { label: string; value: string; color: string; zone: string } {
  if (klinger > signal) return { label: 'KL', value: klinger.toFixed(0), color: 'text-green-400', zone: 'Bull' };
  if (klinger < signal) return { label: 'KL', value: klinger.toFixed(0), color: 'text-red-400', zone: 'Bear' };
  return { label: 'KL', value: klinger.toFixed(0), color: 'text-yellow-400', zone: 'NEU' };
}

export function MiniOscillatorSection({
  miniOscillators,
  oscillatorData,
  onCycleMode,
  smartMoneyPanelData,
}: MiniOscillatorSectionProps) {
  if (miniOscillators.size === 0) return null;

  const newMiniItems: Array<{ id: string; label: string; value: string; color: string; zone: string }> = [];

  if (miniOscillators.has('rsi') && oscillatorData.rsi.length > 0) {
    const lastRSI = oscillatorData.rsi[oscillatorData.rsi.length - 1].value;
    const s = getRSIStatus(lastRSI);
    newMiniItems.push({ id: 'rsi', label: 'RSI', value: lastRSI.toFixed(1), color: s.color, zone: s.label });
  }

  if (miniOscillators.has('macd') && oscillatorData.macd.macd.length > 0) {
    const lastMACD = oscillatorData.macd.macd[oscillatorData.macd.macd.length - 1].value;
    const lastSignal = oscillatorData.macd.signal[oscillatorData.macd.signal.length - 1]?.value ?? 0;
    const s = getMACDStatus(lastMACD, lastSignal);
    newMiniItems.push({ id: 'macd', label: 'MACD', value: lastMACD.toFixed(4), color: s.color, zone: s.label });
  }

  if (miniOscillators.has('waddah') && oscillatorData.waddah.histogram.length > 0) {
    const lastHist = oscillatorData.waddah.histogram[oscillatorData.waddah.histogram.length - 1].value;
    const lastExplosion = oscillatorData.waddah.explosion.length > 0
      ? oscillatorData.waddah.explosion[oscillatorData.waddah.explosion.length - 1].value
      : 0;
    const s = getWaddahStatus(lastHist, lastExplosion);
    newMiniItems.push({ id: 'waddah', label: s.label, value: s.value, color: s.color, zone: s.zone });
  }

  if (miniOscillators.has('cmf') && oscillatorData.cmf.length > 0) {
    const lastCMF = oscillatorData.cmf[oscillatorData.cmf.length - 1].value;
    const s = getCMFStatus(lastCMF);
    newMiniItems.push({ id: 'cmf', label: s.label, value: s.value, color: s.color, zone: s.zone });
  }

  if (miniOscillators.has('volume') && oscillatorData.volume.length > 0) {
    const lastVolume = oscillatorData.volume[oscillatorData.volume.length - 1].value;
    let formattedValue: string;
    if (lastVolume >= 1000000) {
      formattedValue = `${(lastVolume / 1000000).toFixed(1)}M`;
    } else if (lastVolume >= 1000) {
      formattedValue = `${(lastVolume / 1000).toFixed(0)}K`;
    } else {
      formattedValue = lastVolume.toFixed(0);
    }
    const s = getVolumeStatus(lastVolume, oscillatorData.volume);
    newMiniItems.push({ id: 'volume', label: 'VOL', value: formattedValue, color: s.color, zone: s.label });
  }

  if (miniOscillators.has('stochRsi') && oscillatorData.stochRsi.length > 0) {
    const last = oscillatorData.stochRsi[oscillatorData.stochRsi.length - 1];
    const s = getStochRSIStatus(last.k, last.d);
    newMiniItems.push({ id: 'stochRsi', label: s.label, value: s.value, color: s.color, zone: s.zone });
  }

  if (miniOscillators.has('tsi') && oscillatorData.tsi.tsi.length > 0) {
    const tsiLen = oscillatorData.tsi.tsi.length;
    const signalLen = oscillatorData.tsi.signal.length;
    const lastTSI = oscillatorData.tsi.tsi[tsiLen - 1].value;
    const lastSignal = signalLen > 0 ? oscillatorData.tsi.signal[signalLen - 1].value : lastTSI;
    const s = getTSIStatus(lastTSI, lastSignal);
    newMiniItems.push({ id: 'tsi', label: s.label, value: s.value, color: s.color, zone: s.zone });
  }

  if (miniOscillators.has('williamsR') && oscillatorData.williamsR.length > 0) {
    const last = oscillatorData.williamsR[oscillatorData.williamsR.length - 1].value;
    const s = getWilliamsRStatus(last);
    newMiniItems.push({ id: 'williamsR', label: s.label, value: s.value, color: s.color, zone: s.zone });
  }

  if (miniOscillators.has('cci') && oscillatorData.cci.length > 0) {
    const last = oscillatorData.cci[oscillatorData.cci.length - 1].value;
    const s = getCCIStatus(last);
    newMiniItems.push({ id: 'cci', label: s.label, value: s.value, color: s.color, zone: s.zone });
  }

  if (miniOscillators.has('adx') && oscillatorData.adx.length > 0) {
    const last = oscillatorData.adx[oscillatorData.adx.length - 1];
    const s = getADXStatus(last.adx, last.plusDI, last.minusDI);
    newMiniItems.push({ id: 'adx', label: s.label, value: s.value, color: s.color, zone: s.zone });
  }

  if (miniOscillators.has('obv') && oscillatorData.obv.length >= 2) {
    const len = oscillatorData.obv.length;
    const current = oscillatorData.obv[len - 1].value;
    const previous = oscillatorData.obv[len - 2].value;
    const lastVolumeEntry = oscillatorData.volume[oscillatorData.volume.length - 1];
    const priceUp = lastVolumeEntry ? lastVolumeEntry.color === VOLUME_UP_COLOR : current > previous;
    const s = getOBVStatus(current, previous, priceUp);
    newMiniItems.push({ id: 'obv', label: s.label, value: s.value, color: s.color, zone: s.zone });
  }

  if (miniOscillators.has('mfi') && oscillatorData.mfi.length > 0) {
    const last = oscillatorData.mfi[oscillatorData.mfi.length - 1].value;
    const s = getMFIStatus(last);
    newMiniItems.push({ id: 'mfi', label: s.label, value: s.value, color: s.color, zone: s.zone });
  }

  if (miniOscillators.has('klinger') && oscillatorData.klinger.klinger.length > 0) {
    const klingerLen = oscillatorData.klinger.klinger.length;
    const signalLen = oscillatorData.klinger.signal.length;
    const lastKlinger = oscillatorData.klinger.klinger[klingerLen - 1].value;
    const lastSignal = signalLen > 0 ? oscillatorData.klinger.signal[signalLen - 1].value : lastKlinger;
    const s = getKlingerStatus(lastKlinger, lastSignal);
    newMiniItems.push({ id: 'klinger', label: s.label, value: s.value, color: s.color, zone: s.zone });
  }

  if (miniOscillators.has('smartMoney') && smartMoneyPanelData?.evaluation) {
    const score = smartMoneyPanelData.evaluation.score ?? 0;
    const zone = score >= 20 ? 'BULL' : score <= -20 ? 'BEAR' : 'NEU';
    const color = score >= 20 ? 'text-green-400' : score <= -20 ? 'text-red-400' : 'text-yellow-400';
    newMiniItems.push({
      id: 'smartMoney',
      label: 'SMC',
      value: `${score > 0 ? '+' : ''}${Math.round(score)}`,
      color,
      zone,
    });
  }

  return (
    <div className="absolute left-2 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2">
      {newMiniItems.map(({ id, label, value, color, zone }) => (
        <div
          key={id}
          onClick={() => onCycleMode(id)}
          className="bg-slate-800/90 backdrop-blur-sm rounded px-2 py-1.5 cursor-pointer hover:bg-slate-700/90 transition-colors min-w-[56px]"
        >
          <div className="text-[10px] text-slate-400 truncate">{label}</div>
          <div className={`text-xs font-medium ${color}`}>{value}</div>
          <div className={`text-[10px] ${color}`}>{zone}</div>
        </div>
      ))}
    </div>
  );
}
