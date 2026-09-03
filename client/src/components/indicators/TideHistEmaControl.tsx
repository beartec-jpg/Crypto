import { useTideHistEmaPeriod, TIDE_HIST_EMA_MIN, TIDE_HIST_EMA_MAX } from '@/hooks/useTideHistEmaPeriod';

interface TideHistEmaControlProps {
  className?: string;
}

export function TideHistEmaControl({ className }: TideHistEmaControlProps) {
  const [period, setPeriod] = useTideHistEmaPeriod();

  return (
    <div
      className={`pointer-events-auto flex items-center gap-1 rounded border border-slate-600/70 bg-slate-900/85 px-1 py-0.5 text-[10px] tabular-nums text-sky-200 ${className ?? ''}`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="flex h-5 w-5 items-center justify-center rounded hover:bg-slate-700 disabled:opacity-40"
        aria-label="Shorter Tide EMA"
        disabled={period <= TIDE_HIST_EMA_MIN}
        onClick={() => setPeriod(period - 1)}
      >
        −
      </button>
      <span className="min-w-[3.2rem] text-center font-semibold">EMA {period}</span>
      <button
        type="button"
        className="flex h-5 w-5 items-center justify-center rounded hover:bg-slate-700 disabled:opacity-40"
        aria-label="Longer Tide EMA"
        disabled={period >= TIDE_HIST_EMA_MAX}
        onClick={() => setPeriod(period + 1)}
      >
        +
      </button>
    </div>
  );
}
