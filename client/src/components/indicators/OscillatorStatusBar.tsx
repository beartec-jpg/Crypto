import { useMemo } from 'react';

interface OscillatorStatusBarProps {
  rsiValue?: number;
  macdValue?: number;
  macdPrevValue?: number;
  volumePercent?: number;
}

interface Status {
  label: string;
  emoji: string;
  state: string;
}

function getRSIStatus(value: number): Status {
  if (value < 30) return { label: `RSI: ${value.toFixed(0)}`, emoji: '🔴', state: 'OS' };
  if (value > 70) return { label: `RSI: ${value.toFixed(0)}`, emoji: '🔴', state: 'OB' };
  return { label: `RSI: ${value.toFixed(0)}`, emoji: '🟡', state: 'NEU' };
}

function getMACDStatus(value: number, prevValue: number): Status {
  const isPositive = value > 0;
  const isIncreasing = value > prevValue;
  
  if (isPositive && isIncreasing) {
    return { label: `MACD: +${value.toFixed(1)}`, emoji: '🟢', state: 'BULL' };
  } else if (isPositive && !isIncreasing) {
    return { label: `MACD: +${value.toFixed(1)}`, emoji: '🟡', state: 'WEAK' };
  } else if (!isPositive && !isIncreasing) {
    return { label: `MACD: ${value.toFixed(1)}`, emoji: '🔴', state: 'BEAR' };
  } else {
    return { label: `MACD: ${value.toFixed(1)}`, emoji: '🟡', state: 'RECOV' };
  }
}

function getVolumeStatus(percent: number): Status {
  if (percent > 150) return { label: `VOL: ${percent.toFixed(0)}%`, emoji: '🔴', state: 'HIGH' };
  if (percent < 50) return { label: `VOL: ${percent.toFixed(0)}%`, emoji: '🟡', state: 'LOW' };
  return { label: `VOL: ${percent.toFixed(0)}%`, emoji: '🟢', state: 'AVG' };
}

export function OscillatorStatusBar({
  rsiValue,
  macdValue,
  macdPrevValue,
  volumePercent,
}: OscillatorStatusBarProps) {
  const statuses = useMemo(() => {
    const result: Status[] = [];
    
    if (rsiValue !== undefined) {
      result.push(getRSIStatus(rsiValue));
    }
    
    if (macdValue !== undefined && macdPrevValue !== undefined) {
      result.push(getMACDStatus(macdValue, macdPrevValue));
    }
    
    if (volumePercent !== undefined) {
      result.push(getVolumeStatus(volumePercent));
    }
    
    return result;
  }, [rsiValue, macdValue, macdPrevValue, volumePercent]);

  if (statuses.length === 0) return null;

  return (
    <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-2">
      <div className="flex items-center gap-4 text-sm">
        {statuses.map((status, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-muted-foreground">{status.label}</span>
            <span>{status.emoji}</span>
            <span className="font-medium">{status.state}</span>
            {idx < statuses.length - 1 && (
              <span className="text-muted-foreground">|</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
