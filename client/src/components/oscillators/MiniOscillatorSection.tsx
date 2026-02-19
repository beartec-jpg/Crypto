import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import type { OscillatorData } from '@/hooks/useOscillatorData';

interface MiniOscillatorSectionProps {
  miniOscillators: Set<string>;
  oscillatorData: OscillatorData;
  onToggleMode: (id: string) => void;
}

// Helper to get RSI status
function getRSIStatus(value: number): { label: string; color: string; icon: 'up' | 'down' | 'warning' } {
  if (value >= 70) return { label: 'Overbought', color: 'text-red-400', icon: 'warning' };
  if (value <= 30) return { label: 'Oversold', color: 'text-green-400', icon: 'warning' };
  if (value > 50) return { label: 'Bullish', color: 'text-green-400', icon: 'up' };
  return { label: 'Bearish', color: 'text-red-400', icon: 'down' };
}

// Helper to get MACD status
function getMACDStatus(macd: number, signal: number): { label: string; color: string; icon: 'up' | 'down' } {
  if (macd > signal) return { label: 'Bullish', color: 'text-green-400', icon: 'up' };
  return { label: 'Bearish', color: 'text-red-400', icon: 'down' };
}

// Helper to get Volume status (compared to average)
function getVolumeStatus(current: number, data: { value: number }[]): { label: string; color: string; icon: 'up' | 'down' } {
  if (data.length < 20) return { label: 'Normal', color: 'text-slate-400', icon: 'up' };
  const avg = data.slice(-20).reduce((sum, d) => sum + d.value, 0) / 20;
  if (current > avg * 1.5) return { label: 'High', color: 'text-green-400', icon: 'up' };
  if (current < avg * 0.5) return { label: 'Low', color: 'text-red-400', icon: 'down' };
  return { label: 'Normal', color: 'text-slate-400', icon: 'up' };
}

export function MiniOscillatorSection({
  miniOscillators,
  oscillatorData,
  onToggleMode,
}: MiniOscillatorSectionProps) {
  if (miniOscillators.size === 0) return null;

  const renderIcon = (type: 'up' | 'down' | 'warning') => {
    switch (type) {
      case 'up': return <TrendingUp className="h-3 w-3" />;
      case 'down': return <TrendingDown className="h-3 w-3" />;
      case 'warning': return <AlertTriangle className="h-3 w-3" />;
    }
  };

  const miniItems: Array<{ id: string; label: string; value: string; status: { label: string; color: string; icon: 'up' | 'down' | 'warning' } }> = [];

  if (miniOscillators.has('rsi') && oscillatorData.rsi.length > 0) {
    const lastRSI = oscillatorData.rsi[oscillatorData.rsi.length - 1].value;
    miniItems.push({
      id: 'rsi',
      label: 'RSI',
      value: lastRSI.toFixed(1),
      status: getRSIStatus(lastRSI),
    });
  }

  if (miniOscillators.has('macd') && oscillatorData.macd.macd.length > 0) {
    const lastMACD = oscillatorData.macd.macd[oscillatorData.macd.macd.length - 1].value;
    const lastSignal = oscillatorData.macd.signal[oscillatorData.macd.signal.length - 1]?.value ?? 0;
    miniItems.push({
      id: 'macd',
      label: 'MACD',
      value: lastMACD.toFixed(4),
      status: getMACDStatus(lastMACD, lastSignal),
    });
  }

  if (miniOscillators.has('volume') && oscillatorData.volume.length > 0) {
    const lastVolume = oscillatorData.volume[oscillatorData.volume.length - 1].value;
    miniItems.push({
      id: 'volume',
      label: 'VOL',
      value: lastVolume >= 1000000 ? `${(lastVolume / 1000000).toFixed(1)}M` : `${(lastVolume / 1000).toFixed(0)}K`,
      status: getVolumeStatus(lastVolume, oscillatorData.volume),
    });
  }

  return (
    <div className="absolute left-2 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2">
      {miniItems.map(({ id, label, value, status }) => (
        <div
          key={id}
          onClick={() => onToggleMode(id)}
          className="bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg px-3 py-2 cursor-pointer hover:bg-slate-800 transition-colors min-w-[80px]"
        >
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
          <div className="text-sm font-mono text-white">{value}</div>
          <div className={`flex items-center gap-1 text-[10px] ${status.color}`}>
            {renderIcon(status.icon)}
            <span>{status.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
