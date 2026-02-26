/**
 * HTF Bias Panel – displays Higher Timeframe trend direction in the top-right
 * corner of the fullscreen chart.  Shows Daily / 4H / 1H / 15m bias badges.
 */

import { TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import type { HTFBiasEntry } from '@/types/htfBias';
import type { Bias } from '@/types/candle';

interface HTFBiasPanelProps {
  entries: HTFBiasEntry[];
}

function BiasIcon({ bias, isLoading }: { bias: Bias; isLoading: boolean }) {
  if (isLoading) {
    return <Loader2 className="h-3 w-3 animate-spin text-slate-400" />;
  }
  switch (bias) {
    case 'bullish':
      return <TrendingUp className="h-3 w-3 text-green-400" />;
    case 'bearish':
      return <TrendingDown className="h-3 w-3 text-red-400" />;
    default:
      return <Minus className="h-3 w-3 text-yellow-400" />;
  }
}

function biasBg(bias: Bias, isLoading: boolean): string {
  if (isLoading) return 'bg-slate-700/60';
  switch (bias) {
    case 'bullish':
      return 'bg-green-950/70 border-green-700/50';
    case 'bearish':
      return 'bg-red-950/70 border-red-700/50';
    default:
      return 'bg-yellow-950/50 border-yellow-700/40';
  }
}

function biasText(bias: Bias, isLoading: boolean): string {
  if (isLoading) return 'text-slate-400';
  switch (bias) {
    case 'bullish':
      return 'text-green-400';
    case 'bearish':
      return 'text-red-400';
    default:
      return 'text-yellow-400';
  }
}

export function HTFBiasPanel({ entries }: HTFBiasPanelProps) {
  if (entries.length === 0) return null;

  return (
    <div className="absolute top-2 right-2 z-20 flex flex-col gap-1 pointer-events-none select-none">
      {entries.map((entry) => (
        <div
          key={entry.timeframe}
          className={`flex items-center gap-1.5 px-2 py-1 rounded border backdrop-blur-sm ${biasBg(entry.bias, entry.isLoading)}`}
        >
          <span className="text-slate-300 text-xs font-semibold w-6 shrink-0">
            {entry.label}
          </span>
          <BiasIcon bias={entry.bias} isLoading={entry.isLoading} />
          <span className={`text-xs font-medium capitalize ${biasText(entry.bias, entry.isLoading)}`}>
            {entry.isLoading ? '…' : entry.bias}
          </span>
        </div>
      ))}
    </div>
  );
}
