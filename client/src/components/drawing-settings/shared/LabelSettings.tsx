import { ColorPicker } from './ColorPicker';

interface LabelSettingsProps {
  label: string;
  showLabel: boolean;
  labelPosition: 'left' | 'right';
  labelColor: string;
  labelSize: 'sm' | 'md' | 'lg';
  onUpdate: (updates: Record<string, unknown>) => void;
}

export function LabelSettings({
  label,
  showLabel,
  labelPosition,
  labelColor,
  labelSize,
  onUpdate,
}: LabelSettingsProps) {
  return (
    <>
      {/* Label Text */}
      <div>
        <div className="text-xs text-slate-400 mb-2">Label (optional)</div>
        <input
          type="text"
          value={label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="Enter label..."
          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white placeholder-gray-500"
        />
      </div>

      {/* Show Label Toggle */}
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">Show Label</span>
          <button
            onClick={() => onUpdate({ showLabel: !showLabel })}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              showLabel ? 'bg-cyan-600' : 'bg-slate-600'
            }`}
            type="button"
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                showLabel ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      )}

      {/* Label Position */}
      {label && showLabel && (
        <div>
          <div className="text-xs text-slate-400 mb-2">Label Position</div>
          <div className="flex gap-2">
            <button
              onClick={() => onUpdate({ labelPosition: 'left' })}
              className={`flex-1 px-3 py-1.5 rounded text-xs transition-colors ${
                labelPosition === 'left'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
              }`}
              type="button"
            >
              Left
            </button>
            <button
              onClick={() => onUpdate({ labelPosition: 'right' })}
              className={`flex-1 px-3 py-1.5 rounded text-xs transition-colors ${
                labelPosition === 'right'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
              }`}
              type="button"
            >
              Right
            </button>
          </div>
        </div>
      )}

      {/* Text Color */}
      {label && showLabel && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 w-16">Text Color:</span>
          <ColorPicker
            color={labelColor}
            onChange={(c) => onUpdate({ labelColor: c })}
          />
        </div>
      )}

      {/* Text Size */}
      {label && showLabel && (
        <div>
          <div className="text-xs text-slate-400 mb-2">Text Size</div>
          <div className="flex gap-2">
            {(['sm', 'md', 'lg'] as const).map((size) => (
              <button
                key={size}
                onClick={() => onUpdate({ labelSize: size })}
                className={`flex-1 px-3 py-1.5 rounded text-xs transition-colors ${
                  labelSize === size
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
                type="button"
              >
                {size === 'sm' ? 'S' : size === 'md' ? 'M' : 'L'}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
