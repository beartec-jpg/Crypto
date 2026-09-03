import { Settings } from 'lucide-react';
import { useTideZoneSettings } from '@/hooks/useTideZoneSettings';

interface TideHistEmaControlProps {
  className?: string;
  onOpenSettings?: () => void;
}

export function TideHistEmaControl({ className, onOpenSettings }: TideHistEmaControlProps) {
  const { settings, updateSettings } = useTideZoneSettings();
  const period = settings.emaPeriod;

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
        disabled={period <= 2}
        onClick={() => updateSettings({ emaPeriod: period - 1 })}
      >
        −
      </button>
      <span className="min-w-[3.2rem] text-center font-semibold">EMA {period}</span>
      <button
        type="button"
        className="flex h-5 w-5 items-center justify-center rounded hover:bg-slate-700 disabled:opacity-40"
        aria-label="Longer Tide EMA"
        disabled={period >= 34}
        onClick={() => updateSettings({ emaPeriod: period + 1 })}
      >
        +
      </button>
      {onOpenSettings && (
        <button
          type="button"
          className="flex h-5 w-5 items-center justify-center rounded text-slate-300 hover:bg-slate-700"
          aria-label="Tide print settings"
          onClick={onOpenSettings}
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
