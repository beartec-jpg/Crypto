import type { DrawingLabelSize } from '@/types/drawing';
import { ColorPicker } from './ColorPicker';

interface LabelSettingsProps {
  label: string;
  showLabel: boolean;
  labelPosition: 'left' | 'right';
  labelColor: string;
  labelSize: DrawingLabelSize;
  onUpdate: (styleUpdates: {
    label?: string;
    showLabel?: boolean;
    labelPosition?: 'left' | 'right';
    labelColor?: string;
    labelSize?: DrawingLabelSize;
  }) => void;
}

const LABEL_SIZES: Array<{ value: DrawingLabelSize; label: string }> = [
  { value: 'sm', label: 'S' },
  { value: 'md', label: 'M' },
  { value: 'lg', label: 'L' },
];

export function LabelSettings({
  label,
  showLabel,
  labelPosition,
  labelColor,
  labelSize,
  onUpdate,
}: LabelSettingsProps) {
  return (
    <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Label</div>

      <div>
        <div className="mb-2 text-xs text-slate-400">Label Text</div>
        <input
          type="text"
          value={label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="Enter label..."
          className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-white placeholder-gray-500"
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">Show Label</span>
        <button
          onClick={() => onUpdate({ showLabel: !showLabel })}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            showLabel ? 'bg-cyan-600' : 'bg-slate-600'
          }`}
          type="button"
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              showLabel ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      <div>
        <div className="mb-2 text-xs text-slate-400">Position</div>
        <div className="flex gap-2">
          {(['left', 'right'] as const).map((position) => (
            <button
              key={position}
              type="button"
              onClick={() => onUpdate({ labelPosition: position })}
              className={`flex-1 rounded px-3 py-1.5 text-xs transition-colors ${
                labelPosition === position
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
              }`}
            >
              {position === 'left' ? 'Left' : 'Right'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="w-16 text-xs text-slate-400">Text Color:</span>
        <ColorPicker color={labelColor} onChange={(color) => onUpdate({ labelColor: color })} />
      </div>

      <div>
        <div className="mb-2 text-xs text-slate-400">Text Size</div>
        <div className="flex gap-2">
          {LABEL_SIZES.map((size) => (
            <button
              key={size.value}
              type="button"
              onClick={() => onUpdate({ labelSize: size.value })}
              className={`flex-1 rounded px-3 py-1.5 text-xs transition-colors ${
                labelSize === size.value
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
              }`}
            >
              {size.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
