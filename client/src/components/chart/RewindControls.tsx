import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RewindControlsProps {
  currentPosition: number | null; // null = LIVE
  totalCandles: number;
  onStepBack: () => void;
  onStepForward: () => void;
  onGoLive: () => void;
}

export function RewindControls({
  currentPosition,
  totalCandles,
  onStepBack,
  onStepForward,
  onGoLive,
}: RewindControlsProps) {
  const isLive = currentPosition === null;
  const displayPosition = isLive ? totalCandles : currentPosition;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-2 bg-slate-900/95 border border-slate-700 rounded-lg px-4 py-2 shadow-xl">
        {/* Back Button */}
        <button
          onClick={onStepBack}
          disabled={displayPosition <= 50}
          className={cn(
            'p-2 rounded transition-colors',
            displayPosition <= 50
              ? 'text-slate-600 cursor-not-allowed'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white',
          )}
          title="Previous candle"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Position Display */}
        <div className="px-4 py-1 bg-slate-800 rounded border border-slate-700">
          <div className="text-xs text-slate-400 text-center mb-0.5">
            {isLive ? 'LIVE' : 'REWIND'}
          </div>
          <div className="text-sm font-mono text-white">
            {displayPosition} / {totalCandles}
          </div>
        </div>

        {/* Forward Button */}
        <button
          onClick={onStepForward}
          disabled={isLive}
          className={cn(
            'p-2 rounded transition-colors',
            isLive
              ? 'text-slate-600 cursor-not-allowed'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white',
          )}
          title="Next candle"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-slate-700 mx-1" />

        {/* Live Button */}
        <button
          onClick={onGoLive}
          disabled={isLive}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded transition-colors font-semibold text-sm',
            isLive
              ? 'bg-emerald-900/50 text-emerald-400 cursor-default'
              : 'bg-slate-800 text-slate-300 hover:bg-emerald-900 hover:text-emerald-400',
          )}
          title="Jump to live data"
        >
          <Play className="w-4 h-4" />
          LIVE
        </button>
      </div>
    </div>
  );
}
