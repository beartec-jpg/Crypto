import { Crosshair, X } from 'lucide-react';

export type TradePickField = 'entry' | 'sl' | 'tp' | 'entryDate' | 'exitDate';

const FIELD_LABELS: Record<TradePickField, string> = {
  entry: 'Entry price',
  sl: 'Stop Loss price',
  tp: 'Take Profit price',
  entryDate: 'Entry date & time',
  exitDate: 'Exit date & time',
};

interface ChartPickOverlayProps {
  field: TradePickField;
  onCancel: () => void;
}

export function ChartPickOverlay({ field, onCancel }: ChartPickOverlayProps) {
  return (
    <div
      className="absolute top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-2 bg-slate-900/95 border border-blue-500 rounded-lg shadow-xl text-sm text-slate-100 select-none pointer-events-auto"
      style={{ maxWidth: 'calc(100% - 16px)' }}
    >
      <Crosshair className="h-4 w-4 text-blue-400 shrink-0" />
      <span className="text-slate-300">
        Click chart to set <span className="font-semibold text-blue-300">{FIELD_LABELS[field]}</span>
      </span>
      <button
        onClick={onCancel}
        className="ml-2 text-slate-500 hover:text-white shrink-0"
        title="Cancel (Esc)"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
